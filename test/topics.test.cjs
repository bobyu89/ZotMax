// 首頁 and 主題頁 (content/topics.js), the pure parts: topics from the notes' collections, the numbers of a topic
// (directions, trend, next steps), the Markdown of a topic page and the home page, rewriting only the managed block;
// and the AI note's effect_direction (llm.js) that 證據說什麼 counts.
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../content/core.js");
const d = require("../content/dashboard.js");
const llm = require("../content/llm.js");
const T = require("../content/topics.js");

const NOW = new Date("2026-10-14T09:00:00");
const AI = { aiModel: "test-model", aiGeneratedAt: "2026-10-01T00:00:00Z" };
let nextKey = 1;

function note(title, { design, level, i, o, dir, year = "2024", collections = ["碩論/跌倒"], size, status = "待讀", ai = true, verified } = {}) {
	let full = { title, creators: [{ lastName: "Chen", firstName: "Mei", creatorType: "author" }], year, libraryPath: "library", key: `K${nextKey++}`,
		collections, itemType: "journalArticle", dateAdded: "2026-09-01T00:00:00Z", fullTextStatus: "ok", doi: "10.1/x" };
	let opts = ai ? Object.assign({ study: { study_design: design, evidence_level: level, intervention: i, outcomes: o, effect_direction: dir, sample_size: size } }, AI,
		verified ? { appraisal: { verified: true, tool: "CASP", overall: "納入" } } : {}) : {};
	let fm = Object.assign(core.managedFrontmatter(full, opts), status ? { status } : {});
	return d.noteRecord(core.splitFrontmatter(core.buildFrontmatter(fm, null)).frontmatter, `Zotero/${title}.md`);
}

function falls() {
	return [
		note("A", { design: "RCT", level: "2", i: "運動訓練", o: "跌倒發生率", dir: "有效", year: "2023", size: 120, status: "已讀" }),
		note("B", { design: "RCT", level: "2", i: "運動訓練、衛教", o: "跌倒發生率、跌倒自我效能", dir: "有效", year: "2021", size: 80 }),
		note("C", { design: "RCT", level: "2", i: "衛教", o: "跌倒自我效能", dir: "無差異", year: "2019", size: 40, status: "已引用" }),
		note("D", { design: "RCT", level: "1", i: "多因子介入", o: "跌倒發生率", dir: "有效", year: "2024", size: 30, collections: ["碩論/跌倒", "EBP 報告"] }),
		note("E", { design: "cohort", level: "3", i: "環境改造", o: "跌倒發生率", year: "2016", size: 300 }),
	];
}

test("effect_direction: asked for in the JSON block, normalized to 有效／無差異／有害／不一致, written to the frontmatter", () => {
	assert.deepEqual(llm.EFFECT_DIRECTIONS, ["有效", "無差異", "有害", "不一致"]);
	assert.match(llm.STUDY_DATA_PROMPT, /"effect_direction": "有效"\n\}/);
	assert.match(llm.STUDY_DATA_PROMPT, /- effect_direction：.*"有效"、"無差異"、"有害"、"不一致"/);
	let norm = v => llm.normalizeStudyData({ study_design: "RCT", effect_direction: v }).effect_direction;
	assert.equal(norm("有效"), "有效");
	assert.equal(norm("favours intervention"), "有效");
	assert.equal(norm("No significant difference"), "無差異");
	assert.equal(norm("harm"), "有害");
	assert.equal(norm("mixed"), "不一致");
	assert.equal(norm(null), "");
	assert.equal(norm("whatever"), "");
	assert.equal(llm.STUDY_FIELDS.at(-1), "effect_direction");
	assert.ok(core.STUDY_KEYS.includes("effect_direction"));
	let r = note("X", { design: "RCT", dir: "無差異", size: 64 });
	assert.equal(r.direction, "無差異");
	assert.equal(r.sampleSize, 64);
});

test("groupTopics and topicFileName: one topic per collection with notes (a note in two collections is in both), most notes first; trashed and unfiled notes left out", () => {
	let records = [...falls(), note("F", { collections: [] }), note("G", { collections: ["碩論/照顧者"] })];
	records.push(Object.assign(note("Gone"), { deleted: true }));
	let topics = T.groupTopics(records);
	assert.deepEqual(topics.map(t => [t.path, t.name, t.parent, t.records.length]), [
		["碩論/跌倒", "跌倒", "碩論", 5], ["碩論/照顧者", "照顧者", "碩論", 1], ["EBP 報告", "EBP 報告", "", 1],
	]);
	assert.equal(T.topicFileName("碩論/跌倒"), "碩論／跌倒");
	assert.equal(T.topicFileName("a: b?"), "a b");
	let files = T.assignFiles([{ path: "x/y" }, { path: "x／y" }, { path: "首頁" }]).map(f => f.file);
	assert.deepEqual(files, ["x／y", "x／y (2)", "首頁 (2)"], "unique names; 首頁 is taken");
});

test("topicStats: reading, evidence, what the evidence says (by intervention), the trend and the next steps", () => {
	let topic = T.groupTopics(falls())[0];
	let s = T.topicStats(topic, { now: NOW });
	assert.equal(s.total, 5);
	assert.equal(s.read, 2);
	assert.equal(s.readPercent, 40);
	assert.equal(s.best, "1");
	assert.equal(s.rct, 4);
	assert.equal(s.reviews, 0);
	assert.deepEqual([s.directions["有效"], s.directions["無差異"], s.directions["未判定"], s.directions.judged], [3, 1, 1, 4]);
	assert.equal(s.verdict.label, "多數有效");
	assert.equal(s.verdict.text, "4 篇可判斷方向的研究：有效 3、無差異 1；另有 1 篇未判定。");
	let byI = Object.fromEntries(s.interventions.map(g => [g.name, [g.records.length, g.tally["有效"], g.tally["無差異"], g.best]]));
	assert.deepEqual(byI, { "運動訓練": [2, 2, 0, "2"], "衛教": [2, 1, 1, "2"], "多因子介入": [1, 1, 0, "1"], "環境改造": [1, 0, 0, "3"] });
	assert.deepEqual([s.trend.recent, s.trend.before, s.trend.from, s.trend.newest, s.trend.oldest, s.trend.arrow], [2, 2, 2022, 2024, 2016, "→"]);
	assert.equal(s.medianSample, 80);
	let shorts = s.steps.map(x => x.short);
	assert.deepEqual(shorts, ["4 篇 RCT，還沒有系統性回顧", "缺口：多因子介入 × 跌倒自我效能", "3 篇待讀"]);
	assert.match(s.steps[0].text, /Cochrane Library 和 PROSPERO/);
	// Aliases merge the terms
	let aliases = new Map([["衛教", { key: "衛教", name: "衛教" }], ["多因子介入", { key: "衛教", name: "衛教" }]]);
	assert.equal(T.topicStats(topic, { now: NOW, aliases }).interventions.find(g => g.name === "衛教").records.length, 3);
});

test("verdict and nextSteps: split results, nothing judged yet, one study, old and small studies, missing AI notes, unverified appraisals, all done", () => {
	assert.equal(T.verdict(T.tally([])).label, "尚無判斷");
	assert.equal(T.verdict(T.tally([{ direction: "有效" }])).label, "僅 1 篇：有效");
	assert.equal(T.verdict(T.tally([{ direction: "有效" }, { direction: "無差異" }])).label, "結論分歧");
	assert.equal(T.verdict(T.tally([{ direction: "不一致" }, { direction: "不一致" }, { direction: "有效" }])).label, "多數結果不一致");
	let mixed = T.topicStats(T.groupTopics([
		note("M1", { design: "cohort", level: "3", i: "按摩", o: "疼痛", dir: "有效", year: "2012", size: 20, status: "已讀" }),
		note("M2", { design: "cohort", level: "3", i: "按摩", o: "疼痛", dir: "無差異", year: "2014", size: 30, status: "已讀" }),
		note("M3", { design: "cohort", level: "3", i: "按摩", o: "疼痛", year: "2010", size: 10, status: "已讀", verified: true }),
		note("M4", { ai: false, year: "2011", status: "已讀" }),
	])[0], { now: NOW });
	assert.deepEqual(mixed.steps.map(x => x.short), ["1 篇還沒有 AI 筆記", "還沒有 RCT 或系統性回顧", "結論分歧，值得比較", "最新一篇是 2014 年", "樣本數中位數 20 人"]);
	assert.match(mixed.steps[2].text, /GRADE 的 inconsistency/);
	assert.equal(mixed.trend.arrow, "→", "nothing in either window");
	let done = T.topicStats(T.groupTopics([note("Z", { design: "RCT", level: "2", i: "運動", o: "跌倒", dir: "有效", year: "2025", size: 200, status: "已讀", verified: true })])[0], { now: NOW });
	assert.deepEqual(done.steps.map(x => x.short), ["資料都齊了"]);
});

test("topicSection: info with links, the 總覽 cards (看板) or one line (classic), 證據說什麼, 趨勢, 研究缺口與下一步 with the gap map, 文獻", () => {
	let topic = T.groupTopics(falls())[0];
	let s = T.topicStats(topic, { now: NOW });
	let md = T.topicSection(topic, s, { now: NOW, layout: "board", homeLink: "Zotero/首頁", dashboardLink: "Zotero/研究儀表板" });
	assert.ok(md.startsWith("> [!info] 由 ZotMax 依 Zotero 分類「碩論/跌倒」的 5 篇文獻筆記於 2026-10-14 09:00 產生；只讀筆記的 frontmatter，不連網、不呼叫 AI。\n"));
	assert.match(md, /\n> ← \[\[Zotero\/首頁\|首頁\]\] · \[\[Zotero\/研究儀表板\|研究儀表板\]\]\n/);
	let kpis = [...md.matchAll(/^> > \[!zm-kpi\] (.+)$/gm)].map(m => m[1]);
	assert.deepEqual(kpis, ["文獻", "已讀", "最強證據", "證據說什麼"]);
	assert.match(md, /> > \[!zm-kpi\] 證據說什麼\n> > \*\*多數有效\*\* {2}\n> > 有效 3／4 篇（AI 初判）/);
	assert.match(md, /> > \[!zm-kpi\] 最強證據\n> > \*\*CEBM 1\*\* {2}\n> > RCT 4/);
	let order = ["## 🧭 證據說什麼", "### 依介入", "## 📈 趨勢", "## 🕳️ 研究缺口與下一步", "### 🗺️ 證據缺口地圖", "#### 證據最多的組合", "## 📚 文獻（5 篇）"].map(h => md.indexOf(h));
	assert.ok(order.every((at, k) => at > 0 && (!k || at > order[k - 1])), JSON.stringify(order));
	assert.match(md, /\| 運動訓練 \| 2 \| 2 \| {2}\| {2}\| {2}\| {2}\| L2 \|/);
	assert.match(md, /> \[!warning\] 結論方向是 AI 初判，不是 GRADE/);
	assert.match(md, /近 5 年（2022–2026）\*\*2 篇\*\*，再往前 5 年 2 篇：研究量持平 →。最早 2016 年，最新 2024 年。/);
	assert.match(md, /`2016` ▰▰▰▰▰▰▰▰▰▰ 1 {2}\n`2019`/);
	assert.match(md, /\*\*常見的介入\*\*：運動訓練（2）、衛教（2）/);
	assert.match(md, /\| \[\[Zotero\/D\\\|D\]\] \| 2024 \| RCT \| L1 \| 有效 \| 待讀 \|\n\| \[\[Zotero\/A\\\|A\]\] \| 2023 \|/, "strongest evidence first, then newest");
	assert.match(md, /\| \[\[Zotero\/E\\\|E\]\] \| 2016 \| 世代研究 \| L3 \| {2}\| 待讀 \|/);
	let classic = T.topicSection(topic, s, { now: NOW, layout: "classic" });
	assert.doesNotMatch(classic, /zm-board|← \[\[/);
	assert.match(classic, /\*\*5 篇\*\*｜已讀 40%｜最強證據 CEBM 1｜證據：多數有效（3／4）（AI 初判）｜近 5 年 2 篇 →/);
});

test("homeSection: the 總覽, a card per topic linking to its page (or a table with classic), the unfiled count, quick links", () => {
	let records = [...falls(), note("F", { collections: [] })];
	let entries = T.assignFiles(T.groupTopics(records)).map(({ topic, file }) => {
		topic.link = `Zotero/主題/${file}`;
		return { topic, stats: T.topicStats(topic, { now: NOW }) };
	});
	let meta = { now: NOW, layout: "board", stats: d.aggregate(records, { now: NOW }), entries, unfiled: 1, dashboardLink: "Zotero/研究儀表板",
		reviews: [{ link: "Zotero/Reviews/跌倒", title: "跌倒：PRISMA" }], conceptIndex: "Zotero/概念/概念索引", latestReport: { date: "2026-10-13", link: "Zotero/進度報告/2026-10-13" },
		baseLink: "Zotero/Zotero 文獻庫.base" };
	let md = T.homeSection(meta);
	assert.ok(md.startsWith("> [!info] ZotMax 首頁：依 Zotero 分類整理 vault 裡的 6 篇文獻筆記（2026-10-14 09:00 更新）。"));
	assert.match(md, /Bookmarks/);
	assert.ok(md.indexOf("> [!zm-board] 總覽") < md.indexOf("> [!zm-board] 主題（2）"));
	assert.match(md, /> > \[!zm-topic\] \[\[Zotero\/主題\/碩論／跌倒\|跌倒\]\]\n> > \*\*5 篇\*\* · 已讀 40% {2}\n> > ▰▰▰▰▱▱▱▱▱▱ {2}\n> > 🧭 多數有效（3／4） · CEBM 1 {2}\n> > 📈 近 5 年 2 篇 → {2}\n> > ➡️ 4 篇 RCT，還沒有系統性回顧 {2}\n> > 📁 碩論\n/);
	assert.match(md, /> > \[!zm-topic\] \[\[Zotero\/主題\/EBP 報告\|EBP 報告\]\]\n> > \*\*1 篇\*\* · 已讀 0%  \n> > ▱+ {2}\n> > 🧭 僅 1 篇：有效 · CEBM 1/);
	assert.match(md, /另有 1 篇沒有放進任何 Zotero 分類/);
	assert.match(md, /## 🚀 快速入口\n\n- 📊 \[\[Zotero\/研究儀表板\|研究儀表板\]\]：.*\n- 🗂️ 回顧專案：\[\[Zotero\/Reviews\/跌倒\|跌倒：PRISMA\]\]\n- 🧠 \[\[Zotero\/概念\/概念索引\|概念索引\]\]：.*\n- 📝 最新進度報告：\[\[Zotero\/進度報告\/2026-10-13\|2026-10-13\]\]\n- 📚 \[\[Zotero\/Zotero 文獻庫\.base\|文獻總表\]\]/);
	// More than MAX_CARDS topics: the rest in one line
	let many = Array.from({ length: T.MAX_CARDS + 2 }, (_, k) => ({ topic: { link: `Zotero/主題/t${k}`, name: `t${k}`, parent: "" }, stats: entries[1].stats }));
	let block = T.topicsBlock(many, "board", 0);
	assert.equal((block.match(/\[!zm-topic\]/g) || []).length, T.MAX_CARDS);
	assert.match(block, /其他主題：\[\[Zotero\/主題\/t12\|t12\]\]（1）、\[\[Zotero\/主題\/t13\|t13\]\]（1）/);
	// Classic: a table, no boards
	let classic = T.homeSection(Object.assign({}, meta, { layout: "classic" }));
	assert.doesNotMatch(classic, /zm-board/);
	assert.match(classic, /## 🗂️ 主題（2）\n\n\| 主題 \| 篇數 \|.*\n.*\n\| \[\[Zotero\/主題\/碩論／跌倒\\\|碩論／跌倒\]\] \| 5 \| ▰▰▱▱▱▱ 40% \| CEBM 1 \| 多數有效（3／4） \| 近 5 年 2 篇 → \| 4 篇 RCT，還沒有系統性回顧 \|/);
	assert.match(T.topicsBlock([], "board", 0), /還沒有主題：在 Zotero 把文獻放進分類/);
	assert.match(T.quickLinks({}), /回顧專案：還沒有/);
});

test("buildPage: a new page; later only the managed block and the given keys change; a stale topic says so and keeps the user's part", () => {
	let fresh = T.buildPage(null, "BLOCK 1", "跌倒", { type: "topic", zotero_collection: "碩論/跌倒", studies: 5, updated: "2026-10-14T01:00:00.000Z" });
	assert.match(fresh, /^---\ntype: "topic"\nzotero_collection: "碩論\/跌倒"\nstudies: 5\nupdated: "2026-10-14T01:00:00.000Z"\n---\n\n# 跌倒\n\n%% zotero-bridge:start[^\n]*%%\n\nBLOCK 1\n\n%% zotero-bridge:end %%\n\n## ✍️ 我的筆記\n\n$/);
	let edited = fresh.replace("---\n\n# 跌倒", "my_key: \"x\"\n---\n\n# 跌倒\n\n我的研究問題。") + "心得。\n";
	let again = T.buildPage(edited, "BLOCK 2", "ignored", { studies: 6 });
	assert.match(again, /\nstudies: 6\n/);
	assert.match(again, /\nmy_key: "x"\n/);
	assert.match(again, /# 跌倒\n\n我的研究問題。\n\n%% zotero-bridge:start[^\n]*%%\n\nBLOCK 2\n\n%% zotero-bridge:end %%/);
	assert.match(again, /心得。\n$/);
	assert.doesNotMatch(again, /BLOCK 1/);
	let stale = T.buildPage(again, T.staleSection("碩論/跌倒", { now: NOW }), "", { studies: 0 });
	assert.match(stale, /> \[!warning\] Zotero 分類「碩論\/跌倒」目前沒有文獻筆記（2026-10-14 09:00 檢查）/);
	assert.match(stale, /心得。\n$/);
});
