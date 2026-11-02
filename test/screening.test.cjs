// Screening for systematic/scoping reviews: tags, deduplication, PRISMA 2020 counts and outputs (pure helpers)
const test = require("node:test");
const assert = require("node:assert/strict");
const s = require("../content/screening.js");
const core = require("../content/core.js");
const { mdToNotionBlocks } = require("../content/markdown.js");

const CFG = s.normalizeConfig({});
const T = {
	taIn: "篩選/標題摘要/納入", taEx: "篩選/標題摘要/排除", taMaybe: "篩選/標題摘要/待定",
	ftIn: "篩選/全文/納入", ftEx: "篩選/全文/排除", ftNR: "篩選/全文/無法取得", dup: "篩選/重複",
};
const POP = s.DEFAULT_REASONS[0];
const DESIGN = s.DEFAULT_REASONS[3];
const reason = r => "排除原因/" + r;

let nextID = 1;
function rec(tags, extra = {}) {
	let id = nextID++;
	return Object.assign({
		id, key: `KEY${id}`, title: `Paper ${id}`, year: "2024", tags, catalog: "",
		creators: [{ lastName: "Chen", firstName: "Mei", creatorType: "author" }],
		uri: `zotero://select/library/items/KEY${id}`,
	}, extra);
}

test("settings: reasons one per line, defaults when empty, prefixes", () => {
	assert.deepEqual(s.parseReasons("  族群不符\n\n- 介入不符\r\n族群不符\n"), ["族群不符", "介入不符"]);
	assert.deepEqual(s.normalizeConfig({ reasons: [] }).reasons, s.DEFAULT_REASONS);
	let cfg = s.normalizeConfig({ prefix: "Screen/", reasonPrefix: " ", reasons: ["A"] });
	assert.equal(cfg.prefix, "Screen/");
	assert.equal(cfg.reasonPrefix, "排除原因/");
	assert.equal(s.stageTag(cfg, "ft", "notRetrieved"), "Screen/全文/無法取得");
	assert.equal(s.duplicateTag(cfg), "Screen/重複");
	assert.ok(s.DEFAULT_REASONS.length <= s.MAX_MENU_REASONS);
});

test("readState: decisions, conflicts, reasons and sources from tags", () => {
	let st = s.readState([T.taIn, T.ftEx, reason(POP), "來源/PubMed", "其他標籤"], CFG);
	assert.equal(st.ta, "include");
	assert.equal(st.ft, "exclude");
	assert.deepEqual(st.reasons, [POP]);
	assert.deepEqual(st.sources, ["PubMed"]);
	assert.equal(st.duplicate, false);
	assert.equal(s.describeState(st), `標題摘要：納入｜全文：排除（${POP}）`);
	let conflict = s.readState([T.taIn, T.taEx], CFG);
	assert.equal(conflict.ta, "");
	assert.deepEqual(conflict.taAll, ["include", "exclude"]);
	assert.equal(s.describeState(conflict), "標題摘要：納入／排除 ⚠️");
	assert.equal(s.describeState(s.readState([T.dup, T.taIn], CFG)), "重複（篩選前移除）");
	assert.equal(s.describeState(s.readState(["x"], CFG)), "");
	assert.ok(s.isScreeningTag(reason("whatever"), CFG));
	assert.ok(!s.isScreeningTag("來源/PubMed", CFG));
});

test("planChange: the newest decision wins and only screening tags change", () => {
	let apply = (tags, change) => {
		let p = s.planChange(tags, change, CFG);
		return tags.filter(t => !p.remove.includes(t)).concat(p.add).sort();
	};
	// Title/abstract decisions replace each other
	assert.deepEqual(apply([T.taMaybe, "keep"], { stage: "ta", decision: "include" }), ["keep", T.taIn].sort());
	// A full-text decision implies title/abstract include; the reason replaces an older one
	assert.deepEqual(apply([T.taMaybe, T.ftIn], { stage: "ft", decision: "exclude", reason: POP }),
		[T.taIn, T.ftEx, reason(POP)].sort());
	assert.deepEqual(apply([T.taIn, T.ftEx, reason(POP)], { stage: "ft", decision: "exclude", reason: DESIGN }),
		[T.taIn, T.ftEx, reason(DESIGN)].sort());
	// Including at full text drops the exclusion reason; excluding at title/abstract drops full text
	assert.deepEqual(apply([T.taIn, T.ftEx, reason(POP)], { stage: "ft", decision: "include" }), [T.taIn, T.ftIn].sort());
	assert.deepEqual(apply([T.taIn, T.ftEx, reason(POP), "x"], { stage: "ta", decision: "exclude" }), ["x", T.taEx].sort());
	// Maybe at title/abstract keeps full text (the count check flags it)
	assert.deepEqual(apply([T.taIn, T.ftIn], { stage: "ta", decision: "maybe" }), [T.ftIn, T.taMaybe].sort());
	assert.deepEqual(apply([T.taIn], { duplicate: true }), [T.taIn, T.dup].sort());
	assert.deepEqual(apply([T.taIn, T.dup], { duplicate: false }), [T.taIn]);
	assert.deepEqual(apply([T.taIn, T.ftEx, reason(POP), T.dup, "來源/PubMed", "x"], { clear: true }), ["x", "來源/PubMed"].sort());
	// No change → nothing to save
	assert.deepEqual(s.planChange([T.taIn], { stage: "ta", decision: "include" }, CFG), { add: [], remove: [] });
	assert.throws(() => s.planChange([], { stage: "ta", decision: "notRetrieved" }, CFG));
	assert.equal(s.describeChange({ stage: "ft", decision: "exclude", reason: POP }), `全文：排除（${POP}）`);
});

test("normalizeDOI and normalizeTitle", () => {
	assert.equal(s.normalizeDOI("https://doi.org/10.1000/ABC.123."), "10.1000/abc.123");
	assert.equal(s.normalizeDOI("doi: 10.1000/x%2Fy"), "10.1000/x/y");
	assert.equal(s.normalizeDOI("http://dx.doi.org/10.1000/xyz"), "10.1000/xyz");
	assert.equal(s.normalizeDOI("not a doi"), "");
	assert.equal(s.normalizeTitle("Effects of <i>Tai Chi</i> on Falls: A Randomised Trial."),
		s.normalizeTitle("effects of tai chi on falls — a randomised trial"));
	assert.equal(s.normalizeTitle("Café–Based Care"), "cafebasedcare");
	assert.equal(s.normalizeTitle("護理師主導的 跌倒預防"), "護理師主導的跌倒預防");
});

test("findDuplicates: DOI, then title + year; different DOIs never match by title", () => {
	let a = rec([], { title: "Nurse-led fall prevention in older adults", doi: "10.1000/a", hasAbstract: true, dateAdded: "2024-01-02" });
	let b = rec([], { title: "Nurse led fall prevention in older adults.", doi: "", dateAdded: "2024-01-01" });
	let c = rec([], { title: "Something else entirely", doi: "https://doi.org/10.1000/A" });
	let d = rec([], { title: "Nurse-led fall prevention in older adults", year: "2023" });
	// Same title and year but each has its own DOI (e.g. an erratum)
	let e = rec([], { title: "Delirium screening in the ICU", doi: "10.1000/e1" });
	let f = rec([], { title: "Delirium screening in the ICU", doi: "10.1000/e2" });
	// Too short a title to match on
	let g = rec([], { title: "Editorial" });
	let h = rec([], { title: "Editorial" });
	// Already tagged as duplicate: the other one is kept
	let i = rec([T.dup], { title: "Music therapy for anxiety in ventilated patients", hasAbstract: true });
	let j = rec([T.taIn], { title: "Music therapy for anxiety in ventilated patients" });
	let groups = s.findDuplicates([a, b, c, d, e, f, g, h, i, j], CFG);
	assert.equal(groups.length, 2);
	let music = groups.find(gr => gr.keep === j);
	assert.deepEqual(music.duplicates, [i]);
	assert.deepEqual(music.basis, ["標題與年份相同"]);
	let falls = groups.find(gr => gr.keep === a);
	assert.deepEqual(falls.duplicates.map(r => r.id).sort(), [b.id, c.id].sort());
	assert.deepEqual(falls.basis.sort(), ["DOI 相同", "標題與年份相同"].sort());
	assert.ok(!groups.some(gr => [d, e, f, g, h].some(r => gr.keep === r || gr.duplicates.includes(r))));
});

test("pmidOf / firstPage / citationKeys: PMID from the record or Extra; journal, year, volume and first page only when all four are there", () => {
	assert.equal(s.pmidOf({ pmid: "37000000" }), "37000000");
	assert.equal(s.pmidOf({ extra: "DOI: 10.1/x\nPMID: 37000000\n" }), "37000000");
	assert.equal(s.pmidOf({ extra: "PMCID: PMC123" }), "");
	assert.equal(s.pmidOf({}), "");
	assert.equal(s.firstPage("45-56"), "45");
	assert.equal(s.firstPage("４５－５６"), "45");
	assert.equal(s.firstPage(" 45 – 56 "), "45");
	assert.equal(s.firstPage("e1023"), "e1023");
	assert.equal(s.firstPage("S12-S20"), "s12");
	assert.equal(s.firstPage(""), "");
	assert.equal(s.firstPage("n/a"), "");
	let r = { publication: "Hu li za zhi The journal of nursing", journalAbbreviation: "Hu Li Za Zhi", year: "2023", volume: "70", pages: "45-56" };
	assert.deepEqual(s.citationKeys(r), ["hulizazhithejournalofnursing|2023|70|45", "hulizazhi|2023|70|45"]);
	assert.deepEqual(s.citationKeys(Object.assign({}, r, { journalAbbreviation: "HU LI ZA ZHI." })), ["hulizazhithejournalofnursing|2023|70|45", "hulizazhi|2023|70|45"]);
	for (let missing of ["volume", "pages", "year"]) assert.deepEqual(s.citationKeys(Object.assign({}, r, { [missing]: "" })), [], missing);
	assert.deepEqual(s.citationKeys(Object.assign({}, r, { publication: "", journalAbbreviation: "" })), []);
});

test("findDuplicates: the same PMID, or the same journal, year, volume and first page; partial data never matches; candidates only", () => {
	// Same PMID (one from the record, one from Extra), different titles: a PubMed and an Airiti copy
	let pm1 = rec([], { title: "[Effects of a nurse-led fall prevention program]", pmid: "37000000", hasAbstract: true });
	let pm2 = rec([], { title: "護理人員跌倒預防衛教之成效", extra: "PMID: 37000000" });
	let pm3 = rec([], { title: "Another paper on falls in hospitals", extra: "PMID: 37000001" });
	// Same journal, year, volume and first page after normalization (case, spacing, punctuation, en dash, full-width)
	let c1 = rec([], { title: "Delirium screening by nurses in the ICU", publication: "Journal of Critical Care Nursing", volume: "12", pages: "101-110" });
	let c2 = rec([], { title: "ICU delirium screening by nursing staff", publication: "journal of critical-care nursing.", volume: " 12 ", pages: "１０１–１１０" });
	// Partial data: missing volume, missing pages, missing year, other first page, other journal
	let p1 = rec([], { title: "Pressure injury prevention bundle", publication: "Wound Care Journal", volume: "", pages: "5-9" });
	let p2 = rec([], { title: "A bundle to prevent pressure injury", publication: "Wound Care Journal", volume: "", pages: "5-9" });
	let p3 = rec([], { title: "Oral care and pneumonia prevention", publication: "Nursing Times", volume: "3", pages: "" });
	let p4 = rec([], { title: "Pneumonia prevention with oral care", publication: "Nursing Times", volume: "3", pages: "" });
	let p5 = rec([], { title: "Hand hygiene audit in wards", publication: "Infection Nursing", volume: "8", pages: "20-25", year: "" });
	let p6 = rec([], { title: "Auditing hand hygiene on wards", publication: "Infection Nursing", volume: "8", pages: "20-25", year: "" });
	let p7 = rec([], { title: "Sleep quality in ICU nurses", publication: "Sleep Nursing", volume: "4", pages: "30-35" });
	let p8 = rec([], { title: "ICU nurses and their sleep", publication: "Sleep Nursing", volume: "4", pages: "36-40" });
	let p9 = rec([], { title: "Burnout among nurses in Taiwan", publication: "Nursing Research", volume: "4", pages: "30-35" });
	let groups = s.findDuplicates([pm1, pm2, pm3, c1, c2, p1, p2, p3, p4, p5, p6, p7, p8, p9], CFG);
	assert.equal(groups.length, 2);
	let pmid = groups.find(g => [g.keep, ...g.duplicates].includes(pm1));
	assert.deepEqual([pmid.keep, ...pmid.duplicates].map(r => r.id).sort(), [pm1.id, pm2.id].sort());
	assert.deepEqual(pmid.basis, ["PMID 相同"]);
	assert.equal(pmid.note, "可能是中英文版本，請確認", "a Chinese and an English title");
	let cite = groups.find(g => [g.keep, ...g.duplicates].includes(c1));
	assert.deepEqual([cite.keep, ...cite.duplicates].map(r => r.id).sort(), [c1.id, c2.id].sort());
	assert.deepEqual(cite.basis, ["期刊、年、卷、起始頁相同"]);
	assert.equal(cite.note, undefined, "two English titles: no note");
	for (let r of [pm3, p1, p2, p3, p4, p5, p6, p7, p8, p9]) assert.ok(!groups.some(g => g.keep === r || g.duplicates.includes(r)), r.title);
	// Nothing in the records changes (no merge, no tag): the groups only point at them
	assert.deepEqual(pm2.tags, []);

	// The abbreviation counts as the journal's name: the Airiti copy (journal in Chinese, abbreviation as NLM writes it) and the PubMed copy
	let airiti = rec([], { title: "護理人員跌倒預防衛教之成效", publication: "護理雜誌", journalAbbreviation: "Hu Li Za Zhi", year: "2023", volume: "70", pages: "45-56" });
	let pubmed = rec([], { title: "[Effects of a nurse-led fall prevention program].", publication: "Hu li za zhi The journal of nursing", journalAbbreviation: "Hu Li Za Zhi", year: "2023", volume: "70", pages: "45-56" });
	let other = rec([], { title: "護理人員之睡眠品質", publication: "護理雜誌", year: "2023", volume: "70", pages: "45-56" });
	groups = s.findDuplicates([airiti, pubmed, other], CFG);
	assert.equal(groups.length, 1);
	assert.deepEqual([groups[0].keep, ...groups[0].duplicates].map(r => r.id).sort(), [airiti.id, pubmed.id, other.id].sort(),
		"護理雜誌 2023;70:45 is one article: the third record matches the Airiti one by journal name");
	assert.deepEqual(groups[0].basis, ["期刊、年、卷、起始頁相同"]);
	assert.equal(groups[0].note, "可能是中英文版本，請確認");

	// Several bases in one group are all listed
	let x = rec([], { title: "Music therapy for anxiety in ventilated patients", doi: "10.1000/m", pmid: "1", publication: "J Nurs", volume: "1", pages: "1-2" });
	let y = rec([], { title: "Music therapy for anxiety in ventilated patients.", doi: "10.1000/M", extra: "PMID: 1", publication: "J. Nurs.", volume: "1", pages: "1-9" });
	groups = s.findDuplicates([x, y], CFG);
	assert.deepEqual(groups[0].basis.sort(), ["DOI 相同", "PMID 相同", "標題與年份相同", "期刊、年、卷、起始頁相同"].sort());
	assert.equal(groups[0].note, undefined);
	// Two different DOIs on one page are two articles (a letter and the authors' reply): no group
	let letter = rec([], { title: "Letter A on trial X", year: "2020", doi: "10.1056/NEJMc2001", publication: "N Engl J Med", volume: "382", pages: "1234-1236" });
	let reply = rec([], { title: "Reply to letters on trial X", year: "2020", doi: "10.1056/NEJMc2002", publication: "N Engl J Med", volume: "382", pages: "1234-1236" });
	assert.deepEqual(s.findDuplicates([letter, reply], CFG), []);
	// A copy without a DOI still matches the record that has one
	let noDoi = rec([], { title: "Letter A on trial X (copy)", year: "2020", publication: "N Engl J Med", volume: "382", pages: "1234" });
	groups = s.findDuplicates([letter, noDoi], CFG);
	assert.deepEqual(groups.map(g => g.basis), [["期刊、年、卷、起始頁相同"]]);
	// Different issues (a journal that starts each issue at page 1): no group; one issue missing still matches
	let i1 = rec([], { title: "Effect A on B", year: "2020", publication: "J Foo", volume: "12", issue: "1", pages: "5-9" });
	let i2 = rec([], { title: "Totally different C on D", year: "2020", publication: "J Foo", volume: "12", issue: "2", pages: "5-12" });
	let i3 = rec([], { title: "Effect of A on B", year: "2020", publication: "J Foo", volume: "12", issue: "", pages: "5-9" });
	assert.deepEqual(s.findDuplicates([i1, i2], CFG), []);
	assert.equal(s.findDuplicates([i1, i3], CFG).length, 1);
});

test("findDuplicates: the 中英文 note only for a Chinese and an English title, not Japanese or Korean", () => {
	let ja = rec([], { title: "日本語のタイトル", year: "2020", doi: "10.1000/a" });
	let en = rec([], { title: "English title", year: "2020", doi: "10.1000/a" });
	let ko = rec([], { title: "한국어 제목 漢字", year: "2020", doi: "10.1000/b" });
	let en2 = rec([], { title: "Korean paper in English", year: "2020", doi: "10.1000/b" });
	let zh = rec([], { title: "中文篇名", year: "2020", doi: "10.1000/c" });
	let jaLatin = rec([], { title: "COVID-19 と看護", year: "2020", doi: "10.1000/c" });
	let groups = s.findDuplicates([ja, en, ko, en2, zh, jaLatin], CFG);
	assert.equal(groups.length, 3);
	for (let g of groups) assert.equal(g.note, undefined, g.keep.title);
});

function review() {
	nextID = 1;
	let records = [
		rec([T.dup, "來源/PubMed"]),
		rec([T.dup, T.taIn, "來源/CINAHL"]), // duplicate with a decision → warning
		rec([T.taEx, "來源/PubMed"]),
		rec([T.taEx, "來源/PubMed"]),
		rec([T.taMaybe, "來源/CINAHL"]), // awaiting screening
		rec(["來源/CINAHL"]), // awaiting screening
		rec([T.taIn, T.ftNR], { catalog: "PubMed" }), // not retrieved; source from Library Catalog
		rec([T.taIn, T.ftEx, reason(POP)]),
		rec([T.taIn, T.ftEx, reason(DESIGN), reason(POP)]), // two reasons → the first in the settings counts
		rec([T.taIn, T.ftEx]), // no reason
		rec([T.ftEx, reason("自訂原因")]), // full text without title/abstract include
		rec([T.taIn, T.ftIn, "來源/PubMed"]),
		rec([T.taIn, T.ftIn, reason(POP)]), // reason on an included item
		rec([T.taIn]), // awaiting full text
		rec([T.taIn, T.taEx]), // conflict → awaiting screening
	];
	return { records, result: s.computePrisma(records, CFG) };
}

test("computePrisma: PRISMA 2020 counts, reasons, sources and consistency issues", () => {
	let { records, result } = review();
	assert.deepEqual(result.counts, {
		identified: 15, duplicates: 2, screened: 13, taExcluded: 2, taPending: 3,
		sought: 8, notRetrieved: 1, assessed: 7, ftExcluded: 4, ftPending: 1, included: 2,
	});
	assert.deepEqual(s.checkCounts(result.counts, result.reasons), []);
	assert.deepEqual(result.reasons, [[POP, 2], ["自訂原因", 1], [s.NO_REASON, 1]]);
	assert.deepEqual(result.sources, [["PubMed", 5], ["CINAHL", 3], [s.NO_SOURCE, 7]]);
	assert.deepEqual(result.included.map(r => r.id), [12, 13]);
	let ids = code => (result.issues.find(i => i.code === code) || { records: [] }).records.map(r => r.id);
	assert.deepEqual(ids("duplicateDecided"), [2]);
	assert.deepEqual(ids("taConflict"), [15]);
	assert.deepEqual(ids("ftWithoutTA"), [11]);
	assert.deepEqual(ids("noReason"), [10]);
	assert.deepEqual(ids("manyReasons"), [9]);
	assert.deepEqual(ids("reasonWithoutExclude"), [13]);
	assert.deepEqual(ids("taPending"), [5, 6, 15]);
	assert.deepEqual(ids("ftPending"), [14]);
	assert.deepEqual(result.issues.map(i => i.level), ["warn", "warn", "warn", "warn", "warn", "warn", "info", "info"]);
	assert.equal(records.length, 15);
	// A clean review has no issues
	nextID = 100;
	let clean = s.computePrisma([rec([T.taIn, T.ftIn]), rec([T.taEx]), rec([T.dup])], CFG);
	assert.deepEqual(clean.issues, []);
	assert.equal(s.issuesMarkdown(clean.issues), "- ✅ 計數一致，沒有發現問題。");
	// checkCounts catches arithmetic that doesn't add up
	assert.equal(s.checkCounts(Object.assign({}, clean.counts, { included: 5 }), clean.reasons).length, 1);
});

test("buildMermaid: the PRISMA 2020 flow with sources, reasons and awaiting boxes", () => {
	let { result } = review();
	let m = s.buildMermaid(result);
	assert.match(m, /^flowchart TD\n/);
	assert.match(m, /identified\["Records identified from databases and registers<br\/>\(n = 15\)<br\/>PubMed \(n = 5\)<br\/>CINAHL \(n = 3\)<br\/>未標示來源 \(n = 7\)"\]/);
	assert.match(m, /removed\["Records removed before screening:<br\/>Duplicate records removed \(n = 2\)"\]/);
	assert.match(m, /screened\["Records screened<br\/>\(n = 13\)"\]/);
	assert.match(m, /excluded\["Records excluded<br\/>\(n = 2\)"\]/);
	assert.match(m, /sought\["Reports sought for retrieval<br\/>\(n = 8\)"\]/);
	assert.match(m, /notRetrieved\["Reports not retrieved<br\/>\(n = 1\)"\]/);
	assert.match(m, /assessed\["Reports assessed for eligibility<br\/>\(n = 7\)"\]/);
	assert.ok(m.includes(`reportsExcluded["Reports excluded (n = 4):<br/>${POP} (n = 2)<br/>自訂原因 (n = 1)<br/>未註明原因 (n = 1)"]`));
	assert.match(m, /included\["Studies included in review<br\/>\(n = 2\)/);
	assert.match(m, /taPending\["Records awaiting screening<br\/>\(n = 3\)"\]:::pending/);
	assert.match(m, /assessed -\.-> ftPending/);
	for (let edge of ["identified --> removed", "identified --> screened", "screened --> excluded", "screened --> sought",
		"sought --> notRetrieved", "sought --> assessed", "assessed --> reportsExcluded", "assessed --> included"]) {
		assert.ok(m.includes(edge), edge);
	}
	// Quotes and angle brackets can't break the label
	nextID = 200;
	let odd = s.computePrisma([rec([T.taIn, T.ftEx, reason("Age \"<18\" years")])], CFG);
	assert.ok(s.buildMermaid(odd).includes("Age #quot;#lt;18#quot; years (n = 1)"));
	// Without named sources there is no per-source list, and no awaiting boxes when complete
	let plain = s.buildMermaid(s.computePrisma([rec([T.taIn, T.ftIn])], CFG));
	assert.ok(plain.includes("identified[\"Records identified from databases and registers<br/>(n = 1)\"]"));
	assert.doesNotMatch(plain, /pending/);
});

test("evidence table, CSV and the counts table", () => {
	nextID = 300;
	let r1 = rec([], { title: "Tai chi | balance", year: "2023", publication: "J Nurs", doi: "10.1000/t",
		creators: [{ lastName: "Wang", creatorType: "author" }, { lastName: "Lee", creatorType: "author" }] });
	let r2 = rec([], { title: "Exercise", year: "2021" });
	let study = {
		study_design: "RCT", sample_size: 120, setting: "醫學中心內科病房", country: "Taiwan", population: "65 歲以上住院病人",
		intervention: "Tai chi", comparison: "常規照護", outcomes: "跌倒發生率\n平衡", measures: ["Berg Balance Scale", "FES-I"],
		evidence_level: "2", jbi_level: "1.c", appraisal_tool: "JBI Checklist for RCTs", appraisal_overall: "納入",
	};
	let rows = s.sortRows([s.evidenceRow(r1, study, "Zotero/wang2023taichi"), s.evidenceRow(r2, null, "")]);
	assert.deepEqual(rows.map(r => r.citation), ["Chen, 2021", "Wang & Lee, 2023"]);
	let md = s.evidenceTable(rows, { links: true });
	let lines = md.split("\n");
	assert.equal(lines[0], "| 文獻 | 研究設計 | 樣本數 | 場域／國家 | 族群 | 介入／對照 | 結果指標 | 證據等級 | JBI 評讀 |");
	assert.equal(lines[2], "| Chen, 2021 | （無結構化資料） |  |  |  |  |  |  |  |");
	assert.equal(lines[3], "| [[Zotero/wang2023taichi\\|Wang & Lee, 2023]] | RCT | 120 | 醫學中心內科病房；Taiwan | 65 歲以上住院病人 | Tai chi；對照：常規照護 | 跌倒發生率 平衡 | CEBM 2；JBI 1.c | 納入（JBI Checklist for RCTs） |");
	assert.ok(s.evidenceTable(rows, { links: false }).includes("| Wang & Lee, 2023 | RCT |"));
	assert.equal(s.evidenceTable([], {}), "（還沒有全文納入的研究）");

	let csv = s.buildCSV(rows);
	assert.ok(csv.startsWith("﻿文獻,作者,年份,標題,期刊,DOI,研究設計,樣本數,"));
	assert.ok(csv.endsWith("\r\n"));
	let csvLines = csv.slice(1).split("\r\n");
	assert.equal(csvLines.length, 4);
	assert.ok(csvLines[2].startsWith("\"Wang & Lee, 2023\",Wang; Lee,2023,Tai chi | balance,J Nurs,10.1000/t,RCT,120,醫學中心內科病房,Taiwan,"));
	assert.ok(csvLines[2].includes(",\"跌倒發生率\n平衡\",Berg Balance Scale; FES-I,2,1.c,JBI Checklist for RCTs,納入,zotero://select/library/items/KEY300"));
	assert.equal(s.csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
	assert.equal(s.csvCell("-5"), "-5");
	assert.equal(s.csvCell("@me"), "'@me");

	let { result } = review();
	let table = s.countsTable(result);
	assert.ok(table.includes("| 辨識 | Records identified from databases and registers | 15 |"));
	assert.ok(table.includes("|  | └ PubMed | 5 |"));
	assert.ok(table.includes(`|  | └ ${POP} | 2 |`));
	assert.ok(table.includes("| 標題摘要 | Records awaiting screening（尚未篩選／待定） | 3 |"));
	assert.ok(table.includes("| 納入 | Studies included in review | 2 |"));
});

test("review note (看板): the stages as number cards, 篩選進度 with the checks, the flow open, the tables folded; the classes", () => {
	let { result } = review();
	let meta = { name: "跌倒預防 SR", title: "跌倒預防 SR：篩選與 PRISMA 2020", collectionKey: "library/collections/COLL1234", layout: "board",
		uri: "zotero://select/library/collections/COLL1234", generatedAt: "2026-10-08T01:02:03.000Z", csvPath: "Zotero/Reviews/跌倒預防 SR 證據表.csv", links: true };
	let rows = [{ citation: "Lee, 2021", design: "RCT", evidenceLevel: "2", hasData: true }, { citation: "Chen, 2020", design: "RCT", evidenceLevel: "1", hasData: true }];
	let md = s.buildReviewSection(result, rows, meta);
	assert.ok(md.startsWith("> [!zm-meta]- 🧭 PRISMA 2020 · 跌倒預防 SR · 15 筆 · 2026-10-08 產生\n> 由 ZotMax 依分類「跌倒預防 SR」的篩選標籤產生"), md.slice(0, 120));
	assert.deepEqual([...md.matchAll(/^> > \[!zm-kpi\] (.+)$/gm)].map(m => m[1]), ["辨識", "標題摘要篩選", "全文評估", "納入"]);
	assert.match(md, /> > \[!zm-kpi\] 納入\n> > \*\*2 篇\*\*/);
	assert.match(md, /> > \[!zm-chart\] 篩選進度\n> > 標題摘要 [▰▱]{10} \d+% {2}\n> > 全文 [▰▱]{10} \d+% {2}\n> > ⚠️ 有 \d+ 項要檢查\n/);
	assert.match(md, /> > \[!zm-chart\] 納入研究的設計\n> > RCT ▰{10} 2/);
	assert.match(md, /> > \[!zm-chart\] 證據等級（CEBM，1 最強）\n> > L1 ▰{10} 1 {2}\n> > L2 ▰{10} 1/);
	assert.match(md, /> > \[!zm-next\|wide\] 一致性檢查（\d+）\n> > - ⚠️ 同時有多個標題摘要決定/);
	let order = ["> [!zm-board] PRISMA 2020", "> [!zm-board] 篩選進度", "## PRISMA 2020 流程圖\n\n```mermaid\nflowchart TD", "> [!zm-ref]- PRISMA 2020 計數表", "> [!zm-ref]- 證據表（納入研究 2 篇）"].map(h => md.indexOf(h));
	assert.ok(order.every((at, k) => at > 0 && (!k || at > order[k - 1])), JSON.stringify(order));
	assert.doesNotMatch(md, /\[!info\]/);
	// Notion and the classic layout keep the sections
	assert.match(s.buildReviewSection(result, rows, Object.assign({}, meta, { layout: "classic" })), /^> \[!info\]/);
	// The classes: ours with the user's; back to classic drops ours
	let note = s.buildReviewNote(null, s.frontmatterFor(result, meta), meta.title, md, undefined, { layout: "board" });
	assert.match(note, /\ncssclasses:\n {2}- "zotmax-note"\n {2}- "zm-review"\n/);
	let mine = note.replace('  - "zm-review"\n', '  - "zm-review"\n  - "wide-page"\n');
	assert.match(s.buildReviewNote(mine, s.frontmatterFor(result, meta), meta.title, md, undefined, { layout: "classic" }), /\ncssclasses:\n {2}- "wide-page"\n/);
	assert.doesNotMatch(s.buildReviewNote(null, s.frontmatterFor(result, meta), meta.title, md), /cssclasses/, "no layout given: no classes (citation chase)");
});

test("review note: managed block and plugin frontmatter are rewritten, the user's content is kept", () => {
	let { result } = review();
	let meta = { name: "跌倒預防 SR", title: "跌倒預防 SR：篩選與 PRISMA 2020", collectionKey: "library/collections/COLL1234",
		uri: "zotero://select/library/collections/COLL1234", generatedAt: "2026-10-08T01:02:03.000Z", csvPath: "Zotero/Reviews/跌倒預防 SR 證據表.csv", links: true };
	let section = s.buildReviewSection(result, [], meta);
	assert.match(section, /^> \[!info\] 由 ZotMax 依分類「跌倒預防 SR」的 15 筆文獻於 2026-10-08 產生/);
	assert.ok(section.includes("```mermaid\nflowchart TD"));
	assert.ok(section.includes("## 一致性檢查\n\n- ⚠️ 同時有多個標題摘要決定，視為尚未篩選（1 筆）：[Paper 15](zotero://select/library/items/KEY15)\n"));
	assert.ok(section.includes("\n- ⚠️ 標記為重複，但也有篩選決定（以重複計算，不列入篩選）（1 筆）：[Paper 2](zotero://select/library/items/KEY2)"));
	assert.ok(section.includes("- ℹ️ 尚未完成標題摘要篩選（沒有決定或「待定」）（3 筆）："));
	assert.ok(section.includes("## 證據表（納入研究 0 篇）\n\n（還沒有全文納入的研究）"));

	let fm = s.frontmatterFor(result, meta);
	let note = s.buildReviewNote(null, fm, meta.title, section);
	let parsed = core.splitFrontmatter(note);
	assert.equal(core.frontmatterScalar(parsed.frontmatter, "type"), "review-screening");
	assert.equal(core.frontmatterScalar(parsed.frontmatter, "zotero_collection"), "library/collections/COLL1234");
	assert.equal(core.frontmatterScalar(parsed.frontmatter, "prisma_included"), "2");
	assert.equal(core.frontmatterScalar(parsed.frontmatter, "prisma_excluded_fulltext"), "4");
	assert.ok(parsed.frontmatter.includes("tags:\n  - \"系統性回顧\""));
	assert.ok(!/^notion:/m.test(parsed.frontmatter), "empty values are left out");
	assert.ok(parsed.body.startsWith("\n# 跌倒預防 SR：篩選與 PRISMA 2020\n\n%% zotero-bridge:start"));
	assert.ok(note.endsWith("%% zotero-bridge:end %%\n\n## ✍️ 我的筆記\n\n"));

	// The user edits the note: own frontmatter key, a Notion link from an earlier run, notes outside the block
	let edited = note
		.replace("type: \"review-screening\"", "type: \"review-screening\"\nmy_key: \"mine\"\nnotion: \"https://www.notion.so/old\"")
		.replace("%% zotero-bridge:start", "我的前言\n\n%% zotero-bridge:start")
		.replace("## ✍️ 我的筆記\n\n", "## ✍️ 我的筆記\n\n討論紀錄\n");
	nextID = 400;
	let next = s.computePrisma([rec([T.taIn, T.ftIn])], CFG);
	let again = s.buildReviewNote(edited, s.frontmatterFor(next, meta), meta.title, s.buildReviewSection(next, [], meta));
	let fm2 = core.splitFrontmatter(again).frontmatter;
	assert.equal(core.frontmatterScalar(fm2, "my_key"), "mine");
	assert.equal(core.frontmatterScalar(fm2, "notion"), "https://www.notion.so/old");
	assert.equal(core.frontmatterScalar(fm2, "prisma_identified"), "1");
	assert.ok(again.includes("我的前言\n\n%% zotero-bridge:start"));
	assert.ok(again.includes("## ✍️ 我的筆記\n\n討論紀錄\n"));
	assert.ok(again.includes("| 辨識 | Records identified from databases and registers | 1 |"));
	assert.ok(!again.includes("| 15 |"));
	assert.equal(again.match(/zotero-bridge:start/g).length, 1);
	// Same input → same text (nothing to write)
	assert.equal(s.buildReviewNote(again, s.frontmatterFor(next, meta), meta.title, s.buildReviewSection(next, [], meta)), again);
	// A note made as Zotero Bridge (≤ 0.10): the same block is rebuilt, under the new name
	const asOld = text => text.split("ZotMax").join("Zotero Bridge");
	assert.match(asOld(edited), /由 Zotero Bridge 依分類/);
	let fromOld = s.buildReviewNote(asOld(edited), s.frontmatterFor(next, meta), meta.title, s.buildReviewSection(next, [], meta));
	assert.equal(fromOld, again);
	// Markers removed by the user: a fresh block after the heading
	let noMarkers = again.replace(/%% zotero-bridge:start[\s\S]*%% zotero-bridge:end %%/, "");
	let restored = s.buildReviewNote(noMarkers, s.frontmatterFor(next, meta), meta.title, "NEW");
	assert.match(restored, /# 跌倒預防 SR：篩選與 PRISMA 2020\n\n%% zotero-bridge:start.*%%\n\nNEW\n\n%% zotero-bridge:end %%/);
});

test("Notion blocks: real tables and a Mermaid code block", () => {
	let { result } = review();
	let blocks = s.notionBlocks(s.buildReviewSection(result, [], { name: "R", generatedAt: "2026-10-08", links: false }), mdToNotionBlocks);
	let code = blocks.find(b => b.type === "code");
	assert.equal(code.code.language, "mermaid");
	let table = blocks.find(b => b.type === "table");
	assert.equal(table.table.table_width, 3);
	assert.equal(table.table.has_column_header, true);
	assert.equal(blocks.filter(b => b.type === "heading_2").length, 4);
});

test("檢索紀錄對帳 in the PRISMA note: the log next to the tags (plain, board, Notion); identified stays the tag count", () => {
	const log = require("../content/search-log.js");
	let { result } = review();
	let before = JSON.stringify(result.counts);
	let entry = f => log.normalizeEntry(Object.assign({ createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }, f));
	// The log says PubMed returned 300 and 40 were imported; CINAHL 3; Zotero has 4 tagged 來源/PubMed (PRISMA's 5
	// also counts one record by its Library Catalog, which is not a tag) and 3 tagged 來源/CINAHL
	let entries = [entry({ database: "PubMed", hits: 300, imported: 40, date: "2026-09-30" }), entry({ database: "CINAHL", hits: 3, date: "2026-09-30" })];
	let rec = log.reconcile(entries, result, CFG);
	assert.equal(JSON.stringify(result.counts), before, "reconcile never changes the counts");
	assert.equal(result.counts.identified, 15, "identified is the tag count, not the log total");
	assert.equal(rec.issue.code, "logMismatch");
	assert.match(rec.issue.message, /PubMed：日誌記匯入 40 筆，Zotero 有 4 筆標了 來源\/PubMed/);
	let meta = { name: "跌倒預防 SR", generatedAt: "2026-10-08T01:02:03.000Z", links: true,
		searchLog: { entries, link: "Zotero/Reviews/檢索日誌/跌倒預防 SR", hasLog: true, rec } };
	let issues = Object.assign({}, result, { issues: [...result.issues, rec.issue] });
	let plain = s.buildReviewSection(issues, [], Object.assign({}, meta, { layout: "classic" }));
	// After 一致性檢查 (where the warning is listed), before the evidence table
	let at = h => plain.indexOf(h);
	assert.ok(at("## 一致性檢查") < at("## 檢索紀錄對帳") && at("## 檢索紀錄對帳") < at("## 證據表"), plain);
	assert.match(plain, /- ⚠️ 檢索日誌和「來源\/」標籤的筆數對不上：PubMed：日誌記匯入 40 筆/);
	assert.match(plain, /\| PubMed \| 300 \| 40 \| 4 \| ⚠️ 匯入和標籤對不上 \|/);
	assert.match(plain, /\| CINAHL \| 3 \| — \| 3 \| ✓ 命中和標籤相同 \|/);
	assert.match(plain, /檢索日誌：\[\[Zotero\/Reviews\/檢索日誌\/跌倒預防 SR\\\|跌倒預防 SR 檢索日誌\]\]/);
	// The PRISMA counts table still says 15
	assert.match(plain, /\| 辨識 \| Records identified from databases and registers \| 15 \|/);
	// Board: a 檢索 board before the flow diagram (the health check adds its card there)
	let board = s.buildReviewSection(issues, [], Object.assign({}, meta, { layout: "board" }));
	assert.match(board, /> \[!zm-board\] 檢索\n> > \[!zm-chart\|wide\] 檢索紀錄對帳\n> > PubMed · 命中 300 · 匯入 40 · 標籤 4 ⚠️ 匯入和標籤對不上/);
	assert.ok(board.indexOf("> [!zm-board] 檢索\n") < board.indexOf("## PRISMA 2020 流程圖"));
	assert.ok(board.indexOf("> [!zm-board] 篩選進度") < board.indexOf("> [!zm-board] 檢索\n"));
	// Notion: plain, no wikilink
	let notion = s.buildReviewSection(issues, [], Object.assign({}, meta, { links: false }));
	assert.match(notion, /## 檢索紀錄對帳/);
	assert.doesNotMatch(notion, /\[\[/);
	// No log yet: the line that says how to start one
	let none = Object.assign({}, meta, { searchLog: { entries: [], link: "", hasLog: false, rec: null } });
	assert.match(s.buildReviewSection(result, [], Object.assign({}, none, { layout: "classic" })), /## 檢索紀錄對帳\n\n還沒有檢索日誌：ZotMax → 檢索日誌（目前分類）…/);
	assert.match(s.buildReviewSection(result, [], Object.assign({}, none, { layout: "board" })), /> \[!zm-board\] 檢索\n> > \[!zm-next\|wide\] 檢索紀錄\n> > 還沒有檢索日誌/);
	// The log switched off (meta.searchLog null): nothing at all
	let off = s.buildReviewSection(result, [], { name: "R", generatedAt: "2026-10-08", layout: "board" });
	assert.doesNotMatch(off, /檢索紀錄|\[!zm-board\] 檢索\n/);
	assert.doesNotMatch(s.buildReviewSection(result, [], { name: "R", generatedAt: "2026-10-08", layout: "classic" }), /檢索紀錄/);
});

test("logMismatch is in the issue catalog, before the info-level ones; computePrisma never raises it", () => {
	let { result } = review();
	assert.ok(!result.issues.some(i => i.code === "logMismatch"));
	let src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "content", "screening.js"), "utf8");
	let catalog = [...src.matchAll(/^\t\t\["(\w+)", "(warn|info)", "/gm)].map(m => m[1]);
	assert.ok(catalog.indexOf("logMismatch") >= 0 && catalog.indexOf("logMismatch") < catalog.indexOf("taPending"), catalog.join(","));
	assert.equal(s.DEDUPE_RULE, "DOI、PMID、標題＋年份、期刊＋年＋卷＋起始頁（ZotMax 找重複）");
});

// ---------- 🩺 檢索健康檢查 ----------

const BANNED = ["查完了", "已完整", "足夠", "合格", "不及格", "分數", "紅燈", "綠燈"];
const included = (...sources) => rec([T.taIn, T.ftIn, ...sources.map(x => "來源/" + x)]);
const screened = (...sources) => rec([T.taEx, ...sources.map(x => "來源/" + x)]);
function health(records, extra = {}) {
	let prisma = s.computePrisma(records, CFG);
	return s.searchHealth(Object.assign({ prisma, cfg: CFG, rows: [], noData: 0, cardType: "", chase: { note: false },
		log: { databases: [], hasLog: true }, stopReason: "" }, extra));
}
const codes = h => h.flags.map(f => f.code);
// The user's log through search-log.js (formal searches only, 0-hit ones included)
function logOf(...entries) {
	const log = require("../content/search-log.js");
	let list = entries.map(e => log.normalizeEntry(Object.assign({ date: "2026-10-01", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }, e)));
	return { databases: log.databasesSearched(list), hasLog: list.some(e => e.kind === "search") };
}
// Every text the health check can show, checked raw
function allText(h) {
	return [s.healthMarkdown(h), s.healthMarkdown(h, { layout: "board" }), s.healthMarkdown(h, { notion: true, vault: true }),
		s.healthMarkdown(h, { notion: true })].join("\n");
}

test("computePrisma: untagged records (both columns) and the database column's 來源/ values without the catalog fallback", () => {
	let r = s.computePrisma([screened("PubMed"), screened("PubMed", "華藝"), rec([T.taEx], { catalog: "PubMed" }), screened("引文追蹤"), rec([T.taEx])], CFG);
	assert.equal(r.untagged, 2);
	assert.deepEqual(r.tagSources, [["PubMed", 2], ["華藝", 1]]);
	assert.deepEqual(r.sources, [["PubMed", 3], ["華藝", 1], ["未標示來源", 1]], "the existing sources are unchanged");
	assert.deepEqual(r.other.sources, [["引文追蹤", 1]]);
	assert.deepEqual(r.tagSets, [[["PubMed"], 1], [["PubMed", "華藝"], 1]], "the database column's tagged records by their 來源/ values");
});

test("health: ≥ 20% without a 來源/ tag says the databases can't be told (and skips the one-database rule)", () => {
	let h = health([screened("PubMed"), screened("PubMed"), screened("PubMed"), screened("PubMed"), rec([T.taEx], { catalog: "PubMed" })]);
	assert.deepEqual(codes(h), ["unknownSources"]);
	assert.equal(h.flags[0].text, "無法判斷用了哪些資料庫：1 筆（20%）沒有「來源/」標籤。請先替匯入的文獻加上來源標籤（例如「來源/PubMed」「來源/華藝」），再重新產生。");
	// Under 20%: the one-database rule speaks instead
	h = health([screened("PubMed"), screened("PubMed"), screened("PubMed"), screened("PubMed"), screened("PubMed"), rec([T.taEx])]);
	assert.deepEqual(codes(h), ["singleDatabase"]);
	assert.equal(h.flags[0].text, "目前只看到一個資料庫：PubMed。方法章要怎麼說明只查一個資料庫？要不要再查 CINAHL、Cochrane 或華藝？");
	// Nothing at all: no flag
	assert.deepEqual(codes(health([])), []);
});

test("health: one named database; Google Scholar is flagged in the database column but never moved", () => {
	let records = [screened("PubMed"), screened("PubMed"), screened("Google Scholar")];
	let h = health(records);
	assert.deepEqual(codes(h), ["singleDatabase", "scholarAsDatabase"]);
	assert.match(h.flags[0].text, /^目前只看到一個資料庫：PubMed。/);
	assert.equal(h.flags[1].text, "Google Scholar 算在「資料庫」欄（1 筆）。很多學校和期刊把它列為「其他方法」（補充檢索）；要不要改由你決定。要移到右欄：在設定的「其他方法的來源」加上「Google Scholar」（和「來源/」後面的字一字不差），這 1 筆就會移過去。");
	// computePrisma still counts Scholar in the database column
	let r = s.computePrisma(records, CFG);
	assert.equal(r.other, null);
	assert.deepEqual(r.sources, [["PubMed", 2], ["Google Scholar", 1]]);
	// The user moved it (設定 → 其他方法的來源): no Scholar flag, PubMed is still the only database
	let cfg = s.normalizeConfig({ otherSources: ["引文追蹤", "網站", "機構", "Google Scholar"] });
	h = s.searchHealth({ prisma: s.computePrisma(records, cfg), cfg, log: { databases: [], hasLog: true } });
	assert.deepEqual(codes(h), ["singleDatabase"]);
	// Two databases: silent; aliases count once (華藝 tag + Airiti Library in the log)
	assert.deepEqual(codes(health([screened("PubMed"), screened("CINAHL")])), []);
	h = health([screened("華藝"), screened("臺灣博碩士論文")], { log: logOf({ database: "Airiti Library", hits: 30 }) });
	assert.deepEqual(codes(h), []);
	h = health([screened("華藝")], { log: logOf({ database: "Airiti Library", hits: 30 }) });
	assert.deepEqual(codes(h), ["singleDatabase"]);
	// Other-method values in the database column are not databases
	assert.deepEqual(codes(health([screened("PubMed", "引文追蹤")])), ["singleDatabase"]);
	// The suggestions leave out the database already searched
	assert.equal(health([screened("CINAHL")]).flags[0].text, "目前只看到一個資料庫：CINAHL。方法章要怎麼說明只查一個資料庫？要不要再查 Cochrane、華藝或 PubMed？");
	assert.match(health([screened("華藝")]).flags[0].text, /要不要再查 CINAHL、Cochrane 或 PubMed？$/);
});

test("health: the Google Scholar advice promises a move only for what 其他方法的來源 can move", () => {
	let flagOf = (h) => h.flags.find(f => f.code === "scholarAsDatabase");
	let withScholar = s.normalizeConfig({ otherSources: ["引文追蹤", "Google Scholar"] });
	let run = (records, cfg = CFG) => s.searchHealth({ prisma: s.computePrisma(records, cfg), cfg, log: { databases: [], hasLog: true } });
	// A record tagged with Scholar and a database (a merged duplicate) stays in the database column: once the user
	// listed Google Scholar, the flag is silent
	let mixed = [screened("PubMed", "Google Scholar"), screened("PubMed"), screened("CINAHL"), screened("Google Scholar")];
	let r = s.computePrisma(mixed, withScholar);
	assert.deepEqual(r.other.sources, [["Google Scholar", 1]]);
	assert.equal(flagOf(run(mixed, withScholar)), undefined);
	// Before that: the movable record is promised, the mixed one only stated
	assert.equal(flagOf(run(mixed)).text, "Google Scholar 算在「資料庫」欄（1 筆）。很多學校和期刊把它列為「其他方法」（補充檢索）；要不要改由你決定。要移到右欄：在設定的「其他方法的來源」加上「Google Scholar」（和「來源/」後面的字一字不差），這 1 筆就會移過去。另有 1 筆同時標了其他資料庫，仍算在資料庫欄。");
	// Only mixed records: nothing the setting could move, silent
	assert.equal(flagOf(run([screened("PubMed", "Google Scholar"), screened("CINAHL")])), undefined);
	// An alias tag: the advice quotes the user's own spelling; with Google Scholar already listed, it says the two differ
	let alias = [screened("PubMed"), screened("CINAHL"), screened("Scholar")];
	assert.match(flagOf(run(alias)).text, /加上「Scholar」（和「來源\/」後面的字一字不差），這 1 筆就會移過去。$/);
	assert.match(flagOf(run(alias, withScholar)).text, /加上「Scholar」.*設定裡已有「Google Scholar」，但標籤寫的是「Scholar」，兩邊的字不一樣，所以沒有移。$/);
	let lower = [screened("PubMed"), screened("CINAHL"), screened("google scholar")];
	assert.match(flagOf(run(lower, withScholar)).text, /加上「google scholar」.*設定裡已有「Google Scholar」，但標籤寫的是「google scholar」/);
	// Listing the tag's own spelling moves it, and the flag goes quiet
	let listed = s.normalizeConfig({ otherSources: ["引文追蹤", "Google Scholar", "Scholar"] });
	assert.deepEqual(s.computePrisma(alias, listed).other.sources, [["Scholar", 1]]);
	assert.equal(flagOf(run(alias, listed)), undefined);
	// Untagged records counted through the Library Catalog: stated, with the tag they would need
	let tens = Array.from({ length: 9 }, (_, i) => screened(i % 2 ? "PubMed" : "CINAHL"));
	let catalog = [...tens, rec([T.taEx], { catalog: "Google Scholar" })];
	let h = run(catalog);
	assert.deepEqual(codes(h), ["scholarAsDatabase"]);
	assert.equal(flagOf(h).text, "Google Scholar 算在「資料庫」欄（1 筆）。很多學校和期刊把它列為「其他方法」（補充檢索）；要不要改由你決定。這 1 筆沒有「來源/」標籤，是依 Library Catalog 算成 Google Scholar；要移的話，先替它們加上「來源/Google Scholar」標籤，再在「其他方法的來源」加上「Google Scholar」。");
	assert.match(flagOf(run(catalog, withScholar)).text, /這 1 筆沒有「來源\/」標籤，是依 Library Catalog 算成 Google Scholar；要移的話，先替它們加上「來源\/Google Scholar」標籤。$/);
	// Never moved by the check itself
	assert.equal(s.computePrisma(catalog, CFG).other, null);
	for (let x of [run(mixed), run(alias, withScholar), run(catalog), run(catalog, withScholar)]) {
		for (let w of BANNED) assert.ok(!allText(x).includes(w), w);
	}
});

test("health: a 0-hit CINAHL search in the log is a second database and counts as CINAHL for a qualitative question", () => {
	let records = [screened("PubMed"), screened("PubMed")];
	assert.deepEqual(codes(health(records, { cardType: "meaning" })), ["singleDatabase", "qualitativeNoCinahl"]);
	let h = health(records, { cardType: "meaning" });
	assert.equal(h.flags[1].text, "這是質性（意義／經驗）問題，但來源和檢索日誌都沒有 CINAHL。護理的質性研究很多收在 CINAHL，要不要查一次？");
	let log = logOf({ database: "CINAHL Plus with Full Text", sourceTag: "CINAHL", platform: "EBSCOhost", hits: 0 });
	assert.equal(log.databases[0].hits, 0);
	assert.deepEqual(codes(health(records, { cardType: "meaning", log })), []);
	// An exploratory search is only a record: it does not count
	assert.deepEqual(codes(health(records, { cardType: "meaning", log: logOf({ database: "CINAHL", status: "exploratory", hits: 0 }) })), ["singleDatabase", "qualitativeNoCinahl"]);
	// A CINAHL tag, or a non-qualitative question: silent
	assert.deepEqual(codes(health([screened("PubMed"), screened("CINAHL")], { cardType: "meaning" })), []);
	assert.deepEqual(codes(health(records, { cardType: "treatment" })), ["singleDatabase"]);
});

test("health: included studies found only through Google Scholar, with up to 3 titles", () => {
	let only = [1, 2, 3, 4].map(n => rec([T.taIn, T.ftIn, "來源/Google Scholar"], { title: `Scholar study ${n}` }));
	let h = health([...only, included("PubMed", "Google Scholar"), screened("PubMed"), screened("CINAHL")]);
	let f = h.flags.find(x => x.code === "includedOnlyScholar");
	assert.equal(f.text, "有 4 篇納入研究只從 Google Scholar 找到：「Scholar study 1」、「Scholar study 2」、「Scholar study 3」 等。Google Scholar 的結果不容易重現，這幾篇在其他資料庫找得到嗎？");
	// Found in PubMed too: not only Scholar
	assert.ok(!codes(health([included("PubMed", "Google Scholar"), screened("CINAHL")])).includes("includedOnlyScholar"));
});

test("health: ≥ 3 RCTs without a systematic review or guideline; rows without a design are not counted and the card says how many", () => {
	let records = [included("PubMed"), included("CINAHL"), screened("引文追蹤")];
	let row = design => ({ design });
	let rcts = [row("Randomized controlled trial"), row("RCT"), row("隨機對照試驗")];
	let h = health(records, { rows: [...rcts, row(""), row("")], noData: 2 });
	assert.deepEqual(codes(h), ["rctsNoSR"]);
	assert.equal(h.flags[0].text, "納入研究有 3 篇 RCT，但沒有系統性回顧或指引。依 6S 先往上層找：這個題目已經有人做過系統性回顧或指引嗎？（2 篇納入研究沒有 AI 筆記，看不出研究設計，沒有算進去）");
	// A review or a guideline among them: silent
	assert.deepEqual(codes(health(records, { rows: [...rcts, row("Systematic review and meta-analysis")] })), []);
	assert.deepEqual(codes(health(records, { rows: [...rcts, row("臨床指引")] })), []);
	// Quasi-experimental and non-randomised designs are not RCTs
	assert.deepEqual(codes(health(records, { rows: [row("RCT"), row("RCT"), row("Quasi-experimental (non-randomized controlled trial)"), row("類實驗研究")] })), []);
	// Rule silent, studies without a design: the card still says they were not counted
	h = health(records, { rows: [row("RCT"), row("")], noData: 1 });
	assert.deepEqual(codes(h), []);
	assert.ok(h.lines.includes("判斷 RCT 和系統性回顧時，只算看得出研究設計的納入研究（1 篇納入研究沒有 AI 筆記，看不出研究設計，沒有算進去）。"), h.lines.join("\n"));
	// An AI note without a design is named differently
	h = health(records, { rows: [row("RCT"), row(""), row("")], noData: 1 });
	assert.match(h.lines[0], /（2 篇納入研究看不出研究設計（沒有 AI 筆記，或筆記沒有研究設計），沒有算進去）/);
});

test("health: no citation searching anywhere (tag, chase note, log); nothing included → silent", () => {
	let records = [included("PubMed"), screened("CINAHL")];
	let h = health(records, { chase: null });
	assert.deepEqual(codes(h), ["noCitationChasing"]);
	assert.equal(h.flags[0].text, "還沒有引文追蹤的紀錄（沒有「來源/引文追蹤」標籤、沒有引文追蹤筆記，檢索日誌也沒有）。可以用「引文追蹤：目前分類全文納入的研究」查參考文獻和被引用文獻。");
	assert.deepEqual(codes(health([...records, screened("引文追蹤")])), []);
	assert.deepEqual(codes(health(records, { chase: { note: true } })), []);
	assert.deepEqual(codes(health(records, { log: logOf({ database: "Scopus", method: "citation", hits: 12 }) })), []);
	assert.deepEqual(codes(health([screened("PubMed"), screened("CINAHL")])), []);
	// The 引文追蹤 feature switched off: the command is hidden, so the card says how to turn it on or check by hand
	for (let w of BANNED) assert.ok(!allText(health(records, { chase: { note: false, off: true } })).includes(w), w);
	assert.equal(health(records, { chase: { note: false, off: true } }).flags[0].text, "還沒有引文追蹤的紀錄（沒有「來源/引文追蹤」標籤、沒有引文追蹤筆記，檢索日誌也沒有）。可以用「引文追蹤：目前分類全文納入的研究」查參考文獻和被引用文獻（這個功能目前關著，要先到 設定 → 功能 打開「引文追蹤」），也可以自己翻納入研究的參考文獻。");
});

test("health: all seven codes in their order; the no-log and no-flag lines; PRESS fixed; the stop reason", () => {
	let records = [
		rec([T.taIn, T.ftIn, "來源/Google Scholar"], { title: "Only on Scholar" }),
		included("PubMed"), included("PubMed"), screened("PubMed"),
	];
	let h = health(records, { cardType: "meaning", rows: [{ design: "RCT" }, { design: "RCT" }, { design: "RCT" }], log: null });
	assert.deepEqual(codes(h), ["singleDatabase", "scholarAsDatabase", "includedOnlyScholar", "qualitativeNoCinahl", "rctsNoSR", "noCitationChasing"]);
	assert.equal(h.count, 6);
	assert.deepEqual(h.lines, ["還沒有檢索日誌：資料庫清單只看「來源/」標籤，查了 0 筆的資料庫不會出現。"]);
	let unknown = health([included("PubMed"), rec([T.taIn, T.ftIn])], { log: { databases: [], hasLog: false } });
	assert.equal(unknown.flags[0].code, "unknownSources");
	assert.ok(unknown.lines.includes("還沒有檢索日誌：資料庫清單只看「來源/」標籤，查了 0 筆的資料庫不會出現。"));
	// No flags: the line that denies completeness
	let quiet = health([screened("PubMed"), screened("CINAHL")]);
	assert.deepEqual(quiet.flags, []);
	assert.deepEqual(quiet.lines, ["沒有發現這幾類訊號：太多文獻沒有來源標籤、只有一個資料庫、Google Scholar 算在資料庫欄、納入研究只來自 Google Scholar、質性問題沒查 CINAHL、有 RCT 卻沒有系統性回顧或指引、沒有引文追蹤。這不代表檢索已經完整，請照下面 3 件事和館員或指導教授確認。"]);
	assert.deepEqual(s.PRESS_ITEMS, [
		"檢索式：每個概念的同義詞、主題詞（MeSH／CINAHL Headings）和自由詞都有嗎？AND、OR、括號和截字用對了嗎？",
		"資料庫與其他方法：這個題目還該查哪些資料庫、試驗登錄、灰色文獻或中文資料庫？",
		"限制與停止：年份、語言、文章類型的限制有理由嗎？什麼時候停止搜尋、為什麼？",
	]);
	assert.deepEqual(quiet.press, s.PRESS_ITEMS);
	assert.equal(s.PRESS_HEADING, "帶去給館員或指導教授看的 3 件事");
	// The card: plain section and board card
	let plain = s.healthMarkdown(h);
	assert.ok(plain.startsWith("## 🩺 檢索健康檢查\n\n只列客觀訊號和問題，不評等；要不要補查由你決定。\n\n- 目前只看到一個資料庫：PubMed。"), plain);
	assert.match(plain, /停止搜尋的理由：還沒寫。請在這份筆記的屬性 search_stop_reason 寫下來（重新產生 PRISMA 不會覆寫）。\n\n### 帶去給館員或指導教授看的 3 件事\n\n1\. 檢索式：.*\n2\. 資料庫與其他方法：.*\n3\. 限制與停止：.*$/);
	let written = health(records, { stopReason: "  連續兩次更新\n沒有新的納入研究 " });
	assert.equal(written.stopReason, "連續兩次更新 沒有新的納入研究");
	assert.match(s.healthMarkdown(written), /\n\n停止搜尋的理由（你寫的）：連續兩次更新 沒有新的納入研究\n\n/);
	// Notion: the vault's value, or where to write it; without a vault, plainly that the page can't show it
	assert.match(s.healthMarkdown(written, { notion: true, vault: true }), /\n\n停止搜尋的理由（你寫的）：連續兩次更新 沒有新的納入研究\n\n/);
	assert.match(s.healthMarkdown(h, { notion: true, vault: true }), /\n\n停止搜尋的理由：還沒寫。請在 Obsidian 的 PRISMA 筆記屬性 search_stop_reason 寫下來。\n\n/);
	for (let x of [h, written]) {
		assert.match(s.healthMarkdown(x, { notion: true }), /\n\n停止搜尋的理由要寫在 Obsidian 的 PRISMA 筆記屬性 search_stop_reason；還沒設定 Obsidian vault，所以這裡沒辦法顯示。\n\n/);
	}
	let board = s.healthMarkdown(h, { layout: "board" });
	assert.ok(board.startsWith("> [!zm-next|wide] 🩺 檢索健康檢查（6）\n> 只列客觀訊號和問題"), board);
	assert.match(board, /\n> ### 帶去給館員或指導教授看的 3 件事\n>\n> 1\. 檢索式：/);
	// No banned word anywhere, and nothing that sounds like a verdict
	for (let x of [h, unknown, quiet, written, health(records, { rows: [{ design: "RCT" }, { design: "" }], noData: 1 })]) {
		let text = allText(x);
		for (let w of BANNED) assert.ok(!text.includes(w), `${w} in:\n${text}`);
	}
	// Pure: the inputs are not changed
	let prisma = s.computePrisma(records, CFG);
	let before = JSON.stringify(prisma);
	s.searchHealth({ prisma, cfg: CFG, rows: [], log: null });
	assert.equal(JSON.stringify(prisma), before);
});

test("health card in the PRISMA note: after 檢索紀錄對帳 (plain), in the 檢索 board; search_health_flags in the frontmatter", () => {
	let { result } = review();
	let h = s.searchHealth({ prisma: result, cfg: CFG, rows: [], log: null });
	let meta = { name: "R", generatedAt: "2026-10-08T01:02:03.000Z", searchLog: { entries: [], link: "", hasLog: false, rec: null }, health: h };
	let plain = s.buildReviewSection(result, [], Object.assign({}, meta, { layout: "classic" }));
	let at = x => plain.indexOf(x);
	assert.ok(at("## 一致性檢查") < at("## 檢索紀錄對帳") && at("## 檢索紀錄對帳") < at("## 🩺 檢索健康檢查") && at("## 🩺 檢索健康檢查") < at("## 證據表"), plain);
	// Without the log (switched off) the card still follows 一致性檢查
	let noLog = s.buildReviewSection(result, [], { name: "R", generatedAt: "2026-10-08", layout: "classic", health: h });
	assert.ok(noLog.indexOf("## 一致性檢查") < noLog.indexOf("## 🩺 檢索健康檢查"));
	let board = s.buildReviewSection(result, [], Object.assign({}, meta, { layout: "board" }));
	assert.match(board, /> \[!zm-board\] 檢索\n> > \[!zm-next\|wide\] 檢索紀錄\n(> > .*\n)*>\n> > \[!zm-next\|wide\] 🩺 檢索健康檢查（\d+）\n/);
	// The 檢索 board is made for the card alone too
	board = s.buildReviewSection(result, [], { name: "R", generatedAt: "2026-10-08", layout: "board", health: h });
	assert.match(board, /> \[!zm-board\] 檢索\n> > \[!zm-next\|wide\] 🩺 檢索健康檢查/);
	assert.ok(board.indexOf("> [!zm-board] 檢索\n") < board.indexOf("## PRISMA 2020 流程圖"));
	// Switched off: no card
	assert.doesNotMatch(s.buildReviewSection(result, [], { name: "R", generatedAt: "2026-10-08", layout: "board" }), /檢索健康檢查/);
	// The count, 0 included; no key without the check
	assert.equal(s.frontmatterFor(result, { health: Object.assign({}, h, { count: 0 }) }).search_health_flags, 0);
	assert.ok(!("search_health_flags" in s.frontmatterFor(result, {})));
	assert.equal(s.HEALTH_KEY, "search_health_flags");
});

test("buildReviewNote placeholders: search_stop_reason added only when missing; the user's value survives regenerations byte for byte", () => {
	let { result } = review();
	let fm = s.frontmatterFor(result, { title: "R：篩選與 PRISMA 2020", collectionKey: "library/collections/C1", name: "R", generatedAt: "2026-10-08", health: { count: 2 } });
	let opts = { placeholders: { [s.STOP_KEY]: "\"\"" } };
	assert.equal(s.STOP_KEY, "search_stop_reason");
	let note = s.buildReviewNote(null, fm, "R", "section 1", undefined, opts);
	let front = core.splitFrontmatter(note).frontmatter;
	assert.match(front, /\nsearch_health_flags: 2\n/);
	assert.match(front, /\nsearch_stop_reason: ""$/);
	assert.equal(s.stopReasonOf(note), "");
	// Regenerated with the key empty: not duplicated
	let again = s.buildReviewNote(note, fm, "R", "section 2", undefined, opts);
	assert.equal(again.match(/search_stop_reason/g).length, 1);
	// The user writes a reason (a block scalar here); two regenerations keep it byte for byte
	let mine = again.replace("search_stop_reason: \"\"", "search_stop_reason: |\n  連續兩次更新檢索沒有新的納入研究\n  與指導教授討論後停止");
	let fm2 = Object.assign({}, fm, { search_health_flags: 0 });
	let r1 = s.buildReviewNote(mine, fm2, "R", "section 3", undefined, opts);
	let r2 = s.buildReviewNote(r1, fm2, "R", "section 4", undefined, opts);
	let block = t => /search_stop_reason: \|\n {2}連續兩次更新檢索沒有新的納入研究\n {2}與指導教授討論後停止/.exec(t)[0];
	assert.equal(block(r2), block(mine));
	assert.match(r2, /\nsearch_health_flags: 0\n/);
	assert.match(r2, /section 4/);
	assert.equal(s.stopReasonOf(r2), "連續兩次更新檢索沒有新的納入研究 與指導教授討論後停止");
	// Without placeholders (other notes, the PICO 表): nothing added
	assert.doesNotMatch(s.buildReviewNote(null, fm, "R", "x"), /search_stop_reason/);
	// An existing note whose frontmatter lacks the key gets it once, the user's keys untouched
	let old = "---\ntitle: \"R\"\nreviewer2: \"Lin\"\n---\n\n# R\n\n%% zotero-bridge:start %%\n\nold\n\n%% zotero-bridge:end %%\n";
	let up = s.buildReviewNote(old, fm, "R", "new", undefined, opts);
	assert.match(up, /reviewer2: "Lin"/);
	assert.equal(up.match(/search_stop_reason: ""/g).length, 1);
});

test("frontmatterText: the stop reason however it is written", () => {
	let t = fm => s.frontmatterText(fm, "search_stop_reason");
	assert.equal(t("title: x"), "");
	assert.equal(t("search_stop_reason: \"\""), "");
	assert.equal(t("search_stop_reason:"), "");
	assert.equal(t("search_stop_reason: 飽和了"), "飽和了");
	assert.equal(t("search_stop_reason: \"兩輪 \\\"更新\\\" 沒有新研究\""), "兩輪 \"更新\" 沒有新研究");
	assert.equal(t("search_stop_reason: 'it''s done'"), "it's done");
	assert.equal(t("search_stop_reason: >-\n  a\n  b\nnext: 1"), "a b");
	assert.equal(t("search_stop_reason:\n  - 時間\n  - \"飽和\""), "時間；飽和");
	assert.equal(t("search_stop_reason: 第一行\n  接著寫"), "第一行 接著寫");
	assert.equal(s.stopReasonOf(null), "");
	assert.equal(s.stopReasonOf("# no frontmatter"), "");
});
