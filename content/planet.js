/*
 * ZotMax — 星球與島嶼: a topic as a planet, its Zotero sub-collections as islands (pref dashboard.planet).
 *
 *   星球     a Zotero collection with at least two sub-collections that have literature notes (in them or below
 *            them). Its topic page (topics.js) gets 「🪐 星球」: one card per island with its 開發度, the
 *            unexplored seas and the harbor; a collection whose notes all sit in sub-collections gets a topic page
 *            for the whole planet.
 *   島       a direct sub-collection, with every note in it and below it. 開發度 = 已讀 40% ＋ 評讀已核對 30% ＋ 有 AI
 *            筆記 30% (of its papers): 🌱 荒島 <25, 🏕️ 開墾中 25–49, 🏘️ 聚落 50–74, 🏙️ 城鎮 ≥75. Its page links
 *            back to the planet (🪐 回到星球).
 *   群島地圖  "<name> 星球地圖.html" next to the planet's topic page: content/planet/planet.html with the planet's
 *            numbers filled in, a cartoon island map for a desktop browser. Houses are papers (taller = stronger
 *            evidence, the roof colour = reading status), bridges are concepts two islands share (the AI notes'
 *            interventions and outcomes, merged by the concept cards' aliases), dashed seas are empty
 *            intervention × outcome pairs, the harbor is the topic bot (topic-bot.js). The file only reads what
 *            the vault already has, is written to the user's own disk and is never uploaded.
 *   日誌     the island log: notes added, AI notes generated, topic-bot imports and island level-ups (kept in the
 *            pref planet.history: each island's last 開發度 and the level-ups of the last weeks).
 *
 * The functions down to "Zotero" are pure (Node tests); the rest needs Zotero.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(require("./core.js"), require("./dashboard.js"), globalThis);
	}
	else {
		(root.ZB = root.ZB || {}).planet = factory(root.ZB.core, root.ZB.dashboard, root);
	}
})(this, function (core, dashboard, scope) {
	const PREF = "extensions.zotero-bridge.";
	const MARK = "/*ZOTMAX_DATA*/null";
	const MAP_SUFFIX = " 星球地圖.html";
	const CANVAS_SUFFIX = " 星球.canvas";
	const STAGES = [[75, 4, "🏙️", "城鎮"], [50, 3, "🏘️", "聚落"], [25, 2, "🏕️", "開墾中"], [0, 1, "🌱", "荒島"]];
	const READ_STATUSES = ["已讀", "已引用"];
	const MAX_ISLANDS = 10;
	const MAX_BRIDGES = 8;
	const MAX_SEAS = 3;
	const MAX_GAPS = 3;
	const LOG_DAYS = 14;
	const MAX_LOG = 14;
	const HISTORY_EVENTS = 60;
	// points kept per island (a point only when its 開發度 changes)
	const SERIES_POINTS = 120;
	const TREND_POINTS = 12;
	const DAY_MS = 86400000;
	const FORMULA = "開發度 = 已讀 40% ＋ 評讀已核對 30% ＋ 有 AI 筆記 30%";

	const { wikilink, splitTerms, termKey, bestLevel, gapMap } = dashboard;

	// Test hooks: template() → the HTML, launch(path), now()
	const runtime = {};
	let rootURI = "";
	let chrome = false;

	// ---------- planets and islands (pure) ----------

	function cleanPath(c) {
		return String(c || "").split("/").map(s => s.trim()).filter(Boolean).join("/");
	}

	/**
	 * Every planet in the notes: [{ path, name, parent, direct (notes in the collection itself), islands: [{ path, name,
	 * records }] (most notes first, at most MAX_ISLANDS), hidden (islands left out), records (all, once each) }].
	 * opts.skip: collection names that are no topic of their own (文獻自動分類's 「自動分類」 folder): neither they
	 * nor anything below them is an island or a planet.
	 */
	function findPlanets(records, opts = {}) {
		let skip = new Set((opts.skip || []).map(n => String(n).trim().toLowerCase()).filter(Boolean));
		let skipped = p => p.split("/").some(seg => skip.has(seg.toLowerCase()));
		let live = (records || []).filter(r => !r.deleted);
		let paths = new Map();
		for (let r of live) {
			for (let c of new Set((r.collections || []).map(cleanPath).filter(Boolean))) {
				if (skipped(c)) continue;
				let list = paths.get(c) || [];
				list.push(r);
				paths.set(c, list);
			}
		}
		let candidates = new Set();
		for (let p of paths.keys()) {
			let parts = p.split("/");
			for (let k = 1; k < parts.length; k++) candidates.add(parts.slice(0, k).join("/"));
		}
		let out = [];
		for (let path of candidates) {
			let children = new Map();
			for (let [p, list] of paths) {
				if (!p.startsWith(path + "/")) continue;
				let child = path + "/" + p.slice(path.length + 1).split("/")[0];
				let set = children.get(child) || new Set();
				for (let r of list) set.add(r);
				children.set(child, set);
			}
			let direct = paths.get(path) || [];
			if (children.size < 2) continue;
			let islands = [...children].map(([p, set]) => ({ path: p, name: p.split("/").pop(), records: [...set] }))
				.sort((a, b) => b.records.length - a.records.length || a.name.localeCompare(b.name, "zh-Hant"));
			let all = new Set(direct);
			for (let is of islands) for (let r of is.records) all.add(r);
			let parts = path.split("/");
			out.push({
				path, name: parts[parts.length - 1], parent: parts.slice(0, -1).join("／"), direct,
				islands: islands.slice(0, MAX_ISLANDS), hidden: Math.max(0, islands.length - MAX_ISLANDS), records: [...all],
			});
		}
		return out.sort((a, b) => a.path.localeCompare(b.path, "zh-Hant"));
	}

	/** The planet whose island (or the planet itself) is this collection: the deepest one; null when none. */
	function planetOf(planets, path) {
		let p = cleanPath(path);
		return (planets || []).filter(pl => pl.path === p || p.startsWith(pl.path + "/"))
			.sort((a, b) => b.path.length - a.path.length)[0] || null;
	}

	/** The island of a planet a collection belongs to (the island itself or a collection inside it); null when none. */
	function islandOf(planet, path) {
		let p = cleanPath(path);
		return planet ? planet.islands.find(is => is.path === p || p.startsWith(is.path + "/")) || null : null;
	}

	function devOf(n) {
		if (!n.papers) return 0;
		return Math.round((40 * n.read + 30 * n.verified + 30 * n.ai) / n.papers);
	}

	/** [emoji, level, name] for a 開發度. */
	function stageOf(dev) {
		let s = STAGES.find(([min]) => dev >= min);
		return [s[2], s[1], s[3]];
	}

	function stageLabel(dev) {
		let [emoji, lv, name] = stageOf(dev);
		return `LV${lv} ${emoji} ${name}`;
	}

	/**
	 * What it takes to reach the next stage, fewest steps first (reading counts most): { to: [emoji, lv, name] | null,
	 * read, ai, verify, text }. text: 「再讀 2 篇、補 1 篇 AI 筆記 → 🏘️ 聚落」, or what to do at 🏙️ 城鎮.
	 */
	function levelHint(n) {
		let lv = stageOf(n.dev)[1];
		if (!n.papers) return { to: null, read: 0, ai: 0, verify: 0, text: "島上還沒有文獻" };
		if (lv === 4) return { to: null, read: 0, ai: 0, verify: 0, text: "已是 🏙️ 城鎮：接下來補這座島的缺口" };
		let next = STAGES.find(st => st[1] === lv + 1);
		// dev rounds: the sum has to reach (min − 0.5) × papers
		let gap = (next[0] - 0.5) * n.papers - (40 * n.read + 30 * n.verified + 30 * n.ai);
		let take = (left, room, worth) => {
			let k = Math.max(0, Math.min(room, Math.ceil(left / worth)));
			return [k, left - k * worth];
		};
		let [read, after] = take(gap, n.papers - n.read, 40);
		let [ai, rest] = take(after, n.papers - n.ai, 30);
		let [verify] = take(rest, n.papers - n.verified, 30);
		let parts = [read ? `再讀 ${read} 篇` : "", ai ? `補 ${ai} 篇 AI 筆記` : "", verify ? `核對 ${verify} 篇評讀` : ""].filter(Boolean);
		let to = [next[2], next[1], next[3]];
		return { to, read, ai, verify, text: `${parts.join("、")} → ${to[0]} ${to[2]}` };
	}

	/** An island's (or planet's) numbers: papers, read, reading, verified (appraisals), ai, dev, best (CEBM). */
	function numbers(records) {
		let n = {
			papers: records.length,
			read: records.filter(r => READ_STATUSES.includes(r.status)).length,
			reading: records.filter(r => r.status === "閱讀中").length,
			verified: records.filter(r => r.appraisalVerified).length,
			ai: records.filter(r => r.hasAI).length,
			best: bestLevel(records),
		};
		n.dev = devOf(n);
		return n;
	}

	/** One house per paper: the CEBM level (5 without one; 1 is the tallest) and the reading status. */
	function houses(records) {
		return records.map((r) => {
			let level = Number.parseInt(r.evidenceLevel, 10);
			return {
				level: level >= 1 && level <= 5 ? level : 5,
				status: READ_STATUSES.includes(r.status) ? "read" : r.status === "閱讀中" ? "reading" : "todo",
			};
		}).sort((a, b) => a.level - b.level || a.status.localeCompare(b.status));
	}

	/** Each island's terms (interventions and outcomes, by the aliases): Map key → { name, n }. */
	function islandTerms(records, aliases) {
		let terms = new Map();
		for (let r of records) {
			let seen = new Set();
			for (let raw of [...splitTerms(r.intervention), ...splitTerms(r.outcomes)]) {
				let k = termKey(raw);
				let g = aliases && aliases.get(k);
				let key = g ? g.key : k;
				if (seen.has(key)) continue;
				seen.add(key);
				let e = terms.get(key) || { name: g ? g.name : raw, n: 0 };
				e.n++;
				terms.set(key, e);
			}
		}
		return terms;
	}

	/**
	 * Bridges: for each pair of islands, the concept with the most papers on both sides; the pairs that share the most
	 * concepts first, at most MAX_BRIDGES. [{ a, b, label, shared }] (a and b are island ids).
	 */
	function bridgesOf(islands, aliases) {
		let terms = islands.map(is => islandTerms(is.records, aliases));
		let out = [];
		for (let i = 0; i < islands.length; i++) {
			for (let j = i + 1; j < islands.length; j++) {
				let shared = [...terms[i]].filter(([k]) => terms[j].has(k))
					.map(([k, e]) => ({ name: e.name, n: e.n + terms[j].get(k).n }))
					.sort((x, y) => y.n - x.n || x.name.localeCompare(y.name, "zh-Hant"));
				if (shared.length) out.push({ a: islands[i].id, b: islands[j].id, label: shared[0].name, shared: shared.length, n: shared[0].n });
			}
		}
		return out.sort((x, y) => y.shared - x.shared || y.n - x.n).slice(0, MAX_BRIDGES)
			.map(({ a, b, label, shared }) => ({ a, b, label, shared }));
	}

	/**
	 * Unexplored seas: intervention × outcome pairs among the planet's best-studied ones that no paper has, each
	 * next to the island whose papers study that intervention most. [{ near, text }]
	 */
	function seasOf(planetRecords, islands, aliases) {
		let map = gapMap(planetRecords, { aliases, maxRows: 4, maxCols: 4 });
		if (map.studied < 2) return [];
		let out = [];
		for (let r of map.rows) {
			for (let c of map.cols) {
				if (map.cell(r.key, c.key).length) continue;
				let near = null;
				let best = 0;
				for (let is of islands) {
					let t = islandTerms(is.records, aliases).get(r.key);
					if (t && t.n > best) {
						best = t.n;
						near = is.id;
					}
				}
				out.push({ near, text: `${r.name} × ${c.name}：0 篇` });
				if (out.length >= MAX_SEAS) return out;
			}
		}
		return out;
	}

	function pad2(n) {
		return String(n).padStart(2, "0");
	}

	function dateOf(s) {
		let t = Date.parse(String(s || ""));
		return Number.isFinite(t) ? new Date(t) : null;
	}

	function dayLabel(d, now) {
		let start = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
		let diff = Math.round((start(now) - start(d)) / DAY_MS);
		return diff === 0 ? "今天" : diff === 1 ? "昨天" : `${d.getMonth() + 1}/${d.getDate()}`;
	}

	/**
	 * The island log, newest first, grouped by day: notes added and AI notes generated (per island and day), the topic
	 * bot's imports and level-ups. events: { imports: [{ at, n }], levelUps: [{ at, island, from, to }] }.
	 * Returns [{ day } | { t, i, s }].
	 */
	function islandLog(planet, islands, events = {}, now = new Date()) {
		let since = now.getTime() - LOG_DAYS * DAY_MS;
		let nameOf = (r) => {
			let is = islands.find(i => i.records.includes(r));
			return is ? is.name : planet.name;
		};
		let groups = new Map();
		let add = (when, kind, island, n = 1) => {
			let d = dateOf(when);
			if (!d || d.getTime() < since || d.getTime() > now.getTime() + DAY_MS) return;
			let key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}\u0000${kind}\u0000${island}`;
			let g = groups.get(key) || { d, kind, island, n: 0 };
			g.n += n;
			if (d > g.d) g.d = d;
			groups.set(key, g);
		};
		for (let r of planet.records) {
			add(r.dateAdded, "added", nameOf(r));
			add(r.aiGenerated, "ai", nameOf(r));
		}
		for (let i of events.imports || []) add(i.at, "import", "", Number(i.n) || 0);
		let entries = [...groups.values()].map((g) => {
			if (g.kind === "added") return { d: g.d, i: "📥", s: `${g.n} 篇文獻加入${g.island}` };
			if (g.kind === "ai") return { d: g.d, i: "🤖", s: `產生 ${g.n} 篇 AI 文獻筆記（${g.island}）` };
			return { d: g.d, i: "⛵", s: `從搜尋機器人匯入 ${g.n} 篇` };
		});
		for (let q of events.quests || []) {
			let d = dateOf(q.at);
			if (d && d.getTime() >= since) entries.push({ d, i: "🎯", s: `完成任務：${questText(q)}（${q.island}）` });
		}
		for (let e of events.levelUps || []) {
			let d = dateOf(e.at);
			if (!d || d.getTime() < since) continue;
			let [fe, , fn] = stageOf(e.from);
			let [te, , tn] = stageOf(e.to);
			entries.push({ d, i: "🏗️", s: `${e.island}升級：${fe} ${fn} → ${te} ${tn}` });
		}
		entries.sort((a, b) => b.d - a.d);
		let out = [];
		let last = "";
		for (let e of entries.slice(0, MAX_LOG)) {
			let day = dayLabel(e.d, now);
			if (day !== last) out.push({ day });
			last = day;
			out.push({ t: `${pad2(e.d.getHours())}:${pad2(e.d.getMinutes())}`, i: e.i, s: e.s });
		}
		return out;
	}

	/**
	 * Level-ups since the last run: compares each island's stage with the saved history ({ islands: { path: dev },
	 * events: [] }). Returns the new history (events capped at HISTORY_EVENTS, older than LOG_DAYS dropped).
	 */
	function nextHistory(history, planet, islandNumbers, now = new Date()) {
		let h = history && typeof history === "object" ? history : {};
		let devs = Object.assign({}, h.islands && typeof h.islands === "object" ? h.islands : {});
		let events = (Array.isArray(h.events) ? h.events : []).filter(e => e && dateOf(e.at) && dateOf(e.at).getTime() >= now.getTime() - LOG_DAYS * DAY_MS);
		let series = Object.assign({}, h.series && typeof h.series === "object" ? h.series : {});
		let names = Object.assign({}, h.names && typeof h.names === "object" ? h.names : {});
		let day = localDay(now);
		for (let { island, n } of islandNumbers) {
			let prev = devs[island.path];
			if (Number.isFinite(prev) && stageOf(n.dev)[1] > stageOf(prev)[1]) {
				events.push({ at: now.toISOString(), planet: planet.path, island: island.name, from: prev, to: n.dev });
			}
			devs[island.path] = n.dev;
			// the island's 開發度 over time: a point when it changes (one a day), for the progress report and the map
			let pts = (Array.isArray(series[island.path]) ? series[island.path] : []).filter(validPoint);
			let last = pts[pts.length - 1];
			if (!last || last[1] !== n.dev) {
				if (last && last[0] === day) pts[pts.length - 1] = [day, n.dev];
				else pts.push([day, n.dev]);
			}
			series[island.path] = pts.slice(-SERIES_POINTS);
			names[island.path] = island.name;
		}
		return { islands: devs, events: events.slice(-HISTORY_EVENTS), series, names };
	}

	const validPoint = p => Array.isArray(p) && /^\d{4}-\d{2}-\d{2}$/.test(p[0]) && Number.isFinite(p[1]);

	function localDay(d) {
		return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
	}

	/**
	 * Each island's 開發度 from the start of a period (YYYY-MM-DD, the last value before it) to its end: { rows: [{ path,
	 * planet, name, from (null: new), to, delta, up (a stage gained) }] (stage gains first, then the biggest change),
	 * unchanged } — what the progress report shows.
	 */
	function islandProgress(history, start, end) {
		let h = history && typeof history === "object" ? history : {};
		let series = h.series && typeof h.series === "object" ? h.series : {};
		let names = h.names && typeof h.names === "object" ? h.names : {};
		let rows = [];
		let unchanged = 0;
		for (let [path, raw] of Object.entries(series)) {
			let pts = (Array.isArray(raw) ? raw : []).filter(validPoint).sort((a, b) => a[0].localeCompare(b[0]));
			let before = pts.filter(p => p[0] < start).pop();
			let atEnd = pts.filter(p => p[0] <= end).pop();
			if (!atEnd) continue;
			let from = before ? before[1] : null;
			let to = atEnd[1];
			if (from === to) {
				unchanged++;
				continue;
			}
			let parts = path.split("/");
			rows.push({
				path, planet: parts.slice(0, -1).join("/"), name: names[path] || parts[parts.length - 1], from, to,
				delta: to - (from === null ? 0 : from), up: from !== null && stageOf(to)[1] > stageOf(from)[1],
			});
		}
		rows.sort((a, b) => (b.up - a.up) || (b.delta - a.delta) || a.path.localeCompare(b.path, "zh-Hant"));
		return { rows, unchanged };
	}

	// ---------- 🎯 島嶼任務: a few concrete steps a week on the islands that need them most (pure) ----------

	const QUEST_VERBS = { read: "讀完", ai: "補 AI 筆記", verify: "核對評讀" };
	const MAX_QUESTS = 4;
	const QUESTS_PER_ISLAND = 3;
	const QUEST_LOG = 200;

	/** The Monday a week starts on (YYYY-MM-DD, local time). */
	function weekStart(now = new Date()) {
		let d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
		return localDay(d);
	}

	/** Whether a paper has done what a quest asks. */
	function questDone(kind, r) {
		if (!r) return false;
		if (kind === "read") return READ_STATUSES.includes(r.status);
		if (kind === "ai") return !!r.hasAI;
		return !!r.appraisalVerified;
	}

	/**
	 * This week's quests: the least developed islands first (not yet 🏙️ 城鎮), each with the steps levelHint names, as
	 * specific papers — the strongest evidence, then the newest, first; at most QUESTS_PER_ISLAND an island and
	 * MAX_QUESTS in all. A 核對評讀 quest only picks a paper whose appraisal is filled in. [{ kind, link, title, island }]
	 */
	function pickQuests(planet) {
		let level = r => {
			let n = Number.parseInt(r.evidenceLevel, 10);
			return n >= 1 && n <= 5 ? n : 6;
		};
		let byEvidence = (a, b) => level(a) - level(b) || String(b.year || "").localeCompare(String(a.year || "")) || String(a.title).localeCompare(String(b.title));
		let order = planet.islands.map(is => ({ is, n: numbers(is.records) }))
			.filter(x => x.n.papers && stageOf(x.n.dev)[1] < 4)
			.sort((a, b) => a.n.dev - b.n.dev || b.n.papers - a.n.papers);
		let items = [];
		for (let { is, n } of order) {
			let hint = levelHint(n);
			let mine = [];
			let take = (kind, count, pred) => {
				for (let r of is.records.filter(x => !x.deleted && pred(x)).sort(byEvidence).slice(0, count)) {
					if (mine.length < QUESTS_PER_ISLAND) mine.push({ kind, link: r.link, title: r.title, island: is.name });
				}
			};
			take("read", hint.read, r => !questDone("read", r));
			take("ai", hint.ai, r => !questDone("ai", r));
			take("verify", hint.verify, r => r.appraisal && !questDone("verify", r));
			items.push(...mine.slice(0, MAX_QUESTS - items.length));
			if (items.length >= MAX_QUESTS) break;
		}
		return items;
	}

	/**
	 * The planet's quests this week: kept all week (a new set each Monday, or when there were none), each marked done
	 * (with the time it was first seen done) from the notes; papers no longer on the planet drop out.
	 * Returns { entry: { week, items: [{ kind, link, title, island, done }] }, newly: [items done since the last run] }.
	 */
	function updateQuests(entry, planet, now = new Date()) {
		let week = weekStart(now);
		let byLink = new Map(planet.records.filter(r => !r.deleted).map(r => [r.link, r]));
		let cur = entry && entry.week === week && Array.isArray(entry.items) && entry.items.length
			? entry : { week, items: pickQuests(planet).map(i => Object.assign(i, { done: "" })) };
		let newly = [];
		let items = cur.items.filter(i => byLink.has(i.link)).map((i) => {
			if (!i.done && questDone(i.kind, byLink.get(i.link))) {
				let d = Object.assign({}, i, { done: now.toISOString() });
				newly.push(d);
				return d;
			}
			return i;
		});
		return { entry: { week, items }, newly };
	}

	/** Completed quests kept in the history (the island log and the progress report read them). */
	function recordQuests(history, planetPath, newly) {
		let h = Object.assign({}, history || {});
		let done = (Array.isArray(h.quests) ? h.quests : []).concat(newly.map(i => ({ at: i.done, planet: planetPath, island: i.island, kind: i.kind, title: i.title })));
		h.quests = done.slice(-QUEST_LOG);
		return h;
	}

	/** The quests completed in a period (YYYY-MM-DD, local days), oldest first. */
	function questsIn(history, start, end) {
		let done = history && Array.isArray(history.quests) ? history.quests : [];
		return done.filter((q) => {
			let d = dateOf(q.at);
			let day = d ? localDay(d) : "";
			return day && day >= start && day <= end;
		});
	}

	/** 「讀完《Title》」 */
	function questText(i) {
		return `${QUEST_VERBS[i.kind] || i.kind}《${i.title}》`;
	}

	/** One progress-report line: 「運動：🌱 LV1 18 → 🏕️ LV2 31（+13，升級）」. */
	function progressLine(r) {
		let lv = d => `${stageOf(d)[0]} LV${stageOf(d)[1]} ${d}`;
		let delta = r.delta > 0 ? `+${r.delta}` : String(r.delta);
		return r.from === null ? `${r.name}：新的島，${lv(r.to)}` : `${r.name}：${lv(r.from)} → ${lv(r.to)}（${delta}${r.up ? "，升級" : ""}）`;
	}

	/** The quests for the map: kind, verb, title, island, done, a link to the note. */
	function questData(entry, noteLink) {
		return {
			week: entry.week,
			items: entry.items.map(i => ({ kind: i.kind, verb: QUEST_VERBS[i.kind] || i.kind, title: i.title, island: i.island, done: !!i.done, link: noteLink(i.link) })),
		};
	}

	// ---------- 📝 文獻探討大綱: what each island's paragraph should answer (pure, no AI) ----------

	const KEY_PAPERS = 3;

	/** The island's strongest papers to read and cite first: CEBM level, then design, then newest. */
	function keyPapers(records, designLabel) {
		let level = r => {
			let n = Number.parseInt(r.evidenceLevel, 10);
			return n >= 1 && n <= 5 ? n : 6;
		};
		return records.filter(r => !r.deleted && (r.evidenceLevel || r.studyDesign))
			.sort((a, b) => level(a) - level(b) || String(b.year || "").localeCompare(String(a.year || "")) || String(a.title).localeCompare(String(b.title)))
			.slice(0, KEY_PAPERS)
			.map(r => ({ link: r.link, title: r.title, year: String(r.year || "").slice(0, 4), design: r.studyDesign ? (designLabel ? designLabel(r.studyDesign) : r.studyDesign) : "", level: level(r) < 6 ? String(level(r)) : "" }));
	}

	/**
	 * The questions an island's paragraph in the literature review should answer, from its numbers and topicStats:
	 * whether the results agree, how strong the evidence is, what is missing. Questions, never the paragraph itself.
	 */
	function writingPrompts(n, s) {
		let out = [];
		if (!n.papers) return out;
		let label = s ? s.verdict.label : "";
		if (!s || label === "尚無判斷") out.push("先讀完或產生 AI 筆記：還看不出這座島的研究結論，段落要從「研究問了什麼」寫起。");
		else if (label === "結論分歧" || (s.directions && s.directions["不一致"])) out.push("結果為什麼不一致？比較族群、介入劑量和測量工具（GRADE 的 inconsistency）。");
		else if (/^多數/.test(label)) out.push(`大多數研究${label.replace(/^多數/, "")}：效果在哪些族群、劑量、追蹤時間下成立？有沒有例外？`);
		else out.push(`目前的結論是「${label}」：這個結論有多少篇、多強的研究支持？`);
		let best = Number.parseInt(n.best, 10);
		if (!best || best >= 3) out.push(`最強的證據${best ? `只到 CEBM ${best}` : "還沒有等級"}：寫的時候要說明證據強度有限，避免下過強的結論。`);
		else out.push(`有 CEBM ${best} 的研究：先用它定調，再用其他研究補充或對照。`);
		let gaps = s ? s.steps.filter(x => x.gap).map(x => x.short) : [];
		if (gaps.length) out.push(`缺口要寫出來：${gaps.slice(0, 2).join("；")}。這可能就是你研究的理由。`);
		if (n.papers < 3) out.push(`只有 ${n.papers} 篇：先確認是不是漏找，再決定這座島要寫成一段還是併進別段。`);
		return out;
	}

	/** 「📝 文獻探討大綱（依島）」: one heading per island with its facts, the questions and the papers to cite first. */
	function outlineSection(data, layout) {
		let isl = data.islands.filter(is => is.papers);
		if (!isl.length) return "";
		let parts = isl.map((is) => {
			let facts = [`${is.papers} 篇`, is.design, is.verdict].filter(Boolean).join(" · ");
			let cite = (is.key || []).map(k => `${wikilink(k.link, k.title)}（${[k.year, k.design, k.level ? `CEBM ${k.level}` : ""].filter(Boolean).join(" · ")}）`);
			return [`#### ${is.name}（${facts}）`, ...is.prompts.map(q => `- ❓ ${q}`), ...(cite.length ? [`- 📌 先讀、先引用：${cite.join("；")}`] : [])].join("\n");
		});
		let intro = "每座島寫成文獻探討的一段（或一節），由研究最多的島開始。下面是每段要回答的問題和先讀的文獻，文字由你寫；ZotMax 不替你寫段落。";
		if (layout !== "board") return [`### 📝 文獻探討大綱（依島）`, intro, ...parts].join("\n\n");
		return dashboard.foldSection(["## 📝 文獻探討大綱（依島）", intro, ...parts].join("\n\n"));
	}

	/** The last TREND_POINTS values of an island's 開發度 (the history, then today's when it differs). */
	function trendOf(points, dev) {
		let vals = (Array.isArray(points) ? points : []).filter(validPoint).map(p => p[1]);
		if (vals[vals.length - 1] !== dev) vals.push(dev);
		return vals.slice(-TREND_POINTS);
	}

	/**
	 * Everything the map shows, as the template's window.PLANET. opts: {
	 *   stats(records) → topics.js topicStats (steps marked gap: true are the island's gaps),
	 *   designLabel(d), squares(tally), link(path) → an obsidian:// URL or "", planetLink, card: the PICO card | null,
	 *   bot: topic-bot.js botSummaries() entry | null, botLink, aliases, levelUps, series (planet.history),
	 *   quests: updateQuests().entry, questLog: completed quests (history.quests), noteLink(vault link) → URL, now }
	 */
	function planetData(planet, opts = {}) {
		let now = opts.now || new Date();
		let link = opts.link || (() => "");
		let used = new Set(["hub", "harbor"]);
		let islands = planet.islands.map((is, k) => {
			let base = "i" + (k + 1);
			let id = used.has(base) ? base + "x" : base;
			used.add(id);
			let n = numbers(is.records);
			let s = opts.stats ? opts.stats(is.records) : null;
			let design = s ? s.designs.slice(0, 2).map(([d, c]) => `${opts.designLabel ? opts.designLabel(d) : d} ${c}`).join("、") : "";
			return Object.assign({ id, name: is.name, path: is.path, records: is.records }, n, {
				design,
				dirs: s && opts.squares ? opts.squares(s.directions) : "",
				gaps: s ? s.steps.filter(x => x.gap).map(x => x.short).slice(0, MAX_GAPS) : [],
				houses: houses(is.records),
				hint: levelHint(n).text,
				trend: trendOf((opts.series || {})[is.path], n.dev),
				verdict: s ? s.verdict.label : "",
				prompts: writingPrompts(n, s),
				key: keyPapers(is.records, opts.designLabel).map(k => Object.assign(k, { url: opts.noteLink ? opts.noteLink(k.link) : "" })),
				link: link(is.path),
			});
		});
		let all = numbers(planet.records);
		let seas = seasOf(planet.records, islands, opts.aliases);
		let bridges = bridgesOf(islands, opts.aliases);
		let weekAgo = now.getTime() - 7 * DAY_MS;
		let bot = opts.bot || null;
		let card = opts.card || null;
		let pico = card ? [["P", card.p], ["I", card.i], ["C", card.c], ["O", card.o]].filter(([, v]) => String(v || "").trim()) : [];
		let data = {
			title: planet.name,
			short: "研究問題",
			question: card && card.question ? card.question : `Zotero 分類「${planet.path}」的 ${islands.length} 個子分類`,
			note: "",
			generated: now.toISOString(),
			pico,
			link: opts.planetLink || "",
			kpis: {
				papers: all.papers, islands: islands.length,
				readPct: all.papers ? Math.round(all.read / all.papers * 100) : 0,
				newWeek: planet.records.filter(r => (dateOf(r.dateAdded) || 0) >= weekAgo).length,
				gaps: islands.reduce((n, is) => n + is.gaps.length, 0) + seas.length,
			},
			islands: islands.map(({ records, path, ...rest }) => rest),
			bridges,
			seas,
			harbor: bot ? { pending: bot.pending, high: bot.high, imported: bot.imported, link: opts.botLink || "" } : null,
			log: islandLog(planet, islands, { imports: bot ? bot.imports : [], levelUps: opts.levelUps, quests: opts.questLog }, now),
			quests: opts.quests ? questData(opts.quests, opts.noteLink || (() => "")) : null,
			tour: [],
		};
		data.tour = tourOf(data, planet);
		return data;
	}

	/** The guided tour: the planet, its most and least developed islands, the island with the most gaps, the harbor. */
	function tourOf(data, planet) {
		let tour = [{ id: "hub", text: `從星球中心開始：「${planet.name}」有 ${data.islands.length} 座島，每座島是 Zotero 裡的一個子分類，島上的房子是文獻。` }];
		let byDev = data.islands.slice().sort((a, b) => b.dev - a.dev || b.papers - a.papers);
		let top = byDev[0];
		let low = byDev[byDev.length - 1];
		if (top) tour.push({ id: top.id, text: `最發達的島：${top.name}（${stageLabel(top.dev)}，開發度 ${top.dev}）。${top.best ? `最強證據到 CEBM ${top.best}。` : ""}` });
		if (low && low !== top) tour.push({ id: low.id, text: `最荒涼的島：${low.name}，${low.papers} 篇、已讀 ${low.read} 篇。是範圍外，還是值得補找、補讀？升級只差：${low.hint}。` });
		let gappy = data.islands.filter(is => is.gaps.length && is !== top && is !== low).sort((a, b) => b.gaps.length - a.gaps.length)[0]
			|| data.islands.filter(is => is.gaps.length).sort((a, b) => b.gaps.length - a.gaps.length)[0];
		if (gappy && !tour.some(t => t.id === gappy.id)) tour.push({ id: gappy.id, text: `${gappy.name}的缺口：${gappy.gaps.join("；")}。` });
		let open = data.quests ? data.quests.items.filter(q => !q.done) : [];
		if (open.length) {
			let is = data.islands.find(i => i.name === open[0].island);
			tour.push({ id: is ? is.id : "hub", text: `本週任務還有 ${open.length} 項，先從${open[0].island}開始：${open[0].verb}《${open[0].title}》。完成後下次更新研究儀表板會自動打勾。` });
		}
		if (data.seas.length) tour.push({ id: "hub", text: `虛線圈起來的是未探索海域：${data.seas.map(s => s.text.replace(/：0 篇$/, "")).join("、")} 還沒有研究，先確認不是漏找。` });
		if (data.harbor && data.harbor.pending) {
			tour.push({ id: "harbor", text: `港口有 ${data.harbor.pending} 篇新候選等你看${data.harbor.high ? `，其中 ${data.harbor.high} 篇高相關` : ""}。勾選後才會靠岸（匯入 Zotero）。` });
		}
		return tour;
	}

	/** The template with the data in place; the JSON can't close the script tag. */
	function fillTemplate(template, data) {
		let text = String(template || "");
		if (!text.includes(MARK)) throw new Error("planet.html has no data marker");
		let json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
		return text.replace(MARK, () => json);
	}

	/** The note shown above the map: when and from what it was made (no user text). */
	function mapNote(now) {
		let d = now || new Date();
		return `🪐 <b>ZotMax</b> 於 ${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
			+ " 依 vault 裡的文獻筆記產生；這個檔案只存在你的電腦，更新研究儀表板時重畫。";
	}

	// ---------- 星球 Canvas (pure) ----------

	// Canvas colours by stage (the map's label dots): LV1 green, LV2 orange, LV3 cyan, LV4 purple
	const CANVAS_COLORS = { 1: "4", 2: "2", 3: "5", 4: "6" };
	const CANVAS_STAMP_RE = /由 ZotMax 自動產生（[^）]*）/g;

	/**
	 * 「<name> 星球.canvas」: the planet for Obsidian (phones included). The hub in the middle (the question, KPIs, a
	 * link to the page), one group per island on a ring (coloured by stage) holding its card, the bridges as labelled
	 * edges, the seas outside their island, the harbor under the hub. Every node id starts with "zm-".
	 * opts: { links: { collection path → wikilink target }, pageLink, botLink, now }
	 */
	function planetCanvas(planet, data, opts = {}) {
		let links = opts.links || {};
		let d = opts.now || new Date();
		let nodes = [];
		let edges = [];
		let angles = new Map();
		let n = data.islands.length;
		let RX = Math.max(760, 150 * n);
		let RY = Math.max(560, 110 * n);
		let ang = k => (n === 2 ? -Math.PI / 2 + (k ? 1 : -1) : -Math.PI / 2 + k * 2 * Math.PI / Math.max(1, n));
		let hub = [
			`## 🪐 ${opts.pageLink ? wikilink(opts.pageLink, data.title) : data.title}`,
			data.question,
			`**${data.kpis.papers}** 篇 · **${data.kpis.islands}** 座島 · 已讀 **${data.kpis.readPct}%** · 缺口 **${data.kpis.gaps}**`,
			`由 ZotMax 自動產生（${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}）；有你自己的卡片後就不再覆寫。`,
		].join("\n\n");
		nodes.push({ id: "zm-hub", type: "text", text: hub, x: -230, y: -120, width: 460, height: 240, color: "6" });
		data.islands.forEach((is, k) => {
			let a = ang(k);
			let cx = Math.round(RX * Math.cos(a));
			let cy = Math.round(RY * Math.sin(a));
			let path = planet.islands[k].path;
			let lv = stageOf(is.dev)[1];
			let gx = cx - 190;
			let gy = cy - 170;
			nodes.push({ id: `zm-g-${is.id}`, type: "group", label: `${stageOf(is.dev)[0]} ${is.name} · LV${lv}`, x: gx, y: gy, width: 380, height: 340, color: CANVAS_COLORS[lv] });
			let card = [
				`### ${links[path] ? wikilink(links[path], is.name) : is.name}`,
				`**${stageLabel(is.dev)}** · 開發度 ${is.dev}`,
				core.bar(is.dev, 100),
				`${is.papers} 篇 · 已讀 ${is.read} · 核對 ${is.verified} · AI ${is.ai}${is.best ? ` · CEBM ${is.best}` : ""}`,
				`⬆️ ${is.hint}`,
				...is.gaps.slice(0, 2).map(g => `🧭 ${g}`),
			].join("\n");
			nodes.push({ id: `zm-i-${is.id}`, type: "text", text: card, x: gx + 20, y: gy + 30, width: 340, height: 290 });
			angles.set(is.id, a);
		});
		for (let b of data.bridges) {
			edges.push({ id: `zm-b-${b.a}-${b.b}`, fromNode: `zm-g-${b.a}`, toNode: `zm-g-${b.b}`, toEnd: "none", label: `🌉 ${b.label}`, color: "3" });
		}
		data.seas.forEach((sea, k) => {
			let is = data.islands.find(i => i.id === sea.near);
			let a = is ? angles.get(is.id) : Math.PI / 2 + k;
			let x = Math.round(RX * 1.62 * Math.cos(a)) - 150;
			let y = Math.round(RY * 1.62 * Math.sin(a)) - 45 + k * 10;
			nodes.push({ id: `zm-sea-${k + 1}`, type: "text", text: `🌊 **未探索海域**\n${sea.text}`, x, y, width: 300, height: 90, color: "5" });
			if (is) edges.push({ id: `zm-se-${k + 1}`, fromNode: `zm-g-${is.id}`, toNode: `zm-sea-${k + 1}`, toEnd: "none" });
		});
		if (data.harbor) {
			let bot = opts.botLink ? wikilink(opts.botLink, "搜尋機器人") : "搜尋機器人";
			nodes.push({ id: "zm-harbor", type: "text", text: `⛵ **港口**：${bot}\n待看 ${data.harbor.pending} 篇${data.harbor.high ? ` · ⭐⭐⭐ ${data.harbor.high}` : ""}`, x: -160, y: 150, width: 320, height: 90, color: "5" });
			edges.push({ id: "zm-he", fromNode: "zm-hub", toNode: "zm-harbor", toEnd: "none" });
		}
		return JSON.stringify({ nodes, edges }, null, "\t");
	}

	/** A canvas only ZotMax wrote (every node id "zm-…"); null (no file) counts as ours. */
	function canvasIsOurs(text) {
		if (text === null || text === undefined) return true;
		try {
			let json = JSON.parse(text);
			return Array.isArray(json.nodes) && json.nodes.every(nd => String(nd.id || "").startsWith("zm-"));
		}
		catch (e) {
			return false;
		}
	}

	// ---------- the topic pages (pure) ----------

	/** A Markdown link to the map file (a file:// URL Obsidian opens in the browser). */
	function mapLink(url) {
		return url ? `[🗺️ 開啟群島地圖](${String(url).replace(/[ ()]/g, c => encodeURIComponent(c))})` : "";
	}

	/**
	 * 「🪐 星球」 on the planet's topic page. data: planetData(planet); meta: { layout, links: { collection path →
	 * wikilink target }, mapURL, canvasLink (vault), botLink (vault), quests: updateQuests().entry }.
	 */
	function planetSection(planet, data, meta = {}) {
		let links = meta.links || {};
		let name = is => links[is.path] ? wikilink(links[is.path], is.name) : is.name;
		let withPath = data.islands.map((is, k) => Object.assign({ path: planet.islands[k].path }, is));
		let head = `🪐 星球：${data.title}（${data.islands.length} 座島 · ${data.kpis.papers} 篇 · 已讀 ${data.kpis.readPct}%）`;
		let hidden = planet.hidden ? `另有 ${planet.hidden} 個較小的子分類沒有畫成島` : "";
		let top = [mapLink(meta.mapURL), meta.canvasLink ? wikilink(meta.canvasLink, "🪐 星球 Canvas") : "", FORMULA, hidden].filter(Boolean).join(" · ");
		let seaLine = data.seas.length ? `🌊 未探索海域：${data.seas.map(s => s.text).join("、")}` : "";
		let harborLine = data.harbor && meta.botLink
			? `⛵ 港口：${wikilink(meta.botLink, "搜尋機器人")}待看 ${data.harbor.pending} 篇${data.harbor.high ? `（⭐⭐⭐ ${data.harbor.high}）` : ""}` : "";
		if (meta.layout !== "board") {
			let rows = withPath.map(is => `| ${name(is).replace("|", "\\|")} | ${stageLabel(is.dev)} | ${is.dev} | ${is.papers} | ${is.read} | ${is.verified} | ${is.ai} | ${is.best ? `CEBM ${is.best}` : "—"} | ${is.hint} | ${is.gaps.join("；") || "—"} |`);
			return [
				`## ${head}`,
				top,
				"| 島 | 階段 | 開發度 | 文獻 | 已讀 | 評讀已核對 | AI 筆記 | 最強證據 | 升級 | 缺口 |\n|---|---|---|---|---|---|---|---|---|---|\n" + rows.join("\n"),
				seaLine, harborLine,
				...(questLines(meta.quests) ? [`### 🎯 本週任務（${questLines(meta.quests).done}／${questLines(meta.quests).total}）`, questLines(meta.quests).lines.join("\n"), QUEST_NOTE] : []),
				outlineSection(data, "classic"),
			].filter(Boolean).join("\n\n");
		}
		let cards = withPath.map((is) => {
			let lines = [
				`**${stageLabel(is.dev)}** · 開發度 ${is.dev}`,
				core.bar(is.dev, 100),
				`${is.papers} 篇 · 已讀 ${is.read} · 核對 ${is.verified} · AI ${is.ai}`,
				`⬆️ ${is.hint}`,
				[is.best ? `最強證據 CEBM ${is.best}` : "", is.design].filter(Boolean).join(" · "),
				...is.gaps.slice(0, 2).map(g => `🧭 ${g}`),
			].filter(Boolean);
			return [`> [!zm-topic] ${name(is)}`, ...lines.map((l, k) => `> ${l}${k < lines.length - 1 ? "  " : ""}`)].join("\n");
		});
		let quests = questLines(meta.quests);
		if (quests) cards.push([`> [!zm-next|wide] 🎯 本週任務（${quests.done}／${quests.total}）`, ...quests.lines.map(l => `> ${l}`), `> ${QUEST_NOTE}`].join("\n"));
		let extra = [seaLine, harborLine].filter(Boolean);
		if (extra.length) cards.push([`> [!zm-next|wide] 海域與港口`, ...extra.map(l => `> - ${l}`)].join("\n"));
		let body = [`> [!zm-links] 群島\n> ${top}`, ...cards].join("\n\n");
		let outline = outlineSection(data, "board");
		return `> [!zm-board] ${head}\n` + body.split("\n").map(l => (l.trim() ? `> ${l}` : ">")).join("\n") + (outline ? `\n\n${outline}` : "");
	}

	/**
	 * 首頁's 「🪐 我的星球」: one card per planet (看板) or one line (classic) — islands, papers, how many at each stage,
	 * the least developed island and what it needs, links to the Canvas and the map.
	 * list: [{ name, link (page), canvasLink, mapURL, data: planetData() }]
	 */
	function homePlanets(list, layout, opts = {}) {
		if (!list || !list.length) return opts.suggest ? buildHint(opts.suggest, layout) : "";
		let stages = data => [4, 3, 2, 1].map(lv => [lv, data.islands.filter(is => stageOf(is.dev)[1] === lv).length])
			.filter(([, k]) => k).map(([lv, k]) => `${STAGES.find(st => st[1] === lv)[2]} ${k}`).join(" · ");
		let lowest = data => data.islands.slice().sort((a, b) => a.dev - b.dev || b.papers - a.papers)[0];
		let links = p => [p.canvasLink ? wikilink(p.canvasLink, "🪐 Canvas") : "", p.mapURL ? mapLink(p.mapURL).replace("🗺️ 開啟群島地圖", "🗺️ 地圖") : ""].filter(Boolean).join(" · ");
		if (layout !== "board") {
			return ["## 🪐 我的星球", list.map((p) => {
				let low = lowest(p.data);
				return `- ${wikilink(p.link, p.name)}：${p.data.islands.length} 座島、${p.data.kpis.papers} 篇（${stages(p.data)}）${low ? `；最需要開墾：${low.name}（${low.hint}）` : ""}${links(p) ? ` · ${links(p)}` : ""}`;
			}).join("\n")].join("\n\n");
		}
		let cards = list.map((p) => {
			let low = lowest(p.data);
			let lines = [
				`**${p.data.islands.length} 座島** · ${p.data.kpis.papers} 篇 · 已讀 ${p.data.kpis.readPct}%`,
				stages(p.data),
				low ? `最需要開墾：${low.name}（${low.hint}）` : "",
				p.data.quests && p.data.quests.items.length ? `🎯 本週任務 ${p.data.quests.items.filter(q => q.done).length}／${p.data.quests.items.length}` : "",
				links(p),
			].filter(Boolean);
			return [`> [!zm-topic] ${wikilink(p.link, p.name)}`, ...lines.map((l, k) => `> ${l}${k < lines.length - 1 ? "  " : ""}`)].join("\n");
		});
		return `> [!zm-board] 🪐 我的星球\n` + cards.join("\n\n").split("\n").map(l => (l.trim() ? `> ${l}` : ">")).join("\n");
	}

	const QUEST_NOTE = "每週一換一批；依 Zotero 的閱讀狀態、AI 筆記和評讀核對自動打勾（更新研究儀表板時）。";

	/** The quests as list lines with ✅／⬜ (the region is rewritten, so no checkboxes), or null without any. */
	function questLines(entry) {
		if (!entry || !entry.items || !entry.items.length) return null;
		let lines = entry.items.map(i => `- ${i.done ? "✅" : "⬜"} ${QUEST_VERBS[i.kind] || i.kind} ${wikilink(i.link, i.title)} · ${i.island}`);
		return { lines, done: entry.items.filter(i => i.done).length, total: entry.items.length };
	}

	/** No planet yet: where one comes from, and the command that builds one from the biggest topic. */
	function buildHint(topicName, layout) {
		let text = `還沒有星球。星球是一個有兩個以上子分類的 Zotero 分類（子分類就是島）。可以自己在 Zotero 建子分類，或在「${topicName}」上按右鍵 → ZotMax ▸ 建造星球：把這個分類分成島，ZotMax 會依文獻的介入和標籤建議怎麼分。`;
		return layout === "board" ? `> [!zm-board] 🪐 我的星球\n> > [!zm-next|wide] 建一顆星球\n> > ${text}` : `## 🪐 我的星球\n\n${text}`;
	}

	/** 「🪐 回到星球」 for an island's page: the planet's page and the island's level (dev null: a collection inside an island). */
	function backLink(planetLink, planetName, dev) {
		return wikilink(planetLink, `🪐 回到星球「${planetName}」${Number.isFinite(dev) ? `（這座島 ${stageLabel(dev)}）` : ""}`);
	}

	// ---------- Zotero ----------

	function pref(key) {
		try {
			return Zotero.Prefs.get(PREF + key, true);
		}
		catch (e) {
			return undefined;
		}
	}

	function setPref(key, value) {
		Zotero.Prefs.set(PREF + key, value, true);
	}

	/** On unless the pref dashboard.planet is false. */
	function enabled() {
		return pref("dashboard.planet") !== false;
	}

	function init(opts = {}) {
		rootURI = opts.rootURI || rootURI;
		chrome = !!opts.chrome;
	}

	let cachedTemplate = null;
	async function template() {
		if (runtime.template) return runtime.template();
		if (cachedTemplate === null) {
			cachedTemplate = await Zotero.File.getContentsFromURLAsync((chrome ? "chrome://zotero-bridge/" : rootURI) + "content/planet/planet.html");
		}
		return cachedTemplate;
	}

	/** This week's quests per planet (pref planet.quests): { planet path: { week, items } }. */
	function readQuests() {
		try {
			let q = JSON.parse(pref("planet.quests") || "{}");
			return q && typeof q === "object" ? q : {};
		}
		catch (e) {
			return {};
		}
	}

	function saveQuests(quests) {
		try {
			setPref("planet.quests", JSON.stringify(quests));
		}
		catch (e) {
			Zotero.logError(e);
		}
	}

	function readHistory() {
		try {
			return JSON.parse(pref("planet.history") || "{}");
		}
		catch (e) {
			return {};
		}
	}

	/** The PICO card of the collection at this path in the user library, while the PICO feature is on; null otherwise. */
	function cardForPath(path) {
		try {
			let ZB = scope.ZB;
			if (!ZB || !ZB.pico || (ZB.features && !ZB.features.isEnabled("pico"))) return null;
			let c = Zotero.Collections.getByLibrary(Zotero.Libraries.userLibraryID, true).find(x => ZB.adapter.collectionPath(x) === path);
			return c ? ZB.pico.cardFor(c) : null;
		}
		catch (e) {
			return null;
		}
	}

	/**
	 * Write the map of each planet (topics.js writeAll calls this once per planet with its page). Returns { path, url }
	 * of the HTML file; the file is rewritten only when the data changed (not for the time alone).
	 */
	async function writeMap(dir, pageName, data) {
		let name = core.sanitizeFilename(String(pageName).replace(/ 總覽$/, "")) + MAP_SUFFIX;
		let path = PathUtils.join(dir, name);
		let html = fillTemplate(await template(), data);
		let old = (await IOUtils.exists(path)) ? await IOUtils.readUTF8(path) : null;
		let strip = s => s.replace(/"generated":"[^"]*","note":"(?:[^"\\]|\\.)*"|"note":"(?:[^"\\]|\\.)*","generated":"[^"]*"/, "");
		if (old === null || strip(old) !== strip(html)) await IOUtils.writeUTF8(path, html);
		return { path, name, url: PathUtils.toFileURI ? PathUtils.toFileURI(path) : "file://" + path };
	}

	/**
	 * Write 「<name> 星球.canvas」 beside the page unless the user added cards to it; only when more than the time
	 * changed. Returns the vault link or "" (left alone).
	 */
	async function writeCanvas(dir, dirParts, pageName, json) {
		let name = core.sanitizeFilename(String(pageName).replace(/ 總覽$/, "")) + CANVAS_SUFFIX;
		let path = PathUtils.join(dir, name);
		let old = (await IOUtils.exists(path)) ? await IOUtils.readUTF8(path) : null;
		let link = [...dirParts, name].join("/");
		if (!canvasIsOurs(old)) return link;
		if (old === null || old.replace(CANVAS_STAMP_RE, "") !== json.replace(CANVAS_STAMP_RE, "")) await IOUtils.writeUTF8(path, json);
		return link;
	}

	/** Save the level history after a run (topics.js); never throws. */
	function saveHistory(history) {
		try {
			setPref("planet.history", JSON.stringify(history));
		}
		catch (e) {
			Zotero.logError(e);
		}
	}

	/** Command: rebuild the dashboard (and so the maps), then open the map of the selected collection's planet. */
	function openForCollection(collection) {
		let ZB = scope.ZB;
		let headline = "ZotMax：群島地圖";
		let path = collection ? ZB.adapter.collectionPath(collection) : "";
		if (!path) {
			ZB.main.notify(headline, "請先在左側選一個有子分類的 Zotero 分類（星球），或它的一個子分類（島）。");
			return Promise.resolve(null);
		}
		return ZB.main.enqueue(async () => {
			let settings;
			try {
				settings = await ZB.main.readSettings();
			}
			catch (e) {
				ZB.main.notify("ZotMax 設定有誤", String(e.message || e));
				return null;
			}
			if (!settings.vaultPath) {
				ZB.main.notify(headline, "請先到 設定 → ZotMax 填入 Obsidian vault 路徑。");
				return null;
			}
			if (!enabled()) {
				ZB.main.notify(headline, "群島地圖已關閉：到 設定 → ZotMax → Obsidian 勾選「主題頁加上星球與島嶼」。");
				return null;
			}
			try {
				let result = await ZB.dashboard.update(settings);
				let maps = (result && result.topics && result.topics.planets) || [];
				let hit = planetOf(maps, path);
				if (!hit) {
					ZB.main.notify(headline, `「${path}」還不是星球：至少要有兩個有文獻筆記的子分類。`);
					return null;
				}
				if (runtime.launch) runtime.launch(hit.file);
				else Zotero.launchFile(hit.file);
				return hit;
			}
			catch (e) {
				Zotero.logError(e);
				ZB.main.notify(headline, `產生失敗：${e.message || e}`);
				return null;
			}
		});
	}

	return {
		MARK, MAP_SUFFIX, FORMULA, MAX_ISLANDS, runtime,
		CANVAS_SUFFIX,
		findPlanets, planetOf, islandOf, devOf, stageOf, stageLabel, levelHint, numbers, houses, islandTerms, bridgesOf, seasOf, islandLog, nextHistory,
		weekStart, questDone, pickQuests, updateQuests, recordQuests, questsIn, questText, questLines,
		keyPapers, writingPrompts, outlineSection,
		islandProgress, progressLine, trendOf,
		planetData, tourOf, fillTemplate, mapNote, mapLink, planetCanvas, canvasIsOurs, planetSection, homePlanets, backLink,
		enabled, init, readHistory, saveHistory, readQuests, saveQuests, cardForPath, writeMap, writeCanvas, openForCollection,
	};
});
