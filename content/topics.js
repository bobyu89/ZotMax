/*
 * ZotMax — 首頁 and 主題頁: the vault organised by Zotero collection, without moving a file.
 *
 *   <folder>/首頁.md               the front page: the 總覽 number cards, one card per topic (a Zotero collection
 *                                  that has literature notes) and quick links.
 *   <folder>/主題/<collection>.md   one page per topic: 總覽 cards, 🧭 證據說什麼 (the notes' effect_direction by
 *                                  intervention), 📈 趨勢 (the last five publication years against the five before,
 *                                  common interventions and outcomes), 🕳️ 研究缺口與下一步 (rules and the evidence gap
 *                                  map) and 📚 文獻 (every paper with its design, level, direction and status).
 *
 * A note in two collections shows up on both topic pages; the files stay where the sync put them, so links never
 * break. Built together with the 研究儀表板 (dashboard.js update(), pref dashboard.topicPages) from the notes'
 * frontmatter only: no network, no AI. Only the %% zotero-bridge:start/end %% block is rewritten; 「✍️ 我的筆記」
 * and the user's frontmatter keys stay. A topic page whose collection has no notes any more keeps the user's part
 * and says so.
 *
 * The functions down to "Zotero" are pure (Node tests); the rest needs Zotero.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(require("./core.js"), require("./dashboard.js"), globalThis);
	}
	else {
		(root.ZB = root.ZB || {}).topics = factory(root.ZB.core, root.ZB.dashboard, root);
	}
})(this, function (core, dashboard, scope) {
	const PREF = "extensions.zotero-bridge.";
	const HOME_NAME = "首頁";
	const TOPIC_FOLDER = "主題";
	const MAX_CARDS = 12;
	const DIRECTIONS = ["有效", "無差異", "有害", "不一致"];
	const UNJUDGED = "未判定";
	const READ_STATUSES = ["已讀", "已引用"];
	const RECENT_YEARS = 5;
	const TOP_TERMS = 5;
	const MAX_STEPS = 6;
	const SMALL_SAMPLE = 50;
	const HIGH_DESIGNS = ["RCT", "systematic review", "meta-analysis"];
	const REVIEW_DESIGNS = ["systematic review", "meta-analysis"];
	const DESIGN_ZH = {
		"RCT": "RCT", "quasi-experimental": "類實驗", "cohort": "世代研究", "case-control": "病例對照", "cross-sectional": "橫斷面",
		"qualitative": "質性", "mixed methods": "混合方法", "systematic review": "系統性回顧", "meta-analysis": "統合分析",
		"scoping review": "範疇回顧", "guideline": "指引", "other": "其他",
	};
	const USER_SECTION = "## ✍️ 我的筆記\n\n";
	const MARK_START_RE = /^%% zotero-bridge:start.*%%[ \t]*$/m;
	const MARK_END_RE = /^%% zotero-bridge:end %%[ \t]*$/m;

	const { kpi, wikilink, cell, bestLevel, termKey, splitTerms, gapMap, gapMapSection } = dashboard;

	// ---------- topics and their numbers (pure) ----------

	/** "碩論/跌倒" → "碩論／跌倒" (a file name; the full-width slash keeps the path readable). */
	function topicFileName(path) {
		return core.sanitizeFilename(String(path || "").split("/").map(s => s.trim()).filter(Boolean).join("／"));
	}

	/**
	 * The collections that have literature notes, most notes first.
	 * Returns [{ path: "碩論/跌倒", name: "跌倒", parent: "碩論", records }].
	 */
	function groupTopics(records) {
		let map = new Map();
		for (let r of records || []) {
			if (r.deleted) continue;
			for (let c of new Set(r.collections || [])) {
				let path = String(c).split("/").map(s => s.trim()).filter(Boolean).join("/");
				if (!path) continue;
				let t = map.get(path) || { path, records: [] };
				t.records.push(r);
				map.set(path, t);
			}
		}
		return [...map.values()].map((t) => {
			let parts = t.path.split("/");
			return Object.assign(t, { name: parts[parts.length - 1], parent: parts.slice(0, -1).join("／") });
		}).sort((a, b) => b.records.length - a.records.length || a.path.localeCompare(b.path, "zh-Hant"));
	}

	function yearOf(r) {
		let y = Number.parseInt(String(r.year || "").slice(0, 4), 10);
		return Number.isFinite(y) && y > 1800 ? y : null;
	}

	function directionOf(r) {
		return DIRECTIONS.includes(r.direction) ? r.direction : UNJUDGED;
	}

	/** { 有效, 無差異, 有害, 不一致, 未判定, judged } for these records. */
	function tally(records) {
		let t = Object.fromEntries([...DIRECTIONS, UNJUDGED].map(d => [d, 0]));
		for (let r of records) t[directionOf(r)]++;
		t.judged = records.length - t[UNJUDGED];
		return t;
	}

	/** What the evidence says, from a tally: { label: "多數有效", text } (AI's first reading, not a GRADE rating). */
	function verdict(t) {
		if (!t.judged) return { label: "尚無判斷", text: "還沒有可判斷結論方向的研究：需要有比較組的研究，和新版 AI 筆記（會寫出 effect_direction）。" };
		let [top, n] = topDirection(t);
		let label;
		if (t.judged === 1) label = `僅 1 篇：${top}`;
		else if (n / t.judged >= 2 / 3) label = top === "不一致" ? "多數結果不一致" : `多數${top}`;
		else label = "結論分歧";
		let parts = DIRECTIONS.filter(d => t[d]).map(d => `${d} ${t[d]}`).join("、");
		return { label, text: `${t.judged} 篇可判斷方向的研究：${parts}${t[UNJUDGED] ? `；另有 ${t[UNJUDGED]} 篇未判定` : ""}。` };
	}

	/**
	 * Terms of one field (intervention or outcomes) grouped by the concept-card aliases, most papers first:
	 * [{ key, name, records }].
	 */
	function termGroups(records, field, aliases) {
		let groups = new Map();
		for (let r of records) {
			for (let raw of splitTerms(r[field])) {
				let k = termKey(raw);
				let g = aliases && aliases.get(k);
				let key = g ? g.key : k;
				let e = groups.get(key) || { key, name: g ? g.name : raw, records: new Set() };
				e.records.add(r);
				groups.set(key, e);
			}
		}
		return [...groups.values()].map(e => ({ key: e.key, name: e.name, records: [...e.records] }))
			.sort((a, b) => b.records.length - a.records.length || a.name.localeCompare(b.name, "zh-Hant"));
	}

	/** Publication years: the last RECENT_YEARS against the RECENT_YEARS before, newest and oldest. */
	function trendOf(records, nowYear) {
		let years = records.map(yearOf).filter(Boolean);
		let recent = years.filter(y => y > nowYear - RECENT_YEARS).length;
		let before = years.filter(y => y <= nowYear - RECENT_YEARS && y > nowYear - 2 * RECENT_YEARS).length;
		return {
			dated: years.length, recent, before,
			from: nowYear - RECENT_YEARS + 1, to: nowYear,
			newest: years.length ? Math.max(...years) : null,
			oldest: years.length ? Math.min(...years) : null,
			arrow: !years.length ? "" : recent > before ? "↑" : recent < before ? "↓" : "→",
			word: recent > before ? "上升" : recent < before ? "下降" : "持平",
			rows: dashboard.yearRows(records),
		};
	}

	function median(nums) {
		let s = nums.slice().sort((a, b) => a - b);
		if (!s.length) return null;
		let m = Math.floor(s.length / 2);
		return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
	}

	/** Everything a topic page and its card show. opts: { aliases, now: Date } */
	function topicStats(topic, opts = {}) {
		let records = topic.records;
		let nowYear = (opts.now || new Date()).getFullYear();
		let total = records.length;
		let read = records.filter(r => READ_STATUSES.includes(r.status)).length;
		let withAI = records.filter(r => r.hasAI).length;
		let design = d => records.filter(r => r.studyDesign === d).length;
		let directions = tally(records);
		let interventions = termGroups(records, "intervention", opts.aliases).map(g => Object.assign(g, { tally: tally(g.records), best: bestLevel(g.records) }));
		let outcomes = termGroups(records, "outcomes", opts.aliases);
		let sizes = records.map(r => r.sampleSize).filter(n => Number.isFinite(n) && n > 0);
		let designs = new Map();
		for (let r of records) if (r.studyDesign) designs.set(r.studyDesign, (designs.get(r.studyDesign) || 0) + 1);
		let s = {
			total, read, readPercent: total ? Math.round((read / total) * 100) : 0,
			unread: records.filter(r => r.status === "待讀" || !r.status).length,
			withAI, noAI: total - withAI,
			appraised: records.filter(r => r.appraisal).length,
			verified: records.filter(r => r.appraisalVerified).length,
			best: bestLevel(records),
			rct: design("RCT"),
			reviews: records.filter(r => REVIEW_DESIGNS.includes(r.studyDesign)).length,
			high: records.filter(r => HIGH_DESIGNS.includes(r.studyDesign) || ["1", "2"].includes(String(r.evidenceLevel))).length,
			designs: [...designs.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
			directions,
			verdict: verdict(directions),
			interventions,
			outcomes,
			medianSample: sizes.length >= 2 ? median(sizes) : null,
			trend: trendOf(records, nowYear),
			map: gapMap(records, { aliases: opts.aliases, maxRows: 6, maxCols: 5 }),
		};
		s.steps = nextSteps(s);
		return s;
	}

	/** The topic's empty intervention × outcome pairs among the best-studied ones (at most `max`). */
	function emptyPairs(map, max = 3) {
		let out = [];
		for (let r of map.rows.slice(0, 4)) {
			for (let c of map.cols.slice(0, 4)) {
				if (!map.cell(r.key, c.key).length) out.push(`${r.name} × ${c.name}`);
			}
		}
		return out.slice(0, max);
	}

	/**
	 * 研究缺口與下一步: rules on the topic's numbers, most useful first. Each { short (the home card), text }.
	 */
	function nextSteps(s) {
		let steps = [];
		if (s.noAI) steps.push({ short: `${s.noAI} 篇還沒有 AI 筆記`, text: `**${s.noAI} 篇還沒有 AI 筆記**：產生後才看得出結論方向、PICO 和缺口。` });
		if (s.withAI >= 3 && !s.high) {
			steps.push({ short: "還沒有 RCT 或系統性回顧", text: "**還沒有 RCT 或系統性回顧（CEBM 1–2）**：到 PubMed 用 Clinical Queries，或篩選 Randomized Controlled Trial、Systematic Review 補找。" });
		}
		if (s.rct >= 3 && !s.reviews) {
			steps.push({ short: `${s.rct} 篇 RCT，還沒有系統性回顧`, text: `**已有 ${s.rct} 篇 RCT，但還沒有系統性回顧**：先查 Cochrane Library 和 PROSPERO 有沒有人做過；沒有的話，這可能就是寫系統性回顧或統合分析的機會。` });
		}
		let d = s.directions;
		if (d.judged >= 2 && (s.verdict.label === "結論分歧" || d["不一致"])) {
			steps.push({ short: "結論分歧，值得比較", text: `**結論分歧**（${DIRECTIONS.filter(k => d[k]).map(k => `${k} ${d[k]}`).join("、")}）：比較各篇的族群、介入劑量和測量工具；這正是 GRADE 的 inconsistency 要看的地方。` });
		}
		let pairs = emptyPairs(s.map);
		if (s.map.studied >= 2 && pairs.length) {
			steps.push({ short: `缺口：${pairs[0]}`, text: `**還沒有研究的組合**：${pairs.join("、")}。可能是研究缺口，先用 PICO 問題卡搜一次，確認不是漏找。` });
		}
		if (s.trend.newest && s.trend.newest <= s.trend.to - RECENT_YEARS) {
			steps.push({ short: `最新一篇是 ${s.trend.newest} 年`, text: `**最新一篇是 ${s.trend.newest} 年**：補找近 ${RECENT_YEARS} 年的研究，指引和臨床做法可能已經更新。` });
		}
		if (s.medianSample !== null && s.medianSample < SMALL_SAMPLE) {
			steps.push({ short: `樣本數中位數 ${s.medianSample} 人`, text: `**樣本數中位數只有 ${s.medianSample} 人**：結果的精確度有限（GRADE 的 imprecision），留意樣本較大的研究或統合分析。` });
		}
		if (s.appraised > s.verified) {
			steps.push({ short: `${s.appraised - s.verified} 篇評讀待核對`, text: `**${s.appraised - s.verified} 篇的評讀還沒核對**：在文獻評讀表確認後，結論才是你自己的判斷。` });
		}
		if (s.unread) steps.push({ short: `${s.unread} 篇待讀`, text: `**${s.unread} 篇待讀**。` });
		if (!steps.length) steps.push({ short: "資料都齊了", text: "這個主題的資料都齊了：可以用 PICO 表整理證據，開始寫綜整。" });
		return steps.slice(0, MAX_STEPS);
	}

	// ---------- Markdown (pure) ----------

	function quote(lines) {
		return lines.map(l => (l.trim() ? `> ${l}` : ">")).join("\n");
	}

	function board(title, cards) {
		return `> [!zm-board] ${title}\n${quote(cards.join("\n\n").split("\n"))}`;
	}

	/** [[target\|label]]: a wikilink inside a table cell. */
	function tableLink(target, label) {
		return wikilink(target, label).replace("|", "\\|");
	}

	function designLabel(d) {
		return DESIGN_ZH[d] || d;
	}

	function evidenceLine(s) {
		let parts = [];
		if (s.rct) parts.push(`RCT ${s.rct}`);
		if (s.reviews) parts.push(`系統性回顧 ${s.reviews}`);
		if (!parts.length && s.designs.length) parts.push(...s.designs.slice(0, 2).map(([d, n]) => `${designLabel(d)} ${n}`));
		return parts.join(" · ");
	}

	function trendLine(t) {
		if (!t.dated) return "沒有出版年份";
		return `近 ${RECENT_YEARS} 年 ${t.recent} 篇 ${t.arrow}`;
	}

	/** The most common direction: [name, papers]. */
	function topDirection(d) {
		return DIRECTIONS.map(k => [k, d[k]]).sort((a, b) => b[1] - a[1])[0];
	}

	/** "多數有效（5／7）" */
	function directionShort(s) {
		let d = s.directions;
		return d.judged > 1 ? `${s.verdict.label}（${topDirection(d)[1]}／${d.judged}）` : s.verdict.label;
	}

	/** The topic page's 「總覽」 cards (看板) or one summary line (classic). */
	function topicOverview(s, layout) {
		if (layout !== "board") {
			return `**${s.total} 篇**｜已讀 ${s.readPercent}%｜最強證據 ${s.best ? `CEBM ${s.best}` : "—"}｜證據：${directionShort(s)}（AI 初判）｜${trendLine(s.trend)}`;
		}
		return board("主題總覽", [
			kpi("文獻", `${s.total} 篇`, trendLine(s.trend)),
			kpi("已讀", `${s.readPercent}%`, core.bar(s.read, s.total), `${s.read}／${s.total}`),
			kpi("最強證據", s.best ? `CEBM ${s.best}` : "—", evidenceLine(s) || "還沒有研究設計資料"),
			kpi("證據說什麼", s.verdict.label, s.directions.judged ? `${topDirection(s.directions).join(" ")}／${s.directions.judged} 篇（AI 初判）` : "等新版 AI 筆記"),
		]);
	}

	function directionSection(s) {
		let d = s.directions;
		let parts = ["## 🧭 證據說什麼", `**${s.verdict.label}**：${s.verdict.text}`];
		if (d.judged) {
			let max = Math.max(1, ...DIRECTIONS.map(k => d[k]));
			parts.push(["| 結論方向 | 篇數 |", "|---|---|", ...DIRECTIONS.map(k => `| ${k} | ${core.bar(d[k], max, 8)} ${d[k]} |`), `| ${UNJUDGED} | ${d[UNJUDGED]} |`].join("\n"));
		}
		let rows = s.interventions.slice(0, TOP_TERMS).filter(g => g.records.length);
		if (rows.length && d.judged) {
			parts.push("### 依介入");
			parts.push([
				`| 介入 | 篇數 | ${DIRECTIONS.join(" | ")} | ${UNJUDGED} | 最強 CEBM |`,
				`|---|:---:|${DIRECTIONS.map(() => ":---:").join("|")}|:---:|:---:|`,
				...rows.map(g => `| ${cell(g.name)} | ${g.records.length} | ${DIRECTIONS.map(k => g.tally[k] || "").join(" | ")} | ${g.tally[UNJUDGED] || ""} | ${g.best ? `L${g.best}` : ""} |`),
			].join("\n"));
		}
		parts.push("> [!warning] 結論方向是 AI 初判，不是 GRADE\n> 「有效」只代表主要結果有統計上顯著的差異，不等於臨床上有意義，也不代表證據確定性高。寫進報告前請回原文核對，再用 GRADE 判斷整體證據確定性。");
		return parts.join("\n\n");
	}

	function trendSection(s) {
		let t = s.trend;
		let parts = ["## 📈 趨勢"];
		if (!t.dated) parts.push("這個主題的文獻都沒有出版年份。");
		else {
			parts.push(`近 ${RECENT_YEARS} 年（${t.from}–${t.to}）**${t.recent} 篇**，再往前 ${RECENT_YEARS} 年 ${t.before} 篇：研究量${t.word} ${t.arrow}。最早 ${t.oldest} 年，最新 ${t.newest} 年。`);
			let max = Math.max(1, ...t.rows.map(([, n]) => n));
			parts.push(t.rows.map(([y, n], k) => `\`${y}\` ${core.bar(n, max, 10)} ${n}${k < t.rows.length - 1 ? "  " : ""}`).join("\n"));
		}
		let list = groups => groups.slice(0, TOP_TERMS).map(g => `${g.name}（${g.records.length}）`).join("、");
		if (s.interventions.length) parts.push(`**常見的介入**：${list(s.interventions)}`);
		if (s.outcomes.length) parts.push(`**常見的結果指標**：${list(s.outcomes)}`);
		return parts.join("\n\n");
	}

	function gapSection(s) {
		return ["## 🕳️ 研究缺口與下一步", s.steps.map(x => `- ${x.text}`).join("\n"), gapMapSection(s.map, { level: 3 })].join("\n\n");
	}

	function sortForList(a, b) {
		let la = Number.parseInt(a.evidenceLevel, 10) || 9;
		let lb = Number.parseInt(b.evidenceLevel, 10) || 9;
		return la - lb || (yearOf(b) || 0) - (yearOf(a) || 0) || a.title.localeCompare(b.title, "zh-Hant");
	}

	function paperSection(records) {
		let rows = records.slice().sort(sortForList).map(r => `| ${tableLink(r.link, r.title)} | ${yearOf(r) || ""} | ${cell(designLabel(r.studyDesign))} | ${r.evidenceLevel ? `L${cell(r.evidenceLevel)}` : ""} | ${directionOf(r) === UNJUDGED ? "" : r.direction} | ${cell(r.status)} |`);
		return [`## 📚 文獻（${records.length} 篇）`, ["| 文獻 | 年 | 研究設計 | CEBM | 結論方向 | 狀態 |", "|---|:---:|---|:---:|:---:|:---:|", ...rows].join("\n")].join("\n\n");
	}

	function stamp(now) {
		let d = now || new Date();
		let p = n => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
	}

	/** A topic page's managed region. meta: { now, layout, homeLink, dashboardLink } */
	function topicSection(topic, s, meta = {}) {
		let links = [meta.homeLink ? `← ${wikilink(meta.homeLink, HOME_NAME)}` : "", meta.dashboardLink ? wikilink(meta.dashboardLink, "研究儀表板") : ""].filter(Boolean).join(" · ");
		let info = [
			`> [!info] 由 ZotMax 依 Zotero 分類「${topic.path}」的 ${s.total} 篇文獻筆記於 ${stamp(meta.now)} 產生；只讀筆記的 frontmatter，不連網、不呼叫 AI。`,
			"> 筆記沒有搬動，一篇在幾個分類，就會出現在幾個主題頁。",
			...(links ? [`> ${links}`] : []),
		].join("\n");
		return [info, topicOverview(s, meta.layout), directionSection(s), trendSection(s), gapSection(s), paperSection(topic.records)].join("\n\n");
	}

	/** The managed region of a topic page whose collection has no notes now. */
	function staleSection(path, meta = {}) {
		return `> [!warning] Zotero 分類「${path}」目前沒有文獻筆記（${stamp(meta.now)} 檢查）\n> 分類可能改名、刪除，或文獻都移走了。下面「✍️ 我的筆記」保留著；不需要這頁的話可以直接刪除。`;
	}

	/** A home card for a topic (看板). */
	function topicCard(topic, s) {
		let rows = [
			`**${s.total} 篇** · 已讀 ${s.readPercent}%`,
			core.bar(s.read, s.total),
			`🧭 ${directionShort(s)}${s.best ? ` · CEBM ${s.best}` : ""}`,
			`📈 ${trendLine(s.trend)}`,
			`➡️ ${s.steps[0].short}`,
			...(topic.parent ? [`📁 ${topic.parent}`] : []),
		];
		return [`> [!zm-topic] ${wikilink(topic.link, topic.name)}`, ...rows.map((l, k) => `> ${l}${k < rows.length - 1 ? "  " : ""}`)].join("\n");
	}

	/** The home page's topic cards (看板) or table (classic). entries: [{ topic, stats }] (most notes first). */
	function topicsBlock(entries, layout, unfiled) {
		let parts = [];
		if (!entries.length) {
			parts.push("## 🗂️ 主題", "還沒有主題：在 Zotero 把文獻放進分類（例如每個研究問題一個分類），同步後這裡就會出現主題卡。");
		}
		else if (layout === "board") {
			let shown = entries.slice(0, MAX_CARDS);
			parts.push(board(`主題（${entries.length}）`, shown.map(e => topicCard(e.topic, e.stats))));
			let rest = entries.slice(MAX_CARDS);
			if (rest.length) parts.push(`其他主題：${rest.map(e => `${wikilink(e.topic.link, e.topic.name)}（${e.stats.total}）`).join("、")}`);
		}
		else {
			parts.push(`## 🗂️ 主題（${entries.length}）`, [
				"| 主題 | 篇數 | 已讀 | 最強證據 | 證據說什麼（AI 初判） | 趨勢 | 下一步 |",
				"|---|:---:|---|:---:|---|---|---|",
				...entries.map(({ topic, stats: s }) => `| ${tableLink(topic.link, topic.path.replace(/\//g, "／"))} | ${s.total} | ${core.bar(s.read, s.total, 6)} ${s.readPercent}% | ${s.best ? `CEBM ${s.best}` : ""} | ${cell(directionShort(s))} | ${trendLine(s.trend)} | ${cell(s.steps[0].short)} |`),
			].join("\n"));
		}
		if (unfiled) parts.push(`另有 ${unfiled} 篇沒有放進任何 Zotero 分類，所以不在任何主題裡。`);
		return parts.join("\n\n");
	}

	/**
	 * The home page's quick links. meta: { dashboardLink, reviews: projectRecord()s, conceptIndex, latestReport: { date, link },
	 * baseLink }
	 */
	function quickLinks(meta) {
		let lines = [];
		if (meta.dashboardLink) lines.push(`- 📊 ${wikilink(meta.dashboardLink, "研究儀表板")}：閱讀進度、圖表、證據缺口地圖、待讀清單`);
		let reviews = (meta.reviews || []).slice(0, 5);
		lines.push(reviews.length ? `- 🗂️ 回顧專案：${reviews.map(r => wikilink(r.link, r.title)).join(" · ")}` : "- 🗂️ 回顧專案：還沒有（選一個分類 → 篩選與 PRISMA，或匯出 PICO 表）");
		if (meta.conceptIndex) lines.push(`- 🧠 ${wikilink(meta.conceptIndex, "概念索引")}：哪些文獻談同一件事`);
		if (meta.latestReport) lines.push(`- 📝 最新進度報告：${wikilink(meta.latestReport.link, meta.latestReport.date)}`);
		if (meta.baseLink) lines.push(`- 📚 ${wikilink(meta.baseLink, "文獻總表")}：篩選、排序、閱讀進度看板`);
		return ["## 🚀 快速入口", lines.join("\n")].join("\n\n");
	}

	/**
	 * The home page's managed region. meta: { now, layout, stats: dashboard aggregate(), entries: [{ topic, stats }],
	 * unfiled, reviews, dashboardLink, conceptIndex, latestReport, baseLink }
	 */
	function homeSection(meta) {
		let total = meta.stats ? meta.stats.total : 0;
		let info = [
			`> [!info] ZotMax 首頁：依 Zotero 分類整理 vault 裡的 ${total} 篇文獻筆記（${stamp(meta.now)} 更新）。每張主題卡連到它的主題頁；筆記本身沒有搬動。`,
			"> 想一打開 Obsidian 就看到這頁：把它加入書籤（Bookmarks），或用 Homepage 外掛設成首頁。",
		].join("\n");
		let overview = meta.layout === "board" && meta.stats ? dashboard.overviewBoard(meta.stats, { reviews: meta.reviews }) : "";
		return [info, ...(overview ? [overview] : []), topicsBlock(meta.entries || [], meta.layout, meta.unfiled || 0), quickLinks(meta)].join("\n\n");
	}

	/**
	 * A page with a managed block: new (frontmatter, # title, the block, 「✍️ 我的筆記」), or only the block and the
	 * given frontmatter keys rewritten. fields: { type, …frontmatter keys }.
	 */
	function buildPage(existing, section, title, fields) {
		let block = `${core.MARK_START}\n\n${section}\n\n${core.MARK_END}`;
		if (existing === null || existing === undefined) {
			return core.buildFrontmatter(fields, null) + `\n# ${title}\n\n${block}\n\n${USER_SECTION}`;
		}
		let { frontmatter, body } = core.splitFrontmatter(existing);
		let fm = frontmatter || "";
		for (let [k, v] of Object.entries(fields)) fm = core.setFrontmatterValue(fm, k, v);
		let start = MARK_START_RE.exec(body);
		let end = MARK_END_RE.exec(body);
		if (start && end && end.index > start.index) {
			body = body.slice(0, start.index) + block + body.slice(end.index + end[0].length);
		}
		else {
			let h1 = /^# .*$/m.exec(body);
			let at = h1 ? h1.index + h1[0].length : 0;
			body = body.slice(0, at) + "\n\n" + block + "\n" + body.slice(at);
		}
		return `---\n${fm}\n---\n` + (body.startsWith("\n") ? body : "\n" + body);
	}

	/** File names for the topics, unique (case-insensitive): [{ topic, file }]. */
	function assignFiles(topics) {
		let used = new Set([HOME_NAME.toLowerCase()]);
		return topics.map((topic) => {
			let base = topicFileName(topic.path);
			let file = base;
			for (let n = 2; used.has(file.toLowerCase()); n++) file = `${base} (${n})`;
			used.add(file.toLowerCase());
			return { topic, file };
		});
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

	async function readIfExists(path) {
		return (await IOUtils.exists(path)) ? IOUtils.readUTF8(path) : null;
	}

	async function writeIfChanged(path, text, existing) {
		if (text === existing) return false;
		await IOUtils.writeUTF8(path, text);
		return true;
	}

	/** The concept index's vault link when the file exists ("" otherwise). */
	async function conceptIndexLink(settings, folderParts) {
		try {
			let concepts = scope.ZB && scope.ZB.concepts;
			if (!concepts) return "";
			let parts = [...folderParts, ...core.splitFolder(concepts.readOptions().folder), concepts.INDEX_NAME];
			return (await IOUtils.exists(PathUtils.join(settings.vaultPath, ...parts) + ".md")) ? parts.join("/") : "";
		}
		catch (e) {
			return "";
		}
	}

	/**
	 * Write 首頁.md and 主題/*.md. ctx (from dashboard.update): { records, stats, reviews, latestReport, layout,
	 * aliases, now }. Returns { home: relPath, topics: n, written: n }.
	 */
	async function writeAll(settings, ctx) {
		let now = ctx.now || new Date();
		let folderParts = core.splitFolder(settings.defaults.obsidianFolder);
		let rel = (...p) => [...folderParts, ...p].join("/");
		let dir = PathUtils.join(settings.vaultPath, ...folderParts, TOPIC_FOLDER);
		await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
		let homeLink = rel(HOME_NAME);
		let dashboardLink = rel(dashboard.NOTE_NAME);
		let entries = [];
		let written = 0;
		let done = new Set();
		for (let { topic, file } of assignFiles(groupTopics(ctx.records))) {
			topic.link = rel(TOPIC_FOLDER, file);
			let stats = topicStats(topic, { aliases: ctx.aliases, now });
			entries.push({ topic, stats });
			let path = PathUtils.join(dir, file + ".md");
			done.add(path);
			let existing = await readIfExists(path);
			let text = buildPage(existing, topicSection(topic, stats, { now, layout: ctx.layout, homeLink, dashboardLink }), topic.name,
				{ type: "topic", zotero_collection: topic.path, studies: stats.total, updated: now.toISOString() });
			if (await writeIfChanged(path, text, existing)) written++;
		}
		// Topic pages left from collections that have no notes now: their block says so
		for (let child of await IOUtils.getChildren(dir)) {
			if (done.has(child) || !/\.md$/i.test(child)) continue;
			try {
				let existing = await IOUtils.readUTF8(child);
				let fm = dashboard.parseFrontmatter(core.splitFrontmatter(existing).frontmatter || "");
				if (fm.type !== "topic") continue;
				let text = buildPage(existing, staleSection(String(fm.zotero_collection || ""), { now }), "", { studies: 0 });
				if (await writeIfChanged(child, text, existing)) written++;
			}
			catch (e) {
				Zotero.debug(`ZotMax: topics skipped ${child}: ${e}`);
			}
		}
		let unfiled = ctx.records.filter(r => !r.deleted && !(r.collections || []).length).length;
		let baseLink = (await IOUtils.exists(PathUtils.join(settings.vaultPath, ...folderParts, "Zotero 文獻庫.base"))) ? rel("Zotero 文獻庫.base") : "";
		let section = homeSection({
			now, layout: ctx.layout, stats: ctx.stats, entries, unfiled, reviews: ctx.reviews, dashboardLink,
			conceptIndex: await conceptIndexLink(settings, folderParts), latestReport: ctx.latestReport, baseLink,
		});
		let homePath = PathUtils.join(settings.vaultPath, ...folderParts, HOME_NAME + ".md");
		let existing = await readIfExists(homePath);
		let text = buildPage(existing, section, HOME_NAME, { type: "home", updated: now.toISOString() });
		if (await writeIfChanged(homePath, text, existing)) written++;
		return { home: rel(HOME_NAME + ".md"), topics: entries.length, written };
	}

	/** Called by dashboard.update(); off with the pref dashboard.topicPages = false. Never throws. */
	async function afterDashboard(settings, ctx) {
		try {
			if (pref("dashboard.topicPages") === false || !settings || !settings.vaultPath) return null;
			return await writeAll(settings, ctx);
		}
		catch (e) {
			Zotero.logError(e);
			return null;
		}
	}

	return {
		HOME_NAME, TOPIC_FOLDER, DIRECTIONS, UNJUDGED, MAX_CARDS,
		topicFileName, groupTopics, tally, verdict, termGroups, trendOf, topicStats, nextSteps,
		topicOverview, topicSection, staleSection, topicCard, topicsBlock, quickLinks, homeSection, buildPage, assignFiles,
		writeAll, afterDashboard,
	};
});
