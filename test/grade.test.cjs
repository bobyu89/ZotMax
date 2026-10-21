// GRADE 證據確定性 (content/grade.js), the pure parts: the outcome model, the rating (start by design, steps down and
// up, the floor and ceiling), the studies an outcome picks up, outcome suggestions, the rule-based hints per domain,
// the checks before saving, and the Summary of Findings table, evidence profile, studies, CSV, HTML and note.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../content/grade.js");

const STUDIES = [
	{ key: "LEE", citation: "Lee & Chen, 2021", design: "RCT", sampleSize: "120", outcomes: "跌倒發生率、跌倒自我效能", appraisalOverall: "納入", appraisalTool: "CASP RCT",
		appraisalStatus: "已核對", direction: "有效", match: { p: "yes", i: "yes", c: "none", o: "yes" }, link: "Zotero/Lee 2021" },
	{ key: "WONG", citation: "Wong, 2022", design: "RCT", sampleSize: "80", outcomes: "跌倒發生率", appraisalOverall: "需更多資訊", appraisalStatus: "AI 初評",
		direction: "無差異", match: { p: "no", i: "yes", c: "none", o: "yes" } },
	{ key: "WANG", citation: "王大明, 2019", design: "cohort", sampleSize: "", outcomes: "髖部骨折", appraisalOverall: "", appraisalStatus: "", direction: "" },
	{ key: "LIN", citation: "林小華, 2020", design: "qualitative", sampleSize: "12", outcomes: "跌倒經驗", appraisalOverall: "納入", appraisalStatus: "已核對", direction: "" },
];

function rated(over = {}) {
	let o = G.newOutcome("跌倒發生率", STUDIES);
	return G.normalizeOutcome(Object.assign(o, over));
}

test("normalize: every field present, levels clamped, unknown values reset, at most seven outcomes with unique ids", () => {
	let o = G.normalizeOutcome({ name: "  跌倒\n發生率 ", importance: "nope", design: "weird", studies: ["A", "A", "", "B"], domains: { rob: { level: 5, reason: " r " }, imprecision: { level: -1 } }, upgrades: { dose: { level: 2 } } });
	assert.equal(o.name, "跌倒 發生率");
	assert.equal(o.importance, "critical");
	assert.equal(o.design, "rct");
	assert.deepEqual(o.studies, ["A", "B"]);
	assert.deepEqual(o.domains.rob, { level: 2, reason: "r" });
	assert.deepEqual(o.domains.imprecision, { level: 0, reason: "" });
	assert.deepEqual(Object.keys(o.domains), ["rob", "inconsistency", "indirectness", "imprecision", "publication"]);
	assert.equal(o.upgrades.dose.level, 1, "dose–response goes up one level at most");
	let t = G.normalizeTable({ outcomes: Array.from({ length: 9 }, (_, k) => ({ id: "same", name: `o${k}` })) });
	assert.equal(t.outcomes.length, G.MAX_OUTCOMES);
	assert.equal(new Set(t.outcomes.map(x => x.id)).size, G.MAX_OUTCOMES);
	assert.deepEqual(G.normalizeTable(null), { question: "", outcomes: [], updatedAt: "" });
	assert.equal(G.hasContent(t), true);
	assert.equal(G.hasContent(G.emptyTable()), false);
});

test("newOutcome and suggestions: the studies whose AI notes mention the outcome, the start their designs give; the card's O first, then common outcomes", () => {
	let o = G.newOutcome("跌倒發生率", STUDIES);
	assert.deepEqual(o.studies, ["LEE", "WONG"]);
	assert.equal(o.design, "rct");
	let hip = G.newOutcome("骨折", STUDIES, [o]);
	assert.deepEqual(hip.studies, ["WANG"], "words either way: 骨折 is in 髖部骨折");
	assert.equal(hip.design, "obs");
	assert.notEqual(hip.id, o.id);
	assert.equal(G.measures({ outcomes: "未報告" }, "未報告"), false);
	assert.deepEqual(G.suggestions(STUDIES, { o: "跌倒發生率、住院天數" }, []).map(s => [s.name, s.papers, !!s.fromCard]),
		[["跌倒發生率", 2, true], ["住院天數", 0, true], ["跌倒自我效能", 1, false], ["跌倒經驗", 1, false], ["髖部骨折", 1, false]]);
	assert.deepEqual(G.suggestions(STUDIES, null, ["跌倒發生率"]).map(s => s.name), ["跌倒自我效能", "跌倒經驗", "髖部骨折"], "already in the table: left out");
	assert.equal(G.designOf("meta-analysis"), "rct");
	assert.equal(G.designOf("quasi-experimental"), "obs");
	assert.equal(G.designOf("qualitative"), "qual");
	assert.equal(G.designOf("other"), "");
});

test("certainty: trials start high, observational studies low; one or two levels down per domain; rating up only for observational evidence; never below 極低 or above 高", () => {
	let c = G.certainty(rated());
	assert.deepEqual([c.start, c.score, c.level.label, c.level.symbol], [4, 4, "高", "⊕⊕⊕⊕"]);
	assert.equal(G.stepsText(c), "從「高」開始（隨機對照試驗），沒有升降級");
	c = G.certainty(rated({ domains: { rob: { level: 1, reason: "隨機分派不清楚" }, imprecision: { level: 1, reason: "N 200" } } }));
	assert.deepEqual([c.down, c.score, G.ratingText(c)], [2, 2, "⊕⊕◯◯ 低"]);
	assert.equal(G.stepsText(c), "從「高」開始（隨機對照試驗）；偏誤風險 −1、不精確性 −1");
	c = G.certainty(rated({ domains: { rob: { level: 2 }, inconsistency: { level: 2 }, imprecision: { level: 1 } } }));
	assert.equal(c.score, 1, "floor: 極低");
	assert.equal(c.level.en, "Very low");
	let up = { large: { level: 2, reason: "RR 0.15" }, dose: { level: 1, reason: "劑量越高效果越大" } };
	assert.equal(G.certainty(rated({ upgrades: up })).score, 4, "trials ignore rating up");
	assert.equal(G.certainty(rated({ upgrades: up })).steps.length, 0);
	c = G.certainty(rated({ design: "obs", upgrades: up }));
	assert.deepEqual([c.start, c.up, c.score], [2, 3, 4], "ceiling: 高");
	c = G.certainty(rated({ design: "obs" }));
	assert.equal(G.ratingText(c), "⊕⊕◯◯ 低");
	assert.equal(G.stepsText(c), "從「低」開始（觀察性研究），沒有升降級");
	assert.deepEqual(G.LEVELS.map(l => l.symbol), ["⊕⊕⊕⊕", "⊕⊕⊕◯", "⊕⊕◯◯", "⊕◯◯◯"]);
});

test("hints: appraisals for risk of bias, effect directions for inconsistency, the PICO match for indirectness, N for imprecision, the number of studies for publication bias", () => {
	let h = G.hints(rated(), STUDIES);
	assert.equal(h.design, "");
	assert.match(h.rob, /^2／2 篇有評讀結果；1 篇的結論是「需更多資訊」或「排除」，占一半以上，多半要降級；1 篇還是 AI 初評或評讀中/);
	assert.match(h.inconsistency, /結論方向不同（有效 1、無差異 1）.*I²/);
	assert.match(h.indirectness, /^1 篇的族群、介入或結果和 PICO 問題卡沒有共同字詞/);
	assert.match(h.imprecision, /^總樣本數約 200 人，少於 GRADE 的經驗法則（連續變項約 400 人；二元變項約 300 個事件）：多半要降級/);
	assert.match(h.publication, /^只有 2 篇：漏斗圖需要約 10 篇以上/);
	assert.equal(h.upgrade, "", "rating up is for observational evidence");
	// One study, no appraisal, no N, no card
	let hip = G.newOutcome("骨折", STUDIES);
	h = G.hints(hip, STUDIES);
	assert.match(h.rob, /^這些研究還沒有評讀結果：先在文獻評讀表逐篇評讀（隨機試驗用 RoB 2，非隨機研究用 ROBINS-I/);
	assert.match(h.inconsistency, /^只有 1 篇研究：無法評估不一致性/);
	assert.match(h.indirectness, /^建立這個分類的 PICO 問題卡後/);
	assert.match(h.imprecision, /^AI 筆記沒有樣本數/);
	assert.match(h.upgrade, /^只有沒有降級的觀察性證據才考慮升級/);
	hip.domains.rob.level = 1;
	assert.match(G.hints(hip, STUDIES).upgrade, /^已經有降級時，通常不再升級/);
	// Mixed designs, qualitative, the wrong start, nothing ticked
	assert.match(G.hints(G.normalizeOutcome({ name: "x", studies: ["LEE", "WANG"] }), STUDIES).design, /1 篇隨機試驗和 1 篇觀察性研究：GRADE 建議分開評/);
	assert.match(G.hints(G.normalizeOutcome({ name: "x", studies: ["LIN"] }), STUDIES).design, /GRADE-CERQual/);
	assert.match(G.hints(G.normalizeOutcome({ name: "x", studies: ["WANG"], design: "rct" }), STUDIES).design, /觀察性研究通常從「低」開始/);
	assert.match(G.hints(G.normalizeOutcome({ name: "x", studies: [] }), STUDIES).design, /^先勾選測量這個結果的研究/);
	// Enough people and studies
	let many = Array.from({ length: 10 }, (_, k) => ({ key: `S${k}`, citation: `S${k}`, design: "RCT", sampleSize: "60", outcomes: "pain", direction: "有效", appraisalOverall: "納入", appraisalStatus: "已核對" }));
	h = G.hints(G.newOutcome("pain", many), many);
	assert.match(h.imprecision, /^總樣本數約 600 人：已達經驗法則/);
	assert.match(h.publication, /^10 篇：可以畫漏斗圖/);
	assert.match(h.inconsistency, /^10 篇 AI 筆記的結論方向都是「有效」/);
	assert.match(h.rob, /^10／10 篇有評讀結果。/);
});

test("checkOutcome: a name, ticked studies, a reason for every step, and the effect", () => {
	assert.deepEqual(G.checkOutcome(rated({ effect: "RR 0.70" })), []);
	let found = G.checkOutcome(G.normalizeOutcome({ design: "obs", domains: { rob: { level: 1 } }, upgrades: { large: { level: 1 } } }));
	assert.deepEqual(found.map(f => [f.level, f.text]), [
		["warn", "還沒寫結果指標名稱。"], ["warn", "還沒勾選研究。"], ["warn", "偏誤風險降級了，寫一句理由（會成為表下的註腳）。"],
		["warn", "「效果很大」升級了，寫一句理由。"], ["info", "效果還沒填：從原文或統合分析抄寫，例如「RR 0.70（95% CI 0.55–0.89）」或「SMD −0.35（−0.60 to −0.10）」。"],
	]);
});

function sampleTable() {
	let falls = rated({ effect: "RR 0.70（95% CI 0.55–0.89）", absolute: "每 1000 人少 45 人", domains: { rob: { level: 1, reason: "一半研究的隨機分派不清楚" }, imprecision: { level: 1, reason: "" } }, notes: "取自 Lee 的統合分析" });
	let hip = G.normalizeOutcome(Object.assign(G.newOutcome("骨折", STUDIES, [falls]), { importance: "important", upgrades: { large: { level: 1, reason: "RR 0.30" } } }));
	return { question: "住院長者的運動能減少跌倒嗎？", outcomes: [falls, hip, G.normalizeOutcome({ id: "o9", name: "" })] };
}

test("summary and the Summary of Findings table: one row per named outcome, footnote letters for every step, the legend", () => {
	let s = G.summary(sampleTable(), STUDIES);
	assert.equal(s.rows.length, 2, "an unnamed outcome is left out");
	assert.deepEqual(s.rows.map(r => [r.outcome, r.importance, r.studies, r.participants, r.rating, r.marks.join(",")]), [
		["跌倒發生率", "關鍵", "2 篇（2 RCT）", "200", "⊕⊕◯◯ 低", "a,b"],
		["骨折", "重要", "1 篇（1 觀察性研究）", "", "⊕⊕⊕◯ 中", "c"],
	]);
	assert.deepEqual(s.notes.map(n => n.text), ["跌倒發生率：偏誤風險降 1 級。一半研究的隨機分派不清楚", "跌倒發生率：不精確性降 1 級（未寫理由）", "骨折：效果很大升 1 級。RR 0.30"]);
	let md = G.sofMarkdown(sampleTable(), STUDIES);
	assert.match(md, /^\| 結果指標 \| 重要性 \| 研究數（設計） \| 參與人數 \| 效果（相對；絕對） \| 證據確定性（GRADE） \|\n\|---\|---\|---\|---\|---\|---\|\n\| 跌倒發生率 \| 關鍵 \| 2 篇（2 RCT） \| 200 \| RR 0\.70（95% CI 0\.55–0\.89）；每 1000 人少 45 人 \| ⊕⊕◯◯ 低 a,b \|\n\| 骨折 \| 重要 \| 1 篇（1 觀察性研究） \| {2}\| （未填） \| ⊕⊕⊕◯ 中 c \|/);
	assert.match(md, /\n\na\. 跌倒發生率：偏誤風險降 1 級。一半研究的隨機分派不清楚 {2}\nb\. /);
	assert.match(md, /⊕⊕⊕⊕ 高（High）：非常有把握真正的效果接近估計值/);
	assert.equal(G.sofMarkdown({ outcomes: [] }, STUDIES), "（還沒有結果指標）");
	// A participants number the user wrote wins over the sum
	assert.equal(G.participants(rated({ participants: "1,240（4 篇）" }), STUDIES).text, "1,240（4 篇）");
	assert.equal(G.participants(G.normalizeOutcome({ studies: ["LEE", "WANG"] }), STUDIES).text, "120（另 1 篇未知）");
});

test("the evidence profile, the included studies and the CSV: every domain, every reason, the appraisals behind 偏誤風險", () => {
	let t = sampleTable();
	let profile = G.profileMarkdown(t, STUDIES);
	assert.match(profile, /^\| 結果指標 \| 研究數 \| 起始 \| 偏誤風險 \| 不一致性 \| 間接性 \| 不精確性 \| 發表偏誤 \| 升級 \| 確定性 \|/);
	assert.match(profile, /\| 跌倒發生率 \| 2 \| 高（隨機） \| 降一級（嚴重） \| 不降級 \| 不降級 \| 降一級（嚴重） \| 不降級 \| — \| ⊕⊕◯◯ 低 \|/);
	assert.match(profile, /\| 骨折 \| 1 \| 低（觀察性） \| 不降級 .* \| 效果很大 \+1 \| ⊕⊕⊕◯ 中 \|/);
	let st = G.studiesMarkdown(t, STUDIES, { links: true });
	assert.match(st, /\| \[\[Zotero\/Lee 2021\\\|Lee & Chen, 2021\]\] \| RCT \| 120 \| 納入（CASP RCT） \| 已核對 \| 有效 \| 跌倒發生率 \|/);
	assert.match(st, /\| Wong, 2022 \| RCT \| 80 \| 需更多資訊 \| AI 初評 \| 無差異 \| 跌倒發生率 \|/);
	assert.doesNotMatch(st, /林小華/, "only the studies an outcome uses");
	let csv = G.sofCSV(t, STUDIES);
	assert.ok(csv.startsWith("﻿結果指標,重要性,研究數,研究設計,參與人數,相對效果,絕對效果,起始,偏誤風險,偏誤風險理由,不一致性,"));
	assert.match(csv, /\r\n跌倒發生率,關鍵,2,2 RCT,200,RR 0\.70（95% CI 0\.55–0\.89）,每 1000 人少 45 人,高（隨機）,降一級（嚴重）,一半研究的隨機分派不清楚,/);
	assert.match(csv, /,低（Low）,取自 Lee 的統合分析\r\n/);
	assert.match(csv, /效果很大 \+1（RR 0\.30）,中（Moderate）/);
});

test("HTML for Word and the clipboard: the question, the SoF table, footnotes, the legend, the profile; text escaped", () => {
	let t = sampleTable();
	t.outcomes[0].effect = "RR <0.8> & more";
	let frag = G.sofFragment(t, STUDIES);
	assert.match(frag, /^<p><b>研究問題<\/b>：住院長者的運動能減少跌倒嗎？<\/p>/);
	assert.match(frag, /<td>RR &lt;0\.8&gt; &amp; more；每 1000 人少 45 人<\/td><td>⊕⊕◯◯ 低 a,b<\/td>/);
	assert.match(frag, /<p>a\. 跌倒發生率：偏誤風險降 1 級。一半研究的隨機分派不清楚<br>b\./);
	let html = G.sofHTML(t, STUDIES, { title: "跌倒預防：GRADE 證據摘要", scopeName: "跌倒預防", date: "2026-10-14" });
	assert.match(html, /^<!DOCTYPE html>\n<html lang="zh-TW">/);
	assert.match(html, /<h2>證據摘要表（Summary of Findings）<\/h2>/);
	assert.match(html, /<h2>證據剖面（Evidence profile）<\/h2><table/);
	let tsv = G.sofTSV(t, STUDIES);
	assert.equal(tsv.split("\n")[0], "結果指標\t重要性\t研究數（設計）\t參與人數\t效果（相對；絕對）\t證據確定性（GRADE）");
	assert.equal(tsv.split("\n").length, 3);
});

test("the note (看板): one card per outcome with its certainty, the levels' spread, every table folded", () => {
	let t = sampleTable();
	let md = G.noteSection(t, STUDIES, { scopeName: "跌倒預防", generatedAt: "2026-10-14T01:00:00.000Z", links: true, layout: "board" });
	assert.ok(md.startsWith("> [!zm-meta]- 🧭 GRADE · 跌倒預防 · 2 個結果指標 · 2026-10-14 產生\n"), md.slice(0, 80));
	assert.match(md, /\n> \[!zm-board\] 證據確定性\n> 研究問題：住院長者的運動能減少跌倒嗎？\n>\n> > \[!zm-kpi\] 跌倒發生率\n> > \*\*⊕⊕◯◯ 低\*\* {2}\n> > [^\n]+ · \d 篇[^\n]* {2}\n> > RR /);
	assert.match(md, /> > \[!zm-kpi\] 骨折\n> > \*\*⊕⊕⊕◯ 中\*\*/);
	assert.match(md, /> > \[!zm-chart\] 證據確定性分布\n> > ⊕⊕⊕◯ 中 ▰{8} 1 {2}\n> > ⊕⊕◯◯ 低 ▰{8} 1\n/);
	let order = ["> [!zm-ref]- 證據摘要表（Summary of Findings，可複製到報告）", "> [!zm-ref]- 證據剖面（Evidence profile）", "> [!zm-ref]- 納入研究的評讀", "> [!zm-ref]- 備註"].map(h => md.indexOf(h));
	assert.ok(order.every((at, k) => at > 0 && (!k || at > order[k - 1])), JSON.stringify(order));
	assert.doesNotMatch(md, /^## /m, "no open section");
	assert.match(G.noteSection({ outcomes: [] }, STUDIES, { scopeName: "x", layout: "board" }), /還沒有結果指標/);
});

test("the note: info, question, SoF, profile, studies, notes; frontmatter; file names; the dialog text", () => {
	let t = sampleTable();
	let meta = { title: "跌倒預防：GRADE 證據摘要", scopeName: "跌倒預防", generatedAt: "2026-10-14T01:00:00.000Z", uri: "zotero://select/library/collections/C1",
		csvPath: "Zotero/Reviews/跌倒預防 GRADE 證據摘要.csv", htmlPath: "Zotero/Reviews/跌倒預防 GRADE 證據摘要.html", links: true, collectionKey: "library/collections/C1", path: "碩論/跌倒預防" };
	let md = G.noteSection(t, STUDIES, meta);
	assert.ok(md.startsWith("> [!info] 由 ZotMax 依「跌倒預防」的 GRADE 評等於 2026-10-14 產生；重新匯出只會覆寫這個區塊。\n> Zotero：[開啟](zotero://select/library/collections/C1) · CSV："));
	assert.match(md, /> 評等是你的判斷：每一級升降都由你選/);
	let order = ["**研究問題**：住院長者的運動能減少跌倒嗎？", "## 證據摘要表（Summary of Findings）", "## 證據剖面（Evidence profile）", "## 納入研究的評讀", "## 備註"].map(h => md.indexOf(h));
	assert.ok(order.every((at, k) => at > 0 && (!k || at > order[k - 1])), JSON.stringify(order));
	assert.match(md, /## 備註\n\n- \*\*跌倒發生率\*\*：取自 Lee 的統合分析/);
	let fm = G.noteFrontmatter(t, STUDIES, meta);
	assert.equal(fm.type, "grade");
	assert.equal(fm.outcomes, 2);
	assert.deepEqual(fm.certainty, ["跌倒發生率：低", "骨折：中"]);
	assert.equal(fm.collection_path, "碩論/跌倒預防");
	let note = G.buildNote(null, fm, meta.title, md);
	assert.match(note, /^---\ntitle: "跌倒預防：GRADE 證據摘要"\ntype: "grade"\n/);
	assert.match(note, /\ntags:\n {2}- "GRADE"\n---\n/);
	assert.match(note, /\n## ✍️ 我的筆記\n\n$/);
	let again = G.buildNote(note + "討論紀錄。\n", Object.assign({}, fm, { outcomes: 3 }), meta.title, md.replace("跌倒預防", "跌倒"));
	assert.match(again, /\noutcomes: 3\n/);
	assert.match(again, /討論紀錄。\n$/, "the user's part stays");
	assert.deepEqual(G.fileNames("碩論/跌倒: 預防"), { base: "碩論 跌倒 預防 GRADE 證據摘要", note: "碩論 跌倒 預防 GRADE 證據摘要.md", csv: "碩論 跌倒 預防 GRADE 證據摘要.csv", html: "碩論 跌倒 預防 GRADE 證據摘要.html" });
	let done = G.doneText({ dir: "/vault/Zotero/Reviews", files: ["a.md", "a.csv", "a.html"], outcomes: 2, missingReasons: 1 });
	assert.match(done, /^已把 2 個結果指標的 GRADE 評等整理成證據摘要表，寫到：\n\/vault\/Zotero\/Reviews\n\n檔案：a\.md、a\.csv、a\.html\n⚠ 有 1 個升降級還沒寫理由/);
});
