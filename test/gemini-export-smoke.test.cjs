// 匯出給 Gemini Notebook through the real plugin (bootstrap.js and every content script) in a mocked Zotero
// with an in-memory IOUtils: the command opens the export window (the real gemini-export.xhtml in jsdom), the
// options count the sources against the cap, 匯出 writes exactly the expected files (full text through the
// fulltext-md pipeline, the APA list, the README; the PDF and 我的劃線與評讀 only when ticked; a missing linked
// PDF is skipped with a note), the dialog after it offers 打開資料夾, 取消 and Esc write nothing, and the
// switch hides the command. With Google Drive for desktop on the (mocked) disk: the default folder is
// My Drive/ZotMax/Gemini Notebook with the sync badge, 改存到下載 switches, several accounts can be chosen, and
// the settings checkbox.
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
const PDF_PATH = "/zotero/storage/AAAA1111/lee2021.pdf";
const MISSING_PDF = "/linked/elsewhere/gone.pdf";

const HEAD = "Journal of Fall Research 2024;12:1–3";
// Zotero's PDF worker text: one paragraph per line, pages separated by \f (running head and page numbers to drop)
const FULL_TEXT = [
	[HEAD, "Nurse-led exercise and falls", "Abstract", "Falls are common among older adults in hospital.", "Introduction",
		"Exercise delivered by nurses may prevent falls in older inpatients.", "1"],
	[HEAD, "Methods", "We randomised 120 patients to a twelve week exercise interven- tion or usual care.", "Results",
		"The intervention reduced the rate of falls by thirty percent compared with usual care.", "2"],
	[HEAD, "Discussion", "Nurses can deliver structured exercise safely in hospital wards.", "3"],
].map(lines => lines.join("\n") + "\n\n").join("\f").trim();

/** An in-memory file system shaped like IOUtils (only what the export uses). */
function memoryFS(initial = {}) {
	let files = new Map(Object.entries(initial));
	let dirs = new Set(["/"]);
	let addDirs = (p) => {
		for (let d = path.dirname(p); !dirs.has(d); d = path.dirname(d)) dirs.add(d);
	};
	for (let p of files.keys()) addDirs(p);
	let writes = [];
	return {
		files, dirs, writes,
		IOUtils: {
			exists: async p => files.has(p) || dirs.has(p),
			makeDirectory: async (p) => {
				dirs.add(p);
				addDirs(p + "/x");
			},
			writeUTF8: async (p, text) => {
				assert.ok(dirs.has(path.dirname(p)), `write into an existing folder: ${p}`);
				files.set(p, String(text));
				writes.push(p);
			},
			readUTF8: async (p) => {
				if (!files.has(p)) throw new Error(`NotFoundError: ${p}`);
				return files.get(p);
			},
			copy: async (from, to) => {
				if (!files.has(from)) throw new Error(`NotFoundError: ${from}`);
				assert.ok(dirs.has(path.dirname(to)), `copy into an existing folder: ${to}`);
				files.set(to, files.get(from));
				writes.push(to);
			},
			getChildren: async p => [...files.keys(), ...dirs].filter(f => path.dirname(f) === p && f !== p),
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
	let mem = memoryFS({ [PDF_PATH]: "%PDF-1.7 fake" });

	class MockItem {
		constructor(type, fields = {}) {
			this.id = nextID++;
			this.key = fields.key || `KEY${this.id}`;
			this.itemType = type;
			this.libraryID = 1;
			this.deleted = false;
			this.parentID = null;
			this.fields = fields;
			this.children = [];
			this.annotations = [];
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
		get attachmentContentType() { return "application/pdf"; }
		get attachmentFilename() { return path.basename(this.fields.path || ""); }
		get attachmentText() { return Promise.resolve(this.fields.fulltext || ""); }
		async getFilePathAsync() { return this.fields.path && mem.files.has(this.fields.path) ? this.fields.path : false; }
		getField(f) { return this.fields[f] || ""; }
		getCreatorsJSON() { return this.fields.creators || []; }
		getTags() { return []; }
		getCollections() { return []; }
		getAttachments() { return this.children.filter(id => items.get(id).itemType === "attachment"); }
		getNotes() { return this.children.filter(id => items.get(id).itemType === "note"); }
		getAnnotations() { return this.annotations; }
		getNote() { return ""; }
	}

	function attach(parent, fields) {
		let att = new MockItem("attachment", Object.assign({ title: "Full Text PDF" }, fields));
		att.parentID = parent.id;
		parent.children.push(att.id);
		return att;
	}

	let prefStore = Object.assign({}, prefs);
	let mainWindow = {
		openDialog(url, name, features) {
			assert.equal(url, "chrome://zotero-bridge/content/gemini-export.xhtml");
			assert.match(features, /chrome/);
			let dom = new JSDOM(fs.readFileSync(path.join(ROOT, "content", "gemini-export.xhtml"), "utf8"), { contentType: "application/xml" });
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
		Styles: { get: () => null },
		File: { reveal: async (p) => { revealed.push(p); } },
		launchFile: (p) => { revealed.push(p); },
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
	let env = { context, Zotero, MockItem, attach, items, errors, descriptions, dialogs, confirms, revealed, mem, prefStore, selection, answer: 0 };
	return env;
}

async function setup(prefs = {}) {
	let env = makeEnv(Object.assign({ [P + "features.version"]: 5 }, prefs));
	await vm.runInContext(`startup({ id: "zotero-bridge@bobyu89.github.io", version: "0.0.0", rootURI: ${JSON.stringify(ROOT_URI)} })`, env.context);
	let ZB = env.context.ZB;
	ZB.geminiExport.runtime.now = () => new Date(2026, 9, 13, 9, 0);
	// A text PDF with highlights, a scanned Chinese paper (no text: the abstract), a book whose linked PDF is gone
	let lee = new env.MockItem("journalArticle", {
		title: "Nurse-led exercise and falls in hospital", shortTitle: "Nurse-led exercise and falls", year: "2021", date: "2021",
		creators: [{ lastName: "Lee", firstName: "Anna", creatorType: "author" }], publicationTitle: "Journal of Fall Research", DOI: "10.1000/jfr.2021.1",
		abstractNote: "Falls are common.", language: "en",
	});
	let leePDF = env.attach(lee, { path: PDF_PATH, fulltext: FULL_TEXT });
	leePDF.annotations = [
		{ key: "ANN1", annotationType: "highlight", annotationText: "The intervention reduced the rate of falls by thirty percent", annotationComment: "主要結果",
			annotationColor: "#ffd400", annotationPageLabel: "2", annotationSortIndex: "00001", getTags: () => [] },
	];
	let chen = new env.MockItem("journalArticle", {
		title: "護理人員跌倒預防衛教之成效", year: "2023", date: "2023", language: "zh",
		creators: [{ lastName: "陳", firstName: "美玲", creatorType: "author" }], publicationTitle: "護理雜誌", volume: "70", issue: "2", pages: "45-56",
		abstractNote: "目的：探討跌倒預防衛教的成效。",
	});
	env.attach(chen, { path: "/zotero/storage/BBBB2222/scan.pdf", fulltext: "" });
	env.mem.files.set("/zotero/storage/BBBB2222/scan.pdf", "%PDF scan");
	let book = new env.MockItem("book", { title: "Nursing research methods", year: "2019", date: "2019", creators: [{ lastName: "Smith", firstName: "John", creatorType: "author" }] });
	env.attach(book, { path: MISSING_PDF, fulltext: "" });
	let collection = { id: 7, name: "跌倒預防", libraryID: 1 };
	ZB.adapter.itemsInCollection = c => (c === collection ? [lee, chen, book] : []);
	return Object.assign(env, { ZB, lee, chen, book, collection });
}

/** The export window once it is drawn. */
async function openedDialog(env, count = 1) {
	for (let i = 0; i < 400; i++) {
		let win = env.dialogs[count - 1];
		if (win && win.document.querySelector(".zb-cl-apply")) return win.document.getElementById("zb-gemini");
		await new Promise(r => setTimeout(r, 5));
	}
	throw new Error("the export window never opened");
}

function filesIn(env, dir) {
	return [...env.mem.files.keys()].filter(p => path.dirname(p) === dir).map(p => path.basename(p)).sort();
}

const EXPORT_DIR = path.join(DOWNLOADS, "Gemini Notebook - 跌倒預防 - 2026-10-13");

test("export window: the collection, Downloads by default, both options off, the source count against the cap; 匯出 writes the folder", async () => {
	let env = await setup();
	let { ZB } = env;
	let C = ZB.commands;
	ZB.features.setEnabled("geminiExport", true);
	env.selection.collection = env.collection;
	let running = C.execute("gemini-export", C.fromWindow(null, "toolbar"));
	let root = await openedDialog(env);
	let doc = root.ownerDocument;
	assert.equal(doc.documentElement.getAttribute("title"), "匯出給 Gemini Notebook");
	assert.ok(root.classList.contains("zb-classify"), "borrows the review window's stylesheet");
	assert.equal(root.querySelector(".zb-cl-title").textContent, "匯出給 Gemini Notebook");
	assert.match(root.querySelector(".zb-cl-lead").textContent, /不會上傳任何東西/);
	assert.equal(root.querySelector("#zb-ge-what").textContent, "跌倒預防：3 篇文獻");
	assert.equal(root.querySelector(".zb-ge-path").textContent, DOWNLOADS, "Downloads when nothing is remembered");
	assert.match(root.textContent, /會在這裡建立「Gemini Notebook - 跌倒預防 - 2026-10-13」資料夾。/);
	let pdf = doc.getElementById("zb-ge-pdf");
	let mine = doc.getElementById("zb-ge-highlights");
	assert.equal(pdf.checked, false, "PDFs off by default (they double the sources)");
	assert.equal(mine.checked, false);
	assert.match(doc.querySelector('label[for="zb-ge-pdf"]').textContent, /2 篇有 PDF 檔/, "the gone linked file is not counted");
	assert.ok(doc.getElementById(pdf.getAttribute("aria-describedby")), "the hint describes the checkbox");
	let cap = root.querySelector(".zb-ge-cap");
	assert.equal(cap.getAttribute("role"), "status");
	assert.equal(cap.textContent, "會產生 4 個來源檔案；Gemini Notebook 每本筆記本約 50 個來源（依方案而異）。");
	// Ticking changes the count; a low cap says so in words (and in Ink, 600)
	pdf.click();
	mine.click();
	assert.match(cap.textContent, /^會產生 7 個來源檔案；/);
	assert.equal(cap.classList.contains("zb-ge-over"), false);
	pdf.click();
	root.querySelector(".zb-cl-apply").click();
	let result = await running;
	assert.equal(result.dir, EXPORT_DIR);
	assert.deepEqual(filesIn(env, EXPORT_DIR), [
		"00 參考文獻（APA 7）.md", "01 我的劃線與評讀.md", "Lee 2021 - Nurse-led exercise and falls.md", "README - 如何加入 Gemini Notebook.txt",
		"Smith 2019 - Nursing research methods.md", "陳 2023 - 護理人員跌倒預防衛教之成效.md",
	], "Markdown, the lists and the README; no PDF without the tick");
	// The full text went through fulltext-md: no running head, no page numbers, hyphenation joined
	let lee = env.mem.files.get(path.join(EXPORT_DIR, "Lee 2021 - Nurse-led exercise and falls.md"));
	assert.match(lee, /^# Nurse-led exercise and falls in hospital\n/);
	assert.match(lee, /^- DOI：https:\/\/doi\.org\/10\.1000\/jfr\.2021\.1$/m);
	assert.match(lee, /twelve week exercise intervention or usual care/);
	assert.doesNotMatch(lee, /Journal of Fall Research 2024;12/);
	assert.doesNotMatch(lee, /==|🟡/, "plain text, no highlight marks");
	let chen = env.mem.files.get(path.join(EXPORT_DIR, "陳 2023 - 護理人員跌倒預防衛教之成效.md"));
	assert.match(chen, /PDF 是掃描檔、沒有文字層，所以這裡只有摘要/);
	assert.match(chen, /目的：探討跌倒預防衛教的成效。/);
	let refs = env.mem.files.get(path.join(EXPORT_DIR, "00 參考文獻（APA 7）.md"));
	assert.match(refs, /跌倒預防・3 篇・ZotMax 匯出於 2026-10-13/);
	assert.match(refs, /^陳美玲（2023）。護理人員跌倒預防衛教之成效。\*護理雜誌，70\*\(2\)，45–56。$/m, "Chinese APA 7 from apa-zh.js, first");
	let mineText = env.mem.files.get(path.join(EXPORT_DIR, "01 我的劃線與評讀.md"));
	assert.match(mineText, /不是論文原文，也不是 AI 寫的/);
	assert.match(mineText, /「The intervention reduced the rate of falls by thirty percent」（p\. 2）\n {2}- 我的註記：主要結果/);
	let readme = env.mem.files.get(path.join(EXPORT_DIR, "README - 如何加入 Gemini Notebook.txt"));
	assert.match(readme, /notebook\.google\.com/);
	assert.match(readme, /共 5 個檔案要上傳/);
	// The dialog after it: what was written, the notes, 打開資料夾 (the default) opens the folder
	let shown = env.confirms.pop();
	assert.equal(shown.title, "匯出給 Gemini Notebook");
	assert.deepEqual(shown.buttons, ["打開資料夾", "關閉"]);
	assert.match(shown.text, /已匯出 3 篇文獻到：/);
	assert.match(shown.text, /1 篇的 PDF 是掃描檔/);
	assert.match(shown.text, /沒有上傳任何東西/);
	assert.deepEqual(env.revealed, [EXPORT_DIR]);
	// The options are remembered; the default folder is not (it is worked out again next time)
	assert.equal(env.prefStore[P + "geminiExport.folder"], undefined);
	assert.equal(env.prefStore[P + "geminiExport.copyPDF"], false);
	assert.equal(env.prefStore[P + "geminiExport.highlights"], true);
	assert.deepEqual(env.errors, []);
});

test("also copy PDFs: the local PDF is copied under the same name, the missing linked file is skipped with a note; a second export gets its own folder", async () => {
	let env = await setup();
	let { ZB } = env;
	ZB.features.setEnabled("geminiExport", true);
	env.answer = 1;
	let shown = null;
	let result = await ZB.geminiExport.run([env.lee, env.chen, env.book], { name: "" }, {
		dialog: async (info) => {
			shown = info;
			return { folder: "/exports", copyPDF: true, highlights: false };
		},
	});
	assert.equal(shown.scopeName, "選取的文獻");
	assert.equal(shown.pdfs, 2);
	let dir = "/exports/Gemini Notebook - 選取的文獻 - 2026-10-13";
	assert.equal(result.dir, dir);
	assert.deepEqual(filesIn(env, dir), [
		"00 參考文獻（APA 7）.md", "Lee 2021 - Nurse-led exercise and falls.md", "Lee 2021 - Nurse-led exercise and falls.pdf", "README - 如何加入 Gemini Notebook.txt",
		"Smith 2019 - Nursing research methods.md", "陳 2023 - 護理人員跌倒預防衛教之成效.md", "陳 2023 - 護理人員跌倒預防衛教之成效.pdf",
	]);
	assert.equal(env.mem.files.get(path.join(dir, "Lee 2021 - Nurse-led exercise and falls.pdf")), "%PDF-1.7 fake", "a copy of the stored file");
	assert.deepEqual(plain(result.missingPDF), ["Nursing research methods"]);
	assert.equal(result.sources, 6, "4 Markdown + 2 PDF");
	assert.match(env.confirms.pop().text, /1 篇的 PDF 找不到檔案（連結的檔案可能搬走了），沒有複製：「Nursing research methods」/);
	assert.deepEqual(env.revealed, [], "關閉 opens nothing");
	assert.match(env.mem.files.get(path.join(dir, "README - 如何加入 Gemini Notebook.txt")), /這次匯出的備註\n- /);
	// Again on the same day: a new folder, nothing overwritten
	let again = await ZB.geminiExport.run([env.lee], {}, { dialog: async () => ({ folder: "/exports", copyPDF: false, highlights: false }) });
	assert.equal(again.dir, dir + " (2)");
	assert.deepEqual(env.errors, []);
});

test("over the cap: the window and the dialog after it say so; 取消, Esc and closing the window write nothing", async () => {
	let env = await setup({ [P + "geminiExport.cap"]: "3" });
	let { ZB } = env;
	ZB.features.setEnabled("geminiExport", true);
	let C = ZB.commands;
	env.selection.items = [env.lee, env.chen, env.book];
	let running = C.execute("gemini-export", C.fromWindow(null, "toolbar"));
	let root = await openedDialog(env);
	let cap = root.querySelector(".zb-ge-cap");
	assert.match(cap.textContent, /會產生 4 個來源檔案，超過上限 3 個/);
	assert.equal(cap.classList.contains("zb-ge-over"), true);
	assert.equal(root.querySelector("#zb-ge-what").textContent, "選取的文獻：3 篇文獻");
	root.querySelector(".zb-cl-cancel").click();
	assert.deepEqual(plain(await running), { cancelled: true });
	assert.deepEqual(env.mem.writes, []);
	// Esc
	running = C.execute("gemini-export", C.fromWindow(null, "toolbar"));
	root = await openedDialog(env, 2);
	root.dispatchEvent(new root.ownerDocument.defaultView.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
	assert.deepEqual(plain(await running), { cancelled: true });
	assert.deepEqual(env.mem.writes, []);
	// Over the cap after the export
	let result = await ZB.geminiExport.run([env.lee, env.chen, env.book], {}, { dialog: async () => ({ folder: "/x", copyPDF: false, highlights: false }) });
	assert.equal(result.over, true);
	assert.match(env.confirms.pop().text, /超過 3 個來源的上限/);
	assert.deepEqual(env.errors, []);
});

test("switched off: no command, a click from elsewhere says where to turn it on; nothing selected says what to select", async () => {
	let env = await setup();
	let { ZB } = env;
	let C = ZB.commands;
	assert.equal(C.isVisible(C.get("gemini-export")), false, "off in 研究生引導");
	assert.equal(await ZB.geminiExport.run([env.lee]), null);
	assert.match(env.descriptions.pop(), /「匯出給 Gemini Notebook」目前關閉/);
	ZB.features.setEnabled("geminiExport", true);
	assert.equal(C.isVisible(C.get("gemini-export")), true);
	assert.equal(await ZB.geminiExport.run([]), null);
	assert.equal(env.descriptions.pop(), "請先選取文獻，或在分類上按右鍵。");
	assert.deepEqual(env.dialogs, []);
	assert.deepEqual(env.mem.writes, []);
	assert.deepEqual(env.errors, []);
});

function plain(v) {
	return JSON.parse(JSON.stringify(v));
}

// ---------- Google Drive for desktop ----------

const HOME = "/Users/student";
const MY_DRIVE = `${HOME}/Library/CloudStorage/GoogleDrive-student@gmail.com/My Drive`;
const DRIVE_DEST = `${MY_DRIVE}/ZotMax/Gemini Notebook`;

/** Folders on the in-memory disk (Drive's own folders), with their parents. */
function addDirs(env, ...dirs) {
	for (let d of dirs) {
		for (let p = d; p !== "/"; p = path.dirname(p)) env.mem.dirs.add(p);
	}
}

async function driveSetup(prefs = {}, dirs = [MY_DRIVE]) {
	let env = await setup(prefs);
	env.ZB.geminiExport.runtime.system = () => ({ platform: "mac", home: HOME });
	addDirs(env, ...dirs);
	env.ZB.features.setEnabled("geminiExport", true);
	env.selection.collection = env.collection;
	return env;
}

test("Drive found: the window defaults to My Drive/ZotMax/Gemini Notebook with the sync badge; 匯出 creates the folders and the README says to add from Google Drive", async () => {
	let env = await driveSetup();
	let C = env.ZB.commands;
	let running = C.execute("gemini-export", C.fromWindow(null, "toolbar"));
	let root = await openedDialog(env);
	let doc = root.ownerDocument;
	assert.equal(root.querySelector(".zb-ge-path").textContent, DRIVE_DEST);
	let box = root.querySelector(".zb-ge-drive");
	assert.equal(box.hidden, false);
	assert.equal(root.querySelector(".zb-ge-badge").textContent, "這個資料夾會同步到 Google 雲端硬碟");
	assert.match(root.querySelector(".zb-ge-drive-hint").textContent, /雲端硬碟要一點時間才會同步完成.*「新增來源」→「Google 雲端硬碟」/);
	assert.equal(root.querySelector(".zb-ge-account").hidden, true, "one account: no choice");
	let toggle = doc.querySelector(".zb-ge-switch");
	assert.equal(toggle.textContent, "改存到下載");
	assert.equal(env.mem.dirs.has(path.join(MY_DRIVE, "ZotMax")), false, "nothing is created before 匯出");
	root.querySelector(".zb-cl-apply").click();
	let result = await running;
	let dir = path.join(DRIVE_DEST, "Gemini Notebook - 跌倒預防 - 2026-10-13");
	assert.equal(result.dir, dir);
	assert.equal(result.drivePath, "ZotMax/Gemini Notebook/Gemini Notebook - 跌倒預防 - 2026-10-13");
	assert.ok(filesIn(env, dir).includes("README - 如何加入 Gemini Notebook.txt"));
	let readme = env.mem.files.get(path.join(dir, "README - 如何加入 Gemini Notebook.txt"));
	assert.match(readme, /「新增來源」→「Google 雲端硬碟」，找到 我的雲端硬碟 › ZotMax › Gemini Notebook › Gemini Notebook - 跌倒預防 - 2026-10-13/);
	assert.match(readme, /不會自動更新/);
	let shown = env.confirms.pop();
	assert.match(shown.text, /這個資料夾在 Google 雲端硬碟裡/);
	assert.match(shown.text, /「新增來源」→「Google 雲端硬碟」→ 找到 ZotMax › Gemini Notebook › Gemini Notebook - 跌倒預防 - 2026-10-13/);
	assert.equal(env.prefStore[P + "geminiExport.folder"], undefined, "the default is not remembered as a choice");
	assert.deepEqual(env.errors, []);
});

test("改存到下載 switches to Downloads (the badge goes, the upload steps stay); 改存到 Google 雲端硬碟 switches back", async () => {
	let env = await driveSetup();
	let C = env.ZB.commands;
	let running = C.execute("gemini-export", C.fromWindow(null, "toolbar"));
	let root = await openedDialog(env);
	let toggle = root.querySelector(".zb-ge-switch");
	toggle.click();
	assert.equal(root.querySelector(".zb-ge-path").textContent, DOWNLOADS);
	assert.equal(root.querySelector(".zb-ge-drive").hidden, true);
	assert.equal(toggle.textContent, "改存到 Google 雲端硬碟");
	toggle.click();
	assert.equal(root.querySelector(".zb-ge-path").textContent, DRIVE_DEST);
	assert.equal(root.querySelector(".zb-ge-drive").hidden, false);
	toggle.click();
	root.querySelector(".zb-cl-apply").click();
	let result = await running;
	assert.equal(result.dir, EXPORT_DIR);
	assert.equal(result.drivePath, "");
	assert.match(env.mem.files.get(path.join(EXPORT_DIR, "README - 如何加入 Gemini Notebook.txt")), /「新增來源」→「上傳檔案」/);
	assert.match(env.confirms.pop().text, /「新增來源」→「上傳檔案」/);
	assert.equal(env.prefStore[P + "geminiExport.folder"], undefined, "a quick switch is for this export only");
	assert.equal(env.mem.dirs.has(path.join(MY_DRIVE, "ZotMax")), false, "nothing written into Drive");
	assert.deepEqual(env.errors, []);
});

test("several Drive accounts: the first by default, the window says which and offers the others", async () => {
	let work = `${HOME}/Library/CloudStorage/GoogleDrive-work@hospital.org/我的雲端硬碟`;
	let env = await driveSetup({}, [MY_DRIVE, work]);
	let C = env.ZB.commands;
	let running = C.execute("gemini-export", C.fromWindow(null, "toolbar"));
	let root = await openedDialog(env);
	let doc = root.ownerDocument;
	assert.equal(root.querySelector(".zb-ge-path").textContent, DRIVE_DEST);
	let row = root.querySelector(".zb-ge-account");
	assert.equal(row.hidden, false);
	assert.match(row.textContent, /偵測到 2 個 Google 雲端硬碟帳號/);
	let select = doc.getElementById("zb-ge-account");
	assert.deepEqual([...select.options].map(o => o.textContent), ["student@gmail.com", "work@hospital.org"]);
	assert.equal(select.value, "0");
	select.value = "1";
	select.dispatchEvent(new doc.defaultView.Event("change"));
	assert.equal(root.querySelector(".zb-ge-path").textContent, `${work}/ZotMax/Gemini Notebook`);
	// To Downloads and back keeps the account
	root.querySelector(".zb-ge-switch").click();
	root.querySelector(".zb-ge-switch").click();
	assert.equal(root.querySelector(".zb-ge-path").textContent, `${work}/ZotMax/Gemini Notebook`);
	root.querySelector(".zb-cl-apply").click();
	let result = await running;
	assert.equal(result.dir, `${work}/ZotMax/Gemini Notebook/Gemini Notebook - 跌倒預防 - 2026-10-13`);
	assert.equal(result.drivePath, "ZotMax/Gemini Notebook/Gemini Notebook - 跌倒預防 - 2026-10-13");
	assert.deepEqual(env.errors, []);
});

test("precedence in Zotero: a picked folder wins and is remembered; preferDrive off means Downloads; no Drive means Downloads and no badge", async () => {
	// A folder the user chose before (it exists): it wins, and Drive is offered as a switch
	let env = await driveSetup({ [P + "geminiExport.folder"]: "/exports" }, [MY_DRIVE, "/exports"]);
	let dest = await env.ZB.geminiExport.destination();
	assert.deepEqual({ folder: dest.folder, source: dest.source }, { folder: "/exports", source: "saved" });
	assert.equal(dest.drive.path, MY_DRIVE);
	let C = env.ZB.commands;
	let running = C.execute("gemini-export", C.fromWindow(null, "toolbar"));
	let root = await openedDialog(env);
	assert.equal(root.querySelector(".zb-ge-drive").hidden, true);
	assert.equal(root.querySelector(".zb-ge-switch").textContent, "改存到 Google 雲端硬碟");
	root.querySelector(".zb-cl-cancel").click();
	await running;
	// Downloads remembered by 0.17 is not a choice: Drive first
	env = await driveSetup({ [P + "geminiExport.folder"]: DOWNLOADS }, [MY_DRIVE, DOWNLOADS]);
	assert.equal((await env.ZB.geminiExport.destination()).source, "drive");
	// Switched off in the settings
	env = await driveSetup({ [P + "geminiExport.preferDrive"]: false });
	dest = await env.ZB.geminiExport.destination();
	assert.deepEqual({ folder: dest.folder, source: dest.source, drive: dest.drive }, { folder: DOWNLOADS, source: "downloads", drive: null });
	// No Drive on this computer
	env = await driveSetup({}, []);
	running = env.ZB.commands.execute("gemini-export", env.ZB.commands.fromWindow(null, "toolbar"));
	root = await openedDialog(env);
	assert.equal(root.querySelector(".zb-ge-path").textContent, DOWNLOADS);
	assert.equal(root.querySelector(".zb-ge-drive").hidden, true);
	assert.equal(root.querySelector(".zb-ge-switch").closest(".zb-ge-row").hidden, true, "no switch without Drive");
	root.querySelector(".zb-cl-cancel").click();
	await running;
	// A folder picked with 選擇資料夾… is remembered
	let G = env.ZB.geminiExport;
	let result = await G.run([env.lee], {}, { dialog: async () => ({ folder: "/picked", copyPDF: false, highlights: false, remember: true }), notice: () => "close" });
	assert.equal(result.dir, "/picked/Gemini Notebook - 選取的文獻 - 2026-10-13");
	assert.equal(env.prefStore[P + "geminiExport.folder"], "/picked");
	assert.deepEqual(env.errors, []);
});

test("settings: 「偵測到 Google 雲端硬碟時，預設匯出到雲端硬碟」 in the Gemini Notebook section, on by default, in both languages", () => {
	let xhtml = fs.readFileSync(path.join(ROOT, "content", "preferences.xhtml"), "utf8");
	let XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
	let { window } = new JSDOM(`<box xmlns="${XUL}" xmlns:html="http://www.w3.org/1999/xhtml">${xhtml}</box>`, { contentType: "application/xml" });
	let section = window.document.querySelector('groupbox[data-zb-section="geminiNotebook"]');
	let box = section.querySelector("#zb-gemini-prefer-drive");
	assert.equal(box.localName, "checkbox");
	assert.equal(box.getAttribute("label"), "偵測到 Google 雲端硬碟時，預設匯出到雲端硬碟");
	assert.equal(box.getAttribute("preference"), "extensions.zotero-bridge.geminiExport.preferDrive");
	let ftl = locale => fs.readFileSync(path.join(ROOT, "locale", locale, "zotero-bridge.ftl"), "utf8");
	assert.match(ftl("zh-TW"), new RegExp(`^${box.getAttribute("data-l10n-id")} =\\n {4}\\.label = 偵測到 Google 雲端硬碟時，預設匯出到雲端硬碟$`, "m"));
	assert.match(ftl("en-US"), new RegExp(`^${box.getAttribute("data-l10n-id")} =\\n {4}\\.label = .*Google Drive`, "m"));
	assert.match(section.textContent, /新增來源」→「Google 雲端硬碟」/);
	assert.match(fs.readFileSync(path.join(ROOT, "prefs.js"), "utf8"), /pref\("extensions\.zotero-bridge\.geminiExport\.preferDrive", true\);/);
});

test("export window: a folder picked with 選擇資料夾… is remembered, a quick switch is not", async () => {
	const G = require("../content/gemini-export.js");
	let { window } = new JSDOM("<div id='r'></div>");
	let doc = window.document;
	let chosen = [];
	let draw = () => G.renderDialog(doc, doc.getElementById("r"), {
		scopeName: "x", titles: ["a"], folder: DRIVE_DEST, folderName: "f", pdfs: 0, cap: 50, downloads: DOWNLOADS,
		drive: { path: MY_DRIVE, account: "student@gmail.com", candidates: [{ path: MY_DRIVE, account: "student@gmail.com" }] },
	}, { onExport: c => chosen.push(c), onCancel: () => {}, pickFolder: async () => `${MY_DRIVE}/Thesis` });
	let ui = draw();
	ui.buttons.pick.click();
	await new Promise(r => setTimeout(r, 0));
	assert.equal(doc.querySelector(".zb-ge-path").textContent, `${MY_DRIVE}/Thesis`);
	assert.equal(doc.querySelector(".zb-ge-drive").hidden, false, "a picked folder inside Drive gets the badge too");
	ui.buttons.go.click();
	assert.deepEqual(plain(chosen.pop()), { folder: `${MY_DRIVE}/Thesis`, copyPDF: false, highlights: false, remember: true });
	ui = draw();
	ui.buttons.pick.click();
	await new Promise(r => setTimeout(r, 0));
	ui.buttons.toggle.click();
	ui.buttons.go.click();
	assert.deepEqual(plain(chosen.pop()), { folder: DOWNLOADS, copyPDF: false, highlights: false, remember: false });
	assert.equal(ui.buttons.toggle.disabled, true, "a decision disables the switch");
});
