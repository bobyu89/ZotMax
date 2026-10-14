// PICO 問題卡 and PICO 表 through the real plugin (bootstrap.js and every content script) in a mocked Zotero with an
// in-memory IOUtils: the card window (the real pico-card.xhtml in jsdom) with its coaching hints, the composed
// sentence, the live 聚焦檢查, the search string and database links, 儲存 into the pref and 刪除; the table window
// (pico-table.xhtml) showing the card, the collection's screened studies and the destination; 匯出 writing the
// note, the CSV and the HTML into Downloads or the vault's Reviews folder (the note's managed block rewritten, the
// user's part kept), the dialog after it with 複製成表格 putting the table on the clipboard; the PRISMA note carrying
// 本題 PICO; the switch hiding both commands; and the GRADE 證據確定性 window (grade.xhtml, grade.js) built on the
// same collection, its rating, and the Summary of Findings files.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const ROOT_URI = "file://" + ROOT + "/";
const P = "extensions.zotero-bridge.";
const DOWNLOADS = "/home/student/Downloads";
const VAULT = "/home/student/vault";

const STUDY = {
	study_design: "RCT", sample_size: 120, setting: "內科病房", country: "Taiwan",
	population: "65 歲以上住院病人", intervention: "護理師主導跌倒預防運動", comparison: "常規照護",
	outcomes: "跌倒發生率、跌倒自我效能", measures: ["Morse Fall Scale"],
	evidence_level: "2", jbi_level: "1.c", appraisal_tool: "CASP Checklist: For Randomised Controlled Trials (RCTs) (2024)", appraisal_overall: "納入",
};
const AI_MD = "## 一句話摘要\n\n運動減少跌倒。\n\n## 主要結果\n\n- 跌倒率下降 30%（RR 0.70）\n- 自我效能提升\n\n## 嚴格評讀\n\n整體評價：納入";

/** An in-memory file system shaped like IOUtils (only what the export uses). */
function memoryFS(initial = {}) {
	let files = new Map(Object.entries(initial));
	let dirs = new Set(["/"]);
	let addDirs = (p) => {
		for (let d = path.dirname(p); !dirs.has(d); d = path.dirname(d)) dirs.add(d);
	};
	for (let p of files.keys()) addDirs(p);
	return {
		files, dirs,
		IOUtils: {
			exists: async p => files.has(p) || dirs.has(p),
			makeDirectory: async (p) => {
				dirs.add(p);
				addDirs(p + "/x");
			},
			writeUTF8: async (p, text) => {
				assert.ok(dirs.has(path.dirname(p)), `write into an existing folder: ${p}`);
				files.set(p, String(text));
			},
			readUTF8: async (p) => {
				if (!files.has(p)) throw new Error(`NotFoundError: ${p}`);
				return files.get(p);
			},
			getChildren: async p => [...files.keys(), ...dirs].filter(f => path.dirname(f) === p && f !== p),
			read: async (p, opts = {}) => {
				if (!files.has(p)) throw new Error(`NotFoundError: ${p}`);
				let bytes = new TextEncoder().encode(files.get(p));
				return opts.maxBytes ? bytes.subarray(0, opts.maxBytes) : bytes;
			},
			stat: async p => ({ path: p, type: dirs.has(p) ? "directory" : "regular", size: (files.get(p) || "").length, lastModified: 1 }),
		},
	};
}

function makeEnv(prefs = {}) {
	let items = new Map();
	let nextID = 100;
	let errors = [];
	let descriptions = [];
	let dialogs = [];
	let confirms = [];
	let revealed = [];
	let launched = [];
	let copied = [];
	let mem = memoryFS();

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
			this.noteHTML = fields.html || "";
			this.dateAdded = "2024-05-01 08:00:00";
			this.dateModified = "2024-05-02 08:00:00";
			this.version = 0;
			items.set(this.id, this);
		}
		get parentItem() { return this.parentID ? items.get(this.parentID) : undefined; }
		isRegularItem() { return !["note", "attachment", "annotation"].includes(this.itemType); }
		isNote() { return this.itemType === "note"; }
		isFileAttachment() { return this.itemType === "attachment"; }
		isPDFAttachment() { return this.itemType === "attachment"; }
		getField(f) { return this.fields[f] || ""; }
		getCreatorsJSON() { return this.fields.creators || []; }
		getTags() { return this.tags.map(tag => ({ tag })); }
		addTag(t) { this.tags.push(t); return true; }
		removeTag(t) { this.tags = this.tags.filter(x => x !== t); return true; }
		getCollections() { return []; }
		getAttachments() { return this.children.filter(id => items.get(id).itemType === "attachment"); }
		getNotes() { return this.children.filter(id => items.get(id).itemType === "note"); }
		getAnnotations() { return []; }
		getNote() { return this.noteHTML; }
		setNote(h) { this.noteHTML = h; }
		async saveTx() { return this.id; }
	}

	function addNote(parent, html, tags) {
		let note = new MockItem("note", { html, tags });
		note.parentID = parent.id;
		parent.children.push(note.id);
		return note;
	}

	let prefStore = Object.assign({}, prefs);
	let mainWindow = {
		openDialog(url, name, features) {
			assert.match(url, /^chrome:\/\/zotero-bridge\/content\/(pico-(card|table)|grade)\.xhtml$/);
			assert.match(features, /chrome/);
			let dom = new JSDOM(fs.readFileSync(path.join(ROOT, "content", path.basename(url)), "utf8"), { contentType: "application/xml" });
			let closed = false;
			dom.window.close = () => { closed = true; };
			Object.defineProperty(dom.window, "closed", { get: () => closed });
			dialogs.push(dom.window);
			return dom.window;
		},
	};
	let selection = { items: [], collection: null };
	let Zotero = {
		Prefs: {
			get: k => prefStore[k],
			set: (k, v) => { prefStore[k] = v; },
			clear: (k) => { delete prefStore[k]; },
			registerObserver: () => Symbol("observer"),
			unregisterObserver: () => {},
		},
		MenuManager: { registerMenu: o => o.menuID, unregisterMenu: () => true },
		Notifier: { registerObserver: () => "obs", unregisterObserver: () => {} },
		ItemPaneManager: { registerSection: o => o.paneID, unregisterSection: () => true },
		PreferencePanes: { register: async () => "pane" },
		getMainWindows: () => [],
		getMainWindow: () => mainWindow,
		getActiveZoteroPane: () => ({ getSelectedCollections: () => (selection.collection ? [selection.collection] : []), getSelectedItems: () => selection.items }),
		Items: {
			get: ids => (Array.isArray(ids) ? ids.map(id => items.get(id)) : items.get(ids)),
			getByLibraryAndKey: () => false,
			getAll: async () => [...items.values()].filter(i => !i.parentID),
		},
		Libraries: { userLibraryID: 1, get: () => ({ libraryType: "user", name: "我的文獻庫" }), getAll: () => [{ libraryID: 1, libraryType: "user", name: "我的文獻庫" }] },
		Groups: { getGroupIDFromLibraryID: () => null },
		Collections: { get: ids => (Array.isArray(ids) ? [] : null), getByParent: () => [] },
		Tags: { getID: () => false },
		Styles: { get: () => null },
		File: { reveal: async (p) => { revealed.push(p); } },
		launchFile: (p) => { revealed.push(p); },
		launchURL: (u) => { launched.push(u); },
		Utilities: { Internal: { copyTextToClipboard: (s) => { copied.push({ text: s }); } } },
		ProgressWindow: class {
			constructor() {
				this.ItemProgress = class {
					setText() {}
					setProgress() {}
					setError() {}
				};
			}
			changeHeadline() {}
			addDescription(t) { descriptions.push(t); }
			show() {}
			close() {}
			startCloseTimer() {}
		},
		logError: (e) => { errors.push(e); },
		debug: () => {},
	};
	Zotero.Item = MockItem;
	let PathUtils = { join: (...parts) => path.join(...parts), filename: p => path.basename(p), parent: p => path.dirname(p) };
	let context = vm.createContext({
		Zotero, PathUtils, IOUtils: mem.IOUtils, console, TextDecoder, TextEncoder,
		fetch: async (url) => { throw new Error(`unexpected request ${url}`); },
		ChromeUtils: {
			importESModule: (url) => {
				if (url === "resource://gre/modules/Downloads.sys.mjs") return { Downloads: { getPreferredDownloadsDirectory: async () => DOWNLOADS } };
				throw new Error(`unexpected module ${url}`);
			},
		},
		Components: { Constructor: function () { return function () {}; }, interfaces: { nsILoginInfo: {} } },
		DOMParser: new JSDOM("").window.DOMParser,
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
				BUTTON_POS_0: 1, BUTTON_POS_1: 256, BUTTON_POS_2: 65536, BUTTON_TITLE_IS_STRING: 127, BUTTON_TITLE_CANCEL: 2, BUTTON_POS_0_DEFAULT: 0,
				confirm: (win, title, text) => { confirms.push({ title, text }); return true; },
				confirmEx: (win, title, text, flags, b0, b1, b2) => {
					confirms.push({ title, text, buttons: [b0, b1, b2].filter(Boolean) });
					return env.answer;
				},
			},
			logins: { searchLoginsAsync: async () => [], addLoginAsync: async l => l, modifyLoginAsync: async () => {}, removeLoginAsync: async () => {} },
		},
	});
	vm.runInContext(fs.readFileSync(path.join(ROOT, "bootstrap.js"), "utf8"), context, { filename: "bootstrap.js" });
	let env = { context, Zotero, MockItem, addNote, items, errors, descriptions, dialogs, confirms, revealed, launched, copied, mem, prefStore, selection, answer: 2 };
	return env;
}

async function setup(prefs = {}) {
	let env = makeEnv(Object.assign({ [P + "features.version"]: 6 }, prefs));
	await vm.runInContext(`startup({ id: "zotero-bridge@bobyu89.github.io", version: "0.0.0", rootURI: ${JSON.stringify(ROOT_URI)} })`, env.context);
	let ZB = env.context.ZB;
	ZB.pico.runtime.now = () => new Date(2026, 9, 13, 9, 0);
	ZB.pico.runtime.copy = (html, text) => { env.copied.push({ html, text }); };
	ZB.searchLinks.runtime.launch = u => env.launched.push(u);
	ZB.searchLinks.runtime.copy = s => env.copied.push({ text: s });
	// An RCT with an AI note (structured data) and a verified 文獻評讀表; a Chinese paper without an AI note; a book
	let lee = new env.MockItem("journalArticle", {
		title: "Nurse-led exercise and falls in hospital", shortTitle: "Nurse-led exercise and falls", year: "2021", date: "2021",
		creators: [{ lastName: "Lee", firstName: "Anna", creatorType: "author" }], publicationTitle: "Journal of Fall Research", DOI: "10.1000/jfr.2021.1", language: "en",
	});
	env.addNote(lee, "<h1>🤖 AI 文獻筆記</h1>\n<p><em>由 test-model 於 2026-10-01 產生（ZotMax）</em></p>\n"
		+ ZB.markdown.mdToHtml(`${AI_MD}\n\n${ZB.llm.studyDataBlock(ZB.llm.normalizeStudyData(STUDY))}`), [ZB.adapter.AI_NOTE_TAG]);
	let form = { tool: "casp-rct", answers: { 1: { answer: "是" }, 2: { answer: "是" } }, overall: "納入", verified: true, verifiedAt: "2026-10-02" };
	env.addNote(lee, ZB.appraisalForm.noteHTML(form), [ZB.appraisalForm.NOTE_TAG]);
	let chen = new env.MockItem("journalArticle", {
		title: "護理人員跌倒預防衛教之成效", year: "2023", date: "2023", language: "zh",
		creators: [{ lastName: "陳", firstName: "美玲", creatorType: "author" }], publicationTitle: "護理雜誌",
	});
	let book = new env.MockItem("book", { title: "Nursing research methods", year: "2019", date: "2019", creators: [{ lastName: "Smith", firstName: "John", creatorType: "author" }] });
	let collection = { id: 7, key: "COLL1", name: "跌倒預防", libraryID: 1 };
	ZB.adapter.itemsInCollection = c => (c === collection ? [lee, chen, book] : []);
	ZB.adapter.collectionPath = c => c.name;
	return Object.assign(env, { ZB, lee, chen, book, collection });
}

/** A window once it is drawn. */
async function openedDialog(env, rootID, count = 1) {
	for (let i = 0; i < 400; i++) {
		let win = env.dialogs[count - 1];
		if (win && win.document.querySelector(".zb-cl-apply")) return win.document.getElementById(rootID);
		await new Promise(r => setTimeout(r, 5));
	}
	throw new Error(`the ${rootID} window never opened`);
}

function type(el, value) {
	el.value = value;
	el.dispatchEvent(new el.ownerDocument.defaultView.Event("input", { bubbles: true }));
}

function filesIn(env, dir) {
	return [...env.mem.files.keys()].filter(p => path.dirname(p) === dir).map(p => path.basename(p)).sort();
}

const CARD_KEY = "library/collections/COLL1";

test("card window: labels and hints by type, the composed sentence, the live 聚焦檢查, the search string with database links; 儲存 keeps the card in the pref", async () => {
	let env = await setup();
	let { ZB } = env;
	let C = ZB.commands;
	assert.equal(C.isVisible(C.get("pico-card")), true, "on in 研究生引導");
	assert.equal(C.isVisible(C.get("pico-table")), true);
	env.selection.collection = env.collection;
	let running = C.execute("pico-card", C.fromWindow(null, "toolbar"));
	let root = await openedDialog(env, "zb-pico-card");
	let doc = root.ownerDocument;
	assert.equal(doc.documentElement.getAttribute("title"), "PICO 問題卡");
	assert.ok(root.classList.contains("zb-classify") && root.classList.contains("zb-pico"), "borrows the review window's stylesheet");
	assert.equal(root.querySelector(".zb-cl-title").textContent, "PICO 問題卡：跌倒預防");
	assert.match(root.querySelector(".zb-cl-lead").textContent, /問題由你寫/);
	assert.equal(doc.querySelector('label[for="zb-pc-p"]').textContent, "族群（P）");
	assert.match(doc.getElementById("zb-pc-p-hint").textContent, /誰？年齡、疾病/);
	assert.equal(doc.querySelector(".zb-pc-delete").hidden, true, "no card yet: nothing to delete");
	let save = root.querySelector(".zb-cl-apply");
	assert.equal(save.disabled, true, "an empty card can't be saved");
	let checks = () => [...root.querySelectorAll(".zb-pc-checks li")].map(li => [li.className, li.textContent]);
	assert.ok(checks().some(([cls, t]) => cls === "zb-pc-warn" && /還沒寫族群/.test(t)), JSON.stringify(checks()));
	// The type changes the labels and hints
	let typeSelect = doc.getElementById("zb-pc-type");
	typeSelect.value = "meaning";
	typeSelect.dispatchEvent(new doc.defaultView.Event("change"));
	assert.equal(doc.querySelector('label[for="zb-pc-c"]').textContent, "情境（Co）");
	assert.ok(!checks().some(([, t]) => /結果/.test(t) && /還沒寫/.test(t)), "a qualitative question needs no outcome");
	typeSelect.value = "treatment";
	typeSelect.dispatchEvent(new doc.defaultView.Event("change"));
	// Fill the elements; the checks follow and the sentence can be composed
	type(doc.getElementById("zb-pc-p"), "65 歲以上住院病人 older inpatients");
	type(doc.getElementById("zb-pc-i"), "護理師主導運動 nurse-led exercise");
	type(doc.getElementById("zb-pc-c"), "常規照護 usual care");
	type(doc.getElementById("zb-pc-o"), "跌倒發生率 falls");
	type(doc.getElementById("zb-pc-setting"), "區域醫院內科病房");
	assert.equal(save.disabled, false);
	assert.ok(checks().some(([cls, t]) => cls === "zb-pc-warn" && /還沒有完整的問題句/.test(t)));
	assert.match(doc.getElementById("zb-pc-question-hint").textContent, /^建議起點：在65 歲以上住院病人 older inpatients中/);
	root.querySelector(".zb-pc-compose").click();
	let question = doc.getElementById("zb-pc-question");
	assert.match(question.value, /^在65 歲以上住院病人 older inpatients中，護理師主導運動 nurse-led exercise相較於常規照護 usual care，對跌倒發生率 falls的效果如何？$/);
	type(question, "在 65 歲以上住院病人中，護理師主導運動相較於常規照護，對跌倒發生率的效果如何？");
	assert.deepEqual(checks(), [["zb-pc-ok", "看起來聚焦了：每個要素都有，問題句也寫好了。"]]);
	assert.equal(root.querySelector(".zb-cl-summary").textContent, "可以儲存了；之後隨時回來改。");
	// The search string and the databases (search links are on in 研究生引導)
	assert.equal(root.querySelector('[data-zb-query="en"]').textContent, '英文詞："older inpatients" AND "nurse-led exercise" AND falls', "the comparison follows the search-links setting (off by default)");
	assert.match(root.querySelector('[data-zb-query="all"]').textContent, /^原文詞彙：65 歲以上住院病人 older inpatients AND/);
	let links = [...root.querySelectorAll(".zb-pc-link")].map(b => b.textContent);
	assert.deepEqual(links.slice(0, 2), ["複製英文檢索式", "複製原文檢索式"]);
	assert.ok(links.includes("PubMed") && links.includes("CINAHL") && links.includes("Google Scholar"), JSON.stringify(links));
	assert.ok(links.some(l => /^華藝.*（複製）$/.test(l)), "華藝 has no search URL: its start page opens and the string is copied");
	root.querySelectorAll(".zb-pc-link")[0].click();
	assert.equal(env.copied.pop().text, '"older inpatients" AND "nurse-led exercise" AND falls');
	[...root.querySelectorAll(".zb-pc-link")].find(b => b.textContent === "PubMed").click();
	assert.equal(env.launched.pop(), "https://pubmed.ncbi.nlm.nih.gov/?term=%22older%20inpatients%22%20AND%20%22nurse-led%20exercise%22%20AND%20falls");
	save.click();
	let result = await running;
	assert.equal(result.saved.p, "65 歲以上住院病人 older inpatients");
	assert.equal(result.saved.updatedAt, new Date(2026, 9, 13, 9, 0).toISOString());
	let stored = JSON.parse(env.prefStore[P + "pico.cards"]);
	assert.deepEqual(Object.keys(stored), [CARD_KEY], "keyed by the collection");
	assert.equal(stored[CARD_KEY].question, "在 65 歲以上住院病人中，護理師主導運動相較於常規照護，對跌倒發生率的效果如何？");
	assert.equal(stored[CARD_KEY].type, "treatment");
	assert.match(env.descriptions.pop(), /已儲存「跌倒預防」的問題卡/);
	assert.ok(env.dialogs[0].closed, "the window closes after 儲存");
	assert.deepEqual(env.errors, []);

	// Reopened: the card is there, 刪除這張卡 shows; Esc writes nothing; 刪除 removes it
	running = C.execute("pico-card", C.fromWindow(null, "toolbar"));
	root = await openedDialog(env, "zb-pico-card", 2);
	doc = root.ownerDocument;
	assert.equal(doc.getElementById("zb-pc-o").value, "跌倒發生率 falls");
	assert.equal(doc.querySelector(".zb-pc-delete").hidden, false);
	root.dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
	assert.equal(JSON.stringify(await running), '{"cancelled":true}');
	assert.equal(JSON.parse(env.prefStore[P + "pico.cards"])[CARD_KEY].o, "跌倒發生率 falls", "Esc changed nothing");
	running = C.execute("pico-card", C.fromWindow(null, "toolbar"));
	root = await openedDialog(env, "zb-pico-card", 3);
	root.querySelector(".zb-pc-delete").click();
	assert.equal(JSON.stringify(await running), '{"deleted":true}');
	assert.deepEqual(JSON.parse(env.prefStore[P + "pico.cards"]), {});

	// Without a collection: the library's card
	env.selection.collection = null;
	running = C.execute("pico-card", C.fromWindow(null, "toolbar"));
	root = await openedDialog(env, "zb-pico-card", 4);
	assert.equal(root.querySelector(".zb-cl-title").textContent, "PICO 問題卡：我的文獻庫");
	type(root.ownerDocument.getElementById("zb-pc-p"), "老人");
	root.querySelector(".zb-cl-apply").click();
	await running;
	assert.deepEqual(Object.keys(JSON.parse(env.prefStore[P + "pico.cards"])), ["library"]);
	assert.deepEqual(env.errors, []);
});

test("card window without 醫學資料庫搜尋連結: no links, a hint where they would be", async () => {
	let env = await setup({ [P + "feature.searchLinks"]: false });
	let { ZB } = env;
	env.selection.collection = env.collection;
	let running = ZB.commands.execute("pico-card", ZB.commands.fromWindow(null, "toolbar"));
	let root = await openedDialog(env, "zb-pico-card");
	type(root.ownerDocument.getElementById("zb-pc-p"), "older adults");
	type(root.ownerDocument.getElementById("zb-pc-i"), "exercise");
	assert.equal(root.querySelectorAll(".zb-pc-link").length, 0);
	assert.match(root.querySelector("#zb-pc-search-h").parentNode.textContent, /「醫學資料庫搜尋連結」關著/);
	root.querySelector(".zb-cl-cancel").click();
	assert.equal(JSON.stringify(await running), '{"cancelled":true}');
	assert.deepEqual(env.errors, []);
});

test("card window: the collection's common subject terms the card lacks, as copy buttons (from the papers' Zotero tags)", async () => {
	let env = await setup();
	let { ZB } = env;
	env.lee.tags = ["*Accidental Falls/prevention & control", "Exercise Therapy", "Humans", "狀態/已讀"];
	env.chen.tags = ["Accidental Falls", "Patient Education as Topic"];
	env.selection.collection = env.collection;
	let running = ZB.commands.execute("pico-card", ZB.commands.fromWindow(null, "toolbar"));
	let root = await openedDialog(env, "zb-pico-card");
	let doc = root.ownerDocument;
	let terms = () => [...root.querySelectorAll("[data-zb-keywords] button")].map(b => b.textContent);
	assert.deepEqual(terms(), ["Accidental Falls（2）", "Exercise Therapy（1）", "Patient Education as Topic（1）"], "workflow and check tags are not terms");
	assert.equal(doc.getElementById("zb-pc-kw-h").textContent, "這個分類的文獻常用、但問題卡還沒有的詞（3）");
	// A term written into the card leaves the list
	type(doc.getElementById("zb-pc-o"), "跌倒 accidental falls");
	assert.deepEqual(terms(), ["Exercise Therapy（1）", "Patient Education as Topic（1）"]);
	root.querySelector("[data-zb-keywords] button").click();
	assert.equal(env.copied.pop().text, "Exercise Therapy");
	type(doc.getElementById("zb-pc-i"), "exercise therapy, patient education as topic");
	assert.deepEqual(terms(), []);
	assert.equal(doc.getElementById("zb-pc-kw-h").hidden, true, "nothing left to suggest: the list hides");
	root.querySelector(".zb-cl-cancel").click();
	assert.equal(JSON.stringify(await running), '{"cancelled":true}');
	assert.deepEqual(env.errors, []);
});

const DL_NOTE = path.join(DOWNLOADS, "跌倒預防 PICO 表.md");

test("table window and export: the collection, its card, Downloads without a vault; 匯出 writes the note, the CSV and the HTML; 複製成表格 puts the table on the clipboard", async () => {
	let env = await setup();
	let { ZB } = env;
	let C = ZB.commands;
	ZB.pico.saveCard(env.collection, { type: "treatment", p: "65 歲以上住院病人 older inpatients", i: "護理師主導運動 nurse-led exercise", c: "常規照護 usual care", o: "跌倒發生率 falls", question: "Q?" });
	env.selection.collection = env.collection;
	let running = C.execute("pico-table", C.fromWindow(null, "toolbar"));
	let root = await openedDialog(env, "zb-pico-table");
	let doc = root.ownerDocument;
	assert.equal(doc.documentElement.getAttribute("title"), "匯出 PICO 表");
	assert.equal(root.querySelector(".zb-cl-title").textContent, "匯出 PICO 表");
	assert.match(root.querySelector(".zb-cl-lead").textContent, /核對由你做。不呼叫 AI/);
	assert.equal(root.querySelector("#zb-pt-what").textContent, "跌倒預防：3 篇文獻");
	assert.match(root.querySelector("#zb-pt-what + p").textContent, /^2 篇還沒有 AI 筆記的結構化資料/);
	assert.equal(root.querySelector(".zb-pt-question").textContent, "Q?");
	assert.deepEqual([...root.querySelectorAll(".zb-pt-card dt")].map(d => d.textContent), ["族群（P）", "介入（I）", "對照（C）", "結果（O）"]);
	assert.equal(root.querySelector(".zb-ge-path").textContent, DOWNLOADS, "Downloads without a vault or a folder in the settings");
	assert.match(root.textContent, /會寫入「跌倒預防 PICO 表\.md」；下載資料夾/);
	assert.equal(doc.getElementById("zb-pt-csv").checked, true);
	assert.equal(doc.getElementById("zb-pt-html").checked, true);
	assert.equal(doc.getElementById("zb-pt-notion").closest(".zb-ge-option").hidden, true, "no Notion configured");
	assert.equal(root.querySelector(".zb-cl-summary").textContent, "只寫入你電腦上的檔案。");
	env.answer = 1; // 複製成表格
	root.querySelector(".zb-cl-apply").click();
	let result = await running;
	assert.equal(result.dir, DOWNLOADS);
	assert.equal(result.items, 3);
	assert.equal(result.noData, 2);
	assert.equal(result.card, true);
	assert.deepEqual(filesIn(env, DOWNLOADS), ["跌倒預防 PICO 表.csv", "跌倒預防 PICO 表.html", "跌倒預防 PICO 表.md"]);
	let note = env.mem.files.get(DL_NOTE);
	assert.match(note, /^---\ntitle: "跌倒預防：PICO 表"\ntype: "pico-table"\nzotero_collection: "library\/collections\/COLL1"\n/);
	assert.match(note, /\npico_question: "Q\?"\n/);
	assert.match(note, /\nstudies: 3\nstudies_without_data: 2\n/);
	assert.match(note, /\ntags:\n {2}- "PICO"\n---\n\n# 跌倒預防：PICO 表\n\n%% zotero-bridge:start/);
	assert.match(note, /## 本題 PICO\n\n\*\*研究問題\*\*：Q\?/);
	assert.match(note, /檢索式（英文詞）：`"older inpatients" AND "nurse-led exercise" AND falls`/, "the comparison follows the search-links setting (off by default)");
	assert.match(note, /\| Lee, 2021 \| RCT，N = 120 \| 65 歲以上住院病人 \| 護理師主導跌倒預防運動 \| 常規照護 \| 跌倒發生率、跌倒自我效能 \| 跌倒率下降 30%（RR 0\.70）；自我效能提升 \| CEBM 2；JBI 1\.c \| 納入（CASP Checklist: For Randomised Controlled Trials \(RCTs\) \(2024\)） ［已核對］ \| P✓ I✓ C✓ O✓ \|/, "the verified form overrides the appraisal; 主要結果 from the AI note");
	assert.match(note, /\| 陳美玲，2023 \| （沒有 AI 筆記的結構化資料） \|/, "Chinese items cite the Chinese way (apa-zh.js)");
	assert.match(note, /## 沒有結構化資料的文獻\n\n- Smith, 2019\n- 陳美玲，2023\n/);
	assert.doesNotMatch(note, /\[\[/, "no wikilinks outside a vault");
	assert.match(note, /\n## ✍️ 我的筆記\n\n$/);
	let csv = env.mem.files.get(path.join(DOWNLOADS, "跌倒預防 PICO 表.csv"));
	assert.ok(csv.startsWith("﻿文獻,作者,年份"));
	assert.match(csv, /\r\n"Lee, 2021","Lee, Anna",2021,Nurse-led exercise and falls in hospital,Journal of Fall Research,10\.1000\/jfr\.2021\.1,RCT,120,內科病房,Taiwan,65 歲以上住院病人,/);
	assert.match(csv, /,納入,已核對,P✓ I✓ C✓ O✓,zotero:\/\/select\/library\/items\/KEY100\r\n/);
	let html = env.mem.files.get(path.join(DOWNLOADS, "跌倒預防 PICO 表.html"));
	assert.match(html, /^<!DOCTYPE html>\n<html lang="zh-TW">/);
	assert.match(html, /<td>Lee, 2021<\/td><td>RCT，N = 120<\/td>/);
	// The dialog after it: 打開資料夾 · 複製成表格 · 關閉; 複製成表格 copies the table as HTML and text
	let shown = env.confirms.pop();
	assert.equal(shown.title, "PICO 表");
	assert.deepEqual(shown.buttons, ["打開資料夾", "複製成表格", "關閉"]);
	assert.match(shown.text, /^已把 3 篇文獻整理成 PICO 表，寫到：\n\/home\/student\/Downloads\n/);
	assert.match(shown.text, /⚠ 2 篇沒有 AI 筆記的結構化資料/);
	assert.doesNotMatch(shown.text, /還沒有 PICO 問題卡/);
	let clip = env.copied.pop();
	assert.match(clip.html, /<p><b>研究問題<\/b>：Q\?<\/p>/);
	assert.match(clip.html, /<table[^>]*><tr><th>文獻<\/th>/);
	assert.match(clip.html, /<td>P✓ I✓ C✓ O✓<\/td>/);
	assert.match(clip.text, /^文獻\t研究設計\tP 族群/);
	assert.deepEqual(env.revealed, []);
	assert.equal(env.prefStore[P + "pico.folder"], undefined, "the default folder is not remembered");
	assert.deepEqual(env.errors, []);

	// Selected items (no collection name): 選取的文獻, the active collection's card still applies; 打開資料夾
	env.selection.items = [env.lee];
	env.answer = 0;
	running = C.execute("pico-table", C.fromWindow(null, "toolbar"));
	root = await openedDialog(env, "zb-pico-table", 2);
	assert.equal(root.querySelector("#zb-pt-what").textContent, "選取的文獻：1 篇文獻");
	assert.equal(root.querySelector(".zb-pt-question").textContent, "Q?", "the selected collection's card");
	root.querySelector(".zb-cl-apply").click();
	result = await running;
	assert.equal(result.action, "open");
	assert.deepEqual(env.revealed, [DOWNLOADS]);
	assert.ok(env.mem.files.has(path.join(DOWNLOADS, "選取的文獻 PICO 表.md")));
	assert.deepEqual(env.errors, []);
});

test("export into the vault: the Reviews folder, wikilinks to the notes, the managed block rewritten and the user's part kept; screened collections list the included studies; 取消 writes nothing", async () => {
	let env = await setup({ [P + "obsidian.vaultPath"]: VAULT, [P + "obsidian.folder"]: "Zotero" });
	let { ZB } = env;
	let C = ZB.commands;
	// A literature note in the vault for Lee, so the table links to it
	await env.mem.IOUtils.makeDirectory(path.join(VAULT, "Zotero"));
	env.mem.files.set(path.join(VAULT, "Zotero", "Lee 2021.md"), `---\nzotero_key: "library/${env.lee.key}"\n---\n# Lee\n`);
	// Screening started: Lee included at full text, 陳 excluded, the book not screened
	await ZB.screening.setDecision([env.lee], { stage: "ft", decision: "include" }, { silent: true });
	await ZB.screening.setDecision([env.chen], { stage: "ta", decision: "exclude" }, { silent: true });
	env.selection.collection = env.collection;
	let running = C.execute("pico-table", C.fromWindow(null, "toolbar"));
	let root = await openedDialog(env, "zb-pico-table");
	assert.equal(root.querySelector("#zb-pt-what").textContent, "跌倒預防：1 篇文獻");
	assert.match(root.querySelector("#zb-pt-what + p").textContent, /^篩選已開始，所以只列全文納入的 1 篇（分類共 3 篇）。 每篇都有 AI 筆記的結構化資料。$/);
	assert.ok(root.querySelector("[data-zb-no-card]"), "no card: says so");
	let reviews = path.join(VAULT, "Zotero", "Reviews");
	assert.equal(root.querySelector(".zb-ge-path").textContent, reviews);
	assert.match(root.textContent, /Obsidian vault 的 Reviews 資料夾/);
	root.querySelector(".zb-cl-apply").click();
	let result = await running;
	assert.equal(result.dir, reviews);
	assert.equal(result.card, false);
	let notePath = path.join(reviews, "跌倒預防 PICO 表.md");
	let note = env.mem.files.get(notePath);
	assert.match(note, /> 篩選已開始，所以只列全文納入的 1 篇（分類共 3 篇）。\n/);
	assert.match(note, /· CSV：`Zotero\/Reviews\/跌倒預防 PICO 表\.csv` · Word 版：`Zotero\/Reviews\/跌倒預防 PICO 表\.html`/);
	assert.match(note, /\| \[\[Zotero\/Lee 2021\\\|Lee, 2021\]\] \| RCT，N = 120 \|/, "a wikilink to the literature note");
	assert.doesNotMatch(note, /本題 PICO|對照本題/);
	assert.match(env.confirms.pop().text, /還沒有 PICO 問題卡/);
	// The user writes under 我的筆記; a card is made; the next export rewrites only the managed block
	env.mem.files.set(notePath, note + "我的想法：先讀 Lee。\n");
	ZB.pico.saveCard(env.collection, { p: "住院老人", i: "運動", o: "跌倒" });
	running = C.execute("pico-table", C.fromWindow(null, "toolbar"));
	root = await openedDialog(env, "zb-pico-table", 2);
	root.querySelector(".zb-cl-apply").click();
	await running;
	let again = env.mem.files.get(notePath);
	assert.match(again, /## 本題 PICO/);
	assert.match(again, /\npico_p: "住院老人"\n/);
	assert.match(again, /\| P？ I✓ O✓ \|/, "住院老人 shares one bigram of three with 65 歲以上住院病人 (not enough); 運動 and 跌倒 are contained");
	assert.match(again, /我的想法：先讀 Lee。\n$/);
	assert.equal((again.match(/%% zotero-bridge:start/g) || []).length, 1);
	// 取消 writes nothing
	let before = new Map(env.mem.files);
	running = C.execute("pico-table", C.fromWindow(null, "toolbar"));
	root = await openedDialog(env, "zb-pico-table", 3);
	root.querySelector(".zb-cl-cancel").click();
	assert.equal(JSON.stringify(await running), '{"cancelled":true}');
	assert.deepEqual([...env.mem.files.entries()], [...before.entries()]);
	assert.deepEqual(env.errors, []);
});

test("the PRISMA note carries 本題 PICO while the collection has a card and the feature is on", async () => {
	let env = await setup({ [P + "obsidian.vaultPath"]: VAULT, [P + "obsidian.folder"]: "Zotero" });
	let { ZB } = env;
	ZB.pico.saveCard(env.collection, { p: "住院老人 older inpatients", i: "運動 exercise", o: "跌倒 falls", question: "在住院老人中運動能減少跌倒嗎？" });
	let out = await ZB.screening.generateReport(env.collection);
	assert.ok(out && !out.errors.length, JSON.stringify(out && out.errors));
	let note = env.mem.files.get(path.join(VAULT, "Zotero", "Reviews", "跌倒預防.md"));
	assert.match(note, /\n## 本題 PICO\n\n\*\*研究問題\*\*：在住院老人中運動能減少跌倒嗎？\n/);
	assert.match(note, /\n## PRISMA 2020 計數\n/);
	assert.ok(note.indexOf("## 本題 PICO") < note.indexOf("## PRISMA 2020 計數"));
	ZB.features.setEnabled("pico", false);
	out = await ZB.screening.generateReport(env.collection);
	assert.ok(out && !out.errors.length);
	assert.doesNotMatch(env.mem.files.get(path.join(VAULT, "Zotero", "Reviews", "跌倒預防.md")), /本題 PICO/, "off: the card stays out of the PRISMA note");
	assert.deepEqual(env.errors, []);
});

test("the switch hides both commands; running them while off says so", async () => {
	let env = await setup({ [P + "feature.pico"]: false });
	let { ZB } = env;
	let C = ZB.commands;
	assert.equal(C.isVisible(C.get("pico-card")), false);
	assert.equal(C.isVisible(C.get("pico-table")), false);
	assert.equal(await ZB.pico.openCard(env.collection), null);
	assert.equal(await ZB.pico.exportTable([env.lee], { name: "x" }), null);
	assert.match(env.descriptions.join("\n"), /「PICO 問題卡與 PICO 表」目前關閉/);
	assert.equal(env.dialogs.length, 0);
	// Settings: the section follows the switch; its folder picker is wired
	let xhtml = fs.readFileSync(path.join(ROOT, "content", "preferences.xhtml"), "utf8");
	assert.match(xhtml, /<groupbox data-zb-section="pico" data-zb-feature="pico">/);
	assert.match(xhtml, /preference="extensions\.zotero-bridge\.pico\.folder"/);
	assert.match(fs.readFileSync(path.join(ROOT, "content", "preferences.js"), "utf8"), /async pickPicoFolder\(\)/);
	assert.deepEqual(env.errors, []);
});

test("GRADE window: suggested outcomes, the studies that measured one pre-ticked, hints, the live rating; 儲存並匯出 writes the note, CSV and HTML and copies the table", async () => {
	let env = await setup();
	let { ZB } = env;
	let C = ZB.commands;
	ZB.grade.runtime.now = () => new Date(2026, 9, 14, 9, 0);
	let notices = [];
	ZB.grade.runtime.notice = (info) => { notices.push(info); return "copy"; };
	ZB.grade.runtime.copy = (html, text) => env.copied.push({ html, text });
	assert.equal(C.isVisible(C.get("grade")), true, "on in 研究生引導");
	env.selection.collection = env.collection;
	let running = C.execute("grade", C.fromWindow(null, "toolbar"));
	let root = await openedDialog(env, "zb-grade");
	let doc = root.ownerDocument;
	assert.equal(doc.documentElement.getAttribute("title"), "GRADE 證據確定性");
	assert.ok(root.classList.contains("zb-classify") && root.classList.contains("zb-pico") && root.classList.contains("zb-grade"));
	assert.equal(root.querySelector(".zb-cl-title").textContent, "GRADE 證據確定性：跌倒預防");
	assert.match(root.textContent, /這個分類有 3 篇文獻/);
	assert.equal(root.querySelector(".zb-cl-apply").disabled, true, "nothing to export without an outcome");
	let chips = [...root.querySelectorAll("[data-zb-suggestions] button")].map(b => b.textContent);
	assert.deepEqual(chips, ["跌倒自我效能（1）", "跌倒發生率（1）"], "from the AI note's outcomes (ties by stroke count)");
	[...root.querySelectorAll("[data-zb-suggestions] button")].find(b => b.textContent.startsWith("跌倒發生率")).click();
	let sec = root.querySelector("[data-zb-outcome]");
	assert.ok(sec, "the outcome appears");
	let id = sec.getAttribute("data-zb-outcome");
	let ticked = [...sec.querySelectorAll("[data-zb-study]")].filter(b => b.checked).map(b => b.value);
	assert.deepEqual(ticked, [env.lee.key], "only the paper whose AI note measured it");
	let rating = () => sec.querySelector("[data-zb-rating]").textContent;
	assert.equal(rating(), "⊕⊕⊕⊕ 高（從「高」開始（隨機對照試驗），沒有升降級）");
	assert.match(sec.querySelector('[data-zb-hint="imprecision"]').textContent, /^提示：總樣本數約 120 人，少於 GRADE 的經驗法則/);
	assert.match(sec.querySelector('[data-zb-hint="rob"]').textContent, /1／1 篇有評讀結果/);
	assert.match(sec.querySelector('[data-zb-hint="inconsistency"]').textContent, /只有 1 篇研究/);
	assert.equal(sec.querySelector(".zb-gr-upgrades").hidden, true, "rating up only for observational evidence");
	// Rate down for imprecision: the rating follows, a reason is asked for
	let imp = doc.getElementById(`zb-gr-${id}-imprecision`);
	imp.value = "1";
	imp.dispatchEvent(new doc.defaultView.Event("change"));
	assert.equal(rating(), "⊕⊕⊕◯ 中（從「高」開始（隨機對照試驗）；不精確性 −1）");
	let checks = () => [...sec.querySelectorAll("[data-zb-checks] li")].map(li => li.textContent);
	assert.ok(checks().includes("不精確性降級了，寫一句理由（會成為表下的註腳）。"), JSON.stringify(checks()));
	type(doc.getElementById(`zb-gr-${id}-imprecision-reason`), "只有 1 篇、120 人");
	type(doc.getElementById(`zb-gr-${id}-effect`), "RR 0.70（95% CI 0.55–0.89）");
	assert.deepEqual(checks(), []);
	assert.equal(root.querySelector(".zb-cl-summary").textContent, "1 個結果指標都評好了。");
	// Observational start shows rating up
	let design = doc.getElementById(`zb-gr-${id}-design`);
	design.value = "obs";
	design.dispatchEvent(new doc.defaultView.Event("change"));
	assert.equal(sec.querySelector(".zb-gr-upgrades").hidden, false);
	assert.match(rating(), /^⊕◯◯◯ 極低/);
	design.value = "rct";
	design.dispatchEvent(new doc.defaultView.Event("change"));
	assert.deepEqual([...root.querySelectorAll("[data-zb-suggestions] button")].map(b => b.textContent), ["跌倒自我效能（1）"], "the added one leaves the suggestions");
	root.querySelector(".zb-cl-apply").click();
	let result = await running;
	assert.equal(result.action, "copy");
	assert.equal(result.saved.outcomes.length, 1);
	let stored = JSON.parse(env.prefStore[P + "grade.tables"]);
	assert.deepEqual(Object.keys(stored), [CARD_KEY], "kept per collection, like the PICO card");
	assert.equal(stored[CARD_KEY].outcomes[0].domains.imprecision.level, 1);
	assert.equal(stored[CARD_KEY].outcomes[0].updatedAt, undefined);
	let base = path.join(DOWNLOADS, "跌倒預防 GRADE 證據摘要");
	let note = env.mem.files.get(base + ".md");
	assert.match(note, /^---\ntitle: "跌倒預防：GRADE 證據摘要"\ntype: "grade"\n/);
	assert.match(note, /\| 跌倒發生率 \| 關鍵 \| 1 篇（1 RCT） \| 120 \| RR 0\.70（95% CI 0\.55–0\.89） \| ⊕⊕⊕◯ 中 a \|/);
	assert.match(note, /a\. 跌倒發生率：不精確性降 1 級。只有 1 篇、120 人/);
	assert.match(note, /## 納入研究的評讀/);
	assert.ok(env.mem.files.get(base + ".csv").startsWith("\ufeff結果指標,"));
	assert.match(env.mem.files.get(base + ".html"), /<h2>證據摘要表（Summary of Findings）<\/h2>/);
	assert.match(notices[0].text, /^已把 1 個結果指標的 GRADE 評等整理成證據摘要表，寫到：\n\/home\/student\/Downloads/);
	assert.match(env.copied.at(-1).html, /<td>⊕⊕⊕◯ 中 a<\/td>/);
	assert.match(env.copied.at(-1).text, /^結果指標\t重要性/);
	assert.ok(env.dialogs[0].closed);

	// Reopened: the saved outcome is there; 儲存 alone keeps changes without files; Esc changes nothing
	running = C.execute("grade", C.fromWindow(null, "toolbar"));
	root = await openedDialog(env, "zb-grade", 2);
	doc = root.ownerDocument;
	sec = root.querySelector("[data-zb-outcome]");
	assert.equal(doc.getElementById(`zb-gr-${id}-effect`).value, "RR 0.70（95% CI 0.55–0.89）");
	let imp2 = doc.getElementById(`zb-gr-${id}-imprecision`);
	assert.equal(imp2.value, "1");
	let importance = doc.getElementById(`zb-gr-${id}-importance`);
	importance.value = "important";
	importance.dispatchEvent(new doc.defaultView.Event("change"));
	root.querySelector(".zb-gr-save").click();
	result = await running;
	assert.equal(result.result, undefined, "儲存 writes no files");
	assert.equal(JSON.parse(env.prefStore[P + "grade.tables"])[CARD_KEY].outcomes[0].importance, "important");
	assert.match(env.descriptions.at(-1), /已儲存「跌倒預防」的 GRADE 評等/);
	running = C.execute("grade", C.fromWindow(null, "toolbar"));
	root = await openedDialog(env, "zb-grade", 3);
	root.querySelector(".zb-gr-remove").click();
	assert.equal(root.querySelector("[data-zb-outcome]"), null);
	root.dispatchEvent(new root.ownerDocument.defaultView.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
	assert.equal(JSON.stringify(await running), '{"cancelled":true}');
	assert.equal(JSON.parse(env.prefStore[P + "grade.tables"])[CARD_KEY].outcomes.length, 1, "Esc changed nothing");
	assert.deepEqual(env.errors, []);
});

test("GRADE into the vault: the Reviews folder; switched off it says so", async () => {
	let env = await setup({ [P + "obsidian.vaultPath"]: VAULT });
	let { ZB } = env;
	ZB.grade.runtime.notice = () => "close";
	let out = await ZB.grade.open(env.collection, {
		dialog: async (info) => {
			assert.equal(info.scopeName, "跌倒預防");
			assert.equal(info.studies.length, 3);
			assert.equal(info.studies.find(s => s.key === env.lee.key).design, "RCT");
			let o = ZB.grade.newOutcome("跌倒發生率", info.studies);
			return { table: { outcomes: [o] }, exportNow: true };
		},
	});
	assert.equal(out.action, "close");
	let note = env.mem.files.get(path.join(VAULT, "Reviews", "跌倒預防 GRADE 證據摘要.md"));
	assert.ok(note, [...env.mem.files.keys()].join("\n"));
	assert.match(note, /CSV：`Reviews\/跌倒預防 GRADE 證據摘要\.csv`/);
	ZB.features.setEnabled("grade", false);
	assert.equal(ZB.commands.isVisible(ZB.commands.get("grade")), false);
	assert.equal(await ZB.grade.open(env.collection), null);
	assert.match(env.descriptions.join("\n"), /「GRADE 證據確定性」目前關閉/);
	assert.deepEqual(env.errors, []);
});
