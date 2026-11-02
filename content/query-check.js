/*
 * ZotMax — 檢索式體檢 (query check): structure notes for a PubMed query the user wrote or edited,
 * PubMed's query translation explained in Chinese, one neutral sentence about the hit count, and
 * hints for the PICO fields of the web page.
 *
 * No Zotero, DOM or network dependencies. Works as:
 *   - require("./query-check.js") in Node (tests)
 *   - ZB.queryCheck in the plugin (bootstrap.js loads it after core.js); 測試檢索式 in PubMed 追蹤 and
 *     主題搜尋機器人 shows it (pref queryCheck.enabled)
 *   - window.ZBQueryCheck when site/search.html loads it with <script> (copied there by pages.yml)
 *
 * Coach rules: it only checks queries the user wrote or edited (isUserQuery: a query equal to what
 * ZotMax generated is skipped), it states facts and reminders, and it never rewrites the query, never
 * judges the hit count and never says the search is complete. The PubMed behaviour it explains was
 * checked against real E-utilities responses (2026-10-29): an unknown field tag is ignored without a
 * message, a `*` on a root shorter than 4 letters is dropped, `~N` proximity on one word is ignored, a
 * wildcard inside a quoted phrase works, Boolean operators run left to right (but unquoted words side
 * by side stay together), an unmatched `(` or a `)` before its `(` is dropped with only the output
 * message "(" / ")", a MeSH-tagged entry term is searched as its heading (`elderly[mh]` → "aged"),
 * and lowercase `and` is ignored as a common word.
 * This file is inlined into a <script> by the page test: never write the closing script tag in it.
 */
(function (root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) {
		module.exports = api;
	}
	else {
		// The plugin scope has ZB (created by the scripts loaded before) or Zotero; a web page has neither
		if (root.ZB || typeof root.Zotero !== "undefined") (root.ZB = root.ZB || {}).queryCheck = api;
		root.ZBQueryCheck = api;
	}
})(this || globalThis, function () {
	// ---------- PubMed field tags ----------

	// Lower-cased tag → { long: PubMed's name, zh }. Short tags, the legacy aliases PubMed still accepts
	// (lang, ptyp, pdat, auth, titl, word, subh, affl …; checked against ESearch 2026-10-29) and the long
	// forms PubMed shows in its query translation are all keys.
	const FIELD_TAGS = new Map();
	function addTag(keys, long, zh) {
		for (let k of [].concat(keys, long)) FIELD_TAGS.set(k.toLowerCase(), { long, zh });
	}
	addTag(["tiab"], "Title/Abstract", "標題或摘要");
	addTag(["ti", "titl"], "Title", "標題");
	addTag(["ab"], "Abstract", "摘要");
	addTag(["tw", "word"], "Text Word", "文字詞");
	addTag(["all"], "All Fields", "所有欄位");
	addTag(["mh", "mesh", "mh:exp", "mesh:exp"], "MeSH Terms", "主題詞（含下位詞）");
	addTag(["mh:noexp", "mesh:noexp"], "MeSH Terms:noexp", "主題詞（不含下位詞）");
	addTag(["majr", "majr:exp"], "MeSH Major Topic", "主要主題");
	addTag(["majr:noexp"], "MeSH Major Topic:noexp", "主要主題（不含下位詞）");
	addTag(["sh", "subh", "subheading"], "MeSH Subheading", "副標題");
	addTag(["sh:noexp", "subh:noexp", "subheading:noexp"], "MeSH Subheading:noexp", "副標題（不含下位詞）");
	addTag(["pt", "ptyp"], "Publication Type", "文章類型");
	addTag(["la", "lang"], "Language", "語言");
	addTag(["dp", "pdat", "publication date"], "Date - Publication", "出版日期");
	addTag(["edat", "entry date"], "Date - Entry", "收錄日期");
	addTag(["crdt", "create date"], "Date - Create", "建立日期");
	addTag(["mhda", "mesh date"], "Date - MeSH", "標上 MeSH 的日期");
	addTag(["dcom", "completion date"], "Date - Completion", "完成日期");
	addTag(["lr", "modification date"], "Date - Modification", "修改日期");
	addTag(["sb"], "Subset", "子集");
	addTag(["au", "auth"], "Author", "作者");
	addTag(["1au"], "Author - First", "第一作者");
	addTag(["lastau"], "Author - Last", "最後作者");
	addTag(["fau"], "Author - Full", "作者全名");
	addTag(["auid"], "Author - Identifier", "作者識別碼");
	addTag(["cn"], "Author - Corporate", "團體作者");
	addTag(["ad", "affl", "affiliation"], "Affiliation", "作者單位");
	addTag(["ta", "jour"], "Journal", "期刊");
	addTag(["jid"], "NLM Unique ID", "期刊 NLM ID");
	addTag(["vi", "vol"], "Volume", "卷");
	addTag(["ip", "issue"], "Issue", "期");
	addTag(["pg", "page"], "Pagination", "頁碼");
	addTag(["pmid", "uid"], "PMID", "PMID");
	addTag(["pmc", "pmcid"], "PMCID", "PMCID");
	addTag(["aid"], "Article Identifier", "文章識別碼（如 DOI）");
	addTag(["lid"], "Location ID", "位置識別碼");
	addTag(["ot", "keyword"], "Other Term", "作者關鍵字");
	addTag(["nm"], "Supplementary Concept", "補充概念");
	addTag(["rn"], "EC/RN Number", "EC／RN 編號");
	addTag(["gr"], "Grant Number", "計畫編號");
	addTag(["ps"], "Personal Name as Subject", "人名主題");
	addTag(["pa"], "Pharmacological Action", "藥理作用");
	addTag(["pl"], "Place of Publication", "出版地");
	addTag(["si"], "Secondary Source ID", "次要來源編號");
	addTag(["cois"], "Conflict of Interest Statement", "利益衝突聲明");
	addTag(["filter"], "Filter", "篩選");
	addTag(["isbn"], "ISBN", "ISBN");
	addTag(["book"], "Book", "書籍");
	addTag(["ed"], "Editor", "編者");
	addTag(["ir"], "Investigator", "研究者");
	addTag(["fir"], "Investigator - Full", "研究者全名");
	addTag(["tt"], "Transliterated Title", "原文標題");
	addTag(["pubn"], "Publisher", "出版者");
	// Proximity (`"hand hygiene"[tiab:~3]`) only works with these fields
	const PROXIMITY = new Set(["tiab", "title/abstract", "ti", "title", "ad", "affiliation"]);
	// How the explanation describes a field (the facts a novice tends to miss); else FIELD_TAGS zh
	const EXPLAIN_FIELD = {
		"Title/Abstract": "只在標題和摘要找，不會自動對到 MeSH",
		"Title": "只在標題找，不會自動對到 MeSH",
		"Abstract": "只在摘要找，不會自動對到 MeSH",
		"Text Word": "在標題、摘要和主題詞等文字欄位找，不會自動對到 MeSH",
		"All Fields": "在所有欄位找，不會自動對到 MeSH",
		"MeSH Terms": "主題詞（也會找它底下的下位詞）",
		"MeSH Terms:noexp": "主題詞（不含下位詞）",
		"MeSH Major Topic": "主要主題（只找把它當主要主題的文章）",
	};

	const squash = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

	/**
	 * A raw tag as typed (`mh:noexp`, `Title/Abstract`, `tiab:~3`) →
	 * { raw, key, known, info: { long, zh } | null, proximity: N | null }.
	 */
	function fieldInfo(raw) {
		let key = squash(raw).toLowerCase();
		let m = /^(.*?)\s*:\s*~\s*(\d+)$/.exec(key);
		if (m) {
			let base = m[1];
			let ok = PROXIMITY.has(base) && FIELD_TAGS.has(base);
			return { raw: squash(raw), key: base, known: ok, info: ok ? FIELD_TAGS.get(base) : null, proximity: Number(m[2]) };
		}
		key = key.replace(/\s*:\s*/g, ":");
		let info = FIELD_TAGS.get(key) || null;
		return { raw: squash(raw), key, known: !!info, info, proximity: null };
	}

	// ---------- tokenizer ----------

	const OPS = { and: "and", or: "or", not: "not" };
	const isSpace = ch => /\s/.test(ch);
	const BREAK = new Set(["(", ")", "\"", "["]);

	// `[…]` starting at i (spaces allowed before it) → { field, end } or null
	function readField(q, i) {
		let j = i;
		while (j < q.length && isSpace(q[j])) j++;
		if (q[j] !== "[") return null;
		let close = q.indexOf("]", j + 1);
		if (close === -1) return null;
		return { field: q.slice(j + 1, close).trim(), end: close + 1 };
	}

	/**
	 * PubMed query → tokens [{ type, text, start, end, field?, wildcard?, quoted?, lower?, range?, words? }].
	 * Types: term, phrase (text without the quotes), badquote (an opening " without a closing one; runs to
	 * the end), and / or / not (any case; `lower` when not written in capitals), lparen, rparen.
	 * A `[…]` after a term or phrase is its `field`; PubMed reads every untagged word right before a tag
	 * as one phrase (`systematic review[pt]`), so those words become one term (`words` > 1).
	 * Date ranges: `2015:2020[dp]` is one term; in `"2015"[dp] : "2020"[dp]` the second side has `range`
	 * (joined to the one before by the `:`, which has no token of its own).
	 */
	function tokenize(q) {
		q = String(q == null ? "" : q);
		let out = [];
		let i = 0;
		let rangeNext = false;
		const push = tok => {
			if (rangeNext && (tok.type === "term" || tok.type === "phrase")) tok.range = true;
			rangeNext = false;
			out.push(tok);
		};
		while (i < q.length) {
			let ch = q[i];
			if (isSpace(ch)) { i++; continue; }
			if (ch === "(") { push({ type: "lparen", text: "(", start: i, end: i + 1 }); i++; continue; }
			if (ch === ")") { push({ type: "rparen", text: ")", start: i, end: i + 1 }); i++; continue; }
			if (ch === ":" && out.length && /^(term|phrase)$/.test(out[out.length - 1].type)) {
				// the `:` of a date range between two tagged sides
				rangeNext = true; i++; continue;
			}
			if (ch === "\"") {
				let close = q.indexOf("\"", i + 1);
				if (close === -1) {
					push({ type: "badquote", text: q.slice(i + 1).trim(), start: i, end: q.length });
					break;
				}
				let text = q.slice(i + 1, close);
				let tok = { type: "phrase", text, start: i, end: close + 1, quoted: true };
				if (text.includes("*")) tok.wildcard = true;
				let f = readField(q, close + 1);
				if (f) { tok.field = f.field; tok.end = f.end; }
				push(tok);
				i = tok.end;
				continue;
			}
			if (ch === "[") {
				// a tag after a space: it belongs to the term or phrase before it
				let f = readField(q, i);
				let prev = out[out.length - 1];
				if (f && prev && (prev.type === "term" || prev.type === "phrase") && !prev.field) {
					prev.field = f.field; prev.end = f.end;
					if (prev.type === "term") mergeTagged(out);
					i = f.end;
					continue;
				}
			}
			// a word: up to a space, a parenthesis, a quote or a tag
			let j = i + 1;
			while (j < q.length && !isSpace(q[j]) && !BREAK.has(q[j])) j++;
			let word = q.slice(i, j);
			let op = OPS[word.toLowerCase()];
			if (op && !rangeNext) {
				let tok = { type: op, text: word, start: i, end: j };
				if (word !== word.toUpperCase()) tok.lower = true;
				push(tok);
				i = j;
				continue;
			}
			let tok = { type: "term", text: word, start: i, end: j };
			if (word.includes("*")) tok.wildcard = true;
			let f = readField(q, j);
			if (f && q[j] === "[") {
				tok.field = f.field; tok.end = f.end;
				push(tok);
				mergeTagged(out);
			}
			else push(tok);
			i = tok.end;
		}
		return out;
	}

	// The last token got a tag: fold the untagged words right before it into one tagged term
	function mergeTagged(out) {
		let last = out[out.length - 1];
		let k = out.length - 2;
		while (k >= 0 && out[k].type === "term" && !out[k].field && !out[k].range && !last.range) k--;
		k++;
		if (k >= out.length - 1) return;
		let first = out[k];
		let words = out.slice(k);
		let merged = {
			type: "term",
			text: words.map(w => w.text).join(" "),
			start: first.start,
			end: last.end,
			field: last.field,
			words: words.length,
		};
		if (words.some(w => w.wildcard)) merged.wildcard = true;
		out.splice(k, words.length, merged);
	}

	// ---------- parser ----------

	const OPERAND = new Set(["term", "phrase", "badquote"]);

	function newGroup(start, depth) {
		return { type: "group", items: [], ops: [], lead: null, start, end: start, depth, text: "" };
	}

	/**
	 * Groups the tokens by parentheses. Each group: { items: [token | group], ops: [{ op, implicit?, lower? }]
	 * (ops[i] joins items[i] and items[i + 1]), lead: an operator before the first item, or null }.
	 * Adjacent operands are an implicit AND. Never throws: errors lists
	 * { code: "unbalancedParens", open, close, order? } and { code: "unbalancedQuotes" }; `order` when the
	 * counts are equal but a `)` comes before its `(` (PubMed drops both).
	 */
	function parse(q) {
		q = String(q == null ? "" : q);
		let tokens = tokenize(q);
		let root = newGroup(0, 0);
		let stack = [root];
		let pending = null;
		let open = 0, close = 0, stray = 0, badQuote = false;
		const cur = () => stack[stack.length - 1];
		const addItem = item => {
			let g = cur();
			if (g.items.length) g.ops.push(pending || { op: "and", implicit: true });
			else if (pending) g.lead = pending;
			pending = null;
			g.items.push(item);
		};
		for (let t of tokens) {
			if (t.type === "lparen") {
				open++;
				let g = newGroup(t.start, stack.length);
				addItem(g);
				stack.push(g);
			}
			else if (t.type === "rparen") {
				close++;
				if (stack.length > 1) {
					let g = stack.pop();
					g.end = t.end;
					g.text = q.slice(g.start, g.end);
					pending = null;
				}
				// a `)` with nothing open: PubMed drops it
				else stray++;
			}
			else if (t.type === "and" || t.type === "or" || t.type === "not") {
				let op = { op: t.type };
				if (t.lower) op.lower = true;
				// two operators in a row: the later one counts
				pending = op;
			}
			else if (t.range) {
				// the second side of a date range belongs to the operand before it
				let g = cur();
				let prev = g.items[g.items.length - 1];
				if (prev && prev.type !== "group") prev.rangeEnd = t.end;
				else addItem(t);
			}
			else if (OPERAND.has(t.type)) {
				if (t.type === "badquote") badQuote = true;
				addItem(t);
			}
		}
		// groups left open run to the end of the query
		if (stack.length > 1) stray++;
		while (stack.length > 1) {
			let g = stack.pop();
			g.end = q.length;
			g.text = q.slice(g.start, g.end);
		}
		root.end = q.length;
		root.text = q;
		let errors = [];
		if (open !== close) errors.push({ code: "unbalancedParens", open, close });
		else if (stray) errors.push({ code: "unbalancedParens", open, close, order: true });
		if (badQuote) errors.push({ code: "unbalancedQuotes" });
		return { root, errors, tokens };
	}

	function eachGroup(g, fn) {
		fn(g);
		for (let it of g.items) if (it.type === "group") eachGroup(it, fn);
	}

	// ---------- lint ----------

	const LINT_ORDER = ["unbalancedParens", "unbalancedQuotes", "mixedAndOr", "earlyNot", "longNoParens", "unknownField", "shortTruncation"];

	// A fragment of the user's own query for a message: one line, at most 60 characters
	function fragment(text) {
		let s = squash(text);
		return s.length > 60 ? s.slice(0, 59) + "…" : s;
	}

	function letters(s) {
		return (String(s).match(/\p{L}/gu) || []).length;
	}

	/**
	 * Structure notes for a query the user wrote: [{ code, text }], at most `max`, in a fixed priority
	 * order (LINT_ORDER), each code once. Reminders only; the query is never rewritten.
	 */
	function lint(q, { max = 3 } = {}) {
		q = String(q == null ? "" : q);
		if (!q.trim()) return [];
		let { root, errors, tokens } = parse(q);
		let found = {};
		let parens = errors.find(e => e.code === "unbalancedParens");
		if (parens) {
			found.unbalancedParens = `括號沒有成對：左括號 ${parens.open} 個、右括號 ${parens.close} 個` +
				(parens.order ? "，但有右括號出現在它的左括號之前" : "") + "。PubMed 會丟掉多出來的括號，結果可能和你想的不一樣。";
		}
		if (errors.some(e => e.code === "unbalancedQuotes")) found.unbalancedQuotes = "引號沒有成對：PubMed 會忽略落單的引號。";
		eachGroup(root, g => {
			let ops = new Set(g.ops.map(o => o.op));
			if (!found.mixedAndOr && ops.has("and") && ops.has("or")) {
				// Only unquoted words side by side (`nursing home OR long term care`): PubMed keeps them
				// together (a phrase, or every word required) instead of reading left to right
				let bare = it => it.type === "term" && it.field === undefined && !it.rangeEnd;
				let wordsOnly = g.ops.every((o, i) => o.op !== "and" || (o.implicit && bare(g.items[i]) && bare(g.items[i + 1])));
				found.mixedAndOr = wordsOnly
					? `同一組 OR 裡有沒加引號的多字詞（${fragment(g.text)}）：PubMed 會把相鄰的字放在一起找，可能當成一個片語，也可能要求每個字都出現。只想找片語可以加引號。`
					: `同一層同時有 AND 和 OR（${fragment(g.text)}）：PubMed 由左到右處理，不會先算 AND。同一個概念的同義詞可以用 OR 放進同一組括號。`;
			}
			let notEarly = (g.lead && g.lead.op === "not") || g.ops.some((o, i) => o.op === "not" && i < g.ops.length - 1);
			if (!found.earlyNot && notEarly) {
				found.earlyNot = "NOT 後面還有其他詞：PubMed 由左到右處理，NOT 之後的詞會接在排除之後計算。通常把 NOT 放在最後，並用括號包住前面整串。";
			}
		});
		let hasParens = tokens.some(t => t.type === "lparen" || t.type === "rparen");
		let hasOr = tokens.some(t => t.type === "or");
		let operands = root.items.filter(it => it.type !== "group").length;
		if (!hasParens && !hasOr && operands >= 5) {
			found.longNoParens = `${operands} 個詞連成一串、沒有括號也沒有 OR：PubMed 會要求每個詞都出現。同義詞要用 OR 放在同一組括號裡。`;
		}
		let unknown = tokens.find(t => t.field !== undefined && !fieldInfo(t.field).known);
		if (unknown) found.unknownField = `PubMed 不認得欄位標籤 [${unknown.field}]，會當成沒有欄位的詞（自動對應）。`;
		let short = tokens.find(t => t.type === "term" && /\*$/.test(t.text) && letters(t.text.replace(/\*+$/, "")) < 4);
		if (short) {
			let stem = short.text.replace(/\*+$/, "");
			found.shortTruncation = `${short.text} 的字根少於 4 個字母，PubMed 不做截字，只找「${stem}」。`;
		}
		return LINT_ORDER.filter(code => found[code]).slice(0, Math.max(0, max)).map(code => ({ code, text: found[code] }));
	}

	// ---------- query translation in Chinese ----------

	const TAG_AT_END_RE = /\[([^\]]+)\]\s*$/;
	const MESH_RE = /"([^"]+)"\[MeSH Terms\]/g;
	// The headings a MeSH-tagged word was searched as (`elderly[mh]` → "aged"[MeSH Terms])
	const HEADING_RE = /"([^"]+)"\[MeSH (?:Terms|Major Topic)(?::\w+)?\]/g;
	const SUBHEADING_RE = /"([^"]+)"\[(?:MeSH )?Subheading\]/g;

	function uniq(list) {
		let seen = new Set();
		return list.filter(x => (seen.has(x) ? false : (seen.add(x), true)));
	}

	function matchAll(re, s) {
		let out = [];
		re.lastIndex = 0;
		let m;
		while ((m = re.exec(s))) out.push(m[1]);
		return uniq(out);
	}

	const quoteList = (list, max = 3) => list.slice(0, max).map(x => `「${x}」`).join("、") + (list.length > max ? " 等" : "");

	// What PubMed does with a field, in words
	function fieldWords(raw) {
		let f = fieldInfo(raw);
		if (!f.known) return "";
		return EXPLAIN_FIELD[f.info.long] || f.info.zh;
	}

	const wordsOf = text => String(text).toLowerCase().replace(/\*/g, " ").split(/[^\p{L}\p{N}]+/u).filter(w => w && !OPS[w]);

	// A MeSH field (mh, mesh, majr and their noexp/exp or long forms)
	function isMeshField(raw) {
		let f = fieldInfo(raw);
		return f.known && /^MeSH (Terms|Major Topic)/.test(f.info.long);
	}

	// The user's words (terms and the words of phrases), lower case, without `*` and tags. A MeSH-tagged
	// word is left out: PubMed searches the heading it maps to (`elderly[mh]` → "aged"), and a word it
	// cannot map shows in phrasesNotFound.
	function userWords(tokens) {
		let words = [];
		for (let t of tokens) {
			if (!OPERAND.has(t.type) || (t.field !== undefined && isMeshField(t.field))) continue;
			words.push(...wordsOf(t.text));
		}
		return uniq(words);
	}

	function hasWord(text, w) {
		let esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, "u").test(text);
	}

	const strings = v => (Array.isArray(v) ? v : []).filter(x => typeof x === "string" && x.trim()).map(x => x.trim());

	/**
	 * PubMed's reading of the query, in Chinese, from the facts in its ESearch answer only:
	 * { query, translation, translationSet: [{ from, to }], lists: { phrasesNotFound, phrasesIgnored,
	 * fieldsNotFound, quotedPhrasesNotFound, outputMessages } } → up to 6 lines. Empty translation → [].
	 */
	function explainTranslation({ query = "", translation = "", translationSet = [], lists = {} } = {}) {
		translation = String(translation || "");
		query = String(query || "");
		if (!translation.trim()) return [];
		lists = lists || {};
		let tokens = tokenize(query);
		let mapping = [];
		let covered = new Set();
		// words PubMed listed in its translation set: it used them, whatever it mapped them to
		let usedWords = new Set();
		for (let item of Array.isArray(translationSet) ? translationSet : []) {
			if (!item || typeof item.from !== "string" || typeof item.to !== "string") continue;
			let from = squash(item.from), to = item.to;
			if (!from) continue;
			covered.add(from.toLowerCase());
			let tag = TAG_AT_END_RE.exec(from);
			for (let w of wordsOf(tag ? from.slice(0, tag.index) : from)) usedWords.add(w);
			if (tag) {
				let toTag = /\[([^\]]+)\]/.exec(to);
				let words = fieldWords(toTag ? toTag[1] : tag[1]) || fieldWords(tag[1]);
				// a MeSH-tagged entry term searched as a heading with another name
				let term = squash(from.slice(0, tag.index).replace(/"/g, "")).toLowerCase();
				let heads = isMeshField(tag[1]) ? matchAll(HEADING_RE, to) : [];
				if (words && heads.length && !heads.some(h => h.toLowerCase() === term)) mapping.push(`「${from}」→ PubMed 改找 MeSH${quoteList(heads)}：${words}`);
				else if (words) mapping.push(`「${from}」：${words}`);
				continue;
			}
			let mesh = matchAll(MESH_RE, to);
			let sub = matchAll(SUBHEADING_RE, to);
			if (mesh.length) mapping.push(`「${from}」→ 自動對到 MeSH${quoteList(mesh)}（也會找它底下的下位詞），原字也在所有欄位找`);
			else if (sub.length) mapping.push(`「${from}」→ 對到副標題${quoteList(sub)}`);
			else mapping.push(`「${from}」沒有對到 MeSH，只在所有欄位找這個字和字尾變化`);
		}
		let lower = translation.toLowerCase();
		// Tagged words PubMed did not list in its translation set: one line per field
		let byField = new Map();
		for (let t of tokens) {
			if (t.field === undefined || !OPERAND.has(t.type)) continue;
			let raw = squash(query.slice(t.start, t.end));
			if (covered.has(raw.toLowerCase())) continue;
			let f = fieldInfo(t.field);
			if (!f.known) {
				// the translation shows the one field PubMed really used (`english[lang]` → "english"[Language]);
				// automatic mapping shows [All Fields] too, and then the tag was ignored
				let esc = squash(t.text).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				let shown = uniq(matchAll(new RegExp(`(?:"${esc}"|(?:^|[\\s(])${esc})\\[([^\\]]+)\\]`, "g"), lower));
				let real = shown.length === 1 && shown[0] !== "all fields" ? fieldInfo(shown[0]) : null;
				if (real && real.known) f = real;
			}
			else if (t.words > 1) {
				// PubMed puts the tag only on the last words of a long run (`falls elderly exercise balance
				// training[tiab]` → "exercise balance training"[Title/Abstract]); the words before are mapped alone
				let ws = squash(t.text).split(" ");
				let shownAs = k => lower.includes(`"${ws.slice(k).join(" ").toLowerCase()}"[`);
				for (let k = 1; k < ws.length && !shownAs(0); k++) {
					if (shownAs(k)) { raw = `${ws.slice(k).join(" ")}[${t.field}]`; break; }
				}
			}
			let key = f.known ? f.info.long + (f.proximity ? ":~" : "") : "?" + f.key;
			if (!byField.has(key)) byField.set(key, { f, raws: [] });
			byField.get(key).raws.push(raw);
		}
		let other = [];
		for (let { f, raws } of byField.values()) {
			let first = `「${fragment(raws[0])}」` + (raws.length > 1 ? ` 等 ${raws.length} 個` : "");
			// an unknown tag is silently ignored by PubMed: listed with what was dropped
			if (!f.known) other.push(`${first}：PubMed 不認得 [${f.raw}]，當成沒有欄位的詞（自動對應）`);
			else if (f.proximity) mapping.push(`${first}：${EXPLAIN_FIELD[f.info.long] || f.info.zh}，片語裡的字前後相隔 ${f.proximity} 個字以內就算（只對多字片語有效）`);
			else mapping.push(`${first}：${fieldWords(f.raw)}`);
		}

		let ignored = strings(lists.phrasesIgnored);
		let ignoredSet = new Set(ignored.map(x => x.toLowerCase()));
		let dropped = userWords(tokens).filter(w => !ignoredSet.has(w) && !usedWords.has(w) && !hasWord(lower, w));
		if (dropped.length) other.push(`這些詞 PubMed 沒有用到：${dropped.join("、")}`);
		for (let t of tokens) {
			if (t.type !== "term" || !/\*/.test(t.text)) continue;
			let stem = t.text.replace(/\*+$/, "").toLowerCase();
			if (!stem || /\*/.test(stem)) continue;
			if (lower.includes(`"${stem}"`) && !lower.includes(`${stem}*`)) other.push(`${t.text} 沒有做截字（字根要 4 個字母以上）`);
		}
		if (ignored.length) {
			let ops = ignored.some(x => OPS[x.toLowerCase()]);
			other.push(`被當成常用字略過：${ignored.join("、")}` + (ops ? "（布林運算要寫成大寫 AND、OR、NOT）" : ""));
		}
		let quoted = strings(lists.quotedPhrasesNotFound);
		if (quoted.length) other.push(`找不到完全相同的片語 ${quoted.join("、")}，PubMed 改用片語裡找得到的字分開找`);
		let notFound = strings(lists.phrasesNotFound);
		if (notFound.length) other.push(`PubMed 找不到、沒有用到：${notFound.join("、")}`);
		let fields = strings(lists.fieldsNotFound);
		if (fields.length) other.push(`PubMed 不認得的欄位：${fields.join("、")}`);
		for (let msg of strings(lists.outputMessages)) {
			let m;
			if (msg === "(" || msg === ")") other.push("有括號沒配對，PubMed 把它丟掉了");
			else if (/Unmatched double quote/i.test(msg)) other.push("有引號沒配對，PubMed 忽略了它");
			else if ((m = /Wildcard search for '([^']+)' used only the first (\d+) variations/i.exec(msg))) other.push(`截字 ${m[1]} 只用了前 ${m[2]} 種字尾，把字根寫長一點`);
			// "No items found." and the rest: the count already says it
		}
		mapping = uniq(mapping);
		other = uniq(other);
		// Mapping lines first; keep room for what PubMed dropped or ignored
		let keep = Math.max(6 - other.length, 2);
		return uniq([...mapping.slice(0, keep), ...other]).slice(0, 6);
	}

	// ---------- the hit count ----------

	const COUNT_TYPE = {
		treatment: "治療／預防題做系統性回顧時，初步檢索常見幾百到幾千篇。",
		diagnosis: "診斷準確度的題目常比治療題少，幾十到幾百篇都常見。",
		prognosis: "預後和病因題多是觀察性研究，幾百到上千篇都常見。",
		etiology: "預後和病因題多是觀察性研究，幾百到上千篇都常見。",
		meaning: "質性（經驗）題在 PubMed 常在 50 篇以下，也要查 CINAHL。",
	};

	/** One neutral sentence about the PubMed count, by the PICO card type ("" when there is no count). */
	function countSentence(count, type) {
		if (count === null || count === undefined || count === "") return "";
		let n = Number(count);
		if (!Number.isFinite(n) || n < 0) return "";
		if (n === 0) return "PubMed 找到 0 篇。先看上面有沒有被略過的詞或找不到的片語。";
		return `PubMed 找到 ${Math.round(n).toLocaleString("en-US")} 篇。` + (COUNT_TYPE[type] || "筆數多少沒有標準答案。") +
			"可以拿 2–3 篇你知道一定要找到的文獻，看它們有沒有在結果裡。";
	}

	// ---------- PICO field hints (web page) ----------

	const termList = v => (Array.isArray(v) ? v : String(v == null ? "" : v).split(/[,，、;；\r\n]+/))
		.map(t => String(t).trim()).filter(Boolean);

	/**
	 * Hints for one PICO concept of the web page's generator: { terms, mesh } (arrays or comma lists) →
	 * up to 2 strings. autoQuote: the generator already puts multi-word terms in quotes.
	 */
	function picoHints({ terms = [], mesh = [] } = {}, { autoQuote = true } = {}) {
		let t = termList(terms), m = termList(mesh);
		let out = [];
		if (m.length && !t.length) out.push("有 MeSH 但沒有自由詞：剛收錄、還沒標上 MeSH 的新文獻會找不到，可以加幾個同義詞。");
		let bare = t.map(x => x.replace(TAG_AT_END_RE, "").trim());
		if (t.length && !t.some(x => x.includes("*")) && bare.some(x => !/\s/.test(x) && (x.match(/[A-Za-z]/g) || []).length >= 5)) {
			out.push("可以考慮截字，例如 nurs* 同時找 nurse、nursing、nurses（字根至少 4 個字母）。");
		}
		if (!autoQuote && bare.some(x => /\s/.test(x) && !/^".*"$/.test(x))) out.push("多字的詞可以加引號當片語找，例如 \"hand hygiene\"。");
		return out.slice(0, 2);
	}

	// ---------- ZotMax's own queries ----------

	const normQuery = s => String(s == null ? "" : s).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

	/**
	 * True unless `generated` (a string or a list: what ZotMax put in the field) equals the query after
	 * NFKC, whitespace collapse and lower case. Nothing generated → the query is the user's.
	 */
	function isUserQuery(query, generated) {
		let gens = [].concat(generated == null ? [] : generated).filter(g => typeof g === "string" && g.trim());
		if (!gens.length) return true;
		let q = normQuery(query);
		return !gens.some(g => normQuery(g) === q);
	}

	/**
	 * For 測試檢索式: detail = pubmedWatch/topicBot testDetail() → { user, notes, explain, count }.
	 * A ZotMax-generated query gets { user: false } and nothing else.
	 */
	function checkTest(detail, { generated, type = "", max = 3 } = {}) {
		detail = detail || {};
		let query = String(detail.query || "");
		if (!isUserQuery(query, generated)) return { user: false, notes: [], explain: [], count: "" };
		return {
			user: true,
			notes: lint(query, { max }),
			explain: explainTranslation(detail),
			count: countSentence(detail.count, type),
		};
	}

	return {
		FIELD_TAGS, LINT_ORDER,
		fieldInfo, tokenize, parse, lint, explainTranslation, countSentence, picoHints, isUserQuery, checkTest,
	};
});
