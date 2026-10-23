// 整理 vault 資料夾 (content/vault-layout.js and core.js's layout helpers), the pure parts: where each kind of file goes
// in the organized layout, the migration plan from the flat one, and rewriting links, canvases and bookmarks.
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../content/core.js");
const L = require("../content/vault-layout.js");

const ORG = { structure: "organized", defaults: { obsidianFolder: "Zotero" }, rules: [] };
const FLAT = { defaults: { obsidianFolder: "Zotero" }, rules: [] };

test("layout folders: organized numbers the top folders, flat keeps the old names", () => {
	assert.equal(core.structureOf(ORG), "organized");
	assert.equal(core.structureOf(FLAT), "flat");
	assert.equal(core.structureOf({ structure: "weird" }), "flat");
	assert.deepEqual(core.vaultFolder(ORG, "reviews"), ["Zotero", "30 評讀與綜整"]);
	assert.deepEqual(core.vaultFolder(FLAT, "reviews"), ["Zotero", "Reviews"]);
	assert.deepEqual(core.vaultFolder(ORG, "drafts"), ["Zotero", "40 寫作", "文獻探討"]);
	assert.deepEqual(core.vaultFolder(ORG, "system"), ["Zotero", "90 系統"]);
	assert.deepEqual(core.vaultFolder(FLAT, "system"), ["Zotero"]);
	assert.equal(core.vaultFolder(ORG, "topics"), null);
	assert.equal(core.vaultPage(ORG, "home"), "00 首頁");
	assert.equal(core.vaultPage(FLAT, "dashboard"), "研究儀表板");
});

test("primaryCollection: the deepest collection, then Chinese collation; noteFolder follows it", () => {
	assert.equal(core.primaryCollection(["碩論", "碩論/跌倒"]), "碩論/跌倒");
	assert.equal(core.primaryCollection(["EBP 報告/夜間", "碩論/跌倒"]), core.primaryCollection(["碩論/跌倒", "EBP 報告/夜間"]));
	assert.equal(core.primaryCollection([]), "");
	let route = core.resolveRoute({ collections: ["碩論/跌倒"] }, [], ORG.defaults);
	assert.deepEqual(core.noteFolder(ORG, route, { collections: ["碩論", "碩論/跌倒"] }), ["Zotero", "10 文獻", "碩論", "跌倒"]);
	assert.deepEqual(core.noteFolder(ORG, route, { collections: [] }), ["Zotero", "10 文獻", "未分類"]);
	assert.deepEqual(core.noteFolder(FLAT, route, { collections: ["碩論/跌倒"] }), ["Zotero"]);
	// A routing rule's own folder wins
	let rules = [{ collection: "碩論", obsidianFolder: "論文/文獻" }];
	let ruled = core.resolveRoute({ collections: ["碩論/跌倒"] }, rules, ORG.defaults);
	assert.deepEqual(core.noteFolder(Object.assign({}, ORG, { rules }), ruled, { collections: ["碩論/跌倒"] }), ["論文", "文獻"]);
	// Characters a file name can't have
	assert.deepEqual(core.collectionParts("A: B / C?"), ["A B", "C"]);
});

test("topicPage: organized puts it first in the collection's folder", () => {
	assert.deepEqual(core.topicPage(ORG, "碩論/跌倒"), { dirParts: ["Zotero", "10 文獻", "碩論", "跌倒"], name: "00 跌倒 總覽" });
	assert.deepEqual(core.topicPage(FLAT, "碩論/跌倒"), { dirParts: ["Zotero", "主題"], name: "碩論／跌倒" });
	assert.deepEqual(core.topicPage(FLAT, "碩論/跌倒", "碩論／跌倒 (2)"), { dirParts: ["Zotero", "主題"], name: "碩論／跌倒 (2)" });
});

function f(path, fm = {}) {
	return { rel: path.split("/"), fm };
}

function flatVault() {
	return [
		f("Zotero/lee2024.md", { zotero_key: "library/AAAA1111", collections: ["碩論/跌倒"] }),
		f("Zotero/chen2023.md", { zotero_key: "library/BBBB2222", collections: [] }),
		f("Zotero/全文/lee2024.md", { fulltext_of: "library/AAAA1111" }),
		f("Zotero/attachments/AAAA1111-CCCC3333.png"),
		f("Zotero/attachments/notmine.png"),
		f("Zotero/首頁.md", { type: "home" }),
		f("Zotero/研究儀表板.md", { type: "research-dashboard" }),
		f("Zotero/研究儀表板.base"),
		f("Zotero/Zotero 文獻庫.base"),
		f("Zotero/references.json"),
		f("Zotero/.zotero-bridge-citekeys.json"),
		f("Zotero/主題/碩論／跌倒.md", { type: "topic", zotero_collection: "碩論/跌倒" }),
		f("Zotero/主題/my own.md"),
		f("Zotero/概念/跌倒.md", { type: "concept" }),
		f("Zotero/Reviews/跌倒 GRADE 證據摘要.md"),
		f("Zotero/Reviews/跌倒 GRADE 證據摘要.csv"),
		f("Zotero/Drafts/文獻探討-跌倒.md"),
		f("Zotero/Drafts/zotero-bridge-draft.lua"),
		f("Zotero/進度報告/2026-10-01.md"),
		f("Zotero/新文獻/2026-10-02.md"),
		f("Zotero/文獻比較/比較 2026.md"),
		f("Zotero/my notes.md"),
		f("Zotero/碩論/routed.md", { zotero_key: "library/DDDD4444", collections: ["碩論"] }),
		f("Zotero/碩論/全文/routed.md", { fulltext_of: "library/DDDD4444" }),
	];
}

test("planMigration: every ZotMax file to its organized place; the user's files and routed notes stay", () => {
	let plan = L.planMigration(flatVault(), { defaults: { obsidianFolder: "Zotero" } });
	let to = new Map(plan.moves.map(m => [m.from.join("/"), m.to.join("/")]));
	assert.equal(to.get("Zotero/lee2024.md"), "Zotero/10 文獻/碩論/跌倒/lee2024.md");
	assert.equal(to.get("Zotero/chen2023.md"), "Zotero/10 文獻/未分類/chen2023.md");
	assert.equal(to.get("Zotero/全文/lee2024.md"), "Zotero/10 文獻/碩論/跌倒/lee2024 · 全文.md");
	assert.equal(to.get("Zotero/attachments/AAAA1111-CCCC3333.png"), "Zotero/10 文獻/碩論/跌倒/附件/AAAA1111-CCCC3333.png");
	assert.equal(to.get("Zotero/首頁.md"), "Zotero/00 首頁.md");
	assert.equal(to.get("Zotero/研究儀表板.md"), "Zotero/01 研究儀表板.md");
	assert.equal(to.get("Zotero/研究儀表板.base"), "Zotero/90 系統/研究儀表板.base");
	assert.equal(to.get("Zotero/references.json"), "Zotero/90 系統/references.json");
	assert.equal(to.get("Zotero/.zotero-bridge-citekeys.json"), "Zotero/90 系統/.zotero-bridge-citekeys.json");
	assert.equal(to.get("Zotero/主題/碩論／跌倒.md"), "Zotero/10 文獻/碩論/跌倒/00 跌倒 總覽.md");
	assert.equal(to.get("Zotero/概念/跌倒.md"), "Zotero/20 概念/跌倒.md");
	assert.equal(to.get("Zotero/Reviews/跌倒 GRADE 證據摘要.csv"), "Zotero/30 評讀與綜整/跌倒 GRADE 證據摘要.csv");
	assert.equal(to.get("Zotero/Drafts/zotero-bridge-draft.lua"), "Zotero/40 寫作/文獻探討/zotero-bridge-draft.lua");
	assert.equal(to.get("Zotero/進度報告/2026-10-01.md"), "Zotero/40 寫作/進度報告/2026-10-01.md");
	assert.equal(to.get("Zotero/新文獻/2026-10-02.md"), "Zotero/50 新文獻/2026-10-02.md");
	assert.equal(to.get("Zotero/文獻比較/比較 2026.md"), "Zotero/30 評讀與綜整/文獻比較/比較 2026.md");
	// Stay: the user's files, a routed note (its full text joins it under the new name)
	for (let stay of ["Zotero/attachments/notmine.png", "Zotero/主題/my own.md", "Zotero/my notes.md", "Zotero/碩論/routed.md"]) assert.equal(to.has(stay), false, stay);
	assert.equal(to.get("Zotero/碩論/全文/routed.md"), "Zotero/碩論/routed · 全文.md");
	assert.deepEqual(plan.skipped, []);
	assert.deepEqual(L.counts(plan.moves), { note: 2, fulltext: 2, image: 1, page: 2, system: 4, topic: 1, folder: 8 });
});

test("planMigration: a taken target is skipped; a custom concepts folder stays; an organized vault has nothing to do", () => {
	let files = [...flatVault(), f("Zotero/00 首頁.md")];
	let plan = L.planMigration(files, { defaults: { obsidianFolder: "Zotero" }, conceptsFolder: "我的概念" });
	assert.deepEqual(plan.skipped.map(s => s.from.join("/")), ["Zotero/首頁.md"]);
	assert.equal(plan.moves.some(m => m.from.join("/") === "Zotero/概念/跌倒.md"), false);
	let organized = [
		f("Zotero/00 首頁.md", { type: "home" }),
		f("Zotero/10 文獻/碩論/跌倒/lee2024.md", { zotero_key: "library/AAAA1111", collections: ["碩論/跌倒"] }),
		f("Zotero/10 文獻/碩論/跌倒/lee2024 · 全文.md", { fulltext_of: "library/AAAA1111" }),
		f("Zotero/90 系統/references.json"),
	];
	assert.deepEqual(L.planMigration(organized, { defaults: { obsidianFolder: "Zotero" } }).moves, []);
});

test("rewriteLinks: wikilinks, embeds, table pipes, headings, Markdown links; others untouched", () => {
	let plan = L.planMigration(flatVault(), { defaults: { obsidianFolder: "Zotero" } });
	let map = L.linkMap(plan.moves);
	let text = [
		"fulltext: \"[[Zotero/全文/lee2024]]\"",
		"[[Zotero/lee2024|Lee 2024]] and [[Zotero/lee2024.md#Methods]] and [[Zotero/lee2024#^zm-ai|AI]]",
		"| [[Zotero/lee2024\\|Lee]] | ![[Zotero/attachments/AAAA1111-CCCC3333.png]] |",
		"[[lee2024]] [[Zotero/my notes]] [[Zotero/首頁]]",
		"[home](Zotero/首頁.md) [dash](<Zotero/研究儀表板.md>) [web](https://x.org/Zotero/首頁.md) [enc](Zotero/%E9%A6%96%E9%A0%81.md#top)",
	].join("\n");
	let out = L.rewriteLinks(text, map);
	assert.equal(out.text, [
		"fulltext: \"[[Zotero/10 文獻/碩論/跌倒/lee2024 · 全文]]\"",
		"[[Zotero/10 文獻/碩論/跌倒/lee2024|Lee 2024]] and [[Zotero/10 文獻/碩論/跌倒/lee2024.md#Methods]] and [[Zotero/10 文獻/碩論/跌倒/lee2024#^zm-ai|AI]]",
		"| [[Zotero/10 文獻/碩論/跌倒/lee2024\\|Lee]] | ![[Zotero/10 文獻/碩論/跌倒/附件/AAAA1111-CCCC3333.png]] |",
		"[[lee2024]] [[Zotero/my notes]] [[Zotero/00 首頁]]",
		"[home](Zotero/00%20首頁.md) [dash](<Zotero/01 研究儀表板.md>) [web](https://x.org/Zotero/首頁.md) [enc](Zotero/00%20首頁.md#top)",
	].join("\n"));
	assert.equal(out.count, 10);
	assert.equal(L.rewriteLinks("nothing here", map).count, 0);
});

test("rewriteCanvas and rewriteBookmarks follow the moved files", () => {
	let map = L.linkMap([{ from: ["Zotero", "lee2024.md"], to: ["Zotero", "10 文獻", "未分類", "lee2024.md"], kind: "note" }]);
	let canvas = JSON.stringify({ nodes: [{ id: "a", type: "file", file: "Zotero/lee2024.md" }, { id: "b", type: "text", text: "x" }], edges: [] });
	let c = L.rewriteCanvas(canvas, map);
	assert.equal(c.count, 1);
	assert.equal(JSON.parse(c.text).nodes[0].file, "Zotero/10 文獻/未分類/lee2024.md");
	assert.deepEqual(L.rewriteCanvas("not json", map), { text: "not json", count: 0 });
	let bm = JSON.stringify({ items: [{ type: "group", items: [{ type: "file", path: "Zotero/lee2024.md" }] }, { type: "search", query: "x" }] });
	let b = L.rewriteBookmarks(bm, map);
	assert.equal(b.count, 1);
	assert.equal(JSON.parse(b.text).items[0].items[0].path, "Zotero/10 文獻/未分類/lee2024.md");
});

test("describePlan, buildLog and looksFlat", () => {
	let plan = L.planMigration(flatVault(), { defaults: { obsidianFolder: "Zotero" } });
	let text = L.describePlan(plan, { defaults: { obsidianFolder: "Zotero" } });
	assert.match(text, /會在「Zotero」裡搬動 20 個檔案/);
	assert.match(text, /文獻筆記 2 個/);
	assert.match(text, /建議先關閉 Obsidian/);
	let log = L.buildLog(plan, { moved: 20, links: 7, files: 3, failed: [] }, { now: new Date("2026-10-14T09:00:00Z") });
	assert.match(log, /^---\ntype: vault-reorganize/);
	assert.match(log, /\| 文獻筆記 \| Zotero\/lee2024\.md \| Zotero\/10 文獻\/碩論\/跌倒\/lee2024\.md \|/);
	assert.match(log, /更新 7 個連結/);
	assert.equal(L.looksFlat(["首頁.md", "lee.md"], false), true);
	assert.equal(L.looksFlat(["random.md"], true), true);
	assert.equal(L.looksFlat(["00 首頁.md", "10 文獻", "90 系統"], false), false);
	assert.equal(L.looksFlat([], false), false);
});

test("buildLog (看板): the run as cards, the moves by kind, the table folded", () => {
	let plan = L.planMigration(flatVault(), { defaults: { obsidianFolder: "Zotero" } });
	let log = L.buildLog(plan, { moved: 20, links: 7, files: 3, failed: [] }, { now: new Date("2026-10-14T09:00:00Z"), layout: "board" });
	assert.match(log, /^---\ntype: vault-reorganize\ndate: [^\n]+\nmoved: 20\ncssclasses:\n {2}- "zotmax-note"\n {2}- "zm-review"\n---\n/);
	assert.match(log, /\n> \[!zm-meta\]- 🗂️ 整理 vault · /);
	assert.match(log, /> > \[!zm-kpi\] 搬動\n> > \*\*20 個檔案\*\*/);
	assert.match(log, /> > \[!zm-kpi\] 更新連結\n> > \*\*7 個\*\* {2}\n> > 在 3 個檔案裡/);
	assert.match(log, /> > \[!zm-chart\] 依類型\n> > 概念、評讀、寫作與新文獻 ▰+ 8  \n> > 系統檔 [▰▱]+ 4  \n/);
	assert.match(log, /> > 文獻筆記 [▰▱]+ 2  \n/);
	assert.match(log, /\n> \[!zm-ref\]- 搬動清單（20）\n> \| 類型 \| 原位置 \| 新位置 \|\n/);
	assert.match(log, /> \| 文獻筆記 \| Zotero\/lee2024\.md \| Zotero\/10 文獻\/碩論\/跌倒\/lee2024\.md \|/);
});

test("the navigation bar: 首頁 › topics, 「跳到」 the folded sections (block IDs after them), the full text, 我的筆記", async () => {
	let data = {
		title: "Falls", key: "AAAA1111", libraryPath: "library", collections: ["碩論/跌倒", "碩論"], abstract: "Background.",
		attachments: [{ key: "PDF1", contentType: "application/pdf", annotations: [{ key: "Y1", type: "highlight", text: "A finding.", color: "#ffd400", pageLabel: "2" }] }],
	};
	let nav = await core.noteNav(ORG, data, async () => true);
	assert.deepEqual(nav, { home: "Zotero/00 首頁", topics: [
		{ link: "Zotero/10 文獻/碩論/跌倒/00 跌倒 總覽", label: "碩論 › 跌倒" },
		{ link: "Zotero/10 文獻/碩論/00 碩論 總覽", label: "碩論" },
	] });
	assert.equal(await core.noteNav(FLAT, data, async () => true), null, "flat: no bar");
	let missing = await core.noteNav(ORG, data, async parts => parts.join("/") === "Zotero/00 首頁");
	assert.deepEqual(missing.topics, [], "pages that don't exist are left out");

	let note = core.buildObsidianNote(null, data, { layout: "board", nav, fullTextLink: "Zotero/10 文獻/碩論/跌倒/x · 全文" });
	assert.match(note, /%%\n\n> \[!zm-nav\] \[\[Zotero\/00 首頁\|🏠 首頁\]\] › \[\[Zotero\/10 文獻\/碩論\/跌倒\/00 跌倒 總覽\|碩論 › 跌倒\]\] · \[\[Zotero\/10 文獻\/碩論\/00 碩論 總覽\|碩論\]\]\n/);
	assert.match(note, /^> 跳到：\[\[#\^zm-highlights\|劃線\]\] · \[\[#\^zm-abstract\|摘要\]\] · \[\[Zotero\/10 文獻\/碩論\/跌倒\/x · 全文\|全文\]\] · \[\[#✍️ 我的筆記\|✍️ 我的筆記\]\]$/m);
	assert.match(note, /^> \[!zm-mine\]- 我的劃線[^\n]*\n> > \[!quote\] 🟡 [^\n]+\n(?:>.*\n)*\n\^zm-highlights\n/m);
	assert.match(note, /^> \[!zm-ref\]- 摘要與書目\n> > \[!info\] 摘要（Abstract）\n> > Background\.\n(?:>.*\n)*\n\^zm-abstract\n/m);
	assert.ok(note.indexOf("[!zm-nav]") < note.indexOf("[!zm-board]"), "the bar comes first");
	// Without nav: exactly as before
	let plain = core.buildObsidianNote(null, data, { layout: "board" });
	assert.doesNotMatch(plain, /zm-nav|\^zm-/);
	// Re-sync keeps the user's part
	let edited = note.replace("## ✍️ 我的筆記\n\n", "## ✍️ 我的筆記\n\n我的想法\n");
	assert.match(core.buildObsidianNote(edited, data, { layout: "board", nav }), /## ✍️ 我的筆記\n\n我的想法\n/);
});
