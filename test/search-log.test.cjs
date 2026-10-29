// 檢索日誌 (content/search-log.js): entries, merging, auto drafts, the reconciliation with the 來源/ tags, PRISMA-S, the note
const test = require("node:test");
const assert = require("node:assert/strict");
const log = require("../content/search-log.js");
const links = require("../content/search-links.js");
const screening = require("../content/screening.js");

const NOW = new Date("2026-10-29T08:00:00Z");
const at = (h = 8) => `2026-10-29T${String(h).padStart(2, "0")}:00:00.000Z`;

function entry(fields) {
	return log.normalizeEntry(Object.assign({ createdAt: at(), updatedAt: at() }, fields));
}

// A computePrisma() result: only what reconcile() reads
function prismaWith(sources, other) {
	return { counts: { identified: sources.reduce((n, [, v]) => n + v, 0) }, sources, other: other ? { sources: other } : null };
}

test("normalizeEntry: 0 hits are kept, empty counts are null, bad values get their defaults", () => {
	let e = log.normalizeEntry({ id: "a", database: " 華藝線上圖書館 ", hits: 0, imported: "", status: "draft", method: "magic", kind: "?", origin: "x" });
	assert.equal(e.hits, 0);
	assert.equal(e.imported, null);
	assert.equal(e.status, "formal");
	assert.equal(e.method, "database");
	assert.equal(e.kind, "search");
	assert.equal(e.origin, "manual");
	assert.equal(e.database, "華藝線上圖書館");
	assert.equal(e.sourceTag, "華藝線上圖書館", "the tag defaults to the database");
	assert.equal(log.normalizeEntry({ hits: "1,234" }).hits, 1234);
	assert.equal(log.normalizeEntry({ hits: "１２０" }).hits, 120, "full-width digits from a Chinese IME");
	assert.equal(log.normalizeEntry({ imported: "50 筆" }).imported, 50, "a trailing 筆");
	assert.equal(log.normalizeEntry({ hits: "約 50" }).hits, null, "an estimate is not a count (the form says so)");
	assert.equal(log.normalizeEntry({ hits: "-3" }).hits, null);
	assert.equal(log.normalizeEntry({ hits: "很多" }).hits, null);
	assert.equal(log.normalizeEntry({ hits: null }).hits, null);
	assert.ok(log.normalizeEntry(null).id, "never throws, always has an id");
	assert.equal(log.normalizeEntry({ date: "2026-10-29T10:00:00" }).date, "2026-10-29");
	let d = log.normalizeEntry({ kind: "dedupe", groups: "3", marked: 2 });
	assert.deepEqual([d.rule, d.groups, d.marked, d.records, d.cancelled], [log.DEDUPE_RULE, 3, 2, 0, false]);
});

test("mergeEntries: union by id, the newer copy wins, a tombstone wins a tie, sorted by date", () => {
	let a = [entry({ id: "1", database: "PubMed", date: "2026-10-02", hits: 10, updatedAt: at(9) }), entry({ id: "2", database: "CINAHL", date: "2026-10-01" })];
	let b = [entry({ id: "1", database: "PubMed", date: "2026-10-02", hits: 12, updatedAt: at(10) }), entry({ id: "3", database: "華藝", date: "2026-09-30" })];
	let m = log.mergeEntries(a, b);
	assert.deepEqual(m.map(e => e.id), ["3", "2", "1"]);
	assert.equal(m.find(e => e.id === "1").hits, 12);
	// The other way round: still the newer one
	assert.equal(log.mergeEntries(b, a).find(e => e.id === "1").hits, 12);
	let dead = log.tombstone(entry({ id: "2", database: "CINAHL" }), new Date(at(11)));
	assert.ok(log.mergeEntries(a, [dead]).find(e => e.id === "2").deleted, "a later deletion wins");
	let tie = Object.assign({}, dead, { updatedAt: at() });
	assert.ok(log.mergeEntries(a, [tie]).find(e => e.id === "2").deleted, "a tombstone wins a tie");
	assert.equal(log.activeEntries(log.mergeEntries(a, [dead])).length, 1);
});

test("encodeData / decodeData: a round trip with %% and % in a query; broken blocks are null", () => {
	let entries = [entry({ id: "x", query: "falls[tiab] AND 100% AND %%weird%% AND \"a\"" })];
	let block = log.encodeData({ v: 1, scope: "library/collections/K", entries });
	let lines = block.split("\n");
	assert.equal(lines.length, 3);
	assert.equal(lines[0], "%% zotmax-search-log-data");
	assert.equal(lines[2], "%%");
	assert.ok(!lines[1].includes("%"), "no % inside, so %% can never end the comment early");
	let back = log.decodeData(`# note\n\nsome text\n\n${block}\n\n%% zotero-bridge:end %%\n`);
	assert.equal(back.scope, "library/collections/K");
	assert.equal(back.entries[0].query, entries[0].query);
	assert.equal(log.decodeData("no block"), null);
	assert.equal(log.decodeData("%% zotmax-search-log-data\n{\"v\":1,\"entries\":[\n%%"), null);
	assert.equal(log.decodeData("%% zotmax-search-log-data\n{\"v\":1}\n%%"), null);
	assert.equal(log.decodeData(null), null);
});

test("buildLogNote: keeps the user's notes, no prisma_ key, the data copy last inside the managed block", () => {
	let entries = [
		entry({ id: "a", database: "PubMed", platform: "PubMed（NCBI）", query: "(\"Accidental Falls\"[Mesh]) AND nurs*[tiab]", date: "2026-10-20", hits: 120, imported: 118, limits: "2015–2025", limitsReason: "" }),
		entry({ id: "b", database: "華藝線上圖書館", sourceTag: "華藝", query: "跌倒 AND 長者", date: "2026-10-21", hits: 0 }),
		entry({ id: "c", database: "PubMed", status: "exploratory", origin: "pubmed-watch", query: "falls", date: "2026-10-22", hits: 3 }),
		log.dedupeEntry({ records: 150, groups: 12, marked: 10, alreadyMarked: 2 }, NOW),
	];
	let meta = { name: "跌倒預防", path: "碩論/跌倒預防", scope: "library/collections/AAA", uri: "zotero://select/library/collections/AAA", generatedAt: NOW.toISOString(), layout: "classic" };
	let first = log.buildLogNote(null, entries, meta);
	assert.match(first, /^---\n/);
	assert.match(first, /^type: "search-log"$/m);
	assert.match(first, /^zotero_collection: "library\/collections\/AAA"$/m);
	assert.match(first, /^log_formal: 2$/m);
	assert.match(first, /^log_exploratory: 1$/m);
	assert.ok(!/^prisma_/m.test(first), "never a prisma_* key");
	assert.match(first, /^# 跌倒預防 檢索日誌$/m);
	assert.match(first, /## 正式檢索（2 筆）/);
	assert.match(first, /### PubMed\n\n\*\*2026-10-20\*\* · PubMed（NCBI） · 命中 120 · 匯入 118\n\n```\n\("Accidental Falls"\[Mesh\]\) AND nurs\*\[tiab\]\n```/);
	assert.match(first, /限制條件：2015–2025；理由：待填/);
	assert.match(first, /\*\*2026-10-21\*\* · 命中 0/, "a 0-hit search is listed");
	assert.match(first, /> \[!zm-ref\]- 探索（1 筆，不進 PRISMA）/);
	assert.match(first, /> \[!zm-ref\]- 去重紀錄（1 次）/);
	assert.match(first, /> \[!zm-ref\]- PRISMA-S 草稿/);
	// The data block is the last thing before the end marker
	assert.match(first, /\n%% zotmax-search-log-data\n[^\n]+\n%%\n\n%% zotero-bridge:end %%\n\n## ✍️ 我的筆記\n/);
	assert.equal(log.decodeData(first).entries.length, 4);
	// The user's text survives a rewrite
	let edited = first.replace("## ✍️ 我的筆記\n\n", "## ✍️ 我的筆記\n\n館員建議再查 CINAHL。\n").replace("---\n\n# ", "---\n\n> 我自己的開頭\n\n# ")
		.replace(/^tags:/m, "my_key: \"留著\"\ntags:");
	let more = [...entries, entry({ id: "d", database: "CINAHL", date: "2026-10-23", hits: 40 })];
	let second = log.buildLogNote(edited, more, meta);
	assert.match(second, /館員建議再查 CINAHL。/);
	assert.match(second, /> 我自己的開頭/);
	assert.match(second, /^my_key: "留著"$/m);
	assert.match(second, /^log_formal: 3$/m);
	assert.equal((second.match(/%% zotero-bridge:start/g) || []).length, 1);
	assert.equal(log.decodeData(second).entries.length, 5);
	// Tombstones stay in the data copy but not in the lists
	let gone = log.buildLogNote(second, [...more.filter(e => e.id !== "d"), log.tombstone(more[4], NOW)], meta);
	assert.ok(!/### CINAHL/.test(gone));
	assert.ok(log.decodeData(gone).entries.find(e => e.id === "d").deleted);
	// Board layout: the KPI cards
	let board = log.buildLogNote(null, entries, Object.assign({}, meta, { layout: "board" }));
	assert.match(board, /> \[!zm-board\] 檢索日誌/);
	assert.match(board, /cssclasses:\n {2}- "zotmax-note"/);
});

test("upsertAutoDraft: one draft per query and day, the newest 10 kept, manual and promoted entries untouched", () => {
	let list = [entry({ id: "m", database: "PubMed", origin: "manual", query: "falls", date: "2026-09-01" })];
	let draft = { origin: "pubmed-watch", database: "PubMed", query: "falls", hits: 3 };
	let day = d => new Date(`2026-10-${String(d).padStart(2, "0")}T08:00:00`);
	let once = log.upsertAutoDraft(list, draft, { now: day(1) });
	let twice = log.upsertAutoDraft(once, Object.assign({}, draft, { hits: 5 }), { now: new Date(day(1).getTime() + 3600e3) });
	let drafts = log.activeEntries(twice).filter(e => e.origin === "pubmed-watch");
	assert.equal(drafts.length, 1, "the same day replaces");
	assert.equal(drafts[0].hits, 5);
	assert.equal(drafts[0].status, "exploratory", "always exploratory");
	// Twelve days: only the newest ten stay
	let l = list;
	for (let d = 1; d <= 12; d++) l = log.upsertAutoDraft(l, draft, { now: day(d) });
	let kept = log.activeEntries(l).filter(e => e.origin === "pubmed-watch");
	assert.equal(kept.length, 10);
	assert.deepEqual(kept.map(e => e.date).slice(0, 2), ["2026-10-03", "2026-10-04"]);
	assert.ok(l.some(e => e.deleted), "the dropped ones are tombstones");
	assert.ok(l.some(e => e.id === "m" && !e.deleted), "the manual entry stays");
	// A promoted draft is never dropped and blocks a second draft that day
	let promoted = l.map(e => (e.date === "2026-10-03" && !e.deleted ? Object.assign({}, e, { status: "formal", updatedAt: at(12) }) : e));
	let after = log.upsertAutoDraft(promoted, draft, { now: day(13) });
	assert.ok(after.some(e => e.date === "2026-10-03" && e.status === "formal" && !e.deleted));
	let sameDay = log.upsertAutoDraft(after, draft, { now: day(3) });
	assert.equal(log.activeEntries(sameDay).filter(e => e.date === "2026-10-03" && e.origin === "pubmed-watch").length, 1);
	// Another query has its own ten; a manual origin is not a draft
	assert.equal(log.upsertAutoDraft(list, Object.assign({}, draft, { origin: "manual" }), { now: day(1) }).length, 1);
});

test("upsertAutoDraft: a draft the user deleted stays deleted that day; old tombstones are dropped, compact", () => {
	let draft = { origin: "topic-bot", database: "PubMed", query: "falls", hits: 3, sentQuery: "falls", limits: "Entrez 日期 2026/10/01–2026/10/29" };
	let day = d => new Date(`2026-${d}T08:00:00`);
	let l = log.upsertAutoDraft([], draft, { now: day("10-29") });
	let id = l[0].id;
	// The user deletes today's draft (remove() marks it); the next run that day adds nothing
	let gone = l.map(e => (e.id === id ? log.tombstone(e, day("10-29"), "user") : e));
	assert.deepEqual(Object.keys(gone[0]).sort(), ["createdAt", "date", "deleted", "id", "kind", "origin", "query", "removedBy", "status", "updatedAt"], "a tombstone keeps only what merging needs");
	let again = log.upsertAutoDraft(gone, draft, { now: new Date(day("10-29").getTime() + 3600e3) });
	assert.equal(log.activeEntries(again).length, 0, "not brought back");
	assert.equal(log.activeEntries(log.upsertAutoDraft(again, draft, { now: day("10-30") })).length, 1, "the next day gets its draft");
	// A tombstone dropped by keep has no query or counts
	let pruned = log.tombstone(entry({ id: "p", origin: "topic-bot", query: "falls", hits: 3, limits: "x" }), NOW);
	assert.deepEqual(Object.keys(pruned).sort(), ["createdAt", "date", "deleted", "id", "kind", "origin", "status", "updatedAt"]);
	// Automatic drafts' tombstones older than 90 days go; a manual entry's tombstone stays
	let old = [
		log.tombstone(entry({ id: "a", origin: "pubmed-watch" }), day("07-01")),
		log.tombstone(entry({ id: "b", origin: "pubmed-watch" }), day("10-01")),
		log.tombstone(entry({ id: "c", origin: "manual" }), day("01-01")),
	];
	assert.deepEqual(log.pruneTombstones(old, day("10-29")).map(e => e.id), ["b", "c"]);
	let withOld = log.upsertAutoDraft(old, draft, { now: day("10-29") });
	assert.ok(!withOld.some(e => e.id === "a"), "a run drops them");
});

test("dedupeEntry: rule, counts, formal, today's date", () => {
	let d = log.dedupeEntry({ rule: log.DEDUPE_RULE, records: 80, groups: 4, marked: 0, alreadyMarked: 0, cancelled: true }, NOW);
	assert.equal(d.kind, "dedupe");
	assert.equal(d.status, "formal");
	assert.equal(d.origin, "dedupe");
	assert.equal(d.cancelled, true);
	assert.equal(d.date, log.localDate(NOW));
});

test("sameSource: aliases, case and width, 台／臺", () => {
	assert.ok(log.sameSource("華藝", "Airiti Library"));
	assert.ok(log.sameSource("華藝線上圖書館", "airiti"));
	assert.ok(log.sameSource("台灣博碩士論文知識加值系統", "臺灣博碩士論文"));
	assert.ok(log.sameSource("ＰｕｂＭｅｄ", "pubmed"));
	assert.ok(log.sameSource("MEDLINE", "PubMed"));
	assert.ok(log.sameSource("Cochrane Library", "CENTRAL"));
	assert.ok(log.sameSource("CINAHL Plus with Full Text", "CINAHL"));
	assert.ok(!log.sameSource("CINAHL", "PubMed"));
	assert.ok(!log.sameSource("", ""));
	assert.equal(log.canonicalSource("華藝線上圖書館"), "華藝");
	assert.equal(log.canonicalSource("NICE"), "NICE");
});

test("databasesSearched: formal searches by source, 0 hits included, exploratory ignored", () => {
	let dbs = log.databasesSearched([
		entry({ database: "PubMed", hits: 100, date: "2026-10-01" }),
		entry({ database: "PubMed", hits: 20, date: "2026-10-15" }),
		entry({ database: "華藝線上圖書館", sourceTag: "華藝", hits: 0, date: "2026-10-02" }),
		entry({ database: "CINAHL", method: "database", hits: null, date: "2026-10-03" }),
		entry({ database: "Embase", status: "exploratory", hits: 5 }),
		log.dedupeEntry({ groups: 1 }, NOW),
	]);
	assert.deepEqual(dbs.map(d => [d.name, d.hits, d.entries]), [["PubMed", 120, 2], ["華藝線上圖書館", 0, 1], ["CINAHL", null, 1]]);
	assert.deepEqual(dbs[0].dates, ["2026-10-01", "2026-10-15"]);
	assert.equal(dbs[1].tag, "華藝");
	assert.equal(dbs[2].method, "database");
});

test("reconcile: the log next to the tag counts, logMismatch only points out the gap", () => {
	let entries = [
		entry({ database: "華藝線上圖書館", sourceTag: "華藝", hits: 50, imported: 42 }),
		entry({ database: "PubMed", hits: 300 }),
		entry({ database: "CINAHL", hits: 25 }),
		entry({ database: "臺灣博碩士論文", hits: 0 }),
		entry({ database: "Cochrane", hits: null }),
		entry({ database: "Embase", status: "exploratory", hits: 99 }),
	];
	let prisma = prismaWith([["PubMed", 118], ["Airiti Library", 30], ["Scopus", 7], ["未標示來源", 4]], [["引文追蹤", 5]]);
	let before = JSON.stringify([entries, prisma]);
	let rec = log.reconcile(entries, prisma, { sourcePrefix: "來源/" });
	assert.equal(JSON.stringify([entries, prisma]), before, "nothing is changed");
	let row = name => rec.rows.find(r => r.name === name);
	assert.deepEqual([row("華藝線上圖書館").logImported, row("華藝線上圖書館").tagged, row("華藝線上圖書館").state], [42, 30, "diff"]);
	assert.equal(row("PubMed").state, "ok", "more hits than tagged with no import count: not a gap");
	assert.match(row("PubMed").note, /只匯出一部分/);
	assert.equal(row("CINAHL").state, "noTag");
	assert.equal(row("臺灣博碩士論文").state, "ok", "0 hits and nothing tagged");
	assert.equal(row("Cochrane").state, "noCount");
	assert.equal(row("Scopus").state, "noLog");
	assert.equal(row("引文追蹤").state, "noLog", "the other-methods column is matched too");
	assert.ok(!rec.rows.some(r => r.name === "未標示來源"), "the untagged bucket is never matched");
	assert.ok(!rec.rows.some(r => r.name === "Embase"), "exploratory searches are ignored");
	assert.equal(rec.issue.code, "logMismatch");
	assert.equal(rec.issue.level, "warn");
	assert.deepEqual(rec.issue.records, []);
	assert.match(rec.issue.message, /華藝線上圖書館：日誌記匯入 42 筆，Zotero 有 30 筆標了 來源\/Airiti Library/);
	assert.match(rec.issue.message, /CINAHL：日誌記命中 25 筆，Zotero 沒有文獻標了 來源\/CINAHL/);
	assert.match(rec.issue.message, /可能原因：沒有全部匯出、匯入時沒加來源標籤、同一批匯入兩次，或已在 Zotero 合併或刪除重複。PRISMA 的辨識數仍用 Zotero 標籤計數；要報哪個數字由你決定。$/);
	// More tagged than the database returned: often a batch imported twice
	let twice = log.reconcile([entry({ database: "PubMed", hits: 10 })], prismaWith([["PubMed", 20]]), {});
	assert.equal(twice.rows[0].state, "diff");
	assert.match(twice.issue.message, /PubMed：日誌記命中 10 筆，Zotero 卻有 20 筆標了 來源\/PubMed/);
	// All in order: no issue
	let fine = log.reconcile([entry({ database: "台灣博碩士論文", hits: 9, imported: 9 })], prismaWith([["臺灣博碩士論文", 9]]), {});
	assert.equal(fine.rows[0].state, "ok");
	assert.equal(fine.issue, null);
	assert.deepEqual(log.reconcile([], prismaWith([]), {}), { rows: [], issue: null });
});

test("reconcile: only real source tags count, never the Library Catalog PRISMA uses for an untagged record; the user's prefix", () => {
	let cfg = { sourcePrefix: "DB:" };
	let records = [
		...Array.from({ length: 30 }, (_, i) => ({ id: i + 1, key: `K${i}`, tags: [], catalog: "PubMed" })),
		{ id: 99, key: "T", tags: ["DB:PubMed"], catalog: "PubMed" },
	];
	let prisma = screening.computePrisma(records, cfg);
	assert.deepEqual(prisma.sources, [["PubMed", 31]], "PRISMA itself falls back to the catalog");
	let rec = log.reconcile([entry({ database: "PubMed", hits: 50, imported: 42 })], prisma, cfg);
	assert.deepEqual([rec.rows[0].tagged, rec.rows[0].state], [1, "diff"]);
	assert.match(rec.issue.message, /^檢索日誌和「DB:」標籤的筆數對不上：PubMed：日誌記匯入 42 筆，Zotero 有 1 筆標了 DB:PubMed。/);
	// Nothing tagged at all: noTag, and the note says how many records have no source tag
	let none = log.reconcile([entry({ database: "PubMed", hits: 50, imported: 30 })], screening.computePrisma(records.slice(0, 30), cfg), cfg);
	assert.equal(none.rows[0].state, "noTag");
	assert.match(none.rows[0].note, /沒有文獻標了「DB:PubMed」；有 30 筆文獻沒有任何「DB:」標籤/);
});

test("reconcileSection: plain table, board card, Notion without wikilinks; noLogLine", () => {
	let rec = log.reconcile([entry({ database: "華藝線上圖書館", sourceTag: "華藝", hits: 50, imported: 42 }), entry({ database: "PubMed", hits: 10, imported: 10 })],
		prismaWith([["華藝", 30], ["PubMed", 10]]), {});
	let plain = log.reconcileSection(rec, { link: "Reviews/檢索日誌/跌倒", layout: "plain" });
	assert.match(plain, /^## 檢索紀錄對帳\n\n並列檢索日誌和 Zotero 的數字；ZotMax 不會改 PRISMA 的辨識數。/);
	assert.match(plain, /\| 資料庫 \| 日誌命中 \| 日誌匯入 \| Zotero 標籤 \| 說明 \|/);
	assert.match(plain, /\| 華藝線上圖書館 \| 50 \| 42 \| 30 \| ⚠️ 匯入和標籤對不上 \|/);
	assert.match(plain, /\| PubMed \| 10 \| 10 \| 10 \| ✓ 匯入和標籤相同 \|/);
	assert.match(plain, /檢索日誌：\[\[Reviews\/檢索日誌\/跌倒\\\|跌倒 檢索日誌\]\]$/);
	let notion = log.reconcileSection(rec, { link: "Reviews/檢索日誌/跌倒", layout: "plain", links: false });
	assert.ok(!notion.includes("[["));
	let board = log.reconcileSection(rec, { link: "Reviews/檢索日誌/跌倒", layout: "board" });
	assert.match(board, /^> \[!zm-chart\|wide\] 檢索紀錄對帳/);
	assert.match(board, /> PubMed · 命中 10 · 匯入 10 · 標籤 10 ✓/);
	assert.match(board, /> 華藝線上圖書館 · 命中 50 · 匯入 42 · 標籤 30 ⚠️ 匯入和標籤對不上/);
	assert.match(board, /> 檢索日誌：\[\[Reviews\/檢索日誌\/跌倒\|跌倒 檢索日誌\]\]$/);
	let empty = log.reconcileSection(log.reconcile([entry({ database: "CINAHL" })], prismaWith([]), {}), { layout: "board" });
	assert.match(empty, /CINAHL · 命中 — · 匯入 — · 標籤 0/);
	assert.match(log.noLogLine(), /^還沒有檢索日誌：ZotMax → 檢索日誌（目前分類）… 記下每個資料庫的檢索式、日期和筆數（PRISMA-S）。$/);
});

test("prismaS: 16 items in order, 待填 where the log doesn't know, 0-hit databases listed", () => {
	let entries = [
		entry({ database: "PubMed", platform: "PubMed（NCBI）", query: "falls[tiab]", date: "2026-10-01", hits: 120, limits: "2015–2025", limitsReason: "" }),
		entry({ database: "PubMed", platform: "PubMed（NCBI）", query: "falls[tiab] AND 2026[dp]", date: "2026-10-20", hits: 6 }),
		entry({ database: "華藝線上圖書館", query: "跌倒", date: "2026-10-02", hits: 0, limits: "中文", limitsReason: "本研究聚焦臺灣" }),
		entry({ database: "ClinicalTrials.gov", method: "register", query: "falls", date: "2026-10-03", hits: null }),
		entry({ database: "Embase", status: "exploratory", query: "x", hits: 9 }),
		log.dedupeEntry({ records: 120, groups: 3, marked: 3 }, new Date("2026-10-05T08:00:00")),
		log.dedupeEntry({ records: 126, groups: 4, marked: 1, alreadyMarked: 3 }, new Date("2026-10-21T08:00:00")),
	];
	let p = log.prismaS(entries, { name: "跌倒預防" });
	assert.deepEqual(p.items.map(i => i.n), [...Array(16).keys()].map(i => i + 1));
	assert.deepEqual(p.items.map(i => i.en), log.PRISMA_S_ITEMS.map(i => i.en));
	let item = n => p.items[n - 1];
	assert.equal(item(1).text, "PubMed、華藝線上圖書館");
	assert.equal(item(1).todo, false);
	assert.match(item(2).text, /^待填（例如 EBSCOhost 一次查 CINAHL 和 MEDLINE）$/);
	assert.equal(item(3).text, "ClinicalTrials.gov");
	assert.match(item(4).text, /^待填/);
	assert.match(item(8).text, /falls\[tiab\] AND 2026\[dp\]/);
	assert.ok(!item(8).text.includes("Embase"), "exploratory searches are not reported");
	assert.match(item(9).text, /PubMed：2015–2025；理由：待填/);
	assert.match(item(9).text, /華藝線上圖書館：中文；理由：本研究聚焦臺灣/);
	assert.equal(item(9).todo, true);
	assert.match(item(10).text, /^待填/);
	assert.equal(item(12).text, "PubMed：2026-10-01、2026-10-20");
	assert.match(item(13).text, /華藝線上圖書館：2026-10-02/);
	assert.match(item(14).text, /PRESS/);
	assert.match(item(15).text, /華藝線上圖書館 0 筆/, "a 0-hit database is listed");
	assert.match(item(15).text, /ClinicalTrials\.gov 待填/);
	assert.match(item(15).text, /合計 126 筆（去重前，不含待填）/);
	assert.match(item(16).text, /^2026-10-21 用 ZotMax 找重複（DOI、PMID、標題＋年份、期刊＋年＋卷＋起始頁）：4 組、標記 1 筆（之前已標記 3 筆）；合併或刪除的方式：待填$/);
	assert.ok(p.items.filter(i => /待填/.test(i.text)).every(i => i.todo), "every item with 待填 is todo");
	assert.match(p.markdown, /^# PRISMA-S 檢索報告草稿（跌倒預防）\n\n這是草稿：只填了檢索日誌知道的事，其他標「待填」。正式附錄請自己核對。/);
	assert.match(p.markdown, /^- \[x\] 1\. 資料庫名稱（Database name）：/m);
	assert.match(p.markdown, /^- \[ \] 2\. 同一平台一次查多個資料庫（Multi-database searching）：待填/m);
	assert.match(p.markdown, /^- \[x\] 8\. 完整檢索式（Full search strategies）：見下方「完整檢索式」（4 筆）$/m);
	assert.match(p.markdown, /### 完整檢索式（第 8 項）\n\n\*\*PubMed\*\* · 2026-10-01\n\n```\nfalls\[tiab\]\n```/);
	assert.ok(p.csv.startsWith("﻿項目,PRISMA-S,內容,狀態\r\n"));
	assert.match(p.csv, /\r\n1\. 資料庫名稱,Database name,PubMed、華藝線上圖書館,已填\r\n/);
	// Formal searches without any limits: the log can't tell 「none」 from 「not written」, so item 9 stays 待填
	let plain = log.prismaS([entry({ database: "PubMed", query: "falls", date: "2026-10-01", hits: 3 })], {});
	assert.equal(plain.items[8].text, "日誌沒有記限制條件；沒有限制也請寫明（待填）");
	assert.equal(plain.items[8].todo, true);
	assert.match(plain.markdown, /^- \[ \] 9\. /m);
	// An empty log: everything 待填
	let none = log.prismaS([], {});
	assert.ok(none.items.every(i => i.todo && /^待填/.test(i.text)));
	assert.match(none.markdown, /^# PRISMA-S 檢索報告草稿\n/);
});

test("logCSV: active entries, BOM, formula-safe cells", () => {
	let csv = log.logCSV([
		entry({ database: "PubMed", query: "=cmd()", date: "2026-10-01", hits: 0 }),
		log.tombstone(entry({ id: "z", database: "Gone" }), NOW),
		log.dedupeEntry({ groups: 2, marked: 2, records: 40 }, NOW),
	]);
	let lines = csv.replace(/^﻿/, "").trim().split("\r\n");
	assert.equal(lines[0], "狀態,方法,資料庫,平台,日期,檢索式,限制條件,限制理由,命中,匯入檔名,匯入筆數,備註,來源");
	assert.equal(lines.length, 3);
	assert.match(lines[1], /^正式,資料庫,PubMed,,2026-10-01,'=cmd\(\),,,0,,,,PubMed$/);
	assert.match(lines[2], /^正式,去重,,,\d{4}-\d{2}-\d{2},,,,,,,.*；比對 40 筆,找重複$/, "命中 stays empty for a 找重複 run");
	assert.ok(!csv.includes("Gone"));
});

test("shouldOfferLog: Chinese, copy-only, custom and grey-literature sources; not PubMed and its kin", () => {
	let want = {
		pubmed: false, "pubmed-cq": false, "pubmed-sr": false, mesh: false, europepmc: false, semantic: false, uptodate: false,
		cochrane: true, cinahl: true, embase: true, scholar: true, trip: true, jbi: true, clinicaltrials: true, ictrp: true,
		airiti: true, ndltd: true, "ncl-periodicals": true, "guideline-pdf": true, "tw-gov": true, nice: true, rnao: true, gin: true, cdc: true,
	};
	for (let s of links.BUILTIN) {
		assert.ok(s.id in want, `every built-in source has an answer: ${s.id}`);
		assert.equal(log.shouldOfferLog(s), want[s.id], s.id);
	}
	assert.equal(log.shouldOfferLog({ id: "my-lib", name: "學校館藏", url: "https://x/?q={q}", custom: true }), true);
	assert.equal(log.shouldOfferLog({ id: "related" }), false);
	assert.equal(log.shouldOfferLog(null), false);
});

test("prefills: from 測試檢索式, an opened link and a tagged batch", () => {
	let t = log.prefillFromTest({ query: "falls[tiab]", sent: "(falls[tiab]) AND (\"2020\"[dp] : \"3000\"[dp])", translation: "\"falls\"[Title/Abstract]", count: 0, since: "2020" }, { origin: "pubmed-test", now: NOW });
	assert.deepEqual([t.database, t.sourceTag, t.platform, t.method, t.status, t.origin], ["PubMed", "PubMed", "PubMed（NCBI）", "database", "formal", "pubmed-test"]);
	assert.equal(t.hits, 0, "0 hits prefilled as 0");
	assert.equal(t.query, "falls[tiab]");
	assert.match(t.sentQuery, /\[dp\]/);
	assert.equal(t.limits, "出版日期 2020 起");
	assert.equal(t.date, log.localDate(NOW));
	assert.equal(log.prefillFromTest({ query: "x", count: 3 }, { origin: "bot-test", now: NOW }).origin, "bot-test");
	let target = links.buildTarget(links.BUILTIN.find(s => s.id === "airiti"), "跌倒 長者");
	let a = log.prefillFromTarget(target, NOW);
	assert.deepEqual([a.database, a.sourceTag, a.method, a.query, a.hits, a.origin], ["華藝線上圖書館", "華藝", "database", "跌倒 長者", null, "link"]);
	assert.equal(log.prefillFromTarget({ id: "nice", name: "NICE", query: "falls" }, NOW).method, "website");
	assert.equal(log.prefillFromTarget({ id: "ictrp", name: "WHO ICTRP", query: "falls" }, NOW).method, "register");
	assert.equal(log.prefillFromTarget({ id: "cinahl", name: "CINAHL", query: "falls" }, NOW).platform, "EBSCOhost");
	let p = log.prefillFromPending({ tag: "華藝", n: 30, at: "2026-10-28T03:00:00Z" }, NOW);
	assert.deepEqual([p.database, p.sourceTag, p.imported, p.hits, p.date, p.origin], ["華藝", "華藝", 30, null, log.localDate(new Date("2026-10-28T03:00:00Z")), "import"]);
	assert.equal(log.prefillFromPending({ tag: "引文追蹤", n: 4, at: NOW }, NOW).method, "citation");
});

test("foldPending: one batch per tag and scope within 30 minutes, at most 20", () => {
	let t = m => new Date(NOW.getTime() + m * 60000).toISOString();
	let l = log.foldPending([], { tag: "華藝", n: 10, scopes: ["library/collections/A"], at: t(0) });
	l = log.foldPending(l, { tag: "華藝", n: 5, scopes: ["library/collections/A", "library/collections/P"], at: t(20) });
	assert.equal(l.length, 1);
	assert.equal(l[0].n, 15);
	assert.deepEqual(l[0].scopes, ["library/collections/A", "library/collections/P"]);
	l = log.foldPending(l, { tag: "華藝", n: 2, scopes: ["library/collections/A"], at: t(70) });
	assert.equal(l.length, 2, "more than 30 minutes later: a new batch");
	l = log.foldPending(l, { tag: "PubMed", n: 2, scopes: ["library/collections/A"], at: t(71) });
	l = log.foldPending(l, { tag: "華藝", n: 2, scopes: ["library/collections/B"], at: t(72) });
	assert.equal(l.length, 4, "another tag or scope: its own batch");
	assert.equal(log.foldPending(l, { tag: "", n: 3 }).length, 4);
	let many = [];
	for (let i = 0; i < 25; i++) many = log.foldPending(many, { tag: `T${i}`, n: 1, scopes: ["library"], at: t(i) });
	assert.equal(many.length, 20);
	assert.equal(many[0].tag, "T5", "the oldest are dropped");
	assert.equal(log.dismissPending(many, many[0].id).length, 19);
});

test("scopeFileName, logFolderParts: organized and flat vaults", () => {
	assert.equal(log.scopeFileName("library/collections/AB12"), "library_collections_AB12.json");
	assert.equal(log.scopeFileName("groups/123/collections/X"), "groups_123_collections_X.json");
	assert.deepEqual(log.logFolderParts({ structure: "organized", defaults: { obsidianFolder: "Zotero" } }), ["Zotero", "30 評讀與綜整", "檢索日誌"]);
	assert.deepEqual(log.logFolderParts({ structure: "flat", defaults: { obsidianFolder: "" } }), ["Reviews", "檢索日誌"]);
	// The reviews folder name matches screening's
	assert.equal(screening.REVIEW_FOLDER, "Reviews");
});
