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
