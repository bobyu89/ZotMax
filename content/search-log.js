/*
 * ZotMax — 檢索日誌 (search log), the PRISMA-S draft and the PRISMA reconciliation.
 *
 * One log per research project (a Zotero collection, or the whole library): each entry is one search — the
 * database, the platform, the full query as run, the date, the limits and why, the hits (0 is a value), the
 * import file and how many records came in — marked 正式 (formal: goes into the PRISMA reconciliation and
 * PRISMA-S) or 探索 (exploratory: a trial search or a watch run, kept only as a record). 找重複 adds a dedupe
 * entry each run. ZotMax prefills only what it knows (PubMed's count and query translation, the database it
 * just opened, the batch it saw tagged 來源/…); the numbers and reasons are the user's.
 *
 * Storage (never prefs):
 *   <Zotero data folder>/zotero-bridge/search-log/<scope key>.json     the working copy, works without Obsidian
 *   <reviews folder>/檢索日誌/<collection>.md                             with a vault: the readable note, whose
 *     managed block ends with a hidden copy of the data (%% zotmax-search-log-data … %%). Every read merges the
 *     JSON and that copy by entry id (the newer updatedAt wins, deletions are tombstones), so a second computer
 *     sharing the vault gets the log and a lost data folder comes back. The subfolder keeps the note out of the
 *     dashboard's and the progress report's lists of review projects, and moves with the folder in 整理 vault.
 * Entry points: 「記入檢索日誌」 after 測試檢索式 (pubmed-watch.js, topic-bot.js); 「📝 記一筆」 after opening a
 * Chinese, CINAHL or grey-literature link (search-links.js, pico.js); batches tagged 來源/… noticed by an
 * item-tag observer and waiting in the log window for 「補記一筆」 (nothing pops up). Automatic bot and watch runs
 * only leave 探索 drafts (one per query and day, the newest 10 kept).
 *
 *   extensions.zotero-bridge.feature.searchLog            the switch (features.js)
 *   extensions.zotero-bridge.searchLog.offerAfterOpen     show 「📝 記一筆」 after opening a link (default true)
 *   extensions.zotero-bridge.searchLog.autoDrafts         exploratory drafts from automatic runs (default true)
 *   extensions.zotero-bridge.searchLog.pending            batches waiting for 「補記一筆」 (JSON, at most 20)
 *
 * The helpers at the top are pure (Node tests); the rest needs Zotero.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(require("./core.js"), globalThis);
	}
	else {
		(root.ZB = root.ZB || {}).searchLog = factory(root.ZB.core, root);
	}
})(this, function (core, scope) {
	const PREF = "extensions.zotero-bridge.";
	const FEATURE = "searchLog";
	const TITLE = "ZotMax：檢索日誌";
	const LOG_FOLDER = "檢索日誌";
	const NOTE_SUFFIX = " 檢索日誌";
	const DATA_START = "%% zotmax-search-log-data";
	const DATA_RE = /^%% zotmax-search-log-data[ \t]*\r?\n([^\r\n]*)\r?\n%%[ \t]*$/m;
	const KINDS = ["search", "dedupe"];
	const STATUSES = ["formal", "exploratory"];
	const STATUS_LABELS = { formal: "正式", exploratory: "探索" };
	// PRISMA-S categories
	const METHODS = ["database", "register", "website", "citation", "contact", "other"];
	const METHOD_LABELS = { database: "資料庫", register: "試驗登錄", website: "網站", citation: "引文追蹤", contact: "聯絡作者或專家", other: "其他" };
	const ORIGINS = ["manual", "pubmed-test", "bot-test", "link", "import", "pubmed-watch", "topic-bot", "dedupe"];
	const ORIGIN_LABELS = {
		manual: "手動", "pubmed-test": "PubMed 追蹤的測試檢索式", "bot-test": "主題搜尋機器人的測試檢索式", link: "開啟資料庫連結後",
		import: "匯入的來源標籤", "pubmed-watch": "PubMed 追蹤自動執行", "topic-bot": "主題搜尋機器人自動執行", dedupe: "找重複",
	};
	// Drafts that automatic runs leave; never formal until the user promotes them
	const AUTO_ORIGINS = ["pubmed-watch", "topic-bot"];
	const AUTO_KEEP = 10;
	// An automatic draft's tombstone is dropped after this many days: every copy has merged it by then
	const TOMBSTONE_DAYS = 90;
	const DEDUPE_RULE = "DOI、PMID、標題＋年份、期刊＋年＋卷＋起始頁（ZotMax 找重複）";
	const NO_SOURCE = "未標示來源";
	const DEFAULT_SOURCE_PREFIX = "來源/";
	const MAX_PENDING = 20;
	const PENDING_WINDOW_MS = 30 * 60 * 1000;
	const BATCH_DELAY_MS = 5000;
	const NOT_FILLED = "待填";
	const USER_HEADING = "✍️ 我的筆記";

	// Database names and 來源/ tag values that mean the same source (compared case- and width-insensitively, 台 = 臺);
	// the first of each group is the name a prefilled tag gets
	const SOURCE_ALIASES = [
		["PubMed", "MEDLINE"],
		["華藝", "華藝線上圖書館", "Airiti Library", "airiti", "AiritiLibrary"],
		["臺灣博碩士論文", "臺灣博碩士論文知識加值系統", "博碩士論文", "NDLTD"],
		["國圖期刊", "國家圖書館期刊文獻資訊網", "臺灣期刊論文索引"],
		["Cochrane", "Cochrane Library", "CENTRAL", "Cochrane CENTRAL"],
		["Google Scholar", "Scholar", "谷歌學術"],
		["CINAHL", "CINAHL Plus", "CINAHL Plus with Full Text", "CINAHL Complete"],
	];
	// search-links.js sources whose searches ZotMax can't count: databases without an API and grey literature.
	// PubMed (and its filtered forms) have 測試檢索式; MeSH, Europe PMC, Semantic Scholar and UpToDate are not
	// searches people report.
	const OFFER_IDS = ["cinahl", "cochrane", "embase", "jbi", "scholar", "trip", "clinicaltrials", "ictrp",
		"guideline-pdf", "tw-gov", "nice", "rnao", "gin", "cdc"];
	const NO_OFFER_IDS = ["pubmed", "pubmed-cq", "pubmed-sr", "mesh", "europepmc", "semantic", "uptodate", "related"];
	const WEBSITE_IDS = ["guideline-pdf", "tw-gov", "nice", "rnao", "gin", "cdc", "trip"];
	const REGISTER_IDS = ["clinicaltrials", "ictrp"];
	// The interface a search-links target opens (a fact of its URL)
	const PLATFORMS = { cinahl: "EBSCOhost", jbi: "Ovid", "guideline-pdf": "Google", "tw-gov": "Google", rnao: "Google" };

	// ---------- entries (pure) ----------

	function newEntryID(now) {
		let t = now ? new Date(now).getTime() : Date.now();
		return "l" + (Number.isFinite(t) ? t : Date.now()).toString(36) + Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, "0");
	}

	/** YYYY-MM-DD in local time. */
	function localDate(date) {
		let d = date ? new Date(date) : new Date();
		if (isNaN(d.getTime())) d = new Date();
		let p = n => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
	}

	function text(v) {
		return (v === undefined || v === null ? "" : String(v)).trim();
	}

	/**
	 * A count: an integer ≥ 0, or null when not filled (0 is a value). Full-width digits (a Chinese IME) and a
	 * trailing 筆 are fine; anything else (「約 50」) is not a count, and the form says so instead of saving null.
	 */
	function count(v) {
		if (v === undefined || v === null) return null;
		let s = String(v).normalize("NFKC").replace(/[,，\s]/g, "").replace(/筆$/, "");
		if (!s || !/^\d+(?:\.\d+)?$/.test(s)) return null;
		return Math.floor(Number(s));
	}

	/** Every field coerced; unknown values get their defaults. Never throws. */
	function normalizeEntry(raw) {
		let r = raw && typeof raw === "object" ? raw : {};
		let pick = (v, list) => (list.includes(v) ? v : list[0]);
		let kind = pick(r.kind, KINDS);
		let database = text(r.database);
		let createdAt = text(r.createdAt);
		let date = text(r.date);
		let e = {
			id: text(r.id) || newEntryID(),
			kind,
			status: pick(r.status, STATUSES),
			method: pick(r.method, METHODS),
			database,
			sourceTag: text(r.sourceTag) || database,
			platform: text(r.platform),
			query: text(r.query),
			sentQuery: text(r.sentQuery),
			translation: text(r.translation),
			date: /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : date,
			limits: text(r.limits),
			limitsReason: text(r.limitsReason),
			hits: count(r.hits),
			importFile: text(r.importFile),
			imported: count(r.imported),
			notes: text(r.notes),
			origin: pick(r.origin, ORIGINS),
			createdAt,
			updatedAt: text(r.updatedAt) || createdAt,
		};
		if (r.deleted) {
			// A tombstone keeps only what merging needs; one the user deleted also keeps its query (no new draft that day)
			let t = { id: e.id, kind, status: e.status, origin: e.origin, date: e.date, createdAt, updatedAt: e.updatedAt, deleted: true };
			if (r.removedBy === "user") t.removedBy = "user";
			if (t.removedBy && AUTO_ORIGINS.includes(t.origin)) t.query = e.query;
			return t;
		}
		if (kind === "dedupe") {
			Object.assign(e, {
				rule: text(r.rule) || DEDUPE_RULE,
				records: count(r.records) || 0,
				groups: count(r.groups) || 0,
				marked: count(r.marked) || 0,
				alreadyMarked: count(r.alreadyMarked) || 0,
				cancelled: !!r.cancelled,
			});
		}
		return e;
	}

	/**
	 * A deleted entry: only what merging needs, so a deletion on one computer never brings it back on another.
	 * by "user": the user deleted it (an automatic run then leaves no new draft for that query on that day).
	 */
	function tombstone(entry, now, by) {
		let at = new Date(now || Date.now()).toISOString();
		return normalizeEntry({ id: entry.id, kind: entry.kind, status: entry.status, origin: entry.origin, date: entry.date, query: entry.query,
			createdAt: entry.createdAt || at, updatedAt: at, deleted: true, removedBy: by });
	}

	/** Without the tombstones of automatic drafts deleted more than `days` ago (the log would only grow). */
	function pruneTombstones(list, now, days = TOMBSTONE_DAYS) {
		let cutoff = new Date(new Date(now || Date.now()).getTime() - days * 86400000).toISOString();
		return (list || []).filter(e => !(e && e.deleted && AUTO_ORIGINS.includes(e.origin) && String(e.updatedAt) < cutoff));
	}

	function activeEntries(list) {
		return (list || []).filter(e => e && !e.deleted);
	}

	/** Formal searches: what goes into the PRISMA reconciliation and PRISMA-S. */
	function formalEntries(list) {
		return activeEntries(list).filter(e => e.kind === "search" && e.status === "formal");
	}

	function sortEntries(list) {
		return list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
	}

	/**
	 * Two copies of a log as one: the union by id; the copy with the newer updatedAt wins, and on a tie a tombstone
	 * wins over a live copy. Sorted by date, then createdAt.
	 */
	function mergeEntries(a, b) {
		let byID = new Map();
		for (let raw of [...(a || []), ...(b || [])]) {
			let e = normalizeEntry(raw);
			let old = byID.get(e.id);
			if (!old) {
				byID.set(e.id, e);
				continue;
			}
			let cmp = String(e.updatedAt).localeCompare(String(old.updatedAt));
			if (cmp > 0 || (cmp === 0 && e.deleted && !old.deleted)) byID.set(e.id, e);
		}
		return sortEntries([...byID.values()]);
	}

	// A draft the user never edited or promoted
	function pristineDraft(e) {
		return !e.deleted && e.kind === "search" && AUTO_ORIGINS.includes(e.origin) && e.status === "exploratory" && e.updatedAt === e.createdAt;
	}

	/**
	 * An automatic run's exploratory draft into the list: it replaces the untouched draft with the same origin, query
	 * and date (one per query and day); then, per origin and query, only the newest `keep` untouched drafts stay (the
	 * older ones become tombstones). Entries the user wrote, edited or promoted are never touched; a day whose draft
	 * the user already edited gets no second one.
	 */
	function upsertAutoDraft(list, draft, opts = {}) {
		let keep = opts.keep === undefined ? AUTO_KEEP : opts.keep;
		let now = opts.now || new Date();
		let at = new Date(now).toISOString();
		let d = normalizeEntry(Object.assign({ date: localDate(now) }, draft, { kind: "search", status: "exploratory", createdAt: at, updatedAt: at }));
		if (!AUTO_ORIGINS.includes(d.origin)) return (list || []).slice();
		let sameQuery = e => !e.deleted && e.kind === "search" && e.origin === d.origin && e.query === d.query;
		let out = (list || []).map(normalizeEntry);
		let today = out.filter(e => sameQuery(e) && e.date === d.date);
		if (today.some(e => !pristineDraft(e))) return out;
		// The user deleted this day's draft: it stays deleted
		if (out.some(e => e.deleted && e.removedBy === "user" && e.origin === d.origin && e.query === d.query && e.date === d.date)) return out;
		if (today.length) {
			d.id = today[0].id;
			out = out.map(e => (e === today[0] ? d : today.includes(e) ? tombstone(e, now) : e));
		}
		else {
			out.push(d);
		}
		let drafts = out.filter(e => sameQuery(e) && pristineDraft(e))
			.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
		let drop = new Set(drafts.slice(keep).map(e => e.id));
		out = out.map(e => (drop.has(e.id) ? tombstone(e, now) : e));
		return sortEntries(pruneTombstones(out, now));
	}

	/** The entry 找重複 leaves (PRISMA-S item 16): the rule, the groups, how many it tagged. */
	function dedupeEntry(info, now) {
		let at = new Date(now || Date.now()).toISOString();
		let i = info || {};
		return normalizeEntry({
			id: newEntryID(now), kind: "dedupe", status: "formal", origin: "dedupe", date: localDate(now),
			rule: i.rule, records: i.records, groups: i.groups, marked: i.marked, alreadyMarked: i.alreadyMarked, cancelled: i.cancelled,
			createdAt: at, updatedAt: at,
		});
	}

	// ---------- sources (pure) ----------

	function sourceKey(name) {
		let s = String(name || "").normalize("NFKC").toLowerCase().replace(/台/g, "臺").replace(/\s+/g, " ").trim();
		for (let group of SOURCE_ALIASES) {
			if (group.some(g => g.normalize("NFKC").toLowerCase() === s)) return group[0].toLowerCase();
		}
		return s;
	}

	/** Whether two database names or 來源/ values mean the same source. */
	function sameSource(a, b) {
		let ka = sourceKey(a);
		return !!ka && ka === sourceKey(b);
	}

	/** The tag value a prefilled entry gets: the alias group's first name, else the name as given. */
	function canonicalSource(name) {
		let key = sourceKey(name);
		let group = SOURCE_ALIASES.find(g => g[0].toLowerCase() === key);
		return group ? group[0] : text(name);
	}

	function sum(values) {
		let known = values.filter(v => v !== null && v !== undefined);
		return known.length ? known.reduce((a, b) => a + b, 0) : null;
	}

	/**
	 * The databases of the formal searches, grouped by source (aliases count as one), 0-hit searches included:
	 * [{ name, tag, method, hits, imported, dates, entries }] (hits/imported: the sums, null when none filled).
	 */
	function formalGroups(entries) {
		let groups = [];
		for (let e of formalEntries(entries)) {
			let label = e.sourceTag || e.database;
			let g = groups.find(x => sameSource(x.tag, label) || sameSource(x.name, e.database));
			if (!g) {
				g = { name: e.database || label, tag: label, method: e.method, list: [] };
				groups.push(g);
			}
			g.list.push(e);
		}
		return groups;
	}

	function databasesSearched(entries) {
		return formalGroups(entries).map(g => ({
			name: g.name,
			tag: g.tag,
			method: g.method,
			hits: sum(g.list.map(e => e.hits)),
			imported: sum(g.list.map(e => e.imported)),
			dates: [...new Set(g.list.map(e => e.date).filter(Boolean))].sort(),
			entries: g.list.length,
		}));
	}

	const RECONCILE_TAIL = "可能原因：沒有全部匯出、匯入時沒加來源標籤、同一批匯入兩次，或已在 Zotero 合併或刪除重複。PRISMA 的辨識數仍用 Zotero 標籤計數；要報哪個數字由你決定。";

	/**
	 * The log's numbers next to the 來源/ tag counts of computePrisma() (both columns; only real tags, never the Library
	 * Catalog that PRISMA counts for a record without one — prisma.tagSources). One row per database that has
	 * formal searches or records: { name, tag, tags (the tag values matched), logHits, logImported, tagged, state, note },
	 * state "ok" (imported, or hits, equal the tagged count), "diff", "noLog" (records tagged, no formal search),
	 * "noTag" (a formal search with hits or imports, nothing tagged), "noCount" (no numbers filled). More hits than
	 * tagged records with no import count filled is not a gap (people export part of a result). issue: null, or the
	 * logMismatch warning for the diff and noTag rows. Exploratory and deleted entries are ignored; nothing is changed.
	 */
	function reconcile(entries, prisma, cfg) {
		let prefix = text(cfg && cfg.sourcePrefix) || DEFAULT_SOURCE_PREFIX;
		// The other-methods column holds only records with tags (screening.isOtherMethod); its sources are all tags
		let dbTags = prisma && Array.isArray(prisma.tagSources) ? prisma.tagSources : (prisma && prisma.sources) || [];
		let tagged = [...dbTags, ...((prisma && prisma.other && prisma.other.sources) || [])]
			.filter(([name]) => name !== NO_SOURCE);
		let untagged = Number(prisma && prisma.untagged) || 0;
		let rows = databasesSearched(entries).map(d => ({ name: d.name, tag: d.tag, tags: [], logHits: d.hits, logImported: d.imported, tagged: 0, state: "", note: "" }));
		for (let [name, n] of tagged) {
			let row = rows.find(r => sameSource(r.tag, name) || sameSource(r.name, name));
			if (!row) {
				row = { name, tag: name, tags: [], logHits: null, logImported: null, tagged: 0, state: "", note: "", noLog: true };
				rows.push(row);
			}
			if (!row.tags.includes(name)) row.tags.push(name);
			row.tagged += n;
		}
		for (let r of rows) {
			if (r.noLog) {
				delete r.noLog;
				r.state = "noLog";
				r.note = "有標籤，檢索日誌沒有正式紀錄";
			}
			else if (!r.tagged && ((r.logHits || 0) > 0 || (r.logImported || 0) > 0)) {
				r.state = "noTag";
				r.note = `沒有文獻標了「${prefix}${r.tag}」${untagged ? `；有 ${untagged} 筆文獻沒有任何「${prefix}」標籤` : ""}`;
			}
			else if (r.logImported !== null) {
				r.state = r.logImported === r.tagged ? "ok" : "diff";
				r.note = r.state === "ok" ? "匯入和標籤相同" : "匯入和標籤對不上";
			}
			else if (r.logHits !== null) {
				r.state = r.logHits < r.tagged ? "diff" : "ok";
				r.note = r.logHits < r.tagged ? "標籤比命中還多"
					: r.logHits > r.tagged ? "命中比標籤多：可能只匯出一部分；填上匯入筆數就能對帳"
					: r.logHits === 0 ? "查到 0 筆" : "命中和標籤相同";
			}
			else {
				r.state = "noCount";
				r.note = "檢索日誌沒有填筆數";
			}
		}
		let clauses = rows.filter(r => r.state === "diff" || r.state === "noTag").map((r) => {
			let tags = (r.tags.length ? r.tags : [r.tag]).map(t => prefix + t).join("、");
			if (r.state === "noTag") return `${r.name}：日誌記${r.logImported !== null ? `匯入 ${r.logImported}` : `命中 ${r.logHits}`} 筆，Zotero 沒有文獻標了 ${tags}`;
			if (r.logImported !== null) return `${r.name}：日誌記匯入 ${r.logImported} 筆，Zotero 有 ${r.tagged} 筆標了 ${tags}`;
			return `${r.name}：日誌記命中 ${r.logHits} 筆，Zotero 卻有 ${r.tagged} 筆標了 ${tags}`;
		});
		let issue = clauses.length
			? { code: "logMismatch", level: "warn", message: `檢索日誌和「${prefix}」標籤的筆數對不上：${clauses.join("；")}。${RECONCILE_TAIL}`, records: [] }
			: null;
		return { rows, issue };
	}

	function cellText(v) {
		return String(v === undefined || v === null ? "" : v).replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();
	}

	function shown(n) {
		return n === null || n === undefined ? "—" : String(n);
	}

	const STATE_MARKS = { ok: "✓", diff: "⚠️", noTag: "⚠️", noLog: "ℹ️", noCount: "ℹ️" };

	/** The log note's name for a link label: the last part of its path. */
	function linkLabel(link) {
		return `${String(link || "").split("/").pop()}${NOTE_SUFFIX}`;
	}

	function logLinkLine(link, links) {
		if (!link) return "檢索日誌：在 Zotero 的分類上按右鍵 → ZotMax → 檢索日誌（目前分類）…";
		return links === false ? `檢索日誌：${link}` : `檢索日誌：[[${link}\\|${linkLabel(link)}]]`;
	}

	/**
	 * The PRISMA note's 「檢索紀錄對帳」: plain → a section with the table; board → a wide chart card (one line per
	 * database). opts: { link (the log note, no .md), layout, links (false in Notion: no wikilinks) }.
	 */
	function reconcileSection(rec, opts = {}) {
		let rows = (rec && rec.rows) || [];
		if (opts.layout === "board") {
			let lines = rows.map(r => [r.name, `命中 ${shown(r.logHits)}`, `匯入 ${shown(r.logImported)}`, `標籤 ${r.tagged}`].join(" · ")
				+ ` ${STATE_MARKS[r.state] || ""}${r.state === "ok" ? "" : ` ${r.note}`}`.trimEnd());
			if (!rows.length) lines.push("還沒有正式檢索，也沒有「來源/」標籤。");
			lines.push(logLinkLine(opts.link, true).replace("\\|", "|"));
			return core.chartCard("檢索紀錄對帳", lines, true);
		}
		let table = rows.length
			? ["| 資料庫 | 日誌命中 | 日誌匯入 | Zotero 標籤 | 說明 |", "|---|---:|---:|---:|---|",
				...rows.map(r => `| ${[r.name, shown(r.logHits), shown(r.logImported), r.tagged, `${STATE_MARKS[r.state] || ""} ${r.note}`.trim()].map(cellText).join(" | ")} |`)].join("\n")
			: "還沒有正式檢索，也沒有「來源/」標籤。";
		return [
			"## 檢索紀錄對帳",
			"並列檢索日誌和 Zotero 的數字；ZotMax 不會改 PRISMA 的辨識數。",
			table,
			logLinkLine(opts.link, opts.links),
		].join("\n\n");
	}

	function noLogLine() {
		return "還沒有檢索日誌：ZotMax → 檢索日誌（目前分類）… 記下每個資料庫的檢索式、日期和筆數（PRISMA-S）。";
	}

	// ---------- PRISMA-S (pure) ----------

	// The 16 items of PRISMA-S (Rethlefsen et al., 2021), with what to write when the log doesn't know
	const PRISMA_S_ITEMS = [
		{ n: 1, en: "Database name", zh: "資料庫名稱" },
		{ n: 2, en: "Multi-database searching", zh: "同一平台一次查多個資料庫", hint: "例如 EBSCOhost 一次查 CINAHL 和 MEDLINE" },
		{ n: 3, en: "Study registries", zh: "試驗登錄", hint: "查了哪些試驗登錄平台，例如 ClinicalTrials.gov、WHO ICTRP；沒查也寫" },
		{ n: 4, en: "Online resources and browsing", zh: "網站與瀏覽", hint: "瀏覽或搜尋了哪些網站、指引資料庫" },
		{ n: 5, en: "Citation searching", zh: "引文追蹤", hint: "查了哪些文獻的參考文獻或被引用文獻" },
		{ n: 6, en: "Contacts", zh: "聯絡作者或專家", hint: "有沒有聯絡作者或專家要資料" },
		{ n: 7, en: "Other methods", zh: "其他方法", hint: "其他找文獻的方法，例如手動翻閱期刊" },
		{ n: 8, en: "Full search strategies", zh: "完整檢索式", hint: "每個資料庫實際執行的完整檢索式" },
		{ n: 9, en: "Limits and restrictions", zh: "限制條件與理由", hint: "年份、語言、文章類型的限制和理由" },
		{ n: 10, en: "Search filters", zh: "檢索篩選器", hint: "有沒有用現成的檢索篩選器，例如 RCT filter，出處是什麼" },
		{ n: 11, en: "Prior work", zh: "沿用的既有檢索式", hint: "有沒有沿用或改寫別人發表過的檢索式，出處是什麼" },
		{ n: 12, en: "Updates", zh: "更新檢索", hint: "有沒有在後來重查一次，日期和方式" },
		{ n: 13, en: "Dates of searches", zh: "檢索日期", hint: "每個資料庫最後一次檢索的日期" },
		{ n: 14, en: "Peer review", zh: "檢索式同儕審查（PRESS）", hint: "請館員或指導教授用 PRESS 檢核表看過檢索式" },
		{ n: 15, en: "Total records", zh: "各資料庫筆數", hint: "每個資料庫查到的筆數" },
		{ n: 16, en: "Deduplication", zh: "去重方法", hint: "用什麼方法、軟體找重複，怎麼處理" },
	];

	function todoText(item) {
		return item.hint ? `${NOT_FILLED}（${item.hint}）` : NOT_FILLED;
	}

	/** A fenced code block whose fence is longer than any run of backticks inside. */
	function fence(body) {
		let longest = Math.max(2, ...(String(body).match(/`+/g) || []).map(s => s.length));
		let f = "`".repeat(longest + 1);
		return `${f}\n${body}\n${f}`;
	}

	// 「CINAHL（EBSCOhost）」; a platform that already names the database (PubMed（NCBI）) is left out
	function entryName(e) {
		return e.platform && !e.platform.includes(e.database) ? `${e.database}（${e.platform}）` : e.database;
	}

	function dedupeText(d) {
		let rule = d.rule.replace(/（ZotMax 找重複）$/, "");
		return `${d.date} 用 ZotMax 找重複（${rule}）：${d.groups} 組、標記 ${d.marked} 筆`
			+ (d.alreadyMarked ? `（之前已標記 ${d.alreadyMarked} 筆）` : "") + (d.cancelled ? "（這次沒有標記）" : "");
	}

	/**
	 * The PRISMA-S checklist draft: fills only what the log knows, everything else 「待填」 with a hint.
	 * meta: { name }. Returns { items: [{ n, en, zh, text, todo }], strategies: [{ name, platform, date, query }],
	 * body (the checklist and the strategies), markdown (title, lead, body), csv (UTF-8 BOM) }.
	 */
	function prismaS(entries, meta = {}) {
		let formal = sortEntries(formalEntries(entries));
		let dbs = databasesSearched(entries);
		let byMethod = m => formal.filter(e => e.method === m);
		let names = list => [...new Set(list.map(entryName).filter(Boolean))].join("、");
		let texts = {};
		let todo = {};
		let set = (n, value, isTodo) => {
			let item = PRISMA_S_ITEMS[n - 1];
			texts[n] = value || todoText(item);
			todo[n] = !value || !!isTodo;
		};
		set(1, names(byMethod("database")));
		set(2, "");
		set(3, names(byMethod("register")));
		set(4, names(byMethod("website")));
		set(5, names(byMethod("citation")));
		set(6, names(byMethod("contact")));
		set(7, names(byMethod("other")));
		let strategies = formal.map(e => ({ database: e.database, platform: e.platform, date: e.date, query: e.query }));
		set(8, strategies.length ? strategies.map(s => `${entryName(s)}（${s.date || NOT_FILLED}）：${s.query || NOT_FILLED}`).join("\n") : "",
			strategies.some(s => !s.query || !s.date));
		let limited = formal.filter(e => e.limits);
		// No limits in the log may mean none were used or none were written down: the user says which
		set(9, formal.length ? (limited.length ? limited.map(e => `${e.database}：${e.limits}；理由：${e.limitsReason || NOT_FILLED}`).join("\n") : `日誌沒有記限制條件；沒有限制也請寫明（${NOT_FILLED}）`) : "",
			!limited.length || limited.some(e => !e.limitsReason));
		set(10, "");
		set(11, "");
		let repeated = dbs.filter(d => d.dates.length >= 2);
		set(12, repeated.map(d => `${d.name}：${d.dates.join("、")}`).join("；"));
		set(13, dbs.length ? dbs.map(d => `${d.name}：${d.dates.length ? d.dates.join("、") : NOT_FILLED}`).join("；") : "", dbs.some(d => !d.dates.length));
		set(14, "");
		let total = sum(dbs.map(d => d.hits));
		set(15, dbs.length
			? dbs.map(d => `${d.name} ${d.hits === null ? NOT_FILLED : `${d.hits} 筆`}`).join("；")
				+ `；合計 ${total === null ? NOT_FILLED : `${total} 筆`}（去重前${dbs.some(d => d.hits === null) && total !== null ? "，不含待填" : ""}）`
			: "", dbs.some(d => d.hits === null));
		let dedupe = sortEntries(activeEntries(entries).filter(e => e.kind === "dedupe")).pop();
		set(16, dedupe ? `${dedupeText(dedupe)}；合併或刪除的方式：${NOT_FILLED}` : "", true);
		let items = PRISMA_S_ITEMS.map(i => ({ n: i.n, en: i.en, zh: i.zh, text: texts[i.n], todo: todo[i.n] }));
		let lines = items.map((i) => {
			let head = `- [${i.todo ? " " : "x"}] ${i.n}. ${i.zh}（${i.en}）：`;
			if (i.n === 8 && strategies.length) return `${head}見下方「完整檢索式」（${strategies.length} 筆）`;
			return head + i.text.split("\n").join("；");
		});
		let strategyMd = strategies.length
			? ["### 完整檢索式（第 8 項）", ...strategies.map(s => `**${entryName(s)}** · ${s.date || NOT_FILLED}\n\n${s.query ? fence(s.query) : NOT_FILLED}`)].join("\n\n")
			: "";
		let body = [lines.join("\n"), strategyMd].filter(Boolean).join("\n\n");
		let name = text(meta.name);
		let markdown = [
			`# PRISMA-S 檢索報告草稿${name ? `（${name}）` : ""}`,
			"這是草稿：只填了檢索日誌知道的事，其他標「待填」。正式附錄請自己核對。",
			body,
		].join("\n\n") + "\n";
		let csv = buildCSV(["項目", "PRISMA-S", "內容", "狀態"], items.map(i => [`${i.n}. ${i.zh}`, i.en, i.text, i.todo ? "待填" : "已填"]));
		return { items, strategies, body, markdown, csv };
	}

	// ---------- CSV (pure; the same cell rules as screening.buildCSV) ----------

	function csvCell(v) {
		let s = String(v === undefined || v === null ? "" : v);
		// A cell starting with = + - @ would run as a formula in Excel
		if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(?:\.\d+)?$/.test(s)) s = "'" + s;
		return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
	}

	/** CSV with a UTF-8 BOM and CRLF line ends, so Excel opens the Chinese text correctly. */
	function buildCSV(head, rows) {
		return "\ufeff" + [head, ...rows].map(l => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
	}

	/** The log as a CSV: every active entry (找重複 runs as 去重 rows). */
	function logCSV(entries) {
		let head = ["狀態", "方法", "資料庫", "平台", "日期", "檢索式", "限制條件", "限制理由", "命中", "匯入檔名", "匯入筆數", "備註", "來源"];
		let rows = sortEntries(activeEntries(entries)).map(e => (e.kind === "dedupe"
			? [STATUS_LABELS[e.status], "去重", "", "", e.date, "", "", "", "", "", "", `${dedupeText(e)}；比對 ${e.records} 筆`, "找重複"]
			: [STATUS_LABELS[e.status], METHOD_LABELS[e.method], e.database, e.platform, e.date, e.query, e.limits, e.limitsReason,
				e.hits === null ? "" : e.hits, e.importFile, e.imported === null ? "" : e.imported, e.notes, e.sourceTag]));
		return buildCSV(head, rows);
	}

	// ---------- the log note (pure) ----------

	/** The hidden data copy at the end of the managed block; `%` is written as \u0025 so `%%` can't appear inside. */
	function encodeData(obj) {
		return `${DATA_START}\n${JSON.stringify(obj).replace(/%/g, "\\u0025")}\n%%`;
	}

	/** The data copy of a note: { v, scope, entries } or null (no block, or a broken one). Never throws. */
	function decodeData(textValue) {
		try {
			let m = DATA_RE.exec(String(textValue || ""));
			if (!m) return null;
			let data = JSON.parse(m[1]);
			if (!data || typeof data !== "object" || !Array.isArray(data.entries)) return null;
			return { v: Number(data.v) || 1, scope: text(data.scope), entries: data.entries.map(normalizeEntry) };
		}
		catch (e) {
			return null;
		}
	}

	function numbersLine(e) {
		return [`命中 ${shown(e.hits)}`, e.imported !== null ? `匯入 ${e.imported}` : ""].filter(Boolean).join(" · ");
	}

	function entryBlock(e) {
		let head = [`**${e.date || NOT_FILLED}**`, e.platform || "", numbersLine(e), e.method !== "database" ? METHOD_LABELS[e.method] : ""].filter(Boolean).join(" · ");
		let lines = [];
		if (e.limits || e.limitsReason) lines.push(`限制條件：${e.limits || "（沒寫）"}；理由：${e.limitsReason || NOT_FILLED}`);
		if (e.sentQuery && e.sentQuery !== e.query) lines.push(`ZotMax 實際送出：\`${e.sentQuery.replace(/`/g, "'")}\``);
		if (e.importFile) lines.push(`匯入檔：${e.importFile}`);
		if (e.sourceTag && e.sourceTag !== e.database) lines.push(`來源標籤：${e.sourceTag}`);
		if (e.notes) lines.push(`備註：${e.notes.replace(/\r?\n+/g, " ")}`);
		return [head, e.query ? fence(e.query) : "（沒有記檢索式）", core.hardLines(lines).join("\n")].filter(Boolean).join("\n\n");
	}

	/**
	 * The managed part of the log note. meta: { name, layout, scope, generatedAt }. 正式檢索 by database, 探索 and
	 * 去重紀錄 folded, the PRISMA-S draft folded, and last the hidden data copy (every entry, tombstones included).
	 */
	function buildLogSection(entries, meta = {}) {
		let all = sortEntries((entries || []).map(normalizeEntry));
		let active = activeEntries(all);
		let formal = formalEntries(active);
		let explore = active.filter(e => e.kind === "search" && e.status === "exploratory");
		let dedupes = active.filter(e => e.kind === "dedupe");
		let groups = formalGroups(active);
		let board = meta.layout === "board";
		let date = String(meta.generatedAt || "").slice(0, 10);
		let how = "由 ZotMax 依你的檢索日誌產生；要修改請在 Zotero：ZotMax → 檢索日誌（目前分類）…，重新產生只會覆寫這個區塊。";
		let parts = [];
		if (board) {
			parts.push(core.metaFold(`🔎 檢索日誌 · ${meta.name || ""} · ${formal.length} 筆正式 · ${date} 更新`, [how]));
			parts.push(core.boardBlock("檢索日誌", [
				core.kpiCard("正式檢索", `${formal.length} 筆`, `${groups.length} 個資料庫或來源`),
				core.kpiCard("探索", `${explore.length} 筆`, "不進 PRISMA；要用請升為正式"),
				core.kpiCard("找重複", `${dedupes.length} 次`, dedupes.length ? `最近 ${dedupes[dedupes.length - 1].date}` : "還沒有紀錄"),
			]));
		}
		else {
			parts.push(`> [!info] ${how}`);
		}
		parts.push(`## 正式檢索（${formal.length} 筆）`);
		if (!formal.length) parts.push("（還沒有正式檢索。查到 0 筆也記，PRISMA-S 要報。）");
		for (let g of groups) parts.push(`### ${g.name}`, ...g.list.map(entryBlock));
		if (explore.length) {
			let rows = explore.map(e => `| ${[e.date, e.database, e.query.length > 80 ? e.query.slice(0, 79) + "…" : e.query, shown(e.hits), ORIGIN_LABELS[e.origin]].map(cellText).join(" | ")} |`);
			parts.push(core.foldBlock(`探索（${explore.length} 筆，不進 PRISMA）`, ["| 日期 | 資料庫 | 檢索式 | 命中 | 來源 |", "|---|---|---|---:|---|", ...rows].join("\n")));
		}
		if (dedupes.length) {
			let rows = dedupes.map(e => `| ${[e.date, e.rule, e.records, e.groups, e.marked, e.alreadyMarked, e.cancelled ? "取消" : ""].map(cellText).join(" | ")} |`);
			parts.push(core.foldBlock(`去重紀錄（${dedupes.length} 次）`, ["| 日期 | 規則 | 筆數 | 組數 | 這次標記 | 之前已標記 | 備註 |", "|---|---|---:|---:|---:|---:|---|", ...rows].join("\n")));
		}
		parts.push(core.foldBlock("PRISMA-S 草稿（只填檢索日誌知道的事，其他標「待填」）", prismaS(active, meta).body));
		parts.push(encodeData({ v: 1, scope: meta.scope || "", entries: all }));
		return parts.join("\n\n");
	}

	function frontmatterFor(entries, meta) {
		let active = activeEntries(entries);
		return {
			title: `${meta.name}${NOTE_SUFFIX}`,
			type: "search-log",
			zotero_collection: meta.scope || "",
			collection_path: meta.path || meta.name || "",
			zotero: meta.uri || "",
			log_formal: formalEntries(active).length,
			log_exploratory: active.filter(e => e.kind === "search" && e.status === "exploratory").length,
			last_generated: meta.generatedAt || "",
		};
	}

	const MARK_START_RE = /^%% zotero-bridge:start.*%%[ \t]*$/m;
	const MARK_END_RE = /^%% zotero-bridge:end %%[ \t]*$/m;

	/**
	 * The whole log note. With `existing`, only the plugin's frontmatter keys and the managed block change; the
	 * 「✍️ 我的筆記」 part and everything else the user wrote stay. No prisma_* key, ever.
	 */
	function buildLogNote(existing, entries, meta = {}) {
		let section = buildLogSection(entries, meta);
		let fm = frontmatterFor(entries, meta);
		let block = `${core.MARK_START}\n\n${section}\n\n${core.MARK_END}`;
		let mine = existing ? core.splitFrontmatter(existing).frontmatter : null;
		let classes = core.pageClasses(mine, meta.layout === "board" ? [core.NOTE_CLASS, core.REVIEW_CLASS] : []);
		fm.cssclasses = classes || (core.frontmatterList(mine, "cssclasses").length ? [] : "");
		if (!existing) {
			return core.buildFrontmatter(Object.assign({}, fm, { tags: ["檢索日誌"] }), null)
				+ `\n# ${fm.title}\n\n${block}\n\n## ${USER_HEADING}\n\n`;
		}
		let { frontmatter, body } = core.splitFrontmatter(existing);
		let f = frontmatter || "";
		for (let [key, value] of Object.entries(fm)) {
			if (value === "" || value === null || value === undefined) continue;
			f = core.setFrontmatterValue(f, key, value);
		}
		let start = MARK_START_RE.exec(body);
		let end = MARK_END_RE.exec(body);
		if (start && end && end.index > start.index) {
			body = body.slice(0, start.index) + block + body.slice(end.index + end[0].length);
		}
		else {
			// The markers were removed: put a fresh block after the first heading
			let h1 = /^# .*$/m.exec(body);
			let at = h1 ? h1.index + h1[0].length : 0;
			body = body.slice(0, at) + "\n\n" + block + "\n" + body.slice(at);
		}
		return `---\n${f}\n---\n` + (body.startsWith("\n") ? body : "\n" + body);
	}

	function scopeFileName(scopeKey) {
		return String(scopeKey || "library").replace(/[^\w.-]/g, "_") + ".json";
	}

	/** The log notes' folder: 檢索日誌 inside the reviews folder (30 評讀與綜整 organized, Reviews flat). */
	function logFolderParts(settings) {
		return [...core.vaultFolder(settings, "reviews"), LOG_FOLDER];
	}

	// ---------- entry points (pure) ----------

	/**
	 * Whether opening a search-links source offers 「📝 記一筆」: Chinese sources, sources without a search URL
	 * (copy-only), the user's own sources (`custom`), and the databases and grey literature ZotMax can't count.
	 */
	function shouldOfferLog(source) {
		if (!source || NO_OFFER_IDS.includes(source.id)) return false;
		return source.lang === "zh" || !source.url || source.custom === true || OFFER_IDS.includes(source.id);
	}

	/** 「記入檢索日誌」 after 測試檢索式: detail from pubmedWatch.testDetail or topicBot.testDetail. */
	function prefillFromTest(detail, opts = {}) {
		let d = detail || {};
		let now = opts.now || new Date();
		let at = new Date(now).toISOString();
		return normalizeEntry({
			id: newEntryID(now), kind: "search", status: "formal", method: "database",
			database: "PubMed", sourceTag: "PubMed", platform: "PubMed（NCBI）",
			query: d.query, sentQuery: d.sent, translation: d.translation, hits: d.count,
			date: localDate(now), limits: d.since ? `出版日期 ${d.since} 起` : "",
			origin: opts.origin === "bot-test" ? "bot-test" : "pubmed-test", createdAt: at, updatedAt: at,
		});
	}

	/** 「📝 記一筆」 after opening a search-links target ({ id, name, query }). */
	function prefillFromTarget(target, now) {
		let t = target || {};
		let at = new Date(now || Date.now()).toISOString();
		return normalizeEntry({
			id: newEntryID(now), kind: "search", status: "formal",
			// The PICO card's own guideline pages (pico-guideline-N) are websites too
			method: WEBSITE_IDS.includes(t.id) || /^pico-guideline-/.test(String(t.id)) ? "website" : REGISTER_IDS.includes(t.id) ? "register" : "database",
			database: t.name, sourceTag: canonicalSource(t.name), platform: PLATFORMS[t.id] || "",
			query: t.query, date: localDate(now), hits: null, origin: "link", createdAt: at, updatedAt: at,
		});
	}

	/** 「補記一筆」 for a batch tagged 來源/<tag>. */
	function prefillFromPending(p, now) {
		let b = p || {};
		let at = new Date(now || Date.now()).toISOString();
		let tag = text(b.tag);
		return normalizeEntry({
			id: newEntryID(now), kind: "search", status: "formal",
			method: tag === "引文追蹤" ? "citation" : tag === "網站" ? "website" : "database",
			database: tag, sourceTag: tag, imported: b.n, date: localDate(b.at || now), origin: "import", createdAt: at, updatedAt: at,
		});
	}

	/**
	 * A batch of records just tagged 來源/<tag> ({ tag, n, scopes, at }) into the pending list: it joins the pending
	 * batch with the same tag and first scope from the last 30 minutes (n summed), else is added; at most 20 kept.
	 */
	function foldPending(list, batch, now) {
		let out = (Array.isArray(list) ? list : []).filter(p => p && p.tag).map(p => Object.assign({}, p, { scopes: (p.scopes || []).slice() }));
		let b = batch || {};
		let tag = text(b.tag);
		let n = count(b.n) || 0;
		if (!tag || !n) return out;
		let at = new Date(b.at || now || Date.now()).toISOString();
		let scopes = (b.scopes || []).map(String);
		let near = p => Math.abs(new Date(at).getTime() - new Date(p.at).getTime()) <= PENDING_WINDOW_MS;
		let hit = out.find(p => p.tag === tag && (p.scopes[0] || "") === (scopes[0] || "") && near(p));
		if (hit) {
			hit.n += n;
			hit.at = at > hit.at ? at : hit.at;
			for (let s of scopes) if (!hit.scopes.includes(s)) hit.scopes.push(s);
		}
		else {
			out.push({ id: "p" + new Date(at).getTime().toString(36) + Math.floor(Math.random() * 1296).toString(36), tag, n, scopes, at });
		}
		out.sort((x, y) => String(x.at).localeCompare(String(y.at)));
		return out.slice(-MAX_PENDING);
	}

	function dismissPending(list, id) {
		return (Array.isArray(list) ? list : []).filter(p => p && p.id !== id);
	}

	// ---------- Zotero ----------

	// Test hooks: now, dataDir, form (replaces the entry dialog), confirm, copy
	let runtime = {
		now: () => new Date(),
		dataDir: null,
		form: null,
		confirm: null,
		copy: null,
	};

	function ZB() {
		return scope.ZB;
	}

	function pref(key) {
		return Zotero.Prefs.get(PREF + key, true);
	}

	// Feature switches (features.js): checked live; always on when this file runs without them (Node tests)
	function featureOn() {
		let f = ZB() && ZB().features;
		return !f || f.isEnabled(FEATURE);
	}

	function featureOff() {
		ZB().main.notifyFeatureOff(FEATURE);
		return null;
	}

	function notify(textValue) {
		ZB().main.notify(TITLE, textValue);
	}

	function sourcePrefix() {
		try {
			return ZB().screening.config().sourcePrefix;
		}
		catch (e) {
			return DEFAULT_SOURCE_PREFIX;
		}
	}

	/** The research project of a collection (or the library): the same keys as pico.js scopeOf. */
	function scopeOf(collection) {
		let A = ZB().adapter;
		if (collection && collection.key) {
			let lib = A.libraryInfo(collection.libraryID);
			let path = collection.name;
			try {
				path = A.collectionPath(collection) || collection.name;
			}
			catch (e) {}
			return {
				key: `${lib.path}/collections/${collection.key}`, name: collection.name || "分類", path, collection, libraryID: collection.libraryID,
				uri: `zotero://select/${lib.path}/collections/${collection.key}`, fileKey: collection.key,
			};
		}
		let libraryID = (collection && collection.libraryID) || Zotero.Libraries.userLibraryID;
		let lib = A.libraryInfo(libraryID);
		let name = lib.path === "library" ? "我的文獻庫" : lib.name;
		return { key: lib.path, name, path: name, collection: null, libraryID, uri: `zotero://select/${lib.path}`, fileKey: lib.path.replace(/[^\w-]/g, "_") };
	}

	function dataDir() {
		if (runtime.dataDir) return runtime.dataDir;
		try {
			let base = Zotero.DataDirectory && Zotero.DataDirectory.dir;
			return base ? PathUtils.join(base, "zotero-bridge", "search-log") : null;
		}
		catch (e) {
			return null;
		}
	}

	async function readSettings() {
		try {
			return await ZB().main.readSettings();
		}
		catch (e) {
			return null;
		}
	}

	/** The log note of a scope: <name>.md, or <name> (<KEY>).md when the first belongs to another collection. */
	async function noteTarget(settings, sc) {
		let dirParts = logFolderParts(settings);
		let dir = PathUtils.join(settings.vaultPath, ...dirParts);
		let base = core.sanitizeFilename(sc.name);
		let target = null;
		for (let name of [base, `${base} (${sc.fileKey})`]) {
			let path = PathUtils.join(dir, name + ".md");
			let existing = (await IOUtils.exists(path)) ? await IOUtils.readUTF8(path) : null;
			let owner = existing === null ? "" : core.frontmatterScalar(core.splitFrontmatter(existing).frontmatter || "", "zotero_collection");
			// The second name has the key in it, so it is this scope's either way
			target = { dir, dirParts, name, path, existing, rel: [...dirParts, name].join("/") };
			// An empty note (Obsidian makes one when the 📝 檢索日誌 link is clicked first) is taken over
			if (existing === null || owner === sc.key || !existing.trim()) break;
		}
		return target;
	}

	async function readJSON(file) {
		try {
			if (!file || !(await IOUtils.exists(file))) return [];
			let data = JSON.parse(await IOUtils.readUTF8(file));
			return Array.isArray(data && data.entries) ? data.entries : [];
		}
		catch (e) {
			Zotero.logError(e);
			return [];
		}
	}

	/**
	 * A collection's log: { scope, entries (tombstones included), file, note: { path, rel, existing, … } | null, settings }.
	 * The JSON and the vault note's data copy are merged by entry id.
	 */
	async function read(collection) {
		let sc = scopeOf(collection);
		let dir = dataDir();
		let file = dir ? PathUtils.join(dir, scopeFileName(sc.key)) : null;
		let json = await readJSON(file);
		let settings = await readSettings();
		let note = null;
		let fromNote = [];
		if (settings && settings.vaultPath) {
			try {
				note = await noteTarget(settings, sc);
				let data = note.existing ? decodeData(note.existing) : null;
				if (data && (!data.scope || data.scope === sc.key)) fromNote = data.entries;
			}
			catch (e) {
				Zotero.logError(e);
				note = null;
			}
		}
		return { scope: sc, entries: mergeEntries(json, fromNote), file, note, settings };
	}

	let vaultWarned = false;

	/** Write a read log back: the JSON first (always), then the vault note when its text changed. */
	async function writeNow(log, entries) {
		let sc = log.scope;
		entries = sortEntries(entries.map(normalizeEntry));
		let dir = dataDir();
		if (!dir) throw new Error("找不到 Zotero 資料夾，無法儲存檢索日誌");
		await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
		await IOUtils.writeUTF8(log.file, JSON.stringify({ v: 1, scope: sc.key, name: sc.name, entries }, null, "\t"));
		if (log.note) {
			try {
				let meta = { name: sc.name, path: sc.path, scope: sc.key, uri: sc.uri, layout: core.layoutPref(), generatedAt: runtime.now().toISOString() };
				let next = buildLogNote(log.note.existing, entries, meta);
				if (next !== log.note.existing) {
					await IOUtils.makeDirectory(log.note.dir, { createAncestors: true, ignoreExisting: true });
					await IOUtils.writeUTF8(log.note.path, next);
					log.note.existing = next;
				}
			}
			catch (e) {
				Zotero.logError(e);
				if (!vaultWarned) {
					vaultWarned = true;
					notify(`檢索日誌已存進 Zotero 資料夾，但寫入 Obsidian 筆記失敗：${e.message || e}`);
				}
			}
		}
		log.entries = entries;
		return log;
	}

	// Read → change → write of one scope runs one at a time
	let queues = new Map();

	function mutate(collection, change) {
		let key = scopeOf(collection).key;
		let prev = queues.get(key) || Promise.resolve();
		let next = prev.catch(() => {}).then(async () => {
			let log = await read(collection);
			let out = change(log.entries);
			if (out.entries) await writeNow(log, out.entries);
			return out.result;
		});
		queues.set(key, next);
		next.finally(() => {
			if (queues.get(key) === next) queues.delete(key);
		}).catch(() => {});
		return next;
	}

	function stamp(fields) {
		let at = runtime.now().toISOString();
		return Object.assign({ createdAt: at }, fields, { updatedAt: at });
	}

	/** Add an entry; returns it. */
	function append(collection, entry) {
		let e = normalizeEntry(stamp(entry));
		if (!e.date) e.date = localDate(runtime.now());
		return mutate(collection, list => ({ entries: [...list, e], result: e }));
	}

	/** Change an entry's fields; returns it (null when it's gone). */
	function update(collection, id, fields) {
		return mutate(collection, (list) => {
			let old = list.find(e => e.id === id && !e.deleted);
			if (!old) return { result: null };
			let e = normalizeEntry(Object.assign({}, old, fields, { id, kind: old.kind, createdAt: old.createdAt, updatedAt: runtime.now().toISOString() }));
			return { entries: list.map(x => (x === old ? e : x)), result: e };
		});
	}

	/** Delete an entry (a tombstone, so merging never brings it back); returns the tombstone. */
	function remove(collection, id) {
		return mutate(collection, (list) => {
			let old = list.find(e => e.id === id && !e.deleted);
			if (!old) return { result: null };
			let t = tombstone(old, runtime.now(), "user");
			return { entries: list.map(x => (x === old ? t : x)), result: t };
		});
	}

	/** 升為正式／改為探索. */
	function promote(collection, id, status) {
		return update(collection, id, { status: status === "exploratory" ? "exploratory" : "formal" });
	}

	/** An automatic run's exploratory draft (topic bot, PubMed watch). Never throws; null when off. */
	async function autoDraft(collection, draft) {
		try {
			// No data folder (outside Zotero): nowhere to keep it
			if (!featureOn() || pref("searchLog.autoDrafts") === false || !dataDir()) return null;
			let now = runtime.now();
			return await mutate(collection, list => ({ entries: upsertAutoDraft(list, draft, { now }), result: true }));
		}
		catch (e) {
			Zotero.logError(e);
			return null;
		}
	}

	/** A 找重複 run (screening.js). Never throws; null when off. */
	async function logDedupe(collection, info) {
		try {
			if (!featureOn() || !dataDir()) return null;
			let e = dedupeEntry(info, runtime.now());
			return await mutate(collection, list => ({ entries: [...list, e], result: e }));
		}
		catch (e) {
			Zotero.logError(e);
			return null;
		}
	}

	/**
	 * What the PRISMA note and the search health check read: { entries (active), formal, exploratory, dedupe
	 * (counts), databases (databasesSearched), link (the log note, vault-relative, no .md; "" without a vault),
	 * hasLog (any active search) }. null while the feature is off.
	 */
	async function summaryFor(collection) {
		if (!featureOn()) return null;
		let log = await read(collection);
		let active = activeEntries(log.entries);
		return {
			entries: active,
			formal: formalEntries(active).length,
			exploratory: active.filter(e => e.kind === "search" && e.status === "exploratory").length,
			dedupe: active.filter(e => e.kind === "dedupe").length,
			databases: databasesSearched(active),
			link: log.note ? log.note.rel : "",
			hasLog: active.some(e => e.kind === "search"),
		};
	}

	// ---------- the entry form ----------

	const HTML_NS = "http://www.w3.org/1999/xhtml";
	const DIALOG_STYLE = "width: min(680px, 94vw); max-height: 90vh; overflow: auto; padding: 16px 18px; border: 1px solid rgba(128,128,128,0.5); border-radius: 8px; background: Canvas; color: CanvasText; font: message-box;";

	function makeDialog(win) {
		let doc = win && win.document;
		let dialog = null;
		try {
			dialog = doc.createElementNS(HTML_NS, "dialog");
		}
		catch (e) {}
		if (!dialog || typeof dialog.showModal !== "function") return null;
		let el = (tag, style, value) => {
			let e = doc.createElementNS(HTML_NS, tag);
			if (style) e.setAttribute("style", style);
			if (value !== undefined) e.textContent = value;
			return e;
		};
		dialog.setAttribute("style", DIALOG_STYLE);
		return { doc, dialog, el };
	}

	function showDialog(d) {
		(d.doc.body || d.doc.documentElement).append(d.dialog);
		try {
			d.dialog.showModal();
		}
		catch (e) {
			Zotero.logError(e);
		}
		return !!d.dialog.open;
	}

	function mainWindowCollection() {
		try {
			let pane = Zotero.getActiveZoteroPane && Zotero.getActiveZoteroPane();
			return (pane && pane.getSelectedCollections && pane.getSelectedCollections()[0]) || null;
		}
		catch (e) {
			return null;
		}
	}

	/** The library's collections by path, for 記到哪個分類. */
	function collectionChoices(libraryID) {
		try {
			let A = ZB().adapter;
			return Zotero.Collections.getByLibrary(libraryID, true).filter(c => c && !c.deleted)
				.map(c => ({ collection: c, path: A.collectionPath(c) })).sort((a, b) => a.path.localeCompare(b.path));
		}
		catch (e) {
			return [];
		}
	}

	/** The 來源/ values already on a collection's records (the tag field's suggestions). */
	function sourceTagsIn(collection) {
		try {
			let prefix = sourcePrefix();
			let items = collection ? ZB().adapter.itemsInCollection(collection, true) : [];
			let tags = new Set();
			for (let item of items.slice(0, 3000)) {
				for (let t of item.getTags()) if (t.tag.startsWith(prefix)) tags.add(t.tag.slice(prefix.length).trim());
			}
			return [...tags].filter(Boolean).sort();
		}
		catch (e) {
			return [];
		}
	}

	/**
	 * The form for one entry, prefilled (everything prefilled is plain text the user can change; only 資料庫 and 日期
	 * are required). Resolves { entry, collection } or null. opts: { collection, edit (no 分類 choice) }.
	 */
	function entryForm(win, prefill, opts = {}) {
		let start = normalizeEntry(prefill);
		// opts.fixed: the caller's scope as given (the library's log window passes null for the library)
		let collection = opts.fixed || opts.collection ? opts.collection || null : mainWindowCollection();
		if (runtime.form) return Promise.resolve(runtime.form(start, Object.assign({}, opts, { collection })));
		let d = makeDialog(win);
		if (!d) return Promise.resolve(formWithPrompt(win, start, collection));
		let { doc, dialog, el } = d;
		return new Promise((resolve) => {
			let ok = false;
			// The field's title (and hint) also names its control for screen readers
			let label = (t, hint, control) => {
				let box = el("div", "margin-top: 8px;");
				box.append(el("div", "font-weight: 600;", t));
				if (hint) box.append(el("div", "opacity: 0.75; font-size: 0.92em; margin: 1px 0 3px;", hint));
				if (control) control.setAttribute("aria-label", hint ? `${t}（${hint}）` : t);
				return box;
			};
			let input = (value, type = "text") => {
				let i = el("input", "width: 100%; box-sizing: border-box; font: inherit;");
				i.setAttribute("type", type);
				i.value = value === null || value === undefined ? "" : String(value);
				return i;
			};
			let area = (value, rows) => {
				let a = el("textarea", "width: 100%; box-sizing: border-box; font: inherit; resize: vertical;");
				a.setAttribute("rows", String(rows));
				a.value = value || "";
				return a;
			};
			let select = (pairs, value) => {
				let s = el("select", "font: inherit;");
				for (let [v, t] of pairs) {
					let o = el("option", "", t);
					o.setAttribute("value", v);
					s.append(o);
				}
				s.value = value;
				return s;
			};
			let listID = `zb-log-tags-${Date.now().toString(36)}`;
			let heading = el("div", "font-size: 1.15em; font-weight: 600;", opts.edit ? "編輯檢索紀錄" : "記一筆檢索");
			heading.setAttribute("id", `${listID}-title`);
			dialog.setAttribute("aria-labelledby", heading.getAttribute("id"));
			dialog.append(heading);
			dialog.append(el("div", "opacity: 0.8; margin: 4px 0 4px;", "記下這次檢索，PRISMA-S 要報。查到 0 筆也記。預填的內容只是 ZotMax 知道的事實，都可以改。"));
			let libraryID = (collection && collection.libraryID) || Zotero.Libraries.userLibraryID;
			let choices = collectionChoices(libraryID);
			let where = null;
			if (!opts.edit) {
				let at = collection ? choices.findIndex(c => c.collection.key === collection.key && c.collection.libraryID === collection.libraryID) : -1;
				where = select([["", "我的文獻庫（整個文獻庫）"], ...choices.map((c, i) => [String(i + 1), c.path])], at >= 0 ? String(at + 1) : "");
				dialog.append(label("記到哪個分類", "", where), where);
			}
			let statusRow = el("div", "display: flex; gap: 14px;");
			statusRow.setAttribute("role", "radiogroup");
			let radios = {};
			for (let s of STATUSES) {
				let row = el("label", "");
				let r = el("input");
				r.setAttribute("type", "radio");
				r.setAttribute("name", `zb-log-status-${listID}`);
				r.checked = start.status === s;
				radios[s] = r;
				row.append(r, doc.createTextNode(` ${STATUS_LABELS[s]}`));
				statusRow.append(row);
			}
			dialog.append(label("正式／探索", "正式：會進 PRISMA 對帳和 PRISMA-S；探索：試查或追蹤，只留紀錄", statusRow), statusRow);
			let method = select(METHODS.map(m => [m, METHOD_LABELS[m]]), start.method);
			dialog.append(label("方法", "", method), method);
			let database = input(start.database);
			dialog.append(label("資料庫", "", database), database);
			let platform = input(start.platform);
			dialog.append(label("平台／介面", "例如 EBSCOhost、Ovid、PubMed（NCBI）", platform), platform);
			let tag = input(start.sourceTag);
			let list = el("datalist");
			list.setAttribute("id", listID);
			tag.setAttribute("list", listID);
			let fillTags = (c) => {
				list.replaceChildren();
				for (let t of sourceTagsIn(c)) {
					let o = el("option");
					o.setAttribute("value", t);
					list.append(o);
				}
			};
			fillTags(collection);
			dialog.append(label("來源標籤", `匯入的文獻用哪個「${sourcePrefix()}」標籤，對帳靠它`, tag), tag, list);
			let date = input(start.date || localDate(runtime.now()), "date");
			dialog.append(label("日期", "", date), date);
			let query = area(start.query, 4);
			dialog.append(label("完整檢索式", "照你在資料庫實際執行的貼上", query), query);
			if (start.translation) {
				let tr = area(start.translation, 3);
				tr.readOnly = true;
				dialog.append(label("PubMed 的解讀", "", tr), tr);
			}
			let limits = input(start.limits);
			dialog.append(label("限制條件", "年份、語言、文章類型…；沒有就留空", limits), limits);
			let reason = input(start.limitsReason);
			dialog.append(label("限制的理由", "", reason), reason);
			let hits = input(start.hits === null ? "" : start.hits);
			dialog.append(label("命中筆數", "查到 0 筆也記", hits), hits);
			let file = input(start.importFile);
			dialog.append(label("匯入檔名", "", file), file);
			let imported = input(start.imported === null ? "" : start.imported);
			dialog.append(label("匯入筆數", "", imported), imported);
			let notes = area(start.notes, 2);
			dialog.append(label("備註", "", notes), notes);
			let error = el("div", "color: #b00020; margin-top: 8px;");
			error.setAttribute("role", "alert");
			let buttons = el("div", "display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;");
			let cancel = el("button", "", "取消");
			cancel.setAttribute("type", "button");
			cancel.addEventListener("click", () => dialog.close("cancel"));
			let save = el("button", "font-weight: 600;", "記下");
			save.setAttribute("type", "button");
			save.addEventListener("click", () => {
				if (!database.value.trim() || !date.value.trim()) {
					error.textContent = "請填資料庫和日期。";
					return;
				}
				// A number the form can't read is said, never saved as 待填
				let bad = [["命中筆數", hits], ["匯入筆數", imported]].find(([, i]) => i.value.trim() && count(i.value) === null);
				if (bad) {
					error.textContent = `${bad[0]}請填數字（查到 0 筆就填 0）。`;
					return;
				}
				ok = true;
				dialog.close("ok");
			});
			buttons.append(cancel, save);
			dialog.append(error, buttons);
			if (where) {
				where.addEventListener("change", () => {
					let c = where.value ? choices[Number(where.value) - 1] : null;
					fillTags(c ? c.collection : null);
				});
			}
			dialog.addEventListener("close", () => {
				let result = null;
				if (ok) {
					let chosen = where ? (where.value ? choices[Number(where.value) - 1].collection : null) : collection;
					result = {
						collection: chosen,
						entry: normalizeEntry(Object.assign({}, start, {
							status: radios.exploratory.checked ? "exploratory" : "formal",
							method: method.value, database: database.value, platform: platform.value,
							sourceTag: tag.value.trim() || database.value, date: date.value, query: query.value,
							limits: limits.value, limitsReason: reason.value, hits: hits.value, importFile: file.value,
							imported: imported.value, notes: notes.value,
						})),
					};
				}
				dialog.remove();
				resolve(result);
			}, { once: true });
			if (!showDialog(d)) {
				dialog.remove();
				resolve(formWithPrompt(win, start, collection));
			}
		});
	}

	// Without a <dialog>: three questions
	function formWithPrompt(win, start, collection) {
		let ask = (q, v) => {
			let box = { value: v === null || v === undefined ? "" : String(v) };
			return Services.prompt.prompt(win, TITLE, q, box, null, {}) ? box.value : null;
		};
		let database = ask("資料庫：", start.database);
		if (database === null || !database.trim()) return null;
		let query = ask(`${database.trim()} 的完整檢索式：`, start.query);
		if (query === null) return null;
		let hits = ask("命中筆數（查到 0 筆也記）：", start.hits);
		while (hits !== null && hits.trim() && count(hits) === null) hits = ask("命中筆數請填數字（查到 0 筆就填 0）：", hits);
		if (hits === null) return null;
		return { collection, entry: normalizeEntry(Object.assign({}, start, { database, sourceTag: start.sourceTag || database, query, hits })) };
	}

	/** The form, then the log: resolves the saved entry or null. Never throws. */
	async function addEntry(win, prefill, opts = {}) {
		if (!featureOn()) return featureOff();
		try {
			let answer = await entryForm(win, prefill, opts);
			if (!answer || !answer.entry) return null;
			let e = await append(answer.collection, answer.entry);
			if (!opts.quiet) notify(`已記到「${scopeOf(answer.collection).name}」的檢索日誌：${e.database}${e.hits !== null ? ` ${e.hits} 筆` : ""}（${STATUS_LABELS[e.status]}）。`);
			return e;
		}
		catch (e) {
			Zotero.logError(e);
			notify(`沒有記下：${e.message || e}`);
			return null;
		}
	}

	/** 「記入檢索日誌」 after 測試檢索式. opts: { origin: "pubmed-test" | "bot-test", collection }. */
	function addFromTest(win, detail, opts = {}) {
		return addEntry(win, prefillFromTest(detail, { origin: opts.origin, now: runtime.now() }), opts);
	}

	/** 「📝 記一筆」 after opening a search-links target. */
	function addFromTarget(win, target, opts = {}) {
		return addEntry(win, prefillFromTarget(target, runtime.now()), opts);
	}

	/** Whether a surface shows 「📝 記一筆」 after opening `source` (search-links.js, pico.js). */
	function offerAfterOpen(source) {
		try {
			return featureOn() && pref("searchLog.offerAfterOpen") !== false && shouldOfferLog(source);
		}
		catch (e) {
			return false;
		}
	}

	// ---------- pending batches (「補記一筆」) ----------

	function readPending() {
		try {
			let list = JSON.parse(pref("searchLog.pending") || "[]");
			return Array.isArray(list) ? list : [];
		}
		catch (e) {
			return [];
		}
	}

	function writePending(list) {
		Zotero.Prefs.set(PREF + "searchLog.pending", JSON.stringify(list), true);
	}

	function pendingFor(sc) {
		// The library's window lists every batch
		return readPending().filter(p => sc.collection === null || (p.scopes || []).includes(sc.key));
	}

	let observerID = null;
	let collected = new Map();
	let flushTimer = null;

	/** The scope keys of an item's collections and their parents (a review collection holds its sub-collections). */
	function itemScopes(item) {
		let A = ZB().adapter;
		let keys = [];
		for (let id of item.getCollections ? item.getCollections() : []) {
			let c = Zotero.Collections.get(id);
			for (let depth = 0; c && depth < 10; depth++) {
				keys.push(`${A.libraryInfo(c.libraryID).path}/collections/${c.key}`);
				c = c.parentID ? Zotero.Collections.get(c.parentID) : null;
			}
		}
		return keys;
	}

	/** The batches collected in the last few seconds into the pending list. */
	function flushBatches() {
		flushTimer = null;
		let byTag = collected;
		collected = new Map();
		if (!featureOn()) return;
		let list = readPending();
		let now = runtime.now();
		for (let [tag, ids] of byTag) {
			let counts = new Map();
			let libraryKey = "";
			for (let id of ids) {
				try {
					let item = Zotero.Items.get(id);
					if (!item) continue;
					libraryKey = libraryKey || ZB().adapter.libraryInfo(item.libraryID).path;
					for (let k of new Set(itemScopes(item))) counts.set(k, (counts.get(k) || 0) + 1);
				}
				catch (e) {
					Zotero.logError(e);
				}
			}
			let scopes = [...counts].sort((a, b) => b[1] - a[1]).map(([k]) => k);
			if (!scopes.length) scopes = [libraryKey || "library"];
			list = foldPending(list, { tag, n: ids.size, scopes, at: now.toISOString() }, now);
		}
		writePending(list);
	}

	/** item-tag notifications: 來源/ tags added, gathered for a few seconds into one batch per tag. */
	function onTagEvent(event, type, ids, extraData) {
		try {
			if (event !== "add" || type !== "item-tag" || !featureOn()) return;
			let prefix = sourcePrefix();
			for (let id of ids || []) {
				let extra = (extraData && extraData[id]) || {};
				let [itemID, tagID] = String(id).split("-").map(Number);
				let name = extra.tag || (tagID && Zotero.Tags.getName ? Zotero.Tags.getName(tagID) : "");
				if (!name || !String(name).startsWith(prefix)) continue;
				let value = String(name).slice(prefix.length).trim();
				if (!value || !itemID) continue;
				if (!collected.has(value)) collected.set(value, new Set());
				collected.get(value).add(itemID);
			}
			if (collected.size && !flushTimer) flushTimer = setTimeout(flushBatches, BATCH_DELAY_MS);
		}
		catch (e) {
			Zotero.logError(e);
		}
	}

	function init() {
		if (observerID) return;
		try {
			observerID = Zotero.Notifier.registerObserver({ notify: onTagEvent }, ["item-tag"], "zotero-bridge-search-log");
		}
		catch (e) {
			Zotero.logError(e);
		}
	}

	function shutdown() {
		if (observerID) {
			try {
				Zotero.Notifier.unregisterObserver(observerID);
			}
			catch (e) {}
		}
		observerID = null;
		if (flushTimer) clearTimeout(flushTimer);
		flushTimer = null;
		collected = new Map();
	}

	// ---------- the log window ----------

	function copyText(value) {
		if (runtime.copy) return runtime.copy(value);
		Zotero.Utilities.Internal.copyTextToClipboard(value);
		return true;
	}

	function confirmText(win, message) {
		if (runtime.confirm) return runtime.confirm(message);
		return Services.prompt.confirm(win, TITLE, message);
	}

	/**
	 * Write the PRISMA-S draft (Markdown and CSV) and the log's CSV: into the log folder with a vault, else where the
	 * PICO 表 goes (its folder setting, else Downloads); the Markdown is also copied. opts.csvOnly: only the log CSV.
	 */
	async function exportPrismaS(collection, opts = {}) {
		if (!featureOn()) return featureOff();
		let headline = opts.csvOnly ? "ZotMax：匯出檢索日誌 CSV" : "ZotMax：匯出 PRISMA-S 草稿";
		try {
			let log = await read(collection);
			let sc = log.scope;
			let settings = log.settings || {};
			let dir;
			if (settings.vaultPath) dir = PathUtils.join(settings.vaultPath, ...logFolderParts(settings));
			else dir = (await ZB().pico.destination(settings)).folder;
			await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
			let base = core.sanitizeFilename(sc.name);
			let files = [];
			let write = async (name, value) => {
				await IOUtils.writeUTF8(PathUtils.join(dir, name), value);
				files.push(name);
			};
			let draft = prismaS(log.entries, { name: sc.name });
			if (!opts.csvOnly) {
				await write(`${base} PRISMA-S 草稿.md`, draft.markdown);
				await write(`${base} PRISMA-S 草稿.csv`, draft.csv);
			}
			await write(`${base}${NOTE_SUFFIX}.csv`, logCSV(log.entries));
			let copied = false;
			if (!opts.csvOnly) {
				try {
					copyText(draft.markdown);
					copied = true;
				}
				catch (e) {
					Zotero.logError(e);
				}
			}
			let pw = new Zotero.ProgressWindow({ closeOnClick: true });
			pw.changeHeadline(headline);
			pw.show();
			let line = new pw.ItemProgress("note", `已存到 ${dir}`);
			line.setProgress(100);
			pw.addDescription(files.join("、"));
			if (!opts.csvOnly) pw.addDescription(`${copied ? "Markdown 已複製。" : ""}這是草稿：「待填」的項目要自己補，正式附錄請核對。`);
			pw.startCloseTimer(10000);
			return { dir, files, todo: draft.items.filter(i => i.todo).length };
		}
		catch (e) {
			Zotero.logError(e);
			ZB().main.notify(headline, `匯出失敗：${e.message || e}`);
			return null;
		}
	}

	function entryLine(e) {
		if (e.kind === "dedupe") return dedupeText(e);
		return [e.date || NOT_FILLED, e.database || "（沒有資料庫）", `命中 ${shown(e.hits)}`, `匯入 ${shown(e.imported)}`,
			e.method !== "database" ? METHOD_LABELS[e.method] : ""].filter(Boolean).join(" · ");
	}

	/**
	 * The command 「檢索日誌（目前分類）…」: the log of the collection (or the library) — 記一筆, the exports, the
	 * Obsidian note, the batches waiting for 「補記一筆」, and the 正式, 探索 and 去重 lists with 編輯、升為正式／改為探索
	 * and 刪除. It never changes Zotero items. Resolves when the window closes.
	 */
	async function open(collection) {
		if (!featureOn()) return featureOff();
		let win = Zotero.getMainWindow();
		let sc = scopeOf(collection);
		let d = makeDialog(win);
		if (!d) {
			// No <dialog>: just the form
			return addEntry(win, { status: "formal", origin: "manual" }, { collection, fixed: true });
		}
		let { doc, dialog, el } = d;
		// name: the accessible name when the label alone repeats on every row (編輯：2026-10-01 · 華藝)
		let button = (label, onClick, bold, name) => {
			let b = el("button", bold ? "font-weight: 600;" : "", label);
			b.setAttribute("type", "button");
			if (name) b.setAttribute("aria-label", name);
			b.addEventListener("click", () => {
				Promise.resolve(onClick()).catch(e => Zotero.logError(e));
			});
			return b;
		};
		let body = el("div");
		let render = async () => {
			let log = await read(collection);
			let active = activeEntries(log.entries);
			let formal = active.filter(e => e.kind === "search" && e.status === "formal");
			let explore = active.filter(e => e.kind === "search" && e.status === "exploratory");
			let dedupes = active.filter(e => e.kind === "dedupe");
			body.replaceChildren();
			let tools = el("div", "display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0;");
			tools.append(
				button("記一筆…", async () => {
					if (await addEntry(win, { status: "formal", origin: "manual" }, { collection, fixed: true })) await render();
				}, true),
				button("匯出 PRISMA-S 草稿", () => exportPrismaS(collection)),
				button("匯出 CSV", () => exportPrismaS(collection, { csvOnly: true })),
			);
			if (log.note && log.settings && log.settings.vaultName) {
				tools.append(button("開啟 Obsidian 筆記", () => {
					if (log.note.existing === null) {
						notify("Obsidian 筆記在記下第一筆之後才會建立。");
						return;
					}
					Zotero.launchURL(core.obsidianURI(log.settings.vaultName, log.note.rel));
				}));
			}
			body.append(tools);
			let pending = pendingFor(sc);
			// The library's window lists every batch: 補記一筆 defaults to the batch's own collection
			let batchCollection = (p) => {
				if (collection) return collection;
				let m = /^(.*)\/collections\/([^/]+)$/.exec(String((p.scopes || [])[0] || ""));
				try {
					return (m && m[1] === sc.key && Zotero.Collections.getByLibraryAndKey(sc.libraryID, m[2])) || null;
				}
				catch (e) {
					return null;
				}
			};
			if (pending.length) {
				let box = el("div", "border: 1px solid rgba(128,128,128,0.35); border-radius: 6px; padding: 4px 8px; margin: 6px 0;");
				for (let p of pending) {
					let row = el("div", "display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; margin: 3px 0;");
					row.append(el("span", "", `最近有 ${p.n} 筆加上「${sourcePrefix()}${p.tag}」，還沒記到日誌：`),
						button("補記一筆", async () => {
							if (await addEntry(win, prefillFromPending(p, runtime.now()), { collection: batchCollection(p), fixed: true })) {
								writePending(dismissPending(readPending(), p.id));
								await render();
							}
						}, false, `補記一筆：${sourcePrefix()}${p.tag}`),
						button("略過", async () => {
							writePending(dismissPending(readPending(), p.id));
							await render();
						}, false, `略過：${sourcePrefix()}${p.tag}`));
					box.append(row);
				}
				body.append(box);
			}
			let section = (title, list, empty) => {
				body.append(el("div", "font-weight: 600; margin-top: 12px;", `${title}（${list.length}）`));
				if (!list.length) {
					body.append(el("div", "opacity: 0.75;", empty));
					return;
				}
				for (let e of list.slice().reverse()) {
					let row = el("div", "display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; margin: 3px 0;");
					let what = e.kind === "dedupe" ? `${e.date} · 找重複` : `${e.date || NOT_FILLED} · ${e.database || "（沒有資料庫）"}`;
					row.append(el("span", "flex: 1 1 260px;", entryLine(e)));
					if (e.kind === "search") {
						row.append(button("編輯", async () => {
							let answer = await entryForm(win, e, { collection, fixed: true, edit: true });
							if (answer && answer.entry) {
								await update(collection, e.id, answer.entry);
								await render();
							}
						}, false, `編輯：${what}`));
						let other = e.status === "formal" ? "exploratory" : "formal";
						row.append(button(other === "formal" ? "升為正式" : "改為探索", async () => {
							await promote(collection, e.id, other);
							await render();
						}, false, `${other === "formal" ? "升為正式" : "改為探索"}：${what}`));
					}
					row.append(button("刪除", async () => {
						if (!confirmText(win, `要刪除這筆紀錄嗎？\n${entryLine(e)}`)) return;
						await remove(collection, e.id);
						await render();
					}, false, `刪除：${what}`));
					body.append(row);
				}
			};
			section("正式", formal, "還沒有正式檢索。每個資料庫查完記一筆，查到 0 筆也記。");
			section("探索", explore, "沒有探索紀錄。主題搜尋機器人和 PubMed 追蹤自動執行時會留草稿，要用的升為正式。");
			if (dedupes.length) section("去重紀錄", dedupes, "");
		};
		return new Promise((resolve) => {
			let heading = el("div", "font-size: 1.15em; font-weight: 600;", `檢索日誌：${sc.name}`);
			heading.setAttribute("id", `zb-log-window-${Date.now().toString(36)}`);
			dialog.setAttribute("aria-labelledby", heading.getAttribute("id"));
			dialog.append(heading);
			dialog.append(el("div", "opacity: 0.8; margin: 4px 0;", "記下在哪個資料庫、哪天、用什麼檢索式查到幾筆。正式的會進 PRISMA 對帳和 PRISMA-S 草稿；這個視窗不會改動 Zotero 的文獻。"));
			let close = el("div", "display: flex; justify-content: flex-end; margin-top: 14px;");
			close.append(button("關閉", () => dialog.close()));
			dialog.append(body, close);
			dialog.addEventListener("close", () => {
				dialog.remove();
				resolve({ closed: true });
			}, { once: true });
			render().catch((e) => {
				Zotero.logError(e);
				body.textContent = `讀不到檢索日誌：${e.message || e}`;
			});
			if (!showDialog(d)) {
				dialog.remove();
				resolve(addEntry(win, { status: "formal", origin: "manual" }, { collection, fixed: true }));
			}
		});
	}

	return {
		FEATURE, LOG_FOLDER, NOTE_SUFFIX, KINDS, STATUSES, STATUS_LABELS, METHODS, METHOD_LABELS, ORIGINS, AUTO_ORIGINS, DEDUPE_RULE,
		SOURCE_ALIASES, OFFER_IDS, PRISMA_S_ITEMS, MAX_PENDING, RECONCILE_TAIL,
		// pure
		newEntryID, localDate, normalizeEntry, tombstone, pruneTombstones, activeEntries, formalEntries, mergeEntries, upsertAutoDraft, dedupeEntry,
		sourceKey, sameSource, canonicalSource, databasesSearched, reconcile, reconcileSection, noLogLine, prismaS, logCSV,
		encodeData, decodeData, buildLogSection, buildLogNote, scopeFileName, logFolderParts, shouldOfferLog,
		prefillFromTest, prefillFromTarget, prefillFromPending, foldPending, dismissPending,
		// Zotero
		runtime, scopeOf, dataDir, read, append, update, remove, promote, autoDraft, logDedupe, summaryFor,
		entryForm, addEntry, addFromTest, addFromTarget, offerAfterOpen, readPending, flushBatches, exportPrismaS, open, init, shutdown,
	};
});
