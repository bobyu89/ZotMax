// 星球與島嶼 (content/planet.js), the pure parts: planets and islands from the notes' collections, 開發度 and its
// stages, the houses, bridges (shared concepts), unexplored seas, the island log and level-ups, the map's data and
// template, and 「🪐 星球」 on the planet's topic page.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../content/core.js");
const d = require("../content/dashboard.js");
const T = require("../content/topics.js");
const P = require("../content/planet.js");

const NOW = new Date("2026-10-24T10:00:00");
let nextKey = 1;

function note(title, { col, status = "待讀", level, design = "RCT", i = "", o = "", ai = true, verified, added = "2026-09-01T00:00:00Z", aiAt = "2026-09-02T00:00:00Z" } = {}) {
	let full = { title, creators: [{ lastName: "Lin", firstName: "Ya", creatorType: "author" }], year: "2024", libraryPath: "library", key: `K${nextKey++}`,
		collections: [].concat(col), itemType: "journalArticle", dateAdded: added, fullTextStatus: "ok", doi: "10.5555/x" };
	let opts = ai ? Object.assign({ study: { study_design: design, evidence_level: level, intervention: i, outcomes: o }, aiModel: "m", aiGeneratedAt: aiAt },
		verified ? { appraisal: { verified: true, tool: "CASP", overall: "納入" } } : {}) : {};
	let fm = Object.assign(core.managedFrontmatter(full, opts), { status });
	return d.noteRecord(core.splitFrontmatter(core.buildFrontmatter(fm, null)).frontmatter, `Zotero/${title}.md`);
}

function archipelago() {
	return [
		note("A", { col: "碩論/跌倒/運動", status: "已讀", level: "1", i: "運動訓練", o: "跌倒發生率、平衡能力", verified: true, added: "2026-10-24T08:30:00" }),
		note("B", { col: "碩論/跌倒/運動", status: "已讀", level: "2", i: "運動訓練", o: "平衡能力", verified: true }),
		note("C", { col: "碩論/跌倒/運動/居家", status: "閱讀中", level: "2", i: "居家運動", o: "跌倒發生率" }),
		note("D", { col: "碩論/跌倒/衛教", status: "已引用", level: "2", i: "衛教", o: "跌倒自我效能、平衡能力", added: "2026-10-23T21:00:00", aiAt: "2026-10-23T21:30:00" }),
		note("E", { col: "碩論/跌倒/衛教", level: "3", design: "cohort", i: "衛教", o: "跌倒自我效能" }),
		note("F", { col: "碩論/跌倒/用藥", ai: false }),
		// 碩論 has one sub-collection with notes (跌倒) and none of its own: not a planet
		note("G", { col: ["碩論/跌倒", "EBP"], status: "已讀", level: "3", i: "多因子介入", o: "跌倒發生率" }),
		Object.assign(note("Gone", { col: "碩論/跌倒/垃圾" }), { deleted: true }),
	];
}

test("findPlanets: a collection with two sub-collections that have notes is a planet; each direct sub-collection is an island with every note below it", () => {
	let planets = P.findPlanets(archipelago());
	assert.deepEqual(planets.map(p => [p.path, p.name, p.parent, p.direct.length, p.records.length]), [["碩論/跌倒", "跌倒", "碩論", 1, 7]]);
	let pl = planets[0];
	assert.deepEqual(pl.islands.map(is => [is.path, is.name, is.records.map(r => r.title).join("")]), [
		["碩論/跌倒/運動", "運動", "ABC"], ["碩論/跌倒/衛教", "衛教", "DE"], ["碩論/跌倒/用藥", "用藥", "F"],
	], "most notes first; 居家 is part of 運動; the trashed note is left out");
	assert.equal(P.planetOf(planets, "碩論/跌倒/運動/居家").path, "碩論/跌倒");
	assert.equal(P.planetOf(planets, "EBP"), null);
	assert.equal(P.islandOf(pl, "碩論/跌倒/運動/居家").name, "運動");
	assert.equal(P.islandOf(pl, "碩論/跌倒"), null);
	// One sub-collection, with or without notes of its own: not a planet (運動 above has 居家 and its own notes)
	assert.equal(P.findPlanets([note("x", { col: "A/B" }), note("y", { col: "A" })]).length, 0);
	assert.equal(P.findPlanets([note("x", { col: "A/B" }), note("y", { col: "A/C/D" })]).length, 1);
});

test("開發度 and its stages: 已讀 40% ＋ 評讀已核對 30% ＋ 有 AI 筆記 30%; 荒島 <25, 開墾中 25–49, 聚落 50–74, 城鎮 ≥75", () => {
	assert.equal(P.devOf({ papers: 4, read: 4, verified: 4, ai: 4 }), 100);
	assert.equal(P.devOf({ papers: 4, read: 2, verified: 0, ai: 4 }), 50);
	assert.equal(P.devOf({ papers: 0, read: 0, verified: 0, ai: 0 }), 0);
	assert.deepEqual([0, 24, 25, 49, 50, 74, 75, 100].map(n => P.stageOf(n)[1]), [1, 1, 2, 2, 3, 3, 4, 4]);
	assert.equal(P.stageLabel(80), "LV4 🏙️ 城鎮");
	let n = P.numbers(P.findPlanets(archipelago())[0].islands[0].records);
	assert.deepEqual(n, { papers: 3, read: 2, reading: 1, verified: 2, ai: 3, best: "1", dev: 77 });
	assert.deepEqual(P.houses(P.findPlanets(archipelago())[0].islands[0].records), [
		{ level: 1, status: "read" }, { level: 2, status: "read" }, { level: 2, status: "reading" },
	]);
	assert.deepEqual(P.houses([note("n", { ai: false })]), [{ level: 5, status: "todo" }], "no level: the lowest house");
});

test("bridges, seas: the concept two islands share most (aliases merge names), the empty intervention × outcome pairs next to the island that studies the intervention", () => {
	let pl = P.findPlanets(archipelago())[0];
	let islands = pl.islands.map((is, k) => Object.assign({ id: "i" + (k + 1) }, is));
	assert.deepEqual(P.bridgesOf(islands), [{ a: "i1", b: "i2", label: "平衡能力", shared: 1 }]);
	let aliases = new Map([["衛教", { key: "運動訓練", name: "運動" }]]);
	assert.deepEqual(P.bridgesOf(islands, aliases).map(b => b.shared), [2], "the alias makes 衛教 the same concept as 運動訓練");
	let seas = P.seasOf(pl.records, islands);
	assert.ok(seas.length >= 1 && seas.length <= 3);
	assert.ok(seas.every(s => / × .+：0 篇$/.test(s.text)));
	assert.equal(seas.find(s => s.text.startsWith("運動訓練 × 跌倒自我效能")).near, "i1");
	assert.deepEqual(P.seasOf([note("x", { col: "A/B", i: "a", o: "b" })], []), [], "fewer than two studied notes: no seas");
});

test("islandLog and nextHistory: notes added, AI notes and bot imports per day, level-ups; history keeps each island's last 開發度", () => {
	let pl = P.findPlanets(archipelago())[0];
	let log = P.islandLog(pl, pl.islands, { imports: [{ at: "2026-10-24T07:00:00", n: 3 }, { at: "2026-01-01T00:00:00Z", n: 9 }],
		levelUps: [{ at: "2026-10-23T22:00:00", island: "衛教", from: 20, to: 60 }] }, NOW);
	assert.deepEqual(log, [
		{ day: "今天" }, { t: "08:30", i: "📥", s: "1 篇文獻加入運動" }, { t: "07:00", i: "⛵", s: "從搜尋機器人匯入 3 篇" },
		{ day: "昨天" }, { t: "22:00", i: "🏗️", s: "衛教升級：🌱 荒島 → 🏘️ 聚落" }, { t: "21:30", i: "🤖", s: "產生 1 篇 AI 文獻筆記（衛教）" }, { t: "21:00", i: "📥", s: "1 篇文獻加入衛教" },
	], "older than 14 days left out");
	let first = P.nextHistory({}, pl, [{ island: pl.islands[0], n: { dev: 20 } }], NOW);
	assert.deepEqual(first, { islands: { "碩論/跌倒/運動": 20 }, events: [] }, "no level-up on the first run");
	let next = P.nextHistory(first, pl, [{ island: pl.islands[0], n: { dev: 30 } }], NOW);
	assert.deepEqual(next.events, [{ at: NOW.toISOString(), planet: "碩論/跌倒", island: "運動", from: 20, to: 30 }]);
	assert.deepEqual(P.nextHistory(next, pl, [{ island: pl.islands[0], n: { dev: 10 } }], NOW).events.length, 1, "going down is no event");
});

function dataFor(records, extra = {}) {
	let pl = P.findPlanets(records)[0];
	return { pl, data: P.planetData(pl, Object.assign({
		stats: rs => T.topicStats({ records: rs }, { now: NOW }), designLabel: T.designLabel, squares: t => T.directionSquares(t),
		link: p => "obsidian://open?vault=v&file=" + encodeURIComponent(p), planetLink: "obsidian://open?vault=v&file=planet", now: NOW,
	}, extra)) };
}

test("planetData: what the map shows (islands, KPIs, harbor, PICO, tour), filled into the template safely", () => {
	let bot = { pending: 12, high: 3, imported: 4, imports: [{ at: "2026-10-24T07:00:00", n: 4 }] };
	let { data } = dataFor(archipelago(), { bot, botLink: "obsidian://bot", card: { question: "運動能否降低跌倒？", p: "住院長者", i: "運動", c: "", o: "跌倒" } });
	assert.deepEqual(data.islands.map(is => [is.id, is.name, is.papers, is.dev, is.best]), [["i1", "運動", 3, 77, "1"], ["i2", "衛教", 2, 50, "2"], ["i3", "用藥", 1, 0, ""]]);
	assert.equal(data.islands[0].design, "RCT 3");
	assert.equal(data.islands[1].design, "世代研究 1、RCT 1");
	assert.ok(data.islands.every(is => !("records" in is) && !("path" in is)), "no records or collection paths in the map data");
	assert.deepEqual(data.islands[2].gaps, [], "only research gaps, not to-dos");
	assert.deepEqual(data.kpis, { papers: 7, islands: 3, readPct: 57, newWeek: 2, gaps: data.seas.length + data.islands.reduce((n, is) => n + is.gaps.length, 0) });
	assert.deepEqual(data.harbor, { pending: 12, high: 3, imported: 4, link: "obsidian://bot" });
	assert.deepEqual(data.pico, [["P", "住院長者"], ["I", "運動"], ["O", "跌倒"]]);
	assert.equal(data.question, "運動能否降低跌倒？");
	assert.deepEqual(data.tour.map(t => t.id), ["hub", "i1", "i3", ...(data.seas.length ? ["hub"] : []), "harbor"]);
	assert.match(data.tour[2].text, /最荒涼的島：用藥，1 篇、已讀 0 篇/);
	assert.equal(dataFor(archipelago()).data.harbor, null);
	assert.match(dataFor(archipelago()).data.question, /Zotero 分類「碩論\/跌倒」的 3 個子分類/);

	let tpl = fs.readFileSync(path.join(__dirname, "../content/planet/planet.html"), "utf8");
	assert.ok(tpl.includes(P.MARK));
	data.note = P.mapNote(NOW);
	data.islands[0].name = "</script><script>alert(1)</script>\u2028";
	let html = P.fillTemplate(tpl, data);
	assert.ok(!html.includes(P.MARK));
	assert.ok(!html.includes("</script><script>alert(1)"), "a name can't close the script tag");
	let json = /window\.PLANET = (.*);\n<\/script>/.exec(html)[1];
	let back = vm.runInNewContext(`(${json})`);
	assert.equal(back.islands[0].name, "</script><script>alert(1)</script>\u2028");
	assert.match(back.note, /^🪐 <b>ZotMax<\/b> 於 2026-10-24 10:00/);
	assert.throws(() => P.fillTemplate("<html></html>", data), /no data marker/);
});

test("planetSection: 「🪐 星球」 island cards (看板) or a table (classic), the map link, seas and harbor; backLink for an island page", () => {
	let { pl, data } = dataFor(archipelago(), { bot: { pending: 2, high: 0, imported: 0, imports: [] } });
	let links = { "碩論/跌倒/運動": "Zotero/10 文獻/碩論/跌倒/運動/00 運動 總覽", "碩論/跌倒/衛教": "Zotero/10 文獻/碩論/跌倒/衛教/00 衛教 總覽" };
	let mapURL = "file:///C:/Users/me/vault/Zotero/10%20文獻/碩論/跌倒/00 跌倒 星球地圖.html";
	let md = P.planetSection(pl, data, { layout: "board", links, mapURL, botLink: "Zotero/50 新文獻/跌倒 搜尋機器人" });
	assert.match(md, /^> \[!zm-board\] 🪐 星球：跌倒（3 座島 · 7 篇 · 已讀 57%）\n/);
	assert.ok(md.includes("> > [!zm-links] 群島\n> > [🗺️ 開啟群島地圖](file:///C:/Users/me/vault/Zotero/10%20文獻/碩論/跌倒/00%20跌倒%20星球地圖.html) · 開發度 = 已讀 40%"));
	assert.ok(md.includes("> > [!zm-topic] [[Zotero/10 文獻/碩論/跌倒/運動/00 運動 總覽|運動]]\n> > **LV4 🏙️ 城鎮** · 開發度 77  \n> > ▰▰▰▰▰▰▰▰▱▱  \n> > 3 篇 · 已讀 2 · 核對 2 · AI 3"));
	assert.ok(md.includes("> > [!zm-topic] 用藥\n"), "an island without a page of its own: its name");
	assert.ok(md.includes("⛵ 港口：[[Zotero/50 新文獻/跌倒 搜尋機器人|搜尋機器人]]待看 2 篇"));
	let classic = P.planetSection(pl, data, { layout: "classic", links });
	assert.match(classic, /^## 🪐 星球：跌倒/);
	assert.ok(classic.includes("| [[Zotero/10 文獻/碩論/跌倒/運動/00 運動 總覽\\|運動]] | LV4 🏙️ 城鎮 | 77 | 3 | 2 | 2 | 3 | CEBM 1 |"));
	assert.ok(!classic.includes("開啟群島地圖"), "no map file: no link");
	assert.equal(P.backLink("Zotero/x/00 跌倒 總覽", "跌倒", 30), "[[Zotero/x/00 跌倒 總覽|🪐 回到星球「跌倒」（這座島 LV2 🏕️ 開墾中）]]");
	assert.equal(P.backLink("p", "跌倒", null), "[[p|🪐 回到星球「跌倒」]]");
});

test("the topic page carries 「🪐 星球」 and 「🪐 回到星球」 where topics.js passes them", () => {
	let records = archipelago();
	let topic = T.groupTopics(records).find(t => t.path === "碩論/跌倒");
	let s = T.topicStats(topic, { now: NOW });
	let board = T.topicSection(topic, s, { now: NOW, layout: "board", planet: "> [!zm-board] 🪐 星球：跌倒", backLink: "[[p|🪐 回到星球「碩論」]]" });
	assert.ok(board.includes("> [!zm-links] 前往\n> [[p|🪐 回到星球「碩論」]]"));
	assert.ok(board.indexOf("🪐 星球：跌倒") > board.indexOf("主題總覽") || board.indexOf("🪐 星球：跌倒") > 0);
	let classic = T.topicSection(topic, s, { now: NOW, layout: "classic", planet: "## 🪐 星球：跌倒" });
	assert.ok(classic.includes("\n\n## 🪐 星球：跌倒\n\n"));
	assert.ok(!T.topicSection(topic, s, { now: NOW, layout: "classic" }).includes("\n\n\n"), "no empty section without a planet");
});

test("levelHint: the fewest steps to the next stage, reading first, then AI notes, then verified appraisals", () => {
	assert.deepEqual(P.levelHint({ papers: 4, read: 0, verified: 0, ai: 0, dev: 0 }), { to: ["🏕️", 2, "開墾中"], read: 3, ai: 0, verify: 0, text: "再讀 3 篇 → 🏕️ 開墾中" });
	// 10 papers, all read (40): 聚落 needs 49.5 → one more AI note (43) is not enough, four are (52)
	assert.equal(P.levelHint({ papers: 10, read: 10, verified: 0, ai: 0, dev: 40 }).text, "補 4 篇 AI 筆記 → 🏘️ 聚落");
	assert.equal(P.levelHint({ papers: 2, read: 2, verified: 0, ai: 2, dev: 70 }).text, "核對 1 篇評讀 → 🏙️ 城鎮");
	assert.equal(P.levelHint({ papers: 3, read: 3, verified: 3, ai: 3, dev: 100 }).text, "已是 🏙️ 城鎮：接下來補這座島的缺口");
	assert.equal(P.levelHint({ papers: 0, read: 0, verified: 0, ai: 0, dev: 0 }).text, "島上還沒有文獻");
	// Doing what it says really reaches the stage
	for (let n of [{ papers: 7, read: 1, verified: 0, ai: 2 }, { papers: 13, read: 5, verified: 2, ai: 9 }, { papers: 1, read: 0, verified: 0, ai: 1 }]) {
		n.dev = P.devOf(n);
		let h = P.levelHint(n);
		if (!h.to) continue;
		let after = P.devOf({ papers: n.papers, read: n.read + h.read, verified: n.verified + h.verify, ai: n.ai + h.ai });
		assert.equal(P.stageOf(after)[1], h.to[1], JSON.stringify(n));
	}
	let { data } = dataFor(archipelago());
	assert.equal(data.islands[2].hint, "再讀 1 篇 → 🏕️ 開墾中");
	assert.match(data.tour[2].text, /升級只差：再讀 1 篇 → 🏕️ 開墾中。$/);
});

test("planetCanvas: the hub, one coloured group and card per island, bridges as edges, seas and the harbor; only zm- nodes", () => {
	let { pl, data } = dataFor(archipelago(), { bot: { pending: 4, high: 1, imported: 0, imports: [] } });
	let json = JSON.parse(P.planetCanvas(pl, data, { links: { "碩論/跌倒/運動": "Z/運動/00 運動 總覽" }, pageLink: "Z/00 跌倒 總覽", botLink: "Z/bot", now: NOW }));
	let ids = json.nodes.map(n => n.id);
	assert.ok(ids.every(id => id.startsWith("zm-")));
	assert.deepEqual(ids.filter(id => id.startsWith("zm-g-")), ["zm-g-i1", "zm-g-i2", "zm-g-i3"]);
	let hub = json.nodes.find(n => n.id === "zm-hub");
	assert.match(hub.text, /^## 🪐 \[\[Z\/00 跌倒 總覽\|跌倒\]\]/);
	assert.match(hub.text, /由 ZotMax 自動產生（2026-10-24 10:00）/);
	let g1 = json.nodes.find(n => n.id === "zm-g-i1");
	assert.deepEqual([g1.type, g1.label, g1.color], ["group", "🏙️ 運動 · LV4", "6"]);
	let card = json.nodes.find(n => n.id === "zm-i-i1");
	assert.ok(card.x >= g1.x && card.y >= g1.y && card.x + card.width <= g1.x + g1.width && card.y + card.height <= g1.y + g1.height, "the card sits inside its group");
	assert.match(card.text, /^### \[\[Z\/運動\/00 運動 總覽\|運動\]\]\n\*\*LV4 🏙️ 城鎮\*\* · 開發度 77\n▰▰▰▰▰▰▰▰▱▱\n3 篇 · 已讀 2 · 核對 2 · AI 3 · CEBM 1\n⬆️ 已是 🏙️ 城鎮/);
	assert.equal(json.nodes.find(n => n.id === "zm-g-i3").color, "4", "LV1 green");
	assert.deepEqual(json.edges.filter(e => e.id.startsWith("zm-b-")).map(e => [e.fromNode, e.toNode, e.label]), [["zm-g-i1", "zm-g-i2", "🌉 平衡能力"]]);
	assert.equal(json.nodes.filter(n => n.id.startsWith("zm-sea-")).length, data.seas.length);
	assert.match(json.nodes.find(n => n.id === "zm-harbor").text, /⛵ \*\*港口\*\*：\[\[Z\/bot\|搜尋機器人\]\]\n待看 4 篇 · ⭐⭐⭐ 1/);
	// Groups don't overlap each other or the hub
	let boxes = json.nodes.filter(n => n.type === "group" || n.id === "zm-hub");
	for (let a of boxes) for (let b of boxes) {
		if (a === b) continue;
		assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${a.id} × ${b.id}`);
	}
	assert.ok(P.canvasIsOurs(null));
	assert.ok(P.canvasIsOurs(JSON.stringify(json)));
	assert.ok(!P.canvasIsOurs(JSON.stringify({ nodes: [...json.nodes, { id: "abc", type: "text", text: "我的" }] })));
	assert.ok(!P.canvasIsOurs("not json"));
	let md = P.planetSection(pl, data, { layout: "board", canvasLink: "Z/00 跌倒 星球.canvas" });
	assert.ok(md.includes("[[Z/00 跌倒 星球.canvas|🪐 星球 Canvas]]"));
	assert.ok(md.includes("> > ⬆️ 已是 🏙️ 城鎮：接下來補這座島的缺口"));
});
