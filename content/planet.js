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
	const STAGES = [[75, 4, "🏙️", "城鎮"], [50, 3, "🏘️", "聚落"], [25, 2, "🏕️", "開墾中"], [0, 1, "🌱", "荒島"]];
	const READ_STATUSES = ["已讀", "已引用"];
	const MAX_ISLANDS = 10;
	const MAX_BRIDGES = 8;
	const MAX_SEAS = 3;
	const MAX_GAPS = 3;
	const LOG_DAYS = 14;
	const MAX_LOG = 14;
	const HISTORY_EVENTS = 60;
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
	 */
	function findPlanets(records) {
		let live = (records || []).filter(r => !r.deleted);
		let paths = new Map();
		for (let r of live) {
			for (let c of new Set((r.collections || []).map(cleanPath).filter(Boolean))) {
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
		for (let { island, n } of islandNumbers) {
			let prev = devs[island.path];
			if (Number.isFinite(prev) && stageOf(n.dev)[1] > stageOf(prev)[1]) {
				events.push({ at: now.toISOString(), planet: planet.path, island: island.name, from: prev, to: n.dev });
			}
			devs[island.path] = n.dev;
		}
		return { islands: devs, events: events.slice(-HISTORY_EVENTS) };
	}

	/**
	 * Everything the map shows, as the template's window.PLANET. opts: {
	 *   stats(records) → topics.js topicStats (steps marked gap: true are the island's gaps),
	 *   designLabel(d), squares(tally), link(path) → an obsidian:// URL or "", planetLink, card: the PICO card | null,
	 *   bot: topic-bot.js botSummaries() entry | null, botLink, aliases, levelUps, now }
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
			log: islandLog(planet, islands, { imports: bot ? bot.imports : [], levelUps: opts.levelUps }, now),
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
		if (low && low !== top) tour.push({ id: low.id, text: `最荒涼的島：${low.name}，${low.papers} 篇、已讀 ${low.read} 篇。是範圍外，還是值得補找、補讀？` });
		let gappy = data.islands.filter(is => is.gaps.length && is !== top && is !== low).sort((a, b) => b.gaps.length - a.gaps.length)[0]
			|| data.islands.filter(is => is.gaps.length).sort((a, b) => b.gaps.length - a.gaps.length)[0];
		if (gappy && !tour.some(t => t.id === gappy.id)) tour.push({ id: gappy.id, text: `${gappy.name}的缺口：${gappy.gaps.join("；")}。` });
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

	// ---------- the topic pages (pure) ----------

	/** A Markdown link to the map file (a file:// URL Obsidian opens in the browser). */
	function mapLink(url) {
		return url ? `[🗺️ 開啟群島地圖](${String(url).replace(/[ ()]/g, c => encodeURIComponent(c))})` : "";
	}

	/**
	 * 「🪐 星球」 on the planet's topic page. data: planetData(planet); meta: { layout, links: { collection path →
	 * wikilink target }, mapURL, botLink (vault) }.
	 */
	function planetSection(planet, data, meta = {}) {
		let links = meta.links || {};
		let name = is => links[is.path] ? wikilink(links[is.path], is.name) : is.name;
		let withPath = data.islands.map((is, k) => Object.assign({ path: planet.islands[k].path }, is));
		let head = `🪐 星球：${data.title}（${data.islands.length} 座島 · ${data.kpis.papers} 篇 · 已讀 ${data.kpis.readPct}%）`;
		let hidden = planet.hidden ? `另有 ${planet.hidden} 個較小的子分類沒有畫成島` : "";
		let top = [mapLink(meta.mapURL), FORMULA, hidden].filter(Boolean).join(" · ");
		let seaLine = data.seas.length ? `🌊 未探索海域：${data.seas.map(s => s.text).join("、")}` : "";
		let harborLine = data.harbor && meta.botLink
			? `⛵ 港口：${wikilink(meta.botLink, "搜尋機器人")}待看 ${data.harbor.pending} 篇${data.harbor.high ? `（⭐⭐⭐ ${data.harbor.high}）` : ""}` : "";
		if (meta.layout !== "board") {
			let rows = withPath.map(is => `| ${name(is).replace("|", "\\|")} | ${stageLabel(is.dev)} | ${is.dev} | ${is.papers} | ${is.read} | ${is.verified} | ${is.ai} | ${is.best ? `CEBM ${is.best}` : "—"} | ${is.gaps.join("；") || "—"} |`);
			return [
				`## ${head}`,
				top,
				"| 島 | 階段 | 開發度 | 文獻 | 已讀 | 評讀已核對 | AI 筆記 | 最強證據 | 缺口 |\n|---|---|---|---|---|---|---|---|---|\n" + rows.join("\n"),
				seaLine, harborLine,
			].filter(Boolean).join("\n\n");
		}
		let cards = withPath.map((is) => {
			let lines = [
				`**${stageLabel(is.dev)}** · 開發度 ${is.dev}`,
				core.bar(is.dev, 100),
				`${is.papers} 篇 · 已讀 ${is.read} · 核對 ${is.verified} · AI ${is.ai}`,
				[is.best ? `最強證據 CEBM ${is.best}` : "", is.design].filter(Boolean).join(" · "),
				...is.gaps.slice(0, 2).map(g => `🧭 ${g}`),
			].filter(Boolean);
			return [`> [!zm-topic] ${name(is)}`, ...lines.map((l, k) => `> ${l}${k < lines.length - 1 ? "  " : ""}`)].join("\n");
		});
		let extra = [seaLine, harborLine].filter(Boolean);
		if (extra.length) cards.push([`> [!zm-next|wide] 海域與港口`, ...extra.map(l => `> - ${l}`)].join("\n"));
		let body = [`> [!zm-links] 群島\n> ${top}`, ...cards].join("\n\n");
		return `> [!zm-board] ${head}\n` + body.split("\n").map(l => (l.trim() ? `> ${l}` : ">")).join("\n");
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
		findPlanets, planetOf, islandOf, devOf, stageOf, stageLabel, numbers, houses, bridgesOf, seasOf, islandLog, nextHistory,
		planetData, tourOf, fillTemplate, mapNote, mapLink, planetSection, backLink,
		enabled, init, readHistory, saveHistory, cardForPath, writeMap, openForCollection,
	};
});
