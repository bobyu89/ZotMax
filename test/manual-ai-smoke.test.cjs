// AI notes without an Anthropic or OpenAI key, with the real plugin in a mocked Zotero: 網頁版 AI (manual-ai.js: the
// prompt copied, the answer pasted back and saved like an API answer, the window in jsdom) and OpenRouter (a sync
// through Chat Completions with the key from the login manager).
// The mock environment is copied from test/vault-layout-smoke.test.cjs.
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
				let all = { 7: { name: "碩論", parentID: null }, 8: { name: "文獻回顧", parentID: 7 }, 9: { name: "EBP 報告", parentID: null } };
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
	let PathUtils = { join: (...parts) => path.join(...parts), filename: p => path.basename(p), parent: p => path.dirname(p) };

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
		if (url.startsWith("https://openrouter.ai/")) {
			log.push({ api: "openrouter", url, headers: init.headers, body });
			if (opts.openrouter) return opts.openrouter(body);
			return ok({ model: "google/gemma-4-31b-it:free", choices: [{ finish_reason: "stop", message: { content: opts.aiText || AI_TEXT } }],
				usage: { prompt_tokens: 900, completion_tokens: 300 } });
		}
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
		title: opts.title || "Nurse-led exercise and falls", year: "2024", citationKey: opts.key || "lee2024", DOI: "10.1/falls",
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

function noKeys(vault, extra = {}) {
	let p = prefs(vault, Object.assign({ [P + "notion.token"]: "", [P + "obsidian.structure"]: "flat" }, extra));
	delete p[P + "llm.anthropicKey"];
	return p;
}

// ---------- tests ----------

test("網頁版 AI: a sync never calls an AI; the copied prompt has the paper; the pasted answer becomes the AI note and the 看板", async () => {
	let vault = await fsp.mkdtemp(path.join(os.tmpdir(), "zb-ma-"));
	let log = [];
	let env = makeEnv({ fetch: apiMock(log).fetch, prefs: noKeys(vault, { [P + "llm.provider"]: "manual" }) });
	let ZB = await start(env);
	let { item } = paper(env);
	await ZB.main.run([item], { targets: ["obsidian"], ai: "missing" });
	assert.deepEqual(env.errors, []);
	assert.equal(log.filter(l => l.api === "anthropic" || l.api === "openrouter").length, 0, "no AI call");
	assert.ok(fs.existsSync(path.join(vault, "Zotero", "lee2024.md")), "the sync still writes the note");
	assert.equal(ZB.adapter.getAINote(item), null);

	// The window, stubbed: what it is given, what the user does
	let seen = [];
	let copied = [];
	ZB.manualAI.runtime.copy = text => copied.push(text);
	ZB.manualAI.runtime.dialog = async (info) => {
		seen.push(info);
		let short = await ZB.manualAI.promptFor(info.item, true);
		copied.push(short.text);
		return { action: "save", text: "好的，以下是筆記：\n\n" + AI_TEXT, model: "ChatGPT 網頁版" };
	};
	let result = await ZB.manualAI.run([item]);
	assert.equal(result.saved, 1);
	let prompt = seen[0].prompt;
	assert.match(prompt.text, /^請依照下面「指示」的格式/);
	assert.match(prompt.text, /# 指示\n\n[\s\S]*```json[\s\S]*# 文獻資料\n\n<metadata>\n標題：Nurse-led exercise and falls/);
	assert.match(prompt.text, /twelve week exercise intervention/, "the trimmed full text is in it");
	assert.doesNotMatch(prompt.text, /Smith J\. Falls in older adults/, "references cut");
	assert.equal(prompt.fullTextStatus, "ok");
	assert.equal(seen[0].title, "Nurse-led exercise and falls");
	// 只複製指令: no text, the PDF asked for
	assert.ok(copied[0].includes(ZB.llm.USER_PDF_NOTE));
	assert.doesNotMatch(copied[0], /twelve week exercise/);

	// Saved like an API answer: the child note, the study data, the quote check; then synced
	let ai = ZB.main.readAINote(ZB.adapter.getAINote(item).getNote());
	assert.equal(ai.model, "ChatGPT 網頁版");
	assert.equal(ai.data.study_design, "RCT");
	assert.doesNotMatch(ai.md, /好的，以下是筆記/, "the chat's preamble is gone");
	let note = read(vault, "Zotero", "lee2024.md");
	assert.match(note, /^study_design: "RCT"$/m);
	assert.match(note, /> \[!zm-board\] 重點\n> [^\n]+\n>\n> > \[!zm-stats\|wide\] 研究概要\n> > - 研究設計：\*\*RCT\*\*\n> > - 樣本數：\*\*N = 120\*\*\n/);
	assert.match(note, /^> \[!zm-ai\]- AI 文獻筆記（ChatGPT 網頁版 · \d{4}-\d{2}-\d{2}）$/m);
	assert.equal(log.filter(l => l.api === "anthropic" || l.api === "openrouter").length, 0, "still no AI call");
	assert.deepEqual(env.errors, []);

	// 跳過 and 結束 on two items: nothing saved for them
	let calls = 0;
	ZB.manualAI.runtime.dialog = async () => (++calls === 1 ? { action: "skip" } : { action: "cancel" });
	let other = paper(env).item;
	other.fields.citationKey = "kim2024";
	let third = paper(env).item;
	third.fields.citationKey = "wu2024";
	let r2 = await ZB.manualAI.run([other, third]);
	assert.deepEqual([r2.saved, r2.skipped, calls], [0, 1, 2]);
	assert.equal(ZB.adapter.getAINote(other), null);
	await vm.runInContext("shutdown()", env.context);
});

test("網頁版 AI window: copy reports the length, the pasted answer is checked live, 儲存 hands over the tidied answer", async () => {
	let ZB = require("../content/manual-ai.js");
	let { window } = new JSDOM("<!doctype html><div id=\"root\"></div>");
	let doc = window.document;
	let root = doc.getElementById("root");
	let got = {};
	let opened = [];
	let view = ZB.renderWindow(doc, root, {
		title: "Nurse-led exercise and falls", index: 0, total: 2, model: "",
		prompt: { fullTextStatus: "none", truncated: false },
	}, {
		copy: async userPDF => ({ text: "x", stats: { chars: userPDF ? 900 : 70000, long: !userPDF }, fullTextStatus: "none" }),
		open: url => opened.push(url),
		onSave: r => (got.save = r),
		onSkip: () => (got.skip = true),
		onCancel: () => (got.cancel = true),
	});
	assert.match(doc.querySelector("h1").textContent, /（1／2）$/);
	assert.match(doc.querySelector("[data-zb-fulltext]").textContent, /掃描版/);
	assert.equal(view.save.disabled, true, "nothing pasted yet");
	view.copyFull.click();
	await new Promise(r => setTimeout(r, 0));
	let status = doc.querySelector("[data-zb-copy-status]");
	assert.match(status.textContent, /^已複製 70,000 字/);
	assert.equal(status.getAttribute("data-zb-long"), "true");
	view.copyShort.click();
	await new Promise(r => setTimeout(r, 0));
	assert.equal(status.getAttribute("data-zb-long"), "false");
	assert.match(doc.querySelector("[data-zb-fulltext]").textContent, /不含全文/);
	doc.querySelector("[data-zb-site=\"gemini\"]").click();
	assert.deepEqual(opened, ["https://gemini.google.com/app"]);
	view.answer.value = "以下是筆記。\n\n" + AI_TEXT;
	view.answer.dispatchEvent(new window.Event("input"));
	let levels = [...doc.querySelectorAll("[data-zb-checks] li")].map(li => li.getAttribute("data-zb-level"));
	assert.deepEqual(levels, ["ok", "ok"]);
	assert.equal(view.save.disabled, false);
	view.save.click();
	assert.ok(got.save.text.startsWith("## 一句話摘要"));
	assert.equal(got.save.model, ZB.DEFAULT_MODEL);
	// Decided once
	doc.querySelector(".zb-ma-skip").click();
	assert.equal(got.skip, undefined);
});

test("OpenRouter: the key from the login manager, a sync's AI note through Chat Completions, the call in the usage ledger", async () => {
	let vault = await fsp.mkdtemp(path.join(os.tmpdir(), "zb-ma-"));
	let log = [];
	let env = makeEnv({ fetch: apiMock(log).fetch, prefs: noKeys(vault, { [P + "llm.provider"]: "openrouter", [P + "llm.openrouterKey"]: "sk-or-v1-abcdefghijklmnop" }) });
	let ZB = await start(env);
	let settings = await ZB.main.readSettings();
	// The plain pref moved into the login manager
	assert.equal(env.prefStore[P + "llm.openrouterKey"], undefined);
	assert.deepEqual([settings.llm.provider, settings.llm.model, settings.llm.apiKey], ["openrouter", "openrouter/free", "sk-or-v1-abcdefghijklmnop"]);
	let { item } = paper(env);
	await ZB.main.run([item], { targets: ["obsidian"], ai: "missing" });
	assert.deepEqual(env.errors, []);
	let calls = log.filter(l => l.api === "openrouter");
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
	assert.equal(calls[0].headers.authorization, "Bearer sk-or-v1-abcdefghijklmnop");
	assert.equal(calls[0].body.model, "openrouter/free");
	assert.equal(calls[0].body.messages[0].role, "system");
	assert.match(calls[0].body.messages[1].content, /twelve week exercise intervention/);
	assert.equal(log.filter(l => l.api === "anthropic").length, 0);
	assert.match(read(vault, "Zotero", "lee2024.md"), /^> \[!zm-ai\]- AI 文獻筆記（google\/gemma-4-31b-it:free · /m);
	let ledger = JSON.parse(env.prefStore[P + "usage.ledger"]);
	let month = Object.values(ledger)[0];
	assert.equal(month.byModel["google/gemma-4-31b-it:free"].calls, 1);
	await vm.runInContext("shutdown()", env.context);
});

test("OpenRouter's daily free limit: said once in plain words; the rest of the batch syncs without calling the AI again", async () => {
	let vault = await fsp.mkdtemp(path.join(os.tmpdir(), "zb-ma-"));
	let log = [];
	let limited = () => ({ status: 429, ok: false, statusText: "Too Many Requests", headers: { get: () => null },
		text: async () => JSON.stringify({ error: { code: 429, message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day" } }) });
	let env = makeEnv({ fetch: apiMock(log, { openrouter: limited }).fetch, prefs: noKeys(vault, { [P + "llm.provider"]: "openrouter", [P + "llm.openrouterKey"]: "sk-or-v1-abcdefghijklmnop" }) });
	let ZB = await start(env);
	let a = paper(env).item;
	let b = paper(env, { key: "chen2025", title: "Second paper" }).item;
	let c = paper(env, { key: "wu2026", title: "Third paper" }).item;
	await ZB.main.run([a, b, c], { targets: ["obsidian"], ai: "missing" });
	assert.equal(log.filter(l => l.api === "openrouter").length, 1, "one call, no retries, none for the next papers");
	// Every paper is still written to Obsidian
	for (let key of ["lee2024", "chen2025", "wu2026"]) assert.ok(fs.existsSync(path.join(vault, "Zotero", `${key}.md`)), key);
	let lines = env.progressLines.map(l => l.text).join("\n");
	assert.match(lines, /OpenRouter 今天的免費額度用完了，(今天|明天) \d\d:\d\d 會重置/);
	assert.equal((lines.match(/今天的 AI 免費額度已用完，這篇先不產生 AI 筆記/g) || []).length, 2);
	assert.ok(env.descriptions.some(d => /^⚠️ OpenRouter 今天的免費額度用完了，後面的文獻只同步/.test(d)), env.descriptions.join("\n"));
	await vm.runInContext("shutdown()", env.context);
});
