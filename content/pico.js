/*
 * ZotMax — PICO 問題卡 and PICO 表 (feature pico): the Ask step of evidence-based practice, and one table that
 * answers it.
 *
 *   問題卡   one card per research project (a Zotero collection; the library itself when none is selected),
 *            kept in the pref pico.cards as JSON: the question type (治療／預防, 診斷, 預後, 病因, 意義／經驗),
 *            P, I, C, O, T, the user's setting, the question sentence and notes. The card window shows one
 *            coaching hint per element and a live 聚焦檢查 (checkCard: pure rules, no AI), can compose a sentence
 *            from the elements on request (composeQuestion; the user edits it), and, while 醫學資料庫搜尋連結 is on,
 *            shows the search string the elements make (search-links.js picoQuery) with links into the
 *            databases. The question is written by the user; nothing here calls an AI or goes online.
 *   PICO 表   the selected items (or a collection: its full-text-included studies once screening has started)
 *            as one table: citation, design, N, P, I, C, O, 主要結果, evidence level, appraisal, and, with a
 *            card, 對照本題 (matchCard: a word match per element, never a judgement). The values come from each
 *            item's AI note (its structured data and 「主要結果」) and are marked as the AI's; a verified 文獻評讀表
 *            overrides the appraisal (appraisal-form.js). Written as a Markdown note (the Obsidian vault's
 *            Reviews folder, else a folder the user picked, else Downloads), a CSV, and an HTML file Word opens
 *            as a table; 「複製成表格」 puts the table on the clipboard as HTML for pasting into Word; a Notion page
 *            when the PRISMA parent page is set (screening.js). The note's managed block is rewritten on every
 *            export; 「✍️ 我的筆記」 is kept.
 *   PRISMA   the PRISMA note of a collection with a card gets a 「本題 PICO」 section (screening.js asks
 *            cardMarkdown for it).
 *   檢索詞    pearl growing: the subject terms the papers carry as Zotero tags (MeSH from PubMed, author keywords),
 *            counted by paper and marked when the card already has them — a section of the PICO 表 note, and in
 *            the card window the collection's common terms the card lacks (keywordSuggestions).
 *
 * The functions down to "Zotero" are pure (Node tests); the rest needs Zotero.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(require("./core.js"), require("./synthesis.js"), require("./screening.js"), require("./search-links.js"), globalThis);
	}
	else {
		(root.ZB = root.ZB || {}).pico = factory(root.ZB.core, root.ZB.synthesis, root.ZB.screening, root.ZB.searchLinks, root);
	}
})(this, function (core, synthesis, screening, searchLinks, scope) {
	const PREF = "extensions.zotero-bridge.";
	const FEATURE = "pico";
	const CARD_TITLE = "PICO 問題卡";
	const TABLE_TITLE = "PICO 表";
	const CARD_URL = "chrome://zotero-bridge/content/pico-card.xhtml";
	const TABLE_URL = "chrome://zotero-bridge/content/pico-table.xhtml";
	const CARD_ROOT = "zb-pico-card";
	const TABLE_ROOT = "zb-pico-table";
	const HTML_NS = "http://www.w3.org/1999/xhtml";
	const SELECTED_NAME = "選取的文獻";
	const REVIEW_FOLDER = "Reviews";
	const USER_HEADING = "✍️ 我的筆記";
	const NOT_REPORTED_RE = /^(?:n\/?a|null|none|nil|未報告|未提及|不適用|無|沒有)$/i;
	const MAX_OUTCOMES = 3;
	// Search links for the card's search string (search-links.js source IDs): English words, and the fields as written
	const EN_SOURCES = ["pubmed", "cinahl", "cochrane", "scholar"];
	const ALL_SOURCES = ["scholar", "airiti", "ndltd"];

	/**
	 * Question types. labels: what P, I, C and O mean for that type (質性 questions follow PICo: the phenomenon of
	 * interest and the context); hints: one coaching question per element, shown under the field.
	 */
	const TYPES = [
		{ id: "treatment", label: "治療／預防",
			labels: { p: "族群（P）", i: "介入（I）", c: "對照（C）", o: "結果（O）" },
			hints: {
				p: "誰？年齡、疾病或狀況、場域（病房、社區…）。只寫「病人」太寬，寫得出「65 歲以上住院病人」才搜得準。",
				i: "做什麼？由誰做、做多久、多頻繁。一個介入就好，兩個以上請分成兩張卡。",
				c: "跟什麼比？常規照護、安慰劑、另一種做法，或沒有介入。沒有對照也可以，但找到的多半是單組研究。",
				o: "量什麼、什麼時候量、用什麼工具？病人在乎的結果（跌倒、疼痛、再住院）優先，1–3 個就好。",
			} },
		{ id: "diagnosis", label: "診斷",
			labels: { p: "族群（P）", i: "檢測／工具（I）", c: "參考標準（C）", o: "要診斷的狀況（O）" },
			hints: {
				p: "誰接受這個檢測？疾病盛行率不同，準確度也不同，所以場域要寫。",
				i: "哪個檢測、量表或工具？誰施測、何時施測。",
				c: "跟哪個參考標準（gold standard）比？",
				o: "要診斷或篩檢出什麼狀況？準確度用敏感度、特異度、likelihood ratio 看。",
			} },
		{ id: "prognosis", label: "預後",
			labels: { p: "族群（P）", i: "預後因子／暴露（I）", c: "沒有該因子（C）", o: "結果（O）" },
			hints: {
				p: "誰？病程哪個階段？",
				i: "哪個因子、特徵或暴露可能影響結果？",
				c: "沒有這個因子的人（可留空）。",
				o: "多久之後、哪個結果？死亡、復發、功能、生活品質。",
			} },
		{ id: "etiology", label: "病因／危害",
			labels: { p: "族群（P）", i: "暴露／危險因子（I）", c: "沒有暴露（C）", o: "結果（O）" },
			hints: {
				p: "誰可能暴露？",
				i: "暴露於什麼？劑量、時間。",
				c: "沒有暴露、或暴露較少的人。",
				o: "可能造成的傷害或疾病；多久之後出現。",
			} },
		{ id: "meaning", label: "意義／經驗（質性）",
			labels: { p: "對象（P）", i: "關注的現象（I）", c: "情境（Co）", o: "（質性問題通常不填）" },
			hints: {
				p: "誰的經驗？病人、家屬、護理師？",
				i: "想理解的經驗、感受或過程是什麼？",
				c: "在什麼情境裡？文化、場域、病程階段。",
				o: "質性問題多半沒有量化結果；要寫也可以。",
			} },
	];
	const TYPE_BY_ID = new Map(TYPES.map(t => [t.id, t]));
	const TEXT_FIELDS = ["p", "i", "c", "o", "t", "setting", "question", "notes"];
	// English words that match too easily between any two fields
	const STOP_WORDS = new Set(["with", "without", "from", "that", "this", "than", "them", "they", "their", "have", "after", "before", "during", "usual",
		"care", "group", "study", "patients", "patient", "people", "adults", "versus", "other", "more", "less", "over", "under", "into", "among", "between"]);

	// Test hooks: cardDialog(info), tableDialog(info), notice(info), reveal(path), copy(html, text), downloads(), now()
	const runtime = {};
	let busy = false;

	function ZB() {
		return scope.ZB;
	}

	// ---------- cards (pure) ----------

	function oneLine(s) {
		return String(s === null || s === undefined ? "" : s).replace(/\s+/g, " ").trim();
	}

	function text(s) {
		return String(s === null || s === undefined ? "" : s).replace(/\r\n?/g, "\n").trim();
	}

	function emptyCard() {
		return { type: "treatment", p: "", i: "", c: "", o: "", t: "", setting: "", question: "", notes: "", updatedAt: "" };
	}

	/** A card from stored JSON or the window: every field a trimmed string, the type one of TYPES. */
	function normalizeCard(raw) {
		let card = emptyCard();
		if (!raw || typeof raw !== "object") return card;
		card.type = TYPE_BY_ID.has(raw.type) ? raw.type : "treatment";
		for (let f of TEXT_FIELDS) card[f] = text(raw[f]);
		card.updatedAt = oneLine(raw.updatedAt);
		return card;
	}

	function typeOf(card) {
		return TYPE_BY_ID.get(card && card.type) || TYPES[0];
	}

	/** The element labels for a card's question type. */
	function fieldLabels(card) {
		return typeOf(card).labels;
	}

	function fieldHints(card) {
		return typeOf(card).hints;
	}

	/** Something was written (an empty card is not saved). */
	function cardHasContent(card) {
		return TEXT_FIELDS.some(f => text(card && card[f]));
	}

	/** One field's terms: split at commas, slashes and and/or; brackets and quotes removed; placeholders dropped. */
	function terms(value) {
		let s = String(value === null || value === undefined ? "" : value).normalize("NFKC").replace(/[`"“”「」『』()（）[\]【】{}]/g, " ");
		let parts = s.split(/\s*(?:[、，,;；／/|\n]|\s(?:and|or|vs\.?|versus)\s)\s*/i)
			.map(t => t.replace(/\s+/g, " ").trim())
			.filter(t => t.length >= 2 && !NOT_REPORTED_RE.test(t));
		return [...new Set(parts)];
	}

	/** What the card means to search-links.js picoQuery (the AI note's field names). */
	function cardAsStudy(card) {
		let c = normalizeCard(card);
		return { population: c.p, intervention: c.i, comparison: c.c, outcomes: c.o };
	}

	/** The card's search strings ({ en, all, blocks, skipped } from search-links.js), null without P, I, C or O. */
	function cardQuery(card, opts = {}) {
		if (!searchLinks || !searchLinks.picoQuery) return null;
		return searchLinks.picoQuery(cardAsStudy(card), { includeC: opts.includeC !== false });
	}

	/**
	 * A question sentence from the elements, by question type: a starting point the user edits. "" when there is
	 * no P or no I.
	 */
	function composeQuestion(card) {
		let c = normalizeCard(card);
		let p = oneLine(c.p);
		let i = oneLine(c.i);
		let co = oneLine(c.c);
		let o = oneLine(c.o);
		let t = oneLine(c.t);
		if (!p || !i) return "";
		let when = t ? `（${t}）` : "";
		switch (c.type) {
			case "diagnosis":
				return `在${p}中，${i}${co ? `相較於${co}` : ""}，診斷${o || "目標狀況"}的準確度如何？`;
			case "prognosis":
				return `在${p}中，有${i}${co ? `相較於${co}` : ""}者，${o || "預後"}${when}有何不同？`;
			case "etiology":
				return `${p}暴露於${i}${co ? `（相較於${co}）` : ""}，${o || "不良結果"}的風險${when}是否增加？`;
			case "meaning":
				return `${p}在${co || "其情境"}中，對${i}的經驗與感受為何？`;
			default:
				return `在${p}中，${i}${co ? `相較於${co}` : ""}，對${o || "結果"}的效果${when}如何？`;
		}
	}

	function hasEnglish(s) {
		return /[A-Za-z]{3,}/.test(String(s || ""));
	}

	/**
	 * 聚焦檢查: what would make the question hard to search or answer, as [{ level: "warn" | "info", field, text }].
	 * Rules only, no AI; an empty list means nothing to point out.
	 */
	function checkCard(card) {
		let c = normalizeCard(card);
		let labels = fieldLabels(c);
		let out = [];
		let add = (level, field, t) => out.push({ level, field, text: t });
		let p = oneLine(c.p);
		let i = oneLine(c.i);
		let co = oneLine(c.c);
		let o = oneLine(c.o);
		if (!p) add("warn", "p", `還沒寫${labels.p}：沒有族群，什麼研究都找得到，也都不一定適用。`);
		else if (p.normalize("NFKC").length < 4) add("info", "p", `${labels.p}只有幾個字：想想年齡、疾病或場域能不能寫進去，搜尋會準很多。`);
		if (!i) add("warn", "i", `還沒寫${labels.i}。`);
		else if (terms(i).length > 1 && c.type !== "meaning") add("info", "i", `${labels.i}有 ${terms(i).length} 個：一張卡一個介入，比較容易回答；要比較兩種介入時，把另一種放在對照。`);
		if (!co && ["treatment", "diagnosis", "etiology"].includes(c.type)) {
			add("info", "c", `沒有${labels.c}：常規照護、安慰劑、另一種做法，或沒有介入？沒有對照也可以，但找到的多半是單組研究。`);
		}
		if (i && co && i.normalize("NFKC").toLowerCase() === co.normalize("NFKC").toLowerCase()) add("warn", "c", `${labels.i}和${labels.c}寫的一樣。`);
		if (!o && c.type !== "meaning") add("warn", "o", `還沒寫${labels.o}：量什麼、什麼時候量、用什麼工具？`);
		else if (o && terms(o).length > MAX_OUTCOMES) add("info", "o", `${labels.o}有 ${terms(o).length} 個：報告通常聚焦 1–${MAX_OUTCOMES} 個主要結果，其他可以放在備註。`);
		if (!c.question) add("warn", "question", "還沒有完整的問題句：按「用欄位組一句」拿一個起點，再改成你的話。");
		if ((p || i || o) && ![p, i, o].some(hasEnglish)) {
			add("info", "search", "P、I、O 都沒有英文詞：PubMed、CINAHL 這類英文資料庫會找不到。在欄位裡補上英文關鍵字（例如「跌倒 falls」），或用快速搜尋查 MeSH。");
		}
		if (!c.setting && c.type !== "meaning") add("info", "setting", "情境留空：寫下你的單位和病人（例如「區域醫院內科病房，多為 70 歲以上」），之後判斷研究能不能應用時會用到。");
		return out;
	}

	// ---------- matching a paper against the card (pure) ----------

	function norm(s) {
		return String(s === null || s === undefined ? "" : s).normalize("NFKC").toLowerCase();
	}

	function englishWords(s) {
		return [...String(s).matchAll(/[a-z][a-z'-]{3,}/gi)].map(m => m[0].toLowerCase()).filter(w => !STOP_WORDS.has(w));
	}

	function chineseBigrams(s) {
		let out = [];
		let runs = String(s).match(/[一-鿿]{2,}/g) || [];
		for (let run of runs) {
			for (let k = 0; k + 2 <= run.length; k++) out.push(run.slice(k, k + 2));
		}
		return [...new Set(out)];
	}

	/**
	 * Does the paper's field share words with the card's? "yes" (a term, an English word of 4+ letters or two
	 * Chinese bigrams in common), "no", or "none" when the paper has no value. A word match, nothing more.
	 */
	function matchField(cardValue, studyValue) {
		let b = norm(studyValue);
		if (!b || NOT_REPORTED_RE.test(b.trim())) return "none";
		let a = norm(cardValue);
		if (!a) return "none";
		for (let term of terms(a)) {
			let t = norm(term);
			if (b.includes(t) || (t.length >= 4 && a.length >= 4 && t.includes(b))) return "yes";
			if (englishWords(t).some(w => b.includes(w))) return "yes";
			let grams = chineseBigrams(t).filter(g => b.includes(g));
			if (grams.length >= 2 || (grams.length === 1 && chineseBigrams(t).length === 1)) return "yes";
		}
		return "no";
	}

	const MATCH_MARK = { yes: "✓", no: "？", none: "—" };

	/**
	 * The card against one study's P, I, C, O: { p, i, c, o: "yes" | "no" | "none", text: "P✓ I？ C— O✓",
	 * matched, checked }. Null without a card or without study data.
	 */
	function matchCard(card, study) {
		if (!card || !cardHasContent(card) || !study) return null;
		let c = normalizeCard(card);
		let r = {
			p: matchField(c.p, study.population),
			i: matchField(c.i, study.intervention),
			c: matchField(c.c, study.comparison),
			o: matchField(c.o, study.outcomes),
		};
		let parts = [];
		for (let [k, v] of Object.entries(r)) {
			if (!oneLine(c[k])) continue;
			parts.push(`${k.toUpperCase()}${MATCH_MARK[v]}`);
		}
		r.text = parts.join(" ");
		r.checked = parts.length;
		r.matched = ["p", "i", "c", "o"].filter(k => oneLine(c[k]) && r[k] === "yes").length;
		return r;
	}

	const MATCH_LEGEND = "「對照本題」只是字詞比對：✓ 這篇的該要素和問題卡有共同字詞，？ 沒有共同字詞（換個說法也可能是同一件事），— 這篇沒有該要素的資料。符不符合本題，由你讀原文判斷。";

	// ---------- search terms from the papers' own keywords (pure) ----------

	// The plugin's and the user's workflow tags, not subject terms
	const WORKFLOW_TAG_RE = /^(?:狀態|篩選|排除原因|來源|自動分類)\/|^zotero-bridge|^_/;
	const MAX_KEYWORDS = 15;

	function termKey(s) {
		return String(s || "").normalize("NFKC").toLowerCase().replace(/[\s\-‐-―_]+/g, " ").trim();
	}

	/** A tag as a subject term: "*Accidental Falls/prevention & control" → "Accidental Falls"; "" for workflow tags. */
	function tagTerm(tag) {
		let t = String(tag || "").normalize("NFKC").trim();
		if (!t || WORKFLOW_TAG_RE.test(t)) return "";
		t = t.replace(/^\*/, "").split("/")[0].trim();
		if (t.length < 2 || t.length > 80 || /^\d+$/.test(t)) return "";
		let stop = (searchLinks && searchLinks.MESH_STOP) || new Set();
		return stop.has(t.toLowerCase()) ? "" : t;
	}

	/**
	 * Pearl growing: the subject terms the papers carry in Zotero (PubMed's MeSH, a database's author keywords),
	 * by how many papers have them, each marked when the card or its search string already has it.
	 * tagLists: one array of tags per paper. Returns [{ term, papers, inSearch }] (at most MAX_KEYWORDS; terms
	 * on one paper only when there are fewer than four papers).
	 */
	function keywordSuggestions(tagLists, card, opts = {}) {
		let lists = (tagLists || []).filter(Array.isArray);
		let counts = new Map();
		for (let tags of lists) {
			let seen = new Set();
			for (let tag of tags) {
				let term = tagTerm(tag);
				let k = termKey(term);
				if (!k || seen.has(k)) continue;
				seen.add(k);
				let e = counts.get(k) || { term, papers: 0 };
				e.papers++;
				counts.set(k, e);
			}
		}
		let c = card ? normalizeCard(card) : null;
		let q = opts.query || null;
		let hay = termKey([c ? [c.p, c.i, c.c, c.o, c.question].join(" ") : "", q ? `${q.en || ""} ${q.all || ""}` : ""].join(" "));
		let min = lists.length >= 4 ? 2 : 1;
		return [...counts.entries()].filter(([, e]) => e.papers >= min)
			.map(([k, e]) => ({ term: e.term, papers: e.papers, inSearch: !!hay && hay.includes(k) }))
			.sort((a, b) => b.papers - a.papers || a.term.localeCompare(b.term, "en"))
			.slice(0, opts.max || MAX_KEYWORDS);
	}

	/** 「🔎 檢索詞建議」 for the PICO 表 note ("" without terms). total: how many papers the terms came from. */
	function keywordSection(list, total, withCard) {
		if (!list || !list.length) return "";
		let head = withCard ? ["詞", "篇數", "已在問題卡"] : ["詞", "篇數"];
		let lines = [`| ${head.join(" | ")} |`, `|${head.map((h, i) => (i ? ":---:" : "---")).join("|")}|`];
		for (let k of list) {
			let row = [cell(k.term), `${core.bar(k.papers, total, 6)} ${k.papers}`];
			if (withCard) row.push(k.inSearch ? "✓" : "");
			lines.push(`| ${row.join(" | ")} |`);
		}
		let missing = withCard ? list.filter(k => !k.inSearch).length : 0;
		return [
			"## 🔎 檢索詞建議（從這些文獻反推）",
			`這些詞取自上面 ${total} 篇文獻在 Zotero 的標籤（從 PubMed 匯入的 MeSH、其他資料庫的作者關鍵字），依出現篇數排序。`
				+ (withCard ? `沒有打勾的 ${missing} 個，問題卡和檢索式裡還沒有；可以考慮加成同義詞，再到 MeSH Database 確認。` : "建立 PICO 問題卡後，會標出哪些已經在你的檢索式裡。"),
			lines.join("\n"),
		].join("\n\n");
	}

	// ---------- card as Markdown (pure) ----------

	function cell(v) {
		return oneLine(v).replace(/\|/g, "\\|");
	}

	/**
	 * The card as Markdown: the question, a two-column table of the elements, the setting, the search string
	 * (opts.query from cardQuery) and the notes. opts.heading: a heading above (e.g. "## 本題 PICO").
	 */
	function cardMarkdown(card, opts = {}) {
		let c = normalizeCard(card);
		let labels = fieldLabels(c);
		let rows = [["問題類型", typeOf(c).label], ["P", labels.p], ["I", labels.i], ["C", labels.c], ["O", labels.o]]
			.map(([k, label]) => (k.length === 1 ? [label, c[k.toLowerCase()]] : [k, label]));
		if (c.t) rows.push(["時間（T）", c.t]);
		if (c.setting) rows.push(["我的情境", c.setting]);
		let out = [];
		if (opts.heading) out.push(opts.heading);
		out.push(`**研究問題**：${c.question ? cell(c.question) : "（還沒寫問題句）"}`);
		out.push(["| 要素 | 內容 |", "|---|---|", ...rows.map(([k, v]) => `| ${cell(k)} | ${cell(v) || "（空白）"} |`)].join("\n"));
		let q = opts.query;
		if (q && (q.en || q.all)) {
			let lines = [];
			if (q.en) lines.push(`檢索式（英文詞）：\`${q.en}\`` + (q.skipped && q.skipped.length ? `（${q.skipped.join("、")}沒有英文詞，未列入）` : ""));
			if (q.all && q.all !== q.en) lines.push(`檢索式（原文詞彙）：\`${q.all}\``);
			out.push(lines.join("  \n"));
		}
		if (c.notes) out.push(`備註：${c.notes.replace(/\n/g, "  \n")}`);
		if (c.updatedAt) out.push(`*問題卡更新於 ${c.updatedAt.slice(0, 10)}*`);
		return out.join("\n\n");
	}

	// ---------- the table (pure) ----------

	function textOf(v) {
		return v === null || v === undefined ? "" : String(v);
	}

	/**
	 * One row. entry: { record: { creators, title, year, publication, doi, uri }, study (the AI note's structured
	 * data, or null), md (the AI note's Markdown, for 主要結果), appraisal: { verified, status } | null, link
	 * (the Obsidian note, for wikilinks), card }.
	 */
	function tableRow(entry) {
		let r = entry.record || {};
		let s = entry.study || {};
		let findings = entry.md ? core.keyFindings(entry.md, 3) : [];
		let appraisal = entry.appraisal || null;
		let status = "";
		if (appraisal && appraisal.verified) status = "已核對";
		else if (appraisal && appraisal.status === "human") status = "評讀中";
		else if (textOf(s.appraisal_overall)) status = "AI 初評";
		return {
			citation: synthesis.shortCitation({ creators: r.creators || [], title: r.title, year: r.year }),
			authors: core.authorNames({ creators: r.creators || [] }).join("; "),
			year: textOf(r.year),
			title: textOf(r.title),
			publication: textOf(r.publication),
			doi: textOf(r.doi),
			uri: textOf(r.uri),
			link: entry.link || "",
			hasData: !!entry.study,
			design: textOf(s.study_design),
			sampleSize: Number.isFinite(s.sample_size) ? String(s.sample_size) : "",
			setting: textOf(s.setting),
			country: textOf(s.country),
			population: textOf(s.population),
			intervention: textOf(s.intervention),
			comparison: textOf(s.comparison),
			outcomes: textOf(s.outcomes),
			measures: Array.isArray(s.measures) ? s.measures.join("; ") : "",
			findings: findings.join("；"),
			evidenceLevel: textOf(s.evidence_level),
			jbiLevel: textOf(s.jbi_level),
			appraisalTool: textOf(s.appraisal_tool),
			appraisalOverall: textOf(s.appraisal_overall),
			appraisalStatus: status,
			match: entry.card ? matchCard(entry.card, entry.study) : null,
			// The item's Zotero tags, for 檢索詞建議 (not a column)
			tags: Array.isArray(r.tags) ? r.tags : [],
		};
	}

	function sortRows(rows) {
		return rows.slice().sort((a, b) => a.citation.localeCompare(b.citation, "en") || a.title.localeCompare(b.title));
	}

	function levelCell(r) {
		return [r.evidenceLevel ? `CEBM ${r.evidenceLevel}` : "", r.jbiLevel ? `JBI ${r.jbiLevel}` : ""].filter(Boolean).join("；");
	}

	function appraisalCell(r) {
		let main = [r.appraisalOverall, r.appraisalTool ? `（${r.appraisalTool}）` : ""].filter(Boolean).join("");
		if (!main && !r.appraisalStatus) return "";
		return [main, r.appraisalStatus ? `［${r.appraisalStatus}］` : ""].filter(Boolean).join(" ");
	}

	function designCell(r) {
		if (!r.hasData) return "（沒有 AI 筆記的結構化資料）";
		return [r.design, r.sampleSize ? `N = ${r.sampleSize}` : ""].filter(Boolean).join("，");
	}

	function headers(withMatch) {
		let h = ["文獻", "研究設計", "P 族群", "I 介入", "C 對照", "O 結果", "主要結果", "證據等級", "評讀"];
		if (withMatch) h.push("對照本題");
		return h;
	}

	function cells(r, withMatch) {
		let out = [designCell(r), r.population, r.intervention, r.comparison, r.outcomes, r.findings, levelCell(r), appraisalCell(r)];
		if (withMatch) out.push(r.match ? r.match.text : (r.hasData ? "" : "—"));
		return out;
	}

	/** The Markdown table; opts.links: the first column links to the Obsidian note; opts.match: the 對照本題 column. */
	function tableMarkdown(rows, opts = {}) {
		if (!rows.length) return "（沒有可以列的文獻）";
		let head = headers(!!opts.match);
		let lines = [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`];
		for (let r of rows) {
			let first = opts.links && r.link ? `[[${r.link}\\|${cell(r.citation)}]]` : cell(r.citation);
			lines.push(`| ${[first, ...cells(r, !!opts.match).map(cell)].join(" | ")} |`);
		}
		return lines.join("\n");
	}

	const CSV_COLUMNS = [
		["文獻", "citation"], ["作者", "authors"], ["年份", "year"], ["標題", "title"], ["期刊", "publication"], ["DOI", "doi"],
		["研究設計", "design"], ["樣本數", "sampleSize"], ["場域", "setting"], ["國家", "country"],
		["P 族群", "population"], ["I 介入", "intervention"], ["C 對照", "comparison"], ["O 結果", "outcomes"], ["測量工具", "measures"], ["主要結果", "findings"],
		["CEBM 證據等級", "evidenceLevel"], ["JBI 證據等級", "jbiLevel"], ["評讀工具", "appraisalTool"], ["評讀結果", "appraisalOverall"], ["評讀狀態", "appraisalStatus"],
		["對照本題", r => (r.match ? r.match.text : "")], ["Zotero", "uri"],
	];

	/** CSV with a UTF-8 BOM and CRLF, like the PRISMA evidence table (Excel opens the Chinese text correctly). */
	function tableCSV(rows) {
		let value = (r, k) => (typeof k === "function" ? k(r) : r[k]);
		let lines = [CSV_COLUMNS.map(([h]) => h), ...rows.map(r => CSV_COLUMNS.map(([, k]) => value(r, k)))];
		return "﻿" + lines.map(l => l.map(screening.csvCell).join(",")).join("\r\n") + "\r\n";
	}

	function escapeHTML(s) {
		return String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}

	/** The table (and the card above it) as an HTML fragment: what 「複製成表格」 puts on the clipboard for Word. */
	function tableFragment(rows, card, opts = {}) {
		let withMatch = !!(card && cardHasContent(card));
		let out = [];
		if (withMatch) {
			let c = normalizeCard(card);
			let labels = fieldLabels(c);
			out.push(`<p><b>研究問題</b>：${escapeHTML(c.question || "（還沒寫問題句）")}</p>`);
			let rowsHTML = [["問題類型", typeOf(c).label], [labels.p, c.p], [labels.i, c.i], [labels.c, c.c], [labels.o, c.o]];
			if (c.t) rowsHTML.push(["時間（T）", c.t]);
			if (c.setting) rowsHTML.push(["我的情境", c.setting]);
			out.push("<table border=\"1\" cellpadding=\"4\" cellspacing=\"0\"><tr><th>要素</th><th>內容</th></tr>"
				+ rowsHTML.map(([k, v]) => `<tr><td>${escapeHTML(k)}</td><td>${escapeHTML(v || "（空白）")}</td></tr>`).join("") + "</table>");
		}
		let head = headers(withMatch);
		out.push("<table border=\"1\" cellpadding=\"4\" cellspacing=\"0\"><tr>" + head.map(h => `<th>${escapeHTML(h)}</th>`).join("") + "</tr>"
			+ rows.map(r => "<tr>" + [r.citation, ...cells(r, withMatch)].map(v => `<td>${escapeHTML(oneLine(v))}</td>`).join("") + "</tr>").join("") + "</table>");
		if (opts.note !== false) out.push(`<p>${escapeHTML(SOURCE_NOTE)}${withMatch ? " " + escapeHTML(MATCH_LEGEND) : ""}</p>`);
		return out.join("\n");
	}

	/** Plain text for the clipboard beside the HTML: tab-separated rows. */
	function tableTSV(rows, card) {
		let withMatch = !!(card && cardHasContent(card));
		let lines = [headers(withMatch).join("\t")];
		for (let r of rows) lines.push([r.citation, ...cells(r, withMatch)].map(v => oneLine(v).replace(/\t/g, " ")).join("\t"));
		return lines.join("\n");
	}

	const SOURCE_NOTE = "欄位取自各篇 AI 筆記的結構化資料與「主要結果」，是 AI 初填；評讀欄標「已核對」的是你在文獻評讀表核對過的。每一格請回原文核對後再寫進報告。";

	/** The whole HTML file Word opens (meta.title, meta.scopeName, meta.date). */
	function tableHTML(rows, card, meta) {
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
			`<p>ZotMax 依「${escapeHTML(meta.scopeName)}」的 ${rows.length} 篇文獻於 ${escapeHTML(meta.date)} 產生。在 Word 開啟這個檔案後可以另存成 .docx；表格可以直接複製到報告裡。</p>`,
			tableFragment(rows, card),
			"</body>",
			"</html>",
			"",
		].join("\n");
	}

	/**
	 * The managed part of the note (and the Notion page). meta: { scopeName, generatedAt, uri, csvPath, htmlPath,
	 * links, query, screened: { included, total } | null }
	 */
	function noteSection(rows, card, meta) {
		let withCard = !!(card && cardHasContent(card));
		let info = [
			`> [!info] 由 ZotMax 依「${meta.scopeName}」的 ${rows.length} 篇文獻於 ${String(meta.generatedAt || "").slice(0, 10)} 產生；重新產生只會覆寫這個區塊。`,
			meta.screened ? `> 篩選已開始，所以只列全文納入的 ${meta.screened.included} 篇（分類共 ${meta.screened.total} 篇）。` : "",
			meta.uri ? `> Zotero：[開啟](${meta.uri})` + (meta.csvPath ? ` · CSV：\`${meta.csvPath}\`` : "") + (meta.htmlPath ? ` · Word 版：\`${meta.htmlPath}\`` : "") : "",
			`> ${SOURCE_NOTE}`,
		].filter(Boolean).join("\n");
		let out = [info];
		if (withCard) out.push(cardMarkdown(card, { heading: "## 本題 PICO", query: meta.query }));
		out.push(`## PICO 表（${rows.length} 篇）`, tableMarkdown(rows, { links: meta.links, match: withCard }));
		if (withCard) out.push(MATCH_LEGEND);
		let kw = keywordSection(meta.keywords, rows.length, withCard);
		if (kw) out.push(kw);
		let none = rows.filter(r => !r.hasData);
		if (none.length) {
			out.push("## 沒有結構化資料的文獻", none.map(r => `- ${meta.links && r.link ? `[[${r.link}\\|${cell(r.citation)}]]` : cell(r.citation)}`).join("\n")
				+ "\n\n這幾篇還沒有 AI 筆記（或筆記裡沒有結構化資料）：先同步產生 AI 筆記，或自己在表裡補上。");
		}
		return out.join("\n\n");
	}

	function noteFrontmatter(rows, card, meta) {
		let c = card && cardHasContent(card) ? normalizeCard(card) : null;
		return {
			title: meta.title,
			type: "pico-table",
			zotero_collection: meta.collectionKey || "",
			collection_path: meta.path || meta.scopeName,
			zotero: meta.uri || "",
			pico_question: c ? c.question : "",
			pico_p: c ? c.p : "",
			pico_i: c ? c.i : "",
			pico_c: c ? c.c : "",
			pico_o: c ? c.o : "",
			studies: rows.length,
			studies_without_data: rows.filter(r => !r.hasData).length,
			pico_csv: meta.csvPath || "",
			pico_word: meta.htmlPath || "",
			notion: meta.notionUrl || "",
			last_generated: meta.generatedAt || "",
		};
	}

	/** The whole note: a new one, or the existing one with its managed block and frontmatter replaced (screening.js). */
	function buildNote(existing, fm, title, section) {
		return screening.buildReviewNote(existing, fm, title, section, ["PICO"]);
	}

	/** File names for a scope: `<name> PICO 表.md`, `.csv`, `.html`. */
	function fileNames(scopeName) {
		let base = `${core.sanitizeFilename(oneLine(scopeName) || SELECTED_NAME).slice(0, 80).trim()} PICO 表`;
		return { base, note: `${base}.md`, csv: `${base}.csv`, html: `${base}.html` };
	}

	/** The dialog text after an export. r: { dir, files, items, noData, notionUrl, notionError, card } */
	function doneText(r) {
		let lines = [`已把 ${r.items} 篇文獻整理成 PICO 表，寫到：`, r.dir, "", `檔案：${r.files.join("、")}`];
		if (r.notionUrl) lines.push(`Notion 頁面也更新了：${r.notionUrl}`);
		if (r.notionError) lines.push(`⚠ Notion 沒有寫入：${r.notionError}`);
		if (r.noData) lines.push(`⚠ ${r.noData} 篇沒有 AI 筆記的結構化資料，欄位是空的；先同步產生 AI 筆記，或自己補上。`);
		if (!r.card) lines.push("這個研究專案還沒有 PICO 問題卡，所以沒有「對照本題」欄；建立後重新匯出就會有。");
		lines.push("", "表裡的值是 AI 初填，請回原文核對。「複製成表格」會把表放到剪貼簿，直接貼進 Word。");
		return lines.join("\n");
	}

	function listTitles(list, max = 3) {
		let shown = list.slice(0, max).map(t => `「${oneLine(t) || "（沒有篇名）"}」`).join("、");
		return list.length > max ? `${shown} 等 ${list.length} 篇` : shown;
	}

	// ---------- the card window (DOM) ----------

	function el(doc, tag, attrs, content) {
		let e = doc.createElementNS(HTML_NS, tag);
		for (let [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
		if (content !== undefined) e.textContent = content;
		return e;
	}

	/**
	 * Draw the card window into `root`. info: { scopeName, card, isNew, search: boolean (search links on),
	 * tagLists: the collection's papers' Zotero tags, one array per paper (for the keyword suggestions) }
	 * handlers: { onSave(card), onDelete(), onCancel(), search(card) → { en, all, skipped, targets: [{ name, url, copy, query }] } | null,
	 * open(target), copy(text) }
	 */
	function renderCard(doc, root, info, handlers) {
		root.replaceChildren();
		let decided = false;
		let card = normalizeCard(info.card);
		let fields = {};

		let head = el(doc, "header", { class: "zb-cl-head" });
		head.append(
			el(doc, "h1", { class: "zb-cl-title" }, `${CARD_TITLE}：${info.scopeName}`),
			el(doc, "p", { class: "zb-cl-lead" }, "問題由你寫。每個欄位下面有一個引導問題，右邊的「聚焦檢查」只看你寫了什麼，不會呼叫 AI，也不連網。"),
		);

		let list = el(doc, "div", { class: "zb-cl-list" });

		// 問題類型
		let typeSec = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-pc-type-h" });
		typeSec.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-pc-type-h" }, "問題類型"));
		let typeRow = el(doc, "div", { class: "zb-pc-row" });
		let typeSelect = el(doc, "select", { id: "zb-pc-type" });
		for (let t of TYPES) typeSelect.append(el(doc, "option", { value: t.id }, t.label));
		typeSelect.value = card.type;
		typeRow.append(el(doc, "label", { for: "zb-pc-type", class: "zb-cl-why" }, "這是哪一種臨床問題？標籤和提示會跟著變："), typeSelect);
		typeSec.append(typeRow);

		// 要素
		let elemSec = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-pc-elements-h" });
		elemSec.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-pc-elements-h" }, "要素"));
		let labelEls = {};
		let hintEls = {};
		let field = (id, labelText, hint, rows, value) => {
			let wrap = el(doc, "div", { class: "zb-pc-field" });
			let lab = el(doc, "label", { for: `zb-pc-${id}`, class: "zb-pc-label" }, labelText);
			let input = rows ? el(doc, "textarea", { id: `zb-pc-${id}`, rows: String(rows), "aria-describedby": `zb-pc-${id}-hint` })
				: el(doc, "input", { id: `zb-pc-${id}`, type: "text", "aria-describedby": `zb-pc-${id}-hint` });
			input.value = value || "";
			let h = el(doc, "p", { class: "zb-cl-why zb-pc-hint", id: `zb-pc-${id}-hint` }, hint);
			wrap.append(lab, input, h);
			elemSec.append(wrap);
			fields[id] = input;
			labelEls[id] = lab;
			hintEls[id] = h;
			input.addEventListener("input", update);
			return input;
		};
		for (let k of ["p", "i", "c", "o"]) field(k, fieldLabels(card)[k], fieldHints(card)[k], 2, card[k]);
		field("t", "時間（T，選填）", "介入多久、追蹤多久？例如「12 週」「住院期間」。", 0, card.t);
		field("setting", "我的情境（選填）", "你的單位和病人：之後判斷研究能不能應用到你這裡時會用到。", 0, card.setting);

		// 問題句
		let qSec = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-pc-question-h" });
		qSec.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-pc-question-h" }, "完整的問題句"));
		let qWrap = el(doc, "div", { class: "zb-pc-field" });
		let question = el(doc, "textarea", { id: "zb-pc-question", rows: "2", "aria-describedby": "zb-pc-question-hint" });
		question.value = card.question;
		let compose = el(doc, "button", { type: "button", class: "zb-pc-compose" }, "用欄位組一句");
		let suggestion = el(doc, "p", { class: "zb-cl-why zb-pc-suggestion", id: "zb-pc-question-hint", "aria-live": "polite" });
		qWrap.append(el(doc, "label", { for: "zb-pc-question", class: "zb-pc-label" }, "一句話把 P、I、C、O 串起來（報告的研究問題就是這句）"), question, compose, suggestion);
		qSec.append(qWrap);
		fields.question = question;
		question.addEventListener("input", update);
		compose.addEventListener("click", () => {
			let s = composeQuestion(read());
			if (!s) {
				suggestion.textContent = "先寫族群和介入，才組得出句子。";
				return;
			}
			question.value = s;
			update();
			try {
				question.focus();
			}
			catch (e) {}
		});

		// 備註
		let notesWrap = el(doc, "div", { class: "zb-pc-field" });
		let notes = el(doc, "textarea", { id: "zb-pc-notes", rows: "2" });
		notes.value = card.notes;
		notesWrap.append(el(doc, "label", { for: "zb-pc-notes", class: "zb-pc-label" }, "備註（選填）：次要結果、納入條件、老師的提醒…"), notes);
		qSec.append(notesWrap);
		fields.notes = notes;
		notes.addEventListener("input", update);

		// 聚焦檢查
		let checkSec = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-pc-check-h" });
		checkSec.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-pc-check-h" }, "聚焦檢查"));
		let checks = el(doc, "ul", { class: "zb-pc-checks", role: "status", "aria-live": "polite" });
		checkSec.append(checks);

		// 搜尋
		let searchSec = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-pc-search-h" });
		searchSec.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-pc-search-h" }, "帶到資料庫搜尋"));
		let queryEn = el(doc, "p", { class: "zb-pc-query", "data-zb-query": "en" });
		let queryAll = el(doc, "p", { class: "zb-pc-query", "data-zb-query": "all" });
		let skipped = el(doc, "p", { class: "zb-cl-why" });
		let links = el(doc, "div", { class: "zb-pc-links" });
		let searchHint = el(doc, "p", { class: "zb-cl-why" });
		// Pearl growing: subject terms the collection's papers carry that the card doesn't have yet
		let kwHead = el(doc, "p", { class: "zb-pc-label", id: "zb-pc-kw-h" });
		let kwList = el(doc, "div", { class: "zb-pc-links", "data-zb-keywords": "", "aria-labelledby": "zb-pc-kw-h" });
		let kwHint = el(doc, "p", { class: "zb-cl-why" }, "取自這個分類文獻的 Zotero 標籤（MeSH、作者關鍵字）。按一下複製，再決定要不要加進欄位；記得到 MeSH Database 確認。");
		searchSec.append(queryEn, queryAll, skipped, links, searchHint, kwHead, kwList, kwHint);

		list.append(typeSec, elemSec, qSec, checkSec, searchSec);

		let foot = el(doc, "footer", { class: "zb-cl-foot" });
		let summary = el(doc, "p", { class: "zb-cl-summary", role: "status" }, "");
		let buttons = el(doc, "div", { class: "zb-cl-buttons" });
		let del = el(doc, "button", { type: "button", class: "zb-pc-delete" }, "刪除這張卡");
		let cancel = el(doc, "button", { type: "button", class: "zb-cl-cancel" }, "取消");
		let save = el(doc, "button", { type: "button", class: "zb-cl-apply" }, "儲存");
		del.hidden = !!info.isNew;
		buttons.append(del, cancel, save);
		foot.append(summary, buttons);
		root.append(head, list, foot);

		del.addEventListener("click", () => finish("delete"));
		cancel.addEventListener("click", () => finish(null));
		save.addEventListener("click", () => finish(read()));
		typeSelect.addEventListener("change", () => {
			relabel();
			update();
		});
		root.addEventListener("keydown", (ev) => {
			if (ev.key === "Escape") {
				ev.preventDefault();
				finish(null);
			}
		});

		function read() {
			let c = { type: typeSelect.value };
			for (let f of TEXT_FIELDS) c[f] = fields[f] ? fields[f].value : "";
			return normalizeCard(c);
		}

		function relabel() {
			let c = read();
			let labels = fieldLabels(c);
			let hints = fieldHints(c);
			for (let k of ["p", "i", "c", "o"]) {
				labelEls[k].textContent = labels[k];
				hintEls[k].textContent = hints[k];
			}
		}

		function update() {
			let c = read();
			checks.replaceChildren();
			let found = checkCard(c);
			if (!found.length) checks.append(el(doc, "li", { class: "zb-pc-ok" }, "看起來聚焦了：每個要素都有，問題句也寫好了。"));
			for (let f of found) checks.append(el(doc, "li", { class: f.level === "warn" ? "zb-pc-warn" : "zb-pc-info" }, f.text));
			let s = c.question ? "" : composeQuestion(c);
			suggestion.textContent = s ? `建議起點：${s}` : "";
			// the search string the elements make, while 醫學資料庫搜尋連結 is on
			links.replaceChildren();
			let q = info.search && handlers.search ? handlers.search(c) : null;
			queryEn.hidden = !(q && q.en);
			queryAll.hidden = !(q && q.all && q.all !== q.en);
			queryEn.textContent = q && q.en ? `英文詞：${q.en}` : "";
			queryAll.textContent = q && q.all && q.all !== q.en ? `原文詞彙：${q.all}` : "";
			skipped.textContent = q && q.skipped && q.skipped.length ? `${q.skipped.join("、")}沒有英文詞，英文檢索式未列入。` : "";
			if (!info.search) searchHint.textContent = "「醫學資料庫搜尋連結」關著；在 設定 → 功能 打開後，這裡會列出檢索式和資料庫連結。";
			else if (!q) searchHint.textContent = "寫了要素之後，這裡會列出 P AND I AND O 的檢索式和資料庫連結。檢索式只是起點，請到 MeSH Database 確認主題詞。";
			else searchHint.textContent = "檢索式只是起點：請到 MeSH Database 確認主題詞，再依資料庫調整。";
			if (q) {
				for (let [label, textValue] of [["複製英文檢索式", q.en], ["複製原文檢索式", q.all !== q.en ? q.all : ""]]) {
					if (!textValue) continue;
					let b = el(doc, "button", { type: "button", class: "zb-pc-link" }, label);
					b.addEventListener("click", () => handlers.copy && handlers.copy(textValue));
					links.append(b);
				}
				for (let t of q.targets || []) {
					let b = el(doc, "button", { type: "button", class: "zb-pc-link", title: t.copy ? "開啟首頁並複製檢索式" : t.url }, t.copy ? `${t.name}（複製）` : t.name);
					b.addEventListener("click", () => handlers.open && handlers.open(t));
					links.append(b);
				}
			}
			kwList.replaceChildren();
			let missing = info.tagLists && info.tagLists.length
				? keywordSuggestions(info.tagLists, c, { query: q, max: 30 }).filter(k => !k.inSearch).slice(0, 8) : [];
			kwHead.hidden = kwList.hidden = kwHint.hidden = !missing.length;
			kwHead.textContent = missing.length ? `這個分類的文獻常用、但問題卡還沒有的詞（${missing.length}）` : "";
			for (let k of missing) {
				let b = el(doc, "button", { type: "button", class: "zb-pc-link", title: `${k.papers} 篇文獻有這個詞；按一下複製` }, `${k.term}（${k.papers}）`);
				b.addEventListener("click", () => handlers.copy && handlers.copy(k.term));
				kwList.append(b);
			}
			let warns = found.filter(f => f.level === "warn").length;
			summary.textContent = warns ? `還有 ${warns} 項要補；也可以先存，之後再改。` : "可以儲存了；之後隨時回來改。";
			save.disabled = decided || !cardHasContent(c);
		}

		function finish(result) {
			if (decided) return;
			decided = true;
			save.disabled = true;
			cancel.disabled = true;
			del.disabled = true;
			if (result === "delete") handlers.onDelete();
			else if (result) handlers.onSave(result);
			else handlers.onCancel();
		}

		relabel();
		update();
		try {
			fields.p.focus();
		}
		catch (e) {}
		return { update, finish, read, fields, buttons: { save, cancel, del, compose }, typeSelect };
	}

	// ---------- the table window (DOM) ----------

	/**
	 * Draw the export options into `root`. info: { scopeName, titles, screened: { included, total } | null, noData,
	 * card, folder, folderSource: "vault" | "saved" | "downloads" | "home", files: { note, csv, html }, notion: boolean }
	 * handlers: { onExport({ folder, csv, html, notion, remember }), onCancel(), pickFolder(current) → path | null }
	 */
	function renderTable(doc, root, info, handlers) {
		root.replaceChildren();
		let decided = false;
		let folder = info.folder || "";
		let remember = false;

		let head = el(doc, "header", { class: "zb-cl-head" });
		head.append(
			el(doc, "h1", { class: "zb-cl-title" }, `匯出 ${TABLE_TITLE}`),
			el(doc, "p", { class: "zb-cl-lead" }, "把每篇的 P、I、C、O、主要結果、證據等級和評讀整理成一張表。值是 AI 筆記初填的，表上會標明；核對由你做。不呼叫 AI。"),
		);

		let list = el(doc, "div", { class: "zb-cl-list" });
		let what = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-pt-what" });
		what.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-pt-what" }, `${info.scopeName}：${info.titles.length} 篇文獻`));
		let metaLines = [];
		if (info.screened) metaLines.push(`篩選已開始，所以只列全文納入的 ${info.screened.included} 篇（分類共 ${info.screened.total} 篇）。`);
		metaLines.push(info.noData ? `${info.noData} 篇還沒有 AI 筆記的結構化資料，那幾列會是空的。` : "每篇都有 AI 筆記的結構化資料。");
		what.append(el(doc, "p", { class: "zb-cl-item-meta" }, metaLines.join(" ")));
		let details = el(doc, "details", { class: "zb-cl-without" });
		details.append(el(doc, "summary", {}, `看清單（${info.titles.length} 篇）`));
		let ul = el(doc, "ul");
		for (let t of info.titles) ul.append(el(doc, "li", {}, oneLine(t) || "（沒有篇名）"));
		details.append(ul);
		what.append(details);

		let cardSec = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-pt-card" });
		cardSec.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-pt-card" }, "本題 PICO"));
		if (info.card && cardHasContent(info.card)) {
			let c = normalizeCard(info.card);
			cardSec.append(el(doc, "p", { class: "zb-pt-question" }, c.question || "（問題卡還沒寫問題句）"));
			let labels = fieldLabels(c);
			let dl = el(doc, "dl", { class: "zb-pt-card" });
			for (let k of ["p", "i", "c", "o"]) {
				if (!c[k]) continue;
				dl.append(el(doc, "dt", {}, labels[k]), el(doc, "dd", {}, c[k]));
			}
			cardSec.append(dl, el(doc, "p", { class: "zb-cl-why" }, "表上會多一欄「對照本題」：每篇的 P、I、C、O 和問題卡有沒有共同字詞。只是字詞比對，符不符合由你讀原文判斷。"));
		}
		else {
			cardSec.append(el(doc, "p", { class: "zb-cl-item-meta", "data-zb-no-card": "" }, "這個研究專案還沒有 PICO 問題卡，表上不會有「對照本題」欄。先用 ZotMax 按鈕或快速指令 → 「PICO 問題卡…」建立，再回來匯出。"));
		}

		let where = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-pt-where" });
		where.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-pt-where" }, "放在哪裡"));
		let path = el(doc, "p", { class: "zb-ge-path", "data-zb-folder": "" });
		let row = el(doc, "div", { class: "zb-ge-row" });
		let pick = el(doc, "button", { type: "button", class: "zb-ge-pick" }, "選擇資料夾…");
		row.append(path, pick);
		let target = el(doc, "p", { class: "zb-cl-item-meta" });
		where.append(row, target);

		let options = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-pt-options" });
		options.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-pt-options" }, "也產生"));
		let option = (id, label, hint, checked, hidden) => {
			let wrap = el(doc, "div", { class: "zb-ge-option" });
			let box = el(doc, "input", { type: "checkbox", id, "aria-describedby": `${id}-hint` });
			box.checked = !!checked;
			let lab = el(doc, "label", { for: id, class: "zb-ge-label" }, label);
			wrap.append(box, lab, el(doc, "p", { class: "zb-cl-why zb-ge-hint", id: `${id}-hint` }, hint));
			wrap.hidden = !!hidden;
			options.append(wrap);
			return box;
		};
		let csv = option("zb-pt-csv", `CSV（${info.files.csv}）`, "Excel 直接開；欄位比表上多（作者、DOI、測量工具、評讀狀態…）。", true);
		let html = option("zb-pt-html", `Word 版（${info.files.html}）`, "用 Word 開啟就是表格，可以另存成 .docx；匯出後也能按「複製成表格」直接貼進報告。", true);
		let notion = option("zb-pt-notion", "也更新 Notion 頁面", "寫到「PRISMA 頁面的 Notion 父頁面」底下，同一個分類一直更新同一頁。", true, !info.notion);
		list.append(what, cardSec, where, options);

		let foot = el(doc, "footer", { class: "zb-cl-foot" });
		let summary = el(doc, "p", { class: "zb-cl-summary" }, info.notion ? "寫入你電腦上的檔案；勾了 Notion 才會送到 Notion。" : "只寫入你電腦上的檔案。");
		let cancel = el(doc, "button", { type: "button", class: "zb-cl-cancel" }, "取消");
		let go = el(doc, "button", { type: "button", class: "zb-cl-apply" }, "匯出");
		cancel.addEventListener("click", () => finish(null));
		go.addEventListener("click", () => {
			if (folder) finish({ folder, csv: csv.checked, html: html.checked, notion: !!info.notion && notion.checked, remember });
		});
		pick.addEventListener("click", async () => {
			pick.disabled = true;
			try {
				let chosen = handlers.pickFolder ? await handlers.pickFolder(folder) : null;
				if (chosen) {
					folder = chosen;
					remember = true;
				}
			}
			finally {
				pick.disabled = decided;
				update();
			}
		});
		let buttons = el(doc, "div", { class: "zb-cl-buttons" });
		buttons.append(cancel, go);
		foot.append(summary, buttons);
		root.append(head, list, foot);
		root.addEventListener("keydown", (ev) => {
			if (ev.key === "Escape") {
				ev.preventDefault();
				finish(null);
			}
		});

		function update() {
			path.textContent = folder || "（還沒選資料夾）";
			let source = remember ? "picked" : info.folderSource;
			let why = source === "vault" ? "Obsidian vault 的 Reviews 資料夾（和 PRISMA 筆記放一起）" : source === "saved" ? "設定裡指定的資料夾" : source === "downloads" ? "下載資料夾（設定裡可以指定別的）" : source === "picked" ? "這次選的資料夾" : "";
			target.textContent = folder ? `會寫入「${info.files.note}」${why ? `；${why}` : ""}。已經有同名筆記時只覆寫自動區塊，「${USER_HEADING}」保留。` : "請先選一個資料夾。";
			go.disabled = decided || !folder;
		}

		function finish(result) {
			if (decided) return;
			decided = true;
			go.disabled = true;
			cancel.disabled = true;
			pick.disabled = true;
			if (result) handlers.onExport(result);
			else handlers.onCancel();
		}

		update();
		try {
			go.focus();
		}
		catch (e) {}
		return { update, finish, boxes: { csv, html, notion }, buttons: { go, cancel, pick } };
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

	function notify(title, body) {
		ZB().main.notify(`ZotMax：${title}`, body);
	}

	function now() {
		return runtime.now ? runtime.now() : new Date();
	}

	function readCards() {
		try {
			let all = JSON.parse(pref("pico.cards") || "{}");
			return all && typeof all === "object" && !Array.isArray(all) ? all : {};
		}
		catch (e) {
			return {};
		}
	}

	function writeCards(all) {
		setPref("pico.cards", JSON.stringify(all));
	}

	/** The research project a card belongs to: { key, name } for a collection, else the library. */
	function scopeOf(collection) {
		let A = ZB().adapter;
		if (collection && collection.key) {
			let lib = A.libraryInfo(collection.libraryID);
			return { key: `${lib.path}/collections/${collection.key}`, name: collection.name || "分類", collection, libraryID: collection.libraryID };
		}
		let libraryID = (collection && collection.libraryID) || Zotero.Libraries.userLibraryID;
		let lib = A.libraryInfo(libraryID);
		return { key: lib.path, name: lib.path === "library" ? "我的文獻庫" : lib.name, collection: null, libraryID };
	}

	/** The saved card of a collection (or the library), normalized; null without one. */
	function cardFor(collection) {
		let raw = readCards()[scopeOf(collection).key];
		return raw ? normalizeCard(raw) : null;
	}

	function saveCard(collection, card) {
		let all = readCards();
		let c = normalizeCard(card);
		c.updatedAt = now().toISOString();
		all[scopeOf(collection).key] = c;
		writeCards(all);
		return c;
	}

	function deleteCard(collection) {
		let all = readCards();
		let key = scopeOf(collection).key;
		let had = key in all;
		delete all[key];
		writeCards(all);
		return had;
	}

	/** The PRISMA note's 「本題 PICO」 section for a collection (screening.js); "" without a card or while the feature is off. */
	function prismaSection(collection) {
		if (!featureOn()) return "";
		let card = cardFor(collection);
		if (!card || !cardHasContent(card)) return "";
		return cardMarkdown(card, { query: searchQuery(card) });
	}

	/** The card's search strings through search-links.js, with the comparison when that setting asks for it. */
	function searchQuery(card) {
		let S = ZB().searchLinks;
		if (!S || !S.picoQuery) return null;
		let includeC = true;
		try {
			includeC = !!S.readConfig().picoComparison;
		}
		catch (e) {}
		return S.picoQuery(cardAsStudy(card), { includeC });
	}

	/** The card window's search info: the strings and the database targets (search-links.js), null while that feature is off. */
	function searchInfo(card) {
		let S = ZB().searchLinks;
		if (!S || !featureOn("searchLinks")) return null;
		let q = searchQuery(card);
		if (!q) return null;
		let cfg;
		try {
			cfg = S.readConfig();
		}
		catch (e) {
			return Object.assign({ targets: [] }, q);
		}
		let targets = [];
		let add = (ids, query) => {
			for (let id of ids) {
				let source = cfg.sources.find(s => s.id === id);
				if (!source || !query) continue;
				try {
					let t = S.buildTarget(source, query, cfg);
					if (!targets.some(x => x.id === t.id)) targets.push(t);
				}
				catch (e) {}
			}
		};
		add(EN_SOURCES, q.en);
		if (q.all !== q.en) add(ALL_SOURCES, q.all);
		return Object.assign({ targets }, q);
	}

	/** Wait for a dialog document (not the initial about:blank) to be ready. */
	function waitForDialog(win, rootID, timeoutMs = 15000) {
		return new Promise((resolve, reject) => {
			let start = Date.now();
			let check = () => {
				try {
					let doc = win.document;
					let rootEl = doc && doc.getElementById(rootID);
					if (rootEl && doc.readyState === "complete") {
						resolve(rootEl);
						return;
					}
				}
				catch (e) {}
				if (win.closed || Date.now() - start > timeoutMs) {
					reject(new Error("視窗沒有開啟"));
					return;
				}
				setTimeout(check, 50);
			};
			check();
		});
	}

	function copyText(s) {
		if (runtime.copy) return runtime.copy(null, s);
		try {
			Zotero.Utilities.Internal.copyTextToClipboard(String(s || ""));
		}
		catch (e) {
			Zotero.logError(e);
		}
	}

	/** HTML (and its plain text) on the clipboard, so Word pastes a table. */
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

	/** The card window: resolves the saved card, "delete", or null (cancelled, closed). */
	async function cardDialog(info, opts = {}) {
		if (runtime.cardDialog) return runtime.cardDialog(info);
		let main = Zotero.getMainWindow();
		let win = main.openDialog(CARD_URL, "zotero-bridge-pico-card", "chrome,dialog=no,resizable,centerscreen");
		let rootEl = await waitForDialog(win, CARD_ROOT);
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
			renderCard(win.document, rootEl, info, {
				onSave: card => finish(card),
				onDelete: () => finish("delete"),
				onCancel: () => finish(null),
				search: card => searchInfo(card),
				open: (t) => {
					try {
						ZB().searchLinks.openTarget(t);
					}
					catch (e) {
						Zotero.logError(e);
					}
				},
				copy: s => copyText(s),
			});
			if (opts.onOpen) opts.onOpen(win);
		});
	}

	/**
	 * The command: the card of the selected collection (or the library) in its window; 儲存 keeps it in the pref,
	 * 刪除這張卡 removes it. Returns { saved: card } | { deleted: true } | { cancelled: true } | null.
	 */
	async function openCard(collection, opts = {}) {
		if (!featureOn()) {
			ZB().main.notifyFeatureOff(FEATURE);
			return null;
		}
		let sc = scopeOf(collection);
		let existing = cardFor(collection);
		let tagLists = [];
		if (collection) {
			try {
				tagLists = scopeItems(ZB().adapter.itemsInCollection(collection, true), collection).items.map(i => i.getTags().map(t => t.tag));
			}
			catch (e) {
				Zotero.logError(e);
			}
		}
		let info = { scopeName: sc.name, card: existing || emptyCard(), isNew: !existing, search: featureOn("searchLinks") && !!ZB().searchLinks, tagLists };
		let choice;
		try {
			choice = await (opts.dialog || cardDialog)(info);
		}
		catch (e) {
			Zotero.logError(e);
			notify(CARD_TITLE, `視窗沒有開啟（${e.message || e}）。可以重新啟動 Zotero 後再試一次。`);
			return null;
		}
		if (!choice) return { cancelled: true };
		if (choice === "delete") {
			deleteCard(collection);
			notify(CARD_TITLE, `已刪除「${sc.name}」的問題卡。`);
			return { deleted: true };
		}
		let saved = saveCard(collection, choice);
		notify(CARD_TITLE, `已儲存「${sc.name}」的問題卡。匯出 PICO 表和 PRISMA 筆記時會帶上它。`);
		return { saved };
	}

	function homeDir() {
		try {
			return Services.dirsvc.get("Home", Components.interfaces.nsIFile).path;
		}
		catch (e) {
			return "";
		}
	}

	async function downloadsDir() {
		if (runtime.downloads) return runtime.downloads();
		try {
			const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
			let dir = await Downloads.getPreferredDownloadsDirectory();
			if (dir) return dir;
		}
		catch (e) {}
		return "";
	}

	/** Where the table goes: the vault's Reviews folder > the folder from the settings > Downloads > home. */
	async function destination(settings) {
		if (settings.vaultPath) {
			let dirParts = [...core.splitFolder(settings.defaults.obsidianFolder), REVIEW_FOLDER];
			return { folder: PathUtils.join(settings.vaultPath, ...dirParts), source: "vault", dirParts };
		}
		let saved = String(pref("pico.folder") || "").trim();
		if (saved) {
			let exists = false;
			try {
				exists = await IOUtils.exists(saved);
			}
			catch (e) {}
			if (exists) return { folder: saved, source: "saved", dirParts: null };
		}
		let downloads = await downloadsDir();
		if (downloads) return { folder: downloads, source: "downloads", dirParts: null };
		return { folder: homeDir(), source: "home", dirParts: null };
	}

	/** A collection's studies for the table: the full-text-included ones once screening has started, else all. */
	function scopeItems(items, collection) {
		let z = ZB();
		if (!collection) return { items, screened: null };
		try {
			let cfg = z.screening.config();
			let states = items.map(i => z.screening.readState(i.getTags().map(t => t.tag), cfg));
			if (states.some(s => s.ft === "include")) {
				let included = items.filter((_, k) => states[k].ft === "include");
				return { items: included, screened: { included: included.length, total: items.length } };
			}
		}
		catch (e) {
			Zotero.logError(e);
		}
		return { items, screened: null };
	}

	function field(item, name) {
		try {
			return item.getField(name, false, true) || "";
		}
		catch (e) {
			return "";
		}
	}

	/** One item's entry for tableRow: its record, AI note data and Markdown, appraisal state, note link. */
	function entryFor(item, index, card) {
		let z = ZB();
		let lib = z.adapter.libraryInfo(item.libraryID);
		let doi = field(item, "DOI") || ((/^\s*DOI:\s*(\S+)/im.exec(field(item, "extra")) || [])[1] || "");
		let record = {
			creators: item.getCreatorsJSON(), title: field(item, "title"), year: field(item, "year"), publication: field(item, "publicationTitle"),
			doi, uri: `zotero://select/${lib.path}/items/${item.key}`,
			tags: item.getTags().map(t => t.tag),
		};
		let study = null;
		let md = "";
		let note = z.adapter.getAINote(item);
		if (note) {
			try {
				let ai = z.main.readAINote(note.getNote());
				study = ai.data;
				md = ai.md;
			}
			catch (e) {
				Zotero.logError(e);
			}
		}
		let appraisal = null;
		if (z.appraisalForm) {
			try {
				let saved = z.appraisalForm.loadRecord(item);
				if (saved) appraisal = { verified: !!saved.verified, status: z.appraisalForm.statusOf(saved) };
				if (study) study = z.appraisalForm.overrideStudyForItem(item, study);
			}
			catch (e) {
				Zotero.logError(e);
			}
		}
		let link = "";
		if (index) {
			let entries = index.get(`${lib.path}/${item.key}`) || [];
			if (entries.length) link = entries[0].relParts.join("/").replace(/\.md$/i, "");
		}
		return { record, study, md, appraisal, link, card };
	}

	async function pickFolder(win, current) {
		const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
		let fp = new FilePicker();
		fp.init(win, "PICO 表放在哪個資料夾", fp.modeGetFolder);
		try {
			if (current) fp.displayDirectory = current;
		}
		catch (e) {}
		if (await fp.show() !== fp.returnOK) return null;
		return fp.file;
	}

	/** The export window: resolves { folder, csv, html, notion, remember } or null. */
	async function tableDialog(info, opts = {}) {
		if (runtime.tableDialog) return runtime.tableDialog(info);
		let main = Zotero.getMainWindow();
		let win = main.openDialog(TABLE_URL, "zotero-bridge-pico-table", "chrome,dialog=no,resizable,centerscreen");
		let rootEl = await waitForDialog(win, TABLE_ROOT);
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
			renderTable(win.document, rootEl, info, {
				onExport: choice => finish(choice),
				onCancel: () => finish(null),
				pickFolder: current => pickFolder(win, current),
			});
			if (opts.onOpen) opts.onOpen(win);
		});
	}

	/** After the export: { text, buttons } for the dialog. */
	function noticeInfo(result) {
		return { text: doneText(result), buttons: ["open", "copy", "close"], result };
	}

	/** The native dialog after an export: "open" | "copy" | "close". */
	function notice(info) {
		if (runtime.notice) return runtime.notice(info);
		let p = Services.prompt;
		let flags = p.BUTTON_POS_0 * p.BUTTON_TITLE_IS_STRING + p.BUTTON_POS_1 * p.BUTTON_TITLE_IS_STRING + p.BUTTON_POS_2 * p.BUTTON_TITLE_IS_STRING + p.BUTTON_POS_0_DEFAULT;
		let b = p.confirmEx(Zotero.getMainWindow(), TABLE_TITLE, info.text, flags, "打開資料夾", "複製成表格", "關閉", null, {});
		return b === 0 ? "open" : b === 1 ? "copy" : "close";
	}

	async function reveal(path) {
		if (runtime.reveal) return runtime.reveal(path);
		try {
			if (Zotero.File && Zotero.File.reveal) return await Zotero.File.reveal(path);
		}
		catch (e) {}
		return Zotero.launchFile(path);
	}

	/**
	 * Write the table. o: { folder, dirParts (inside the vault, for the note's paths), scopeName, scope (scopeOf),
	 * rows, card, query, screened, csv, html, notion, settings }. Returns { dir, files, items, noData, notionUrl,
	 * notionError, card, rows }.
	 */
	async function writeTable(o) {
		let z = ZB();
		let names = fileNames(o.scopeName);
		let date = now().toISOString();
		let meta = {
			title: `${o.scopeName}：PICO 表`,
			scopeName: o.scopeName,
			date: date.slice(0, 10),
			generatedAt: date,
			collectionKey: o.scope.collection ? o.scope.key : "",
			path: o.scope.collection ? z.adapter.collectionPath(o.scope.collection) : "",
			uri: o.scope.collection ? `zotero://select/${z.adapter.libraryInfo(o.scope.libraryID).path}/collections/${o.scope.collection.key}` : "",
			csvPath: o.csv ? (o.dirParts ? [...o.dirParts, names.csv].join("/") : names.csv) : "",
			htmlPath: o.html ? (o.dirParts ? [...o.dirParts, names.html].join("/") : names.html) : "",
			links: !!o.dirParts,
			query: o.query,
			screened: o.screened,
			keywords: keywordSuggestions(o.rows.map(r => r.tags), o.card, { query: o.query }),
		};
		let r = { dir: o.folder, files: [], items: o.rows.length, noData: o.rows.filter(x => !x.hasData).length, notionUrl: "", notionError: "", card: !!(o.card && cardHasContent(o.card)), rows: o.rows };
		await IOUtils.makeDirectory(o.folder, { createAncestors: true, ignoreExisting: true });
		if (o.notion) {
			try {
				let md = noteSection(o.rows, o.card, Object.assign({}, meta, { links: false, csvPath: "", htmlPath: "" }));
				r.notionUrl = await z.screening.syncNotionPage(o.settings, `pico:${o.scope.key}`, `PICO 表：${o.scopeName}`, md);
				meta.notionUrl = r.notionUrl;
			}
			catch (e) {
				Zotero.logError(e);
				r.notionError = String(e.message || e);
			}
		}
		let notePath = PathUtils.join(o.folder, names.note);
		let existing = (await IOUtils.exists(notePath)) ? await IOUtils.readUTF8(notePath) : null;
		let textOut = buildNote(existing, noteFrontmatter(o.rows, o.card, meta), meta.title, noteSection(o.rows, o.card, meta));
		if (textOut !== existing) await IOUtils.writeUTF8(notePath, textOut);
		r.files.push(names.note);
		if (o.csv) {
			await IOUtils.writeUTF8(PathUtils.join(o.folder, names.csv), tableCSV(o.rows));
			r.files.push(names.csv);
		}
		if (o.html) {
			await IOUtils.writeUTF8(PathUtils.join(o.folder, names.html), tableHTML(o.rows, o.card, meta));
			r.files.push(names.html);
		}
		return r;
	}

	/**
	 * The command: the selected items (or a collection's), the export window, the files, the dialog after it.
	 * scopeInfo: { name (the collection's name; 選取的文獻 when empty), collection (whose card and screening apply) }.
	 * opts: { dialog(info), notice(info) } for tests. Returns the result, { cancelled: true }, or null.
	 */
	async function exportTable(items, scopeInfo = {}, opts = {}) {
		let z = ZB();
		if (!featureOn()) {
			z.main.notifyFeatureOff(FEATURE);
			return null;
		}
		let regular = z.adapter.toRegularItems(items || []);
		if (!regular.length) {
			notify(TABLE_TITLE, "請先選取文獻，或在分類上按右鍵。");
			return null;
		}
		if (busy) {
			notify(TABLE_TITLE, "上一次的匯出還沒結束。");
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
			let collection = scopeInfo.collection || null;
			let scopeName = String(scopeInfo.name || "").trim() || SELECTED_NAME;
			let sc = scopeOf(collection);
			let card = cardFor(collection);
			let picked = scopeInfo.name ? scopeItems(regular, collection) : { items: regular, screened: null };
			let index = settings.vaultPath ? await z.main.buildObsidianIndex(settings) : null;
			let rows = sortRows(picked.items.map(item => tableRow(entryFor(item, index, card))));
			let dest = await destination(settings);
			let names = fileNames(scopeName);
			let notionOn = !!(settings.notionToken && z.screening.notionParent(settings));
			let info = {
				scopeName,
				titles: picked.items.map(i => field(i, "title")),
				screened: picked.screened,
				noData: rows.filter(r => !r.hasData).length,
				card,
				folder: dest.folder,
				folderSource: dest.source,
				files: names,
				notion: notionOn,
			};
			let choice;
			try {
				choice = await (opts.dialog || tableDialog)(info);
			}
			catch (e) {
				Zotero.logError(e);
				notify(TABLE_TITLE, `視窗沒有開啟（${e.message || e}）。可以重新啟動 Zotero 後再試一次。`);
				return null;
			}
			if (!choice) return { cancelled: true };
			if (choice.remember && dest.source !== "vault") setPref("pico.folder", choice.folder);
			let result;
			try {
				result = await writeTable({
					folder: choice.folder, dirParts: choice.folder === dest.folder ? dest.dirParts : null, scopeName, scope: sc, rows, card,
					query: card ? searchQuery(card) : null, screened: picked.screened, csv: choice.csv, html: choice.html, notion: choice.notion && notionOn, settings,
				});
			}
			catch (e) {
				Zotero.logError(e);
				notify(TABLE_TITLE, `匯出失敗：${e.message || e}`);
				return null;
			}
			let shown = noticeInfo(result);
			let action = (opts.notice || notice)(shown);
			if (action === "open") await reveal(result.dir);
			else if (action === "copy") copyHTML(tableFragment(rows, card), tableTSV(rows, card));
			return Object.assign({ action, buttons: shown.buttons }, result);
		}
		finally {
			busy = false;
		}
	}

	return {
		FEATURE, CARD_TITLE, TABLE_TITLE, CARD_URL, TABLE_URL, CARD_ROOT, TABLE_ROOT, TYPES, TEXT_FIELDS, SELECTED_NAME, REVIEW_FOLDER,
		MATCH_LEGEND, SOURCE_NOTE, CSV_COLUMNS, runtime,
		// pure
		emptyCard, normalizeCard, fieldLabels, fieldHints, cardHasContent, terms, cardAsStudy, cardQuery, composeQuestion, checkCard,
		tagTerm, keywordSuggestions, keywordSection,
		matchField, matchCard, cardMarkdown, tableRow, sortRows, tableMarkdown, tableCSV, tableFragment, tableTSV, tableHTML,
		noteSection, noteFrontmatter, buildNote, fileNames, doneText, renderCard, renderTable,
		// Zotero
		scopeOf, cardFor, saveCard, deleteCard, prismaSection, searchQuery, searchInfo, openCard, destination, scopeItems, entryFor,
		writeTable, exportTable, cardDialog, tableDialog, noticeInfo,
	};
});
