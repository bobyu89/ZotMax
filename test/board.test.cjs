// The 看板 layout of the literature note (content/core.js buildBoard): the facts as chips, the cards in order
// (一句話, PICO, 主要發現, 評讀, 我的劃線, 下一步), what each card says from what the note has and lacks, the
// links, the switch back to the classic 「重點」; the 評讀 card's data from a form (appraisal-form.js boardInfo);
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

test("buildBoard: chips, then 一句話, PICO, 主要發現, 評讀, 我的劃線, 下一步 as nested callouts, then the links", () => {
	let board = core.buildBoard(item(), { aiMarkdown: AI_FULL, study: STUDY, appraisalBoard: BOARD, fullTextLink: "Zotero/全文/Lee 2021", notionUrl: "https://notion.so/p" });
	assert.ok(board.startsWith("> [!zm-board] 重點\n> `RCT` `N = 120` `內科病房` `Taiwan` `CEBM 2` `JBI 1.c`\n>\n"), board.slice(0, 200));
	assert.deepEqual(cards(board), ["zm-summary|wide 一句話", "zm-pico PICO", "zm-findings 主要發現", "zm-appraisal 評讀", "zm-highlights|wide 我的劃線（3）", "zm-next|wide 下一步"]);
	assert.match(board, /> > \[!zm-pico\] PICO\n> > \*\*P\*\* 65 歲以上住院病人 {2}\n> > \*\*I\*\* 護理師主導運動 {2}\n> > \*\*C\*\* 常規照護 {2}\n> > \*\*O\*\* 跌倒發生率\n/);
	assert.match(board, /> > \[!zm-findings\] 主要發現\n> > - 跌倒率下降 30%（p < \.05）\n> > - 跌倒自我效能提升\n> > - 沒有不良事件\n>\n/, "three findings at most");
	assert.match(board, /> > \[!zm-appraisal\] 評讀\n> > CASP RCT（2024）・已核對 {2}\n> > ✅✅✅❓✅❌✅✅✅✅✅ {2}\n> > ▰▰▰▰▰▰▰▰▱▱ 是 9／11 {2}\n> > \*\*整體\*\*：納入\n/);
	assert.match(board, /> > \[!zm-highlights\|wide\] 我的劃線（3）\n> > 🟡 重要發現 ▰▰▰▰▱▱ 2 {2}\n> > 🔴 限制／疑問 ▰▰▱▱▱▱ 1\n> >\n> > - ==🟡Falls decreased by 30%== · \[p\. 5\]\(zotero:\/\/open-pdf\/[^)]+\)\n> > - ==🔴Only two wards took part== · \[p\. 7\]/);
	assert.match(board, /> > \[!zm-next\|wide\] 下一步\n> > ✅ 這篇的資料都齊了。/, "nothing left to do");
	assert.match(board, /\n> \[\[Zotero\/全文\/Lee 2021\|全文與劃線\]\] · \[Zotero\]\(zotero:\/\/select\/library\/items\/ABCD1234\) · \[Notion\]\(https:\/\/notion\.so\/p\) · \[DOI\]\(https:\/\/doi\.org\/10\.1111\/jan\.12345\)$/);
	// Every line belongs to the board callout
	assert.ok(board.split("\n").every(l => l.startsWith(">")));
});

test("buildBoard: cards without data are left out, 下一步 says what is missing", () => {
	// No AI note, no highlights, a scanned PDF: only 下一步, with three steps
	let d = item(false);
	d.fullTextStatus = "none";
	let board = core.buildBoard(d, {});
	assert.deepEqual(cards(board), ["zm-next|wide 下一步"]);
	assert.doesNotMatch(board, /^> `/m, "no chips without data");
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
	board = core.buildBoard(item(), { aiMarkdown: AI_FULL, study: Object.assign({}, STUDY, { comparison: "未報告" }) });
	assert.doesNotMatch(board, /\*\*C\*\*/);
	board = core.buildBoard(item(), { aiMarkdown: AI_FULL, study: { study_design: "RCT" } });
	assert.ok(!cards(board).some(c => c.startsWith("zm-pico")));
	// A backtick in a value can't break the chips
	board = core.buildBoard(item(), { study: { study_design: "mixed `methods`" } });
	assert.match(board, /^> `mixed 'methods'`$/m);
});

test("buildObsidianNote: layout board puts the board where 「重點」 was; the classic layout and the folded sections stay the same", () => {
	let opts = { aiMarkdown: AI_FULL, study: STUDY, appraisalBoard: BOARD };
	let board = core.buildObsidianNote(null, item(), Object.assign({ layout: "board" }, opts));
	let classic = core.buildObsidianNote(null, item(), opts);
	assert.match(board, /%% zotero-bridge:start[^\n]*%%\n\n> \[!zm-board\] 重點\n/);
	assert.match(classic, /%% zotero-bridge:start[^\n]*%%\n\n> \[!abstract\] 重點\n/);
	let folded = note => [...note.matchAll(/^> \[!([\w-]+)\]- (.+)$/gm)].map(m => `${m[1]} ${m[2]}`);
	assert.deepEqual(folded(board), folded(classic), "the folded sections are the same in both layouts");
	// Re-synced: the board replaces the classic block, the user's part is kept
	let edited = classic + "我的想法。\n";
	let again = core.buildObsidianNote(edited, item(), Object.assign({ layout: "board" }, opts));
	assert.match(again, /\[!zm-board\] 重點/);
	assert.doesNotMatch(again, /\[!abstract\] 重點/);
	assert.match(again, /## ✍️ 我的筆記\n\n我的想法。\n$/);
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

test("CSS snippet: header with the version, a grid board, flat cards, pills, large KPI numbers, every card type coloured", () => {
	let css = style.css();
	assert.equal(style.versionOf(css), style.VERSION);
	assert.ok(css.startsWith(style.header()));
	assert.match(css, /\.callout\[data-callout="zm-board"\] > \.callout-content \{\n\tdisplay: grid;\n\tgrid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 230px\), 1fr\)\);/);
	assert.match(css, /\[data-callout-metadata~="wide"\] \{\n\tgrid-column: 1 \/ -1;/);
	assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 230px\), 1fr\)\);\n\tgap: 10px;\n[^}]*align-items: stretch;/, "cards in a row are equally tall");
	assert.match(css, /> \.callout\[data-callout="zm-findings"\],\n[^{]*:not\(:has\(> \.callout\[data-callout="zm-appraisal"\]\)\) > \.callout\[data-callout="zm-pico"\] \{\n\tgrid-column: 1 \/ -1;/, "主要發現 full width; PICO too without an appraisal card");
	assert.match(css, /--list-indent: 1\.1em;/);
	assert.match(css, /:has\(> \.callout\[data-callout="zm-next"\]\) \{\n\tgrid-template-columns: repeat\(auto-fit, minmax\(min\(100%, max\(230px, calc\(50% - 5px\)\)\), 1fr\)\);/, "the note's board: two columns at most");
	assert.match(css, /> p code \{[^}]*border-radius: 999px;/);
	assert.match(css, /\.callout\[data-callout="zm-kpi"\] strong \{[^}]*font-size: 1\.9em;/);
	for (let [type] of style.CARDS) assert.match(css, new RegExp(`\\.callout\\[data-callout="${type}"\\] \\{\\n\\t--callout-color: [\\d, ]+;\\n\\t--callout-icon: lucide-[a-z-]+;`));
	assert.doesNotMatch(css, /box-shadow/, "flat: no shadows (DESIGN.md)");
	assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i, "only Obsidian's variables and the callout colours");
	// Every card type the notes use has a rule
	let used = new Set([...core.buildBoard(item(), { aiMarkdown: AI_FULL, study: STUDY, appraisalBoard: BOARD }).matchAll(/\[!(zm-[\w-]+)/g)].map(m => m[1]));
	for (let t of used) assert.ok(t === "zm-board" || style.CARDS.some(([c]) => c === t), `${t} has a colour`);
	assert.match(css, /\.callout\[data-callout="zm-chart"\] \.mermaid svg \{\n\tmax-width: 100%;/, "the designs pie fits its card");
	assert.ok(style.CARDS.some(([c]) => c === "zm-chart") && style.CARDS.some(([c]) => c === "zm-kpi"), "the dashboard's cards too");
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
