// PICO 問題卡 and PICO 表 (content/pico.js), the pure parts: cards (normalizing, question types, the composed
// sentence, the 聚焦檢查 rules, the search string through search-links.js, the card as Markdown), the word match of a
// paper against the card, table rows from AI-note data and a verified form, the Markdown, CSV, HTML and clipboard
// versions, the managed note with its frontmatter, file names and the dialog text.
const test = require("node:test");
const assert = require("node:assert/strict");

const P = require("../content/pico.js");

const CARD = {
	type: "treatment",
	p: "65 歲以上住院病人 older inpatients",
	i: "護理師主導運動 nurse-led exercise",
	c: "常規照護 usual care",
	o: "跌倒發生率 falls",
	t: "12 週",
	setting: "區域醫院內科病房",
	question: "在 65 歲以上住院病人中，護理師主導運動相較於常規照護，對跌倒發生率的效果如何？",
	notes: "次要結果：跌倒自我效能",
	updatedAt: "2026-10-13T01:02:03.000Z",
};

const STUDY = {
	study_design: "RCT", sample_size: 120, setting: "內科病房", country: "Taiwan",
	population: "65 歲以上住院病人", intervention: "護理師主導跌倒預防運動", comparison: "常規照護",
	outcomes: "跌倒發生率、跌倒自我效能", measures: ["Morse Fall Scale"],
	evidence_level: "2", jbi_level: "1.c", appraisal_tool: "CASP RCT", appraisal_overall: "納入",
};

const RECORD = {
	creators: [{ lastName: "Lee", firstName: "Anna", creatorType: "author" }, { lastName: "Chen", firstName: "Mei", creatorType: "author" }],
	title: "Exercise and falls: a randomized trial", year: "2021", publication: "Geriatric Nursing", doi: "10.1016/j.gerinurse.2021.01.001",
	uri: "zotero://select/library/items/ABCD1234",
};

const MD = "## 一句話摘要\n\n運動減少跌倒。\n\n## 主要結果\n\n- 跌倒率下降 30%（RR 0.70, 95% CI 0.55–0.89）\n- 自我效能提升\n\n## 結論\n\n有效。";

test("cards: normalized to trimmed strings and a known type; an empty card has no content", () => {
	let c = P.normalizeCard({ type: "bogus", p: "  老人  ", i: null, question: 12, extra: "x" });
	assert.equal(c.type, "treatment");
	assert.equal(c.p, "老人");
	assert.equal(c.i, "");
	assert.equal(c.question, "12");
	assert.equal("extra" in c, false);
	assert.equal(P.cardHasContent(c), true);
	assert.equal(P.cardHasContent(P.emptyCard()), false);
	assert.equal(P.cardHasContent(null), false);
	assert.deepEqual(P.TYPES.map(t => t.id), ["treatment", "diagnosis", "prognosis", "etiology", "meaning"]);
	assert.equal(P.fieldLabels({ type: "meaning" }).c, "情境（Co）");
	assert.equal(P.fieldLabels({ type: "diagnosis" }).i, "檢測／工具（I）");
	for (let t of P.TYPES) {
		for (let k of ["p", "i", "c", "o"]) {
			assert.ok(t.labels[k] && t.hints[k], `${t.id}.${k} has a label and a hint`);
		}
	}
});

test("terms: split at commas, slashes and and/or; brackets removed; placeholders and one-character bits dropped", () => {
	assert.deepEqual(P.terms("跌倒 falls, 自我效能／self-efficacy; （N/A）"), ["跌倒 falls", "自我效能", "self-efficacy"]);
	assert.deepEqual(P.terms("exercise and usual care or nothing"), ["exercise", "usual care", "nothing"]);
	assert.deepEqual(P.terms("未報告"), []);
	assert.deepEqual(P.terms(null), []);
});

test("composeQuestion: one sentence per question type from the elements; nothing without P and I", () => {
	assert.equal(P.composeQuestion(CARD), "在65 歲以上住院病人 older inpatients中，護理師主導運動 nurse-led exercise相較於常規照護 usual care，對跌倒發生率 falls的效果（12 週）如何？");
	assert.equal(P.composeQuestion({ type: "treatment", p: "老人", i: "運動" }), "在老人中，運動，對結果的效果如何？");
	assert.equal(P.composeQuestion({ type: "diagnosis", p: "急診病人", i: "Morse 量表", c: "實際跌倒紀錄", o: "跌倒高風險" }), "在急診病人中，Morse 量表相較於實際跌倒紀錄，診斷跌倒高風險的準確度如何？");
	assert.equal(P.composeQuestion({ type: "prognosis", p: "髖部骨折病人", i: "譫妄", o: "一年死亡率", t: "一年" }), "在髖部骨折病人中，有譫妄者，一年死亡率（一年）有何不同？");
	assert.equal(P.composeQuestion({ type: "etiology", p: "護理師", i: "輪班", c: "固定班", o: "睡眠障礙" }), "護理師暴露於輪班（相較於固定班），睡眠障礙的風險是否增加？");
	assert.equal(P.composeQuestion({ type: "meaning", p: "家屬", i: "末期照護決策", c: "加護病房" }), "家屬在加護病房中，對末期照護決策的經驗與感受為何？");
	assert.equal(P.composeQuestion({ type: "treatment", p: "老人" }), "");
});

test("checkCard: warns about missing elements and the sentence, hints about focus, English words and the setting; nothing on a full card", () => {
	let empty = P.checkCard(P.emptyCard());
	assert.deepEqual(empty.filter(f => f.level === "warn").map(f => f.field), ["p", "i", "o", "question"]);
	assert.ok(empty.some(f => f.field === "c" && f.level === "info"), "no comparison is a hint, not a warning");
	assert.ok(!empty.some(f => f.field === "search"), "no English hint while nothing is written");
	assert.deepEqual(P.checkCard(CARD), [], "a full card with English words passes");
	let zh = P.checkCard(Object.assign({}, CARD, { p: "老人", i: "運動", c: "運動", o: "跌倒、疼痛、睡眠、焦慮" }));
	assert.ok(zh.some(f => f.field === "p" && /只有幾個字/.test(f.text)));
	assert.ok(zh.some(f => f.field === "c" && f.level === "warn" && /一樣/.test(f.text)));
	assert.ok(zh.some(f => f.field === "o" && /有 4 個/.test(f.text)));
	assert.ok(zh.some(f => f.field === "search" && /沒有英文詞/.test(f.text)));
	let two = P.checkCard(Object.assign({}, CARD, { i: "運動 exercise, 衛教 education" }));
	assert.ok(two.some(f => f.field === "i" && /有 2 個/.test(f.text)), "two interventions on one card");
	let meaning = P.checkCard({ type: "meaning", p: "家屬", i: "決策經驗", c: "加護病房", question: "x" });
	assert.ok(!meaning.some(f => f.field === "o"), "a qualitative question needs no outcome");
	assert.ok(!meaning.some(f => f.field === "setting"));
	let noSetting = P.checkCard(Object.assign({}, CARD, { setting: "" }));
	assert.ok(noSetting.some(f => f.field === "setting" && f.level === "info"));
});

test("cardQuery: the card's P AND I AND O (and C) through search-links.js, English words and the fields as written", () => {
	let q = P.cardQuery(CARD);
	assert.equal(q.en, '"older inpatients" AND "nurse-led exercise" AND "usual care" AND falls');
	assert.match(q.all, /^65 歲以上住院病人 older inpatients AND 護理師主導運動 nurse-led exercise AND 常規照護 usual care AND 跌倒發生率 falls$/);
	assert.deepEqual(q.skipped, []);
	assert.equal(P.cardQuery(CARD, { includeC: false }).en, '"older inpatients" AND "nurse-led exercise" AND falls');
	assert.equal(P.cardQuery(P.emptyCard()), null);
	let zh = P.cardQuery({ p: "老人", i: "運動 exercise", o: "跌倒" });
	assert.equal(zh.en, "exercise");
	assert.deepEqual(zh.skipped, ["P（族群）", "O（結果）"]);
});

test("cardMarkdown: the question, a two-column table (labels by type), T and the setting when written, the search strings, the notes and the date", () => {
	let md = P.cardMarkdown(CARD, { heading: "## 本題 PICO", query: P.cardQuery(CARD) });
	assert.match(md, /^## 本題 PICO\n\n\*\*研究問題\*\*：在 65 歲以上住院病人中/);
	assert.match(md, /\| 要素 \| 內容 \|\n\|---\|---\|\n\| 問題類型 \| 治療／預防 \|\n\| 族群（P） \| 65 歲以上住院病人 older inpatients \|/);
	assert.match(md, /\| 時間（T） \| 12 週 \|\n\| 我的情境 \| 區域醫院內科病房 \|/);
	assert.match(md, /檢索式（英文詞）：`"older inpatients" AND "nurse-led exercise" AND "usual care" AND falls`  \n檢索式（原文詞彙）/);
	assert.match(md, /檢索式（原文詞彙）：`65 歲以上住院病人/);
	assert.match(md, /備註：次要結果：跌倒自我效能/);
	assert.match(md, /\*問題卡更新於 2026-10-13\*$/);
	let bare = P.cardMarkdown({ type: "meaning", p: "家屬" });
	assert.match(bare, /\*\*研究問題\*\*：（還沒寫問題句）/);
	assert.match(bare, /\| 情境（Co） \| （空白） \|/);
	assert.doesNotMatch(bare, /時間（T）|我的情境|檢索式|備註/);
	let piped = P.cardMarkdown({ p: "a | b", question: "x | y" });
	assert.match(piped, /a \\\| b/);
});

test("matchCard: a word match per element (terms, English words, Chinese bigrams); — without data; null without a card or data", () => {
	let m = P.matchCard(CARD, STUDY);
	assert.equal(m.p, "yes", "the Chinese term is contained");
	assert.equal(m.i, "yes", "護理師主導 shares bigrams");
	assert.equal(m.c, "yes");
	assert.equal(m.o, "yes", "跌倒發生率 is contained");
	assert.equal(m.text, "P✓ I✓ C✓ O✓");
	assert.equal(m.matched, 4);
	assert.equal(m.checked, 4);
	let other = P.matchCard(CARD, { population: "新生兒", intervention: "袋鼠式護理", comparison: null, outcomes: "體重" });
	assert.equal(other.text, "P？ I？ C— O？");
	assert.equal(other.matched, 0);
	let en = P.matchCard({ p: "older adults", i: "exercise programme", o: "falls" }, { population: "community-dwelling adults aged 65+", intervention: "a 12-week exercise class", outcomes: "rate of falls" });
	assert.equal(en.text, "P？ I✓ O✓", "stop words (adults) never match; exercise and falls do");
	assert.equal(P.matchField("住院病人", "65 歲以上住院病人"), "yes");
	assert.equal(P.matchField("跌倒", "跌倒發生率"), "yes", "a single bigram that is the whole term");
	assert.equal(P.matchField("老年人", "住院病人"), "no");
	assert.equal(P.matchField("老年人", "未報告"), "none");
	assert.equal(P.matchField("", "x"), "none");
	assert.equal(P.matchCard(null, STUDY), null);
	assert.equal(P.matchCard(CARD, null), null);
	assert.equal(P.matchCard(P.emptyCard(), STUDY), null);
});

test("tableRow: citation and fields from the record, the AI data and 主要結果; the appraisal status from a form; no data marked", () => {
	let r = P.tableRow({ record: RECORD, study: STUDY, md: MD, appraisal: { verified: true, status: "verified" }, link: "Zotero/Lee 2021", card: CARD });
	assert.equal(r.citation, "Lee & Chen, 2021");
	assert.equal(r.authors, "Lee, Anna; Chen, Mei");
	assert.equal(r.design, "RCT");
	assert.equal(r.sampleSize, "120");
	assert.equal(r.population, "65 歲以上住院病人");
	assert.equal(r.measures, "Morse Fall Scale");
	assert.equal(r.findings, "跌倒率下降 30%（RR 0.70, 95% CI 0.55–0.89）；自我效能提升");
	assert.equal(r.evidenceLevel, "2");
	assert.equal(r.jbiLevel, "1.c");
	assert.equal(r.appraisalStatus, "已核對");
	assert.equal(r.match.text, "P✓ I✓ C✓ O✓");
	assert.equal(r.link, "Zotero/Lee 2021");
	assert.equal(P.tableRow({ record: RECORD, study: STUDY, md: "", appraisal: null }).appraisalStatus, "AI 初評");
	assert.equal(P.tableRow({ record: RECORD, study: STUDY, md: "", appraisal: { verified: false, status: "human" } }).appraisalStatus, "評讀中");
	assert.equal(P.tableRow({ record: RECORD, study: Object.assign({}, STUDY, { appraisal_overall: null }), md: "", appraisal: { verified: false, status: "ai" } }).appraisalStatus, "");
	let none = P.tableRow({ record: { creators: [], title: "Untitled thing", year: "" }, study: null, md: "", card: CARD });
	assert.equal(none.hasData, false);
	assert.equal(none.citation, "Untitled thing, n.d.");
	assert.equal(none.match, null);
	assert.equal(none.findings, "");
});

function rows() {
	return P.sortRows([
		P.tableRow({ record: { creators: [{ lastName: "Wong", creatorType: "author" }], title: "No data yet", year: "2020", uri: "zotero://select/library/items/W" }, study: null, md: "", card: CARD }),
		P.tableRow({ record: RECORD, study: STUDY, md: MD, appraisal: { verified: true, status: "verified" }, link: "Zotero/Lee 2021", card: CARD }),
	]);
}

test("tableMarkdown: one row per study, wikilinks when asked, the 對照本題 column with a card, the no-data row marked", () => {
	let md = P.tableMarkdown(rows(), { links: true, match: true });
	let lines = md.split("\n");
	assert.equal(lines[0], "| 文獻 | 研究設計 | P 族群 | I 介入 | C 對照 | O 結果 | 主要結果 | 證據等級 | 評讀 | 對照本題 |");
	assert.equal(lines[2], "| [[Zotero/Lee 2021\\|Lee & Chen, 2021]] | RCT，N = 120 | 65 歲以上住院病人 | 護理師主導跌倒預防運動 | 常規照護 | 跌倒發生率、跌倒自我效能 | 跌倒率下降 30%（RR 0.70, 95% CI 0.55–0.89）；自我效能提升 | CEBM 2；JBI 1.c | 納入（CASP RCT） ［已核對］ | P✓ I✓ C✓ O✓ |");
	assert.equal(lines[3], "| Wong, 2020 | （沒有 AI 筆記的結構化資料） |  |  |  |  |  |  |  | — |");
	let plain = P.tableMarkdown(rows(), {});
	assert.doesNotMatch(plain, /對照本題|\[\[/);
	assert.equal(P.tableMarkdown([]), "（沒有可以列的文獻）");
});

test("tableCSV: a UTF-8 BOM, CRLF, every column, formulas defused", () => {
	let csv = P.tableCSV(rows().concat([P.tableRow({ record: { creators: [], title: "=SUM(A1)", year: "2001" }, study: null, md: "" })]));
	assert.ok(csv.startsWith("﻿文獻,作者,年份,標題,期刊,DOI,研究設計,樣本數,場域,國家,P 族群,I 介入,C 對照,O 結果,測量工具,主要結果,CEBM 證據等級,JBI 證據等級,評讀工具,評讀結果,評讀狀態,對照本題,Zotero\r\n"));
	assert.match(csv, /\r\n"Lee & Chen, 2021","Lee, Anna; Chen, Mei",2021,Exercise and falls: a randomized trial,Geriatric Nursing,10\.1016\/j\.gerinurse\.2021\.01\.001,RCT,120,內科病房,Taiwan,65 歲以上住院病人,護理師主導跌倒預防運動,常規照護,跌倒發生率、跌倒自我效能,Morse Fall Scale,"跌倒率下降 30%（RR 0\.70, 95% CI 0\.55–0\.89）；自我效能提升",2,1\.c,CASP RCT,納入,已核對,P✓ I✓ C✓ O✓,zotero:\/\/select\/library\/items\/ABCD1234\r\n/);
	assert.match(csv, /\r\n"'=SUM\(A1\), 2001",,2001,'=SUM\(A1\),/, "a cell starting with = gets a leading apostrophe (quoted when it also holds a comma)");
	assert.ok(csv.endsWith("\r\n"));
});

test("tableFragment and tableTSV: the card and the table as HTML for the clipboard (escaped), the legend, and tab-separated text", () => {
	let html = P.tableFragment(rows(), CARD);
	assert.match(html, /^<p><b>研究問題<\/b>：在 65 歲以上住院病人中/);
	assert.match(html, /<tr><td>族群（P）<\/td><td>65 歲以上住院病人 older inpatients<\/td><\/tr>/);
	assert.match(html, /<th>文獻<\/th><th>研究設計<\/th>.*<th>對照本題<\/th><\/tr>/);
	assert.match(html, /<td>Lee &amp; Chen, 2021<\/td><td>RCT，N = 120<\/td>/);
	assert.match(html, /<td>P✓ I✓ C✓ O✓<\/td>/);
	assert.match(html, /只是字詞比對/);
	let noCard = P.tableFragment(rows(), null);
	assert.doesNotMatch(noCard, /研究問題|對照本題|字詞比對/);
	assert.match(noCard, /AI 初填/);
	let tsv = P.tableTSV(rows(), CARD);
	assert.equal(tsv.split("\n")[0], "文獻\t研究設計\tP 族群\tI 介入\tC 對照\tO 結果\t主要結果\t證據等級\t評讀\t對照本題");
	assert.match(tsv, /\nLee & Chen, 2021\tRCT，N = 120\t65 歲以上住院病人/);
	let doc = P.tableHTML(rows(), CARD, { title: "跌倒：PICO 表", scopeName: "跌倒", date: "2026-10-13" });
	assert.match(doc, /^<!DOCTYPE html>\n<html lang="zh-TW">\n<head>\n<meta charset="utf-8">\n<title>跌倒：PICO 表<\/title>/);
	assert.match(doc, /<h1>跌倒：PICO 表<\/h1>\n<p>ZotMax 依「跌倒」的 2 篇文獻於 2026-10-13 產生/);
	assert.match(doc, /另存成 \.docx/);
});

test("noteSection (看板): the card as PICO cards with word matches and the search string, 文獻 cards, the table open, the rest folded", () => {
	let list = P.keywordSuggestions([["*Accidental Falls/prevention & control", "Exercise"], ["Accidental Falls", "Aged"]], CARD);
	let meta = { scopeName: "跌倒回顧", generatedAt: "2026-10-13T01:00:00.000Z", links: true, query: P.cardQuery(CARD), screened: null, layout: "board", keywords: list };
	let md = P.noteSection(rows(), CARD, meta);
	assert.ok(md.startsWith("> [!zm-meta]- 🧭 PICO 表 · 跌倒回顧 · 2 篇 · 2026-10-13 產生\n"), md.slice(0, 80));
	assert.match(md, /\n> \[!zm-board\] 本題 PICO\n> 研究問題：[^\n]+\n>\n> > \[!zm-pico\] 治療／預防\n> > - \*\*P\*\* /);
	assert.match(md, /> > \[!zm-chart\] 和問題卡有共同字詞（1 篇有資料）\n> > P 族群 [▰▱]{10} \d/);
	assert.match(md, /> > \[!zm-reading\|wide\] 檢索式\n> > - 英文詞：`/);
	assert.match(md, /\n> \[!zm-board\] 文獻\n> > \[!zm-kpi\] 文獻\n> > \*\*2 篇\*\* {2}\n> > 有 AI 研讀資料 1 篇\n/);
	assert.match(md, /> > \[!zm-chart\] 檢索詞建議（從這些文獻反推）\n> > Accidental Falls [▰▱]{6} 2/);
	assert.match(md, /\n\n## PICO 表（2 篇）\n\n\| 文獻 \| 研究設計 \|/, "the table open: the page's point");
	assert.match(md, /\n> \[!zm-meta\]- 怎麼讀「對照本題」\n> 「對照本題」只是字詞比對/);
	assert.match(md, /\n> \[!zm-ref\]- 檢索詞建議（完整）\n> 這些詞取自/);
	assert.match(md, /\n> \[!zm-ref\]- 沒有結構化資料的文獻（1）\n> - Wong, 2020\n/);
	assert.doesNotMatch(P.noteSection(rows(), null, meta), /本題 PICO|對照本題/, "no card: no card board");
});

test("noteSection and noteFrontmatter: the info callout, the card, the table, the legend, the no-data list; the frontmatter keys", () => {
	let meta = { scopeName: "跌倒回顧", generatedAt: "2026-10-13T01:00:00.000Z", uri: "zotero://select/library/collections/C1", csvPath: "Zotero/Reviews/跌倒回顧 PICO 表.csv",
		htmlPath: "Zotero/Reviews/跌倒回顧 PICO 表.html", links: true, query: P.cardQuery(CARD), screened: { included: 2, total: 5 }, title: "跌倒回顧：PICO 表", collectionKey: "library/collections/C1", path: "跌倒回顧" };
	let section = P.noteSection(rows(), CARD, meta);
	assert.match(section, /^> \[!info\] 由 ZotMax 依「跌倒回顧」的 2 篇文獻於 2026-10-13 產生；重新產生只會覆寫這個區塊。\n> 篩選已開始，所以只列全文納入的 2 篇（分類共 5 篇）。\n> Zotero：\[開啟\]\(zotero:\/\/select\/library\/collections\/C1\) · CSV：`Zotero\/Reviews\/跌倒回顧 PICO 表\.csv` · Word 版：`Zotero\/Reviews\/跌倒回顧 PICO 表\.html`\n> 欄位取自各篇 AI 筆記/);
	assert.match(section, /\n\n## 本題 PICO\n\n\*\*研究問題\*\*/);
	assert.match(section, /\n\n## PICO 表（2 篇）\n\n\| 文獻 \| 研究設計 \|/);
	assert.match(section, /\[\[Zotero\/Lee 2021\\\|Lee & Chen, 2021\]\]/);
	assert.match(section, /\n\n「對照本題」只是字詞比對/);
	assert.match(section, /\n\n## 沒有結構化資料的文獻\n\n- Wong, 2020\n\n這幾篇還沒有 AI 筆記/);
	let noCard = P.noteSection(rows(), null, Object.assign({}, meta, { screened: null, links: false }));
	assert.doesNotMatch(noCard, /本題 PICO|對照本題|篩選已開始|\[\[/);
	let fm = P.noteFrontmatter(rows(), CARD, meta);
	assert.equal(fm.type, "pico-table");
	assert.equal(fm.zotero_collection, "library/collections/C1");
	assert.equal(fm.pico_question, CARD.question);
	assert.equal(fm.pico_p, CARD.p);
	assert.equal(fm.studies, 2);
	assert.equal(fm.studies_without_data, 1);
	assert.equal(fm.pico_csv, meta.csvPath);
	assert.equal(fm.notion, "");
	assert.equal(P.noteFrontmatter(rows(), null, meta).pico_question, "");
	// The whole note: new, then rewritten with the user's part kept (screening.js buildReviewNote)
	let note = P.buildNote(null, fm, meta.title, section);
	assert.match(note, /^---\ntitle: "跌倒回顧：PICO 表"\ntype: "pico-table"\n/);
	assert.match(note, /\ntags:\n {2}- "PICO"\n---\n/);
	assert.match(note, /\n# 跌倒回顧：PICO 表\n\n%% zotero-bridge:start[^\n]*%%\n\n> \[!info\]/);
	assert.match(note, /\n%% zotero-bridge:end %%\n\n## ✍️ 我的筆記\n\n$/);
	let edited = note + "我自己的想法。\n";
	let again = P.buildNote(edited, Object.assign({}, fm, { studies: 3 }), meta.title, section.replace("2 篇文獻", "3 篇文獻"));
	assert.match(again, /\nstudies: 3\n/);
	assert.match(again, /3 篇文獻/);
	assert.match(again, /我自己的想法。\n$/);
});

test("fileNames and doneText", () => {
	assert.deepEqual(P.fileNames("跌倒回顧"), { base: "跌倒回顧 PICO 表", note: "跌倒回顧 PICO 表.md", csv: "跌倒回顧 PICO 表.csv", html: "跌倒回顧 PICO 表.html" });
	assert.equal(P.fileNames("").note, "選取的文獻 PICO 表.md");
	assert.equal(P.fileNames('A/B: "C"?').base, "A B C PICO 表");
	let t = P.doneText({ dir: "/vault/Zotero/Reviews", files: ["x.md", "x.csv"], items: 5, noData: 2, notionUrl: "https://notion.so/p", notionError: "", card: false });
	assert.match(t, /^已把 5 篇文獻整理成 PICO 表，寫到：\n\/vault\/Zotero\/Reviews\n\n檔案：x\.md、x\.csv\nNotion 頁面也更新了：https:\/\/notion\.so\/p\n⚠ 2 篇沒有 AI 筆記的結構化資料/);
	assert.match(t, /還沒有 PICO 問題卡/);
	assert.match(t, /「複製成表格」/);
	let err = P.doneText({ dir: "/d", files: ["x.md"], items: 1, noData: 0, notionUrl: "", notionError: "401", card: true });
	assert.match(err, /⚠ Notion 沒有寫入：401/);
	assert.doesNotMatch(err, /問題卡|沒有 AI 筆記/);
});

test("tagTerm and keywordSuggestions: subject terms from Zotero tags (MeSH qualifiers and stars dropped, workflow tags skipped), counted by paper, marked when the card has them", () => {
	assert.equal(P.tagTerm("*Accidental Falls/prevention & control"), "Accidental Falls");
	assert.equal(P.tagTerm("狀態/已讀"), "");
	assert.equal(P.tagTerm("篩選/納入"), "");
	assert.equal(P.tagTerm("zotero-bridge"), "");
	assert.equal(P.tagTerm("_todo"), "");
	assert.equal(P.tagTerm("Humans"), "", "MeSH check tags are not search terms");
	assert.equal(P.tagTerm("2021"), "");
	let tags = [
		["*Accidental Falls/prevention & control", "Exercise Therapy", "Humans", "狀態/已讀"],
		["Accidental Falls", "Exercise Therapy/methods", "Hospitalization"],
		["accidental falls", "Hospitalization", "Aged"],
		["Accidental Falls/statistics & numerical data", "Exercise Therapy", "Rare Term", "Accidental Falls"],
	];
	let list = P.keywordSuggestions(tags, CARD);
	assert.deepEqual(list.map(k => [k.term, k.papers]), [["Accidental Falls", 4], ["Exercise Therapy", 3], ["Hospitalization", 2]],
		"one count per paper, case folded; with four papers a term needs two");
	assert.ok(list.every(k => !k.inSearch));
	let withFalls = P.keywordSuggestions(tags, Object.assign({}, CARD, { o: "跌倒 accidental falls" }));
	assert.equal(withFalls.find(k => k.term === "Accidental Falls").inSearch, true);
	assert.equal(P.keywordSuggestions(tags.slice(0, 2), null).some(k => k.term === "Hospitalization"), true, "one paper is enough with fewer than four");
	assert.equal(P.keywordSuggestions(tags, CARD, { max: 1 }).length, 1);
	assert.deepEqual(P.keywordSuggestions([], CARD), []);
	// The PICO 表 note's section
	let md = P.keywordSection(list, 4, true);
	assert.match(md, /^## 🔎 檢索詞建議（從這些文獻反推）\n\n這些詞取自上面 4 篇文獻/);
	assert.match(md, /沒有打勾的 3 個/);
	assert.match(md, /\| 詞 \| 篇數 \| 已在問題卡 \|\n\|---\|:---:\|:---:\|\n\| Accidental Falls \| ▰▰▰▰▰▰ 4 \| {2}\|/);
	assert.doesNotMatch(P.keywordSection(list, 4, false), /已在問題卡 \|/);
	assert.equal(P.keywordSection([], 4, true), "");
	let section = P.noteSection(rows(), CARD, { scopeName: "跌倒回顧", generatedAt: "2026-10-13T01:00:00.000Z", keywords: list });
	assert.ok(section.indexOf("## 🔎 檢索詞建議") > section.indexOf("「對照本題」只是字詞比對"));
	assert.ok(section.indexOf("## 🔎 檢索詞建議") < section.indexOf("## 沒有結構化資料的文獻"));
	assert.doesNotMatch(P.noteSection(rows(), CARD, { scopeName: "跌倒回顧", generatedAt: "2026-10-13T01:00:00.000Z" }), /檢索詞建議/);
});
