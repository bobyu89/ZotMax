// 檢索日誌 (content/search-log.js) through the real plugin in a mocked Zotero: the JSON in the data folder, the vault
// note (organized and flat) and its data copy, restoring from the vault, two collections with one name, the item-tag
// observer's pending batches, the log window, the exports and the feature switch.
// The mock environment is copied from test/screening-smoke.test.cjs.
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
// Values from the plugin's sandbox are other-realm objects: compare their JSON
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message);

function makeEnv({ prefs, dataDir, confirm = () => true }) {
	let items = new Map();
	let nextID = 100;
	let descriptions = [];
	let progressLines = [];
	let errors = [];
	let observers = [];
	let launched = [];
	let clipboard = [];
	let confirms = [];
	let tagNames = new Map();

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
			this.collections = [];
			this.children = [];
			items.set(this.id, this);
		}
		isRegularItem() { return !["note", "attachment", "annotation"].includes(this.itemType); }
		isNote() { return this.itemType === "note"; }
		getField(f) { return this.fields[f] || ""; }
		getCreatorsJSON() { return []; }
		getTags() { return this.tags.map(tag => ({ tag })); }
		addTag(t) {
			if (this.tags.includes(t)) return false;
			this.tags.push(t);
			return true;
		}
		removeTag(t) { this.tags = this.tags.filter(x => x !== t); }
		getCollections() { return this.collections.slice(); }
		getAttachments() { return []; }
		getNotes() { return []; }
		async saveTx() { return this.id; }
	}

	let collections = new Map();
	let prefStore = Object.assign({ [P + "obsidian.structure"]: "flat", [P + "obsidian.layout"]: "classic" }, prefs);
	let activeCollection = null;
	// A main window whose <dialog> works like Zotero's (jsdom has the element, not the modal methods)
	let { window } = new JSDOM("<!doctype html><body></body>");
	window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
	window.HTMLDialogElement.prototype.close = function (rv) {
		this.removeAttribute("open");
		this.returnValue = rv || "";
		this.dispatchEvent(new window.Event("close"));
	};
	let Zotero = {
		Prefs: { get: k => prefStore[k], set: (k, v) => { prefStore[k] = v; }, clear: (k) => { delete prefStore[k]; } },
		MenuManager: { registerMenu: o => o.menuID, unregisterMenu: () => true },
		Notifier: {
			registerObserver: (obs, types, name) => {
				observers.push({ obs, types, name });
				return name || "obs";
			},
			unregisterObserver: (id) => {
				let at = observers.findIndex(o => o.name === id);
				if (at >= 0) observers.splice(at, 1);
			},
		},
		ItemPaneManager: { registerSection: o => o.paneID, unregisterSection: () => true },
		PreferencePanes: { register: async () => "pane" },
		getMainWindows: () => [],
		getMainWindow: () => window,
		getActiveZoteroPane: () => ({ getSelectedCollections: () => (activeCollection ? [activeCollection] : []) }),
		launchURL: (u) => { launched.push(u); },
		Utilities: { Internal: { copyTextToClipboard: (t) => { clipboard.push(t); } } },
		Items: {
			get: ids => (Array.isArray(ids) ? ids.map(id => items.get(id)) : items.get(ids)),
			exists: id => items.has(id),
			getByLibraryAndKey: () => false,
			getAll: async () => [],
		},
		Libraries: { userLibraryID: 1, get: () => ({ libraryType: "user", name: "My Library" }), getAll: () => [] },
		Groups: { getGroupIDFromLibraryID: () => null },
		Collections: {
			get: ids => (Array.isArray(ids) ? ids.map(id => collections.get(id)) : collections.get(ids)),
			getByParent: id => [...collections.values()].filter(c => c.parentID === id),
			getByLibrary: libraryID => [...collections.values()].filter(c => c.libraryID === libraryID),
			getByLibraryAndKey: (libraryID, key) => [...collections.values()].find(c => c.libraryID === libraryID && c.key === key) || false,
		},
		Tags: { getID: () => false, getName: id => tagNames.get(id) || false },
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
			addDescription(t) { descriptions.push(t); }
			show() {}
			startCloseTimer() {}
		},
		logError: (e) => { errors.push(e); },
		debug: () => {},
		DataDirectory: { dir: dataDir },
	};
	Zotero.Item = MockItem;

	function addCollection(id, name, members, parentID = null) {
		let c = {
			id, key: `COLL${id}`, name, libraryID: 1, parentID, deleted: false,
			getChildItems: () => members.map(i => items.get(i.id)).filter(i => !i.deleted),
		};
		for (let m of members) m.collections.push(id);
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
	};
	let PathUtils = { join: (...parts) => path.join(...parts), filename: p => path.basename(p), parent: p => path.dirname(p) };
	let context = vm.createContext({
		Zotero, IOUtils, PathUtils, console, TextDecoder, TextEncoder, URLSearchParams,
		fetch: async () => { throw new Error("no network expected"); },
		Components: { Constructor: function () { return function () {}; }, interfaces: { nsILoginInfo: {} } },
		DOMParser: window.DOMParser,
		// The observer's few seconds of collecting pass quickly
		setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)),
		clearTimeout,
		Services: {
			scriptloader: {
				loadSubScript: (url) => {
					let file = url.replace("file://", "");
					vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
				},
			},
			prompt: {
				confirm: (win, title, text) => { confirms.push(text); return confirm(text); },
				prompt: () => false,
			},
			logins: { searchLoginsAsync: async () => [], addLoginAsync: async l => l, modifyLoginAsync: async () => {}, removeLoginAsync: async () => {} },
		},
	});
	vm.runInContext(fs.readFileSync(path.join(ROOT, "bootstrap.js"), "utf8"), context, { filename: "bootstrap.js" });
	return {
		context, Zotero, MockItem, items, descriptions, progressLines, errors, observers, launched, clipboard, confirms, prefStore, tagNames, window, addCollection,
		setActiveCollection: (c) => { activeCollection = c; },
	};
}

async function setup(opts = {}) {
	let vault = opts.noVault ? "" : await fsp.mkdtemp(path.join(os.tmpdir(), "zb-log-vault-"));
	let dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), "zb-log-data-"));
	let env = makeEnv({
		dataDir,
		confirm: opts.confirm,
		prefs: Object.assign(vault ? { [P + "obsidian.vaultPath"]: vault, [P + "obsidian.folder"]: "Zotero" } : {}, opts.prefs),
	});
	await vm.runInContext(`startup({ id: "zotero-bridge@bobyu89.github.io", version: "0.0.0", rootURI: ${JSON.stringify(ROOT_URI)} })`, env.context);
	let ZB = env.context.ZB;
	ZB.searchLog.runtime.now = () => new Date("2026-10-29T08:00:00Z");
	return Object.assign(env, { vault, dataDir, ZB, log: ZB.searchLog });
}

const wait = async (cond) => {
	for (let i = 0; i < 300 && !cond(); i++) await new Promise(r => setTimeout(r, 5));
	assert.ok(cond(), "timed out");
};

test("without a vault: the log is a JSON file in the data folder; append, update, promote, delete (a tombstone)", async () => {
	let env = await setup({ noVault: true });
	let { log } = env;
	let c = env.addCollection(1, "跌倒預防", []);
	let e = await log.append(c, { database: "華藝線上圖書館", sourceTag: "華藝", query: "跌倒 AND 長者", hits: 0 });
	let file = path.join(env.dataDir, "zotero-bridge", "search-log", "library_collections_COLL1.json");
	let data = JSON.parse(fs.readFileSync(file, "utf8"));
	assert.equal(data.scope, "library/collections/COLL1");
	assert.equal(data.name, "跌倒預防");
	same(data.entries.map(x => [x.database, x.hits, x.status, x.date]), [["華藝線上圖書館", 0, "formal", "2026-10-29"]]);
	let r = await log.read(c);
	assert.equal(r.note, null, "no vault, no note");
	assert.equal(r.entries.length, 1);
	log.runtime.now = () => new Date("2026-10-29T09:00:00Z");
	await log.update(c, e.id, { imported: 0, notes: "查到 0 筆" });
	await log.promote(c, e.id, "exploratory");
	let after = (await log.read(c)).entries[0];
	same([after.imported, after.notes, after.status, after.createdAt], [0, "查到 0 筆", "exploratory", e.createdAt]);
	await log.remove(c, e.id);
	let s = await log.summaryFor(c);
	same([s.entries.length, s.hasLog, s.link], [0, false, ""]);
	assert.ok(JSON.parse(fs.readFileSync(file, "utf8")).entries[0].deleted, "kept as a tombstone");
	// The library has its own log
	await log.append(null, { database: "PubMed", hits: 5 });
	assert.ok(fs.existsSync(path.join(env.dataDir, "zotero-bridge", "search-log", "library.json")));
	assert.equal(log.scopeOf(null).name, "我的文獻庫");
	// Concurrent writes to one scope don't lose each other
	await Promise.all([1, 2, 3, 4, 5].map(n => log.append(c, { database: `DB${n}` })));
	assert.equal((await log.summaryFor(c)).entries.length, 5);
	same(env.errors, []);
});

test("with a vault: the note in 30 評讀與綜整/檢索日誌 (organized) or Reviews/檢索日誌 (flat), merged with the JSON; restored when the JSON is lost", async () => {
	for (let [structure, folder] of [["organized", ["Zotero", "30 評讀與綜整", "檢索日誌"]], ["flat", ["Zotero", "Reviews", "檢索日誌"]]]) {
		let env = await setup({ prefs: { [P + "obsidian.structure"]: structure } });
		let { log } = env;
		let c = env.addCollection(1, "跌倒預防", []);
		await log.append(c, { database: "PubMed", query: "falls[tiab]", hits: 120, imported: 118 });
		let notePath = path.join(env.vault, ...folder, "跌倒預防.md");
		let note = fs.readFileSync(notePath, "utf8");
		assert.match(note, /^type: "search-log"$/m, structure);
		assert.match(note, /### PubMed/);
		let s = await log.summaryFor(c);
		assert.equal(s.link, [...folder, "跌倒預防"].join("/"));
		same(s.databases.map(d => [d.name, d.hits, d.imported]), [["PubMed", 120, 118]]);
		// The user writes in the note; the next write keeps it
		fs.writeFileSync(notePath, note.replace("## ✍️ 我的筆記\n\n", "## ✍️ 我的筆記\n\n館員看過了。\n"));
		await log.append(c, { database: "CINAHL", hits: 30 });
		assert.match(fs.readFileSync(notePath, "utf8"), /館員看過了。/);
		// The data folder is lost: the vault copy brings the log back
		fs.rmSync(path.join(env.dataDir, "zotero-bridge", "search-log", "library_collections_COLL1.json"));
		same((await log.read(c)).entries.map(e => e.database), ["PubMed", "CINAHL"]);
		// Another computer added an entry to the vault copy: merged on read
		let other = log.normalizeEntry({ id: "other-pc", database: "華藝", hits: 7, date: "2026-10-28", createdAt: "2026-10-28T00:00:00Z", updatedAt: "2026-10-28T00:00:00Z" });
		let text = fs.readFileSync(notePath, "utf8");
		let data = log.decodeData(text);
		fs.writeFileSync(notePath, text.replace(/%% zotmax-search-log-data\n[^\n]*\n%%/, log.encodeData({ v: 1, scope: data.scope, entries: [...data.entries, other] })));
		same((await log.read(c)).entries.map(e => e.database), ["華藝", "PubMed", "CINAHL"]);
		same(env.errors, []);
	}
});

test("two collections with the same name: the second note gets the collection key", async () => {
	let env = await setup();
	let { log } = env;
	let a = env.addCollection(1, "文獻回顧", []);
	let b = env.addCollection(2, "文獻回顧", []);
	await log.append(a, { database: "PubMed" });
	await log.append(b, { database: "CINAHL" });
	let dir = path.join(env.vault, "Zotero", "Reviews", "檢索日誌");
	assert.deepEqual(fs.readdirSync(dir).sort(), ["文獻回顧 (COLL2).md", "文獻回顧.md"]);
	assert.match(fs.readFileSync(path.join(dir, "文獻回顧 (COLL2).md"), "utf8"), /### CINAHL/);
	assert.equal((await log.summaryFor(b)).link, "Zotero/Reviews/檢索日誌/文獻回顧 (COLL2)");
	same((await log.read(a)).entries.map(e => e.database), ["PubMed"], "each reads its own");
	same(env.errors, []);
});

test("the item-tag observer: 來源/ tags added within a few seconds become one pending batch per tag; nothing pops up", async () => {
	let env = await setup();
	let { log } = env;
	let obs = env.observers.find(o => o.name === "zotero-bridge-search-log");
	assert.ok(obs, "registered at startup");
	same(obs.types, ["item-tag"]);
	let papers = [1, 2, 3].map(n => new env.MockItem("journalArticle", { title: `Paper ${n}` }));
	let parent = env.addCollection(1, "碩論", []);
	env.addCollection(2, "跌倒預防", papers, 1);
	env.tagNames.set(77, "來源/華藝");
	// Two notifications: one carries the tag name, the other only its ID; a tag that isn't 來源/ is ignored
	obs.obs.notify("add", "item-tag", [`${papers[0].id}-77`, `${papers[1].id}-77`], { [`${papers[0].id}-77`]: { tag: "來源/華藝" }, [`${papers[1].id}-77`]: {} });
	obs.obs.notify("add", "item-tag", [`${papers[2].id}-77`, `${papers[2].id}-78`], { [`${papers[2].id}-77`]: { tag: "來源/華藝" }, [`${papers[2].id}-78`]: { tag: "篩選/重複" } });
	obs.obs.notify("remove", "item-tag", [`${papers[2].id}-77`], { [`${papers[2].id}-77`]: { tag: "來源/華藝" } });
	await wait(() => JSON.parse(env.prefStore[P + "searchLog.pending"] || "[]").length);
	let pending = JSON.parse(env.prefStore[P + "searchLog.pending"]);
	same(pending.map(p => [p.tag, p.n, p.scopes]), [["華藝", 3, ["library/collections/COLL2", "library/collections/COLL1"]]]);
	assert.equal(env.descriptions.length, 0, "no notification");
	// The library's window lists it too; its 補記一筆 defaults to the batch's own collection, not the library
	let libForms = [];
	log.runtime.form = (prefill, opts) => {
		libForms.push(opts.collection);
		return null;
	};
	let lib = log.open(null);
	let libDialog = env.window.document.querySelector("dialog");
	await wait(() => /最近有 3 筆加上「來源\/華藝」/.test(libDialog.textContent));
	let fill = [...libDialog.querySelectorAll("button")].find(b => b.textContent === "補記一筆");
	assert.equal(fill.getAttribute("aria-label"), "補記一筆：來源/華藝");
	fill.click();
	await wait(() => libForms.length);
	assert.equal(libForms[0] && libForms[0].key, "COLL2", "the batch's first collection");
	assert.equal(JSON.parse(env.prefStore[P + "searchLog.pending"]).length, 1, "cancelled: the batch waits");
	[...libDialog.querySelectorAll("button")].find(b => b.textContent === "關閉").click();
	await lib;
	// Shown in the parent's log window too; 補記一筆 opens the form with the batch, then the batch is gone
	let forms = [];
	log.runtime.form = (prefill, opts) => {
		forms.push(prefill);
		return { entry: prefill, collection: opts.collection };
	};
	let running = log.open(parent);
	let dialog = env.window.document.querySelector("dialog");
	await wait(() => /最近有 3 筆加上「來源\/華藝」/.test(dialog.textContent));
	[...dialog.querySelectorAll("button")].find(b => b.textContent === "補記一筆").click();
	await wait(() => JSON.parse(env.prefStore[P + "searchLog.pending"]).length === 0);
	same([forms[0].database, forms[0].imported, forms[0].origin], ["華藝", 3, "import"]);
	await wait(() => /正式（1）/.test(dialog.textContent));
	[...dialog.querySelectorAll("button")].find(b => b.textContent === "關閉").click();
	await running;
	same((await log.summaryFor(parent)).databases.map(d => [d.name, d.imported]), [["華藝", 3]]);
	// Off: ignored
	env.ZB.features.setEnabled("searchLog", false);
	obs.obs.notify("add", "item-tag", [`${papers[0].id}-79`], { [`${papers[0].id}-79`]: { tag: "來源/PubMed" } });
	await new Promise(r => setTimeout(r, 30));
	same(JSON.parse(env.prefStore[P + "searchLog.pending"]), []);
	vm.runInContext("shutdown()", env.context);
	assert.equal(env.observers.some(o => o.name === "zotero-bridge-search-log"), false, "unregistered at shutdown");
	same(env.errors, []);
});

test("the log window: 記一筆, edit, 升為正式, delete (asks once), the exports and the Obsidian note; Zotero items untouched", async () => {
	let env = await setup({ prefs: { [P + "obsidian.vaultName"]: "MyVault" } });
	let { log } = env;
	let paper = new env.MockItem("journalArticle", { title: "A paper", tags: ["來源/PubMed"] });
	let c = env.addCollection(1, "跌倒預防", [paper]);
	await log.autoDraft(c, { origin: "topic-bot", database: "PubMed", query: "falls", hits: 4 });
	let running = log.open(c);
	let dialog = env.window.document.querySelector("dialog");
	let button = label => [...dialog.querySelectorAll("button")].find(b => b.textContent === label);
	await wait(() => /探索（1）/.test(dialog.textContent));
	assert.match(dialog.textContent, /^檢索日誌：跌倒預防/);
	assert.match(dialog.textContent, /正式（0）還沒有正式檢索/);
	// 升為正式
	button("升為正式").click();
	await wait(() => /正式（1）/.test(dialog.textContent));
	// 記一筆…: the real form (a second <dialog>), filled and saved
	button("記一筆…").click();
	await wait(() => env.window.document.querySelectorAll("dialog").length === 2);
	let form = env.window.document.querySelectorAll("dialog")[1];
	assert.match(form.textContent, /記到哪個分類/);
	assert.match(form.textContent, /正式：會進 PRISMA 對帳和 PRISMA-S；探索：試查或追蹤，只留紀錄/);
	assert.match(form.textContent, /查到 0 筆也記/);
	let select = form.querySelector("select");
	assert.equal(select.options[select.selectedIndex].textContent, "跌倒預防", "the log's own collection");
	let inputs = [...form.querySelectorAll("input[type=text], input:not([type])")];
	assert.ok(form.querySelector("datalist option[value=PubMed]"), "the collection's 來源/ values are suggested");
	let field = n => inputs[n];
	// Required: 資料庫 and 日期
	[...form.querySelectorAll("button")].find(b => b.textContent === "記下").click();
	assert.match(form.textContent, /請填資料庫和日期/);
	assert.ok(form.open, "still open");
	field(0).value = "CINAHL";
	field(1).value = "EBSCOhost";
	form.querySelector("textarea").value = "(MH \"Accidental Falls\") AND nurs*";
	// The text fields in order: 資料庫, 平台, 來源標籤, 限制條件, 限制的理由, 命中筆數, 匯入檔名, 匯入筆數
	assert.match(field(5).previousSibling.textContent, /^命中筆數/);
	// A count the form can't read is said, not saved as 待填; full-width digits are fine
	assert.equal(form.getAttribute("aria-labelledby") && env.window.document.getElementById(form.getAttribute("aria-labelledby")).textContent, "記一筆檢索");
	assert.equal(field(5).getAttribute("aria-label"), "命中筆數（查到 0 筆也記）");
	assert.equal(field(0).getAttribute("aria-label"), "資料庫");
	field(5).value = "約 50";
	[...form.querySelectorAll("button")].find(b => b.textContent === "記下").click();
	assert.match(form.textContent, /命中筆數請填數字（查到 0 筆就填 0）/);
	assert.ok(form.open, "still open");
	field(7).value = "１２";
	field(5).value = "0";
	[...form.querySelectorAll("button")].find(b => b.textContent === "記下").click();
	await wait(() => /正式（2）/.test(dialog.textContent));
	let entries = (await log.read(c)).entries.filter(e => !e.deleted);
	let cinahl = entries.find(e => e.database === "CINAHL");
	same([cinahl.platform, cinahl.sourceTag, cinahl.query, cinahl.hits, cinahl.imported, cinahl.status], ["EBSCOhost", "CINAHL", "(MH \"Accidental Falls\") AND nurs*", 0, 12, "formal"]);
	assert.ok([...dialog.querySelectorAll("button")].some(b => /^刪除：\d{4}-\d{2}-\d{2} · CINAHL$/.test(b.getAttribute("aria-label") || "")), "row buttons say which entry");
	// Edit through the form (the test's stand-in): only the fields change
	log.runtime.form = (prefill, opts) => ({ entry: Object.assign({}, prefill, { limitsReason: "只收英文和中文" }), collection: opts.collection });
	dialog.querySelectorAll("button")[[...dialog.querySelectorAll("button")].findIndex(b => b.textContent === "編輯")].click();
	await wait(() => /只收英文和中文/.test(fs.readFileSync(path.join(env.dataDir, "zotero-bridge", "search-log", "library_collections_COLL1.json"), "utf8")));
	// 刪除 asks once
	let before = env.confirms.length;
	button("刪除").click();
	await wait(() => /正式（1）/.test(dialog.textContent));
	assert.equal(env.confirms.length, before + 1);
	// Exports into the log folder; the Markdown is copied
	button("匯出 PRISMA-S 草稿").click();
	let dir = path.join(env.vault, "Zotero", "Reviews", "檢索日誌");
	await wait(() => fs.existsSync(path.join(dir, "跌倒預防 檢索日誌.csv")));
	let md = fs.readFileSync(path.join(dir, "跌倒預防 PRISMA-S 草稿.md"), "utf8");
	assert.match(md, /^# PRISMA-S 檢索報告草稿（跌倒預防）/);
	assert.ok(fs.readFileSync(path.join(dir, "跌倒預防 PRISMA-S 草稿.csv"), "utf8").startsWith("﻿項目,PRISMA-S,內容,狀態"));
	assert.equal(env.clipboard.at(-1), md);
	// The note in Obsidian
	button("開啟 Obsidian 筆記").click();
	assert.match(env.launched.at(-1), /^obsidian:\/\/open\?vault=MyVault&file=Zotero%2FReviews%2F%E6%AA%A2/);
	button("關閉").click();
	same(await running, { closed: true });
	assert.deepEqual(paper.tags, ["來源/PubMed"], "the window never changes items");
	same(env.errors, []);
});

test("without a vault the exports go where the PICO 表 goes; the switch off makes autoDraft and logDedupe no-ops and hides the command", async () => {
	let env = await setup({ noVault: true });
	let { log, ZB } = env;
	let picoDir = await fsp.mkdtemp(path.join(os.tmpdir(), "zb-log-pico-"));
	env.prefStore[P + "pico.folder"] = picoDir;
	let c = env.addCollection(1, "跌倒預防", []);
	await log.append(c, { database: "PubMed", hits: 3, query: "falls" });
	let out = await log.exportPrismaS(c, { csvOnly: true });
	same([...out.files], ["跌倒預防 檢索日誌.csv"]);
	assert.ok(fs.existsSync(path.join(picoDir, "跌倒預防 檢索日誌.csv")));
	ZB.features.setEnabled("searchLog", false);
	assert.equal(await log.autoDraft(c, { origin: "pubmed-watch", database: "PubMed", query: "falls" }), null);
	assert.equal(await log.logDedupe(c, { groups: 2 }), null);
	assert.equal(await log.summaryFor(c), null);
	assert.equal(log.offerAfterOpen({ id: "airiti", lang: "zh" }), false);
	assert.equal(ZB.commands.isVisible(ZB.commands.get("search-log")), false);
	assert.equal((await log.read(c)).entries.length, 1, "nothing written");
	// The option alone
	ZB.features.setEnabled("searchLog", true);
	env.prefStore[P + "searchLog.autoDrafts"] = false;
	assert.equal(await log.autoDraft(c, { origin: "pubmed-watch", database: "PubMed", query: "falls" }), null);
	assert.equal(log.offerAfterOpen({ id: "airiti", lang: "zh" }), true);
	same(env.errors, []);
});
