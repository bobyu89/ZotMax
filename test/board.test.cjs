// The 看板 layout of the literature note (content/core.js buildBoard): the byline, the 研究概要 tiles, the cards in
// order (一句話, PICO, 評讀, 主要發現, 我的劃線, 下一步), what each card says from what the note has and lacks, the
// links, the four folded groups, the cssclasses, the switch back to the classic 「重點」; the 評讀 card's data from a form (appraisal-form.js boardInfo);
// and the CSS snippet (content/obsidian-style.js): its text, versions, enabling it in appearance.json and
// installing it into a vault (in-memory IOUtils).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const core = require("../content/core.js");
const tools = require("../content/appraisal-tools.js");
const form = require("../content/appraisal-form.js");
const style = require("../content/obsidian-style.js");
const { sampleItem, AI_MD } = require("./fixtures.cjs");

const AI_FULL = AI_MD + "\n## 主要結果\n- 跌倒率下降 30%（p < .05）\n- 跌倒自我效能提升\n- 沒有不良事件\n- 第四點不會出現\n";
const STUDY = {
	study_design: "RCT", sample_size: 120, setting: "內科病房", country: "Taiwan", population: "65 歲以上住院病人",
	intervention: "護理師主導運動", comparison: "常規照護", outcomes: "跌倒發生率", evidence_level: "2", jbi_level: "1.c", appraisal_overall: "納入",
};

function item(annotations = true) {
	let d = sampleItem();
	d.fullTextStatus = "ok";
	d.attachments[0].annotations = annotations ? [
		{ key: "Y1", type: "highlight", text: "Falls decreased by 30%", comment: "", color: "#ffd400", pageLabel: "5", tags: [] },
		{ key: "Y2", type: "highlight", text: "Adherence was 92%", comment: "", color: "#ffd400", pageLabel: "6", tags: [] },
		{ key: "R1", type: "highlight", text: "Only two wards took part", comment: "外推性？", color: "#ff6666", pageLabel: "7", tags: [] },
	] : [];
	return d;
}

function cards(board) {
	return [...board.matchAll(/^> > \[!(zm-[\w-]+)(\|wide)?\] (.+)$/gm)].map(m => `${m[1]}${m[2] || ""} ${m[3]}`);
}

const BOARD = { toolName: "CASP RCT（2024）", lights: "✅✅✅❓✅❌✅✅✅✅✅", counts: { 是: 9, 否: 1, 不清楚: 1, 不適用: 0 }, answered: 11, total: 11, status: "verified", overall: "納入" };

test("bar: filled cells for n of total, rounded, clamped; empty for no total", () => {
	assert.equal(core.bar(3, 10), "▰▰▰▱▱▱▱▱▱▱");
	assert.equal(core.bar(2, 3, 6), "▰▰▰▰▱▱");
	assert.equal(core.bar(5, 4), "▰▰▰▰▰▰▰▰▰▰");
	assert.equal(core.bar(-1, 4), "▱▱▱▱▱▱▱▱▱▱");
	assert.equal(core.bar(1, 0), "▱▱▱▱▱▱▱▱▱▱");
});

test("buildBoard: the byline, 研究概要 tiles, then 一句話, PICO, 評讀, 主要發現, 我的劃線, 下一步 as nested callouts, then the links", () => {
	let board = core.buildBoard(item(), { aiMarkdown: AI_FULL, study: STUDY, appraisalBoard: BOARD, fullTextLink: "Zotero/全文/Lee 2021", notionUrl: "https://notion.so/p" });
	assert.ok(board.startsWith("> [!zm-board] 重點\n> Chen、Smith · 2024 · *Journal of Advanced Nursing*\n>\n"), board.slice(0, 200));
	assert.deepEqual(cards(board), ["zm-stats|wide 研究概要", "zm-summary|wide 一句話", "zm-pico PICO", "zm-appraisal 評讀", "zm-findings|wide 主要發現", "zm-highlights|wide 我的劃線（3）", "zm-next|wide 下一步"]);
	// The study at a glance: label：**value**, the CEBM level with its strength bar
	assert.match(board, /> > \[!zm-stats\|wide\] 研究概要\n> > - 研究設計：\*\*RCT\*\*\n> > - 樣本數：\*\*N = 120\*\*\n> > - 場域：\*\*內科病房 · Taiwan\*\*\n> > - 證據等級：\*\*CEBM 2\*\* ▰▰▰▰▱\n> > - JBI 等級：\*\*1\.c\*\*\n/);
	assert.match(board, /> > \[!zm-pico\] PICO\n> > - \*\*P\*\* 65 歲以上住院病人\n> > - \*\*I\*\* 護理師主導運動\n> > - \*\*C\*\* 常規照護\n> > - \*\*O\*\* 跌倒發生率\n/);
	assert.match(board, /> > \[!zm-findings\|wide\] 主要發現\n> > - 跌倒率下降 30%（p < \.05）\n> > - 跌倒自我效能提升\n> > - 沒有不良事件\n>\n/, "three findings at most");
	assert.match(board, /> > \[!zm-appraisal\] 評讀\n> > CASP RCT（2024）・已核對 {2}\n> > ✅✅✅❓✅❌✅✅✅✅✅ {2}\n> > ▰▰▰▰▰▰▰▰▱▱ 是 9／11 {2}\n> > \*\*整體\*\*：納入\n/);
	// One square per highlight in its colour, then the meanings with counts, then two quotes
	assert.match(board, /> > \[!zm-highlights\|wide\] 我的劃線（3）\n> > 🟨🟨🟥\n> >\n> > 🟡 重要發現 2 · 🔴 限制／疑問 1\n> >\n> > - ==🟡Falls decreased by 30%== · \[p\. 5\]\(zotero:\/\/open-pdf\/[^)]+\)\n> > - ==🔴Only two wards took part== · \[p\. 7\]/);
	assert.match(board, /> > \[!zm-next\|wide\] 下一步\n> > ✅ 這篇的資料都齊了。/, "nothing left to do");
	assert.match(board, /\n> \[\[Zotero\/全文\/Lee 2021\|全文與劃線\]\] · \[Zotero\]\(zotero:\/\/select\/library\/items\/ABCD1234\) · \[Notion\]\(https:\/\/notion\.so\/p\) · \[DOI\]\(https:\/\/doi\.org\/10\.1111\/jan\.12345\)$/);
	// Every line belongs to the board callout
	assert.ok(board.split("\n").every(l => l.startsWith(">")));
});

test("buildBoard: cards without data are left out, 下一步 says what is missing; the tiles' level bar, byline and highlight bar", () => {
	// No AI note, no highlights, a scanned PDF: only 下一步, with three steps
	let d = item(false);
	d.fullTextStatus = "none";
	let board = core.buildBoard(d, {});
	assert.deepEqual(cards(board), ["zm-next|wide 下一步"]);
	assert.doesNotMatch(board, /zm-stats/, "no tiles without data");
	assert.match(board, /- PDF 是掃描檔：先 OCR/);
	assert.match(board, /- 產生 AI 筆記：/);
	assert.match(board, /- 讀的時候劃線：/);
	assert.doesNotMatch(board, /評讀/, "no appraisal step before there is an AI note");
	// No PDF: no highlighting step
	d.fullTextStatus = "no_pdf";
	board = core.buildBoard(d, {});
	assert.match(board, /- 附上全文 PDF/);
	assert.doesNotMatch(board, /讀的時候劃線/);
	// An AI note with its own verdict and no form: the 評讀 card shows the AI's, 下一步 points to the form
	board = core.buildBoard(item(), { aiMarkdown: AI_FULL, study: STUDY });
	assert.match(board, /> > \[!zm-appraisal\] 評讀\n> > AI 筆記的評讀・AI 初評，待核對 {2}\n> > \*\*整體\*\*：納入/);
	assert.match(board, /- 評讀：在 ZotMax 面板開啟文獻評讀表/);
	// A form with only the AI's prefill; a form half answered; answered but not verified
	let step = b => core.nextSteps(item(), { appraisalBoard: Object.assign({}, BOARD, b) }, { ai: "x", groups: [1] });
	assert.deepEqual(step({ status: "ai" }), ["核對評讀：表上是 AI 初評，在 ZotMax 面板開啟文獻評讀表逐題確認"]);
	assert.deepEqual(step({ status: "human", answered: 7 }), ["評讀還有 4 題沒答"]);
	assert.deepEqual(step({ status: "human" }), ["評讀答完了：勾「我已核對」，評讀結果才會取代 AI 的值"]);
	assert.deepEqual(step({ status: "verified" }), []);
	// Not-reported PICO values are dropped; no PICO card without any
	board = core.buildBoard(item(), { aiMarkdown: AI_FULL, study: Object.assign({}, STUDY, { comparison: "未報告", country: "N/A" }) });
	assert.doesNotMatch(board, /\*\*C\*\*/);
	assert.match(board, /- 場域：\*\*內科病房\*\*\n/, "a not-reported country is left out of the tile");
	board = core.buildBoard(item(), { aiMarkdown: AI_FULL, study: { study_design: "RCT" } });
	assert.ok(!cards(board).some(c => c.startsWith("zm-pico")));
	// Backticks and asterisks in a value can't break the tile's bold
	board = core.buildBoard(item(), { study: { study_design: "mixed `methods` *x*" } });
	assert.match(board, /^> > - 研究設計：\*\*mixed 'methods' ＊x＊\*\*$/m);
	// Only a country: the tile says 國家
	assert.match(core.statsCard({ country: "Japan" }), /^- 國家：\*\*Japan\*\*$/);
	// CEBM 1 (strongest) … 5 as strength; anything else no bar
	assert.deepEqual(["1", "3", "5", "2a", "", "6"].map(core.levelBar), ["▰▰▰▰▰", "▰▰▰▱▱", "▰▱▱▱▱", "", "", ""]);
	// The byline: family names (Chinese in full), more than three end in 等, the journal in italics
	let many = item();
	many.creators = ["Lee", "Wang", "Kim", "Ito"].map(n => ({ lastName: n, firstName: "A", creatorType: "author" }));
	assert.equal(core.byline(many), "Lee、Wang、Kim 等 · 2024 · *Journal of Advanced Nursing*");
	many.creators = [{ lastName: "陳", firstName: "美玲", creatorType: "author" }];
	many.publication = "";
	assert.equal(core.byline(many), "陳美玲 · 2024");
	// The highlight bar scales past 20 squares, every meaning keeps at least one
	let groups = [{ info: core.colorInfo("#ffd400"), items: new Array(30) }, { info: core.colorInfo("#ff6666"), items: new Array(1) }, { info: core.colorInfo("#123456"), items: new Array(2) }];
	let bar = core.highlightBar(groups);
	assert.equal([...bar].length, 18 + 1 + 1);
	assert.ok(bar.startsWith("🟨".repeat(18) + "🟥") && bar.endsWith("⬛"), bar);
});

test("buildObsidianNote: the board layout groups the folded sections in four, the classic layout keeps them one by one; the board replaces the classic block", () => {
	let opts = { aiMarkdown: AI_FULL, study: STUDY, appraisalBoard: BOARD, notesMarkdown: [{ title: "n", md: "我的 Zotero 筆記" }],
		appraisalMarkdown: "## 文獻評讀表\n\n表", searchCallout: "> [!search]- 🔎 延伸搜尋\n> PubMed" };
	let board = core.buildObsidianNote(null, item(), Object.assign({ layout: "board" }, opts));
	let classic = core.buildObsidianNote(null, item(), opts);
	assert.match(board, /%% zotero-bridge:start[^\n]*%%\n\n> \[!zm-board\] 重點\n/);
	assert.match(classic, /%% zotero-bridge:start[^\n]*%%\n\n> \[!abstract\] 重點\n/);
	let folded = note => [...note.matchAll(/^> \[!([\w-]+)\]- (.+)$/gm)].map(m => `${m[1]} ${m[2]}`);
	assert.deepEqual(folded(classic), ["quote 🟡 重要發現（2）", "quote 🔴 限制／疑問（1）", "note 我的 Zotero 筆記（1）", "example 文獻評讀表", "note AI 文獻筆記", "info 摘要（Abstract）", "search 🔎 延伸搜尋", "info 書目資訊"]);
	assert.deepEqual(folded(board), ["zm-mine 我的劃線與筆記（劃線 3 · 筆記 1）", "zm-form 文獻評讀表", "zm-ai AI 文獻筆記", "zm-ref 摘要與書目"]);
	// Inside a group the sections are open callouts; the appraisal form and the AI note are the group's body
	assert.match(board, /> \[!zm-mine\]- [^\n]+\n> > \[!quote\] 🟡 重要發現（2）\n> > - ==🟡Falls decreased by 30%==/);
	assert.match(board, /> > \[!note\] 我的 Zotero 筆記（1）\n> > 我的 Zotero 筆記\n/);
	assert.match(board, /> \[!zm-form\]- 文獻評讀表\n> 表\n/);
	assert.match(board, /> \[!zm-ai\]- AI 文獻筆記\n> ### 研究設計與方法\n/);
	assert.match(board, /> \[!zm-ref\]- 摘要與書目\n> > \[!info\] 摘要（Abstract）\n> > Background: Falls are common\.\n[\s\S]*> > \[!search\] 🔎 延伸搜尋\n> > PubMed\n>\n> > \[!info\] 書目資訊\n/);
	// Group titles say what is inside
	let titles = (o) => folded(core.buildObsidianNote(null, item(o.marks), Object.assign({ layout: "board" }, opts, o.opts)));
	assert.equal(titles({ marks: true, opts: { notesMarkdown: [] } })[0], "zm-mine 我的劃線（3）");
	assert.equal(titles({ marks: false, opts: {} })[0], "zm-mine 我的 Zotero 筆記（1）");
	assert.equal(titles({ marks: true, opts: { aiMarkdown: "" } }).at(-1), "zm-ref 摘要與書目");
	// The board layout's classes for the snippet; the classic layout has none
	assert.deepEqual(core.frontmatterList(core.splitFrontmatter(board).frontmatter, "cssclasses"), ["zotmax-note", "zm-compact-props"]);
	assert.doesNotMatch(classic, /^cssclasses:/m);
	let full = core.buildObsidianNote(null, item(), Object.assign({ layout: "board", compactProperties: false }, opts));
	assert.deepEqual(core.frontmatterList(core.splitFrontmatter(full).frontmatter, "cssclasses"), ["zotmax-note"]);
	// Re-synced: the board replaces the classic block, the user's part is kept
	let edited = classic + "我的想法。\n";
	let again = core.buildObsidianNote(edited, item(), Object.assign({ layout: "board" }, opts));
	assert.match(again, /\[!zm-board\] 重點/);
	assert.doesNotMatch(again, /\[!abstract\] 重點/);
	assert.match(again, /## ✍️ 我的筆記\n\n我的想法。\n$/);
});

test("cssclasses: the user's own classes are kept in every form, ZotMax's come first and go with the classic layout", () => {
	let fm = (line) => core.buildObsidianNote(`---\ntitle: "x"\n${line}\n---\n\n# x\n`, item(), { layout: "board" });
	let classes = text => core.frontmatterList(core.splitFrontmatter(text).frontmatter, "cssclasses");
	assert.deepEqual(classes(fm("cssclasses: wide-page")), ["zotmax-note", "zm-compact-props", "wide-page"]);
	assert.deepEqual(classes(fm('cssclasses: [wide-page, "cards"]')), ["zotmax-note", "zm-compact-props", "wide-page", "cards"]);
	assert.deepEqual(classes(fm("cssclasses:\n  - wide-page\n  - zotmax-note")), ["zotmax-note", "zm-compact-props", "wide-page"], "no duplicates");
	// Back to classic: ZotMax's go, the user's stay; none at all leaves no key
	let mine = core.buildObsidianNote(fm("cssclasses: wide-page"), item(), {});
	assert.deepEqual(classes(mine), ["wide-page"]);
	assert.doesNotMatch(core.buildObsidianNote(fm(""), item(), {}), /^cssclasses:/m);
	// Compact properties off: only the note class
	let off = core.buildObsidianNote(fm("cssclasses: wide-page"), item(), { layout: "board", compactProperties: false });
	assert.deepEqual(classes(off), ["zotmax-note", "wide-page"]);
});

test("boardInfo: the tool, one light per scored item in order, counts and state from a form", () => {
	let tool = tools.getTool("casp-rct");
	let scored = tool.items.filter(i => !i.open);
	let answers = {};
	scored.slice(0, 4).forEach((it, k) => { answers[it.id] = { answer: ["是", "否", "不清楚", "不適用"][k], source: "user" }; });
	let info = form.boardInfo({ record: { tool: "casp-rct", answers, overall: "需更多資訊", verified: false }, tool });
	assert.equal(info.toolName, "CASP 隨機對照試驗評讀表（2024 版）", "the Chinese name fits a card");
	let lights = "✅❌❓➖" + "⬜".repeat(scored.length - 4);
	assert.equal(info.lights.replace(/ /g, ""), lights);
	assert.deepEqual(info.lights.split(" ").map(g => [...g].length), [5, 5, scored.length - 10], "groups of five");
	assert.deepEqual(info.counts, { 是: 1, 否: 1, 不清楚: 1, 不適用: 1 });
	assert.equal(info.answered, 4);
	assert.equal(info.total, scored.length);
	assert.equal(info.status, "human");
	assert.equal(info.overall, "需更多資訊");
	assert.equal(form.boardInfo(null), null);
	assert.equal(form.boardInfo({ record: { tool: "casp-rct", answers: {}, verified: true }, tool }).status, "verified");
});

test("CSS snippet: header with the version, a grid board, one look for every card, tiles, the PICO grid, the folded groups, compact properties, phones", () => {
	let css = style.css();
	assert.equal(style.versionOf(css), style.VERSION);
	assert.equal(style.VERSION, 4);
	assert.ok(css.startsWith(style.header()));
	assert.match(css, /\.callout\[data-callout="zm-board"\] > \.callout-content \{\n\tdisplay: grid;\n\tgrid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 230px\), 1fr\)\);/);
	assert.match(css, /\[data-callout-metadata~="wide"\] \{\n\tgrid-column: 1 \/ -1;/);
	assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 230px\), 1fr\)\);\n\tgap: 10px;\n[^}]*align-items: stretch;/, "cards in a row are equally tall");
	assert.match(css, /:not\(:has\(> \.callout\[data-callout="zm-appraisal"\]\)\) > \.callout\[data-callout="zm-pico"\],\n[^{]*:not\(:has\(> \.callout\[data-callout="zm-pico"\]\)\) > \.callout\[data-callout="zm-appraisal"\] \{\n\tgrid-column: 1 \/ -1;/, "PICO or 評讀 alone take the row");
	assert.match(css, /:has\(> \.callout\[data-callout="zm-next"\]\) \{\n\tgrid-template-columns: repeat\(auto-fit, minmax\(min\(100%, max\(230px, calc\(50% - 5px\)\)\), 1fr\)\);/, "the note's board: two columns at most");
	// One look: every card type gets the neutral colour; titles in the user's accent; no per-type colours, no top rules
	assert.match(css, /\.callout\[data-callout\^="zm-"\] \{\n\t--callout-color: var\(--zm-neutral\);/);
	assert.match(css, /> \.callout > \.callout-title \{[^}]*color: var\(--text-accent\);/);
	assert.doesNotMatch(css, /border-top: 3px/, "no coloured top rule per card");
	assert.doesNotMatch(css, /--callout-color: \d/, "no per-card colours");
	for (let [type] of [...style.CARDS, ...style.GROUPS]) assert.match(css, new RegExp(`\\.callout\\[data-callout="${type}"\\] \\{\\n\\t--callout-icon: lucide-[a-z-]+;`), `${type} has an icon`);
	// Colour that means something: 下一步 in the attention colour
	assert.match(css, /\[data-callout="zm-next"\] \{\n\tbackground-color: rgba\(var\(--zm-attention\), 0\.06\);/);
	// The tiles: no title, a grid of boxes, the value large under its label; PICO as a grid with round letters
	assert.match(css, /> \.callout\[data-callout="zm-stats"\] > \.callout-title \{\n\tdisplay: none;/);
	assert.match(css, /\.callout\[data-callout="zm-stats"\] li strong \{\n\tdisplay: block;\n\tfont-size: 1\.4em;/);
	assert.match(css, /\.callout\[data-callout="zm-pico"\] li > strong:first-child \{[^}]*border-radius: 50%;/);
	assert.match(css, /\.callout:is\(\[data-callout="zm-stats"\], \[data-callout="zm-pico"\]\) li::marker \{\n\tcontent: "";/);
	// KPI numbers; four cards in one row; two per row on a phone
	assert.match(css, /\.callout\[data-callout="zm-kpi"\] strong \{[^}]*font-size: 1\.9em;/);
	assert.match(css, /body:not\(\.is-phone\) [^{]*:has\(> \.callout\[data-callout="zm-kpi"\]:last-child:nth-child\(4\)\) \{/);
	assert.match(css, /\.is-phone [^{]*:has\(> \.callout\[data-callout="zm-kpi"\]\) \{\n\tgrid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
	assert.match(css, /\.callout\[data-callout="zm-chart"\] \.mermaid svg \{\n\tmax-width: 100%;/, "the designs pie fits its card");
	// The folded groups share one look; the quick links are buttons; the update note is small
	assert.match(css, /\.callout\[data-callout="zm-mine"\],\n\.callout\[data-callout="zm-form"\],\n\.callout\[data-callout="zm-ai"\],\n\.callout\[data-callout="zm-ref"\] \{\n\tmargin: 8px 0;/);
	assert.match(css, /\.callout\[data-callout="zm-links"\] > \.callout-content > p a \{[^}]*border-radius: 999px;/);
	assert.match(css, /\.callout\[data-callout="zm-meta"\] \{[^}]*font-size: 0\.85em;/);
	assert.match(css, /\.callout\[data-callout="zm-nav"\] \{\n\t--callout-icon: lucide-compass;/, "the notes' navigation bar");
	// The compact properties area hides the plugin's own keys only — never tags or status
	assert.match(css, /\.zm-compact-props \.metadata-property:is\(\n\t\[data-property-key="title"\],/);
	for (let k of style.HIDDEN_PROPERTIES) assert.ok(css.includes(`[data-property-key="${k}"]`), k);
	assert.ok(!style.HIDDEN_PROPERTIES.includes("tags") && !style.HIDDEN_PROPERTIES.includes("status"));
	assert.deepEqual([...style.HIDDEN_PROPERTIES].sort(), [...core.MANAGED_KEYS.filter(k => k !== "tags"), "status_synced"].sort(), "in step with MANAGED_KEYS");
	assert.match(css, /\.zotmax-note \.inline-title \{/);
	// Phones and tablets
	assert.match(css, /\.is-mobile \.callout\[data-callout="zm-board"\] \{\n\tpadding: 8px 8px 10px;/, "tighter on phones and tablets");
	assert.match(css, /\.is-phone \.callout\[data-callout="zm-stats"\] ul \{\n\tgrid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
	assert.match(css, /\.is-mobile \.markdown-rendered:has\(\.callout\[data-callout\^="zm-"\]\) table \{\n\tdisplay: block;/, "wide tables scroll sideways");
	assert.doesNotMatch(css, /box-shadow/, "flat: no shadows (DESIGN.md)");
	assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i, "only Obsidian's variables and rgb triplets");
	// Every zm- callout the plugin writes has a rule
	let used = new Set([...css.matchAll(/data-callout="(zm-[\w-]+)"/g)].map(m => m[1]));
	for (let t of ["zm-stats", "zm-summary", "zm-pico", "zm-appraisal", "zm-findings", "zm-highlights", "zm-next", "zm-kpi", "zm-chart", "zm-topic", "zm-reading", "zm-inbox", "zm-issues", "zm-review", "zm-mine", "zm-form", "zm-ai", "zm-ref", "zm-meta", "zm-links", "zm-nav", "zm-board"]) {
		assert.ok(used.has(t), `${t} is styled`);
	}
	assert.equal(style.versionOf("/* my own */\n.x{}"), null);
	assert.equal(style.versionOf("/* ZotMax 看板樣式 v7 — …"), 7);
});

test("enableIn: zotmax added once to enabledCssSnippets; other settings kept; broken JSON left alone", () => {
	let r = style.enableIn(JSON.stringify({ theme: "obsidian", enabledCssSnippets: ["mine"] }));
	assert.equal(r.changed, true);
	assert.deepEqual(JSON.parse(r.text), { theme: "obsidian", enabledCssSnippets: ["mine", "zotmax"] });
	assert.equal(style.enableIn(r.text).changed, false);
	assert.deepEqual(JSON.parse(style.enableIn("").text), { enabledCssSnippets: ["zotmax"] });
	let bad = style.enableIn("{ not json");
	assert.equal(bad.changed, false);
	assert.match(bad.error, /不是有效的 JSON/);
	assert.equal(style.enableIn("[]").changed, false);
});

/** An in-memory IOUtils, and a fake Zotero.Prefs, in the module's global scope. */
function withVault(files, prefs, fn) {
	let mem = new Map(Object.entries(files));
	let dirs = new Set(["/"]);
	let add = (p) => { for (let d = path.dirname(p); !dirs.has(d); d = path.dirname(d)) dirs.add(d); };
	for (let p of mem.keys()) add(p);
	let saved = { IOUtils: globalThis.IOUtils, PathUtils: globalThis.PathUtils, Zotero: globalThis.Zotero };
	globalThis.IOUtils = {
		exists: async p => mem.has(p) || dirs.has(p),
		makeDirectory: async (p) => { dirs.add(p); add(p + "/x"); },
		readUTF8: async (p) => { if (!mem.has(p)) throw new Error("NotFound"); return mem.get(p); },
		writeUTF8: async (p, t) => { assert.ok(dirs.has(path.dirname(p)), `folder exists for ${p}`); mem.set(p, t); },
	};
	globalThis.PathUtils = { join: (...a) => path.join(...a) };
	let errors = [];
	globalThis.Zotero = { Prefs: { get: k => prefs[k], set: (k, v) => { prefs[k] = v; } }, logError: e => errors.push(e) };
	return Promise.resolve(fn(mem, dirs, errors)).finally(() => Object.assign(globalThis, saved));
}

const V = "/vault";
const SNIP = "/vault/.obsidian/snippets/zotmax.css";
const APP = "/vault/.obsidian/appearance.json";
const P = "extensions.zotero-bridge.";

test("install: writes the snippet and enables it; current copies are left; an edited copy is kept unless forced; no .obsidian, nothing", async () => {
	await withVault({ [APP]: JSON.stringify({ theme: "moonstone" }) }, {}, async (mem) => {
		let r = await style.install(V, { enable: true });
		assert.equal(r.status, "written");
		assert.equal(r.enabled, true);
		assert.equal(mem.get(SNIP), style.css());
		assert.deepEqual(JSON.parse(mem.get(APP)), { theme: "moonstone", enabledCssSnippets: ["zotmax"] });
		assert.match(style.describe(r), /^看板樣式 已寫入：\.obsidian\/snippets\/zotmax\.css，也已在 Obsidian 啟用/);
		assert.equal((await style.install(V)).status, "current");
		mem.set(SNIP, "/* mine */\n.callout{}");
		r = await style.install(V);
		assert.equal(r.status, "edited");
		assert.equal(mem.get(SNIP), "/* mine */\n.callout{}");
		assert.match(style.describe(r), /你改過這個檔案，所以沒有覆寫/);
		assert.equal((await style.install(V, { force: true })).status, "updated");
		assert.equal(mem.get(SNIP), style.css());
	});
	await withVault({ "/vault/note.md": "x" }, {}, async (mem) => {
		let r = await style.install(V, { enable: true });
		assert.equal(r.status, "noConfig");
		assert.ok(!mem.has(SNIP));
		assert.match(style.describe(r), /找不到 vault 裡的 \.obsidian 資料夾/);
	});
	await withVault({ [APP]: "{ broken" }, {}, async (mem) => {
		let r = await style.install(V, { enable: true });
		assert.equal(r.status, "written");
		assert.equal(r.enabled, false);
		assert.equal(mem.get(APP), "{ broken", "a broken appearance.json is not rewritten");
		assert.match(style.describe(r), /沒有自動啟用（appearance\.json 不是有效的 JSON）/);
	});
});

test("afterSync: installs and enables once; later only refreshes an outdated copy of its own; classic layout and no vault do nothing", async () => {
	let prefs = {};
	await withVault({ [APP]: "{}" }, prefs, async (mem) => {
		let r = await style.afterSync({ vaultPath: V });
		assert.equal(r.status, "written");
		assert.equal(prefs[P + "obsidian.styleInstalled"], true);
		// The user turned it off in Obsidian: it stays off
		mem.set(APP, JSON.stringify({ enabledCssSnippets: [] }));
		assert.equal(await style.afterSync({ vaultPath: V }), null);
		assert.deepEqual(JSON.parse(mem.get(APP)).enabledCssSnippets, []);
		// An older version of ZotMax's own file is refreshed, without enabling
		mem.set(SNIP, "/* ZotMax 看板樣式 v0 — old */");
		assert.equal((await style.afterSync({ vaultPath: V })).status, "updated");
		assert.equal(mem.get(SNIP), style.css());
		assert.deepEqual(JSON.parse(mem.get(APP)).enabledCssSnippets, []);
		// Deleted by the user: not brought back
		mem.delete(SNIP);
		assert.equal(await style.afterSync({ vaultPath: V }), null);
		assert.ok(!mem.has(SNIP));
	});
	await withVault({ [APP]: "{}" }, { [P + "obsidian.layout"]: "classic" }, async (mem) => {
		assert.equal(await style.afterSync({ vaultPath: V }), null);
		assert.ok(!mem.has(SNIP));
	});
	await withVault({}, {}, async () => {
		assert.equal(await style.afterSync({ vaultPath: "" }), null);
		assert.equal(await style.afterSync(null), null);
	});
	// No .obsidian yet: tried again on a later sync
	let later = {};
	await withVault({ "/vault/a.md": "x" }, later, async () => {
		assert.equal((await style.afterSync({ vaultPath: V })).status, "noConfig");
		assert.equal(later[P + "obsidian.styleInstalled"], undefined);
	});
});
