// The organized vault layout (core.js LAYOUTS, vault-layout.js) with the real plugin in a mocked Zotero: a new vault
// starts organized, notes follow their Zotero collection (and move with it), 首頁 / 研究儀表板 / topic pages / .base
// files land in their numbered folders, and 整理 vault moves a flat vault over without breaking a link.
// The mock environment is copied from test/fulltext-smoke.test.cjs.
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
const P = "extensions.zotero-bridge.";

function loginManagerMock(initial = []) {
	let logins = [...initial];
	let same = (a, b) => a.origin === b.origin && a.httpRealm === b.httpRealm && a.username === b.username;
	return {
		logins,
		searchLoginsAsync: async match => logins.filter(l => Object.entries(match).every(([k, v]) => l[k] === v)),
		addLoginAsync: async (login) => {
			if (logins.some(l => same(l, login))) throw new Error("This login already exists.");
			logins.push(login);
			return login;
		},
		modifyLoginAsync: async (old, login) => {
			let i = logins.indexOf(old);
			if (i < 0) throw new Error("No matching logins");
			logins[i] = login;
		},
		removeLoginAsync: async (old) => {
			let i = logins.indexOf(old);
			if (i < 0) throw new Error("No matching logins");
			logins.splice(i, 1);
		},
	};
}

function LoginInfo(origin, formActionOrigin, httpRealm, username, password) {
	Object.assign(this, { origin, formActionOrigin, httpRealm, username, password });
}

// `timers`, when given, collects the plugin's long setTimeout callbacks (auto-sync debounce,
// self-modified expiry) so a test can fire them itself
function makeEnv({ prefs, fetch, logins = [], confirm = () => true, timers, subprocess = null, dataDir = null }) {
	let items = new Map();
	let observers = [];
	let nextID = 100;
	let menus = [];
	let progressLines = [];
	let descriptions = [];
	let errors = [];
	let panes = [];
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
			this.tags = [];
			this.children = [];
			this.annotations = [];
			this.noteHTML = "";
			this.dateAdded = fields.dateAdded || "2024-05-01 08:00:00";
			this.dateModified = fields.dateModified || "2024-05-02 08:00:00";
			this.version = 0;
			items.set(this.id, this);
		}
		get parentItem() { return this.parentID ? items.get(this.parentID) : undefined; }
		isRegularItem() { return !["note", "attachment", "annotation"].includes(this.itemType); }
		isNote() { return this.itemType === "note"; }
		isFileAttachment() { return this.itemType === "attachment"; }
		isPDFAttachment() { return this.itemType === "attachment"; }
		get attachmentContentType() { return "application/pdf"; }
		get attachmentText() { return Promise.resolve(this.fields.fulltext || ""); }
		getField(f) { return this.fields[f] || ""; }
		getCreatorsJSON() { return this.fields.creators || []; }
		getTags() { return this.tags.map(tag => ({ tag })); }
		addTag(t) { this.tags.push(t); }
		removeTag(t) { this.tags = this.tags.filter(x => x !== t); }
		getCollections() { return this.fields.collectionIDs || []; }
		getAttachments() { return this.children.filter(id => items.get(id).itemType === "attachment"); }
		getNotes() { return this.children.filter(id => items.get(id).itemType === "note"); }
		getAnnotations() { return this.annotations; }
		getNote() { return this.noteHTML; }
		setNote(h) { this.noteHTML = h; }
		getNoteTitle() { return "note"; }
		getItemTypeIconName() { return this.itemType; }
		addToCollection(id) { this.collectionsAdded = (this.collectionsAdded || []).concat(id); }
		addRelatedItem(item) { this.related = (this.related || []).concat(item.key); }
		async saveTx() {
			if (this.parentID && !items.get(this.parentID).children.includes(this.id)) {
				items.get(this.parentID).children.push(this.id);
			}
			return this.id;
		}
	}

	function addChild(parent, child) {
		child.parentID = parent.id;
		parent.children.push(child.id);
	}

	let prefStore = Object.assign({}, prefs);
	let Zotero = {
		Prefs: { get: k => prefStore[k], set: (k, v) => { prefStore[k] = v; }, clear: (k) => { delete prefStore[k]; } },
		MenuManager: {
			registerMenu: (opts) => { menus.push(opts); return opts.menuID; },
			unregisterMenu: () => true,
		},
		Notifier: {
			registerObserver: (ref, types) => { observers.push({ ref, types }); return "obs"; },
			unregisterObserver: () => { observers.length = 0; },
		},
		ItemPaneManager: {
			registerSection: (opts) => { panes.push(opts); return opts.paneID; },
			unregisterSection: () => true,
		},
		PreferencePanes: { register: async () => "pane" },
		getMainWindows: () => [],
		getMainWindow: () => ({}),
		Items: {
			get: ids => (Array.isArray(ids) ? ids.map(id => items.get(id)) : items.get(ids)),
			exists: id => items.has(id),
			getByLibraryAndKey: (libraryID, key) => [...items.values()].find(i => i.libraryID === libraryID && i.key === key) || false,
			// Top-level items not in the trash (annotations aren't modelled here)
			getAll: async (libraryID, onlyTopLevel) => [...items.values()]
				.filter(i => i.libraryID === libraryID && !i.deleted && (!onlyTopLevel || !i.parentID)),
		},
		Item: function (type) { return new MockItem(type); },
		Libraries: {
			get: () => ({ libraryType: "user", name: "My Library" }),
			getAll: () => [{ libraryID: 1, libraryType: "user", name: "My Library" }],
		},
		Utilities: {
			Item: {
				// Stand-in for Zotero's CSL conversion: the id is the item URI, as in Zotero
				itemToCSLJSON: item => ({
					id: `http://zotero.org/users/1/items/${item.key}`,
					type: "article-journal",
					title: item.fields.title,
					author: (item.fields.creators || []).map(c => ({ family: c.lastName, given: c.firstName })),
					issued: { "date-parts": [[Number(item.fields.year)]] },
					page: item.fields.pages,
					URL: "https://example.org/" + item.key,
				}),
			},
		},
		Translate: {
			Export: class {
				constructor() { this.handlers = {}; translations.push(this); }
				setItems(list) { this.items = list; }
				setTranslator(id) { this.translatorID = id; }
				setDisplayOptions(o) { this.displayOptions = o; }
				setHandler(type, fn) { this.handlers[type] = fn; }
				async translate() {
					// Like Zotero's ItemGetter: ascending item ID, one entry per regular item
					this.items.sort((a, b) => a.id - b.id);
					this.string = "\n" + this.items.map(i => `@article{${i.key.toLowerCase()}_bibtex,\n\ttitle = {${i.fields.title}},\n}`).join("\n\n") + "\n";
					this.handlers.done(this, true);
				}
			},
		},
		Groups: { getGroupIDFromLibraryID: () => null },
		Collections: {
			get: (ids) => {
				let all = { 7: { name: "碩論", parentID: null }, 8: { name: "文獻回顧", parentID: 7 }, 9: { name: "EBP 報告", parentID: null }, 10: { name: "照顧者", parentID: 7 } };
				return Array.isArray(ids) ? ids.map(id => all[id]) : all[ids];
			},
			getByParent: () => [],
		},
		Styles: { get: () => null },
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
			addDescription(t) {
				this.description = t;
				descriptions.push(t);
			}
			show() {}
			startCloseTimer() {}
		},
		logError: (e) => { errors.push(e); },
		debug: () => {},
		// The add-on's own files (the 群島地圖 template)
		File: { getContentsFromURLAsync: async url => fsp.readFile(new URL(url), "utf8") },
		// The full-text cache lives in the data directory (fulltext.js)
		DataDirectory: dataDir ? { dir: dataDir } : undefined,
	};
	// Zotero.Item is used with `new`
	Zotero.Item = MockItem;

	let IOUtils = {
		exists: async p => fs.existsSync(p),
		readUTF8: async p => fsp.readFile(p, "utf8"),
		writeUTF8: async (p, t) => fsp.writeFile(p, t, "utf8"),
		makeDirectory: async p => fsp.mkdir(p, { recursive: true }),
		read: async (p, opts = {}) => {
			let buf = await fsp.readFile(p);
			return new Uint8Array(opts.maxBytes == null ? buf : buf.subarray(0, opts.maxBytes));
		},
		getChildren: async p => (await fsp.readdir(p)).map(name => path.join(p, name)),
		stat: async (p) => {
			let st = await fsp.stat(p);
			return { path: p, type: st.isDirectory() ? "directory" : st.isFile() ? "regular" : "other", size: st.size, lastModified: Math.round(st.mtimeMs) };
		},
		// Like IOUtils.remove: an empty folder goes without { recursive: true }
		remove: async (p, opts = {}) => (fs.existsSync(p) && fs.statSync(p).isDirectory() && !opts.recursive ? fsp.rmdir(p) : fsp.rm(p, { force: true, recursive: !!opts.recursive })),
		move: async (from, to, opts = {}) => {
			if (opts.noOverwrite && fs.existsSync(to)) throw new Error("NoModificationAllowedError: " + to);
			await fsp.rename(from, to);
		},
	};
	let PathUtils = { join: (...parts) => path.join(...parts), filename: p => path.basename(p), parent: p => path.dirname(p), toFileURI: p => require("node:url").pathToFileURL(p).href };

	let loginManager = loginManagerMock(logins);
	let subprocessCalls = [];
	let context = vm.createContext({
		Zotero, IOUtils, PathUtils, fetch, console, TextDecoder, TextEncoder,
		// Firefox's Subprocess.sys.mjs, replaced by the test's fake (markitdown)
		ChromeUtils: {
			importESModule: (url) => {
				assert.equal(url, "resource://gre/modules/Subprocess.sys.mjs");
				subprocessCalls.push(url);
				if (!subprocess) throw new Error("no Subprocess in this test");
				return { Subprocess: subprocess };
			},
		},
		Components: {
			// `new Components.Constructor(cid, iface, "init")` returns the nsILoginInfo constructor
			Constructor: function (cid, iface, init) {
				assert.equal(cid, "@mozilla.org/login-manager/loginInfo;1");
				assert.equal(init, "init");
				return LoginInfo;
			},
			interfaces: { nsILoginInfo: {} },
		},
		DOMParser: new JSDOM("").window.DOMParser,
		// Short waits (Notion rate limiting) run for real
		setTimeout: timers ? (fn, ms) => (ms >= 8000 ? timers.push({ fn, ms }) : setTimeout(fn, ms)) : setTimeout,
		clearTimeout: timers ? (id) => (typeof id === "number" ? timers[id - 1].cleared = true : clearTimeout(id)) : clearTimeout,
		Services: {
			scriptloader: {
				loadSubScript: (url) => {
					let file = url.replace("file://", "");
					vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
				},
			},
			prompt: { confirm: (win, title, text) => confirm(text) },
			logins: loginManager,
		},
	});
	vm.runInContext(fs.readFileSync(path.join(ROOT, "bootstrap.js"), "utf8"), context, { filename: "bootstrap.js" });
	return { context, Zotero, MockItem, addChild, menus, progressLines, descriptions, items, prefStore, errors, panes, loginManager, translations, observers, subprocessCalls };
}

// ---------- fixtures ----------

const HEAD = "Journal of Fall Research 2024;12:1–3";
// Zotero's PDF worker text: one paragraph per line, pages separated by \f
const FULL_TEXT = [
	[HEAD, "Nurse-led exercise and falls", "Abstract", "Falls are common among older adults in hospital.", "Introduction",
		"Exercise delivered by nurses may prevent falls in older inpatients.", "1"],
	[HEAD, "Methods", "We randomised 120 patients to a twelve week exercise interven- tion or usual care.", "Results",
		"The intervention reduced the rate of falls by thirty percent compared with usual care.",
		"Adherence was high and no serious adverse events were reported.", "2"],
	[HEAD, "Discussion", "Nurses can deliver structured exercise safely in hospital wards.", "Funding", "This study was funded by Grant 123.",
		"References", "1. Smith J. Falls in older adults. J Nurs. 2020;1:1-10.", "2. Lee A. Exercise and balance. Geriatr Nurs. 2021;2:2-20.", "3"],
].map(lines => lines.join("\n") + "\n\n").join("\f").trim();

const AI_TEXT = `## 一句話摘要
護理師帶的運動課讓住院長者跌倒率下降 30%。

## 主要結果
- 跌倒率下降 30%
- 遵從度高、沒有嚴重不良事件

## 關鍵概念
[[Fall prevention]]

## 可引用的句子
- "The intervention reduced the rate of falls by thirty percent" (p. 2)

\`\`\`json
{"study_design": "RCT", "sample_size": 120, "evidence_level": "2", "jbi_level": "1.c", "appraisal_overall": "納入", "measures": [],
 "highlights": [
  {"quote": "Nurses can deliver structured exercise safely in hospital wards.", "why": "作者結論"},
  {"quote": "This sentence was invented by the model.", "why": "不存在"}
 ]}
\`\`\`
`;

function ok(json) {
	return { status: 200, ok: true, headers: { get: () => null }, text: async () => JSON.stringify(json) };
}

/**
 * Claude + Notion. One data source (ds-1) whose columns start as `columns` ({ name: { id, type } }; default:
 * every plugin column under its English name). Pages page-1…; the literature page's blocks are tracked so
 * the full-text child page can be listed, trashed and recreated.
 */
function apiMock(log, opts = {}) {
	let props = opts.columns || null;
	let pages = new Map();
	let pageChildren = new Map();
	let seq = 0;
	let fetch = async (url, init) => {
		let body = init.body ? JSON.parse(init.body) : undefined;
		if (url.startsWith("https://api.anthropic.com/")) {
			log.push({ api: "anthropic", body });
			return ok({ model: "model-x", stop_reason: "end_turn", content: [{ type: "text", text: opts.aiText || AI_TEXT }],
				usage: { input_tokens: 1000, output_tokens: 300 } });
		}
		let p = url.replace("https://api.notion.com/v1/", "");
		log.push({ api: "notion", method: init.method, path: p, body });
		if (p.startsWith("databases/")) return ok({ data_sources: [{ id: "ds-1" }] });
		if (p === "data_sources/ds-1" && init.method === "GET") {
			if (!props) {
				props = { Name: { id: "title", type: "title" } };
				let i = 0;
				for (let [k, v] of Object.entries(require("../content/notion.js").PROPERTY_SCHEMA)) props[k] = { id: `id${i++}`, type: Object.keys(v)[0] };
			}
			return ok({ properties: props });
		}
		if (p === "data_sources/ds-1" && init.method === "PATCH") {
			for (let [key, def] of Object.entries(body.properties)) {
				let hit = Object.entries(props).find(([name, prop]) => name === key || prop.id === key);
				if (hit && def.name) {
					delete props[hit[0]];
					props[def.name] = hit[1];
				}
				else if (!hit) props[key] = { id: `new${++seq}`, type: Object.keys(def)[0] };
			}
			return ok({});
		}
		if (p === "data_sources/ds-1/query") {
			let f = body.filter.rich_text ? body.filter : body.filter.or[0];
			let key = f.rich_text.equals;
			let found = [...pages.values()].filter(pg => !pg.in_trash && pg.zoteroKey === key);
			return ok({ results: found, has_more: false });
		}
		if (p === "pages" && init.method === "POST") {
			let id = body.parent.page_id ? `child-${++seq}` : `page-${pages.size + 1}`;
			let page = { id, url: `https://www.notion.so/${id}`, properties: body.properties, parent: body.parent };
			if (body.parent.page_id) {
				let list = pageChildren.get(body.parent.page_id) || [];
				list.push({ id, type: "child_page", child_page: { title: body.properties.title.title[0].text.content } });
				pageChildren.set(body.parent.page_id, list);
			}
			else {
				let zk = Object.entries(body.properties).find(([name]) => /Zotero (Key|識別碼)/.test(name));
				page.zoteroKey = zk[1].rich_text[0].text.content;
			}
			pages.set(id, page);
			return ok(page);
		}
		let m = /^pages\/([^/?]+)$/.exec(p);
		if (m) {
			let page = pages.get(m[1]);
			if (body && body.in_trash) {
				page.in_trash = true;
				for (let [parent, list] of pageChildren) pageChildren.set(parent, list.filter(b => b.id !== m[1]));
			}
			if (body && body.properties) Object.assign(page.properties, body.properties);
			return ok(page);
		}
		if ((m = /^blocks\/(page-\d+)\/children\?/.exec(p))) return ok({ results: pageChildren.get(m[1]) || [], has_more: false });
		if ((m = /^blocks\/(page-\d+)\/children$/.exec(p))) return ok({ results: [{ id: "container-1" }] });
		if (/^blocks\/[\w-]+\/children$/.test(p) && init.method === "PATCH") return ok({ results: (body.children || []).map(() => ({ id: `block-${++seq}` })) });
		if (/^blocks\/[\w-]+\/children\?/.test(p)) return ok({ results: [], has_more: false });
		if (/^blocks\/[\w-]+$/.test(p) && init.method === "DELETE") return ok({});
		return { status: 404, ok: false, headers: { get: () => null }, text: async () => JSON.stringify({ message: p }) };
	};
	return { fetch, pages, pageChildren, props: () => props };
}

function prefs(vault, extra = {}) {
	return Object.assign({
		[P + "obsidian.vaultPath"]: vault,
		[P + "obsidian.vaultName"]: "Vault",
		[P + "obsidian.folder"]: "Zotero",
		[P + "obsidian.filenameFormat"]: "citekey",
		[P + "obsidian.createBase"]: false,
		[P + "dashboard.autoUpdate"]: false,
		[P + "concepts.autoUpdate"]: false,
		[P + "notion.token"]: "ntn_test",
		[P + "notion.database"]: "https://www.notion.so/ws/Default-11111111111111111111111111111111",
		[P + "routing.rules"]: "[]",
		[P + "llm.enabled"]: true,
		[P + "llm.provider"]: "anthropic",
		[P + "llm.anthropicKey"]: "sk-ant-test",
		[P + "llm.fullTextLimit"]: "150000",
		[P + "includeNotes"]: true,
	}, extra);
}

async function start(env) {
	await vm.runInContext(`startup({ id: "zotero-bridge@bobyu89.github.io", version: "0.0.0", rootURI: ${JSON.stringify(ROOT_URI)} })`, env.context);
	return env.context.ZB;
}

/** A paper with a PDF (Zotero's text above) and the user's highlights. */
function paper(env, opts = {}) {
	let item = new env.MockItem("journalArticle", {
		title: "Nurse-led exercise and falls", year: "2024", citationKey: "lee2024", DOI: "10.1/falls",
		creators: [{ firstName: "Anna", lastName: "Lee", creatorType: "author" }], abstractNote: "Falls are common.",
	});
	let pdf = new env.MockItem("attachment", { title: "Full Text PDF", fulltext: opts.fulltext || FULL_TEXT });
	if (opts.pdfPath) pdf.getFilePathAsync = async () => opts.pdfPath;
	env.addChild(item, pdf);
	let ann = (key, text, color, page, sort) => ({
		key, annotationType: "highlight", annotationText: text, annotationComment: "", annotationColor: color,
		annotationPageLabel: page, annotationSortIndex: sort, getTags: () => [],
	});
	pdf.annotations = opts.annotations || [
		ann("HLY", "reduced the rate of falls by thirty per-\ncent", "#ffd400", "2", "00001"),
		ann("HLR", "no serious adverse events were reported", "#ff6666", "2", "00002"),
		ann("HLB", "a sentence the PDF text doesn't have", "#2ea8e5", "3", "00003"),
	];
	return { item, pdf };
}


const read = (...p) => fs.readFileSync(path.join(...p), "utf8");
const exists = (...p) => fs.existsSync(path.join(...p));
const LIT = ["Zotero", "10 文獻"];

// ---------- tests ----------

test("a new vault is organized: the note in its collection's folder, the full text beside it, pages in 00/01, .base in 90 系統", async () => {
	let vault = await fsp.mkdtemp(path.join(os.tmpdir(), "zb-vl-"));
	let api = apiMock([]);
	let env = makeEnv({ fetch: api.fetch, prefs: prefs(vault, { [P + "notion.token"]: "", [P + "obsidian.createBase"]: true }) });
	let ZB = await start(env);
	let { item } = paper(env);
	item.fields.collectionIDs = [7, 8];
	let loose = paper(env).item;
	loose.fields.citationKey = "kim2023";
	await ZB.main.run([item, loose], { targets: ["obsidian"], ai: "missing" });
	assert.deepEqual(env.errors, []);
	assert.equal(env.prefStore[P + "obsidian.structure"], "organized", "picked once, for an empty vault");

	let dir = path.join(vault, ...LIT, "碩論", "文獻回顧");
	let note = read(dir, "lee2024.md");
	assert.match(note, /^fulltext: "\[\[Zotero\/10 文獻\/碩論\/文獻回顧\/lee2024 · 全文\]\]"$/m);
	assert.match(read(dir, "lee2024 · 全文.md"), /\[\[Zotero\/10 文獻\/碩論\/文獻回顧\/lee2024\|← 文獻筆記\]\]/);
	assert.ok(!exists(dir, "全文"), "no 全文 subfolder in the organized layout");
	// 研究儀表板 off after syncs here: no pages yet, so the bar has no links but still jumps
	assert.match(note, /^> \[!zm-nav\] 📄 文獻筆記\n> 跳到：.*\[\[Zotero\/10 文獻\/碩論\/文獻回顧\/lee2024 · 全文\|全文\]\]/m);
	assert.ok(exists(vault, ...LIT, "未分類", "kim2023.md"), "no collection → 未分類");
	assert.ok(exists(vault, "Zotero", "90 系統", "Zotero 文獻庫.base"));
	assert.deepEqual(fs.readdirSync(path.join(vault, "Zotero")).sort(), ["10 文獻", "90 系統"]);

	// The dashboard, 首頁 and the topic page inside the collection's folder
	let settings = await ZB.main.readSettings();
	let result = await ZB.dashboard.update(settings);
	assert.equal(result.relPath, "Zotero/01 研究儀表板.md");
	assert.equal(result.topics.home, "Zotero/00 首頁.md");
	let home = read(vault, "Zotero", "00 首頁.md");
	assert.match(home, /\[\[Zotero\/10 文獻\/碩論\/文獻回顧\/00 文獻回顧 總覽\|/);
	assert.match(home, /\[\[Zotero\/01 研究儀表板\|/);
	let topic = read(dir, "00 文獻回顧 總覽.md");
	assert.match(topic, /^type: "topic"$/m);
	assert.match(topic, /\[\[Zotero\/10 文獻\/碩論\/文獻回顧\/lee2024\\\|/);
	assert.match(topic, /\[\[Zotero\/00 首頁\|/);
	assert.ok(exists(vault, "Zotero", "90 系統", "研究儀表板.base"));
	// 🗺️ 證據地圖 beside the topic page: the page on top, the paper under its direction
	let canvas = JSON.parse(read(dir, "00 文獻回顧 證據地圖.canvas"));
	assert.equal(canvas.nodes.find(n => n.id === "zm-topic").file, "Zotero/10 文獻/碩論/文獻回顧/00 文獻回顧 總覽.md");
	assert.ok(canvas.nodes.some(n => n.type === "text" && n.text.includes("[[Zotero/10 文獻/碩論/文獻回顧/lee2024|")));
	assert.match(topic, /\[\[Zotero\/10 文獻\/碩論\/文獻回顧\/00 文獻回顧 證據地圖\.canvas\|🗺️ 證據地圖\]\]/);
	// 首頁 starts with what to open next
	assert.match(home, /> \[!zm-board\] ▶️ 從這裡開始\n>\n> > \[!zm-reading\] 下一篇讀這個（2）\n/);
	// A canvas the user added a card to is left alone
	let mine = Object.assign({}, canvas, { nodes: [...canvas.nodes, { id: "abc123", type: "text", text: "我的想法", x: 0, y: 0, width: 100, height: 50 }] });
	fs.writeFileSync(path.join(dir, "00 文獻回顧 證據地圖.canvas"), JSON.stringify(mine));
	await ZB.dashboard.update(settings);
	assert.equal(read(dir, "00 文獻回顧 證據地圖.canvas"), JSON.stringify(mine));
	assert.ok(!exists(vault, "Zotero", "主題"), "no 主題 folder");
	// Once the pages exist the next sync links them
	await ZB.main.run([item], { targets: ["obsidian"], ai: "reuse" });
	assert.match(read(dir, "lee2024.md"), /^> \[!zm-nav\] \[\[Zotero\/00 首頁\|🏠 首頁\]\] › \[\[Zotero\/10 文獻\/碩論\/文獻回顧\/00 文獻回顧 總覽\|碩論 › 文獻回顧\]\] · \[\[Zotero\/10 文獻\/碩論\/00 碩論 總覽\|碩論\]\]\n/m);
	await vm.runInContext("shutdown()", env.context);
});

test("星球與島嶼: two sub-collections make 碩論 a planet — its page with the island cards, the map beside it, 回到星球 on each island, the command opens the map", async () => {
	let vault = await fsp.mkdtemp(path.join(os.tmpdir(), "zb-vl-"));
	let api = apiMock([]);
	let env = makeEnv({ fetch: api.fetch, prefs: prefs(vault, { [P + "notion.token"]: "" }) });
	let ZB = await start(env);
	let lee = paper(env).item;
	lee.fields.collectionIDs = [8];
	let kim = paper(env).item;
	Object.assign(kim.fields, { citationKey: "kim2023", title: "Caregiver training", DOI: "10.1/care", collectionIDs: [10] });
	await ZB.main.run([lee, kim], { targets: ["obsidian"], ai: "missing" });
	let settings = await ZB.main.readSettings();
	let result = await ZB.dashboard.update(settings);
	assert.deepEqual(env.errors, []);
	let planetDir = path.join(vault, ...LIT, "碩論");
	assert.deepEqual(JSON.parse(JSON.stringify(result.topics.planets)), [{ path: "碩論", file: path.join(planetDir, "00 碩論 星球地圖.html") }]);
	// 碩論 has no notes of its own: its page is the whole planet's
	let page = read(planetDir, "00 碩論 總覽.md");
	assert.match(page, /^zotero_collection: "碩論"$/m);
	assert.match(page, /^> \[!zm-board\] 🪐 星球：碩論（2 座島 · 2 篇 · 已讀 0%）$/m);
	assert.match(page, /> > \[🗺️ 開啟群島地圖\]\(file:\/\/[^ )]*\/00%20[^ )]+\.html\) · 開發度 = /);
	assert.match(page, /> > \[!zm-topic\] \[\[Zotero\/10 文獻\/碩論\/文獻回顧\/00 文獻回顧 總覽\|文獻回顧\]\]/);
	let html = read(planetDir, "00 碩論 星球地圖.html");
	let data = JSON.parse(/window\.PLANET = (.*);\n<\/script>/.exec(html)[1]);
	assert.deepEqual(data.islands.map(is => [is.name, is.papers]).sort(), [["文獻回顧", 1], ["照顧者", 1]]);
	assert.match(data.link, /^obsidian:\/\/open\?vault=zb-vl-[^&]+&file=Zotero%2F10%20%E6%96%87/);
	assert.ok(!html.includes(vault), "no file paths in the map");
	let island = read(planetDir, "文獻回顧", "00 文獻回顧 總覽.md");
	assert.match(island, /\[\[Zotero\/10 文獻\/碩論\/00 碩論 總覽\|🪐 回到星球「碩論」（這座島 LV\d [^）]+）\]\]/);
	// The time alone doesn't rewrite the map
	await ZB.dashboard.update(settings);
	assert.equal(read(planetDir, "00 碩論 星球地圖.html"), html);
	assert.ok(JSON.parse(env.prefStore[P + "planet.history"]).islands["碩論/文獻回顧"] >= 0);
	// 開啟群島地圖 on an island opens its planet's map; on a collection that is no planet it says why
	let opened = [];
	ZB.planet.runtime.launch = p => opened.push(p);
	await ZB.planet.openForCollection({ name: "文獻回顧", parentID: 7, libraryID: 1 });
	assert.deepEqual(opened, [path.join(planetDir, "00 碩論 星球地圖.html")]);
	await ZB.planet.openForCollection({ name: "EBP 報告", parentID: null, libraryID: 1 });
	assert.equal(opened.length, 1);
	// Off with its switch: no board, no map
	env.prefStore[P + "dashboard.planet"] = false;
	fs.rmSync(path.join(planetDir, "00 碩論 星球地圖.html"));
	await ZB.dashboard.update(settings);
	assert.ok(!exists(planetDir, "00 碩論 星球地圖.html"));
	assert.ok(!read(planetDir, "文獻回顧", "00 文獻回顧 總覽.md").includes("回到星球"));
	assert.deepEqual(env.errors, []);
	await vm.runInContext("shutdown()", env.context);
});

test("an item moved to another collection in Zotero: its note, full text and links follow on the next sync", async () => {
	let vault = await fsp.mkdtemp(path.join(os.tmpdir(), "zb-vl-"));
	let api = apiMock([]);
	let env = makeEnv({ fetch: api.fetch, prefs: prefs(vault, { [P + "notion.token"]: "" }) });
	let ZB = await start(env);
	let { item } = paper(env);
	item.fields.collectionIDs = [8];
	await ZB.main.run([item], { targets: ["obsidian"], ai: "missing" });
	let oldDir = path.join(vault, ...LIT, "碩論", "文獻回顧");
	assert.ok(exists(oldDir, "lee2024.md"));
	// The user's own note links to it (full path, a heading, and in a table)
	fs.writeFileSync(path.join(vault, "我的想法.md"), "看 [[Zotero/10 文獻/碩論/文獻回顧/lee2024|Lee]] 的 [[Zotero/10 文獻/碩論/文獻回顧/lee2024#Methods]]\n| [[Zotero/10 文獻/碩論/文獻回顧/lee2024 · 全文\\|全文]] |\n");

	item.fields.collectionIDs = [9];
	await ZB.main.run([item], { targets: ["obsidian"], ai: "reuse" });
	assert.deepEqual(env.errors, []);
	let newDir = path.join(vault, ...LIT, "EBP 報告");
	assert.ok(exists(newDir, "lee2024.md"));
	assert.ok(exists(newDir, "lee2024 · 全文.md"));
	assert.ok(!exists(oldDir), "the emptied folder is removed");
	assert.match(read(newDir, "lee2024.md"), /^fulltext: "\[\[Zotero\/10 文獻\/EBP 報告\/lee2024 · 全文\]\]"$/m);
	assert.equal(read(vault, "我的想法.md"),
		"看 [[Zotero/10 文獻/EBP 報告/lee2024|Lee]] 的 [[Zotero/10 文獻/EBP 報告/lee2024#Methods]]\n| [[Zotero/10 文獻/EBP 報告/lee2024 · 全文\\|全文]] |\n");

	// Also in a second collection now: it stays where it is
	item.fields.collectionIDs = [9, 8];
	await ZB.main.run([item], { targets: ["obsidian"], ai: "reuse" });
	assert.ok(exists(newDir, "lee2024.md"));
	assert.ok(!exists(oldDir, "lee2024.md"));
	// A note the user filed outside 10 文獻 is left alone
	fs.mkdirSync(path.join(vault, "Zotero", "我的資料夾"));
	fs.renameSync(path.join(newDir, "lee2024.md"), path.join(vault, "Zotero", "我的資料夾", "lee2024.md"));
	item.fields.collectionIDs = [7];
	await ZB.main.run([item], { targets: ["obsidian"], ai: "reuse" });
	assert.ok(exists(vault, "Zotero", "我的資料夾", "lee2024.md"));
	assert.ok(!exists(vault, ...LIT, "碩論", "lee2024.md"));
	await vm.runInContext("shutdown()", env.context);
});

test("整理 vault: a flat vault moves over; every link, canvas card and bookmark follows; the next sync finds the notes", async () => {
	let vault = await fsp.mkdtemp(path.join(os.tmpdir(), "zb-vl-"));
	let api = apiMock([]);
	// Synced before 0.23.0: the flat layout
	let env = makeEnv({ fetch: api.fetch, prefs: prefs(vault, { [P + "notion.token"]: "", [P + "obsidian.createBase"]: true, [P + "obsidian.structure"]: "flat" }) });
	let ZB = await start(env);
	let { item } = paper(env);
	item.fields.collectionIDs = [8];
	await ZB.main.run([item], { targets: ["obsidian"], ai: "missing" });
	let settings = await ZB.main.readSettings();
	await ZB.dashboard.update(settings);
	assert.ok(exists(vault, "Zotero", "lee2024.md"));
	assert.ok(exists(vault, "Zotero", "全文", "lee2024.md"));
	assert.ok(exists(vault, "Zotero", "首頁.md"));
	assert.ok(exists(vault, "Zotero", "主題", "碩論／文獻回顧.md"));
	fs.mkdirSync(path.join(vault, "Zotero", "Reviews"));
	fs.writeFileSync(path.join(vault, "Zotero", "Reviews", "文獻回顧 PICO 表.csv"), "a,b\n");
	fs.writeFileSync(path.join(vault, "Zotero", "自己的.md"), "我放在這裡的筆記 [[Zotero/lee2024]]\n");
	fs.writeFileSync(path.join(vault, "白板.canvas"), JSON.stringify({ nodes: [{ id: "n", type: "file", file: "Zotero/lee2024.md" }], edges: [] }));
	fs.mkdirSync(path.join(vault, ".obsidian"), { recursive: true });
	fs.writeFileSync(path.join(vault, ".obsidian", "bookmarks.json"), JSON.stringify({ items: [{ type: "file", path: "Zotero/首頁.md" }] }));

	// The plan, then cancel: nothing moves
	let asked = [];
	assert.equal(await ZB.vaultLayout.run({ confirm: t => { asked.push(t); return false; } }), null);
	assert.match(asked[0], /文獻筆記 1 個/);
	assert.ok(exists(vault, "Zotero", "lee2024.md"));
	assert.equal(env.prefStore[P + "obsidian.structure"], "flat");

	let result = await ZB.vaultLayout.run({ confirm: () => true });
	assert.equal(result.failed.length, 0);
	assert.equal(env.prefStore[P + "obsidian.structure"], "organized");
	let dir = path.join(vault, ...LIT, "碩論", "文獻回顧");
	assert.ok(exists(dir, "lee2024.md"));
	assert.ok(exists(dir, "lee2024 · 全文.md"));
	assert.ok(exists(dir, "00 文獻回顧 總覽.md"));
	assert.ok(exists(vault, "Zotero", "00 首頁.md"));
	assert.ok(exists(vault, "Zotero", "01 研究儀表板.md"));
	assert.ok(exists(vault, "Zotero", "30 評讀與綜整", "文獻回顧 PICO 表.csv"));
	assert.ok(exists(vault, "Zotero", "90 系統", "Zotero 文獻庫.base"));
	assert.ok(exists(vault, "Zotero", "自己的.md"), "the user's own file stays");
	for (let gone of ["全文", "主題", "Reviews", "首頁.md", "lee2024.md"]) assert.ok(!exists(vault, "Zotero", gone), gone);
	assert.equal(read(vault, "Zotero", "自己的.md"), "我放在這裡的筆記 [[Zotero/10 文獻/碩論/文獻回顧/lee2024]]\n");
	assert.equal(JSON.parse(read(vault, "白板.canvas")).nodes[0].file, "Zotero/10 文獻/碩論/文獻回顧/lee2024.md");
	assert.equal(JSON.parse(read(vault, ".obsidian", "bookmarks.json")).items[0].path, "Zotero/00 首頁.md");
	assert.match(read(dir, "lee2024.md"), /^fulltext: "\[\[Zotero\/10 文獻\/碩論\/文獻回顧\/lee2024 · 全文\]\]"$/m);
	// The log, and 首頁 rebuilt with the new links
	let logs = fs.readdirSync(path.join(vault, "Zotero", "90 系統")).filter(f => f.startsWith("整理紀錄"));
	assert.equal(logs.length, 1);
	assert.match(read(vault, "Zotero", "90 系統", logs[0]), /\| 文獻筆記 \| Zotero\/lee2024\.md \| Zotero\/10 文獻\/碩論\/文獻回顧\/lee2024\.md \|/);
	assert.match(read(vault, "Zotero", "00 首頁.md"), /\[\[Zotero\/10 文獻\/碩論\/文獻回顧\/00 文獻回顧 總覽\|/);

	// The next sync writes in place: no second note, the full text stays beside it
	await ZB.main.run([item], { targets: ["obsidian"], ai: "reuse" });
	assert.deepEqual(env.errors, []);
	assert.deepEqual(fs.readdirSync(dir).sort(), ["00 文獻回顧 總覽.md", "00 文獻回顧 證據地圖.canvas", "lee2024 · 全文.md", "lee2024.md"]);
	assert.deepEqual(fs.readdirSync(path.join(vault, "Zotero")).sort(), ["00 首頁.md", "01 研究儀表板.md", "10 文獻", "30 評讀與綜整", "90 系統", "自己的.md"]);
	// Run again: nothing left to move
	let again = await ZB.vaultLayout.run({ confirm: () => assert.fail("no dialog when there is nothing to move") });
	assert.equal(again.moved, 0);
	await vm.runInContext("shutdown()", env.context);
});

test("detect: a vault with ZotMax's flat files stays flat until 整理 vault", async () => {
	let vault = await fsp.mkdtemp(path.join(os.tmpdir(), "zb-vl-"));
	fs.mkdirSync(path.join(vault, "Zotero", "全文"), { recursive: true });
	fs.writeFileSync(path.join(vault, "Zotero", "lee2024.md"), "---\nzotero_key: \"library/KEY1\"\n---\n# x\n");
	let env = makeEnv({ fetch: apiMock([]).fetch, prefs: prefs(vault, { [P + "notion.token"]: "" }) });
	let ZB = await start(env);
	let settings = await ZB.main.readSettings();
	assert.equal(settings.structure, "flat");
	assert.equal(env.prefStore[P + "obsidian.structure"], "flat");
	await vm.runInContext("shutdown()", env.context);
});
