/*
 * ZotMax — 主題搜尋機器人 (topic bot).
 *
 * One bot per Zotero collection (a topic): a PubMed search string and a few core papers. Each run asks
 *   - PubMed: ESearch (Entrez date since the last run) for the PMIDs, EFetch (XML) for the title,
 *     abstract, publication types and MeSH of each;
 *   - OpenAlex: the works citing each core paper (filter=cites:W…,from_publication_date:…), with their
 *     abstracts (abstract_inverted_index);
 * merges the two by DOI, PMID or title + year, drops what is in the library or was listed before, and
 * scores each paper against the topic's terms (the PICO card's, or the search string's own blocks):
 * rules only, no AI, every score with its reasons. The result is a checklist note in Obsidian
 * (<digest folder>/<collection> 搜尋機器人.md); only the papers the user ticks are imported
 * (Zotero's 「新增條目（依識別碼）」), tagged 新文獻, 追蹤/<collection> and the source.
 *
 *   extensions.zotero-bridge.topicBot.bots     { <collection scope key>: bot }
 *   bot = { name, path, libraryID, collectionKey, query, exclude: [terms], core: [{ key, label, doi, pmid, openalex }],
 *           sources: { pubmed, citations }, days, lastPubmed, lastCitations, seen: [keys], createdAt,
 *           notePath (vault-relative, no .md), stats: { pending, high, at }, imports: [{ at, n }] }
 *   (path, notePath, stats and imports are what the topic page, the home page and the progress report read)
 *   extensions.zotero-bridge.topicBot.autoRun  run due bots in the background (default true)
 *
 * The helpers at the top are pure (Node tests); the rest needs Zotero.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(require("./core.js"), require("./pubmed-watch.js"), require("./citation-chase.js"),
			require("./screening.js"), globalThis);
	}
	else {
		(root.ZB = root.ZB || {}).topicBot = factory(root.ZB.core, root.ZB.pubmedWatch, root.ZB.citationChase, root.ZB.screening, root);
	}
})(this, function (core, pubmedWatch, citationChase, screening, scope) {
	const PREF = "extensions.zotero-bridge.";
	const FEATURE = "topicBot";
	const NOTE_SUFFIX = " 搜尋機器人";
	const SOURCE_TAGS = { pubmed: "PubMed", citations: "引文追蹤" };
	const SOURCE_LABELS = { pubmed: "PubMed", citations: "被引用" };
	const DEFAULT_DAYS = 30;
	const MAX_CORE = 15;
	// PMIDs per run (ESearch retmax) and per EFetch request
	const MAX_PUBMED = 200;
	const EFETCH_CHUNK = 100;
	const PUBMED_EVERY_MS = 24 * 3600 * 1000;
	const CITATIONS_EVERY_MS = 7 * 24 * 3600 * 1000;
	// Candidates kept in the note's list (the rest drop off, lowest score first) and keys remembered
	const MAX_LISTED = 150;
	const SEEN_LIMIT = 3000;
	const OPENALEX_FIELDS = "id,doi,display_name,publication_year,publication_date,primary_location,ids,type,abstract_inverted_index";
	// Weights per PICO element; a search-string block without a label counts as 2
	const WEIGHTS = { P: 2, I: 3, C: 1, O: 2 };
	const EXCLUDE_PENALTY = 40;
	const TIERS = [[60, "⭐⭐⭐", "高"], [35, "⭐⭐", "中"], [0, "⭐", "低"]];
	const DESIGNS = [
		{ label: "系統性回顧", points: 3, pubTypes: ["Systematic Review", "Meta-Analysis"], re: /\b(systematic (literature )?review|meta-?analys[ie]s|umbrella review)\b/i },
		{ label: "RCT", points: 2, pubTypes: ["Randomized Controlled Trial"], re: /\b(randomi[sz]ed|RCT)\b/i },
		{ label: "臨床試驗／類實驗", points: 1, pubTypes: ["Clinical Trial", "Controlled Clinical Trial", "Pragmatic Clinical Trial"], re: /\b(quasi-?experimental|controlled trial|clinical trial)\b/i },
		{ label: "觀察性研究", points: 1, pubTypes: ["Observational Study"], re: /\b(cohort|case-control|cross-sectional|longitudinal)\b/i },
		{ label: "質性研究", points: 1, pubTypes: [], re: /\b(qualitative|phenomenolog\w*|grounded theory|thematic analysis)\b/i },
		{ label: "文獻回顧", points: 0, pubTypes: ["Review", "Scoping Review"], re: /\b(scoping review|narrative review|integrative review)\b/i },
	];
	const IMPORTED_MARK = citationChase.IMPORTED_MARK;
	const USER_HEADING = "✍️ 我的筆記";

	// ---------- the topic's terms (pure) ----------

	function cleanTerm(t) {
		return String(t || "").replace(/\[[^\]]*\]/g, " ").replace(/[*"“”()]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
	}

	/**
	 * A PubMed search string's AND blocks, each the list of its OR terms (field tags, quotes and
	 * truncation removed): '("Accidental Falls"[Mesh] OR fall*[tiab]) AND exercise' → [["accidental falls", "fall"], ["exercise"]].
	 * NOT parts are left out.
	 */
	function queryBlocks(query) {
		let q = String(query || "").replace(/\bNOT\b[\s\S]*$/, "");
		let blocks = [];
		let depth = 0;
		let cur = "";
		let parts = [];
		for (let i = 0; i < q.length; i++) {
			let ch = q[i];
			if (ch === "(") depth++;
			if (ch === ")") depth = Math.max(0, depth - 1);
			if (depth === 0 && /\sAND\s/.test(q.slice(i, i + 5)) && q.slice(i + 1, i + 4) === "AND") {
				parts.push(cur);
				cur = "";
				i += 4;
				continue;
			}
			cur += ch;
		}
		parts.push(cur);
		for (let p of parts) {
			let terms = [...new Set(p.replace(/^\s*\(|\)\s*$/g, "").split(/\s(?:OR|AND)\s/).map(cleanTerm).filter(t => t.length >= 3))];
			if (terms.length) blocks.push(terms);
		}
		return blocks;
	}

	/**
	 * The terms a paper is scored against: [{ key, label, weight, terms }]. With a PICO card's English
	 * blocks (pico.cardQuery(card).blocks), its P, I, C, O; otherwise the search string's AND blocks.
	 * `extra` adds terms to an element (e.g. { I: ["tai chi"] }).
	 */
	function profileFrom(opts = {}) {
		let out = [];
		let blocks = opts.cardBlocks || [];
		for (let b of blocks) {
			let terms = [...new Set([...(b.en || []), ...((opts.extra || {})[b.key] || [])].map(cleanTerm).filter(t => t.length >= 3))];
			if (terms.length) out.push({ key: b.key, label: b.key, weight: WEIGHTS[b.key] || 2, terms });
		}
		if (out.length) return out;
		return queryBlocks(opts.query).map((terms, i) => ({ key: `Q${i + 1}`, label: `概念 ${i + 1}`, weight: 2, terms }));
	}

	/** 排除詞 as typed: one per line or separated by commas, 、 or semicolons. */
	function parseExclude(text) {
		return [...new Set(String(text || "").split(/[\n,，、;；]+/).map(t => t.trim()).filter(t => t.length >= 2))].slice(0, 30);
	}

	// ---------- PubMed EFetch and OpenAlex records (pure) ----------

	function decodeXML(s) {
		return String(s || "")
			.replace(/<[^>]+>/g, "")
			.replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
			.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
			.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&")
			.replace(/\s+/g, " ").trim();
	}

	function tagText(xml, tag) {
		let m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
		return m ? decodeXML(m[1]) : "";
	}

	function allTags(xml, tag) {
		return [...xml.matchAll(new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map(m => ({ attrs: m[1] || "", text: decodeXML(m[2]) }));
	}

	/** EFetch (db=pubmed, retmode=xml) → [{ pmid, title, abstract, journal, year, doi, pubTypes, mesh }]. */
	function parseEFetch(xml) {
		let out = [];
		for (let m of String(xml || "").matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)) {
			let a = m[1];
			let pmid = tagText(a, "PMID");
			if (!/^\d+$/.test(pmid)) continue;
			let abstract = allTags(a, "AbstractText").map(t => {
				let label = (/\bLabel="([^"]+)"/.exec(t.attrs) || [])[1];
				return label ? `${label}: ${t.text}` : t.text;
			}).join(" ");
			let date = tagText(a, "PubDate");
			let doi = (allTags(a, "ArticleId").find(t => /IdType="doi"/.test(t.attrs)) || {}).text
				|| (allTags(a, "ELocationID").find(t => /EIdType="doi"/.test(t.attrs)) || {}).text || "";
			out.push({
				pmid,
				title: tagText(a, "ArticleTitle").replace(/\.$/, ""),
				abstract,
				journal: tagText(a, "ISOAbbreviation") || tagText(a, "Title"),
				year: (/\d{4}/.exec(tagText(a, "Year") || date) || [""])[0],
				doi: screening.normalizeDOI(doi),
				pubTypes: allTags(a, "PublicationType").map(t => t.text),
				mesh: allTags(a, "DescriptorName").map(t => t.text),
			});
		}
		return out;
	}

	/** OpenAlex's abstract_inverted_index → the abstract text. */
	function invertedAbstract(index) {
		if (!index || typeof index !== "object") return "";
		let words = [];
		for (let [word, positions] of Object.entries(index)) {
			for (let p of positions || []) words[p] = word;
		}
		return words.filter(w => w !== undefined).join(" ");
	}

	function openAlexRecord(work) {
		let c = citationChase.workToCandidate(work);
		return Object.assign(c, { abstract: invertedAbstract(work && work.abstract_inverted_index), pubTypes: [], mesh: [] });
	}

	/** Works citing a core paper, published on or after `since` (YYYY-MM-DD), newest first. */
	function citingURL(openalex, since, opts = {}) {
		let filter = `cites:${openalex}` + (since ? `,from_publication_date:${since}` : "");
		let params = new URLSearchParams({ filter, select: OPENALEX_FIELDS, sort: "publication_date:desc", "per-page": String(opts.perPage || 200) });
		if (opts.email) params.set("mailto", opts.email);
		return `${citationChase.API}/works?${params.toString().replace(/%3A/gi, ":").replace(/%2C/gi, ",")}`;
	}

	// ---------- merging and scoring (pure) ----------

	function keyOf(c) {
		if (c.doi) return "doi:" + c.doi;
		if (c.pmid) return "pmid:" + c.pmid;
		return "";
	}

	/**
	 * PubMed records and OpenAlex citing works as one list: [{ key, doi, pmid, title, abstract, journal,
	 * year, pubTypes, mesh, sources: Set("pubmed"|"citations"), cites: [core labels] }]. The same paper
	 * from both (DOI, PMID, or the normalized title + year) is one entry; PubMed's record wins.
	 */
	function mergeCandidates(pubmedRecords, citing) {
		let list = [];
		let byID = new Map();
		let byTitle = new Map();
		let titleKey = c => {
			let t = screening.normalizeTitle(c.title);
			return t.length >= 10 && c.year ? `${t}|${c.year}` : "";
		};
		let find = c => (c.doi && byID.get("doi:" + c.doi)) || (c.pmid && byID.get("pmid:" + c.pmid)) || (titleKey(c) && byTitle.get(titleKey(c))) || null;
		let remember = e => {
			if (e.doi) byID.set("doi:" + e.doi, e);
			if (e.pmid) byID.set("pmid:" + e.pmid, e);
			if (titleKey(e)) byTitle.set(titleKey(e), e);
		};
		for (let r of pubmedRecords || []) {
			let e = find(r);
			if (e) continue;
			e = Object.assign({}, r, { sources: new Set(["pubmed"]), cites: [] });
			list.push(e);
			remember(e);
		}
		for (let { record, core: seed } of citing || []) {
			let e = find(record);
			if (!e) {
				e = Object.assign({}, record, { sources: new Set(), cites: [] });
				list.push(e);
			}
			else {
				for (let f of ["doi", "pmid", "abstract", "journal", "year"]) if (!e[f] && record[f]) e[f] = record[f];
			}
			e.sources.add("citations");
			if (seed && !e.cites.includes(seed)) e.cites.push(seed);
			remember(e);
		}
		for (let e of list) e.key = keyOf(e);
		return list.filter(e => e.key);
	}

	function hasTerm(text, term) {
		if (!text || !term) return false;
		let t = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		// Whole words at the start; a trailing truncation (fall → falls, falling) is allowed
		return new RegExp(`(^|[^a-z0-9])${t}`, "i").test(text);
	}

	/**
	 * An 排除詞 in the text: the whole word, plural included (rat → rats, not rate); with a trailing *
	 * any word it starts (child* → children, childhood).
	 */
	function excludeHit(text, raw) {
		let prefix = /\*\s*$/.test(String(raw || ""));
		let t = cleanTerm(raw);
		if (t.length < 2) return false;
		let e = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(`(^|[^a-z0-9])${e}${prefix ? "" : "(?:s|es)?(?![a-z0-9])"}`, "i").test(text || "");
	}

	/** The study design a paper reports: PubMed's publication types, else words in the title and abstract. */
	function designOf(c) {
		let types = c.pubTypes || [];
		for (let d of DESIGNS) if (d.pubTypes.some(t => types.includes(t))) return d;
		let text = `${c.title || ""} ${c.abstract || ""}`;
		for (let d of DESIGNS) if (d.re.test(c.title || "")) return d;
		for (let d of DESIGNS) if (d.re.test(text)) return d;
		return null;
	}

	function tierOf(score) {
		return TIERS.find(([min]) => score >= min);
	}

	/**
	 * A paper's fit with the topic, 0–100, with the reasons:
	 *   each element found in the title counts its weight × 1.5, in the abstract its weight;
	 *   +2 when every element is found; the design (系統性回顧／統合分析 3, RCT 2, other trials and observational
	 *   or qualitative studies 1); +2 for each core paper it cites (at most 3); +1 within the last year.
	 * Scaled to the best a paper could get with this profile; a paper with one of opts.exclude (the user's
	 * 排除詞) loses EXCLUDE_PENALTY points.
	 */
	function scoreCandidate(c, profile, opts = {}) {
		let title = c.title || "";
		let text = `${title} ${c.abstract || ""} ${(c.mesh || []).join(" ")}`;
		let points = 0;
		let max = 0;
		let found = [];
		let inTitle = [];
		for (let el of profile) {
			max += el.weight * 1.5;
			let t = el.terms.some(term => hasTerm(title, term));
			let any = t || el.terms.some(term => hasTerm(text, term));
			if (t) inTitle.push(el.label);
			if (any) found.push(el.label);
			points += t ? el.weight * 1.5 : any ? el.weight : 0;
		}
		if (profile.length) {
			max += 2;
			if (found.length === profile.length) points += 2;
		}
		let design = designOf(c);
		max += 3;
		if (design) points += design.points;
		let cites = (c.cites || []).slice(0, 3);
		max += 6;
		points += cites.length * 2;
		let year = Number(c.year);
		let thisYear = (opts.now ? new Date(opts.now) : new Date()).getFullYear();
		max += 1;
		if (year && thisYear - year <= 1) points += 1;
		let score = Math.round(points / max * 100);
		let excluded = (opts.exclude || []).filter(t => excludeHit(text, t)).map(cleanTerm);
		if (excluded.length) score = Math.max(0, score - EXCLUDE_PENALTY);
		let reasons = [];
		if (excluded.length) reasons.push(`含排除詞：${excluded.join("、")}`);
		if (found.length) reasons.push(`命中 ${found.join("、")}` + (inTitle.length ? `（標題有 ${inTitle.join("、")}）` : ""));
		else if (profile.length) reasons.push("標題與摘要都沒有主題詞");
		let missing = profile.filter(el => !found.includes(el.label)).map(el => el.label);
		if (found.length && missing.length) reasons.push(`沒有 ${missing.join("、")}`);
		if (design) reasons.push(design.label);
		if (cites.length) reasons.push(`引用 ${cites.length} 篇核心文獻：${cites.join("、")}`);
		if (!c.abstract) reasons.push("沒有摘要");
		let tier = tierOf(score);
		return { score, stars: tier[1], tier: tier[2], design: design ? design.label : "", reasons, found, excluded };
	}

	// ---------- the note (pure) ----------

	function mdText(s) {
		return String(s || "").replace(/\s+/g, " ").replace(/([*_[\]|`<>])/g, "\\$1").trim();
	}

	/** A checklist line; the DOI or PubMed link is what 匯入 reads (citation-chase.js parseChecked). */
	function botLine(c, checked) {
		let src = [...c.sources].map(s => SOURCE_LABELS[s]).join("＋");
		let links = [];
		if (c.doi) links.push(`[DOI](${citationChase.doiURL(c.doi)})`);
		if (c.pmid) links.push(`[PubMed](https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/)`);
		let parts = [
			`${c.rank.stars} **${mdText(c.title) || "（無標題）"}**${c.year ? ` (${c.year})` : ""}`,
			c.journal ? `*${mdText(c.journal)}*` : "",
			`${c.rank.score} 分：${c.rank.reasons.join(" · ")}`,
			`來源 ${src}`,
			links.join(" · "),
		].filter(Boolean).join("｜");
		return `- [${checked ? "x" : " "}] ${parts}`;
	}

	// Also inside a folded callout (the 看板's 已匯入 list): "> - [x] …"
	const LINE_RE = /^(?:>[ \t]?)*([ \t]*[-*+][ \t]+\[([ xX])\][ \t]+(.*))$/;

	/** The checklist lines of an earlier note: [{ key, line (without "> "), checked, imported, score }]. */
	function parseListed(text) {
		let out = [];
		let seen = new Set();
		for (let raw of String(text || "").split("\n")) {
			let m = LINE_RE.exec(raw);
			if (!m) continue;
			let line = m[1];
			m = [m[0], m[2], m[3]];
			let doi = /https?:\/\/(?:dx\.)?doi\.org\/([^\s)>\]]+)/i.exec(m[2]);
			let pmid = /pubmed\.ncbi\.nlm\.nih\.gov\/(\d{1,9})/i.exec(m[2]);
			let key = doi ? "doi:" + screening.normalizeDOI(doi[1]) : pmid ? "pmid:" + pmid[1] : "";
			if (!key || seen.has(key)) continue;
			seen.add(key);
			out.push({ key, line, checked: m[1] !== " ", imported: m[2].startsWith(IMPORTED_MARK), score: Number((/｜(\d{1,3}) 分：/.exec(m[2]) || [])[1]) || 0 });
		}
		return out;
	}

	function scheduleText(bot) {
		let s = [];
		if (bot.sources.pubmed) s.push("PubMed 每天");
		if (bot.sources.citations) s.push("被引用每週");
		return s.join("、") || "沒有開啟來源";
	}

	/**
	 * The bot's note. run = { candidates (new, ranked), at, counts: { pubmed, citations }, errors };
	 * the list keeps the earlier lines as they are (ticks, ✅ 已匯入) and adds the new ones, best first.
	 * opts.layout "board": 本次搜尋 as cards, the list open, the settings folded.
	 */
	function buildBotSection(region, run, bot, opts = {}) {
		let old = parseListed(region);
		let fresh = run.candidates.filter(c => !old.some(o => o.key === c.key));
		let rows = [
			...old.map(o => ({ key: o.key, line: o.line, checked: o.checked, imported: o.imported, score: o.score, fresh: false })),
			...fresh.map(c => ({ key: c.key, line: botLine(c, false), checked: false, imported: false, score: c.rank.score, fresh: true })),
		];
		let imported = rows.filter(r => r.imported);
		let pending = rows.filter(r => !r.imported).sort((a, b) => (b.checked - a.checked) || (b.score - a.score));
		let dropped = pending.slice(MAX_LISTED).filter(r => !r.checked);
		pending = pending.filter(r => !dropped.includes(r));
		let high = fresh.filter(c => c.rank.tier === "高").length;
		let ticked = pending.filter(r => r.checked).length;
		let date = String(run.at || "").slice(0, 10);
		let board = opts.layout === "board";
		let parts = [];
		let settingsLines = [
			`檢索式：\`${String(bot.query || "（沒有 PubMed 檢索式）").replace(/`/g, "'")}\``,
			`核心文獻（找引用它們的新文獻）：${bot.core.length ? bot.core.map(c => c.label).join("、") : "（沒有）"}`,
			bot.exclude && bot.exclude.length ? `排除詞（命中的扣 ${EXCLUDE_PENALTY} 分）：${bot.exclude.join("、")}` : "",
			`排程：${scheduleText(bot)}；在 Zotero 分類右鍵 → ZotMax ▸ 主題搜尋機器人 可以修改或立即搜尋。`,
			"分數（0–100，不用 AI）：主題詞出現在標題或摘要（介入權重最高）、每個概念都出現、研究設計（系統性回顧、RCT 較高）、引用核心文獻、近一年發表。分數只幫你排順序，要不要看、要不要納入由你決定。",
			"勾選想讀的（`- [x]`），回到 Zotero 在分類上按右鍵 → ZotMax ▸ 匯入主題搜尋機器人勾選的文獻；沒勾的不會進文獻庫。",
		].filter(Boolean);
		if (board) {
			parts.push(core.metaFold(`🤖 搜尋機器人 · ${bot.name} · ${date} 搜尋`, settingsLines));
			let cards = [
				core.kpiCard("本次新候選", `${fresh.length} 篇`, [run.counts.pubmed ? `PubMed ${run.counts.pubmed}` : "", run.counts.citations ? `被引用 ${run.counts.citations}` : ""].filter(Boolean).join(" · ") || "沒有新的"),
				core.kpiCard("高相關", `${high} 篇`, "⭐⭐⭐ 60 分以上"),
				core.kpiCard("待看", `${pending.length} 篇`, ticked ? `已勾選 ${ticked} 篇，可以匯入了` : "勾選後回 Zotero 匯入"),
			];
			let designs = new Map();
			for (let c of fresh) designs.set(c.rank.design || "其他", (designs.get(c.rank.design || "其他") || 0) + 1);
			if (fresh.length) {
				cards.push(core.chartCard("新候選的分數", core.barRows(TIERS.map(([, stars, label]) => [`${stars} ${label}`, fresh.filter(c => c.rank.tier === label).length]), 3)));
				cards.push(core.chartCard("研究設計", core.barRows([...designs].sort((a, b) => b[1] - a[1]), 5, 6)));
			}
			parts.push(core.boardBlock("本次搜尋", cards, `${scheduleText(bot)} · 上次搜尋 ${date}`));
		}
		else {
			parts.push(core.callout("info", `🤖 搜尋機器人：${bot.name}（${date} 搜尋）`, settingsLines.join("\n"), false));
		}
		for (let e of run.errors || []) parts.push(`> [!warning] ${e}`);
		let zh = chineseRow(run.chinese);
		if (zh) parts.push(zh);
		parts.push(`## 待看（${pending.length} 篇）`, pending.length ? pending.map(r => r.line).join("\n") : "（目前沒有候選文獻）");
		if (imported.length) {
			let list = imported.map(r => r.line).join("\n");
			parts.push(board ? core.foldBlock(`已匯入（${imported.length} 篇）`, list) : `## 已匯入（${imported.length} 篇）\n\n${list}`);
		}
		let highPending = pending.filter(r => /^\s*[-*+]\s+\[[ xX]\]\s+⭐⭐⭐/.test(r.line)).length;
		return { section: parts.join("\n\n"), listed: rows.map(r => r.key), dropped: dropped.map(r => r.key), fresh: fresh.length, high, pending: pending.length, highPending };
	}

	/**
	 * The Chinese databases the bot can't search (no API): a row of links with the PICO card's Chinese terms.
	 * chinese = { query, targets: search-links.js buildTarget()s }; a target without a search URL opens its
	 * start page, with the words to paste shown beside it.
	 */
	function chineseRow(chinese) {
		if (!chinese || !chinese.query || !(chinese.targets || []).length) return "";
		let links = chinese.targets.map(t => (t.copy ? `[${t.name}](${t.url})（貼上 \`${t.query.replace(/`/g, "'")}\`）` : `[${t.name}](${t.url})`));
		return `> [!zm-links] 中文文獻（機器人查不到，請自己查）\n> ${links.join(" · ")}`;
	}

	/** The words to search the Chinese databases with: each PICO element's first Chinese term. */
	function chineseQuery(cardBlocks) {
		let words = (cardBlocks || []).map(b => (b.terms || []).find(t => /[㐀-鿿豈-﫿]/.test(t))).filter(Boolean);
		return words.join(" ");
	}

	/**
	 * What the topic page, the home page and the progress report show of each bot: [{ path, name, link,
	 * pending, high, imported (those whose time passes `within`, else all), at }], the bots that have a note.
	 */
	function botSummaries(bots, within) {
		let inPeriod = at => !within || within(at);
		return Object.values(bots || {}).map(normalizeBot).filter(b => b.notePath).map(b => ({
			path: b.path || b.name,
			name: b.name,
			link: b.notePath,
			pending: b.stats.pending || 0,
			high: b.stats.high || 0,
			imported: b.imports.filter(i => inPeriod(i.at)).reduce((n, i) => n + i.n, 0),
			at: b.stats.at || "",
			// each import (the planet map's island log)
			imports: b.imports.filter(i => inPeriod(i.at)),
		}));
	}

	function frontmatterFor(bot, run, stats) {
		return {
			title: `${bot.name}${NOTE_SUFFIX}`,
			type: "topic-bot",
			zotero_collection: bot.collectionKey,
			collection_path: bot.path || bot.name,
			bot_query: bot.query || "",
			bot_new: stats.fresh,
			bot_pending: stats.pending,
			last_generated: run.at || "",
		};
	}

	/** The whole note: the managed region replaced, everything else the user's. */
	function buildBotNote(existing, run, bot, opts = {}) {
		let region = "";
		if (existing) {
			let s = /^%% zotero-bridge:start.*%%$/m.exec(existing);
			let e = /^%% zotero-bridge:end %%$/m.exec(existing);
			if (s && e && e.index > s.index) region = existing.slice(s.index, e.index);
		}
		let built = buildBotSection(region, run, bot, opts);
		let fm = frontmatterFor(bot, run, built);
		let block = `${core.MARK_START}\n\n${built.section}\n\n${core.MARK_END}`;
		let classes = core.pageClasses(existing ? core.splitFrontmatter(existing).frontmatter : "", opts.layout === "board" ? [core.NOTE_CLASS, core.REVIEW_CLASS] : []);
		let text;
		if (!existing) {
			text = core.buildFrontmatter(Object.assign(fm, { tags: ["新文獻", "搜尋機器人"], cssclasses: classes || "" }), null)
				+ `\n# ${bot.name}${NOTE_SUFFIX}\n\n${block}\n\n## ${USER_HEADING}\n\n`;
		}
		else {
			let { frontmatter, body } = core.splitFrontmatter(existing);
			let f = frontmatter || "";
			for (let [k, v] of Object.entries(fm)) {
				if (v === "" || v === null || v === undefined) continue;
				f = core.setFrontmatterValue(f, k, v);
			}
			if (classes) f = core.setFrontmatterValue(f, "cssclasses", classes);
			else if (/^cssclasses:/m.test(f)) f = core.setFrontmatterValue(f, "cssclasses", []);
			let s = /^%% zotero-bridge:start.*%%$/m.exec(body);
			let e = /^%% zotero-bridge:end %%$/m.exec(body);
			body = s && e && e.index > s.index
				? body.slice(0, s.index) + block + body.slice(e.index + e[0].length)
				: body.replace(/\s*$/, "\n\n") + block + "\n";
			text = `---\n${f.replace(/\n+$/, "")}\n---\n${body.replace(/^\n?/, "\n")}`;
		}
		return { text, stats: built };
	}

	/** Which sources are due: PubMed once a day, the citations once a week (10 minutes' slack). */
	function dueSources(bot, now) {
		let t = new Date(now).getTime();
		let age = last => (last ? t - new Date(last).getTime() : Infinity);
		return {
			pubmed: !!(bot.sources.pubmed && bot.query) && age(bot.lastPubmed) >= PUBMED_EVERY_MS - 600000,
			citations: !!(bot.sources.citations && bot.core.length) && age(bot.lastCitations) >= CITATIONS_EVERY_MS - 600000,
		};
	}

	/** YYYY-MM-DD of the day before the last run (publication dates are coarse), or `days` back. */
	function sinceDate(last, days, now) {
		let t = last ? new Date(last).getTime() - 24 * 3600 * 1000 : new Date(now).getTime() - days * 24 * 3600 * 1000;
		return new Date(t).toISOString().slice(0, 10);
	}

	function normalizeBot(b) {
		b = b && typeof b === "object" ? b : {};
		let days = Math.floor(Number(b.days));
		return {
			name: String(b.name || "").trim(),
			path: String(b.path || b.name || "").trim(),
			libraryID: b.libraryID,
			collectionKey: String(b.collectionKey || ""),
			query: String(b.query || "").trim(),
			exclude: (Array.isArray(b.exclude) ? b.exclude : parseExclude(b.exclude)).map(String).slice(0, 30),
			core: (Array.isArray(b.core) ? b.core : []).filter(c => c && (c.doi || c.pmid)).slice(0, MAX_CORE)
				.map(c => ({ key: String(c.key || ""), label: String(c.label || c.doi || c.pmid), doi: screening.normalizeDOI(c.doi), pmid: String(c.pmid || ""), openalex: String(c.openalex || "") })),
			sources: { pubmed: !b.sources || b.sources.pubmed !== false, citations: !b.sources || b.sources.citations !== false },
			days: days > 0 && days <= 365 ? days : DEFAULT_DAYS,
			lastPubmed: b.lastPubmed || "",
			lastCitations: b.lastCitations || "",
			seen: (Array.isArray(b.seen) ? b.seen : []).map(String).slice(-SEEN_LIMIT),
			createdAt: b.createdAt || "",
			notePath: String(b.notePath || ""),
			stats: b.stats && typeof b.stats === "object" ? { pending: Number(b.stats.pending) || 0, high: Number(b.stats.high) || 0, at: String(b.stats.at || "") } : { pending: 0, high: 0, at: "" },
			imports: (Array.isArray(b.imports) ? b.imports : []).filter(i => i && i.at && Number(i.n) > 0).map(i => ({ at: String(i.at), n: Number(i.n) })).slice(-100),
		};
	}

	// ---------- Zotero side ----------

	// Test hooks: fetch, now, ask (replaces the setup dialog), confirm
	let runtime = {
		fetch: (url, init) => scope.fetch(url, init),
		now: () => new Date(),
	};

	function ZB() {
		return scope.ZB;
	}

	function pref(key) {
		return Zotero.Prefs.get(PREF + key, true);
	}

	function readBots() {
		try {
			let all = JSON.parse(pref("topicBot.bots") || "{}");
			return all && typeof all === "object" && !Array.isArray(all) ? all : {};
		}
		catch (e) {
			return {};
		}
	}

	function writeBots(all) {
		Zotero.Prefs.set(PREF + "topicBot.bots", JSON.stringify(all), true);
	}

	function scopeKey(collection) {
		return `${ZB().adapter.libraryInfo(collection.libraryID).path}/collections/${collection.key}`;
	}

	function botFor(collection) {
		let raw = readBots()[scopeKey(collection)];
		return raw ? normalizeBot(raw) : null;
	}

	function saveBot(collection, bot) {
		let all = readBots();
		let path = collection.name;
		try {
			path = ZB().adapter.collectionPath(collection) || collection.name;
		}
		catch (e) {}
		all[scopeKey(collection)] = normalizeBot(Object.assign({}, bot, { name: collection.name, path, libraryID: collection.libraryID, collectionKey: scopeKey(collection) }));
		writeBots(all);
		init();
		return normalizeBot(all[scopeKey(collection)]);
	}

	function deleteBot(collection) {
		let all = readBots();
		delete all[scopeKey(collection)];
		writeBots(all);
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

	function notify(text) {
		ZB().main.notify("ZotMax：主題搜尋機器人", text);
	}

	/** The PICO card's search string and English blocks for a collection, if it has a card. */
	function cardInfo(collection) {
		try {
			let pico = ZB().pico;
			let card = pico && pico.cardFor(collection);
			let q = card ? pico.cardQuery(card) : null;
			return q ? { query: q.en || "", blocks: q.blocks || [], zh: chineseQuery(q.blocks) } : null;
		}
		catch (e) {
			Zotero.logError(e);
			return null;
		}
	}

	/**
	 * Core-paper choices for the dialog: the collection's items with a DOI or PMID, those included at
	 * full text first, then those read or cited; `picked` marks the bot's (or, for a new bot, those).
	 */
	function coreChoices(collection, bot) {
		let cfg = screening.config();
		let statusCfg = ZB().status ? ZB().status.config() : {};
		let rows = [];
		for (let item of ZB().adapter.itemsInCollection(collection, true)) {
			let id = citationChase.itemIdentity(item);
			if (!id.doi && !id.pmid) continue;
			let tags = item.getTags().map(t => t.tag);
			let included = screening.readState(tags, cfg).ft === "include";
			let status = ZB().status ? ZB().status.zoteroStatus(tags, statusCfg) : "";
			rows.push(Object.assign(id, { rank: included ? 0 : ["已引用", "已讀"].includes(status) ? 1 : 2, why: included ? "全文納入" : status }));
		}
		rows.sort((a, b) => a.rank - b.rank || String(a.label).localeCompare(String(b.label)));
		let keys = bot ? new Set(bot.core.map(c => c.key)) : new Set(rows.filter(r => r.rank < 2).slice(0, MAX_CORE).map(r => r.key));
		return rows.map(r => Object.assign(r, { picked: keys.has(r.key) }));
	}

	const HTML_NS = "http://www.w3.org/1999/xhtml";

	/**
	 * The setup dialog: the search string (with a test button), the core papers, the sources.
	 * Resolves { query, core: [keys], sources, action: "save"|"run"|"delete" } or null.
	 */
	function askSetup(win, init) {
		if (runtime.ask) return Promise.resolve(runtime.ask(init));
		let doc = win && win.document;
		let dialog = null;
		try {
			dialog = doc.createElementNS(HTML_NS, "dialog");
		}
		catch (e) {}
		if (!dialog || typeof dialog.showModal !== "function") return Promise.resolve(askWithPrompt(win, init));
		return new Promise((resolve) => {
			let el = (tag, style, text) => {
				let e = doc.createElementNS(HTML_NS, tag);
				if (style) e.setAttribute("style", style);
				if (text !== undefined) e.textContent = text;
				return e;
			};
			let action = "";
			dialog.setAttribute("style", "width: min(680px, 94vw); padding: 16px 18px; border: 1px solid rgba(128,128,128,0.5); border-radius: 8px; background: Canvas; color: CanvasText; font: message-box;");
			let head = el("div", "font-size: 1.15em; font-weight: 600;", `主題搜尋機器人：${init.name}`);
			let intro = el("div", "opacity: 0.8; margin: 4px 0 8px;", "機器人定期查 PubMed 和「引用核心文獻的新研究」，依你的主題排序並寫出理由，列成 Obsidian 清單；你勾選的才會匯入 Zotero。不用 AI。");
			let qLabel = el("div", "font-weight: 600; margin-top: 8px;", "PubMed 檢索式");
			let qHint = el("div", "opacity: 0.75; font-size: 0.92em; margin: 2px 0 4px;", init.cardQuery
				? "已從這個分類的 PICO 問題卡帶入；請到 MeSH Database 確認主題詞再調整。"
				: "這個分類還沒有 PICO 問題卡：可以貼上你的檢索式，或先建立問題卡（排序也會用到 P、I、C、O）。");
			let query = el("textarea", "width: 100%; box-sizing: border-box; font: inherit; resize: vertical;");
			query.setAttribute("rows", "3");
			query.value = init.query || "";
			let testRow = el("div", "display: flex; gap: 8px; align-items: baseline; margin-top: 4px;");
			let test = el("button", "", "測試檢索式");
			test.setAttribute("type", "button");
			let testOut = el("span", "opacity: 0.85;");
			testRow.append(test, testOut);
			test.addEventListener("click", async () => {
				testOut.textContent = "查詢中…";
				try {
					testOut.textContent = await init.test(query.value.trim());
				}
				catch (e) {
					testOut.textContent = `⚠️ ${e.message || e}`;
				}
			});
			let xLabel = el("div", "font-weight: 600; margin-top: 12px;", "排除詞（選填）");
			let xHint = el("div", "opacity: 0.75; font-size: 0.92em; margin: 2px 0 4px;", `標題或摘要有這些詞的文獻扣 ${EXCLUDE_PENALTY} 分、排到後面（不會刪掉），理由會寫出是哪個詞。以逗號或換行分開，例如：children, pediatric, animal；字尾加 * 表示開頭相同的字都算（child* 包含 children、childhood）`);
			let exclude = el("input", "width: 100%; box-sizing: border-box; font: inherit;");
			exclude.setAttribute("type", "text");
			exclude.value = (init.exclude || []).join(", ");
			let cLabel = el("div", "font-weight: 600; margin-top: 12px;", `核心文獻（最多 ${MAX_CORE} 篇；機器人每週找引用它們的新研究）`);
			let list = el("div", "max-height: 200px; overflow: auto; border: 1px solid rgba(128,128,128,0.35); border-radius: 6px; padding: 4px 8px; margin-top: 4px;");
			let boxes = [];
			if (!init.choices.length) list.append(el("div", "opacity: 0.75;", "這個分類沒有含 DOI 或 PMID 的文獻。"));
			for (let c of init.choices) {
				let row = el("label", "display: block; margin: 2px 0;");
				let box = el("input");
				box.setAttribute("type", "checkbox");
				box.checked = c.picked;
				row.append(box, doc.createTextNode(` ${c.label}${c.why ? `（${c.why}）` : ""} — ${String(c.title || "").slice(0, 80)}`));
				list.append(row);
				boxes.push([box, c.key]);
			}
			let sLabel = el("div", "font-weight: 600; margin-top: 12px;", "來源");
			let src = (label, on) => {
				let row = el("label", "display: block; margin: 2px 0;");
				let box = el("input");
				box.setAttribute("type", "checkbox");
				box.checked = on;
				row.append(box, doc.createTextNode(` ${label}`));
				return { row, box };
			};
			let pubmed = src("PubMed（每天查一次新收錄的文獻）", init.sources.pubmed);
			let citations = src("引用核心文獻的新研究（OpenAlex，每週一次）", init.sources.citations);
			let buttons = el("div", "display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;");
			let mk = (text, a, bold) => {
				let b = el("button", bold ? "font-weight: 600;" : "", text);
				b.setAttribute("type", "button");
				b.addEventListener("click", () => {
					action = a;
					dialog.close(a ? "ok" : "cancel");
				});
				return b;
			};
			if (init.exists) buttons.append(mk("刪除機器人", "delete"));
			buttons.append(mk("取消", ""), mk("儲存", "save"), mk("儲存並立即搜尋", "run", true));
			dialog.append(head, intro, qLabel, qHint, query, testRow, xLabel, xHint, exclude, cLabel, list, sLabel, pubmed.row, citations.row, buttons);
			dialog.addEventListener("close", () => {
				let result = action ? {
					action,
					query: query.value.replace(/\s+/g, " ").trim(),
					exclude: parseExclude(exclude.value),
					core: boxes.filter(([b]) => b.checked).map(([, k]) => k).slice(0, MAX_CORE),
					sources: { pubmed: pubmed.box.checked, citations: citations.box.checked },
				} : null;
				dialog.remove();
				resolve(result);
			}, { once: true });
			(doc.body || doc.documentElement).append(dialog);
			try {
				dialog.showModal();
			}
			catch (e) {
				Zotero.logError(e);
			}
			if (!dialog.open) {
				dialog.remove();
				resolve(askWithPrompt(win, init));
			}
		});
	}

	function askWithPrompt(win, init) {
		let query = { value: init.query || "" };
		if (!Services.prompt.prompt(win, "主題搜尋機器人", `「${init.name}」的 PubMed 檢索式（核心文獻用預設：全文納入或已讀的文獻）`, query, null, {})) return null;
		return { action: "run", query: query.value.trim(), exclude: init.exclude || [], core: init.choices.filter(c => c.picked).map(c => c.key), sources: init.sources };
	}

	async function testQuery(query) {
		if (!query) throw new Error("請先輸入檢索式");
		let ncbi = await pubmedWatch.ncbiSettings();
		let ctx = { ncbi, throttle: pubmedWatch.createThrottle(ncbi.apiKey ? 10 : 3), requests: [] };
		let all = pubmedWatch.parseESearch(await pubmedWatch.getJSON(pubmedWatch.esearchURL(query, { retmax: 0 }, ncbi), ctx));
		let recent = pubmedWatch.parseESearch(await pubmedWatch.getJSON(pubmedWatch.esearchURL(query, { retmax: 0, reldate: DEFAULT_DAYS }, ncbi), ctx));
		return `符合 ${all.count} 篇；最近 ${DEFAULT_DAYS} 天新收錄 ${recent.count} 篇` + (all.warnings.length ? `；⚠️ ${all.warnings.join("；")}` : "");
	}

	/** 「主題搜尋機器人：建立或修改」 for a collection. */
	async function setup(collection) {
		if (!featureOn()) return featureOff();
		if (!collection) {
			notify("請先在左側選取一個主題分類。");
			return null;
		}
		let bot = botFor(collection);
		let card = cardInfo(collection);
		let choices = coreChoices(collection, bot);
		let answer = await askSetup(Zotero.getMainWindow(), {
			name: collection.name,
			exists: !!bot,
			query: bot ? bot.query : (card ? card.query : ""),
			cardQuery: !bot && !!(card && card.query),
			exclude: bot ? bot.exclude : [],
			choices,
			sources: bot ? bot.sources : { pubmed: true, citations: true },
			test: testQuery,
		});
		if (!answer) return null;
		if (answer.action === "delete") {
			if (!Services.prompt.confirm(Zotero.getMainWindow(), "主題搜尋機器人", `要刪除「${collection.name}」的搜尋機器人嗎？Obsidian 的清單筆記會留著。`)) return null;
			deleteBot(collection);
			notify(`已刪除「${collection.name}」的搜尋機器人。`);
			return { deleted: true };
		}
		let byKey = new Map(choices.map(c => [c.key, c]));
		let old = new Map((bot ? bot.core : []).map(c => [c.key, c]));
		let saved = saveBot(collection, Object.assign({}, bot || { createdAt: runtime.now().toISOString() }, {
			query: answer.query,
			exclude: Array.isArray(answer.exclude) ? answer.exclude : parseExclude(answer.exclude),
			sources: answer.sources,
			core: answer.core.map(k => byKey.get(k)).filter(Boolean)
				.map(c => ({ key: c.key, label: c.label, doi: c.doi, pmid: c.pmid, openalex: (old.get(c.key) || {}).openalex || "" })),
		}));
		if (!saved.query && !saved.core.length) {
			notify("機器人已儲存，但沒有檢索式也沒有核心文獻，不會找到任何東西。");
			return { saved };
		}
		if (answer.action === "run") return run(collection, { manual: true });
		notify(`已儲存「${collection.name}」的搜尋機器人：${scheduleText(saved)}。`);
		return { saved };
	}

	async function fetchText(url, ctx) {
		for (let attempt = 0; ; attempt++) {
			await ctx.throttle.wait();
			ctx.requests.push(url);
			let res = await runtime.fetch(url, { method: "GET" });
			let text = await res.text();
			if (res.status === 429 && attempt < 2) continue;
			if (!res.ok) throw new Error(`PubMed 連線失敗（HTTP ${res.status}）`);
			return text;
		}
	}

	/** PubMed: new PMIDs since the last run, with their records. */
	async function searchPubMed(bot, now, seen) {
		let ncbi = await pubmedWatch.ncbiSettings();
		let ctx = { ncbi, throttle: pubmedWatch.createThrottle(ncbi.apiKey ? 10 : 3), requests: [] };
		let win = pubmedWatch.searchWindow({ days: bot.days }, bot.lastPubmed, now);
		let search = pubmedWatch.parseESearch(await pubmedWatch.getJSON(pubmedWatch.esearchURL(bot.query, Object.assign({ retmax: MAX_PUBMED }, win), ncbi), ctx));
		let ids = search.ids.filter(id => !seen.has("pmid:" + id));
		let records = [];
		for (let i = 0; i < ids.length; i += EFETCH_CHUNK) {
			let url = pubmedWatch.eutilsURL("efetch", { db: "pubmed", id: ids.slice(i, i + EFETCH_CHUNK).join(","), retmode: "xml" }, ncbi);
			records.push(...parseEFetch(await fetchText(url, ctx)));
		}
		let warnings = [...search.warnings];
		if (search.count > search.ids.length) warnings.push(`PubMed 符合 ${search.count} 篇，只看最新的 ${search.ids.length} 篇；請縮小檢索式`);
		return { records, warnings };
	}

	/** OpenAlex: works citing each core paper, published since the last run. */
	async function searchCitations(bot, now) {
		let email = citationChase.config().email;
		let client = new citationChase.OpenAlexClient({ fetch: (u, i) => runtime.fetch(u, i), email, maxRequests: bot.core.length * 2 + 5 });
		let since = sinceDate(bot.lastCitations, bot.days, now);
		let citing = [];
		let warnings = [];
		for (let c of bot.core) {
			try {
				if (!c.openalex) {
					let url = citationChase.seedURL(c, { email });
					let work = url ? await client.get(url) : null;
					c.openalex = work ? citationChase.openAlexKey(work.id) : "";
					if (!c.openalex) {
						warnings.push(`OpenAlex 找不到核心文獻 ${c.label}`);
						continue;
					}
				}
				let json = await client.get(citingURL(c.openalex, since, { email }));
				for (let w of (json && json.results) || []) citing.push({ record: openAlexRecord(w), core: c.label });
			}
			catch (e) {
				warnings.push(`OpenAlex（${c.label}）：${e.message || e}`);
			}
		}
		return { citing, warnings };
	}

	/** search-links.js targets for the Chinese databases (the user's proxy settings apply); null without words. */
	function chineseTargets(query) {
		let sl = ZB().searchLinks;
		if (!query || !sl) return null;
		try {
			let cfg = sl.readConfig();
			let targets = ["airiti", "ndltd", "scholar"].map(id => sl.findSource(cfg, id)).filter(Boolean).map(src => sl.buildTarget(src, query, cfg));
			return targets.length ? { query, targets } : null;
		}
		catch (e) {
			Zotero.logError(e);
			return null;
		}
	}

	async function notePath(settings, collection) {
		let dirParts = core.vaultFolder(settings, "digest");
		let dir = PathUtils.join(settings.vaultPath, ...dirParts);
		let key = scopeKey(collection);
		let base = core.sanitizeFilename(collection.name + NOTE_SUFFIX);
		let target = null;
		for (let name of [base, `${base} (${collection.key})`]) {
			let path = PathUtils.join(dir, name + ".md");
			let existing = (await IOUtils.exists(path)) ? await IOUtils.readUTF8(path) : null;
			let owner = existing === null ? "" : core.frontmatterScalar(core.splitFrontmatter(existing).frontmatter || "", "zotero_collection");
			target = { dir, dirParts, name, path, existing };
			if (existing === null || owner === key) break;
		}
		return target;
	}

	let busy = false;

	/**
	 * Run a collection's bot: the due sources (all enabled ones when manual), the note, the bot's
	 * dates and seen list. Returns { fresh, high, pending, path } or null.
	 */
	async function run(collection, opts = {}) {
		if (!featureOn()) return opts.manual ? featureOff() : null;
		let bot = collection && botFor(collection);
		if (!bot) {
			if (opts.manual) notify(collection ? `「${collection.name}」還沒有搜尋機器人：在分類上按右鍵 → ZotMax ▸ 主題搜尋機器人：建立或修改。` : "請先在左側選取一個主題分類。");
			return null;
		}
		if (busy) {
			if (opts.manual) notify("搜尋機器人正在執行，請等它完成。");
			return null;
		}
		let settings;
		try {
			settings = await ZB().main.readSettings();
		}
		catch (e) {
			if (opts.manual) ZB().main.notify("ZotMax 設定有誤", String(e.message || e));
			return null;
		}
		if (!settings.vaultPath) {
			if (opts.manual) notify("搜尋機器人的清單存成 Obsidian 筆記：請先到 設定 → ZotMax 填入 Obsidian vault 路徑。");
			return null;
		}
		let now = runtime.now();
		let due = opts.manual ? { pubmed: !!(bot.sources.pubmed && bot.query), citations: !!(bot.sources.citations && bot.core.length) } : dueSources(bot, now);
		if (!due.pubmed && !due.citations) return null;
		busy = true;
		let pw = opts.manual ? new Zotero.ProgressWindow({ closeOnClick: true }) : null;
		let line = null;
		if (pw) {
			pw.changeHeadline("ZotMax：主題搜尋機器人");
			pw.show();
			line = new pw.ItemProgress("note", `「${collection.name}」搜尋中…`);
		}
		try {
			let seen = new Set(bot.seen);
			let errors = [];
			let pubmed = { records: [], warnings: [] };
			let cites = { citing: [], warnings: [] };
			if (due.pubmed) {
				try {
					pubmed = await searchPubMed(bot, now, seen);
					bot.lastPubmed = now.toISOString();
				}
				catch (e) {
					Zotero.logError(e);
					errors.push(`PubMed：${e.message || e}`);
				}
			}
			if (due.citations) {
				cites = await searchCitations(bot, now);
				if (cites.citing.length || !cites.warnings.length) bot.lastCitations = now.toISOString();
			}
			errors.push(...pubmed.warnings, ...cites.warnings);
			let index = citationChase.libraryIndex(await citationChase.libraryRecords(collection.libraryID, new Set()));
			let merged = mergeCandidates(pubmed.records, cites.citing).filter(c => !seen.has(c.key) && !index.find(c));
			let card = cardInfo(collection);
			let profile = profileFrom({ cardBlocks: card && card.blocks, query: bot.query });
			for (let c of merged) c.rank = scoreCandidate(c, profile, { now, exclude: bot.exclude });
			merged.sort((a, b) => b.rank.score - a.rank.score);
			let target = await notePath(settings, collection);
			let result = {
				at: now.toISOString(), candidates: merged, errors,
				counts: { pubmed: merged.filter(c => c.sources.has("pubmed")).length, citations: merged.filter(c => c.sources.has("citations") && !c.sources.has("pubmed")).length },
				chinese: chineseTargets(card && card.zh),
			};
			let { text, stats } = buildBotNote(target.existing, result, bot, { layout: core.layoutPref() });
			await IOUtils.makeDirectory(target.dir, { createAncestors: true, ignoreExisting: true });
			await IOUtils.writeUTF8(target.path, text);
			bot.seen = [...new Set([...bot.seen, ...stats.listed, ...stats.dropped])].slice(-SEEN_LIMIT);
			bot.notePath = [...target.dirParts, target.name].join("/");
			bot.stats = { pending: stats.pending, high: stats.highPending, at: now.toISOString() };
			saveBot(collection, bot);
			let rel = [...target.dirParts, target.name + ".md"].join("/");
			let summary = `「${collection.name}」：${stats.fresh} 篇新候選（高相關 ${stats.high} 篇），清單共 ${stats.pending} 篇待看`;
			if (line) {
				line.setText(summary);
				line.setProgress(100);
				pw.addDescription(`已寫入 Obsidian：${rel}`);
				if (errors.length) pw.addDescription(`⚠️ ${errors.slice(0, 2).join("；")}`);
				pw.startCloseTimer(10000);
			}
			else if (stats.fresh) {
				notify(`${summary}。在 Obsidian 開 ${rel} 勾選要讀的。`);
			}
			return { fresh: stats.fresh, high: stats.high, pending: stats.pending, path: target.path, errors };
		}
		catch (e) {
			Zotero.logError(e);
			if (line) {
				line.setText(`失敗：${e.message || e}`);
				line.setError();
				pw.startCloseTimer(20000);
			}
			return null;
		}
		finally {
			busy = false;
		}
	}

	/** 「立即搜尋」 without a collection: every bot. */
	async function runAll(opts = {}) {
		let out = [];
		for (let raw of Object.values(readBots())) {
			let bot = normalizeBot(raw);
			let key = String(bot.collectionKey).split("/collections/")[1];
			let collection = key && bot.libraryID !== undefined ? Zotero.Collections.getByLibraryAndKey(bot.libraryID, key) : null;
			if (!collection) continue;
			out.push(await run(collection, opts));
		}
		if (opts.manual && !out.length) notify("還沒有任何搜尋機器人：在主題分類上按右鍵 → ZotMax ▸ 主題搜尋機器人：建立或修改。");
		return out;
	}

	/** Import the ticked papers of a collection's bot note, tagged 新文獻, 追蹤/<collection> and the source. */
	async function importChecked(collection) {
		if (!featureOn()) return featureOff();
		if (!collection) {
			notify("請先在左側選取一個主題分類。");
			return null;
		}
		let settings = await ZB().main.readSettings().catch(() => null);
		if (!settings || !settings.vaultPath) {
			notify("請先到 設定 → ZotMax 填入 Obsidian vault 路徑。");
			return null;
		}
		let target = await notePath(settings, collection);
		let rel = [...target.dirParts, target.name + ".md"].join("/");
		if (target.existing === null) {
			notify(`找不到 ${rel}：請先執行「主題搜尋機器人：立即搜尋」。`);
			return null;
		}
		let lines = new Map(parseListed(target.existing).map(l => [l.key, l.line]));
		let index = citationChase.libraryIndex(await citationChase.libraryRecords(collection.libraryID, new Set()));
		let checked = citationChase.parseChecked(target.existing).filter(c => !c.imported);
		let todo = checked.filter(c => !index.find({ doi: c.doi || "", pmid: c.pmid || "", title: "", year: "" }));
		if (!todo.length) {
			notify(checked.length ? `勾選的 ${checked.length} 篇都已在文獻庫中。` : `${rel} 沒有新勾選的文獻：在「待看」清單勾選（- [x]）後再匯入。`);
			return { imported: 0, failed: [] };
		}
		let prefix = screening.config().sourcePrefix;
		let ok = runtime.confirm ? runtime.confirm(todo) : Services.prompt.confirm(Zotero.getMainWindow(), "ZotMax：主題搜尋機器人",
			`要用 DOI／PMID 查詢並匯入 ${todo.length} 篇勾選的文獻到分類「${collection.name}」嗎？\n`
			+ `會加上標籤「${pubmedWatch.NEW_TAG}」「${pubmedWatch.WATCH_TAG_PREFIX}${collection.name}」和來源（${prefix}PubMed 或 ${prefix}${SOURCE_TAGS.citations}）；篩選標籤不會變動，不會下載 PDF。`);
		if (!ok) return { imported: 0, failed: [], cancelled: true };
		let pw = new Zotero.ProgressWindow({ closeOnClick: true });
		pw.changeHeadline("ZotMax：主題搜尋機器人");
		pw.show();
		let line = new pw.ItemProgress("note", `匯入 ${todo.length} 篇…`);
		let imported = new Set();
		let failed = [];
		let count = 0;
		for (let [i, c] of todo.entries()) {
			line.setText(`匯入 ${i + 1}/${todo.length}：${c.title || c.doi || c.pmid}`);
			line.setProgress(Math.round(i / todo.length * 100));
			try {
				let items = await citationChase.translateIdentifier(c.doi ? { DOI: c.doi } : { PMID: c.pmid }, collection.libraryID, [collection.id]);
				let regular = (items || []).filter(it => it && it.isRegularItem && it.isRegularItem());
				if (!regular.length) throw new Error("查不到這個識別碼");
				let fromPubMed = /｜來源 [^｜]*PubMed/.test(lines.get(c.key) || "");
				for (let item of regular) {
					for (let tag of [pubmedWatch.NEW_TAG, pubmedWatch.WATCH_TAG_PREFIX + collection.name, prefix + (fromPubMed ? SOURCE_TAGS.pubmed : SOURCE_TAGS.citations)]) item.addTag(tag);
					await ZB().main.saveQuietly(item);
				}
				count += regular.length;
				imported.add(c.key);
			}
			catch (e) {
				Zotero.logError(e);
				failed.push(`${c.doi || "PMID " + c.pmid}：${e.message || e}`);
			}
		}
		if (imported.size) {
			let current = await IOUtils.readUTF8(target.path);
			await IOUtils.writeUTF8(target.path, citationChase.markImported(current, imported));
			let bot = botFor(collection);
			if (bot) {
				bot.imports.push({ at: runtime.now().toISOString(), n: imported.size });
				bot.stats.pending = Math.max(0, bot.stats.pending - imported.size);
				saveBot(collection, bot);
			}
		}
		line.setText(`已匯入 ${count} 篇` + (failed.length ? `，${failed.length} 篇失敗` : ""));
		line.setProgress(100);
		for (let f of failed.slice(0, 3)) pw.addDescription(`⚠️ ${f}`);
		pw.startCloseTimer(failed.length ? 20000 : 8000);
		return { imported: count, failed };
	}

	// ---------- background runs ----------

	const STARTUP_DELAY_MS = 3 * 60 * 1000;
	const TICK_MS = 60 * 60 * 1000;
	let timer = null;

	// Only while there is a bot: a profile without one never starts a timer
	function autoRun() {
		return pref("topicBot.autoRun") !== false && Object.keys(readBots()).length > 0;
	}

	async function tick() {
		timer = null;
		if (!autoRun()) return;
		try {
			if (featureOn()) await runAll({});
		}
		catch (e) {
			Zotero.logError(e);
		}
		if (autoRun()) timer = setTimeout(tick, TICK_MS);
	}

	/** At startup and when a bot is saved: the hourly check, while 「自動搜尋」 is on. */
	function init() {
		if (timer || !autoRun()) return;
		timer = setTimeout(tick, STARTUP_DELAY_MS);
	}

	function shutdown() {
		if (timer) clearTimeout(timer);
		timer = null;
	}

	return {
		FEATURE, NOTE_SUFFIX, SOURCE_TAGS, SOURCE_LABELS, DEFAULT_DAYS, MAX_CORE, MAX_PUBMED, MAX_LISTED, SEEN_LIMIT, WEIGHTS, TIERS, DESIGNS,
		PUBMED_EVERY_MS, CITATIONS_EVERY_MS, OPENALEX_FIELDS,
		// pure
		queryBlocks, profileFrom, decodeXML, parseEFetch, invertedAbstract, openAlexRecord, citingURL, keyOf, mergeCandidates,
		hasTerm, excludeHit, designOf, tierOf, scoreCandidate, botLine, parseListed, scheduleText, buildBotSection, frontmatterFor, buildBotNote,
		dueSources, sinceDate, normalizeBot, parseExclude, chineseRow, chineseQuery, botSummaries, EXCLUDE_PENALTY,
		// Zotero
		runtime, readBots, botFor, saveBot, deleteBot, coreChoices, setup, testQuery, run, runAll, importChecked, init, shutdown,
	};
});
