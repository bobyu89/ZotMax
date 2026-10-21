// Research dashboard (研究儀表板): frontmatter aggregation, Markdown, Mermaid and the .base file (pure helpers)
const test = require("node:test");
const assert = require("node:assert/strict");
const d = require("../content/dashboard.js");
const core = require("../content/core.js");
const usage = require("../content/usage.js");

const NOW = new Date("2026-10-08T12:00:00Z");
// USD per million tokens
const PRICES = { "test-model": { input: 1, output: 5 } };

let nextKey = 1;
// A note's frontmatter as the plugin writes it (core.js), plus the user's reading status
function noteFM(data, opts = {}, status = "待讀") {
	let key = `K${nextKey++}`;
	let full = Object.assign({
		title: "Untitled", creators: [{ lastName: "Chen", firstName: "Mei", creatorType: "author" }],
		year: "2024", libraryPath: "library", key, collections: [], itemType: "journalArticle",
		dateAdded: "2026-01-01T00:00:00Z", fullTextStatus: "ok", doi: "10.1/x",
	}, data);
	let fm = Object.assign(core.managedFrontmatter(full, opts), status ? { status } : {});
	return core.splitFrontmatter(core.buildFrontmatter(fm, null)).frontmatter;
}

const AI = { aiModel: "test-model", aiGeneratedAt: "2026-10-01T00:00:00Z" };

function sample() {
	return [
		d.noteRecord(noteFM({ title: "RCT of hourly rounding", collections: ["碩論/跌倒", "EBP"], dateAdded: "2026-10-06T08:00:00Z" },
			Object.assign({ study: { study_design: "RCT", evidence_level: "2", jbi_level: "1c", appraisal_overall: "納入", sample_size: 120 } }, AI), "已讀"), "Zotero/a.md"),
		d.noteRecord(noteFM({ title: "Cohort of falls", collections: ["碩論/跌倒"], dateAdded: "2025-03-01T00:00:00Z", doi: "" },
			Object.assign({ study: { study_design: "Cohort", evidence_level: "3", appraisal_overall: "納入" } }, AI), "閱讀中"), "Zotero/b.md"),
		d.noteRecord(noteFM({ title: "長期照護機構跌倒預防", creators: [{ name: "陳, 美玲", creatorType: "author" }, { lastName: "林", firstName: "小華", creatorType: "author" }],
			collections: ["碩論/跌倒"], dateAdded: "2024-01-05T00:00:00Z", fullTextStatus: "none", doi: "" }), "Zotero/c.md"),
		d.noteRecord(noteFM({ title: "Scanned old paper", dateAdded: "2025-06-01T00:00:00Z", fullTextStatus: "partial", itemType: "book", doi: "" }), "Zotero/sub/d.md"),
		d.noteRecord(noteFM({ title: "Cited RCT", collections: ["EBP"], dateAdded: "2026-10-07T23:00:00Z" },
			Object.assign({ study: { study_design: "RCT", evidence_level: "10", appraisal_overall: "需更多資訊" } }, AI), "已引用"), "Zotero/e.md"),
		d.noteRecord(noteFM({ title: "Custom status", dateAdded: "2026-05-01T00:00:00Z", fullTextStatus: "no_pdf" }, AI, "略讀"), "Zotero/f.md"),
		d.noteRecord(noteFM({ title: "No status yet", dateAdded: "" }, AI, ""), "Zotero/g.md"),
		// Trashed in Zotero: not counted
		d.noteRecord(core.markObsidianNoteDeleted("---\n" + noteFM({ title: "Gone" }, AI, "已讀") + "\n---\n", { now: "2026-10-01T00:00:00Z" })
			.split("---\n")[1], "Zotero/gone.md"),
	];
}

test("parseFrontmatter: scalars, block lists, inline lists and the user's own keys", () => {
	let fm = noteFM({ title: "A \"quoted\" title", collections: ["碩論/跌倒", "EBP"] }, { study: { sample_size: 42, measures: [] } });
	let f = d.parseFrontmatter(fm + "\naliases: [one, \"two\"]\nempty:\ncssclasses:\n  - wide\n");
	assert.equal(f.title, "A \"quoted\" title");
	assert.deepEqual(f.collections, ["碩論/跌倒", "EBP"]);
	assert.deepEqual(f.authors, ["Chen, Mei"]);
	assert.equal(f.year, "2024");
	assert.equal(f.sample_size, "42");
	assert.equal(f.status, "待讀");
	assert.deepEqual(f.aliases, ["one", "two"]);
	assert.deepEqual(f.measures, []);
	assert.equal(f.empty, "");
	assert.deepEqual(f.cssclasses, ["wide"]);
	assert.equal(d.parseFrontmatter("title: 'single'").title, "single");
});

test("noteRecord: fields, AI note and structured data, deleted notes, suspect Chinese names", () => {
	let [a, , c, dd, , , g, gone] = sample();
	assert.equal(a.link, "Zotero/a");
	assert.equal(a.title, "RCT of hourly rounding");
	assert.equal(a.status, "已讀");
	assert.equal(a.hasAI, true);
	assert.equal(a.hasStudyData, true);
	assert.equal(a.evidenceLevel, "2");
	assert.equal(c.hasAI, false);
	assert.equal(c.hasStudyData, false);
	assert.deepEqual(c.suspectNames, ["陳, 美玲"]);
	assert.equal(dd.link, "Zotero/sub/d");
	assert.equal(g.status, "");
	assert.equal(gone.deleted, true);
	assert.equal(d.noteRecord("", "Zotero/無標題.md").title, "無標題");
});

test("suspectChineseNames: only Chinese items, only names that look split or romanized", () => {
	assert.deepEqual(d.suspectChineseNames("護理人員的工作壓力", ["陳美玲", "歐陽小華", "陳, 美玲", "林 小華", "王", "陳Mei", "Chen, Mei-Ling"]),
		["陳, 美玲", "林 小華", "王", "陳Mei"]);
	assert.deepEqual(d.suspectChineseNames("Nurse burnout", ["陳, 美玲"]), []);
	assert.deepEqual(d.suspectChineseNames("看護の負担", ["陳, 美玲"]), []);
});

test("aggregate: reading progress, collections, evidence, data quality, unread and new items", () => {
	let s = d.aggregate(sample(), { now: NOW });
	assert.equal(s.total, 7);
	assert.equal(s.deleted, 1);
	assert.deepEqual(s.statuses, [["待讀", 2], ["閱讀中", 1], ["已讀", 1], ["已引用", 1], ["略讀", 1], ["（未設定）", 1]]);
	assert.equal(s.read, 2);
	assert.equal(s.readPercent, 29);
	assert.deepEqual(s.collections.map(c => [c.name, c.total, c.read, c.byStatus]), [
		["碩論/跌倒", 3, 1, { 已讀: 1, 閱讀中: 1, 待讀: 1 }],
		["EBP", 2, 2, { 已讀: 1, 已引用: 1 }],
		["（未分類）", 3, 0, { 待讀: 1, 略讀: 1, "（未設定）": 1 }],
	]);
	assert.deepEqual(s.designs, [["RCT", 2], ["Cohort", 1], ["（未填）", 4]]);
	// Natural order: 2 < 3 < 10
	assert.deepEqual(s.levels, [["2", 1], ["3", 1], ["10", 1], ["（未填）", 4]]);
	assert.deepEqual(s.jbiLevels, [["1c", 1], ["（未填）", 6]]);
	assert.deepEqual(s.appraisals, [["納入", 2], ["需更多資訊", 1], ["（未填）", 4]]);
	assert.equal(s.withAI, 5);
	assert.equal(s.withStudyData, 3);
	assert.deepEqual(s.fullText, [["ok", 4], ["partial", 1], ["none", 1], ["no_pdf", 1], ["", 0]]);
	// 待讀, oldest first
	assert.deepEqual(s.unread.map(r => r.title), ["長期照護機構跌倒預防", "Scanned old paper"]);
	// Most issues first; a book without DOI is fine, a journal article is not
	assert.deepEqual(s.issues.map(x => [x.record.title, x.issues]), [
		["長期照護機構跌倒預防", ["noAI", "scanned", "noDOI", "zhNames"]],
		["Scanned old paper", ["noAI", "scanned"]],
		["Cohort of falls", ["noDOI"]],
	]);
	assert.deepEqual(s.issueCounts, { noAI: 2, scanned: 2, noDOI: 2, zhNames: 1 });
	// Last 7 days, newest first
	assert.deepEqual(s.added.map(r => r.title), ["Cited RCT", "RCT of hourly rounding"]);
	assert.equal(d.aggregate([], { now: NOW }).total, 0);
});

test("buildStatusPie: Mermaid pie of the non-empty statuses", () => {
	let pie = d.buildStatusPie([["待讀", 3], ["閱讀中", 0], ["已讀", 2], ["自訂 \"x\"", 1]]);
	assert.equal(pie, [
		"```mermaid",
		"pie showData",
		"    title 閱讀狀態",
		"    \"待讀\" : 3",
		"    \"已讀\" : 2",
		"    \"自訂 'x'\" : 1",
		"```",
	].join("\n"));
	assert.equal(d.buildStatusPie([["待讀", 0]]), "");
});

test("usageReport: this month and the two before, with totals", () => {
	let ledger = usage.recordUsage({}, { model: "test-model", usage: { input: 1000000, output: 0 } }, new Date(2026, 9, 3));
	ledger = usage.recordUsage(ledger, { model: "test-model", usage: { input: 0, output: 1000000 } }, new Date(2026, 7, 20));
	ledger = usage.recordUsage(ledger, { model: "test-model", usage: { input: 1000000, output: 0 } }, new Date(2026, 6, 20));
	ledger = usage.recordUsage(ledger, { model: "local-model", usage: { input: 10, output: 10 } }, new Date(2026, 8, 2));
	let r = d.usageReport(ledger, PRICES, { now: new Date(2026, 9, 8) });
	assert.deepEqual(r.months.map(m => [m.month, m.summary.calls]), [["2026-10", 1], ["2026-09", 1], ["2026-08", 1]]);
	assert.equal(r.total.calls, 3);
	assert.equal(r.total.unpricedCalls, 1);
	assert.ok(Math.abs(r.total.cost - 6) < 1e-9);
	let md = d.buildDashboardSection(d.aggregate([], { now: NOW }), { now: NOW, usage: r });
	assert.match(md, /\| 2026-10（本月） \| 1 \| 1,000,000 \| US\$1\.00 \|/);
	assert.match(md, /\| 2026-09 \| 1 \| 20 \| 未定價 \|/);
	assert.match(md, /本月估計費用 \*\*US\$1\.00\*\*；近 3 個月合計 3 次呼叫，約 \*\*US\$6\.00\*\*（不含未定價模型的 1 次呼叫）/);
	let none = d.buildDashboardSection(d.aggregate([], { now: NOW }), { now: NOW, usage: d.usageReport({}, PRICES, { now: NOW }) });
	assert.match(none, /近 3 個月沒有 AI 呼叫紀錄/);
});

test("projectRecord: PRISMA counts of review notes, sources of drafts", () => {
	let review = d.projectRecord(core.splitFrontmatter(core.buildFrontmatter({
		title: "跌倒：篩選與 PRISMA 2020", type: "review-screening", prisma_identified: 120, prisma_screened: 100,
		prisma_assessed: 20, prisma_included: 0, prisma_awaiting_screening: 2, prisma_awaiting_fulltext: 1, last_generated: "2026-10-01T00:00:00Z",
	}, null)).frontmatter, "Zotero/Reviews/跌倒.md");
	assert.deepEqual(review.prisma, { identified: 120, duplicates: null, screened: 100, assessed: 20, included: 0, awaiting: 3 });
	assert.equal(review.generatedAt, "2026-10-01T00:00:00Z");
	let draft = d.projectRecord("type: \"lit-review-draft\"\nsources:\n  - \"library/A\"\n  - \"library/B\"\ngenerated_at: \"2026-10-02T00:00:00Z\"", "Zotero/Drafts/文獻探討-跌倒.md");
	assert.equal(draft.sources, 2);
	assert.equal(draft.title, "文獻探討-跌倒");
	let md = d.buildDashboardSection(d.aggregate([], { now: NOW }), { now: NOW, reviews: [review], drafts: [draft] });
	assert.match(md, /- \[\[Zotero\/Reviews\/跌倒\|跌倒：篩選與 PRISMA 2020\]\]：納入 \*\*0\*\* 篇（辨識 120 → 篩選 100 → 全文評估 20）；尚待篩選 3 筆 · 更新於 2026-10-01/);
	assert.match(md, /- \[\[Zotero\/Drafts\/文獻探討-跌倒\|文獻探討-跌倒\]\]：2 篇文獻 · 產生於 2026-10-02/);
	let empty = d.buildDashboardSection(d.aggregate([], { now: NOW }), { now: NOW });
	assert.match(empty, /還沒有回顧專案/);
	assert.match(empty, /還沒有草稿/);
	assert.match(empty, /還沒有同步到 Obsidian 的文獻筆記/);
});

test("buildDashboardSection: every section, links and tables", () => {
	let stats = d.aggregate(sample(), { now: NOW });
	let md = d.buildDashboardSection(stats, { now: NOW, baseLink: "Zotero/研究儀表板.base" });
	let headings = md.split("\n").filter(l => /^## /.test(l));
	assert.deepEqual(headings, ["## 📖 閱讀進度", "## 🔬 證據概況", "## 📝 待處理清單", "## 🗂️ 回顧專案", "## 🤖 AI 用量", "## 🆕 本週新增"]);
	assert.match(md, /共 \*\*7\*\* 篇文獻，已讀完成率 \*\*29%\*\*（已讀 \+ 已引用 2 篇）。 另有 1 篇已從 Zotero 刪除/);
	assert.match(md, /\| 待讀 \| 2 \| ▰▰▰▱▱▱▱▱▱▱ 29% \|/, "a bar in the 比例 column");
	assert.match(md, /\| 研究設計 \| 篇數 \| 比例 \|/);
	assert.doesNotMatch(md, /\[!zm-board\]/, "no 總覽 cards without the 看板 layout");
	assert.match(md, /```mermaid\npie showData\n/);
	assert.match(md, /\| 分類 \| 篇數 \| 待讀 \| 閱讀中 \| 已讀 \| 已引用 \| 完成率 \|\n\| --- \| ---: \|/);
	assert.match(md, /\| 碩論\/跌倒 \| 3 \| 1 \| 1 \| 1 \| 0 \| 33% \|/);
	assert.match(md, /\| RCT \| 2 \|/);
	assert.match(md, /\| 1c \| 1 \|/);
	assert.match(md, /掃描檔（全文 none／partial，建議先 OCR 再產生 AI 筆記）：\*\*2\*\* 篇/);
	assert.match(md, /\| none：掃描版（沒有文字層） \| 1 \|/);
	assert.match(md, /- \[\[Zotero\/c\|長期照護機構跌倒預防\]\] — 2024-01-05 加入（已 1007 天）/);
	assert.match(md, /無 AI 筆記 2 · 掃描檔待 OCR 2 · 期刊文章缺 DOI 2 · 中文作者姓名可疑 1/);
	assert.match(md, /- ⚠️ \[\[Zotero\/c\|長期照護機構跌倒預防\]\]：無 AI 筆記、掃描檔待 OCR、期刊文章缺 DOI、中文作者姓名可疑（陳, 美玲）/);
	assert.match(md, /這 7 天新增 \*\*2\*\* 篇：\n\n- \[\[Zotero\/e\|Cited RCT\]\] — 2026-10-07 加入（已引用）/);
	assert.match(md, /Bases 檢視：\[\[Zotero\/研究儀表板\.base\|研究儀表板\.base\]\]/);
	// The deleted note is nowhere
	assert.ok(!md.includes("Gone"));
	// Link labels can't break the wikilink
	let odd = d.noteRecord(noteFM({ title: "A | B [draft]", dateAdded: "2026-10-08T00:00:00Z" }), "Zotero/odd.md");
	assert.match(d.buildDashboardSection(d.aggregate([odd], { now: NOW }), { now: NOW }), /\[\[Zotero\/odd\|A ｜ B \(draft\)\]\]/);
	// A cell with a pipe is escaped
	let piped = d.noteRecord(noteFM({ title: "x" }, { study: { study_design: "Mixed | methods" } }), "Zotero/p.md");
	assert.match(d.buildDashboardSection(d.aggregate([piped], { now: NOW }), { now: NOW }), /\| Mixed \\\| methods \| 1 \|/);
});

test("buildDashboardNote: new note, then only the managed block and two frontmatter keys change", () => {
	let first = d.buildDashboardNote(null, "SECTION ONE", { updated: "2026-10-08T00:00:00Z" });
	assert.ok(first.startsWith("---\ntype: \"research-dashboard\"\nupdated: \"2026-10-08T00:00:00Z\"\n---\n\n# 研究儀表板\n\n%% zotero-bridge:start"));
	assert.match(first, /SECTION ONE\n\n%% zotero-bridge:end %%\n\n## ✍️ 我的筆記\n\n$/);
	// The user adds a key, text above and below the block
	let edited = first
		.replace("updated:", "cssclasses:\n  - wide\nupdated:")
		.replace("# 研究儀表板\n", "# 研究儀表板\n\n我的目標：12 月前讀完 30 篇。\n")
		+ "今天讀了兩篇。\n";
	let second = d.buildDashboardNote(edited, "SECTION TWO", { updated: "2026-10-09T00:00:00Z" });
	assert.ok(!second.includes("SECTION ONE"));
	assert.match(second, /SECTION TWO/);
	assert.match(second, /cssclasses:\n {2}- wide/);
	assert.match(second, /updated: "2026-10-09T00:00:00Z"/);
	assert.match(second, /我的目標：12 月前讀完 30 篇。/);
	assert.match(second, /## ✍️ 我的筆記\n\n今天讀了兩篇。\n$/);
	assert.equal(second.split("%% zotero-bridge:start").length, 2);
	// Same input → same output
	assert.equal(d.buildDashboardNote(second, "SECTION TWO", { updated: "2026-10-09T00:00:00Z" }), second);
	// A dashboard made as Zotero Bridge (≤ 0.10): the block is replaced, not added a second time
	const asOld = text => text.split("ZotMax").join("Zotero Bridge");
	assert.match(asOld(edited), /Zotero Bridge/);
	let fromOld = d.buildDashboardNote(asOld(edited), "SECTION TWO", { updated: "2026-10-09T00:00:00Z" });
	assert.equal(fromOld.split("%% zotero-bridge:start").length, 2);
	assert.ok(!fromOld.includes("SECTION ONE"));
	assert.match(fromOld, /我的目標：12 月前讀完 30 篇。\n\n%% zotero-bridge:start — 此區塊由 ZotMax 自動產生/);
	assert.match(fromOld, /今天讀了兩篇。\n$/);
	assert.doesNotMatch(fromOld, /Zotero Bridge/);
	// Markers deleted by the user: a fresh block after the heading, their text kept
	let noMarkers = "---\ntype: research-dashboard\n---\n# 研究儀表板\n\n只有我的字\n";
	let rebuilt = d.buildDashboardNote(noMarkers, "SECTION", { updated: "u" });
	assert.match(rebuilt, /# 研究儀表板\n\n%% zotero-bridge:start[^\n]*\n\nSECTION\n\n%% zotero-bridge:end %%\n\n\n只有我的字/);
	assert.match(rebuilt, /^---\ntype: "research-dashboard"\nupdated: "u"\n---\n/);
});

test("buildDashboardBase: three views in Bases syntax", () => {
	let base = d.buildDashboardBase();
	assert.ok(!/\t/.test(base), "YAML must not contain tabs");
	assert.ok(base.endsWith("\n"));
	let views = base.split("\n").filter(l => /^ {2}- type: /.test(l));
	assert.deepEqual(views, ["  - type: table", "  - type: table", "  - type: table"]);
	assert.deepEqual(base.split("\n").filter(l => /^ {4}name: /.test(l)).map(l => l.trim()),
		["name: 證據等級表", "name: 掃描檔待 OCR", "name: 待讀（依分類）"]);
	// Global filter: the plugin's notes, minus items trashed in Zotero
	assert.match(base, /^filters:\n {2}and:\n {4}- file\.hasProperty\("zotero_key"\)\n {4}- '!file\.hasProperty\("zotero_deleted"\)'\n/);
	assert.match(base, /name: 證據等級表\n {4}filters:\n {6}and:\n {8}- file\.hasProperty\("evidence_level"\)\n {8}- 'evidence_level != ""'\n {4}groupBy:\n {6}property: note\.study_design\n {6}direction: ASC\n/);
	assert.match(base, /name: 掃描檔待 OCR\n {4}filters:\n {6}or:\n {8}- 'full_text == "none"'\n {8}- 'full_text == "partial"'\n/);
	assert.match(base, /name: 待讀（依分類）\n {4}filters:\n {6}and:\n {8}- 'status == "待讀"'\n {4}groupBy:\n {6}property: note\.collections\n/);
	// Every property shown in a view is a frontmatter key the plugin writes (or file.name)
	let shown = new Set(base.split("\n").filter(l => /^ {6}- (note|file)\./.test(l)).map(l => l.trim().slice(2)));
	for (let p of shown) {
		if (p === "file.name") continue;
		let key = p.replace(/^note\./, "");
		assert.ok(core.MANAGED_KEYS.includes(key) || key === "status", p);
	}
	// Different from the main base file
	assert.notEqual(base, core.buildBaseFile());
});

test("overviewBoard: number cards for the vault (literature, reading, AI notes, appraisal, to-dos, review projects), only with the 看板 layout", () => {
	let stats = d.aggregate(sample(), { now: NOW });
	let reviews = [{ prisma: { included: 4 } }, { prisma: { included: null } }];
	let board = d.overviewBoard(stats, { reviews });
	assert.ok(board.startsWith("> [!zm-board] 總覽\n> > [!zm-kpi] 文獻\n> > **7 篇**  \n> > 本週新增 2 篇\n>\n"), board);
	let titles = [...board.matchAll(/^> > \[!zm-kpi\] (.+)$/gm)].map(m => m[1]);
	assert.deepEqual(titles, ["文獻", "已讀完成率", "AI 筆記", "評讀已核對", "待讀", "回顧專案"]);
	assert.match(board, /> > \[!zm-kpi\] 已讀完成率\n> > \*\*29%\*\* {2}\n> > ▰▰▰▱▱▱▱▱▱▱ {2}\n> > 已讀＋已引用 2／7\n/, "hard line breaks between the rows");
	assert.match(board, /> > \[!zm-kpi\] AI 筆記\n> > \*\*5／7\*\* {2}\n> > ▰▰▰▰▰▰▰▱▱▱ {2}\n> > 還有 2 篇沒有/);
	assert.match(board, /> > \[!zm-kpi\] 評讀已核對\n> > \*\*0／7\*\* {2}\n> > ▱▱▱▱▱▱▱▱▱▱ {2}\n> > 有評讀結果 3 篇（含 AI 初評）/);
	assert.match(board, /> > \[!zm-kpi\] 待讀\n> > \*\*2 篇\*\* {2}\n> > ⚠️ \d+ 篇資料要補/);
	assert.match(board, /> > \[!zm-kpi\] 回顧專案\n> > \*\*2 個\*\* {2}\n> > 納入 4 篇$/);
	assert.equal(d.overviewBoard(d.aggregate([], { now: NOW })), "", "nothing to show without notes");
	// The home page's four: no 待讀 and 回顧專案
	let compact = d.overviewBoard(stats, { reviews, compact: true });
	assert.deepEqual([...compact.matchAll(/^> > \[!zm-kpi\] (.+)$/gm)].map(m => m[1]), ["文獻", "已讀完成率", "AI 筆記", "評讀已核對"]);
	// In the section: right after the folded update note, only with layout "board"
	let md = d.buildDashboardSection(stats, { now: NOW, layout: "board", reviews });
	assert.match(md, /^> \[!zm-meta\]- 🔄 \d{4}-\d{2}-\d{2} \d{2}:\d{2} 更新\n/);
	assert.ok(md.indexOf("> [!zm-board] 總覽") < md.indexOf("> [!zm-ref]- 閱讀進度"));
	assert.doesNotMatch(d.buildDashboardSection(stats, { now: NOW, layout: "classic" }), /zm-board/);
	assert.equal(d.share(1, 4), "▰▰▰▱▱▱▱▱▱▱ 25%");
	// A verified appraisal is counted from the frontmatter
	let verified = d.noteRecord(noteFM({ title: "V" }, Object.assign({ appraisal: { verified: true, tool: "CASP", overall: "納入" } }, AI), "已讀"), "Zotero/v.md");
	assert.equal(verified.appraisalVerified, true);
	assert.equal(d.aggregate([verified], { now: NOW }).verified, 1);
});

test("gapMap and gapMapSection: interventions × outcomes from the AI notes, merged by alias, heat squares with the best CEBM level, the best-studied pairs", () => {
	let rec = (title, intervention, outcomes, level) => d.noteRecord(noteFM({ title },
		Object.assign({ study: { intervention, outcomes, evidence_level: level, study_design: "RCT" } }, AI), "已讀"), `Zotero/${title}.md`);
	assert.deepEqual(d.splitTerms("跌倒發生率、跌倒自我效能; 未報告 ,Falls"), ["跌倒發生率", "跌倒自我效能", "Falls"]);
	assert.equal(rec("x", "運動", "跌倒", "2").intervention, "運動", "noteRecord reads I and O from the frontmatter");
	let records = [
		rec("A", "運動、衛教", "跌倒發生率、跌倒自我效能", "2"),
		rec("B", "運動", "跌倒發生率", "1"),
		rec("C", "Exercise", "跌倒發生率", "3"),
		rec("D", "衛教", "", "2"),
	];
	let plain = d.gapMap(records);
	assert.equal(plain.studied, 3, "a note without outcomes is not on the map");
	assert.deepEqual(plain.rows.map(r => [r.name, r.count]), [["運動", 2], ["衛教", 1], ["Exercise", 1]]);
	let aliases = new Map([["運動", { key: "運動", name: "運動" }], ["exercise", { key: "運動", name: "運動" }]]);
	let map = d.gapMap(records, { aliases });
	assert.deepEqual(map.rows.map(r => [r.name, r.count]), [["運動", 3], ["衛教", 1]]);
	assert.deepEqual(map.cols.map(c => [c.name, c.count]), [["跌倒發生率", 3], ["跌倒自我效能", 1]]);
	assert.equal(map.cell("運動", "跌倒發生率").length, 3);
	assert.deepEqual(map.cell("衛教", "跌倒發生率").map(r => r.title), ["A"]);
	assert.equal(map.cell("衛教", "nothing").length, 0);
	let md = d.gapMapSection(map);
	assert.match(md, /^## 🗺️ 證據缺口地圖\n\n列是介入（I）、欄是結果指標（O），取自 3 篇文獻/);
	assert.match(md, /\| 介入 ＼ 結果 \| 跌倒發生率（3） \| 跌倒自我效能（1） \|\n\|---\|:---:\|:---:\|\n\| 運動（3） \| 🟧 3・L1 \| 🟨 1・L2 \|\n\| 衛教（1） \| 🟨 1・L2 \| 🟨 1・L2 \|/);
	assert.match(md, /### 證據最多的組合\n\n- \*\*運動 × 跌倒發生率\*\*：3 篇（最強 CEBM 1） — \[\[Zotero\/A\|A\]\]/);
	assert.match(md, /> \[!warning\] 這是字詞層級的整理，不是系統性回顧/);
	let small = d.gapMap(records, { aliases, maxRows: 1, maxCols: 1 });
	assert.equal(small.hiddenRows, 1);
	assert.match(d.gapMapSection(small), /另有 1 個介入、1 個結果指標/);
	let hole = d.gapMapSection(d.gapMap([rec("E", "運動", "跌倒", "2"), rec("F", "衛教", "住院天數", "")]));
	assert.match(hole, /\| ⬜ \|/, "an empty pair is a gap");
	assert.match(d.gapMapSection(d.gapMap(records.slice(0, 1))), /還畫不出來/);
	// In the dashboard: after 證據概況, only when given
	let stats = d.aggregate(records, { now: NOW });
	let section = d.buildDashboardSection(stats, { now: NOW, gapMap: map });
	assert.ok(section.indexOf("## 🗺️ 證據缺口地圖") > section.indexOf("## 🔬 證據概況") && section.indexOf("## 🔬 證據概況") > 0);
	assert.doesNotMatch(d.buildDashboardSection(stats, { now: NOW }), /證據缺口地圖/);
});

test("chartsBoard, yearRows and monthRows: a board of chart cards (designs pie, evidence levels, years, the last 12 months), only with the 看板 layout", () => {
	assert.deepEqual(d.yearRows([{ year: "2021" }, { year: "2021-05" }, { year: "2023" }, { year: "" }, { year: "n.d." }]), [["2021", 2], ["2023", 1]]);
	let many = Array.from({ length: 15 }, (_, k) => ({ year: String(2010 + k) }));
	let years = d.yearRows(many);
	assert.equal(years.length, 12);
	assert.deepEqual(years[0], ["≤ 2013", 4]);
	assert.deepEqual(years[11], ["2024", 1]);
	let months = d.monthRows([{ dateAdded: "2026-10-06T08:00:00Z" }, { dateAdded: "2026-09-01T00:00:00Z" }, { dateAdded: "2024-01-01T00:00:00Z" }, { dateAdded: "" }], NOW);
	assert.equal(months.length, 12);
	assert.deepEqual(months[11], ["2026-10", 1]);
	assert.deepEqual(months[10], ["2026-09", 1]);
	assert.deepEqual(months[0], ["2025-11", 0]);
	let stats = d.aggregate(sample(), { now: NOW });
	let board = d.chartsBoard(stats);
	// 閱讀進度 first: the read share, one square per paper by status (scaled to 10), the legend
	assert.ok(board.startsWith("> [!zm-board] 圖表\n> > [!zm-chart] 閱讀進度\n> > **29%** 已讀完成  \n> > ⬜⬜🟨🟩🟦  \n> > ⚪ 待讀 2 · 🟡 閱讀中 1 · 🟢 已讀 1 · 🔵 已引用 1\n"), board);
	assert.match(board, /> > \[!zm-chart\] 研究設計\n> > ```mermaid\n> > pie showData\n/);
	assert.match(board, /> > {5}"RCT" : 2\n/);
	assert.match(board, /> > \[!zm-chart\] 證據等級（CEBM，1 最強）\n> > L2 ▰▰▰▰▰▰▰▰▰▰ 1 {2}\n/);
	assert.match(board, /> > \[!zm-chart\] 出版年份\n> > 2024 ▰▰▰▰▰▰▰▰▰▰ 7$/m);
	assert.match(board, /> > \[!zm-chart\] 每月新增（近 12 個月）\n> > \*\*\d+ 篇\*\* {2}\n> > `[▁-█]{12}` {2}\n> > 2025-11 → 2026-10；最多 /);
	assert.equal(d.sparkline([0, 1, 2, 4, 0]), "▁▃▅█▁");
	assert.equal(d.sparkline([0, 0]), "▁▁");
	let titles = [...board.matchAll(/^> > \[!zm-chart\] (.+)$/gm)].map(m => m[1]);
	assert.deepEqual(titles, ["閱讀進度", "研究設計", "證據等級（CEBM，1 最強）", "評讀結果", "出版年份", "每月新增（近 12 個月）"]);
	assert.match(board, /> > \[!zm-chart\] 評讀結果\n> > 納入 ▰▰▰▰▰▰▰▰▰▰ 2 {2}\n> > 需更多資訊 ▰▰▰▰▰▱▱▱▱▱ 1\n/);
	// The status bar scales to ten squares, every status keeps one
	assert.deepEqual(d.statusBar([["待讀", 30], ["閱讀中", 1], ["已讀", 9], ["已引用", 0]]), ["⬜⬜⬜⬜⬜⬜⬜⬜🟨🟩🟩", "⚪ 待讀 30 · 🟡 閱讀中 1 · 🟢 已讀 9"]);
	assert.deepEqual(d.statusBar([]), []);
	// The year chart keeps the last eight rows, the earlier ones summed
	assert.deepEqual(d.lastRows([["≤ 2010", 3], ...Array.from({ length: 10 }, (_, k) => [String(2011 + k), 1])], 8), [["≤ 2013", 6], ["2014", 1], ["2015", 1], ["2016", 1], ["2017", 1], ["2018", 1], ["2019", 1], ["2020", 1]]);
	assert.deepEqual(d.lastRows([["2024", 1]], 8), [["2024", 1]]);
	assert.equal(d.chartsBoard(d.aggregate([], { now: NOW })), "");
	let md = d.buildDashboardSection(stats, { now: NOW, layout: "board" });
	assert.ok(md.indexOf("> [!zm-board] 總覽") < md.indexOf("> [!zm-board] 圖表"));
	assert.ok(md.indexOf("> [!zm-board] 圖表") < md.indexOf("> [!zm-ref]- 閱讀進度"));
	assert.doesNotMatch(d.buildDashboardSection(stats, { now: NOW, layout: "classic" }), /zm-chart/);
});

test("the 看板 dashboard: the folded update note, 總覽, 圖表, 待處理 cards, the gap map, then every table folded; empty vaults say how to start", () => {
	let stats = d.aggregate(sample(), { now: NOW });
	let reviews = [{ title: "跌倒預防系統性回顧", link: "Zotero/30 評讀與綜整/跌倒", prisma: { identified: 412, screened: 318, assessed: 46, included: 12 } }];
	let md = d.buildDashboardSection(stats, { now: NOW, layout: "board", reviews, baseLink: "Zotero/90 系統/研究儀表板.base",
		latestReport: { date: "2026-10-01", link: "Zotero/40 寫作/進度報告/2026-10-01" }, concepts: "## 🧠 熱門概念\n\n概念內容", usage: null });
	let tops = [...md.matchAll(/^> \[!([\w-]+)\](-?) (.+)$/gm)].map(m => `${m[1]}${m[2]} ${m[3]}`);
	assert.match(tops[0], /^zm-meta- 🔄 \d{4}-\d{2}-\d{2} \d{2}:\d{2} 更新$/);
	assert.deepEqual(tops.slice(1), ["zm-board 總覽", "zm-board 圖表", "zm-board 待處理",
		"zm-ref- 閱讀進度", "zm-ref- 證據概況", "zm-ref- 待處理清單", "zm-ref- 回顧專案", "zm-ref- 熱門概念", "zm-ref- AI 用量"]);
	// The update note keeps the refresh hint and the links
	assert.match(md, /^> \[!zm-meta\]- 🔄 [^\n]+\n> 由 ZotMax 依 vault 中的文獻筆記 frontmatter 產生。[^\n]+ {2}\n> Bases 檢視：\[\[Zotero\/90 系統\/研究儀表板\.base\|研究儀表板\.base\]\][^\n]* {2}\n> 最新進度報告（給指導教授）：\[\[Zotero\/40 寫作\/進度報告\/2026-10-01\|2026-10-01\]\]/);
	// 待處理: one card per kind with something in it, at most five rows
	let cards = [...md.matchAll(/^> > \[!(zm-(?:reading|issues|review|inbox))\] (.+)$/gm)].map(m => `${m[1]} ${m[2]}`);
	assert.deepEqual(cards.map(c => c.split(" ")[0]), ["zm-reading", "zm-issues", "zm-review", "zm-inbox"]);
	assert.match(md, /> > \[!zm-review\] 回顧專案（1）\n> > - \[\[Zotero\/30 評讀與綜整\/跌倒\|跌倒預防系統性回顧\]\]：納入 \*\*12\*\* 篇（412 → 318 → 46）/);
	assert.match(md, /> > \[!zm-issues\] 資料要補（\d+）\n> > [^-\n][^\n]+\n> >\n> > - /, "the counts line, then the papers");
	// No status pie in the folded 閱讀進度 (the chart has the statuses)
	assert.doesNotMatch(md, /title 閱讀狀態/);
	// The folded titles lose the headings' emoji (the snippet gives one icon)
	assert.doesNotMatch(md, /^> \[!zm-ref\]- [📖🔬📝🗂🧠🤖]/mu);
	// Long lists: five rows, then the rest counted
	assert.match(d.listCard("zm-reading", "t", ["- a", "- b", "- c", "- d", "- e", "- f", "- g"]), /> - e\n> - ……還有 2 篇$/);
	// No notes yet
	let empty = d.buildDashboardSection(d.aggregate([], { now: NOW }), { now: NOW, layout: "board" });
	assert.match(empty, /^> \[!zm-meta\]- [^\n]+\n[\s\S]*\n\n還沒有同步到 Obsidian 的文獻筆記。/);
	assert.doesNotMatch(empty, /zm-board/);
	// The gap map's caveat: folded in the 看板 layout, a warning in the classic one
	let rec = (title, i, o) => d.noteRecord(noteFM({ title }, Object.assign({ study: { intervention: i, outcomes: o, evidence_level: "2", study_design: "RCT" } }, AI), "已讀"), `Zotero/${title}.md`);
	let map = d.gapMap([rec("A", "運動", "跌倒"), rec("B", "運動", "跌倒")]);
	let boardMap = d.gapMapSection(map, { board: true });
	assert.match(boardMap, /> \[!zm-meta\]- 怎麼讀這張表 · 字詞層級的整理，不是系統性回顧\n> 列是介入（I）[^\n]+ {2}\n> 介入和結果指標/, "the how-to and the caveat folded at the end");
	assert.equal(boardMap.indexOf("列是介入"), boardMap.lastIndexOf("列是介入"), "the how-to only once");
	assert.ok(boardMap.indexOf("| 介入 ＼ 結果") < boardMap.indexOf("列是介入"), "the table first");
	assert.match(d.gapMapSection(map), /> \[!warning\] 這是字詞層級的整理/);
});
