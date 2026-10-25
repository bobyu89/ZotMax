/*
 * ZotMax — 首頁 and 主題頁: the vault organised by Zotero collection.
 *
 *   00 首頁.md (首頁.md flat)      the front page: ▶️ 從這裡開始 (繼續閱讀, 待核對的評讀, 最近加入), the 總覽 number
 *                                  cards, one card per topic (a Zotero collection that has literature notes), quick links.
 *   10 文獻/<collection>/00 <name> 總覽.md (主題/<collection>.md flat)
 *                                  one page per topic (看板: links, 主題總覽, the 證據 cards, 下一步 and the gap map open,
 *                                  the tables below folded): 總覽 cards, 🧭 證據說什麼 (the notes' effect_direction by
 *                                  intervention), 📈 趨勢 (the last five publication years against the five before,
 *                                  common interventions and outcomes), 🕳️ 研究缺口與下一步 (rules and the evidence gap
 *                                  map) and 📚 文獻 (every paper with its design, level, direction and status).
 *   …/00 <name> 證據地圖.canvas    the topic as an Obsidian Canvas: the page on top, the papers grouped by direction.
 *
 * Where the files go is core.js's vault layout (organized or flat); a note in two collections shows up on both topic
 * pages. Built together with the 研究儀表板 (dashboard.js update(), pref dashboard.topicPages) from the notes'
 * frontmatter only: no network, no AI. Only the %% zotero-bridge:start/end %% block is rewritten; 「✍️ 我的筆記」
 * and the user's frontmatter keys stay. A topic page whose collection has no notes any more keeps the user's part
 * and says so; a canvas the user added cards to is never rewritten.
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
			steps.push({ gap: true, short: "還沒有 RCT 或系統性回顧", text: "**還沒有 RCT 或系統性回顧（CEBM 1–2）**：到 PubMed 用 Clinical Queries，或篩選 Randomized Controlled Trial、Systematic Review 補找。" });
		}
		if (s.rct >= 3 && !s.reviews) {
			steps.push({ gap: true, short: `${s.rct} 篇 RCT，還沒有系統性回顧`, text: `**已有 ${s.rct} 篇 RCT，但還沒有系統性回顧**：先查 Cochrane Library 和 PROSPERO 有沒有人做過；沒有的話，這可能就是寫系統性回顧或統合分析的機會。` });
		}
		let d = s.directions;
		if (d.judged >= 2 && (s.verdict.label === "結論分歧" || d["不一致"])) {
			steps.push({ gap: true, short: "結論分歧，值得比較", text: `**結論分歧**（${DIRECTIONS.filter(k => d[k]).map(k => `${k} ${d[k]}`).join("、")}）：比較各篇的族群、介入劑量和測量工具；這正是 GRADE 的 inconsistency 要看的地方。` });
		}
		let pairs = emptyPairs(s.map);
		if (s.map.studied >= 2 && pairs.length) {
			steps.push({ gap: true, short: `缺口：${pairs[0]}`, text: `**還沒有研究的組合**：${pairs.join("、")}。可能是研究缺口，先用 PICO 問題卡搜一次，確認不是漏找。` });
		}
		if (s.trend.newest && s.trend.newest <= s.trend.to - RECENT_YEARS) {
			steps.push({ gap: true, short: `最新一篇是 ${s.trend.newest} 年`, text: `**最新一篇是 ${s.trend.newest} 年**：補找近 ${RECENT_YEARS} 年的研究，指引和臨床做法可能已經更新。` });
		}
		if (s.medianSample !== null && s.medianSample < SMALL_SAMPLE) {
			steps.push({ gap: true, short: `樣本數中位數 ${s.medianSample} 人`, text: `**樣本數中位數只有 ${s.medianSample} 人**：結果的精確度有限（GRADE 的 imprecision），留意樣本較大的研究或統合分析。` });
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

	// ---------- the 看板 topic page ----------

	// One square per paper by conclusion direction (the canvas groups' colours), the legend's dot for each
	const DIRECTION_SQUARES = { "有效": "🟩", "無差異": "🟦", "有害": "🟥", "不一致": "🟧", [UNJUDGED]: "⬜" };
	const DIRECTION_DOTS = { "有效": "🟢", "無差異": "🔵", "有害": "🔴", "不一致": "🟠", [UNJUDGED]: "⚪" };
	const DIRECTION_ORDER = [...DIRECTIONS, UNJUDGED];
	const TOPIC_SQUARES = 10;
	const ROW_SQUARES = 8;
	const TOPIC_YEARS = 8;

	/** A tally as squares, `scale` squares per paper; every direction with papers keeps at least one. */
	function directionSquares(t, scale = 1) {
		return DIRECTION_ORDER.filter(k => t[k]).map(k => DIRECTION_SQUARES[k].repeat(Math.max(1, Math.round(t[k] * scale)))).join("");
	}

	function directionLegend(t) {
		return DIRECTION_ORDER.filter(k => t[k]).map(k => `${DIRECTION_DOTS[k]} ${k} ${t[k]}`).join(" · ");
	}

	/** A chart card: lines with hard breaks between them. */
	function chart(title, lines, wide) {
		let rows = lines.filter(Boolean);
		return [`> [!zm-chart${wide ? "|wide" : ""}] ${title}`, ...rows.map((l, k) => `> ${l}${k < rows.length - 1 ? "  " : ""}`)].join("\n");
	}

	/**
	 * 「證據」: what the topic's papers say, as cards — 結論方向 (one square per paper by direction; the verdict itself is
	 * on 主題總覽), 依介入 (the same squares per intervention, with the best CEBM level), 研究量 (papers per year) and
	 * the strongest papers. Only the cards with data; the outcomes are the gap map's columns.
	 */
	function evidenceBoard(topic, s) {
		let cards = [];
		let d = s.directions;
		let all = DIRECTION_ORDER.reduce((n, k) => n + (d[k] || 0), 0);
		if (all) {
			cards.push(chart("結論方向", [
				directionSquares(d, all > TOPIC_SQUARES ? TOPIC_SQUARES / all : 1),
				directionLegend(d),
				d.judged ? "AI 初判，不是 GRADE" : "等新版 AI 筆記判斷結論方向",
			]));
		}
		let rows = s.interventions.slice(0, TOP_TERMS).filter(g => g.records.length);
		if (rows.length) {
			let max = Math.max(...rows.map(g => g.records.length));
			let scale = max > ROW_SQUARES ? ROW_SQUARES / max : 1;
			cards.push(chart("依介入", rows.map(g => `${g.name} ${directionSquares(g.tally, scale)} ${g.records.length}${g.best ? ` · L${g.best}` : ""}`)));
		}
		let t = s.trend;
		if (t.dated) {
			let years = dashboard.lastRows(t.rows, TOPIC_YEARS);
			let max = Math.max(1, ...years.map(([, n]) => n));
			cards.push(chart("研究量", [
				t.oldest === t.newest ? `都是 ${t.newest} 年` : `最早 ${t.oldest} · 最新 ${t.newest}`,
				...years.map(([y, n]) => `${y} ${core.bar(n, max, 10)} ${n}`),
			]));
		}
		let strong = topic.records.filter(r => r.evidenceLevel || r.studyDesign).sort(sortForList);
		if (strong.length) {
			cards.push(dashboard.listCard("zm-reading|wide", `證據等級最高的文獻（${strong.length}）`, strong.map(r => {
				let facts = [yearOf(r), designLabel(r.studyDesign), r.evidenceLevel ? `CEBM ${r.evidenceLevel}` : "", directionOf(r) === UNJUDGED ? "" : r.direction];
				return `- ${wikilink(r.link, shortTitle(r))} · ${facts.filter(Boolean).join(" · ")}`;
			})));
		}
		return cards.length ? board("證據", cards) : "";
	}

	/** 「研究缺口與下一步」 as the amber card, the steps in their priority. */
	function stepsBoard(s) {
		return board("研究缺口與下一步", [[`> [!zm-next|wide] 下一步（${s.steps.length}）`, ...s.steps.map(x => `> - ${x.text}`)].join("\n")]);
	}

	/** A section folded under a title of its own (its "## …" heading dropped). */
	function foldAs(title, md) {
		return dashboard.foldSection(String(md).replace(/^##[ \t]+.+/, `## ${title}`));
	}

	/**
	 * The 看板 layout's topic page: the update note (folded), the links as buttons, 主題總覽, 證據, 研究缺口與下一步,
	 * the evidence gap map, then the full tables folded — 結論方向與介入, 趨勢, 文獻.
	 */
	function boardTopic(topic, s, meta = {}) {
		let links = [
			meta.homeLink ? wikilink(meta.homeLink, `🏠 ${HOME_NAME}`) : "",
			meta.dashboardLink ? wikilink(meta.dashboardLink, "📊 研究儀表板") : "",
			meta.canvasLink ? wikilink(meta.canvasLink, "🗺️ 證據地圖") : "",
			meta.bot ? wikilink(meta.bot.link, botLabel(meta.bot)) : "",
			meta.backLink || "",
		].filter(Boolean);
		return [
			dashboard.metaCallout(`🧭 ${topic.path} · ${s.total} 篇 · ${stamp(meta.now)} 更新`, [
				`由 ZotMax 依 Zotero 分類「${topic.path}」的 ${s.total} 篇文獻筆記產生；只讀筆記的 frontmatter，不連網、不呼叫 AI。`,
				meta.organized
					? "這個分類的文獻筆記就在這頁所在的資料夾；同時屬於幾個分類的，放在最深的那個分類，其他主題頁連過去。"
					: "筆記沒有搬動，一篇在幾個分類，就會出現在幾個主題頁。",
			]),
			links.length ? `> [!zm-links] 前往\n> ${links.join(" · ")}` : "",
			topicOverview(s, "board"),
			meta.planet || "",
			evidenceBoard(topic, s),
			stepsBoard(s),
			gapMapSection(s.map, { level: 2, board: true }),
			foldAs("結論方向與介入", directionSection(s)),
			foldAs("趨勢與常見詞", trendSection(s)),
			foldAs(`文獻（${topic.records.length} 篇）`, paperSection(topic.records)),
		].filter(Boolean).join("\n\n");
	}

	/** 「🤖 搜尋機器人（待看 12 · ⭐⭐⭐ 3）」 for a topic-bot.js botSummaries() entry. */
	function botLabel(b) {
		return `🤖 搜尋機器人（待看 ${b.pending}${b.high ? ` · ⭐⭐⭐ ${b.high}` : ""}）`;
	}

	/**
	 * A topic page's managed region. meta: { now, layout, homeLink, dashboardLink, organized, canvasLink,
	 * bot: the collection's topic bot (topic-bot.js botSummaries()), planet: 「🪐 星球」 (planet.js planetSection) on a
	 * planet's page, backLink: 「🪐 回到星球」 on an island's page }
	 */
	function topicSection(topic, s, meta = {}) {
		if (meta.layout === "board") return boardTopic(topic, s, meta);
		let links = [
			meta.homeLink ? `← ${wikilink(meta.homeLink, HOME_NAME)}` : "",
			meta.dashboardLink ? wikilink(meta.dashboardLink, "研究儀表板") : "",
			meta.canvasLink ? `🗺️ ${wikilink(meta.canvasLink, "證據地圖（Canvas）")}` : "",
			meta.bot ? wikilink(meta.bot.link, botLabel(meta.bot)) : "",
			meta.backLink || "",
		].filter(Boolean).join(" · ");
		let info = [
			`> [!info] 由 ZotMax 依 Zotero 分類「${topic.path}」的 ${s.total} 篇文獻筆記於 ${stamp(meta.now)} 產生；只讀筆記的 frontmatter，不連網、不呼叫 AI。`,
			meta.organized
				? "> 這個分類的文獻筆記就在這頁所在的資料夾；同時屬於幾個分類的，放在最深的那個分類，其他主題頁連過去。"
				: "> 筆記沒有搬動，一篇在幾個分類，就會出現在幾個主題頁。",
			...(links ? [`> ${links}`] : []),
		].join("\n");
		return [info, topicOverview(s, meta.layout), meta.planet || "", directionSection(s), trendSection(s), gapSection(s), paperSection(topic.records)].filter(Boolean).join("\n\n");
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
		if (meta.layout === "board") return boardHome(meta, total);
		let info = [
			`> [!info] ZotMax 首頁：依 Zotero 分類整理 vault 裡的 ${total} 篇文獻筆記（${stamp(meta.now)} 更新）。每張主題卡連到它的主題頁`
				+ (meta.organized ? "，主題頁和那個分類的文獻在同一個資料夾。" : "；筆記本身沒有搬動。"),
			"> 想一打開 Obsidian 就看到這頁：把它加入書籤（Bookmarks），或用 Homepage 外掛設成首頁。",
		].join("\n");
		let start = startHere(meta.records || [], { now: meta.now, layout: meta.layout, bots: meta.bots });
		let overview = meta.layout === "board" && meta.stats ? dashboard.overviewBoard(meta.stats, { reviews: meta.reviews }) : "";
		return [info, ...(start ? [start] : []), ...(overview ? [overview] : []), topicsBlock(meta.entries || [], meta.layout, meta.unfiled || 0), quickLinks(meta)].join("\n\n");
	}

	/**
	 * The 看板 layout's home page: the update note (folded), 從這裡開始, four number cards, the topic cards and the quick
	 * links as one row of buttons.
	 */
	function boardHome(meta, total) {
		let parts = [dashboard.metaCallout(`🏠 ${total} 篇文獻筆記 · ${stamp(meta.now)} 更新`, [
			"ZotMax 依 Zotero 分類整理 vault 裡的文獻筆記。每張主題卡連到它的主題頁"
				+ (meta.organized ? "，主題頁和那個分類的文獻在同一個資料夾。" : "；筆記本身沒有搬動。"),
			"想一打開 Obsidian 就看到這頁：把它加入書籤（Bookmarks），或用 Homepage 外掛設成首頁。",
		])];
		let start = startHere(meta.records || [], { now: meta.now, layout: "board", bots: meta.bots });
		if (start) parts.push(start);
		if (meta.stats && meta.stats.total) parts.push(dashboard.overviewBoard(meta.stats, { reviews: meta.reviews, compact: true }));
		parts.push(topicsBlock(meta.entries || [], "board", meta.unfiled || 0), quickLinkBar(meta));
		return parts.filter(Boolean).join("\n\n");
	}

	/** The quick links as a callout of links the snippet sets out as buttons (看板 layout). */
	function quickLinkBar(meta) {
		let links = [];
		if (meta.dashboardLink) links.push(wikilink(meta.dashboardLink, "📊 研究儀表板"));
		for (let r of (meta.reviews || []).slice(0, 3)) links.push(wikilink(r.link, `🗂️ ${r.title}`));
		if (meta.conceptIndex) links.push(wikilink(meta.conceptIndex, "🧠 概念索引"));
		if (meta.latestReport) links.push(wikilink(meta.latestReport.link, `📝 進度報告 ${meta.latestReport.date}`));
		if (meta.baseLink) links.push(wikilink(meta.baseLink, "📚 文獻總表"));
		return `> [!zm-links] 快速入口\n> ${links.join(" · ")}`;
	}

	const START_ROWS = 5;
	const RECENT_DAYS = 14;

	/**
	 * 「▶️ 從這裡開始」 on the home page: what to open next. 繼續閱讀 (閱讀中, else the newest 待讀), 待核對的評讀 (an AI
	 * appraisal not yet checked against the paper), 最近加入 (the last 14 days). "" when there is nothing.
	 */
	function startHere(records, opts = {}) {
		let now = opts.now || new Date();
		let live = records.filter(r => !r.deleted);
		let newest = (a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)) || a.title.localeCompare(b.title, "zh-Hant");
		let line = r => `- ${wikilink(r.link, shortTitle(r))}${yearOf(r) ? ` · ${yearOf(r)}` : ""}${r.studyDesign ? ` · ${designLabel(r.studyDesign)}` : ""}`;
		let reading = live.filter(r => r.status === "閱讀中").sort(newest);
		let readingTitle = "繼續閱讀";
		if (!reading.length) {
			reading = live.filter(r => !r.status || r.status === "待讀").sort(newest);
			readingTitle = "下一篇讀這個";
		}
		let verify = live.filter(r => r.appraisal && !r.appraisalVerified && r.status !== "待讀").sort(newest);
		let cutoff = now.getTime() - RECENT_DAYS * 86400000;
		let recent = live.filter(r => Date.parse(r.dateAdded) >= cutoff).sort(newest);
		// Topic bots with papers waiting, most high-scoring first
		let bots = (opts.bots || []).filter(b => b.pending > 0).sort((a, b) => b.high - a.high || b.pending - a.pending || a.name.localeCompare(b.name, "zh-Hant"));
		let botLine = b => `- ${wikilink(b.link, b.path)} · 待看 ${b.pending} 篇${b.high ? ` · ⭐⭐⭐ ${b.high}` : ""}`;
		let groups = [
			["zm-reading", `${readingTitle}（${reading.length}）`, reading],
			["zm-appraisal", `待核對的評讀（${verify.length}）`, verify],
			["zm-inbox", `最近 ${RECENT_DAYS} 天加入（${recent.length}）`, recent],
			["zm-inbox", `🤖 搜尋機器人的新候選（${bots.reduce((n, b) => n + b.pending, 0)} 篇）`, bots, botLine],
		].filter(([, , list]) => list.length);
		if (!groups.length) return "";
		let body = ([type, title, list, fmt]) => [...list.slice(0, START_ROWS).map(fmt || line), ...(list.length > START_ROWS ? [`- ……還有 ${list.length - START_ROWS} ${fmt ? "個" : "篇"}`] : [])].join("\n");
		if (opts.layout !== "board") {
			return ["## ▶️ 從這裡開始", ...groups.map(g => `**${g[1]}**\n${body(g)}`)].join("\n\n");
		}
		let cards = groups.map(g => [`> [!${g[0]}] ${g[1]}`, ...body(g).split("\n").map(l => `> ${l}`)].join("\n"));
		return [`> [!zm-board] ▶️ 從這裡開始`, ...cards.map(c => c.split("\n").map(l => `> ${l}`).join("\n"))].join("\n>\n");
	}

	function shortTitle(r) {
		let t = String(r.title || r.name || "");
		return cell(t.length > 60 ? t.slice(0, 58).trim() + "…" : t);
	}

	// Canvas colours (JSON Canvas presets) for the directions
	const CANVAS_COLORS = { "有效": "4", "無差異": "5", "有害": "1", "不一致": "2" };
	const CANVAS = { cardW: 320, cardH: 120, gap: 24, colGap: 60, groupPad: 30, head: 60 };

	/**
	 * A topic's evidence map as a JSON Canvas (Obsidian .canvas): the topic page on top, one group per effect
	 * direction (有效 / 無差異 / 有害 / 不一致 / 未判定), a card per paper with its design, level, size, intervention and
	 * outcomes, best evidence first. Node ids start with "zm-" (writeCanvas() tells them from the user's).
	 */
	function evidenceCanvas(topic, opts = {}) {
		let nodes = [];
		let edges = [];
		let { cardW, cardH, gap, colGap, groupPad, head } = CANVAS;
		let live = (topic.records || []).filter(r => !r.deleted);
		let columns = [...DIRECTIONS, UNJUDGED].map(d => [d, live.filter(r => directionOf(r) === d).sort(sortForList)]).filter(([, list]) => list.length);
		let colW = cardW + groupPad * 2;
		let totalW = columns.length * colW + Math.max(0, columns.length - 1) * colGap;
		let topW = 560;
		nodes.push({ id: "zm-topic", type: opts.topicFile ? "file" : "text", ...(opts.topicFile ? { file: opts.topicFile } : { text: `# ${topic.name}` }),
			x: Math.round((totalW - topW) / 2), y: 0, width: topW, height: 260 });
		nodes.push({ id: "zm-info", type: "text", text: `由 ZotMax 自動產生（${stamp(opts.now)}），依結論方向分組；每次更新研究儀表板會重新排列。想自己排，請另存一份 Canvas。`,
			x: Math.round((totalW - topW) / 2), y: -110, width: topW, height: 80 });
		columns.forEach(([dir, list], i) => {
			let x = i * (colW + colGap);
			let y = 360;
			let h = head + list.length * (cardH + gap) - gap + groupPad;
			let gid = `zm-group-${i}`;
			nodes.push(Object.assign({ id: gid, type: "group", label: `${dir}（${list.length}）`, x, y, width: colW, height: h }, CANVAS_COLORS[dir] ? { color: CANVAS_COLORS[dir] } : {}));
			edges.push(Object.assign({ id: `zm-edge-${i}`, fromNode: "zm-topic", fromSide: "bottom", toNode: gid, toSide: "top" }, CANVAS_COLORS[dir] ? { color: CANVAS_COLORS[dir] } : {}));
			list.forEach((r, k) => {
				let facts = [designLabel(r.studyDesign), r.sampleSize !== null && r.sampleSize !== undefined ? `N = ${r.sampleSize}` : "", r.evidenceLevel ? `CEBM ${r.evidenceLevel}` : "", r.status].filter(Boolean).join(" · ");
				let text = [`**${wikilink(r.link, shortTitle(r))}**${yearOf(r) ? ` (${yearOf(r)})` : ""}`, facts,
					r.intervention ? `I：${oneLineShort(r.intervention)}` : "", r.outcomes ? `O：${oneLineShort(r.outcomes)}` : ""].filter(Boolean).join("\n");
				nodes.push(Object.assign({ id: `zm-paper-${i}-${k}`, type: "text", text, x: x + groupPad, y: y + head + k * (cardH + gap), width: cardW, height: cardH },
					CANVAS_COLORS[dir] ? { color: CANVAS_COLORS[dir] } : {}));
			});
		});
		return JSON.stringify({ nodes, edges }, null, "\t");
	}

	function oneLineShort(t) {
		let s = String(t || "").replace(/\s+/g, " ").trim();
		return s.length > 70 ? s.slice(0, 68).trim() + "…" : s;
	}

	/** May we (re)write this canvas? Not when it has nodes the user added (ids without the "zm-" prefix). */
	function canvasIsOurs(text) {
		if (text === null || text === undefined) return true;
		try {
			let data = JSON.parse(text);
			let nodes = (data && data.nodes) || [];
			return nodes.some(n => n && n.id === "zm-info") && nodes.every(n => n && String(n.id).startsWith("zm-"));
		}
		catch (e) {
			return false;
		}
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
	async function conceptIndexLink(settings) {
		try {
			let concepts = scope.ZB && scope.ZB.concepts;
			if (!concepts) return "";
			let parts = [...concepts.folderParts(settings), concepts.INDEX_NAME];
			return (await IOUtils.exists(PathUtils.join(settings.vaultPath, ...parts) + ".md")) ? parts.join("/") : "";
		}
		catch (e) {
			return "";
		}
	}

	/**
	 * Write 首頁.md and the topic pages: 主題/*.md (flat) or "00 <name> 總覽.md" in each collection's folder under
	 * 10 文獻 (organized, core.js LAYOUTS). ctx (from dashboard.update): { records, stats, reviews, latestReport,
	 * layout, aliases, now }. Returns { home: relPath, topics: n, written: n }.
	 */
	async function writeAll(settings, ctx) {
		let now = ctx.now || new Date();
		let organized = core.structureOf(settings) === "organized";
		let folderParts = core.splitFolder(settings.defaults.obsidianFolder);
		let rel = (...p) => [...folderParts, ...p].join("/");
		let homeName = core.vaultPage(settings, "home");
		let homeLink = rel(homeName);
		let dashboardLink = rel(core.vaultPage(settings, "dashboard"));
		let entries = [];
		let written = 0;
		let done = new Set();
		let bots = topicBots();
		let botFor = path => bots.find(b => b.path === path) || null;
		// 星球與島嶼 (planet.js): a planet whose notes all sit in its sub-collections still gets a page
		let P = planetModule();
		let planets = P ? P.findPlanets(ctx.records) : [];
		let groups = groupTopics(ctx.records);
		for (let pl of planets) {
			if (!groups.some(t => t.path === pl.path)) groups.push({ path: pl.path, name: pl.name, parent: pl.parent, records: pl.records });
		}
		groups.sort((a, b) => b.records.length - a.records.length || a.path.localeCompare(b.path, "zh-Hant"));
		let pages = assignFiles(groups).map(({ topic, file }) => {
			let page = core.topicPage(settings, topic.path, file);
			topic.link = [...page.dirParts, page.name].join("/");
			return { topic, page };
		});
		let linkOf = (path) => {
			let hit = pages.find(x => x.topic.path === path);
			return hit ? hit.topic.link : "";
		};
		let vaultName = PathUtils.filename(settings.vaultPath);
		let worlds = new Map();
		let maps = [];
		let history = P ? P.readHistory() : null;
		for (let pl of planets) {
			try {
				let bot = botFor(pl.path);
				let data = P.planetData(pl, {
					stats: records => topicStats({ records }, { aliases: ctx.aliases, now }), designLabel, squares: t => directionSquares(t),
					link: path => (linkOf(path) ? core.obsidianURI(vaultName, linkOf(path)) : ""), planetLink: core.obsidianURI(vaultName, linkOf(pl.path)),
					card: P.cardForPath(pl.path), bot, botLink: bot ? core.obsidianURI(vaultName, bot.link) : "", aliases: ctx.aliases,
					levelUps: ((history && history.events) || []).filter(e => e.planet === pl.path), now,
				});
				history = P.nextHistory(history, pl, pl.islands.map((island, k) => ({ island, n: data.islands[k] })), now);
				worlds.set(pl.path, { planet: pl, data });
			}
			catch (e) {
				Zotero.logError(e);
			}
		}
		if (P && planets.length) P.saveHistory(history);
		for (let { topic, page } of pages) {
			let stats = topicStats(topic, { aliases: ctx.aliases, now });
			entries.push({ topic, stats });
			let dir = PathUtils.join(settings.vaultPath, ...page.dirParts);
			await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
			let path = PathUtils.join(dir, page.name + ".md");
			done.add(path);
			// 🗺️ 證據地圖 next to the topic page; one the user added cards to is left alone
			let canvasLink = "";
			if (pref("dashboard.canvas") !== false) {
				let canvasName = page.name.replace(/ 總覽$/, "") + " 證據地圖.canvas";
				let canvasPath = PathUtils.join(dir, canvasName);
				try {
					let old = await readIfExists(canvasPath);
					if (canvasIsOurs(old)) {
						let json = evidenceCanvas(topic, { now, topicFile: [...page.dirParts, page.name + ".md"].join("/") });
						// The info node's time changes every run: compare without it
						let same = old !== null && old.replace(/"text": "由 ZotMax 自動產生（[^）]*）/, "") === json.replace(/"text": "由 ZotMax 自動產生（[^）]*）/, "");
						if (!same && await writeIfChanged(canvasPath, json, old)) written++;
					}
					canvasLink = [...page.dirParts, canvasName].join("/");
				}
				catch (e) {
					Zotero.debug(`ZotMax: no evidence map for ${topic.path}: ${e}`);
				}
			}
			// 🪐 the planet's islands and its map; an island links back to its planet
			let planetMd = "";
			let world = worlds.get(topic.path);
			if (world) {
				try {
					world.data.note = P.mapNote(now);
					let map = await P.writeMap(dir, page.name, world.data);
					maps.push({ path: topic.path, file: map.path });
					let links = Object.fromEntries(world.planet.islands.map(is => [is.path, linkOf(is.path)]));
					planetMd = P.planetSection(world.planet, world.data, { layout: ctx.layout, links, mapURL: map.url, botLink: world.data.harbor ? botFor(topic.path).link : "" });
				}
				catch (e) {
					Zotero.logError(e);
				}
			}
			let home = P ? P.planetOf(planets.filter(pl => pl.path !== topic.path && worlds.has(pl.path)), topic.path) : null;
			let island = home && P.islandOf(home, topic.path);
			let backLink = island
				? P.backLink(linkOf(home.path), home.name, island.path === topic.path ? worlds.get(home.path).data.islands[home.islands.indexOf(island)].dev : null) : "";
			let existing = await readIfExists(path);
			let text = buildPage(existing, topicSection(topic, stats, { now, layout: ctx.layout, homeLink, dashboardLink, organized, canvasLink, bot: botFor(topic.path), planet: planetMd, backLink }), topic.name,
				{ type: "topic", zotero_collection: topic.path, studies: stats.total, updated: now.toISOString() });
			if (await writeIfChanged(path, text, existing)) written++;
		}
		// Topic pages left from collections that have no notes now: their block says so
		for (let child of await topicPageFiles(settings)) {
			if (done.has(child)) continue;
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
		let systemParts = core.vaultFolder(settings, "system");
		let baseLink = (await IOUtils.exists(PathUtils.join(settings.vaultPath, ...systemParts, "Zotero 文獻庫.base"))) ? [...systemParts, "Zotero 文獻庫.base"].join("/") : "";
		let section = homeSection({
			now, layout: ctx.layout, stats: ctx.stats, entries, unfiled, reviews: ctx.reviews, dashboardLink, organized, records: ctx.records,
			conceptIndex: await conceptIndexLink(settings), latestReport: ctx.latestReport, baseLink, bots,
		});
		let homePath = PathUtils.join(settings.vaultPath, ...folderParts, homeName + ".md");
		let existing = await readIfExists(homePath);
		let text = buildPage(existing, section, HOME_NAME, { type: "home", updated: now.toISOString() });
		if (await writeIfChanged(homePath, text, existing)) written++;
		return { home: rel(homeName + ".md"), topics: entries.length, written, organized, planets: maps };
	}

	/** planet.js while its switch (pref dashboard.planet) is on; null otherwise. */
	function planetModule() {
		let P = scope.ZB && scope.ZB.planet;
		return P && P.enabled() ? P : null;
	}

	/** The topic bots' summaries (topic-bot.js), while its switch is on; [] otherwise. */
	function topicBots() {
		let ZB = scope.ZB;
		try {
			if (!ZB || !ZB.topicBot || (ZB.features && !ZB.features.isEnabled("topicBot"))) return [];
			return ZB.topicBot.botSummaries(ZB.topicBot.readBots());
		}
		catch (e) {
			Zotero.logError(e);
			return [];
		}
	}

	/** Every topic page there is: 主題/*.md (flat), or "00 … 總覽.md" anywhere under 10 文獻 (organized). */
	async function topicPageFiles(settings) {
		if (core.structureOf(settings) !== "organized") {
			let dir = PathUtils.join(settings.vaultPath, ...core.vaultFolder(settings, "topics"));
			try {
				return (await IOUtils.getChildren(dir)).filter(c => /\.md$/i.test(c));
			}
			catch (e) {
				return [];
			}
		}
		let out = [];
		let visit = async (dir, depth) => {
			let children;
			try {
				children = await IOUtils.getChildren(dir);
			}
			catch (e) {
				return;
			}
			for (let child of children) {
				let name = PathUtils.filename(child);
				if (name.startsWith(".")) continue;
				if (/^00 .+ 總覽\.md$/.test(name)) out.push(child);
				else if (depth < 16 && !/\.[a-z0-9]+$/i.test(name) && (await IOUtils.stat(child)).type === "directory") await visit(child, depth + 1);
			}
		};
		await visit(PathUtils.join(settings.vaultPath, ...core.vaultFolder(settings, "literature")), 0);
		return out;
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
		topicOverview, topicSection, boardTopic, evidenceBoard, directionSquares, designLabel, staleSection, topicCard, topicsBlock, quickLinks, quickLinkBar, homeSection, boardHome, startHere, evidenceCanvas, canvasIsOurs, buildPage, assignFiles,
		writeAll, afterDashboard,
	};
});
