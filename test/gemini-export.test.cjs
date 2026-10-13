// 匯出給 Gemini Notebook (content/gemini-export.js), the pure parts: folder and file names (sanitizing,
// Chinese titles, duplicates), the source count against the cap, each item's Markdown, the reference list
// through the APA module, the highlights file only with something in it, the README and the notes; Google Drive
// for desktop detection (macOS, Windows, localized names, several accounts), the destination precedence and the
// README and dialog text for an export into Drive.
const test = require("node:test");
const assert = require("node:assert/strict");

const G = require("../content/gemini-export.js");
const apaZh = require("../content/apa-zh.js");

const DATE = new Date(2026, 9, 13, 9, 30);

const english = {
	key: "EN1", title: "Exercise and falls: a randomized trial", shortTitle: "Exercise and falls", year: "2021",
	creators: [{ lastName: "Lee", firstName: "Anna", creatorType: "author" }, { lastName: "陳", firstName: "美玲", creatorType: "author" }],
	publication: "Geriatric Nursing", volume: "42", issue: "3", pages: "100-110", doi: "10.1016/j.gerinurse.2021.01.001",
	apa: "Lee, A., & 陳美玲. (2021). Exercise and falls: a randomized trial. Geriatric Nursing, 42(3), 100–110.",
	apaMarkdown: "Lee, A., & 陳美玲. (2021). Exercise and falls: a randomized trial. *Geriatric Nursing, 42*(3), 100–110.",
	language: "en", attachments: [],
};
const chinese = {
	key: "ZH1", title: "護理人員跌倒預防衛教之成效：準實驗研究", year: "2023", language: "zh",
	creators: [{ lastName: "陳", firstName: "美玲", creatorType: "author" }, { name: "林小華", creatorType: "author" }],
	publication: "護理雜誌", volume: "70", issue: "2", pages: "45-56", doi: "https://doi.org/10.6224/JN.202304_70(2).07",
	apa: "陳美玲、林小華（2023）。護理人員跌倒預防衛教之成效：準實驗研究。護理雜誌，70(2)，45–56。",
	apaMarkdown: "陳美玲、林小華（2023）。護理人員跌倒預防衛教之成效：準實驗研究。*護理雜誌，70*(2)，45–56。",
	attachments: [],
};

test("folder name: Gemini Notebook - <collection or 選取的文獻> - <date>, safe on every file system", () => {
	assert.equal(G.dateStamp(DATE), "2026-10-13");
	assert.equal(G.folderName("跌倒預防", DATE), "Gemini Notebook - 跌倒預防 - 2026-10-13");
	assert.equal(G.folderName("", DATE), "Gemini Notebook - 選取的文獻 - 2026-10-13");
	assert.equal(G.folderName("  ", DATE), "Gemini Notebook - 選取的文獻 - 2026-10-13");
	// Characters Windows and macOS refuse, and a trailing dot
	assert.equal(G.folderName('A/B: "C"?*<>|.', DATE), "Gemini Notebook - A B C - 2026-10-13");
	let long = G.folderName("很長的分類名稱".repeat(20), DATE);
	assert.ok(long.length <= 120, long);
	assert.match(long, /- 2026-10-13$/, "the date survives a long name");
});

test("file names: Author Year - Short title, Chinese titles kept, unsafe characters removed, duplicates numbered", () => {
	assert.equal(G.baseName(english), "Lee 2021 - Exercise and falls");
	assert.equal(G.baseName(chinese), "陳 2023 - 護理人員跌倒預防衛教之成效：準實驗研究");
	assert.equal(G.baseName({ title: "What? A/B test: <yes>", year: "2020", creators: [] }), "2020 - What A B test yes");
	assert.equal(G.baseName({ title: "", creators: [] }), "Untitled");
	let longTitle = { title: "長".repeat(200), year: "2020", creators: [{ lastName: "王", creatorType: "author" }] };
	assert.ok(G.baseName(longTitle).length <= 80);
	// Two items with the same name (case-insensitive), and the list files' names are never taken
	let names = G.uniqueBaseNames([english, Object.assign({}, english, { shortTitle: "EXERCISE AND FALLS" }), english, chinese]);
	assert.deepEqual(names, ["Lee 2021 - Exercise and falls", "Lee 2021 - EXERCISE AND FALLS (2)", "Lee 2021 - Exercise and falls (3)", "陳 2023 - 護理人員跌倒預防衛教之成效：準實驗研究"]);
	let reserved = G.uniqueBaseNames([{ title: "00 參考文獻（APA 7）", creators: [] }], ["00 參考文獻（APA 7）"]);
	assert.deepEqual(reserved, ["00 參考文獻（APA 7） (2)"]);
});

test("cap: one source per Markdown, the reference list, the highlights file and each PDF only when copied", () => {
	assert.equal(G.sourceCount({ items: 10 }), 11);
	assert.equal(G.sourceCount({ items: 10, highlights: true }), 12);
	assert.equal(G.sourceCount({ items: 10, pdfs: 8, copyPDF: false }), 11, "PDFs not copied are not sources");
	assert.equal(G.sourceCount({ items: 10, pdfs: 8, copyPDF: true, highlights: true }), 20);
	assert.deepEqual(G.capCheck({ items: 49 }, 50), { count: 50, cap: 50, over: false });
	assert.deepEqual(G.capCheck({ items: 50 }, 50), { count: 51, cap: 50, over: true });
	assert.deepEqual(G.capCheck({ items: 30, pdfs: 30, copyPDF: true }, "50"), { count: 61, cap: 50, over: true }, "the pref is a string");
	assert.equal(G.capCheck({ items: 60 }, "").cap, 50, "an empty or broken cap falls back to 50");
	assert.equal(G.capCheck({ items: 60 }, "-3").cap, 50);
	assert.match(G.capText(G.capCheck({ items: 5 }, 50)), /^會產生 6 個來源檔案；Gemini Notebook 每本筆記本約 50 個來源（依方案而異）。$/);
	let over = G.capText(G.capCheck({ items: 60 }, 50));
	assert.match(over, /超過上限 50 個/);
	assert.match(over, /不要勾「也複製 PDF」/);
});

test("item Markdown: the bibliographic head, then the full text; the abstract when there is none, with the reason", () => {
	let md = G.itemMarkdown(english, { kind: "fulltext", md: "## Methods\n\nWe randomised 120 residents." });
	let lines = md.split("\n");
	assert.equal(lines[0], "# Exercise and falls: a randomized trial");
	assert.match(md, /^- 作者：Lee, Anna、陳美玲$/m, "Chinese names in full (core.authorNames)");
	assert.match(md, /^- 年份：2021$/m);
	assert.match(md, /^- 出處：Geriatric Nursing, 42\(3\), 100-110$/m);
	assert.match(md, /^- DOI：https:\/\/doi\.org\/10\.1016\/j\.gerinurse\.2021\.01\.001$/m);
	assert.match(md, /^- APA 7：Lee, A\., & 陳美玲\. \(2021\)\. .*\*Geriatric Nursing, 42\*\(3\)/m);
	assert.match(md, /引用前請對照原文 PDF/);
	assert.match(md, /## Methods\n\nWe randomised 120 residents\.\n$/);
	// A DOI written as a URL is not doubled
	assert.match(G.itemMarkdown(chinese, { kind: "fulltext", md: "內文" }), /^- DOI：https:\/\/doi\.org\/10\.6224\/JN\.202304_70\(2\)\.07$/m);
	let scanned = G.itemMarkdown(chinese, { kind: "abstract", md: "目的：探討衛教成效。", reason: "scanned" });
	assert.match(scanned, /^# 護理人員跌倒預防衛教之成效：準實驗研究$/m);
	assert.match(scanned, /PDF 是掃描檔、沒有文字層，所以這裡只有摘要/);
	assert.match(scanned, /## 摘要（Abstract）\n\n目的：探討衛教成效。/);
	let bare = G.itemMarkdown({ title: "Hip protectors", creators: [] }, { kind: "none", reason: "noFile" });
	assert.match(bare, /Zotero 裡沒有這篇的 PDF 檔，所以這裡只有書目資料/);
	assert.doesNotMatch(bare, /作者：|DOI：/, "empty fields are left out");
});

test("references file: the APA module's text, Chinese first by stroke order, then A–Z", () => {
	let book = { title: "Nursing research methods", year: "2019", creators: [{ lastName: "Smith", firstName: "John", creatorType: "author" }], apa: "Smith, J. (2019). *Nursing research methods*. Example Press.", language: "en" };
	let zh2 = Object.assign({}, chinese, { apa: "王大明（2020）。加護病房護理人員之睡眠品質。長庚護理，31(1)，1–12。", apaMarkdown: "" });
	let md = G.referencesMarkdown([english, book, chinese, zh2], { scopeName: "跌倒預防", date: "2026-10-13" });
	let lines = md.split("\n");
	assert.equal(lines[0], "# 參考文獻（APA 7）");
	assert.equal(lines[2], "跌倒預防・4 篇・ZotMax 匯出於 2026-10-13");
	let refs = lines.filter(l => /\(\d{4}\)|（\d{4}）/.test(l));
	assert.deepEqual(refs, apaZh.sortReferences([english.apaMarkdown, book.apa, chinese.apaMarkdown, zh2.apa], [english, book, chinese, zh2]), "sorted by apa-zh.js");
	assert.ok(refs[0].startsWith("王大明") && refs[1].startsWith("陳美玲"), "Chinese first, by stroke count (王 4 before 陳 16)");
	assert.ok(refs[2].startsWith("Lee") && refs[3].startsWith("Smith"));
	// An item without any APA text still gets a line
	let fallback = G.referencesMarkdown([{ title: "Untitled draft", year: "", creators: [] }]);
	assert.match(fallback, /（無作者） \(n\.d\.\)\. Untitled draft\./);
});

test("highlights file: only items with highlights or the user's own form, grouped by meaning, labelled as the user's notes", () => {
	let withNotes = Object.assign({}, english, {
		attachments: [{ key: "ATT", annotations: [
			{ key: "A1", type: "highlight", text: "Falls  fell by 30%.", comment: "主要結果", color: "#ffd400", pageLabel: "5" },
			{ key: "A2", type: "highlight", text: "Small sample", comment: "", color: "#ff6666", pageLabel: "7" },
			{ key: "A3", type: "image", text: "", comment: "Table 2", color: "#ffd400", pageLabel: "6" },
		] }],
	});
	let appraisal = { toolName: "CASP RCT", status: "已核對（2026-10-01）", summary: "是 9、否 1", table: "| 題目 | 答案 |\n|---|---|\n| 1 | 是 |", overall: "納入 — 品質佳" };
	let md = G.highlightsMarkdown([{ data: withNotes, appraisal }, { data: chinese, appraisal: null }], undefined, { scopeName: "跌倒預防", date: "2026-10-13" });
	assert.match(md, /^# 我的劃線與評讀$/m);
	assert.match(md, /使用者自己在 Zotero 裡做的劃線、註記和評讀表，不是論文原文，也不是 AI 寫的/);
	assert.match(md, /^## Lee 2021 - Exercise and falls$/m);
	assert.doesNotMatch(md, /護理人員跌倒預防/, "an item with nothing of the user's is left out");
	let yellow = md.indexOf("### 🟡 重要發現（2）");
	let red = md.indexOf("### 🔴");
	assert.ok(yellow > 0 && red > yellow, "groups in the meanings' order");
	assert.match(md, /- 「Falls fell by 30%\.」（p\. 5）\n {2}- 我的註記：主要結果/);
	assert.match(md, /- （圖片註記）（p\. 6）\n {2}- 我的註記：Table 2/);
	assert.match(md, /### 我的評讀：CASP RCT（已核對（2026-10-01））/);
	assert.match(md, /整體評價：納入 — 品質佳/);
	// Nothing of the user's anywhere: no file
	assert.equal(G.highlightsMarkdown([{ data: english, appraisal: null }, { data: chinese, appraisal: null }]), "");
	// Only a form
	assert.match(G.highlightsMarkdown([{ data: chinese, appraisal }]), /### 我的評讀：CASP RCT/);
});

test("README: where to upload (both addresses), the limits, privacy, and checking AI answers against the papers", () => {
	let text = G.readmeText({ date: "2026-10-13", scopeName: "跌倒預防", items: 12, highlights: true, pdfs: 3, sources: 17, cap: 50, over: false, notes: ["2 篇的 PDF 是掃描檔"] });
	assert.match(text, /^如何把這個資料夾加入 Gemini Notebook$/m);
	assert.match(text, /跌倒預防，12 篇文獻/);
	assert.match(text, /ZotMax 沒有上傳任何東西/);
	assert.match(text, /https:\/\/notebook\.google\.com/);
	assert.match(text, /https:\/\/notebooklm\.google\.com/);
	assert.match(text, /「新增來源」→「上傳檔案」/);
	assert.match(text, /約 50 個來源（依方案而異）/);
	assert.match(text, /共 17 個檔案要上傳。/);
	assert.match(text, /01 我的劃線與評讀\.md/);
	assert.match(text, /3 個 PDF 檔/);
	assert.match(text, /未發表的研究資料、病人資訊不要上傳/);
	assert.match(text, /一定要回到原文核對/);
	assert.match(text, /這次匯出的備註\n- 2 篇的 PDF 是掃描檔/);
	let plain = G.readmeText({ date: "2026-10-13", scopeName: "選取的文獻", items: 60, highlights: false, pdfs: 0, sources: 61, cap: 50, over: true, notes: [] });
	assert.doesNotMatch(plain, /我的劃線與評讀|個 PDF 檔|這次匯出的備註/);
	assert.match(plain, /共 61 個檔案要上傳，超過 50 個，請分成幾本筆記本/);
});

test("notes and the dialog text after an export", () => {
	let r = { items: 4, dir: "/tmp/x", sources: 5, cap: 50, over: false, scanned: ["掃描"], noText: [], missingPDF: ["A", "B", "C", "D"], highlightsAsked: true, highlights: false };
	r.notes = G.exportNotes(r);
	assert.equal(r.notes.length, 3);
	assert.match(r.notes[0], /1 篇的 PDF 是掃描檔/);
	assert.match(r.notes[1], /4 篇的 PDF 找不到檔案.*「A」、「B」、「C」 等 4 篇/);
	assert.match(r.notes[2], /還沒有劃線或評讀表/);
	let text = G.doneText(r);
	assert.match(text, /^已匯出 4 篇文獻到：\n\/tmp\/x\n/);
	assert.match(text, /⚠ 1 篇的 PDF 是掃描檔/);
	assert.match(text, /沒有上傳任何東西/);
	assert.doesNotMatch(text, /超過/);
	assert.match(G.doneText(Object.assign({}, r, { over: true, sources: 70, notes: [] })), /超過 50 個來源的上限/);
});

// ---------- Google Drive for desktop ----------

/** A fake file system holding only folders: exists() for them and their parents, list() for direct children. */
function fakeFS(folders, sep = "/") {
	let all = new Set();
	for (let f of folders) {
		let parts = f.split(sep);
		for (let i = 1; i <= parts.length; i++) {
			let p = parts.slice(0, i).join(sep);
			all.add(p);
			if (/^[A-Z]:$/.test(p)) all.add(p + sep);
		}
	}
	let checked = [];
	let listed = [];
	return {
		checked, listed,
		exists: async (p) => {
			checked.push(p);
			return all.has(p);
		},
		list: async (dir) => {
			listed.push(dir);
			let prefix = dir.endsWith(sep) ? dir : dir + sep;
			return [...new Set([...all].filter(p => p.startsWith(prefix) && p.length > prefix.length).map(p => p.slice(prefix.length).split(sep)[0]))];
		},
	};
}

test("Drive on macOS: ~/Library/CloudStorage/GoogleDrive-<account>/My Drive, localized names, legacy folders; nothing inside Drive is read", async () => {
	let home = "/Users/student";
	let fs = fakeFS([`${home}/Library/CloudStorage/GoogleDrive-student@gmail.com/My Drive/Thesis`, `${home}/Library/CloudStorage/GoogleDrive-student@gmail.com/Shared drives`,
		`${home}/Library/CloudStorage/OneDrive-Personal/Documents`]);
	let found = await G.findGoogleDrive(Object.assign({ platform: "Darwin", home }, fs));
	assert.equal(found.path, `${home}/Library/CloudStorage/GoogleDrive-student@gmail.com/My Drive`);
	assert.equal(found.account, "student@gmail.com");
	assert.equal(found.candidates.length, 1);
	assert.deepEqual(fs.listed, [`${home}/Library/CloudStorage`, "/Volumes"], "lists only the folders that hold Drive's own folder");
	assert.ok(fs.checked.every(p => !/My Drive\/./.test(p)), "never looks inside My Drive");
	// zh-TW Drive
	let zh = await G.findGoogleDrive(Object.assign({ platform: "mac", home }, fakeFS([`${home}/Library/CloudStorage/GoogleDrive-陳美玲@ntu.edu.tw/我的雲端硬碟`])));
	assert.equal(zh.path, `${home}/Library/CloudStorage/GoogleDrive-陳美玲@ntu.edu.tw/我的雲端硬碟`);
	assert.equal(zh.account, "陳美玲@ntu.edu.tw");
	// Spanish
	let es = await G.findGoogleDrive(Object.assign({ platform: "mac", home }, fakeFS([`${home}/Library/CloudStorage/GoogleDrive-ana@gmail.com/Mi unidad`])));
	assert.equal(es.path, `${home}/Library/CloudStorage/GoogleDrive-ana@gmail.com/Mi unidad`);
	// Drive File Stream / older Drive for desktop mounted in /Volumes
	let vol = await G.findGoogleDrive(Object.assign({ platform: "mac", home }, fakeFS(["/Volumes/GoogleDrive/My Drive", "/Volumes/Macintosh HD"])));
	assert.equal(vol.path, "/Volumes/GoogleDrive/My Drive");
	// Backup and Sync: ~/Google Drive is My Drive itself
	let legacy = await G.findGoogleDrive(Object.assign({ platform: "mac", home }, fakeFS([`${home}/Google Drive/Papers`])));
	assert.equal(legacy.path, `${home}/Google Drive`);
	assert.equal(legacy.candidates[0].kind, "legacy");
	// A CloudStorage folder without My Drive (signed out) is not Drive
	assert.equal(await G.findGoogleDrive(Object.assign({ platform: "mac", home }, fakeFS([`${home}/Library/CloudStorage/GoogleDrive-x@gmail.com/.Encrypted`]))), null);
});

test("Drive on Windows: a streamed drive letter (G: or another), mirrored %USERPROFILE%\\My Drive, legacy Google Drive, localized names", async () => {
	let home = "C:\\Users\\student";
	let g = await G.findGoogleDrive(Object.assign({ platform: "WINNT", home }, fakeFS(["G:\\My Drive\\Thesis", "G:\\Shared drives", "D:\\Data"], "\\")));
	assert.equal(g.path, "G:\\My Drive");
	assert.equal(g.account, "G:");
	assert.equal(G.driveLabel(g.candidates[0]), "G: 磁碟");
	let h = await G.findGoogleDrive(Object.assign({ platform: "win", home }, fakeFS(["H:\\我的雲端硬碟"], "\\")));
	assert.equal(h.path, "H:\\我的雲端硬碟", "another letter when G: was taken; zh-TW name");
	let mirror = await G.findGoogleDrive(Object.assign({ platform: "win", home }, fakeFS([`${home}\\My Drive\\Papers`], "\\")));
	assert.equal(mirror.path, `${home}\\My Drive`);
	assert.equal(mirror.candidates[0].kind, "mirror");
	let fromEnv = await G.findGoogleDrive(Object.assign({ platform: "win", env: { USERPROFILE: home } }, fakeFS([`${home}\\我的雲端硬碟`], "\\")));
	assert.equal(fromEnv.path, `${home}\\我的雲端硬碟`, "USERPROFILE when there is no home");
	let legacy = await G.findGoogleDrive(Object.assign({ platform: "win", home }, fakeFS([`${home}\\Google Drive\\My Drive`], "\\")));
	assert.equal(legacy.path, `${home}\\Google Drive\\My Drive`);
	let backup = await G.findGoogleDrive(Object.assign({ platform: "win", home }, fakeFS([`${home}\\Google Drive\\Papers`], "\\")));
	assert.equal(backup.path, `${home}\\Google Drive`);
	// A drive letter without My Drive is some other disk
	let fs = fakeFS(["E:\\Backup", "C:\\Windows"], "\\");
	assert.equal(await G.findGoogleDrive(Object.assign({ platform: "win", home }, fs)), null);
	assert.ok(!fs.checked.some(p => /^[ABC]:\\$/.test(p)), "A:, B: and C: are never tried as Drive letters");
	assert.ok(!fs.checked.some(p => /^E:\\Backup/.test(p)), "nothing else is read");
});

test("Drive: several accounts are all candidates (the first is the default), none found is null, other systems are null", async () => {
	let home = "/Users/student";
	let two = await G.findGoogleDrive(Object.assign({ platform: "mac", home }, fakeFS([
		`${home}/Library/CloudStorage/GoogleDrive-work@hospital.org/My Drive`, `${home}/Library/CloudStorage/GoogleDrive-me@gmail.com/我的雲端硬碟`,
	])));
	assert.deepEqual(two.candidates.map(c => c.account), ["me@gmail.com", "work@hospital.org"], "sorted, so the default is stable");
	assert.equal(two.path, two.candidates[0].path);
	let win = await G.findGoogleDrive(Object.assign({ platform: "win", home: "C:\\Users\\s" }, fakeFS(["G:\\My Drive", "H:\\My Drive", "C:\\Users\\s\\My Drive"], "\\")));
	assert.deepEqual(win.candidates.map(c => c.path), ["G:\\My Drive", "H:\\My Drive", "C:\\Users\\s\\My Drive"]);
	assert.equal(await G.findGoogleDrive(Object.assign({ platform: "mac", home }, fakeFS([`${home}/Downloads`]))), null);
	assert.equal(await G.findGoogleDrive(Object.assign({ platform: "Linux", home: "/home/s" }, fakeFS(["/home/s/My Drive"]))), null, "no Drive for desktop on Linux");
	// A file system that throws is "not found", never an error
	let broken = { exists: async () => { throw new Error("denied"); }, list: async () => { throw new Error("denied"); } };
	assert.equal(await G.findGoogleDrive(Object.assign({ platform: "mac", home }, broken)), null);
});

test("Drive paths: the export folder inside My Drive, which account holds a folder, the path as Drive shows it", () => {
	assert.equal(G.driveExportFolder("/Users/s/Library/CloudStorage/GoogleDrive-a@b.c/My Drive"), "/Users/s/Library/CloudStorage/GoogleDrive-a@b.c/My Drive/ZotMax/Gemini Notebook");
	assert.equal(G.driveExportFolder("G:\\My Drive"), "G:\\My Drive\\ZotMax\\Gemini Notebook");
	assert.equal(G.driveExportFolder("G:\\My Drive\\"), "G:\\My Drive\\ZotMax\\Gemini Notebook");
	let drive = { path: "G:\\My Drive", candidates: [{ path: "G:\\My Drive", account: "G:" }, { path: "H:\\我的雲端硬碟", account: "H:" }] };
	assert.equal(G.driveOf("G:\\My Drive\\ZotMax\\Gemini Notebook", drive).account, "G:");
	assert.equal(G.driveOf("h:\\我的雲端硬碟\\論文", drive).account, "H:", "drive letters compare without case");
	assert.equal(G.driveOf("G:\\My Drive", drive).account, "G:");
	assert.equal(G.driveOf("G:\\My Drive 2", drive), null, "a sibling with the same prefix is not inside");
	assert.equal(G.driveOf("C:\\Users\\s\\Downloads", drive), null);
	assert.equal(G.driveOf("/x", null), null);
	assert.equal(G.drivePath("G:\\My Drive\\ZotMax\\Gemini Notebook\\Gemini Notebook - 跌倒預防 - 2026-10-13", "G:\\My Drive"), "ZotMax/Gemini Notebook/Gemini Notebook - 跌倒預防 - 2026-10-13");
	assert.equal(G.drivePath("/Users/s/Downloads/x", "/Users/s/My Drive"), "");
});

test("destination: a folder the user chose > My Drive/ZotMax/Gemini Notebook (preferDrive) > Downloads > home", () => {
	let drive = { path: "/Users/s/Library/CloudStorage/GoogleDrive-a@b.c/My Drive", candidates: [] };
	let inDrive = "/Users/s/Library/CloudStorage/GoogleDrive-a@b.c/My Drive/ZotMax/Gemini Notebook";
	let downloads = "/Users/s/Downloads";
	let base = { drive, preferDrive: true, downloads, home: "/Users/s" };
	assert.deepEqual(G.chooseDestination(Object.assign({}, base, { saved: "/Users/s/Exports", savedExists: true })), { folder: "/Users/s/Exports", source: "saved" });
	assert.deepEqual(G.chooseDestination(Object.assign({}, base, { saved: "/gone", savedExists: false })), { folder: inDrive, source: "drive" }, "a remembered folder that is gone");
	assert.deepEqual(G.chooseDestination(base), { folder: inDrive, source: "drive" });
	assert.deepEqual(G.chooseDestination(Object.assign({}, base, { saved: downloads + "/", savedExists: true })), { folder: inDrive, source: "drive" },
		"Downloads remembered by 0.17 (its default) is not a choice");
	assert.deepEqual(G.chooseDestination(Object.assign({}, base, { saved: downloads, savedExists: true, preferDrive: false })), { folder: downloads, source: "saved" });
	assert.deepEqual(G.chooseDestination(Object.assign({}, base, { preferDrive: false })), { folder: downloads, source: "downloads" });
	assert.deepEqual(G.chooseDestination(Object.assign({}, base, { drive: null })), { folder: downloads, source: "downloads" });
	assert.deepEqual(G.chooseDestination({ drive: null, home: "/Users/s" }), { folder: "/Users/s", source: "home" });
	assert.deepEqual(G.chooseDestination({}), { folder: "", source: "" });
	assert.deepEqual(G.chooseDestination(Object.assign({}, base, { preferDrive: undefined })).source, "drive", "on unless switched off");
});

test("README and the dialog after an export, in Drive: add from Google Drive, wait for the sync, Markdown and PDF are snapshots", () => {
	let o = { date: "2026-10-13", scopeName: "跌倒預防", items: 12, highlights: false, pdfs: 0, sources: 13, cap: 50, over: false, notes: [],
		drivePath: "ZotMax/Gemini Notebook/Gemini Notebook - 跌倒預防 - 2026-10-13" };
	let text = G.readmeText(o);
	assert.match(text, /「新增來源」→「Google 雲端硬碟」，找到 我的雲端硬碟 › ZotMax › Gemini Notebook › Gemini Notebook - 跌倒預防 - 2026-10-13，選這次的 \.md 檔/);
	assert.match(text, /先等雲端硬碟同步完成/);
	assert.match(text, /只有 Google 文件、試算表、簡報會在 Gemini Notebook 裡自動跟著更新/);
	assert.match(text, /\.md 和 PDF 加入後是當時的副本，不會自動更新：.*請重新匯出，再把新的檔案加入筆記本/);
	assert.match(text, /改按「上傳檔案」/, "the upload way stays as the fallback");
	assert.match(text, /ZotMax 本身沒有上傳任何東西/);
	assert.doesNotMatch(text, /這個資料夾只在你的電腦上/, "it does not claim the folder stays on this computer");
	assert.match(text, /共 13 個檔案要加入。/);
	// Not in Drive: the upload steps, no Drive words
	let plain = G.readmeText(Object.assign({}, o, { drivePath: "" }));
	assert.match(plain, /「新增來源」→「上傳檔案」，把這個資料夾裡的 \.md 檔/);
	assert.doesNotMatch(plain, /雲端硬碟/);
	let r = { items: 12, dir: "G:\\My Drive\\ZotMax\\Gemini Notebook\\Gemini Notebook - 跌倒預防 - 2026-10-13", sources: 13, cap: 50, over: false, notes: [], drivePath: o.drivePath };
	let done = G.doneText(r);
	assert.match(done, /這個資料夾在 Google 雲端硬碟裡（我的雲端硬碟 › ZotMax › Gemini Notebook › Gemini Notebook - 跌倒預防 - 2026-10-13）/);
	assert.match(done, /等雲端硬碟同步完成後，在 https:\/\/notebook\.google\.com 的筆記本按「新增來源」→「Google 雲端硬碟」→ 找到 ZotMax › Gemini Notebook › /);
	assert.match(done, /不會自動更新/);
	assert.doesNotMatch(done, /「上傳檔案」/);
	assert.match(G.doneText(Object.assign({}, r, { drivePath: "" })), /「新增來源」→「上傳檔案」/);
});
