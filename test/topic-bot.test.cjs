// 主題搜尋機器人 (content/topic-bot.js): the topic's terms, PubMed EFetch and OpenAlex records, merging, scoring, the note
const test = require("node:test");
const assert = require("node:assert/strict");
const bot = require("../content/topic-bot.js");
const cc = require("../content/citation-chase.js");

const NOW = "2026-10-23T08:00:00Z";

const EFETCH = `<?xml version="1.0" ?>
<PubmedArticleSet>
<PubmedArticle><MedlineCitation Status="PubMed-not-MEDLINE" Owner="NLM"><PMID Version="1">41000001</PMID>
<Article PubModel="Print-Electronic"><Journal><JournalIssue CitedMedium="Internet"><PubDate><Year>2026</Year><Month>Oct</Month></PubDate></JournalIssue>
<Title>Journal of advanced nursing</Title><ISOAbbreviation>J Adv Nurs</ISOAbbreviation></Journal>
<ArticleTitle>Nurse-led balance training for falls in hospitalised older adults: a cluster <i>randomised</i> trial.</ArticleTitle>
<ELocationID EIdType="doi" ValidYN="Y">10.1111/jan.99001</ELocationID>
<Abstract><AbstractText Label="AIMS">To test exercise &amp; balance training.</AbstractText><AbstractText Label="RESULTS">Falls fell by 25% (RR 0.75).</AbstractText></Abstract>
<PublicationTypeList><PublicationType UI="D016449">Randomized Controlled Trial</PublicationType><PublicationType UI="D016428">Journal Article</PublicationType></PublicationTypeList>
</Article><MeshHeadingList><MeshHeading><DescriptorName UI="D000058" MajorTopicYN="Y">Accidental Falls</DescriptorName></MeshHeading></MeshHeadingList></MedlineCitation>
<PubmedData><ArticleIdList><ArticleId IdType="pubmed">41000001</ArticleId><ArticleId IdType="doi">10.1111/JAN.99001</ArticleId></ArticleIdList></PubmedData></PubmedArticle>
<PubmedArticle><MedlineCitation><PMID Version="1">41000002</PMID><Article><Journal><JournalIssue><PubDate><MedlineDate>2025 Nov-Dec</MedlineDate></PubDate></JournalIssue><Title>Int J Nurs Stud</Title></Journal>
<ArticleTitle>Hand hygiene compliance in intensive care units</ArticleTitle><PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList></Article></MedlineCitation></PubmedArticle>
</PubmedArticleSet>`;

const CARD_BLOCKS = [
	{ key: "P", en: ["older adults", "hospitalized"] },
	{ key: "I", en: ["exercise", "balance training"] },
	{ key: "O", en: ["falls", "fall"] },
];

test("queryBlocks: AND blocks of OR terms, field tags and truncation removed, NOT dropped", () => {
	assert.deepEqual(bot.queryBlocks('("Accidental Falls"[Mesh] OR fall*[tiab]) AND (exercise[tiab] OR "tai chi") NOT animals'),
		[["accidental falls", "fall"], ["exercise", "tai chi"]]);
	assert.deepEqual(bot.queryBlocks("falls"), [["falls"]]);
	assert.deepEqual(bot.queryBlocks(""), []);
	// Brackets inside a block are not a split
	assert.deepEqual(bot.queryBlocks("(a1c OR (glycated hemoglobin)) AND diabetes"), [["a1c", "glycated hemoglobin"], ["diabetes"]]);
});

test("profileFrom: the PICO card's English terms with their weights, else the search string's blocks", () => {
	let p = bot.profileFrom({ cardBlocks: CARD_BLOCKS, extra: { I: ["Tai Chi"] } });
	assert.deepEqual(p.map(e => [e.key, e.weight]), [["P", 2], ["I", 3], ["O", 2]]);
	assert.deepEqual(p[1].terms, ["exercise", "balance training", "tai chi"]);
	let q = bot.profileFrom({ query: "falls AND exercise" });
	assert.deepEqual(q.map(e => [e.label, e.weight, e.terms]), [["概念 1", 2, ["falls"]], ["概念 2", 2, ["exercise"]]]);
});

test("parseEFetch: title, abstract with labels, journal, year (also MedlineDate), DOI, publication types, MeSH", () => {
	let [a, b] = bot.parseEFetch(EFETCH);
	assert.deepEqual(a, {
		pmid: "41000001",
		title: "Nurse-led balance training for falls in hospitalised older adults: a cluster randomised trial",
		abstract: "AIMS: To test exercise & balance training. RESULTS: Falls fell by 25% (RR 0.75).",
		journal: "J Adv Nurs", year: "2026", doi: "10.1111/jan.99001",
		pubTypes: ["Randomized Controlled Trial", "Journal Article"], mesh: ["Accidental Falls"],
	});
	assert.deepEqual([b.pmid, b.year, b.doi, b.abstract, b.journal], ["41000002", "2025", "", "", "Int J Nurs Stud"]);
	assert.deepEqual(bot.parseEFetch("<html>error</html>"), []);
});

test("OpenAlex: the abstract from its inverted index, the citing-works URL", () => {
	assert.equal(bot.invertedAbstract({ Falls: [0], decreased: [1], "with": [2], exercise: [3] }), "Falls decreased with exercise");
	assert.equal(bot.invertedAbstract(null), "");
	let r = bot.openAlexRecord({ id: "https://openalex.org/W9", doi: "https://doi.org/10.5555/X", display_name: "Exercise and falls", publication_year: 2026,
		ids: { pmid: "https://pubmed.ncbi.nlm.nih.gov/123" }, abstract_inverted_index: { Falls: [0] } });
	assert.deepEqual([r.openalex, r.doi, r.pmid, r.abstract], ["W9", "10.5555/x", "123", "Falls"]);
	let url = bot.citingURL("W1", "2026-09-23", { email: "a@b.org" });
	assert.match(url, /^https:\/\/api\.openalex\.org\/works\?filter=cites:W1,from_publication_date:2026-09-23&select=id,doi,/);
	assert.match(url, /&sort=publication_date:desc&per-page=200&mailto=a%40b\.org$/);
	assert.match(url, /abstract_inverted_index/);
});

test("mergeCandidates: one entry per paper across PubMed and OpenAlex, sources and cited core papers kept", () => {
	let pubmed = bot.parseEFetch(EFETCH);
	let citing = [
		// Same paper by DOI, adds the citation
		{ record: { doi: "10.1111/jan.99001", pmid: "", title: "Nurse-led balance training…", year: "2026", abstract: "" }, core: "Lee 2021" },
		{ record: { doi: "10.1111/jan.99001", title: "x", year: "2026" }, core: "Chen 2024" },
		// Same title and year, no IDs from OpenAlex
		{ record: { doi: "", pmid: "", title: "Hand hygiene compliance in intensive care units", year: "2025" }, core: "Lee 2021" },
		// Only from OpenAlex
		{ record: { doi: "10.5555/new", pmid: "", title: "Tai chi and falls among older adults", year: "2026", abstract: "A randomized trial of tai chi." }, core: "Lee 2021" },
		// No DOI or PMID: cannot be imported, dropped
		{ record: { doi: "", pmid: "", title: "A conference abstract", year: "2026" }, core: "Lee 2021" },
	];
	let list = bot.mergeCandidates(pubmed, citing);
	assert.deepEqual(list.map(c => [c.key, [...c.sources].join("+"), c.cites.join("、")]), [
		["doi:10.1111/jan.99001", "pubmed+citations", "Lee 2021、Chen 2024"],
		["pmid:41000002", "pubmed+citations", "Lee 2021"],
		["doi:10.5555/new", "citations", "Lee 2021"],
	]);
	assert.equal(list[0].abstract.startsWith("AIMS"), true, "PubMed's record wins");
});

test("scoreCandidate: terms in the title and abstract, every element, design, core citations, recency — with the reasons", () => {
	let profile = bot.profileFrom({ cardBlocks: CARD_BLOCKS });
	let [a, b] = bot.parseEFetch(EFETCH);
	let best = bot.scoreCandidate(Object.assign({}, a, { cites: ["Lee 2021", "Chen 2024"] }), profile, { now: NOW });
	assert.equal(best.tier, "高");
	assert.equal(best.stars, "⭐⭐⭐");
	assert.equal(best.design, "RCT");
	assert.deepEqual(best.reasons, ["命中 P、I、O（標題有 P、I、O）", "RCT", "引用 2 篇核心文獻：Lee 2021、Chen 2024"]);
	// P 3 + I 4.5 + O 3 + all 2 + RCT 2 + cites 4 + recent 1 = 19.5 of 10.5+2+3+6+1 = 22.5 → 87
	assert.equal(best.score, 87);
	let off = bot.scoreCandidate(b, profile, { now: NOW });
	assert.equal(off.tier, "低");
	assert.deepEqual(off.reasons, ["標題與摘要都沒有主題詞", "沒有摘要"]);
	// Found only in the abstract, an observational design from the words
	let mid = bot.scoreCandidate({ title: "Outcomes after hospital discharge", abstract: "A cohort of older adults; falls and exercise were recorded.", year: "2020" }, profile, { now: NOW });
	assert.deepEqual(mid.reasons, ["命中 P、I、O", "觀察性研究"]);
	assert.equal(mid.tier, "中");
	// Whole words: "fall" matches "falls", not "rainfall"
	assert.equal(bot.hasTerm("Rainfall and mood", "fall"), false);
	assert.equal(bot.hasTerm("Falls in wards", "fall"), true);
	// Design from publication types first, then the title
	assert.equal(bot.designOf({ pubTypes: ["Meta-Analysis"] }).label, "系統性回顧");
	assert.equal(bot.designOf({ title: "A qualitative study of nurses" }).label, "質性研究");
	assert.equal(bot.designOf({ title: "Editorial" }), null);
});

function ranked(c, score, tier, reasons) {
	let stars = { 高: "⭐⭐⭐", 中: "⭐⭐", 低: "⭐" }[tier];
	return Object.assign({ sources: new Set(["pubmed"]), cites: [] }, c, { key: bot.keyOf(c), rank: { score, tier, stars, design: "RCT", reasons } });
}

const BOT = {
	name: "跌倒", collectionKey: "library/collections/C1", query: '"Accidental Falls"[Mesh] AND exercise',
	core: [{ key: "K1", label: "Lee 2021" }], sources: { pubmed: true, citations: true },
};

test("botLine and parseListed: a checklist line the importer reads, with the score and the reasons", () => {
	let c = ranked({ doi: "10.5555/a", pmid: "11", title: "Exercise | falls", year: "2026", journal: "J Adv Nurs" }, 87, "高", ["命中 P、I、O", "RCT"]);
	let line = bot.botLine(c, false);
	assert.equal(line, "- [ ] ⭐⭐⭐ **Exercise \\| falls** (2026)｜*J Adv Nurs*｜87 分：命中 P、I、O · RCT｜來源 PubMed｜[DOI](https://doi.org/10.5555/a) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/11/)");
	let note = `%% zotero-bridge:start %%\n${bot.botLine(c, true)}\n%% zotero-bridge:end %%`;
	assert.deepEqual(bot.parseListed(note).map(l => [l.key, l.checked, l.score]), [["doi:10.5555/a", true, 87]]);
	// citation-chase.js reads the ticked line for import
	assert.deepEqual(cc.parseChecked(note).map(x => [x.key, x.title]), [["doi:10.5555/a", "Exercise | falls"]]);
});

test("buildBotNote (看板): 本次搜尋 cards, the list best first; a later run keeps ticks and imported lines and adds only new papers", () => {
	let run = {
		at: NOW, counts: { pubmed: 2, citations: 1 }, errors: [],
		candidates: [
			ranked({ doi: "10.5555/b", title: "B", year: "2026" }, 40, "中", ["命中 I"]),
			ranked({ doi: "10.5555/a", title: "A", year: "2026" }, 87, "高", ["命中 P、I、O"]),
			ranked({ pmid: "33", title: "C", year: "2025" }, 10, "低", ["沒有摘要"]),
		],
	};
	let { text, stats } = bot.buildBotNote(null, run, BOT, { layout: "board" });
	assert.deepEqual([stats.fresh, stats.high, stats.pending], [3, 1, 3]);
	assert.match(text, /^---\ntitle: "跌倒 搜尋機器人"\ntype: "topic-bot"\nzotero_collection: "library\/collections\/C1"\n/);
	assert.match(text, /\ntags:\n {2}- "新文獻"\n {2}- "搜尋機器人"\ncssclasses:\n {2}- "zotmax-note"\n {2}- "zm-review"\n---\n\n# 跌倒 搜尋機器人\n/);
	assert.match(text, /> \[!zm-meta\]- 🤖 搜尋機器人 · 跌倒 · 2026-10-23 搜尋\n> 檢索式：`"Accidental Falls"\[Mesh\] AND exercise`/);
	assert.match(text, /> \[!zm-board\] 本次搜尋\n> PubMed 每天、被引用每週 · 上次搜尋 2026-10-23\n>\n> > \[!zm-kpi\] 本次新候選\n> > \*\*3 篇\*\* {2}\n> > PubMed 2 · 被引用 1/);
	assert.match(text, /> > \[!zm-kpi\] 高相關\n> > \*\*1 篇\*\*/);
	assert.match(text, /> > \[!zm-chart\] 新候選的分數\n> > ⭐⭐⭐ 高 ▰+ 1 {2}\n> > ⭐⭐ 中 ▰+ 1 {2}\n> > ⭐ 低 ▰+ 1/);
	let list = text.slice(text.indexOf("## 待看"));
	assert.ok(list.indexOf("**A**") < list.indexOf("**B**") && list.indexOf("**B**") < list.indexOf("**C**"), "best first");
	assert.match(text, /\n## 待看（3 篇）\n\n- \[ \] ⭐⭐⭐ \*\*A\*\*/);
	assert.match(text, /\n## ✍️ 我的筆記\n\n$/);

	// The user ticks C and writes notes; A was imported; a later run brings A again (listed) and D (new)
	let edited = text.replace("- [ ] ⭐ **C**", "- [x] ⭐ **C**").replace("- [ ] ⭐⭐⭐ **A**", `- [x] ${cc.IMPORTED_MARK} ⭐⭐⭐ **A**`) + "要和老師討論 C。\n";
	let run2 = { at: "2026-10-30T08:00:00Z", counts: { pubmed: 1, citations: 0 }, errors: ["OpenAlex：查詢失敗"],
		candidates: [ranked({ doi: "10.5555/a", title: "A", year: "2026" }, 87, "高", []), ranked({ doi: "10.5555/d", title: "D", year: "2026" }, 70, "高", ["命中 P、I、O"])] };
	let again = bot.buildBotNote(edited, run2, BOT, { layout: "board" });
	assert.deepEqual([again.stats.fresh, again.stats.pending], [1, 3]);
	let list2 = again.text.slice(again.text.indexOf("## 待看"));
	assert.match(list2, /^## 待看（3 篇）\n\n- \[x\] ⭐ \*\*C\*\*/, "ticked first");
	assert.ok(list2.indexOf("**D**") < list2.indexOf("**B**"), "then by score");
	assert.match(again.text, /\n> \[!zm-ref\]- 已匯入（1 篇）\n> - \[x\] ✅ 已匯入 ⭐⭐⭐ \*\*A\*\*/);
	assert.match(again.text, /\n> \[!warning\] OpenAlex：查詢失敗\n/);
	assert.match(again.text, /要和老師討論 C。\n$/);
	assert.match(again.text, /\nbot_new: 1\nbot_pending: 3\n/);
	assert.equal(again.text.match(/zotero-bridge:start/g).length, 1);

	// Classic: an info callout, the imported list as a heading, no classes
	let classic = bot.buildBotNote(again.text, run2, BOT, {});
	assert.match(classic.text, /\n> \[!info\] 🤖 搜尋機器人：跌倒（2026-10-30 搜尋）\n/);
	assert.match(classic.text, /\n## 已匯入（1 篇）\n\n- \[x\] ✅ 已匯入/);
	assert.match(classic.text, /\ncssclasses: \[\]\n/);
});

test("buildBotSection: the list is capped, unticked lowest scores drop off and are reported", () => {
	let many = Array.from({ length: bot.MAX_LISTED + 5 }, (_, i) => ranked({ doi: `10.5555/${i}`, title: `T${i}`, year: "2026" }, i % 100, "低", []));
	let built = bot.buildBotSection("", { at: NOW, counts: { pubmed: many.length, citations: 0 }, candidates: many }, BOT, {});
	assert.equal(built.pending, bot.MAX_LISTED);
	assert.equal(built.dropped.length, 5);
	assert.ok(built.dropped.every(k => many.find(c => c.key === k).rank.score <= 4));
});

test("排除詞: parsed from what the user types; a paper with one loses points, and the reason names the word", () => {
	assert.deepEqual(bot.parseExclude("children, pediatric\nanimal、 rat；x"), ["children", "pediatric", "animal", "rat"]);
	let profile = bot.profileFrom({ cardBlocks: CARD_BLOCKS });
	let paper = { title: "Exercise and falls in hospitalized children", abstract: "Balance training for older adults and children.", year: "2026", pubTypes: ["Randomized Controlled Trial"] };
	let plain = bot.scoreCandidate(paper, profile, { now: NOW });
	let ex = bot.scoreCandidate(paper, profile, { now: NOW, exclude: ["children", "animal"] });
	assert.equal(ex.score, Math.max(0, plain.score - bot.EXCLUDE_PENALTY));
	assert.equal(ex.reasons[0], "含排除詞：children");
	assert.deepEqual(ex.excluded, ["children"]);
	assert.notEqual(ex.tier, "高");
	// Whole words with plurals: "rat" is not "rate"; a trailing * takes every word it starts
	assert.equal(bot.excludeHit("Fall rate in wards", "rat"), false);
	assert.equal(bot.excludeHit("A study in rats", "rat"), true);
	assert.equal(bot.excludeHit("Falls after childbirth", "child"), false);
	assert.equal(bot.excludeHit("Falls in childhood", "child*"), true);
	assert.deepEqual(bot.scoreCandidate({ title: "Falls in childhood" }, profile, { exclude: ["child*"] }).excluded, ["child"]);
});

test("中文文獻: the card's first Chinese term per element, links to the databases the bot can't search", () => {
	assert.equal(bot.chineseQuery([{ terms: ["住院長者", "older adults"] }, { terms: ["exercise"] }, { terms: ["falls", "跌倒"] }]), "住院長者 跌倒");
	assert.equal(bot.chineseQuery([{ terms: ["falls"] }]), "");
	let row = bot.chineseRow({ query: "住院長者 跌倒", targets: [
		{ name: "華藝線上圖書館", url: "https://www.airitilibrary.com/", copy: true, query: "住院長者 跌倒" },
		{ name: "Google Scholar", url: "https://scholar.google.com/scholar?hl=zh-TW&q=%E4%BD%8F", copy: false, query: "住院長者 跌倒" },
	] });
	assert.equal(row, "> [!zm-links] 中文文獻（機器人查不到，請自己查）\n> [華藝線上圖書館](https://www.airitilibrary.com/)（貼上 `住院長者 跌倒`） · [Google Scholar](https://scholar.google.com/scholar?hl=zh-TW&q=%E4%BD%8F)");
	assert.equal(bot.chineseRow(null), "");
	// 檢索日誌 on: asks to record the search there, and links the log note when it has a path
	let targets = [{ name: "華藝線上圖書館", url: "https://www.airitilibrary.com/", copy: true, query: "跌倒" }];
	assert.equal(bot.chineseRow({ query: "跌倒", targets, logLink: "Zotero/Reviews/檢索日誌/跌倒" }),
		"> [!zm-links] 中文文獻（機器人查不到，查完請記到檢索日誌）\n> [華藝線上圖書館](https://www.airitilibrary.com/)（貼上 `跌倒`） · [[Zotero/Reviews/檢索日誌/跌倒|📝 檢索日誌]]");
	assert.equal(bot.chineseRow({ query: "跌倒", targets, logLink: "" }),
		"> [!zm-links] 中文文獻（機器人查不到，查完請記到檢索日誌）\n> [華藝線上圖書館](https://www.airitilibrary.com/)（貼上 `跌倒`）", "no path yet: the wording, no link");
	// In the note, after the warnings and before the list
	let built = bot.buildBotSection("", { at: NOW, counts: { pubmed: 0, citations: 0 }, candidates: [], chinese: { query: "跌倒", targets: [{ name: "華藝線上圖書館", url: "https://www.airitilibrary.com/", copy: true, query: "跌倒" }] } },
		Object.assign({}, BOT, { exclude: ["children"] }), { layout: "board" });
	assert.match(built.section, /> 排除詞（命中的扣 40 分）：children/);
	assert.match(built.section, /\n\n> \[!zm-links\] 中文文獻[^\n]*\n> [^\n]*\n\n## 待看（0 篇）/);
});

test("botSummaries: what the topic page, home page and progress report read from the bots", () => {
	let bots = {
		a: { name: "跌倒", path: "碩論/跌倒", notePath: "Zotero/50 新文獻/跌倒 搜尋機器人", stats: { pending: 12, high: 3, at: "2026-10-23T08:00:00Z" },
			imports: [{ at: "2026-10-01T00:00:00Z", n: 2 }, { at: "2026-10-20T00:00:00Z", n: 3 }] },
		// Never run: no note yet
		b: { name: "壓傷", path: "壓傷" },
	};
	assert.deepEqual(bot.botSummaries(bots, at => at >= "2026-10-10" && at <= "2026-10-24"), [
		{ path: "碩論/跌倒", name: "跌倒", link: "Zotero/50 新文獻/跌倒 搜尋機器人", pending: 12, high: 3, imported: 3, at: "2026-10-23T08:00:00Z",
			imports: [{ at: "2026-10-20T00:00:00Z", n: 3 }] },
	]);
	assert.equal(bot.botSummaries(bots)[0].imported, 5, "all imports without a period");
	let n = bot.normalizeBot({ exclude: "children, rat", imports: [{ at: "x", n: 0 }, { at: "2026", n: 2 }] });
	assert.deepEqual([n.exclude, n.imports], [["children", "rat"], [{ at: "2026", n: 2 }]]);
});

test("靠岸到哪座島: island profiles weight what belongs to one island, the clear winner is suggested, the line carries it and import reads it back", () => {
	let islands = [
		{ name: "運動", tagLists: [["Exercise Therapy", "Postural Balance", "Humans", "Aged"], ["Exercise Therapy", "Resistance Training", "Humans"]],
			titles: ["Tai chi and balance training for falls"], terms: [{ name: "運動訓練", n: 2 }] },
		{ name: "衛教", tagLists: [["Patient Education as Topic", "Humans", "Aged"], ["Patient Education as Topic", "Health Literacy"]],
			titles: ["Video education on fall risk awareness"], terms: [] },
		{ name: "用藥", tagLists: [["Inappropriate Prescribing", "Humans"]], titles: [], terms: [] },
	];
	let profiles = bot.islandProfiles(islands);
	let w = (i, k) => (profiles[i].weights.get(k) || {}).w;
	assert.equal(w(0, "exercise therapy"), 1, "two papers, only on this island");
	assert.equal(w(2, "inappropriate prescribing"), 0.5, "one paper only: half");
	assert.equal(w(0, "humans"), undefined, "check tags are skipped");
	assert.equal(w(1, "衛教"), 1.5, "the island's own name");
	assert.ok(!profiles[0].weights.has("study"), "title stop words are skipped");
	assert.deepEqual(bot.titleWords("Effect of Tai-chi balance training: a randomized study"), ["tai-chi", "balance", "training"]);

	let byMesh = bot.suggestIsland({ title: "Falls in nursing homes", abstract: "", mesh: ["Exercise Therapy", "Humans"] }, profiles);
	assert.deepEqual([byMesh.name, byMesh.hits[0]], ["運動", "Exercise Therapy"], "a MeSH heading counts double");
	assert.ok(byMesh.score >= 2);
	let byText = bot.suggestIsland({ title: "A patient education as topic leaflet", abstract: "Improves health literacy.", mesh: [] }, profiles);
	assert.equal(byText.name, "衛教");
	assert.equal(bot.suggestIsland({ title: "Falls and hip fracture", abstract: "", mesh: [] }, profiles), null, "nothing matches");
	let tie = bot.suggestIsland({ title: "", abstract: "", mesh: ["Exercise Therapy", "Patient Education as Topic"] }, profiles);
	assert.equal(tie, null, "no clear winner");
	assert.equal(bot.suggestIsland({ title: "x", mesh: ["Exercise Therapy"] }, profiles.slice(0, 1)), null, "one island: nothing to choose");

	let c = { key: "doi:10.5555/a", title: "Balance", year: "2026", journal: "J", doi: "10.5555/a", pmid: "", sources: new Set(["pubmed"]),
		rank: { stars: "⭐⭐", score: 40, reasons: ["命中 I"] }, island: byMesh };
	let line = bot.botLine(c, false);
	assert.match(line, /｜來源 PubMed｜🏝️ 建議放：運動（Exercise Therapy、falls）｜\[DOI\]/);
	assert.equal(bot.islandOfLine(line), "運動");
	assert.equal(bot.islandOfLine("- [x] **T**｜🏝 衛教｜[DOI](https://doi.org/10.5555/a)"), "衛教", "typed by hand, without the variation selector");
	assert.equal(bot.islandOfLine("- [x] **T**｜[DOI](https://doi.org/10.5555/a)"), "");
	assert.deepEqual(bot.parseListed(line).map(l => l.key), ["doi:10.5555/a"], "the line still parses");
});
