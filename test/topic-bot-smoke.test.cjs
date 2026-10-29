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
	ZB.pico.saveCard(collection, { type: "intervention", p: "住院長者、older adults", i: "運動、exercise", o: "跌倒、falls" });
	let asked = null;
	ZB.topicBot.runtime.ask = (init) => {
		asked = init;
		return { action: "run", query: init.query, exclude: ["hygiene"], core: init.choices.filter(c => c.picked).map(c => c.key), sources: init.sources };
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
	assert.match(list, /Hand hygiene[^\n]*｜0 分：含排除詞：hygiene · 標題與摘要都沒有主題詞/);
	// The Chinese databases with the card's Chinese terms, above the list; 檢索日誌 is on in 研究生引導: record them there
	assert.match(note, /\n> \[!zm-links\] 中文文獻（機器人查不到，查完請記到檢索日誌）\n> \[華藝線上圖書館\]\(https:\/\/www\.airitilibrary\.com\/\)（貼上 `住院長者 運動 跌倒`） · \[臺灣博碩士論文知識加值系統\]\([^)]+\)（貼上 `住院長者 運動 跌倒`） · \[Google Scholar\]\(https:\/\/scholar\.google\.com\/scholar\?hl=zh-TW&q=%E4%BD%8F[^)]*\) · \[\[Zotero\/Reviews\/檢索日誌\/跌倒\|📝 檢索日誌\]\]\n\n## 待看/);
	assert.doesNotMatch(note, /A known paper/);
	assert.ok(list.indexOf("Tai chi") < list.indexOf("Nurse-led") && list.indexOf("Nurse-led") < list.indexOf("Hand hygiene"));
	// The requests: PubMed ESearch + EFetch, the seed lookup, the citing works since 30 days back
	assert.ok(env.net.log.some(u => /efetch\.fcgi\?db=pubmed&id=41000001%2C41000002%2C41000003&retmode=xml/.test(u)), env.net.log.join("\n"));
	assert.ok(env.net.log.some(u => /filter=cites:W1,from_publication_date:2026-09-23/.test(u)));
	let bot = ZB.topicBot.botFor(collection);
	assert.equal(bot.core[0].openalex, "W1", "the seed's OpenAlex ID is kept");
	assert.equal(bot.lastPubmed, "2026-10-23T08:00:00.000Z");
	// What the topic page, home page and progress report read
	same([bot.path, bot.notePath, bot.stats, bot.exclude], ["跌倒", "Zotero/新文獻/跌倒 搜尋機器人", { pending: 3, high: 2, at: "2026-10-23T08:00:00.000Z" }, ["hygiene"]]);

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
	let after = ZB.topicBot.botFor(collection);
	same([after.imports, after.stats.pending], [[{ at: "2026-10-24T10:00:00.000Z", n: 2 }], 2]);
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

test("🏝️ 靠岸到哪座島: with two sub-collections each line suggests one, and the import puts the paper there (or where the user changed it to)", async () => {
	let env = await setup();
	let { ZB, collection } = env;
	let paper = (n, title, tags) => new env.MockItem("journalArticle", { key: `S${n}`, title, year: "2022", tags });
	env.addCollection(2, "運動", [paper(11, "Balance exercise for frail older adults", ["Exercise Therapy"]), paper(12, "Balance and exercise in hospital wards", ["Exercise Therapy"])], 1);
	env.addCollection(3, "衛教", [paper(13, "Video education on fall prevention", ["Patient Education as Topic"]), paper(14, "Teach-back education", ["Patient Education as Topic"])], 1);
	ZB.pico.saveCard(collection, { type: "intervention", p: "住院長者、older adults", i: "運動、exercise", o: "跌倒、falls" });
	ZB.topicBot.runtime.ask = init => ({ action: "run", query: init.query, exclude: [], core: init.choices.filter(c => c.picked).map(c => c.key), sources: init.sources });
	await ZB.topicBot.setup(collection);
	same(env.errors, []);
	let note = fs.readFileSync(path.join(env.vault, ...NOTE), "utf8");
	assert.match(note, /\*\*Nurse-led balance exercise[^\n]*｜🏝️ 建議放：運動（[^）]*）｜\[DOI\]/);
	assert.match(note, /🏝️ 建議放哪座島：比對各子分類文獻/);
	// Tick two; send Tai chi to 衛教 by hand (the line may not suggest anything for it)
	let ticked = note.split("\n").map((l) => {
		if (/\*\*Nurse-led/.test(l)) return l.replace("- [ ]", "- [x]");
		if (/\*\*Tai chi/.test(l)) return l.replace("- [ ]", "- [x]").replace(/｜🏝️[^｜]*/, "").replace(/｜\[DOI\]/, "｜🏝️ 衛教｜[DOI]");
		return l;
	}).join("\n");
	fs.writeFileSync(path.join(env.vault, ...NOTE), ticked);
	let routed = null;
	ZB.topicBot.runtime.confirm = (todo, r) => {
		routed = Object.fromEntries(r);
		return true;
	};
	same(await ZB.topicBot.importChecked(collection), { imported: 2, failed: [] });
	same(routed, { "運動": 1, "衛教": 1 });
	let titles = id => env.context.Zotero.Collections.get(id).getChildItems().map(i => i.getField("title"));
	assert.ok(titles(2).some(t => /Nurse-led/.test(t)));
	assert.ok(titles(3).some(t => /Tai chi/.test(t)));
	assert.ok(!titles(1).some(t => /Nurse-led|Tai chi/.test(t)), "not in the topic itself");
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

// A main window whose <dialog> works like Zotero's (jsdom has the element, not the modal methods)
function dialogWindow() {
	let { window } = new JSDOM("<!doctype html><body></body>");
	window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
	window.HTMLDialogElement.prototype.close = function (rv) {
		this.removeAttribute("open");
		this.returnValue = rv || "";
		this.dispatchEvent(new window.Event("close"));
	};
	return window;
}

test("檢索日誌: 記入檢索日誌 after 測試檢索式 in the setup dialog, exploratory drafts per run, the Chinese row's link; all gone when off", async () => {
	let env = await setup();
	let { ZB, collection } = env;
	let dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), "zb-bot-log-"));
	ZB.searchLog.runtime.dataDir = dataDir;
	ZB.searchLog.runtime.now = () => new Date("2026-10-23T08:00:00Z");
	ZB.pico.saveCard(collection, { type: "intervention", p: "住院長者、older adults", i: "運動、exercise", o: "跌倒、falls" });
	let win = dialogWindow();
	env.context.Zotero.getMainWindow = () => win;
	let wait = async (cond) => {
		for (let i = 0; i < 200 && !cond(); i++) await new Promise(r => setTimeout(r, 5));
	};
	let running = ZB.topicBot.setup(collection);
	let dialog = win.document.querySelector("dialog");
	assert.ok(dialog.open);
	let box = dialog.querySelector("[data-zb=bot-test]");
	let [out, logButton] = [box.querySelector("span"), box.querySelector("button")];
	assert.equal(logButton.textContent, "記入檢索日誌");
	assert.equal(logButton.hidden, true, "hidden until a test succeeded");
	[...dialog.querySelectorAll("button")].find(b => b.textContent === "測試檢索式").click();
	await wait(() => /符合/.test(out.textContent));
	assert.equal(out.textContent, "符合 120 篇；最近 30 天新收錄 120 篇");
	assert.equal(logButton.hidden, false);
	let forms = [];
	ZB.searchLog.runtime.form = (prefill, opts) => {
		forms.push(prefill);
		return { entry: prefill, collection: opts.collection };
	};
	logButton.click();
	let file = path.join(dataDir, "library_collections_COLL1.json");
	await wait(() => fs.existsSync(file));
	let entries = () => JSON.parse(fs.readFileSync(file, "utf8")).entries.filter(e => !e.deleted);
	same(entries().map(e => [e.origin, e.status, e.database, e.query, e.hits]), [["bot-test", "formal", "PubMed", "\"older adults\" AND exercise AND falls", 120]]);
	// The log note sits in the reviews folder's 檢索日誌, not among the review projects
	let logNote = path.join(env.vault, "Zotero", "Reviews", "檢索日誌", "跌倒.md");
	await wait(() => fs.existsSync(logNote));
	assert.match(fs.readFileSync(logNote, "utf8"), /^zotero_collection: "library\/collections\/COLL1"$/m);
	[...dialog.querySelectorAll("button")].find(b => b.textContent === "取消").click();
	assert.equal(await running, null);

	// A run: one exploratory draft per source that ran, the testing entry untouched
	ZB.topicBot.runtime.ask = init => ({ action: "run", query: init.query, exclude: [], core: init.choices.filter(c => c.picked).map(c => c.key), sources: init.sources });
	await ZB.topicBot.setup(collection);
	same(entries().map(e => [e.origin, e.status, e.database, e.method, e.hits]), [
		["bot-test", "formal", "PubMed", "database", 120],
		["topic-bot", "exploratory", "PubMed", "database", 3],
		["topic-bot", "exploratory", "OpenAlex", "citation", 2],
	]);
	let draft = entries().find(e => e.origin === "topic-bot" && e.database === "PubMed");
	assert.equal(draft.sentQuery, "\"older adults\" AND exercise AND falls", "the term as sent; the window went as URL parameters");
	assert.match(draft.limits, /^Entrez 日期 2026-09-23–2026-10-23/, "the window is in limits");
	assert.equal(entries().find(e => e.database === "OpenAlex").query, "引用核心文獻的新研究（1 篇核心文獻）");

	// Off: the old wording, no link, no drafts
	ZB.features.setEnabled("searchLog", false);
	ZB.topicBot.runtime.now = () => new Date("2026-10-24T09:00:00Z");
	await ZB.topicBot.runAll({});
	let note = fs.readFileSync(path.join(env.vault, ...NOTE), "utf8");
	assert.match(note, /> \[!zm-links\] 中文文獻（機器人查不到，請自己查）/);
	assert.doesNotMatch(note, /📝 檢索日誌/);
	assert.equal(entries().length, 3);
	same(env.errors, []);
});

test("檢索式體檢 in the setup dialog: the card's own query gets one notice; once edited, notes and the count sentence, re-tested by its button; off by its option", async () => {
	let env = await setup();
	let { ZB, collection } = env;
	ZB.pico.saveCard(collection, { type: "meaning", p: "住院長者、older adults", i: "運動、exercise", o: "跌倒、falls" });
	let win = dialogWindow();
	env.context.Zotero.getMainWindow = () => win;
	let wait = async (cond) => {
		for (let i = 0; i < 200 && !cond(); i++) await new Promise(r => setTimeout(r, 5));
	};
	let running = ZB.topicBot.setup(collection);
	let dialog = win.document.querySelector("dialog");
	let query = dialog.querySelector("textarea");
	let cardQuery = query.value;
	assert.match(cardQuery, /older adults/);
	let test = [...dialog.querySelectorAll("button")].find(b => b.textContent === "測試檢索式");
	let check = dialog.querySelector("[data-zb=bot-test] [data-zb=query-check]");
	let lines = () => [...check.children].filter(e => e.tagName !== "BUTTON").map(e => e.textContent);
	let esearches = () => env.net.log.filter(u => /esearch\.fcgi/.test(u));
	assert.equal(check.hidden, true, "nothing before a test");

	// The PICO card's query as ZotMax put it there: the notice only
	test.click();
	await wait(() => !check.hidden);
	same(lines(), ["檢索式體檢（只看你寫或改過的檢索式；不會改你的檢索式）", "這是 ZotMax 產生的檢索式，不做體檢；你改過之後再測，就會檢查。"]);
	assert.equal(check.querySelectorAll("button").length, 0);

	// The user rewrites it: notes, the count sentence for a 質性 question, one button that runs the same test again
	query.value = "older adults exercise falls hospital nursing";
	test.click();
	await wait(() => lines().some(l => /^PubMed 找到/.test(l)));
	let shown = lines();
	assert.match(shown[1], /^・6 個詞連成一串、沒有括號也沒有 OR：PubMed 會要求每個詞都出現。/);
	assert.ok(shown.includes("PubMed 找到 120 篇。質性（經驗）題在 PubMed 常在 50 篇以下，也要查 CINAHL。可以拿 2–3 篇你知道一定要找到的文獻，看它們有沒有在結果裡。"), shown.join("\n"));
	let again = check.querySelector("button");
	assert.equal(again.textContent, "我改好了，再測一次");
	assert.equal(dialog.querySelector("[data-zb=bot-test] span").textContent, "符合 120 篇；最近 30 天新收錄 120 篇", "the result line stays as it was");
	query.value = "(older adults OR aged) AND exercise AND falls";
	let n = esearches().length;
	again.click();
	assert.equal(check.hidden, false, "the block stays while the re-test runs");
	assert.equal(again.disabled, true, "its button waits");
	await wait(() => lines().includes("沒有發現結構上的提醒。"));
	assert.equal(check.getAttribute("aria-live"), "polite");
	assert.equal(win.document.activeElement, check.querySelector("button"), "focus moves to the new 再測 button");
	assert.equal(esearches().length, n + 2, "the same two ESearch calls as 測試檢索式");
	assert.ok(esearches().slice(n).every(u => new URL(u).searchParams.get("term") === "(older adults OR aged) AND exercise AND falls"));
	assert.equal(query.value, "(older adults OR aged) AND exercise AND falls", "the query box is never written");

	// Off: the test still answers, no block
	env.prefStore["extensions.zotero-bridge.queryCheck.enabled"] = false;
	let out = dialog.querySelector("[data-zb=bot-test] span");
	out.textContent = "";
	test.click();
	await wait(() => /符合/.test(out.textContent));
	assert.equal(check.hidden, true);
	assert.equal(check.children.length, 0);
	assert.doesNotMatch(dialog.textContent, /查完了|已完整|足夠|合格|不及格|分數|紅燈|綠燈/);
	[...dialog.querySelectorAll("button")].find(b => b.textContent === "取消").click();
	assert.equal(await running, null);
	same(env.errors, []);
});

test("檢索式體檢 in the setup dialog: a bot saved with the card's query stays ZotMax's after the card changes; a card without terms still gives its type", async () => {
	let env = await setup();
	let { ZB, collection } = env;
	let inits = [];
	let answer = {};
	ZB.topicBot.runtime.ask = (init) => {
		inits.push(init);
		return answer && Object.assign({ action: "save", query: init.query, exclude: [], core: [], sources: init.sources }, answer);
	};
	let bots = () => Object.values(JSON.parse(env.prefStore["extensions.zotero-bridge.topicBot.bots"]));
	// A card with a type and no terms yet: no query, but the count sentence follows the type (the dialog cancelled)
	ZB.pico.saveCard(collection, { type: "meaning" });
	answer = null;
	await ZB.topicBot.setup(collection);
	assert.equal(inits[0].type, "meaning");
	same(inits[0].generated, []);

	// Saved untouched from the card's query, then the card gains a synonym: the old query is still ZotMax's
	ZB.pico.saveCard(collection, { type: "intervention", p: "住院長者、older adults", i: "運動、exercise", o: "跌倒、falls" });
	answer = {};
	await ZB.topicBot.setup(collection);
	let cardQuery = inits[1].query;
	same(bots().map(b => [b.query, b.generated]), [[cardQuery, cardQuery]]);
	ZB.pico.saveCard(collection, { type: "intervention", p: "住院長者、older adults、aged", i: "運動、exercise", o: "跌倒、falls" });
	answer = null;
	await ZB.topicBot.setup(collection);
	assert.equal(inits[2].query, cardQuery);
	assert.notEqual(inits[2].generated[0], cardQuery, "the card's query changed");
	assert.equal(ZB.queryCheck.isUserQuery(inits[2].query, inits[2].generated), false);

	// The user's own query: nothing kept as ZotMax's
	answer = { query: "older adults AND exercise" };
	await ZB.topicBot.setup(collection);
	same(bots().map(b => [b.query, b.generated]), [["older adults AND exercise", ""]]);
	same(env.errors, []);
});
