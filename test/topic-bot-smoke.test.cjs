// 主題搜尋機器人 through the real plugin in a mocked Zotero: the setup (PICO card query, core papers), a run
// against mocked PubMed (ESearch JSON, EFetch XML) and OpenAlex (seed lookup, citing works), the ranked
// Obsidian checklist, a second run that adds only new papers, and importing the ticked ones.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const ROOT_URI = "file://" + ROOT + "/";
// Objects from the plugin's vm context compare by value
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);

// The parts of Zotero, Gecko and the plugin scope the bot touches (from citation-chase-smoke)
function makeEnv({ prefs, fetch, confirm = () => true, lookup = {} }) {
	let items = new Map();
	let nextID = 100;
	let menus = [];
	let progressLines = [];
	let descriptions = [];
	let errors = [];
	let confirms = [];
	let translations = [];

	class MockItem {
		constructor(type, fields = {}) {
			this.id = nextID++;
			this.key = fields.key || `KEY${this.id}`;
			this.itemType = type;
			this.libraryID = 1;
			this.deleted = false;
			this.parentID = null;
			this.fields = fields;
			this.tags = (fields.tags || []).slice();
			this.children = [];
			this.dateAdded = fields.dateAdded || "2024-05-01 08:00:00";
			items.set(this.id, this);
		}
		get parentItem() { return this.parentID ? items.get(this.parentID) : undefined; }
		isRegularItem() { return !["note", "attachment", "annotation"].includes(this.itemType); }
		isNote() { return this.itemType === "note"; }
		getField(f) { return this.fields[f] || ""; }
		getCreatorsJSON() { return this.fields.creators || []; }
		getTags() { return this.tags.map(tag => ({ tag })); }
		addTag(t) {
			if (this.tags.includes(t)) return false;
			this.tags.push(t);
			return true;
		}
		removeTag(t) {
			let had = this.tags.includes(t);
			this.tags = this.tags.filter(x => x !== t);
			return had;
		}
		getCollections() { return []; }
		getAttachments() { return []; }
		getNotes() { return []; }
		getNote() { return ""; }
		async saveTx() { return this.id; }
	}

	let collections = new Map();
	// The suites below were written for the flat vault layout; vault-layout-smoke covers the organized one
	let prefStore = Object.assign({ "extensions.zotero-bridge.obsidian.structure": "flat" }, prefs);
	let activeCollection = null;
	let Zotero = {
		Prefs: { get: k => prefStore[k], set: (k, v) => { prefStore[k] = v; }, clear: (k) => { delete prefStore[k]; } },
		MenuManager: { registerMenu: (o) => { menus.push(o); return o.menuID; }, unregisterMenu: () => true },
		Notifier: { registerObserver: () => "obs", unregisterObserver: () => {} },
		ItemPaneManager: { registerSection: o => o.paneID, unregisterSection: () => true },
		PreferencePanes: { register: async () => "pane" },
		getMainWindows: () => [],
		getMainWindow: () => ({}),
		getActiveZoteroPane: () => ({ getSelectedCollections: () => (activeCollection ? [activeCollection] : []) }),
		Items: {
			get: ids => (Array.isArray(ids) ? ids.map(id => items.get(id)) : items.get(ids)),
			exists: id => items.has(id),
			getByLibraryAndKey: (libraryID, key) => [...items.values()].find(i => i.libraryID === libraryID && i.key === key) || false,
			// items.js: getAll(libraryID, onlyTopLevel, includeDeleted, asIDs)
			getAll: async (libraryID, onlyTopLevel) => [...items.values()].filter(i => i.libraryID === libraryID && (!onlyTopLevel || !i.parentID)),
		},
		Libraries: { userLibraryID: 1, get: () => ({ libraryType: "user", name: "My Library" }), getAll: () => [] },
		Groups: { getGroupIDFromLibraryID: () => null },
		Collections: {
			get: ids => (Array.isArray(ids) ? ids.map(id => collections.get(id)) : collections.get(ids)),
			getByParent: id => [...collections.values()].filter(c => c.parentID === id),
			getByLibraryAndKey: (libraryID, key) => [...collections.values()].find(c => c.libraryID === libraryID && c.key === key) || false,
		},
		Tags: { getID: () => false },
		Styles: { get: () => null },
		// translate.js: Zotero.Translate.Search — setIdentifier({ DOI | PMID }), getTranslators(),
		// setTranslator(translators), translate({ libraryID, collections, saveAttachments }) → saved items
		Translate: {
			Search: class {
				setIdentifier(identifier) { this.identifier = identifier; }
				async getTranslators() { return [{ label: "DOI Content Negotiation" }, { label: "Crossref REST" }]; }
				setTranslator(t) { this.translators = t; }
				async translate(opts) {
					translations.push({ identifier: this.identifier, opts, translators: this.translators.length });
					let id = this.identifier.DOI || this.identifier.PMID;
					let found = lookup[id];
					if (!found) throw new Error("No items returned from any translator");
					let item = new MockItem("journalArticle", Object.assign({}, found));
					item.libraryID = opts.libraryID;
					for (let cid of opts.collections || []) collections.get(cid).members.push(item);
					return [item];
				}
			},
		},
		ProgressWindow: class {
			constructor() {
				this.ItemProgress = class {
					constructor(icon, text) { this.text = text; progressLines.push(this); }
					setText(t) { this.text = t; }
					setProgress(p) { this.progress = p; }
					setError() { this.error = true; }
				};
			}
			changeHeadline() {}
			addDescription(t) { descriptions.push(t); }
			show() {}
			startCloseTimer() {}
		},
		logError: (e) => { errors.push(e); },
		debug: () => {},
	};
	Zotero.Item = MockItem;

	function addCollection(id, name, members, parentID = null) {
		let c = {
			id, key: `COLL${id}`, name, libraryID: 1, parentID, members: members.slice(),
			getChildItems() { return this.members.map(i => items.get(i.id)).filter(i => !i.deleted); },
		};
		collections.set(id, c);
		return c;
	}

	let IOUtils = {
		exists: async p => fs.existsSync(p),
		readUTF8: async p => fsp.readFile(p, "utf8"),
		writeUTF8: async (p, t) => fsp.writeFile(p, t, "utf8"),
		makeDirectory: async p => fsp.mkdir(p, { recursive: true }),
		getChildren: async p => (await fsp.readdir(p)).map(name => path.join(p, name)),
		stat: async (p) => {
			let st = await fsp.stat(p);
			return { type: st.isDirectory() ? "directory" : "regular", size: st.size };
		},
		read: async p => new Uint8Array(await fsp.readFile(p)),
		move: async (from, to) => fsp.rename(from, to),
	};
	let PathUtils = { join: (...parts) => path.join(...parts), filename: p => path.basename(p), parent: p => path.dirname(p) };
	let context = vm.createContext({
		Zotero, IOUtils, PathUtils, fetch, console, TextDecoder, TextEncoder, URL, URLSearchParams,
		Components: {
			Constructor: function () {
				return function (origin, formActionOrigin, httpRealm, username, password) {
					Object.assign(this, { origin, httpRealm, username, password });
				};
			},
			interfaces: { nsILoginInfo: {} },
		},
		DOMParser: new JSDOM("").window.DOMParser,
		// The 200 ms throttle and retry backoff wait for real; keep the test fast
		setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 2)),
		clearTimeout,
		Services: {
			scriptloader: {
				loadSubScript: (url) => {
					let file = url.replace("file://", "");
					vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
				},
			},
			prompt: { confirm: (win, title, text) => { confirms.push(text); return confirm(text); } },
			logins: { searchLoginsAsync: async () => [], addLoginAsync: async l => l, modifyLoginAsync: async () => {}, removeLoginAsync: async () => {} },
		},
	});
	vm.runInContext(fs.readFileSync(path.join(ROOT, "bootstrap.js"), "utf8"), context, { filename: "bootstrap.js" });
	return {
		context, MockItem, items, menus, progressLines, descriptions, errors, confirms, translations, prefStore, addCollection,
		setActiveCollection: (c) => { activeCollection = c; },
	};
}


const EFETCH = (articles) => `<?xml version="1.0" ?><PubmedArticleSet>${articles.map(a => `<PubmedArticle><MedlineCitation><PMID Version="1">${a.pmid}</PMID><Article><Journal><JournalIssue><PubDate><Year>${a.year || "2026"}</Year></PubDate></JournalIssue><Title>${a.journal || "J Adv Nurs"}</Title><ISOAbbreviation>${a.journal || "J Adv Nurs"}</ISOAbbreviation></Journal><ArticleTitle>${a.title}</ArticleTitle>${a.abstract ? `<Abstract><AbstractText>${a.abstract}</AbstractText></Abstract>` : ""}<PublicationTypeList>${(a.types || ["Journal Article"]).map(t => `<PublicationType>${t}</PublicationType>`).join("")}</PublicationTypeList></Article></MedlineCitation><PubmedData><ArticleIdList>${a.doi ? `<ArticleId IdType="doi">${a.doi}</ArticleId>` : ""}</ArticleIdList></PubmedData></PubmedArticle>`).join("")}</PubmedArticleSet>`;

const PUBMED = {
	"41000001": { pmid: "41000001", title: "Nurse-led balance exercise to prevent falls in hospitalized older adults: a randomized trial", abstract: "Exercise reduced falls.", doi: "10.5555/pm1", types: ["Randomized Controlled Trial"] },
	"41000002": { pmid: "41000002", title: "Hand hygiene in intensive care units", abstract: "Compliance rose.", doi: "10.5555/pm2" },
	// Already in the library (by DOI)
	"41000003": { pmid: "41000003", title: "A known paper", doi: "10.5555/known" },
	"41000004": { pmid: "41000004", title: "Falls after discharge among older adults: a cohort", abstract: "Exercise and falls were recorded.", doi: "10.5555/pm4" },
};

function api(state) {
	let log = [];
	let json = (status, body) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
	let fetch = async (url) => {
		log.push(url);
		let u = new URL(url);
		if (u.hostname === "eutils.ncbi.nlm.nih.gov") {
			if (u.pathname.endsWith("esearch.fcgi")) {
				let ids = state.pubmedIDs;
				return json(200, { esearchresult: { count: String(u.searchParams.get("retmax") === "0" ? 120 : ids.length), idlist: u.searchParams.get("retmax") === "0" ? [] : ids, querytranslation: "" } });
			}
			if (u.pathname.endsWith("efetch.fcgi")) return json(200, EFETCH(u.searchParams.get("id").split(",").map(id => PUBMED[id]).filter(Boolean)));
		}
		if (u.hostname === "api.openalex.org") {
			let m = /^\/works\/(doi:.+|pmid:\d+)$/.exec(decodeURIComponent(u.pathname));
			if (m) return m[1] === "doi:10.5555/core1" ? json(200, { id: "https://openalex.org/W1", doi: "https://doi.org/10.5555/core1" }) : json(404, {});
			let f = u.searchParams.get("filter") || "";
			if (/^cites:W1,from_publication_date:\d{4}-\d{2}-\d{2}$/.test(f)) return json(200, { meta: { count: state.citing.length }, results: state.citing });
		}
		return json(404, { error: "unexpected " + url });
	};
	return { fetch, log };
}

async function setup(opts = {}) {
	let vault = await fsp.mkdtemp(path.join(os.tmpdir(), "zb-bot-"));
	let state = { pubmedIDs: ["41000001", "41000002", "41000003"], citing: [
		{ id: "https://openalex.org/W90", doi: "https://doi.org/10.5555/pm1", display_name: "Nurse-led balance exercise…", publication_year: 2026, ids: {} },
		{ id: "https://openalex.org/W91", doi: "https://doi.org/10.5555/oa1", display_name: "Tai chi exercise and falls in older adults: a systematic review", publication_year: 2026, ids: {},
			abstract_inverted_index: { Exercise: [0], prevents: [1], falls: [2] } },
	] };
	let net = api(state);
	let env = makeEnv({
		fetch: net.fetch,
		confirm: opts.confirm,
		lookup: {
			"10.5555/oa1": { title: "Tai chi exercise and falls in older adults: a systematic review", DOI: "10.5555/oa1", year: "2026" },
			"10.5555/pm1": { title: "Nurse-led balance exercise to prevent falls…", DOI: "10.5555/pm1", year: "2026" },
		},
		prefs: Object.assign({
			"extensions.zotero-bridge.obsidian.vaultPath": vault,
			"extensions.zotero-bridge.obsidian.folder": "Zotero",
			"extensions.zotero-bridge.feature.topicBot": true,
			"extensions.zotero-bridge.feature.pico": true,
			// The background runs are tested by calling runAll() (the test's setTimeout fires in 2 ms)
			"extensions.zotero-bridge.topicBot.autoRun": false,
		}, opts.prefs),
	});
	await vm.runInContext(`startup({ id: "zotero-bridge@bobyu89.github.io", version: "0.0.0", rootURI: ${JSON.stringify(ROOT_URI)} })`, env.context);
	let ZB = env.context.ZB;
	ZB.pubmedWatch.runtime.fetch = net.fetch;
	ZB.topicBot.runtime.fetch = net.fetch;
	ZB.topicBot.runtime.now = () => new Date(opts.now || "2026-10-23T08:00:00Z");
	let paper = (n, fields) => new env.MockItem("journalArticle", Object.assign({ key: `P${n}`, title: `Study ${n}`, year: "2021",
		creators: [{ firstName: "Mei", lastName: `Author${n}`, creatorType: "author" }] }, fields));
	let core1 = paper(1, { DOI: "10.5555/core1", tags: ["篩選/全文/納入"] });
	let other = paper(2, { DOI: "10.5555/core2" });
	let noID = paper(3, {});
	paper(4, { DOI: "10.5555/known", title: "A known paper" });
	let collection = env.addCollection(1, "跌倒", [core1, other, noID]);
	return Object.assign(env, { vault, state, net, ZB, collection, core1, other });
}

const NOTE = ["Zotero", "新文獻", "跌倒 搜尋機器人.md"];

test("主題搜尋機器人: set up from the PICO card, run PubMed + citations, a ranked checklist, a second run, import the ticked", async () => {
	let env = await setup();
	let { ZB, collection } = env;
	// A PICO card for the collection: its English query fills the dialog and its P, I, O rank the papers
	ZB.pico.saveCard(collection, { type: "intervention", p: "older adults", i: "exercise", o: "falls" });
	let asked = null;
	ZB.topicBot.runtime.ask = (init) => {
		asked = init;
		return { action: "run", query: init.query, core: init.choices.filter(c => c.picked).map(c => c.key), sources: init.sources };
	};
	let result = await ZB.topicBot.setup(collection);
	same(env.errors, []);
	assert.match(asked.query, /older adults/i);
	assert.equal(asked.cardQuery, true);
	// Core choices: papers with a DOI or PMID, the included one first and picked
	same(asked.choices.map(c => [c.key, c.picked, c.why]), [["P1", true, "全文納入"], ["P2", false, ""]]);
	same([result.fresh, result.pending], [3, 3]);

	let note = fs.readFileSync(path.join(env.vault, ...NOTE), "utf8");
	assert.match(note, /^---\ntitle: "跌倒 搜尋機器人"\ntype: "topic-bot"\nzotero_collection: "library\/collections\/COLL1"\n/);
	assert.match(note, /> \[!zm-board\] 本次搜尋\n/);
	let list = note.slice(note.indexOf("## 待看"));
	// The systematic review citing the core paper first, then the RCT found by both; the in-library paper is left out
	assert.match(list, /^## 待看（3 篇）\n\n- \[ \] ⭐⭐⭐ \*\*Tai chi exercise and falls[^\n]*｜82 分：命中 P、I、O（標題有 P、I、O） · 系統性回顧 · 引用 1 篇核心文獻：Author1, 2021｜來源 被引用｜\[DOI\]\(https:\/\/doi\.org\/10\.5555\/oa1\)\n/);
	assert.match(list, /\n- \[ \] ⭐⭐⭐ \*\*Nurse-led balance exercise[^\n]*｜\*J Adv Nurs\*｜78 分：[^\n]* · RCT · [^\n]*｜來源 PubMed＋被引用｜\[DOI\]\(https:\/\/doi\.org\/10\.5555\/pm1\) · \[PubMed\]/);
	assert.match(list, /引用 1 篇核心文獻：Author1, 2021/);
	assert.match(list, /Hand hygiene[^\n]*標題與摘要都沒有主題詞/);
	assert.doesNotMatch(note, /A known paper/);
	assert.ok(list.indexOf("Tai chi") < list.indexOf("Nurse-led") && list.indexOf("Nurse-led") < list.indexOf("Hand hygiene"));
	// The requests: PubMed ESearch + EFetch, the seed lookup, the citing works since 30 days back
	assert.ok(env.net.log.some(u => /efetch\.fcgi\?db=pubmed&id=41000001%2C41000002%2C41000003&retmode=xml/.test(u)), env.net.log.join("\n"));
	assert.ok(env.net.log.some(u => /filter=cites:W1,from_publication_date:2026-09-23/.test(u)));
	let bot = ZB.topicBot.botFor(collection);
	assert.equal(bot.core[0].openalex, "W1", "the seed's OpenAlex ID is kept");
	assert.equal(bot.lastPubmed, "2026-10-23T08:00:00.000Z");

	// A day later: the scheduled run checks PubMed only (citations are weekly) and adds just the new paper
	ZB.topicBot.runtime.now = () => new Date("2026-10-24T09:00:00Z");
	env.state.pubmedIDs = ["41000001", "41000004"];
	let ticked = note.replace("- [ ] ⭐⭐⭐ **Nurse-led", "- [x] ⭐⭐⭐ **Nurse-led").replace(/(- \[) (\] ⭐⭐⭐ \*\*Tai chi)/, "$1x$2");
	fs.writeFileSync(path.join(env.vault, ...NOTE), ticked + "讀 Tai chi 那篇。\n");
	let before = env.net.log.length;
	let [second] = await ZB.topicBot.runAll({});
	assert.equal(second.fresh, 1);
	assert.ok(env.net.log.slice(before).every(u => !/openalex/.test(u)), "no OpenAlex request a day later");
	note = fs.readFileSync(path.join(env.vault, ...NOTE), "utf8");
	assert.match(note, /## 待看（4 篇）\n\n- \[x\] ⭐⭐⭐ \*\*Tai chi[^\n]*\n- \[x\] ⭐⭐⭐ \*\*Nurse-led/, "the ticked ones first");
	assert.match(note, /Falls after discharge/);
	assert.match(note, /讀 Tai chi 那篇。\n$/);
	assert.equal((note.match(/Nurse-led balance/g) || []).length, 1);
	// Nothing due an hour later
	ZB.topicBot.runtime.now = () => new Date("2026-10-24T10:00:00Z");
	same(await ZB.topicBot.runAll({}), [null]);

	// Import the ticked ones: tags, collection, ✅ 已匯入
	let imported = await ZB.topicBot.importChecked(collection);
	same(imported, { imported: 2, failed: [] });
	let items = collection.getChildItems().filter(i => /Tai chi|Nurse-led/.test(i.getField("title")));
	assert.equal(items.length, 2);
	let tags = Object.fromEntries(items.map(i => [/Tai chi/.test(i.getField("title")) ? "oa" : "pm", i.getTags().map(t => t.tag).sort()]));
	same(tags.pm, ["來源/PubMed", "新文獻", "追蹤/跌倒"]);
	same(tags.oa, ["來源/引文追蹤", "新文獻", "追蹤/跌倒"]);
	note = fs.readFileSync(path.join(env.vault, ...NOTE), "utf8");
	assert.match(note, /- \[x\] ✅ 已匯入 ⭐⭐⭐ \*\*Nurse-led/);
	// Re-importing finds nothing new
	same(await ZB.topicBot.importChecked(collection), { imported: 0, failed: [] });
	// The next run moves the imported ones out of 待看
	ZB.topicBot.runtime.now = () => new Date("2026-10-26T09:00:00Z");
	env.state.pubmedIDs = [];
	await ZB.topicBot.run(collection, { manual: true });
	note = fs.readFileSync(path.join(env.vault, ...NOTE), "utf8");
	assert.match(note, /## 待看（2 篇）/);
	assert.match(note, /> \[!zm-ref\]- 已匯入（2 篇）/);
	same(env.errors, []);
});

test("主題搜尋機器人: off by its switch, a collection without a bot, delete", async () => {
	let env = await setup();
	let { ZB, collection } = env;
	// (startup's migration sees a used profile and turns the 進階 switches on)
	ZB.features.setEnabled("topicBot", false);
	ZB.topicBot.runtime.ask = () => { throw new Error("should not ask"); };
	assert.equal(await ZB.topicBot.setup(collection), null);
	assert.equal(await ZB.topicBot.run(collection, { manual: true }), null);
	ZB.features.setEnabled("topicBot", true);
	// No bot yet: says how to make one
	assert.equal(await ZB.topicBot.run(collection, { manual: true }), null);
	ZB.topicBot.runtime.ask = (init) => ({ action: "save", query: "falls AND exercise", core: [], sources: init.sources });
	let r = await ZB.topicBot.setup(collection);
	assert.equal(r.saved.query, "falls AND exercise");
	assert.equal(fs.existsSync(path.join(env.vault, ...NOTE)), false, "saved without running");
	env.context.Services.prompt.confirm = () => true;
	ZB.topicBot.runtime.ask = () => ({ action: "delete" });
	same(await ZB.topicBot.setup(collection), { deleted: true });
	assert.equal(ZB.topicBot.botFor(collection), null);
});
