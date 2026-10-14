/*
 * ZotMax — GRADE 證據確定性: the certainty of a body of evidence, per outcome, across the studies of a research
 * project (a Zotero collection), and the Summary of Findings table (Guyatt et al., 2008; GRADE Handbook, Schünemann
 * et al., 2013).
 *
 *   Outcomes   the user names them (suggestions: the PICO 問題卡's O and the outcomes the AI notes found), rates
 *              each 關鍵／重要／不重要, ticks the studies that measured it (pre-ticked by a word match on the AI
 *              note's outcomes) and writes the effect (e.g. RR 0.70, 95% CI 0.55–0.89) and the participants.
 *   Rating     randomized trials start at 高 (⊕⊕⊕⊕), observational studies at 低 (⊕⊕◯◯). Five reasons to rate down
 *              (risk of bias, inconsistency, indirectness, imprecision, publication bias: −1 serious, −2 very
 *              serious) and, for observational evidence, three to rate up (large effect +1/+2, dose–response,
 *              plausible confounding). Every step the user chooses, with a reason that becomes a footnote.
 *   Hints      rules on what ZotMax already knows, never a rating: the appraisal verdicts and whether they were
 *              verified (risk of bias), the AI notes' effect_direction (inconsistency), the PICO card's word match
 *              (indirectness), the total N against the optimal information size rule of thumb (imprecision), the
 *              number of studies for a funnel plot (publication bias). No AI, no network.
 *   Output     a note in the vault's Reviews folder (or the folder from the settings, else Downloads) with the
 *              Summary of Findings table, the evidence profile (every domain per outcome) and the included
 *              studies' appraisals; a CSV; an HTML file Word opens; 「複製成表格」 for pasting into Word.
 *
 * The rating is saved per collection in the pref grade.tables, so it can be revised as studies are added.
 * The functions down to "the window" are pure (Node tests); the window is DOM only; the rest needs Zotero.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(require("./core.js"), require("./screening.js"), globalThis);
	}
	else {
		(root.ZB = root.ZB || {}).grade = factory(root.ZB.core, root.ZB.screening, root);
	}
})(this, function (core, screening, scope) {
	const PREF = "extensions.zotero-bridge.";
	const FEATURE = "grade";
	const TITLE = "GRADE 證據確定性";
	const URL = "chrome://zotero-bridge/content/grade.xhtml";
	const ROOT = "zb-grade";
	const HTML_NS = "http://www.w3.org/1999/xhtml";
	const REVIEW_FOLDER = "Reviews";
	const MAX_OUTCOMES = 7;
	const MAX_SUGGESTIONS = 8;
	// GRADE's rule of thumb for the optimal information size of a continuous outcome (about 400 participants);
	// a dichotomous outcome needs about 300 events, which the AI notes don't carry
	const OIS_PARTICIPANTS = 400;
	// Funnel plots and the tests for small-study effects need about ten studies
	const FUNNEL_STUDIES = 10;

	const LEVELS = [
		{ score: 4, label: "高", en: "High", symbol: "⊕⊕⊕⊕", meaning: "非常有把握真正的效果接近估計值" },
		{ score: 3, label: "中", en: "Moderate", symbol: "⊕⊕⊕◯", meaning: "對估計值有中等把握：真正的效果可能接近，但也可能有明顯差異" },
		{ score: 2, label: "低", en: "Low", symbol: "⊕⊕◯◯", meaning: "把握有限：真正的效果可能和估計值有明顯差異" },
		{ score: 1, label: "極低", en: "Very low", symbol: "⊕◯◯◯", meaning: "幾乎沒有把握：真正的效果很可能和估計值有明顯差異" },
	];
	const DOMAINS = [
		{ id: "rob", label: "偏誤風險", en: "Risk of bias", question: "納入研究的偏誤風險（RoB 2／ROBINS-I 或 CASP、JBI 評讀）會不會讓你懷疑這個效果？" },
		{ id: "inconsistency", label: "不一致性", en: "Inconsistency", question: "各研究的結果方向和大小一致嗎？信賴區間重疊嗎？I² 高不高？" },
		{ id: "indirectness", label: "間接性", en: "Indirectness", question: "研究的族群、介入、對照、結果和你的問題一樣嗎？還是只是相近？" },
		{ id: "imprecision", label: "不精確性", en: "Imprecision", question: "樣本夠大嗎？95% CI 會不會同時包含有益和無效（或跨過臨床決策的門檻）？" },
		{ id: "publication", label: "發表偏誤", en: "Publication bias", question: "會不會只有小型、正向或廠商贊助的研究被發表？有沒有找灰色文獻和試驗登錄？" },
	];
	const DOWN = [
		{ value: 0, label: "不降級", en: "not serious" },
		{ value: 1, label: "降一級（嚴重）", en: "serious" },
		{ value: 2, label: "降兩級（非常嚴重）", en: "very serious" },
	];
	const UPGRADES = [
		{ id: "large", label: "效果很大", en: "Large effect", max: 2, question: "效果很大（例如 RR > 2 或 < 0.5）而且沒有明顯干擾？非常大（RR > 5 或 < 0.2）可升兩級。" },
		{ id: "dose", label: "劑量反應", en: "Dose–response gradient", max: 1, question: "劑量（或暴露）越多，效果越大？" },
		{ id: "confounding", label: "干擾因素反而會減弱效果", en: "Plausible confounding", max: 1, question: "所有可能的干擾因素都只會讓效果看起來變小，或讓沒有效果的看起來有效？" },
	];
	const IMPORTANCE = [
		{ id: "critical", label: "關鍵" },
		{ id: "important", label: "重要" },
		{ id: "limited", label: "不重要" },
	];
	const DESIGN_START = [
		{ id: "rct", label: "隨機對照試驗（從「高」開始）" },
		{ id: "obs", label: "觀察性研究（從「低」開始）" },
	];
	const RCT_DESIGNS = ["RCT", "systematic review", "meta-analysis"];
	const OBS_DESIGNS = ["quasi-experimental", "cohort", "case-control", "cross-sectional"];
	const QUAL_DESIGNS = ["qualitative", "mixed methods"];
	const NOT_REPORTED_RE = /^(?:n\/?a|null|none|nil|未報告|未提及|不適用|無|沒有)$/i;
	const NOTE_TEXT = "評等是你的判斷：每一級升降都由你選，並寫下理由（成為表下的註腳）。ZotMax 的提示只是依現有資料的提醒，不是評等；效果值請從原文或統合分析抄寫並核對。";

	// Test hooks: dialog(info), notice(info), reveal(path), copy(html, text), downloads(), now()
	const runtime = {};
	let busy = false;

	function ZB() {
		return scope.ZB;
	}

	function oneLine(s) {
		return String(s === undefined || s === null ? "" : s).replace(/\s+/g, " ").trim();
	}

	function text(s, max = 500) {
		return String(s === undefined || s === null ? "" : s).replace(/\r\n?/g, "\n").trim().slice(0, max);
	}

	function clampInt(v, lo, hi) {
		let n = Number.parseInt(v, 10);
		return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
	}

	// ---------- the model (pure) ----------

	function emptyTable() {
		return { question: "", outcomes: [], updatedAt: "" };
	}

	function newId(outcomes) {
		let used = new Set((outcomes || []).map(o => o.id));
		for (let n = 1; ; n++) if (!used.has(`o${n}`)) return `o${n}`;
	}

	/** One outcome with every field present: { id, name, importance, design, studies: [keys], participants, effect, absolute, domains, upgrades, notes }. */
	function normalizeOutcome(raw, id) {
		let r = raw && typeof raw === "object" ? raw : {};
		let domains = {};
		for (let d of DOMAINS) {
			let v = r.domains && r.domains[d.id] || {};
			domains[d.id] = { level: clampInt(v.level, 0, 2), reason: text(v.reason) };
		}
		let upgrades = {};
		for (let u of UPGRADES) {
			let v = r.upgrades && r.upgrades[u.id] || {};
			upgrades[u.id] = { level: clampInt(v.level, 0, u.max), reason: text(v.reason) };
		}
		return {
			id: oneLine(r.id) || id || "o1",
			name: oneLine(r.name).slice(0, 120),
			importance: IMPORTANCE.some(i => i.id === r.importance) ? r.importance : "critical",
			design: r.design === "obs" ? "obs" : "rct",
			studies: [...new Set((Array.isArray(r.studies) ? r.studies : []).map(oneLine).filter(Boolean))],
			participants: oneLine(r.participants).slice(0, 80),
			effect: oneLine(r.effect).slice(0, 200),
			absolute: oneLine(r.absolute).slice(0, 200),
			domains,
			upgrades,
			notes: text(r.notes),
		};
	}

	function normalizeTable(raw) {
		let r = raw && typeof raw === "object" ? raw : {};
		let outcomes = [];
		for (let o of Array.isArray(r.outcomes) ? r.outcomes.slice(0, MAX_OUTCOMES) : []) {
			let n = normalizeOutcome(o, newId(outcomes));
			if (outcomes.some(x => x.id === n.id)) n.id = newId(outcomes);
			outcomes.push(n);
		}
		return { question: text(r.question), outcomes, updatedAt: oneLine(r.updatedAt) };
	}

	function hasContent(table) {
		return !!(table && table.outcomes && table.outcomes.some(o => o.name));
	}

	/** "rct" | "obs" | "qual" | "" for an AI note's study_design. */
	function designOf(d) {
		if (RCT_DESIGNS.includes(d)) return "rct";
		if (OBS_DESIGNS.includes(d)) return "obs";
		if (QUAL_DESIGNS.includes(d)) return "qual";
		return "";
	}

	function termKey(s) {
		return String(s || "").normalize("NFKC").toLowerCase().replace(/[\s\-‐-―_]+/g, " ").trim();
	}

	function splitTerms(s) {
		return [...new Set(String(s || "").split(/\s*[、，,;；\n]\s*/).map(x => oneLine(x.normalize("NFKC")))
			.filter(x => x && x.length <= 40 && !NOT_REPORTED_RE.test(x)))];
	}

	/** Does a study's outcomes field mention this outcome? (words either way, at least two characters) */
	function measures(study, outcomeName) {
		let o = termKey(outcomeName);
		if (o.length < 2) return false;
		return splitTerms(study.outcomes).map(termKey).some(t => t.length >= 2 && (t.includes(o) || o.includes(t)));
	}

	/** The start for these studies: randomized when any is (trials and their reviews), else observational. */
	function startDesign(studies) {
		return studies.some(s => designOf(s.design) === "rct") ? "rct" : "obs";
	}

	/** A new outcome: the studies whose AI notes mention it, and the start their designs give. */
	function newOutcome(name, studies, outcomes = []) {
		let picked = (studies || []).filter(s => measures(s, name));
		return normalizeOutcome({ name, studies: picked.map(s => s.key), design: startDesign(picked) }, newId(outcomes));
	}

	/**
	 * Outcome names to offer: the PICO card's O, then the outcomes most AI notes found; without the ones the table
	 * already has. Returns [{ name, papers }].
	 */
	function suggestions(studies, card, existing = []) {
		let have = new Set(existing.map(termKey));
		let out = new Map();
		for (let name of splitTerms(card && card.o)) {
			let k = termKey(name);
			if (!have.has(k) && !out.has(k)) out.set(k, { name, papers: (studies || []).filter(s => measures(s, name)).length, fromCard: true });
		}
		let counts = new Map();
		for (let s of studies || []) {
			for (let t of splitTerms(s.outcomes)) {
				let k = termKey(t);
				let e = counts.get(k) || { name: t, papers: 0 };
				e.papers++;
				counts.set(k, e);
			}
		}
		for (let [k, e] of [...counts.entries()].sort((a, b) => b[1].papers - a[1].papers || a[1].name.localeCompare(b[1].name, "zh-Hant"))) {
			if (!have.has(k) && !out.has(k)) out.set(k, e);
		}
		return [...out.values()].slice(0, MAX_SUGGESTIONS);
	}

	/** The rating: { start, down, up, score, level (LEVELS entry), steps: [{ id, label, delta, reason }] }. */
	function certainty(outcome) {
		let o = normalizeOutcome(outcome);
		let start = o.design === "obs" ? 2 : 4;
		let steps = [];
		for (let d of DOMAINS) {
			let v = o.domains[d.id];
			if (v.level) steps.push({ id: d.id, label: d.label, delta: -v.level, reason: v.reason });
		}
		// Rating up applies to observational evidence only
		if (o.design === "obs") {
			for (let u of UPGRADES) {
				let v = o.upgrades[u.id];
				if (v.level) steps.push({ id: u.id, label: u.label, delta: v.level, reason: v.reason });
			}
		}
		let down = -steps.filter(s => s.delta < 0).reduce((n, s) => n + s.delta, 0);
		let up = steps.filter(s => s.delta > 0).reduce((n, s) => n + s.delta, 0);
		let score = Math.min(4, Math.max(1, start - down + up));
		return { start, down, up, score, level: LEVELS.find(l => l.score === score), steps };
	}

	/** "⊕⊕◯◯ 低" */
	function ratingText(c) {
		return `${c.level.symbol} ${c.level.label}`;
	}

	/** How the rating came about: "從「高」開始；偏誤風險 −1、不精確性 −1" */
	function stepsText(c) {
		let start = c.start === 4 ? "從「高」開始（隨機對照試驗）" : "從「低」開始（觀察性研究）";
		if (!c.steps.length) return `${start}，沒有升降級`;
		return `${start}；${c.steps.map(s => `${s.label} ${s.delta > 0 ? "+" : "−"}${Math.abs(s.delta)}`).join("、")}`;
	}

	/** Participants: the user's number, else the sum of the AI notes' sample sizes. { text, total, known, missing } */
	function participants(outcome, studies) {
		let picked = studiesOf(outcome, studies);
		let sizes = picked.map(s => Number(s.sampleSize)).filter(n => Number.isFinite(n) && n > 0);
		let total = sizes.reduce((a, b) => a + b, 0);
		let missing = picked.length - sizes.length;
		let auto = sizes.length ? `${total}${missing ? `（另 ${missing} 篇未知）` : ""}` : "";
		return { text: outcome.participants || auto, total, known: sizes.length, missing };
	}

	function studiesOf(outcome, studies) {
		let keys = new Set(outcome.studies || []);
		return (studies || []).filter(s => keys.has(s.key));
	}

	/** "3 RCT、1 世代研究" */
	function designCount(picked) {
		let names = { rct: "RCT", obs: "觀察性研究", qual: "質性研究", "": "設計未知" };
		let counts = new Map();
		for (let s of picked) {
			let label = s.design === "systematic review" ? "系統性回顧" : s.design === "meta-analysis" ? "統合分析" : names[designOf(s.design)];
			counts.set(label, (counts.get(label) || 0) + 1);
		}
		return [...counts.entries()].map(([k, n]) => `${n} ${k}`).join("、");
	}

	/**
	 * Hints from what ZotMax knows, per domain and for the start; never a rating. studies: the rows of the collection
	 * ({ key, citation, design, sampleSize, appraisalOverall, appraisalStatus, direction, match }).
	 * Returns { design, rob, inconsistency, indirectness, imprecision, publication, upgrade } (strings, "" for none).
	 */
	function hints(outcome, studies) {
		let o = normalizeOutcome(outcome);
		let picked = studiesOf(o, studies);
		let h = { design: "", rob: "", inconsistency: "", indirectness: "", imprecision: "", publication: "", upgrade: "" };
		if (!picked.length) {
			h.design = "先勾選測量這個結果的研究，提示才有根據。";
			return h;
		}
		let kinds = picked.map(s => designOf(s.design));
		let rct = kinds.filter(k => k === "rct").length;
		let obs = kinds.filter(k => k === "obs").length;
		let qual = kinds.filter(k => k === "qual").length;
		if (qual) h.design = `${qual} 篇是質性研究：質性證據的確定性用 GRADE-CERQual 評，不要和量性研究放在同一列。`;
		else if (rct && obs) h.design = `這 ${picked.length} 篇有 ${rct} 篇隨機試驗和 ${obs} 篇觀察性研究：GRADE 建議分開評，或以隨機試驗為主。`;
		else if (o.design === "rct" && !rct) h.design = "勾選的研究沒有隨機試驗：觀察性研究通常從「低」開始。";
		else if (o.design === "obs" && rct) h.design = "勾選的研究是隨機試驗：通常從「高」開始。";

		// 偏誤風險: the appraisal verdicts
		let appraised = picked.filter(s => s.appraisalOverall);
		let weak = appraised.filter(s => s.appraisalOverall === "排除" || s.appraisalOverall === "需更多資訊");
		let unverified = appraised.filter(s => s.appraisalStatus !== "已核對");
		if (!appraised.length) h.rob = "這些研究還沒有評讀結果：先在文獻評讀表逐篇評讀（隨機試驗用 RoB 2，非隨機研究用 ROBINS-I，或 CASP、JBI），再回來判斷。";
		else {
			let parts = [`${appraised.length}／${picked.length} 篇有評讀結果`];
			if (weak.length) parts.push(`${weak.length} 篇的結論是「需更多資訊」或「排除」${weak.length * 2 >= picked.length ? "，占一半以上，多半要降級" : ""}`);
			if (unverified.length) parts.push(`${unverified.length} 篇還是 AI 初評或評讀中，核對後再判斷`);
			h.rob = parts.join("；") + "。看的是權重大的研究：它們的隨機分派、盲法、流失是否有問題。";
		}

		// 不一致性: the AI notes' effect_direction
		let dirs = picked.map(s => s.direction).filter(d => ["有效", "無差異", "有害", "不一致"].includes(d));
		if (picked.length === 1) h.inconsistency = "只有 1 篇研究：無法評估不一致性，通常不因此降級。";
		else if (dirs.length >= 2) {
			let tally = ["有效", "無差異", "有害", "不一致"].map(d => [d, dirs.filter(x => x === d).length]).filter(([, n]) => n);
			h.inconsistency = tally.length > 1 || tally[0][0] === "不一致"
				? `AI 筆記判斷的結論方向不同（${tally.map(([d, n]) => `${d} ${n}`).join("、")}）：檢查信賴區間是否重疊、I² 是否偏高，能不能用族群或劑量的差異解釋。`
				: `${dirs.length} 篇 AI 筆記的結論方向都是「${tally[0][0]}」：仍要看效果大小和信賴區間是否重疊。`;
		}
		else h.inconsistency = "大多數研究沒有結論方向的資料：從原文比較各篇的效果和信賴區間。";

		// 間接性: the PICO card's word match
		let matched = picked.filter(s => s.match);
		if (matched.length) {
			let off = matched.filter(s => ["p", "i", "o"].some(k => s.match[k] === "no"));
			h.indirectness = off.length
				? `${off.length} 篇的族群、介入或結果和 PICO 問題卡沒有共同字詞：確認是不是同一群人、同一種介入；只是相近時考慮降級。`
				: "勾選的研究和 PICO 問題卡的 P、I、O 都有共同字詞：仍要確認族群、場域和你的情境是否相同。";
		}
		else h.indirectness = "建立這個分類的 PICO 問題卡後，這裡會比對每篇的 P、I、O 和你的問題。";

		// 不精確性: the total N against the optimal information size
		let n = participants(o, picked);
		if (!n.known) h.imprecision = "AI 筆記沒有樣本數：從原文加總，並看 95% CI 是否跨過無效線或臨床決策的門檻。";
		else if (n.total < OIS_PARTICIPANTS) h.imprecision = `總樣本數約 ${n.total} 人${n.missing ? `（另 ${n.missing} 篇未知）` : ""}，少於 GRADE 的經驗法則（連續變項約 ${OIS_PARTICIPANTS} 人；二元變項約 300 個事件）：多半要降級。也看 95% CI 是否跨過無效線。`;
		else h.imprecision = `總樣本數約 ${n.total} 人${n.missing ? `（另 ${n.missing} 篇未知）` : ""}：已達經驗法則，仍要看 95% CI 是否窄到足以下結論。`;

		// 發表偏誤: too few studies for a funnel plot
		h.publication = picked.length < FUNNEL_STUDIES
			? `只有 ${picked.length} 篇：漏斗圖需要約 ${FUNNEL_STUDIES} 篇以上，無法正式檢定。想想是否只找到小型、正向或廠商贊助的研究，有沒有查試驗登錄（ClinicalTrials.gov）和灰色文獻。`
			: `${picked.length} 篇：可以畫漏斗圖並做 Egger 檢定（在統合分析軟體）。`;

		if (o.design === "obs") {
			let downs = DOMAINS.filter(d => o.domains[d.id].level).length;
			h.upgrade = downs ? "已經有降級時，通常不再升級。" : "只有沒有降級的觀察性證據才考慮升級。";
		}
		return h;
	}

	/**
	 * What the window lists under an outcome before saving: { level: "warn" | "info", text }.
	 */
	function checkOutcome(outcome) {
		let o = normalizeOutcome(outcome);
		let out = [];
		if (!o.name) out.push({ level: "warn", text: "還沒寫結果指標名稱。" });
		if (!o.studies.length) out.push({ level: "warn", text: "還沒勾選研究。" });
		for (let d of DOMAINS) {
			if (o.domains[d.id].level && !o.domains[d.id].reason) out.push({ level: "warn", text: `${d.label}降級了，寫一句理由（會成為表下的註腳）。` });
		}
		if (o.design === "obs") {
			for (let u of UPGRADES) {
				if (o.upgrades[u.id].level && !o.upgrades[u.id].reason) out.push({ level: "warn", text: `「${u.label}」升級了，寫一句理由。` });
			}
		}
		if (!o.effect) out.push({ level: "info", text: "效果還沒填：從原文或統合分析抄寫，例如「RR 0.70（95% CI 0.55–0.89）」或「SMD −0.35（−0.60 to −0.10）」。" });
		return out;
	}

	// ---------- tables (pure) ----------

	function cell(v) {
		return oneLine(v).replace(/\|/g, "\\|");
	}

	function escapeHTML(s) {
		return String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}

	function importanceLabel(id) {
		return (IMPORTANCE.find(i => i.id === id) || IMPORTANCE[0]).label;
	}

	/**
	 * The Summary of Findings rows, with footnote letters for every reason: { rows: [{ outcome, importance, studies,
	 * participants, effect, rating, marks }], notes: [{ mark, text }] }. Outcomes without a name are left out.
	 */
	function summary(table, studies) {
		let t = normalizeTable(table);
		let notes = [];
		let rows = [];
		let mark = () => String.fromCharCode(97 + notes.length);
		for (let o of t.outcomes.filter(x => x.name)) {
			let c = certainty(o);
			let marks = [];
			for (let s of c.steps) {
				let m = mark();
				notes.push({ mark: m, text: `${o.name}：${s.label}${s.delta > 0 ? `升 ${s.delta} 級` : `降 ${-s.delta} 級`}${s.reason ? `。${s.reason}` : "（未寫理由）"}` });
				marks.push(m);
			}
			let picked = studiesOf(o, studies);
			rows.push({
				outcome: o.name,
				importance: importanceLabel(o.importance),
				studies: picked.length ? `${picked.length} 篇（${designCount(picked)}）` : "0 篇",
				participants: participants(o, studies).text,
				effect: [o.effect, o.absolute].filter(Boolean).join("；"),
				rating: ratingText(c),
				marks,
				certainty: c,
				notes: o.notes,
			});
		}
		return { rows, notes };
	}

	const SOF_HEAD = ["結果指標", "重要性", "研究數（設計）", "參與人數", "效果（相對；絕對）", "證據確定性（GRADE）"];

	function sofCells(r) {
		return [r.outcome, r.importance, r.studies, r.participants, r.effect || "（未填）", r.rating + (r.marks.length ? ` ${r.marks.join(",")}` : "")];
	}

	/** The Summary of Findings table as Markdown, its footnotes and the legend. */
	function sofMarkdown(table, studies) {
		let s = summary(table, studies);
		if (!s.rows.length) return "（還沒有結果指標）";
		let lines = [`| ${SOF_HEAD.join(" | ")} |`, `|${SOF_HEAD.map(() => "---").join("|")}|`, ...s.rows.map(r => `| ${sofCells(r).map(cell).join(" | ")} |`)];
		let out = [lines.join("\n")];
		if (s.notes.length) out.push(s.notes.map(n => `${n.mark}. ${cell(n.text)}`).join("  \n"));
		out.push(LEVELS.map(l => `${l.symbol} ${l.label}（${l.en}）：${l.meaning}`).join("  \n"));
		return out.join("\n\n");
	}

	const PROFILE_HEAD = ["結果指標", "研究數", "起始", ...DOMAINS.map(d => d.label), "升級", "確定性"];

	function profileCells(o, studies) {
		let c = certainty(o);
		let picked = studiesOf(o, studies);
		let down = d => (DOWN.find(x => x.value === o.domains[d.id].level) || DOWN[0]).label;
		let ups = o.design === "obs" ? UPGRADES.filter(u => o.upgrades[u.id].level).map(u => `${u.label} +${o.upgrades[u.id].level}`).join("、") : "";
		return [o.name, String(picked.length), o.design === "obs" ? "低（觀察性）" : "高（隨機）", ...DOMAINS.map(down), ups || "—", ratingText(c)];
	}

	/** The evidence profile: every domain for every outcome. */
	function profileMarkdown(table, studies) {
		let t = normalizeTable(table);
		let named = t.outcomes.filter(o => o.name);
		if (!named.length) return "";
		return [`| ${PROFILE_HEAD.join(" | ")} |`, `|${PROFILE_HEAD.map(() => "---").join("|")}|`, ...named.map(o => `| ${profileCells(o, studies).map(cell).join(" | ")} |`)].join("\n");
	}

	/** The included studies with their appraisal: the per-study judgements the 偏誤風險 domain rests on. */
	function studiesMarkdown(table, studies, opts = {}) {
		let t = normalizeTable(table);
		let used = new Set(t.outcomes.flatMap(o => o.studies));
		let rows = (studies || []).filter(s => used.has(s.key));
		if (!rows.length) return "";
		let head = ["文獻", "研究設計", "樣本數", "評讀結果", "評讀狀態", "結論方向（AI）", "用在"];
		let lines = [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`];
		for (let s of rows) {
			let first = opts.links && s.link ? `[[${s.link}\\|${cell(s.citation)}]]` : cell(s.citation);
			let where = t.outcomes.filter(o => o.name && o.studies.includes(s.key)).map(o => o.name).join("、");
			lines.push(`| ${[first, ...[s.design, s.sampleSize, [s.appraisalOverall, s.appraisalTool ? `（${s.appraisalTool}）` : ""].join(""), s.appraisalStatus, s.direction, where].map(cell)].join(" | ")} |`);
		}
		return lines.join("\n");
	}

	const CSV_HEAD = ["結果指標", "重要性", "研究數", "研究設計", "參與人數", "相對效果", "絕對效果", "起始", ...DOMAINS.flatMap(d => [d.label, `${d.label}理由`]), "升級", "證據確定性", "備註"];

	/** CSV (UTF-8 BOM, CRLF) of every outcome with every domain and reason. */
	function sofCSV(table, studies) {
		let t = normalizeTable(table);
		let lines = [CSV_HEAD];
		for (let o of t.outcomes.filter(x => x.name)) {
			let c = certainty(o);
			let picked = studiesOf(o, studies);
			lines.push([
				o.name, importanceLabel(o.importance), picked.length, designCount(picked), participants(o, studies).text, o.effect, o.absolute,
				o.design === "obs" ? "低（觀察性）" : "高（隨機）",
				...DOMAINS.flatMap(d => [(DOWN.find(x => x.value === o.domains[d.id].level) || DOWN[0]).label, o.domains[d.id].reason]),
				o.design === "obs" ? UPGRADES.filter(u => o.upgrades[u.id].level).map(u => `${u.label} +${o.upgrades[u.id].level}（${o.upgrades[u.id].reason}）`).join("；") : "",
				`${c.level.label}（${c.level.en}）`, o.notes,
			]);
		}
		return "﻿" + lines.map(l => l.map(screening.csvCell).join(",")).join("\r\n") + "\r\n";
	}

	/** The SoF table, footnotes and legend as an HTML fragment (the clipboard for Word, and the HTML file). */
	function sofFragment(table, studies) {
		let s = summary(table, studies);
		let out = [];
		let t = normalizeTable(table);
		if (t.question) out.push(`<p><b>研究問題</b>：${escapeHTML(t.question)}</p>`);
		out.push("<table border=\"1\" cellpadding=\"4\" cellspacing=\"0\"><tr>" + SOF_HEAD.map(h => `<th>${escapeHTML(h)}</th>`).join("") + "</tr>"
			+ s.rows.map(r => "<tr>" + sofCells(r).map(v => `<td>${escapeHTML(v)}</td>`).join("") + "</tr>").join("") + "</table>");
		if (s.notes.length) out.push("<p>" + s.notes.map(n => `${escapeHTML(n.mark)}. ${escapeHTML(n.text)}`).join("<br>") + "</p>");
		out.push("<p>" + LEVELS.map(l => escapeHTML(`${l.symbol} ${l.label}（${l.en}）：${l.meaning}`)).join("<br>") + "</p>");
		return out.join("\n");
	}

	/** Tab-separated text beside the HTML on the clipboard. */
	function sofTSV(table, studies) {
		let s = summary(table, studies);
		return [SOF_HEAD.join("\t"), ...s.rows.map(r => sofCells(r).map(v => oneLine(v).replace(/\t/g, " ")).join("\t"))].join("\n");
	}

	/** The HTML file Word opens. meta: { title, scopeName, date } */
	function sofHTML(table, studies, meta) {
		let profile = profileMarkdown(table, studies) ? (() => {
			let t = normalizeTable(table);
			return "<h2>證據剖面（Evidence profile）</h2><table border=\"1\" cellpadding=\"4\" cellspacing=\"0\"><tr>" + PROFILE_HEAD.map(h => `<th>${escapeHTML(h)}</th>`).join("") + "</tr>"
				+ t.outcomes.filter(o => o.name).map(o => "<tr>" + profileCells(o, studies).map(v => `<td>${escapeHTML(v)}</td>`).join("") + "</tr>").join("") + "</table>";
		})() : "";
		return [
			"<!DOCTYPE html>",
			"<html lang=\"zh-TW\">",
			"<head>",
			"<meta charset=\"utf-8\">",
			`<title>${escapeHTML(meta.title)}</title>`,
			"<style>body{font-family:\"Times New Roman\",\"PMingLiU\",serif;font-size:11pt}table{border-collapse:collapse;margin:8pt 0}th,td{border:1px solid #666;padding:3pt 5pt;vertical-align:top;font-size:10pt;text-align:left}th{background:#eee}</style>",
			"</head>",
			"<body>",
			`<h1>${escapeHTML(meta.title)}</h1>`,
			`<p>ZotMax 依「${escapeHTML(meta.scopeName)}」於 ${escapeHTML(meta.date)} 產生。${escapeHTML(NOTE_TEXT)}</p>`,
			"<h2>證據摘要表（Summary of Findings）</h2>",
			sofFragment(table, studies),
			profile,
			"</body>",
			"</html>",
			"",
		].join("\n");
	}

	/** The note's managed region. meta: { scopeName, generatedAt, uri, csvPath, htmlPath, links } */
	function noteSection(table, studies, meta) {
		let t = normalizeTable(table);
		let info = [
			`> [!info] 由 ZotMax 依「${meta.scopeName}」的 GRADE 評等於 ${String(meta.generatedAt || "").slice(0, 10)} 產生；重新匯出只會覆寫這個區塊。`,
			meta.uri ? `> Zotero：[開啟](${meta.uri})` + (meta.csvPath ? ` · CSV：\`${meta.csvPath}\`` : "") + (meta.htmlPath ? ` · Word 版：\`${meta.htmlPath}\`` : "") : "",
			`> ${NOTE_TEXT}`,
		].filter(Boolean).join("\n");
		let out = [info];
		if (t.question) out.push(`**研究問題**：${cell(t.question)}`);
		out.push("## 證據摘要表（Summary of Findings）", sofMarkdown(table, studies));
		let profile = profileMarkdown(table, studies);
		if (profile) out.push("## 證據剖面（Evidence profile）", "每個結果指標在五個降級面向和升級條件上的判斷。", profile);
		let st = studiesMarkdown(table, studies, { links: meta.links });
		if (st) out.push("## 納入研究的評讀", "偏誤風險的判斷依據：各篇的評讀結果（標「已核對」的是你在文獻評讀表核對過的）。", st);
		let withNotes = t.outcomes.filter(o => o.name && o.notes);
		if (withNotes.length) out.push("## 備註", withNotes.map(o => `- **${cell(o.name)}**：${o.notes.replace(/\n/g, "  \n  ")}`).join("\n"));
		return out.join("\n\n");
	}

	function noteFrontmatter(table, studies, meta) {
		let s = summary(table, studies);
		return {
			title: meta.title,
			type: "grade",
			zotero_collection: meta.collectionKey || "",
			collection_path: meta.path || meta.scopeName,
			zotero: meta.uri || "",
			outcomes: s.rows.length,
			certainty: s.rows.map(r => `${r.outcome}：${r.certainty.level.label}`),
			grade_csv: meta.csvPath || "",
			grade_word: meta.htmlPath || "",
			last_generated: meta.generatedAt || "",
		};
	}

	function buildNote(existing, fm, title, section) {
		return screening.buildReviewNote(existing, fm, title, section, ["GRADE"]);
	}

	/** `<name> GRADE 證據摘要.md`, `.csv`, `.html` */
	function fileNames(scopeName) {
		let base = `${core.sanitizeFilename(oneLine(scopeName) || "我的文獻庫").slice(0, 80).trim()} GRADE 證據摘要`;
		return { base, note: `${base}.md`, csv: `${base}.csv`, html: `${base}.html` };
	}

	/** The dialog text after an export. r: { dir, files, outcomes, unrated } */
	function doneText(r) {
		let lines = [`已把 ${r.outcomes} 個結果指標的 GRADE 評等整理成證據摘要表，寫到：`, r.dir, "", `檔案：${r.files.join("、")}`];
		if (r.missingReasons) lines.push(`⚠ 有 ${r.missingReasons} 個升降級還沒寫理由，表下的註腳會標「未寫理由」。`);
		lines.push("", "「複製成表格」會把證據摘要表放到剪貼簿，直接貼進 Word。");
		return lines.join("\n");
	}

	// ---------- the window (DOM) ----------

	function el(doc, tag, attrs, content) {
		let e = doc.createElementNS(HTML_NS, tag);
		for (let [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
		if (content !== undefined) e.textContent = content;
		return e;
	}

	/**
	 * Draw the GRADE window into `root`. info: { scopeName, table, studies (rows), card (PICO card or null),
	 * question (the card's question) }. handlers: { onSave(table, { exportNow }), onCancel() }.
	 */
	function renderWindow(doc, root, info, handlers) {
		root.replaceChildren();
		let decided = false;
		let table = normalizeTable(info.table);
		if (!table.question && info.question) table.question = info.question;
		let studies = info.studies || [];

		let head = el(doc, "header", { class: "zb-cl-head" });
		head.append(
			el(doc, "h1", { class: "zb-cl-title" }, `${TITLE}：${info.scopeName}`),
			el(doc, "p", { class: "zb-cl-lead" }, "每個結果指標分開評：隨機試驗從「高」開始、觀察性研究從「低」開始，五個面向決定要不要降級。每一級都由你選並寫下理由；灰字提示只是依現有資料的提醒。不呼叫 AI，也不連網。"),
		);

		let list = el(doc, "div", { class: "zb-cl-list" });

		// 研究問題
		let qSec = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-gr-q-h" });
		qSec.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-gr-q-h" }, "研究問題"));
		let qWrap = el(doc, "div", { class: "zb-pc-field" });
		let question = el(doc, "textarea", { id: "zb-gr-question", rows: "2" });
		question.value = table.question;
		qWrap.append(el(doc, "label", { for: "zb-gr-question", class: "zb-pc-label" }, info.card ? "取自 PICO 問題卡，可以改" : "一句話寫出這張表回答的問題（建立 PICO 問題卡後會自動帶入）"), question);
		qSec.append(qWrap, el(doc, "p", { class: "zb-cl-why" }, `這個分類有 ${studies.length} 篇文獻${studies.length ? `（${designCount(studies)}）` : ""}。`));
		question.addEventListener("input", () => {
			table.question = question.value;
			update();
		});

		// 新增結果指標
		let addSec = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-gr-add-h" });
		addSec.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-gr-add-h" }, "結果指標"));
		addSec.append(el(doc, "p", { class: "zb-cl-why" }, `GRADE 建議只評對決策最關鍵的結果（最多 ${MAX_OUTCOMES} 個）。按建議加入，或自己輸入。`));
		let addRow = el(doc, "div", { class: "zb-pc-row" });
		let addInput = el(doc, "input", { type: "text", id: "zb-gr-add", placeholder: "例如：跌倒發生率", "aria-label": "新的結果指標" });
		let addButton = el(doc, "button", { type: "button", class: "zb-gr-add" }, "加入");
		addRow.append(addInput, addButton);
		let chips = el(doc, "div", { class: "zb-pc-links", "data-zb-suggestions": "" });
		addSec.append(addRow, chips);

		let outcomesBox = el(doc, "div", { class: "zb-gr-outcomes" });
		list.append(qSec, addSec, outcomesBox);

		let foot = el(doc, "footer", { class: "zb-cl-foot" });
		let summaryLine = el(doc, "p", { class: "zb-cl-summary", role: "status" }, "");
		let buttons = el(doc, "div", { class: "zb-cl-buttons" });
		let cancel = el(doc, "button", { type: "button", class: "zb-cl-cancel" }, "取消");
		let save = el(doc, "button", { type: "button", class: "zb-gr-save" }, "儲存");
		let exportButton = el(doc, "button", { type: "button", class: "zb-cl-apply" }, "儲存並匯出證據摘要表");
		buttons.append(cancel, save, exportButton);
		foot.append(summaryLine, buttons);
		root.append(head, list, foot);

		let addOutcome = (name) => {
			name = oneLine(name);
			if (!name || table.outcomes.length >= MAX_OUTCOMES) return;
			if (table.outcomes.some(o => termKey(o.name) === termKey(name))) return;
			table.outcomes.push(newOutcome(name, studies, table.outcomes));
			addInput.value = "";
			drawOutcomes();
			update();
		};
		addButton.addEventListener("click", () => addOutcome(addInput.value));
		addInput.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter") {
				ev.preventDefault();
				addOutcome(addInput.value);
			}
		});
		cancel.addEventListener("click", () => finish(null));
		save.addEventListener("click", () => finish({ exportNow: false }));
		exportButton.addEventListener("click", () => finish({ exportNow: true }));
		root.addEventListener("keydown", (ev) => {
			if (ev.key === "Escape") {
				ev.preventDefault();
				finish(null);
			}
		});

		let views = new Map();

		function select(id, options, value, label) {
			let s = el(doc, "select", { id, "aria-label": label });
			for (let o of options) s.append(el(doc, "option", { value: String(o.value) }, o.label));
			s.value = String(value);
			return s;
		}

		function drawOutcomes() {
			outcomesBox.replaceChildren();
			views.clear();
			table.outcomes.forEach((o, index) => outcomesBox.append(outcomeSection(o, index)));
		}

		function outcomeSection(o, index) {
			let id = o.id;
			let sec = el(doc, "section", { class: "zb-cl-item zb-gr-outcome", "data-zb-outcome": id, "aria-labelledby": `zb-gr-${id}-h` });
			let titleRow = el(doc, "div", { class: "zb-gr-title-row" });
			let titleEl = el(doc, "h2", { class: "zb-cl-item-title", id: `zb-gr-${id}-h` }, `${index + 1}. ${o.name}`);
			let rating = el(doc, "p", { class: "zb-gr-rating", "data-zb-rating": id, role: "status", "aria-live": "polite" });
			let remove = el(doc, "button", { type: "button", class: "zb-gr-remove", "aria-label": `刪除「${o.name}」` }, "刪除");
			titleRow.append(titleEl, rating, remove);
			remove.addEventListener("click", () => {
				table.outcomes = table.outcomes.filter(x => x.id !== id);
				drawOutcomes();
				update();
			});
			sec.append(titleRow);

			// name, importance, start
			let basics = el(doc, "div", { class: "zb-gr-grid" });
			let name = el(doc, "input", { type: "text", id: `zb-gr-${id}-name`, value: o.name });
			name.value = o.name;
			let importance = select(`zb-gr-${id}-importance`, IMPORTANCE.map(i => ({ value: i.id, label: i.label })), o.importance, "重要性");
			let design = select(`zb-gr-${id}-design`, DESIGN_START.map(d => ({ value: d.id, label: d.label })), o.design, "證據起始");
			basics.append(
				el(doc, "label", { for: `zb-gr-${id}-name` }, "名稱"), name,
				el(doc, "label", { for: `zb-gr-${id}-importance` }, "重要性"), importance,
				el(doc, "label", { for: `zb-gr-${id}-design` }, "起始"), design,
			);
			let designHint = el(doc, "p", { class: "zb-cl-why", "data-zb-hint": "design" });
			sec.append(basics, designHint);
			name.addEventListener("input", () => {
				o.name = oneLine(name.value);
				titleEl.textContent = `${index + 1}. ${o.name}`;
				update();
			});
			importance.addEventListener("change", () => {
				o.importance = importance.value;
				update();
			});
			design.addEventListener("change", () => {
				o.design = design.value;
				refresh();
			});

			// studies
			let studyBox = el(doc, "fieldset", { class: "zb-gr-studies" });
			studyBox.append(el(doc, "legend", {}, "測量這個結果的研究"));
			for (let s of studies) {
				let lab = el(doc, "label", { class: "zb-gr-study" });
				let box = el(doc, "input", { type: "checkbox", value: s.key, "data-zb-study": s.key });
				box.checked = o.studies.includes(s.key);
				box.addEventListener("change", () => {
					o.studies = studies.filter(x => (x.key === s.key ? box.checked : o.studies.includes(x.key))).map(x => x.key);
					refresh();
				});
				let meta = [s.design, s.sampleSize ? `N = ${s.sampleSize}` : "", s.appraisalOverall ? `評讀：${s.appraisalOverall}${s.appraisalStatus ? `［${s.appraisalStatus}］` : ""}` : "", s.direction ? `方向：${s.direction}` : ""].filter(Boolean).join(" · ");
				lab.append(box, el(doc, "span", {}, ` ${s.citation}`), el(doc, "span", { class: "zb-cl-why" }, meta ? ` ${meta}` : ""));
				studyBox.append(lab);
			}
			if (!studies.length) studyBox.append(el(doc, "p", { class: "zb-cl-why" }, "這個分類沒有文獻。"));
			sec.append(studyBox);

			// effect and participants
			let nums = el(doc, "div", { class: "zb-gr-grid" });
			let effect = el(doc, "input", { type: "text", id: `zb-gr-${id}-effect`, placeholder: "RR 0.70（95% CI 0.55–0.89）" });
			effect.value = o.effect;
			let absolute = el(doc, "input", { type: "text", id: `zb-gr-${id}-absolute`, placeholder: "每 1000 人少 45 人（30–60）" });
			absolute.value = o.absolute;
			let people = el(doc, "input", { type: "text", id: `zb-gr-${id}-participants` });
			people.value = o.participants;
			nums.append(
				el(doc, "label", { for: `zb-gr-${id}-effect` }, "相對效果"), effect,
				el(doc, "label", { for: `zb-gr-${id}-absolute` }, "絕對效果（選填）"), absolute,
				el(doc, "label", { for: `zb-gr-${id}-participants` }, "參與人數"), people,
			);
			sec.append(nums);
			effect.addEventListener("input", () => {
				o.effect = oneLine(effect.value);
				update();
			});
			absolute.addEventListener("input", () => {
				o.absolute = oneLine(absolute.value);
				update();
			});
			people.addEventListener("input", () => {
				o.participants = oneLine(people.value);
				update();
			});

			// the five domains
			let domainBox = el(doc, "div", { class: "zb-gr-domains" });
			let hintEls = {};
			for (let d of DOMAINS) {
				let row = el(doc, "div", { class: "zb-gr-domain", "data-zb-domain": d.id });
				let lvl = select(`zb-gr-${id}-${d.id}`, DOWN, o.domains[d.id].level, d.label);
				let reason = el(doc, "input", { type: "text", id: `zb-gr-${id}-${d.id}-reason`, placeholder: "理由（降級時必填）", "aria-label": `${d.label}的理由` });
				reason.value = o.domains[d.id].reason;
				let q = el(doc, "p", { class: "zb-cl-why" }, d.question);
				let hint = el(doc, "p", { class: "zb-cl-why zb-gr-hint", "data-zb-hint": d.id });
				hintEls[d.id] = hint;
				row.append(el(doc, "label", { for: `zb-gr-${id}-${d.id}`, class: "zb-pc-label" }, `${d.label}（${d.en}）`), lvl, reason, q, hint);
				domainBox.append(row);
				lvl.addEventListener("change", () => {
					o.domains[d.id].level = Number(lvl.value);
					update();
				});
				reason.addEventListener("input", () => {
					o.domains[d.id].reason = reason.value.trim();
					update();
				});
			}
			sec.append(domainBox);

			// rating up (observational only)
			let upBox = el(doc, "div", { class: "zb-gr-domains zb-gr-upgrades" });
			upBox.append(el(doc, "p", { class: "zb-pc-label" }, "升級（只用於觀察性研究）"));
			let upHint = el(doc, "p", { class: "zb-cl-why", "data-zb-hint": "upgrade" });
			upBox.append(upHint);
			for (let u of UPGRADES) {
				let row = el(doc, "div", { class: "zb-gr-domain", "data-zb-upgrade": u.id });
				let options = [{ value: 0, label: "不升級" }, { value: 1, label: "升一級" }, ...(u.max > 1 ? [{ value: 2, label: "升兩級" }] : [])];
				let lvl = select(`zb-gr-${id}-${u.id}`, options, o.upgrades[u.id].level, u.label);
				let reason = el(doc, "input", { type: "text", id: `zb-gr-${id}-${u.id}-reason`, placeholder: "理由", "aria-label": `${u.label}的理由` });
				reason.value = o.upgrades[u.id].reason;
				row.append(el(doc, "label", { for: `zb-gr-${id}-${u.id}`, class: "zb-pc-label" }, `${u.label}（${u.en}）`), lvl, reason, el(doc, "p", { class: "zb-cl-why" }, u.question));
				upBox.append(row);
				lvl.addEventListener("change", () => {
					o.upgrades[u.id].level = Number(lvl.value);
					update();
				});
				reason.addEventListener("input", () => {
					o.upgrades[u.id].reason = reason.value.trim();
					update();
				});
			}
			sec.append(upBox);

			// notes and checks
			let notesWrap = el(doc, "div", { class: "zb-pc-field" });
			let notes = el(doc, "textarea", { id: `zb-gr-${id}-notes`, rows: "2" });
			notes.value = o.notes;
			notesWrap.append(el(doc, "label", { for: `zb-gr-${id}-notes`, class: "zb-pc-label" }, "備註（選填）：統合分析的來源、I²、和老師討論的結論…"), notes);
			notes.addEventListener("input", () => {
				o.notes = notes.value.trim();
			});
			let checks = el(doc, "ul", { class: "zb-pc-checks", "data-zb-checks": id });
			sec.append(notesWrap, checks);

			function refresh() {
				let h = hints(o, studies);
				designHint.textContent = h.design;
				designHint.hidden = !h.design;
				for (let d of DOMAINS) hintEls[d.id].textContent = h[d.id] ? `提示：${h[d.id]}` : "";
				upHint.textContent = h.upgrade;
				upBox.hidden = o.design !== "obs";
				update();
			}
			views.set(id, { rating, checks, refresh });
			refresh();
			return sec;
		}

		function drawSuggestions() {
			chips.replaceChildren();
			let full = table.outcomes.length >= MAX_OUTCOMES;
			for (let s of full ? [] : suggestions(studies, info.card, table.outcomes.map(o => o.name))) {
				let b = el(doc, "button", { type: "button", class: "zb-pc-link", title: s.fromCard ? "取自 PICO 問題卡的 O" : `${s.papers} 篇 AI 筆記有這個結果` }, `${s.name}（${s.papers}）`);
				b.addEventListener("click", () => addOutcome(s.name));
				chips.append(b);
			}
			addButton.disabled = addInput.disabled = full;
		}

		function update() {
			let warns = 0;
			for (let o of table.outcomes) {
				let v = views.get(o.id);
				if (!v) continue;
				let c = certainty(o);
				v.rating.textContent = `${ratingText(c)}（${stepsText(c)}）`;
				v.checks.replaceChildren();
				for (let f of checkOutcome(o)) {
					if (f.level === "warn") warns++;
					v.checks.append(el(doc, "li", { class: f.level === "warn" ? "zb-pc-warn" : "zb-pc-info" }, f.text));
				}
			}
			drawSuggestions();
			let named = table.outcomes.filter(o => o.name).length;
			summaryLine.textContent = !named ? "先加入一個結果指標。"
				: warns ? `${named} 個結果指標，還有 ${warns} 項要補；也可以先存，之後再改。` : `${named} 個結果指標都評好了。`;
			save.disabled = decided;
			exportButton.disabled = decided || !named;
		}

		function finish(choice) {
			if (decided) return;
			decided = true;
			save.disabled = exportButton.disabled = cancel.disabled = true;
			if (choice) handlers.onSave(normalizeTable(table), choice);
			else handlers.onCancel();
		}

		drawOutcomes();
		update();
		try {
			(table.outcomes.length ? question : addInput).focus();
		}
		catch (e) {}
		return { update, finish, table: () => normalizeTable(table), buttons: { save, cancel, exportButton, add: addButton }, addInput };
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
		try {
			Zotero.Prefs.set(PREF + key, value, true);
		}
		catch (e) {
			Zotero.logError(e);
		}
	}

	function featureOn(id = FEATURE) {
		let f = ZB() && ZB().features;
		return !f || f.isEnabled(id);
	}

	function notify(body) {
		ZB().main.notify(`ZotMax：${TITLE}`, body);
	}

	function now() {
		return runtime.now ? runtime.now() : new Date();
	}

	function readTables() {
		try {
			let all = JSON.parse(pref("grade.tables") || "{}");
			return all && typeof all === "object" && !Array.isArray(all) ? all : {};
		}
		catch (e) {
			return {};
		}
	}

	/** The saved GRADE table of a collection (or the library); null without one. */
	function tableFor(collection) {
		let raw = readTables()[ZB().pico.scopeOf(collection).key];
		return raw ? normalizeTable(raw) : null;
	}

	function saveTable(collection, table) {
		let all = readTables();
		let t = normalizeTable(table);
		t.updatedAt = now().toISOString();
		all[ZB().pico.scopeOf(collection).key] = t;
		setPref("grade.tables", JSON.stringify(all));
		return t;
	}

	/** The collection's studies as rows (pico.js tableRow) with their item key and the AI note's effect direction. */
	function studyRows(items, index, card) {
		let P = ZB().pico;
		return items.map((item) => {
			let entry = P.entryFor(item, index, card);
			let row = P.tableRow(entry);
			return Object.assign(row, { key: item.key, direction: entry.study && entry.study.effect_direction ? String(entry.study.effect_direction) : "" });
		}).sort((a, b) => a.citation.localeCompare(b.citation, "en"));
	}

	/** The window: resolves { table, exportNow } or null. */
	async function dialog(info, opts = {}) {
		if (runtime.dialog) return runtime.dialog(info);
		let P = ZB().pico;
		let main = Zotero.getMainWindow();
		let win = main.openDialog(URL, "zotero-bridge-grade", "chrome,dialog=no,resizable,centerscreen");
		let rootEl = await P.waitForDialog(win, ROOT);
		return new Promise((resolve) => {
			let done = false;
			let finish = (choice) => {
				if (done) return;
				done = true;
				resolve(choice);
				try {
					if (!win.closed) win.close();
				}
				catch (e) {}
			};
			win.addEventListener("unload", () => finish(null));
			renderWindow(win.document, rootEl, info, {
				onSave: (table, choice) => finish({ table, exportNow: !!choice.exportNow }),
				onCancel: () => finish(null),
			});
			if (opts.onOpen) opts.onOpen(win);
		});
	}

	/** The native dialog after an export: "open" | "copy" | "close". */
	function notice(info) {
		if (runtime.notice) return runtime.notice(info);
		let p = Services.prompt;
		let flags = p.BUTTON_POS_0 * p.BUTTON_TITLE_IS_STRING + p.BUTTON_POS_1 * p.BUTTON_TITLE_IS_STRING + p.BUTTON_POS_2 * p.BUTTON_TITLE_IS_STRING + p.BUTTON_POS_0_DEFAULT;
		let b = p.confirmEx(Zotero.getMainWindow(), TITLE, info.text, flags, "打開資料夾", "複製成表格", "關閉", null, {});
		return b === 0 ? "open" : b === 1 ? "copy" : "close";
	}

	function copyHTML(html, plain) {
		if (runtime.copy) return runtime.copy(html, plain);
		let Ci = Components.interfaces;
		let tr = Components.classes["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
		tr.init(null);
		for (let [flavor, data] of [["text/html", html], ["text/plain", plain]]) {
			let str = Components.classes["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
			str.data = String(data || "");
			tr.addDataFlavor(flavor);
			tr.setTransferData(flavor, str);
		}
		Services.clipboard.setData(tr, null, Services.clipboard.kGlobalClipboard);
	}

	async function reveal(path) {
		if (runtime.reveal) return runtime.reveal(path);
		try {
			if (Zotero.File && Zotero.File.reveal) return await Zotero.File.reveal(path);
		}
		catch (e) {}
		return Zotero.launchFile(path);
	}

	/** Write the note, CSV and HTML. o: { folder, dirParts, scopeName, scope, table, studies } → { dir, files, outcomes, missingReasons } */
	async function writeFiles(o) {
		let z = ZB();
		let names = fileNames(o.scopeName);
		let date = now().toISOString();
		let meta = {
			title: `${o.scopeName}：GRADE 證據摘要`,
			scopeName: o.scopeName,
			date: date.slice(0, 10),
			generatedAt: date,
			collectionKey: o.scope.collection ? o.scope.key : "",
			path: o.scope.collection ? z.adapter.collectionPath(o.scope.collection) : "",
			uri: o.scope.collection ? `zotero://select/${z.adapter.libraryInfo(o.scope.libraryID).path}/collections/${o.scope.collection.key}` : "",
			csvPath: o.dirParts ? [...o.dirParts, names.csv].join("/") : names.csv,
			htmlPath: o.dirParts ? [...o.dirParts, names.html].join("/") : names.html,
			links: !!o.dirParts,
		};
		await IOUtils.makeDirectory(o.folder, { createAncestors: true, ignoreExisting: true });
		let notePath = PathUtils.join(o.folder, names.note);
		let existing = (await IOUtils.exists(notePath)) ? await IOUtils.readUTF8(notePath) : null;
		let textOut = buildNote(existing, noteFrontmatter(o.table, o.studies, meta), meta.title, noteSection(o.table, o.studies, meta));
		if (textOut !== existing) await IOUtils.writeUTF8(notePath, textOut);
		await IOUtils.writeUTF8(PathUtils.join(o.folder, names.csv), sofCSV(o.table, o.studies));
		await IOUtils.writeUTF8(PathUtils.join(o.folder, names.html), sofHTML(o.table, o.studies, meta));
		let s = summary(o.table, o.studies);
		return {
			dir: o.folder, files: [names.note, names.csv, names.html], outcomes: s.rows.length,
			missingReasons: s.rows.reduce((n, r) => n + r.certainty.steps.filter(x => !x.reason).length, 0),
		};
	}

	/**
	 * The command: the GRADE window for the selected collection (or the library); 儲存 keeps the rating in the pref,
	 * 儲存並匯出 also writes the note, CSV and HTML. opts: { dialog(info), notice(info) } for tests.
	 * Returns { saved, result?, action? } | { cancelled: true } | null.
	 */
	async function open(collection, opts = {}) {
		let z = ZB();
		if (!featureOn()) {
			z.main.notifyFeatureOff(FEATURE);
			return null;
		}
		if (busy) {
			notify("上一次的 GRADE 視窗還開著。");
			return null;
		}
		busy = true;
		try {
			let settings;
			try {
				settings = await z.main.readSettings();
			}
			catch (e) {
				z.main.notify("ZotMax 設定有誤", String(e.message || e));
				return null;
			}
			let P = z.pico;
			let sc = P.scopeOf(collection);
			let card = P.cardFor(collection);
			let items = collection ? P.scopeItems(z.adapter.toRegularItems(z.adapter.itemsInCollection(collection, true)), collection).items : [];
			let index = settings.vaultPath ? await z.main.buildObsidianIndex(settings) : null;
			let studies = studyRows(items, index, card);
			let existing = tableFor(collection);
			let table = existing || emptyTable();
			let info = { scopeName: sc.name, table, studies, card, question: card ? card.question : "" };
			let choice;
			try {
				choice = await (opts.dialog || dialog)(info);
			}
			catch (e) {
				Zotero.logError(e);
				notify(`視窗沒有開啟（${e.message || e}）。可以重新啟動 Zotero 後再試一次。`);
				return null;
			}
			if (!choice) return { cancelled: true };
			let saved = saveTable(collection, choice.table);
			if (!choice.exportNow) {
				notify(`已儲存「${sc.name}」的 GRADE 評等。之後隨時回來改，或按「儲存並匯出證據摘要表」產生表格。`);
				return { saved };
			}
			let dest = await P.destination(settings);
			let result;
			try {
				result = await writeFiles({ folder: dest.folder, dirParts: dest.dirParts, scopeName: sc.name, scope: sc, table: saved, studies });
			}
			catch (e) {
				Zotero.logError(e);
				notify(`匯出失敗：${e.message || e}`);
				return { saved };
			}
			let action = (opts.notice || notice)({ text: doneText(result), buttons: ["open", "copy", "close"], result });
			if (action === "open") await reveal(result.dir);
			else if (action === "copy") copyHTML(sofFragment(saved, studies), sofTSV(saved, studies));
			return { saved, result, action };
		}
		finally {
			busy = false;
		}
	}

	return {
		FEATURE, TITLE, URL, ROOT, LEVELS, DOMAINS, DOWN, UPGRADES, IMPORTANCE, MAX_OUTCOMES, OIS_PARTICIPANTS, FUNNEL_STUDIES, NOTE_TEXT, runtime,
		// pure
		emptyTable, normalizeOutcome, normalizeTable, hasContent, designOf, measures, startDesign, newOutcome, suggestions,
		certainty, ratingText, stepsText, participants, hints, checkOutcome, summary, sofMarkdown, profileMarkdown, studiesMarkdown,
		sofCSV, sofFragment, sofTSV, sofHTML, noteSection, noteFrontmatter, buildNote, fileNames, doneText, renderWindow,
		// Zotero
		tableFor, saveTable, studyRows, dialog, writeFiles, open,
	};
});
