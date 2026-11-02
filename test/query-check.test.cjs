// content/query-check.js (檢索式體檢): tokenizer and parser on PubMed syntax edge cases, the structure notes
// (priority order, at most 3), PubMed's query translation in Chinese on real E-utilities answers (captured
// 2026-10-29), the neutral count sentence, the PICO field hints and the "ZotMax-generated" check.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const qc = require("../content/query-check.js");

const deq = (actual, expected, msg) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, msg);
const codes = list => list.map(n => n.code);
const pick = (tok, keys) => Object.fromEntries(keys.filter(k => tok[k] !== undefined).map(k => [k, tok[k]]));
const BANNED = ["查完了", "已完整", "足夠", "合格", "不及格", "分數", "紅燈", "綠燈"];

// ESearch answers for these queries (retmode=json, retmax=0), as testDetail() hands them over; the long
// `to` and querytranslation strings are shortened but keep every word the explanation looks at
const FIX = {
	ordinary: {
		query: "falls elderly exercise",
		count: 8636,
		translationSet: [
			{ from: "falls", to: "\"accidental falls\"[MeSH Terms] OR (\"accidental\"[All Fields] AND \"falls\"[All Fields]) OR \"accidental falls\"[All Fields] OR \"falling\"[All Fields] OR \"falls\"[All Fields] OR \"fallings\"[All Fields]" },
			{ from: "elderly", to: "\"aged\"[MeSH Terms] OR \"aged\"[All Fields] OR \"elderly\"[All Fields] OR \"elderlies\"[All Fields] OR \"elderly's\"[All Fields] OR \"elderlys\"[All Fields]" },
			{ from: "exercise", to: "\"exercise\"[MeSH Terms] OR \"exercise\"[All Fields] OR \"exercises\"[All Fields] OR \"exercise therapy\"[MeSH Terms] OR (\"exercise\"[All Fields] AND \"therapy\"[All Fields]) OR \"exercise therapy\"[All Fields] OR \"exercising\"[All Fields]" },
		],
		translation: "(\"accidental falls\"[MeSH Terms] OR \"falls\"[All Fields] OR \"fallings\"[All Fields]) AND (\"aged\"[MeSH Terms] OR \"elderly\"[All Fields] OR \"elderlys\"[All Fields]) AND (\"exercise\"[MeSH Terms] OR \"exercise therapy\"[MeSH Terms] OR \"exercisers\"[All Fields])",
		lists: { phrasesNotFound: [], phrasesIgnored: [], fieldsNotFound: [], quotedPhrasesNotFound: [], outputMessages: [] },
	},
	tagged: {
		query: "\"pressure ulcer\" AND nurs*[tiab] AND \"Accidental Falls\"[mh:noexp]",
		count: 150,
		translationSet: [],
		translation: "\"pressure ulcer\"[All Fields] AND \"nurs*\"[Title/Abstract] AND \"Accidental Falls\"[MeSH Terms:noexp]",
	},
	dropped: {
		query: "fall prevention of the elderly AND \"zzqqx foo\" AND diabetes[xyz]",
		count: 0,
		translationSet: [
			{ from: "prevention", to: "\"prevent\"[All Fields] OR \"preventability\"[All Fields] OR \"prevention and control\"[Subheading] OR (\"prevention\"[All Fields] AND \"control\"[All Fields]) OR \"prevention\"[All Fields] OR \"prevents\"[All Fields]" },
			{ from: "elderly", to: "\"aged\"[MeSH Terms] OR \"aged\"[All Fields] OR \"elderly\"[All Fields]" },
			{ from: "diabetes", to: "\"diabete\"[All Fields] OR \"diabetes mellitus\"[MeSH Terms] OR (\"diabetes\"[All Fields] AND \"mellitus\"[All Fields]) OR \"diabetes\"[All Fields] OR \"diabetes insipidus\"[MeSH Terms]" },
		],
		translation: "\"fall\"[All Fields] AND (\"prevent\"[All Fields] OR \"prevention and control\"[MeSH Subheading] OR \"prevention\"[All Fields]) AND (\"aged\"[MeSH Terms] OR \"elderly\"[All Fields]) AND \"foo\"[All Fields] AND (\"diabete\"[All Fields] OR \"diabetes mellitus\"[MeSH Terms] OR \"diabetes\"[All Fields] OR \"diabetes insipidus\"[MeSH Terms])",
		lists: { phrasesNotFound: [], phrasesIgnored: ["of", "the"], fieldsNotFound: [], quotedPhrasesNotFound: ["\"zzqqx foo\""], outputMessages: ["No items found."] },
	},
	majr: {
		query: "Aged[majr] AND hand hygien*",
		count: 5,
		translationSet: [{ from: "Aged[majr]", to: "\"aged\"[MeSH Major Topic]" }, { from: "hand", to: "\"hand\"[MeSH Terms] OR \"hand\"[All Fields]" }],
		translation: "\"aged\"[MeSH Major Topic] AND ((\"hand\"[MeSH Terms] OR \"hand\"[All Fields]) AND \"hygien*\"[All Fields])",
	},
	short: {
		query: "fal* AND hip",
		count: 9,
		translationSet: [{ from: "hip", to: "\"hip\"[MeSH Terms] OR \"hip\"[All Fields]" }],
		translation: "\"fal\"[All Fields] AND (\"hip\"[MeSH Terms] OR \"hip\"[All Fields])",
	},
	lowerAnd: {
		query: "falls and elderly or exercise",
		translationSet: [],
		translation: "((\"accidental falls\"[MeSH Terms] OR \"falls\"[All Fields]) AND (\"aged\"[MeSH Terms] OR \"elderly\"[All Fields])) OR (\"exercise\"[MeSH Terms] OR \"exercise\"[All Fields])",
		lists: { phrasesIgnored: ["and"], quotedPhrasesNotFound: [], outputMessages: [] },
	},
	paren: {
		query: "falls (elderly OR aged",
		count: 6845808,
		translation: "((\"accidental falls\"[MeSH Terms] OR \"falls\"[All Fields]) AND (\"aged\"[MeSH Terms] OR \"elderly\"[All Fields] OR \"elderlys\"[All Fields])) OR (\"aged\"[MeSH Terms] OR \"aged\"[All Fields])",
		lists: { phrasesIgnored: [], quotedPhrasesNotFound: [], outputMessages: ["("] },
	},
	quote: {
		query: "falls AND \"older adult",
		translation: "(\"accidental falls\"[MeSH Terms] OR \"falls\"[All Fields]) AND (\"older\"[All Fields] AND \"adult\"[All Fields])",
		lists: { outputMessages: ["Unmatched double quote ignored."] },
	},
};

test("FIELD_TAGS: short tags, long forms, noexp and proximity", () => {
	for (const t of ["tiab", "ti", "ab", "tw", "all", "mh", "mesh", "mh:noexp", "mesh:noexp", "majr", "majr:noexp", "sh", "pt", "la", "dp", "edat", "crdt", "mhda", "sb",
		"au", "1au", "lastau", "fau", "ad", "ta", "jour", "vi", "ip", "pg", "pmid", "pmc", "aid", "ot", "nm", "rn", "gr", "ps", "pa", "pl", "si", "cois", "filter", "jid",
		"isbn", "book", "ed", "ir", "fir", "cn", "lid", "tt", "auid",
		"title/abstract", "mesh terms", "mesh major topic", "all fields", "text word", "publication type", "language", "title", "abstract", "author", "journal", "mesh subheading"]) {
		assert.ok(qc.FIELD_TAGS.has(t), t);
	}
	assert.equal(qc.FIELD_TAGS.get("tiab").zh, "標題或摘要");
	assert.equal(qc.FIELD_TAGS.get("mh").long, "MeSH Terms");
	assert.equal(qc.FIELD_TAGS.get("mesh:noexp").zh, "主題詞（不含下位詞）");
	assert.equal(qc.FIELD_TAGS.get("majr").zh, "主要主題");
	// case and spaces don't matter; proximity only after tiab, ti, ad
	assert.equal(qc.fieldInfo("MeSH Terms").known, true);
	assert.equal(qc.fieldInfo("Mesh").known, true);
	assert.equal(qc.fieldInfo("MH:NOEXP").known, true);
	assert.equal(qc.fieldInfo("mh : noexp").known, true);
	deq(pick(qc.fieldInfo("tiab:~3"), ["known", "proximity", "key"]), { known: true, proximity: 3, key: "tiab" });
	assert.equal(qc.fieldInfo("Title/Abstract:~2").known, true);
	assert.equal(qc.fieldInfo("mh:~2").known, false);
	assert.equal(qc.fieldInfo("xyz").known, false);
});

test("tokenize: tags, wildcards in quotes, proximity, date ranges, unknown tags", () => {
	const keys = ["type", "text", "field", "wildcard", "quoted", "range", "words", "lower"];
	deq(qc.tokenize("\"Accidental Falls\"[mh:noexp]").map(t => pick(t, keys)), [{ type: "phrase", text: "Accidental Falls", field: "mh:noexp", quoted: true }]);
	deq(qc.tokenize("Aged[majr]").map(t => pick(t, keys)), [{ type: "term", text: "Aged", field: "majr" }]);
	// a wildcard inside quotes is one phrase (PubMed supports it): never an error
	deq(qc.tokenize("\"nurs* care\"[tiab]").map(t => pick(t, keys)), [{ type: "phrase", text: "nurs* care", field: "tiab", wildcard: true, quoted: true }]);
	deq(qc.tokenize("nurs*[Title/Abstract]").map(t => pick(t, keys)), [{ type: "term", text: "nurs*", field: "Title/Abstract", wildcard: true }]);
	deq(qc.tokenize("\"hand hygiene\"[tiab:~3]").map(t => pick(t, keys)), [{ type: "phrase", text: "hand hygiene", field: "tiab:~3", quoted: true }]);
	deq(qc.tokenize("2015:2020[dp]").map(t => pick(t, keys)), [{ type: "term", text: "2015:2020", field: "dp" }]);
	// quoted range: one term each side, the ":" has no token of its own
	deq(qc.tokenize("\"2015\"[dp] : \"2020\"[dp]").map(t => pick(t, keys)), [
		{ type: "phrase", text: "2015", field: "dp", quoted: true },
		{ type: "phrase", text: "2020", field: "dp", quoted: true, range: true },
	]);
	deq(qc.tokenize("falls[xyz]").map(t => pick(t, keys)), [{ type: "term", text: "falls", field: "xyz" }]);
	// operators in any case; lowercase is flagged
	deq(qc.tokenize("a and b OR c Not d").map(t => pick(t, ["type", "lower"])), [
		{ type: "term" }, { type: "and", lower: true }, { type: "term" }, { type: "or" }, { type: "term" }, { type: "not", lower: true }, { type: "term" },
	]);
	// untagged words right before a tag are one tagged term (PubMed reads them as a phrase)
	deq(qc.tokenize("systematic review[pt] OR meta-analysis[pt]").map(t => pick(t, keys)), [
		{ type: "term", text: "systematic review", field: "pt", words: 2 }, { type: "or", text: "OR" }, { type: "term", text: "meta-analysis", field: "pt" },
	]);
	// a tag after a space still belongs to the word before it
	deq(qc.tokenize("falls [tiab]").map(t => pick(t, keys)), [{ type: "term", text: "falls", field: "tiab" }]);
	// parentheses and an opening quote without a closing one
	deq(qc.tokenize("(a OR b) AND \"older adult").map(t => t.type), ["lparen", "term", "or", "term", "rparen", "and", "badquote"]);
	assert.equal(qc.tokenize("falls AND \"older adult").pop().text, "older adult");
	// positions point into the query
	const q = "x AND \"y z\"[tiab]";
	const t = qc.tokenize(q)[2];
	assert.equal(q.slice(t.start, t.end), "\"y z\"[tiab]");
	deq(qc.tokenize(""), []);
	deq(qc.tokenize(null), []);
});

test("parse: groups, implicit AND, unbalanced input never throws", () => {
	const { root, errors } = qc.parse("((a OR b) AND (c OR d)) NOT e");
	deq(errors, []);
	assert.equal(root.items.length, 2);
	deq(root.ops, [{ op: "not" }]);
	const inner = root.items[0];
	assert.equal(inner.type, "group");
	assert.equal(inner.text, "((a OR b) AND (c OR d))");
	deq(inner.ops, [{ op: "and" }]);
	deq(inner.items[0].ops, [{ op: "or" }]);
	// adjacent operands
	deq(qc.parse("a b").root.ops, [{ op: "and", implicit: true }]);
	// a leading operator
	deq(qc.parse("NOT a").root.lead, { op: "not" });
	// unbalanced
	deq(qc.parse("falls (elderly OR aged").errors, [{ code: "unbalancedParens", open: 1, close: 0 }]);
	deq(qc.parse("a) OR b").errors, [{ code: "unbalancedParens", open: 0, close: 1 }]);
	deq(qc.parse("falls AND \"older adult").errors, [{ code: "unbalancedQuotes" }]);
	// a quoted date range is one operand
	deq(qc.parse("falls AND \"2015\"[dp] : \"2020\"[dp]").root.ops, [{ op: "and" }]);
	for (const q of ["((((", "))))", "\"", "[", "]", "AND OR NOT", "a[", "\"x\"[", ":"]) assert.doesNotThrow(() => qc.lint(q), q);
});

test("lint: one note per problem shape", () => {
	const one = q => codes(qc.lint(q));
	// well-formed nested parentheses, valid tags, wildcard inside quotes: nothing
	deq(one("((a OR b) AND (c OR d)) NOT e"), []);
	deq(one("\"Accidental Falls\"[mh:noexp] AND (Aged[majr] OR \"nurs* care\"[tiab]) AND \"hand hygiene\"[tiab:~3] AND nurs*[Title/Abstract]"), []);
	deq(one("(falls[tiab] OR \"accidental falls\"[Mesh]) AND 2015:2020[dp]"), []);
	deq(one("(falls OR fall) AND \"2015\"[dp] : \"2020\"[dp]"), []);
	deq(one(""), []);
	// mixed AND/OR in one group, at any depth (implicit AND counts)
	deq(one("a AND b OR c"), ["mixedAndOr"]);
	deq(one("(a OR b c)"), ["mixedAndOr"]);
	deq(one("x AND ((a OR b) AND c OR d)"), ["mixedAndOr"]);
	assert.equal(qc.lint("a AND b OR c")[0].text, "同一層同時有 AND 和 OR（a AND b OR c）：PubMed 由左到右處理，不會先算 AND。同一個概念的同義詞可以用 OR 放進同一組括號。");
	// NOT early
	deq(one("a NOT b AND c"), ["earlyNot"]);
	deq(one("NOT a"), ["earlyNot"]);
	deq(one("(a OR b) NOT c"), []);
	// unbalanced parentheses come first
	deq(one("falls (elderly OR aged"), ["unbalancedParens"]);
	assert.equal(qc.lint("falls (elderly OR aged")[0].text, "括號沒有成對：左括號 1 個、右括號 0 個。PubMed 會丟掉多出來的括號，結果可能和你想的不一樣。");
	deq(one("falls AND \"older adult"), ["unbalancedQuotes"]);
	assert.equal(qc.lint("falls AND \"older adult")[0].text, "引號沒有成對：PubMed 會忽略落單的引號。");
	// a long flat chain
	deq(one("falls elderly exercise balance training program"), ["longNoParens"]);
	assert.equal(qc.lint("a b c d e f")[0].text, "6 個詞連成一串、沒有括號也沒有 OR：PubMed 會要求每個詞都出現。同義詞要用 OR 放在同一組括號裡。");
	deq(one("a AND b AND c AND d"), []);
	deq(one("a OR b c d e f"), ["mixedAndOr"]);
	// tags
	deq(one("falls[xyz] AND aged[mh]"), ["unknownField"]);
	assert.equal(qc.lint("diabetes[xyz]")[0].text, "PubMed 不認得欄位標籤 [xyz]，會當成沒有欄位的詞（自動對應）。");
	deq(one("falls[mh:~2]"), ["unknownField"]);
	// truncation
	deq(one("fal* AND hip"), ["shortTruncation"]);
	assert.equal(qc.lint("fal* AND hip")[0].text, "fal* 的字根少於 4 個字母，PubMed 不做截字，只找「fal」。");
	deq(one("nurs* AND hip"), []);
	deq(one("\"fa* care\""), [], "a wildcard inside quotes is not checked");
	// lowercase operators still work as operators
	deq(one("falls and elderly or exercise"), ["mixedAndOr"]);
});

test("lint: at most 3 notes, in the fixed priority order", () => {
	const q = "NOT a AND b OR fal* AND c[xyz] ( AND \"x";
	const all = codes(qc.lint(q, { max: 10 }));
	deq(all, ["unbalancedParens", "unbalancedQuotes", "mixedAndOr", "earlyNot", "unknownField", "shortTruncation"]);
	deq(codes(qc.lint(q)), ["unbalancedParens", "unbalancedQuotes", "mixedAndOr"]);
	deq(codes(qc.lint(q, { max: 1 })), ["unbalancedParens"]);
	deq(qc.LINT_ORDER, ["unbalancedParens", "unbalancedQuotes", "mixedAndOr", "earlyNot", "longNoParens", "unknownField", "shortTruncation"]);
});

test("lint: ZotMax-shaped queries (PICO generator and MeSH query) give no notes", () => {
	deq(qc.lint('("older adults"[tiab] OR elderly[tiab] OR "Aged"[Mesh]) AND (exercise[tiab] OR "physical activity"[tiab] OR "Exercise"[Mesh]) AND (falls[tiab] OR "accidental falls"[tiab] OR "Accidental Falls"[Mesh]) AND (randomized controlled trial[pt] OR systematic review[pt] OR meta-analysis[pt] OR guideline[pt] OR practice guideline[pt]) AND (english[la] OR chinese[la]) AND 2015:3000[dp] NOT (animals[mh] NOT humans[mh])'), []);
});

test("lint: long groups are quoted to at most 60 characters", () => {
	const q = "(" + Array.from({ length: 20 }, (_, i) => "term" + i).join(" OR ") + " AND x)";
	const note = qc.lint(q)[0];
	assert.equal(note.code, "mixedAndOr");
	const frag = /（(.*)）：/.exec(note.text)[1];
	assert.ok(frag.length <= 60, frag);
	assert.ok(frag.endsWith("…"));
});

test("explainTranslation: automatic term mapping, MeSH and subheadings", () => {
	const lines = qc.explainTranslation(FIX.ordinary);
	deq(lines, [
		"「falls」→ 自動對到 MeSH「accidental falls」（也會找它底下的下位詞），原字也在所有欄位找",
		"「elderly」→ 自動對到 MeSH「aged」（也會找它底下的下位詞），原字也在所有欄位找",
		"「exercise」→ 自動對到 MeSH「exercise」、「exercise therapy」（也會找它底下的下位詞），原字也在所有欄位找",
	]);
	// prevention: only a subheading, no MeSH
	const d = qc.explainTranslation(FIX.dropped);
	assert.ok(d.includes("「prevention」→ 對到副標題「prevention and control」"), d.join("\n"));
	assert.ok(!d.some(l => l.startsWith("「prevention」→ 自動對到 MeSH")));
	// a word with no MeSH at all
	const none = qc.explainTranslation({ query: "zebrafish", translationSet: [{ from: "zebrafish", to: "\"zebrafish\"[All Fields] OR \"zebrafishes\"[All Fields]" }], translation: "\"zebrafish\"[All Fields]" });
	deq(none, ["「zebrafish」沒有對到 MeSH，只在所有欄位找這個字和字尾變化"]);
});

test("explainTranslation: tags, noexp, majr, proximity on one word", () => {
	deq(qc.explainTranslation(FIX.tagged), [
		"「nurs*[tiab]」：只在標題和摘要找，不會自動對到 MeSH",
		"「\"Accidental Falls\"[mh:noexp]」：主題詞（不含下位詞）",
	]);
	const majr = qc.explainTranslation(FIX.majr);
	assert.match(majr[0], /^「Aged\[majr\]」：主要主題/);
	assert.ok(!majr.some(l => /hygien/.test(l)), "hygien* kept its truncation: nothing to say");
	const prox = qc.explainTranslation({ query: "falls[tiab:~2]", translation: "\"falls\"[Title/Abstract]" });
	assert.equal(prox.length, 1);
	assert.match(prox[0], /^「falls\[tiab:~2\]」：只在標題和摘要找.*只對多字片語有效/);
	// several words with one tag: one line
	const many = qc.explainTranslation({ query: "falls[tiab] AND gait[tiab] AND balance[tiab]", translation: "\"falls\"[Title/Abstract] AND \"gait\"[Title/Abstract] AND \"balance\"[Title/Abstract]" });
	deq(many, ["「falls[tiab]」 等 3 個：只在標題和摘要找，不會自動對到 MeSH"]);
});

test("explainTranslation: dropped words, ignored words, phrases not found, unknown tags", () => {
	const d = qc.explainTranslation(FIX.dropped);
	assert.ok(d.length <= 6);
	assert.ok(d.includes("這些詞 PubMed 沒有用到：zzqqx"), d.join("\n"));
	assert.ok(d.includes("被當成常用字略過：of、the"), "no Boolean hint when no operator word was ignored");
	assert.ok(d.includes("找不到完全相同的片語 \"zzqqx foo\"，PubMed 改用片語裡找得到的字分開找"));
	assert.ok(d.includes("「diabetes[xyz]」：PubMed 不認得 [xyz]，當成沒有欄位的詞（自動對應）"));
	assert.ok(!d.some(l => /No items found/.test(l)), "the count says it");
	// lowercase and
	deq(qc.explainTranslation(FIX.lowerAnd), ["被當成常用字略過：and（布林運算要寫成大寫 AND、OR、NOT）"]);
	// lists from PubMed
	const l = qc.explainTranslation({ query: "x", translation: "\"x\"[All Fields]", lists: { phrasesNotFound: ["qqq"], fieldsNotFound: ["zz"], outputMessages: ["Wildcard search for 'pain*' used only the first 600 variations. Lengthen root word to search for all endings."] } });
	deq(l, ["PubMed 找不到、沒有用到：qqq", "PubMed 不認得的欄位：zz", "截字 pain* 只用了前 600 種字尾，把字根寫長一點"]);
});

test("explainTranslation: truncation dropped, unmatched parenthesis and quote", () => {
	assert.ok(qc.explainTranslation(FIX.short).includes("fal* 沒有做截字（字根要 4 個字母以上）"));
	assert.ok(qc.explainTranslation(FIX.paren).includes("有括號沒配對，PubMed 把它丟掉了"));
	assert.ok(qc.explainTranslation(FIX.quote).includes("有引號沒配對，PubMed 忽略了它"));
	// empty translation: nothing to explain; missing pieces don't throw
	deq(qc.explainTranslation({ query: "x", translation: "" }), []);
	deq(qc.explainTranslation({}), []);
	deq(qc.explainTranslation(), []);
	assert.doesNotThrow(() => qc.explainTranslation({ query: "x", translation: "\"x\"[All Fields]", translationSet: [null, { from: 3 }], lists: null }));
});

test("explainTranslation: capped at 6 lines, keeps room for what PubMed dropped", () => {
	const set = ["a1", "b1", "c1", "d1", "e1", "f1", "g1"].map(w => ({ from: w, to: `"${w}"[MeSH Terms] OR "${w}"[All Fields]` }));
	const lines = qc.explainTranslation({
		query: "a1 b1 c1 d1 e1 f1 g1 zzz", translationSet: set,
		translation: set.map(s => `("${s.from}"[MeSH Terms])`).join(" AND "),
		lists: { phrasesIgnored: ["of"], quotedPhrasesNotFound: ["\"q r\""] },
	});
	assert.equal(lines.length, 6);
	assert.ok(lines[0].startsWith("「a1」"));
	assert.ok(lines.includes("這些詞 PubMed 沒有用到：zzz"));
	assert.ok(lines.some(l => l.startsWith("找不到完全相同的片語")));
	assert.equal(new Set(lines).size, lines.length);
});

// Live ESearch answers (2026-10-29) for shapes the first fixtures missed: legacy field tags PubMed still
// accepts, MeSH-tagged entry terms searched as a heading with another name, and a long untagged run
const LIVE = {
	legacy: [
		["english[lang]", "\"english\"[Language]"],
		["review[ptyp]", "\"review\"[Publication Type]"],
		["2015[pdat]", "2015/01/01:2015/12/31[Date - Publication]"],
		["2015:2020[pdat]", "2015/01/01:2020/12/31[Date - Publication]"],
		["drug therapy[sh:noexp]", "\"drug therapy\"[MeSH Subheading:noexp]", [{ from: "drug therapy[sh:noexp]", to: "\"drug therapy\"[Subheading:noexp]" }]],
		["nursing[subh]", "\"nursing\"[MeSH Subheading]", [{ from: "nursing[subh]", to: "\"nursing\"[Subheading]" }]],
		["smith[auth]", "smith[Author]"],
		["falls[titl]", "\"falls\"[Title]"],
		["falls[word]", "\"falls\"[Text Word]"],
		["taiwan[affl]", "\"taiwan\"[Affiliation]"],
		["12[page]", "\"12\"[Pagination]"],
		["falls[keyword]", "\"falls\"[Other Term]"],
	],
	elderlyMh: { query: "elderly[mh]", translation: "\"aged\"[MeSH Terms]", translationSet: [{ from: "elderly[mh]", to: "\"aged\"[MeSH Terms]" }] },
	heartMh: { query: "heart attack[mh]", translation: "\"myocardial infarction\"[MeSH Terms]", translationSet: [{ from: "heart attack[mh]", to: "\"myocardial infarction\"[MeSH Terms]" }] },
	childrenMh: {
		query: "falls NOT children[mh] AND 2015:2020[dp]",
		translation: "(\"accidental falls\"[MeSH Terms] OR \"falls\"[All Fields]) NOT \"child\"[MeSH Terms] AND 2015/01/01:2020/12/31[Date - Publication]",
		translationSet: [{ from: "falls", to: "\"accidental falls\"[MeSH Terms] OR \"falls\"[All Fields]" }, { from: "children[mh]", to: "\"child\"[MeSH Terms]" }],
	},
	longRun: {
		query: "falls elderly exercise balance training[tiab]",
		translation: "((\"accidental falls\"[MeSH Terms] OR \"falls\"[All Fields]) AND (\"aged\"[MeSH Terms] OR \"elderly\"[All Fields])) AND \"exercise balance training\"[Title/Abstract]",
		translationSet: [{ from: "falls", to: "\"accidental falls\"[MeSH Terms] OR \"falls\"[All Fields]" }, { from: "elderly", to: "\"aged\"[MeSH Terms] OR \"elderly\"[All Fields]" }],
	},
};

test("legacy field tags PubMed accepts are not called unknown", () => {
	for (const [query, translation, translationSet = []] of LIVE.legacy) {
		deq(qc.lint(query), [], query);
		const lines = qc.explainTranslation({ query, translation, translationSet });
		assert.ok(lines.length, query);
		assert.ok(!lines.some(l => /不認得|沒有用到/.test(l)), `${query}: ${lines.join(" | ")}`);
	}
	deq(qc.explainTranslation({ query: "english[lang]", translation: LIVE.legacy[0][1] }), ["「english[lang]」：語言"]);
	deq(qc.explainTranslation({ query: "drug therapy[sh:noexp]", translation: LIVE.legacy[4][1], translationSet: LIVE.legacy[4][2] }), ["「drug therapy[sh:noexp]」：副標題（不含下位詞）"]);
	// a tag PubMed really ignores (it ran automatic term mapping, [All Fields] shows): still said
	const atm = qc.explainTranslation({ query: "exercise[xyz]", translation: "\"exercise\"[MeSH Terms] OR \"exercise\"[All Fields]" });
	assert.ok(atm.includes("「exercise[xyz]」：PubMed 不認得 [xyz]，當成沒有欄位的詞（自動對應）"), atm.join("\n"));
});

test("explainTranslation: a MeSH-tagged entry term is searched as its heading, not dropped", () => {
	deq(qc.explainTranslation(LIVE.elderlyMh), ["「elderly[mh]」→ PubMed 改找 MeSH「aged」：主題詞（也會找它底下的下位詞）"]);
	deq(qc.explainTranslation(LIVE.heartMh), ["「heart attack[mh]」→ PubMed 改找 MeSH「myocardial infarction」：主題詞（也會找它底下的下位詞）"]);
	const c = qc.explainTranslation(LIVE.childrenMh);
	assert.ok(c.includes("「children[mh]」→ PubMed 改找 MeSH「child」：主題詞（也會找它底下的下位詞）"), c.join("\n"));
	assert.ok(!c.some(l => /沒有用到/.test(l)), c.join("\n"));
	// the same name: no "改找"
	deq(qc.explainTranslation({ query: "Aged[mh]", translation: "\"aged\"[MeSH Terms]", translationSet: [{ from: "Aged[mh]", to: "\"aged\"[MeSH Terms]" }] }), ["「Aged[mh]」：主題詞（也會找它底下的下位詞）"]);
});

test("explainTranslation: a long untagged run before a tag shows only the words PubMed tagged", () => {
	deq(qc.explainTranslation(LIVE.longRun), [
		"「falls」→ 自動對到 MeSH「accidental falls」（也會找它底下的下位詞），原字也在所有欄位找",
		"「elderly」→ 自動對到 MeSH「aged」（也會找它底下的下位詞），原字也在所有欄位找",
		"「exercise balance training[tiab]」：只在標題和摘要找，不會自動對到 MeSH",
	]);
});

test("lint: parentheses in the wrong order, equal counts", () => {
	for (const q of ["(a OR b)) AND (c", "a) OR (b", ")a(", "falls) AND (aged"]) deq(codes(qc.lint(q)), ["unbalancedParens"], q);
	deq(qc.parse("a) OR (b").errors, [{ code: "unbalancedParens", open: 1, close: 1, order: true }]);
	assert.equal(qc.lint("(a OR b)) AND (c")[0].text, "括號沒有成對：左括號 2 個、右括號 2 個，但有右括號出現在它的左括號之前。PubMed 會丟掉多出來的括號，結果可能和你想的不一樣。");
	deq(codes(qc.lint("(falls OR aged) AND exercise) OR (balance")), ["unbalancedParens", "mixedAndOr"]);
	deq(qc.parse("(a) (b)").errors, []);
});

test("lint: unquoted multi-word synonyms in an OR list get the softer note", () => {
	const soft = "PubMed 會把相鄰的字放在一起找，可能當成一個片語，也可能要求每個字都出現。只想找片語可以加引號。";
	for (const q of ["(nursing home OR long term care) AND falls", "hand hygiene OR handwashing", "(a OR b c)"]) {
		const n = qc.lint(q);
		deq(codes(n), ["mixedAndOr"], q);
		assert.ok(n[0].text.startsWith("同一組 OR 裡有沒加引號的多字詞（") && n[0].text.endsWith(soft), n[0].text);
	}
	// an explicit AND, or a phrase/tag side by side, reads left to right
	for (const q of ["a AND b OR c", "exercise OR \"hip fracture\" elderly", "falls[tiab] elderly[tiab] OR exercise[tiab]"]) {
		assert.match(qc.lint(q)[0].text, /^同一層同時有 AND 和 OR（.*由左到右處理/, q);
	}
});

test("countSentence: neutral, by question type", () => {
	assert.equal(qc.countSentence(0, "treatment"), "PubMed 找到 0 篇。先看上面有沒有被略過的詞或找不到的片語。");
	const tail = "可以拿 2–3 篇你知道一定要找到的文獻，看它們有沒有在結果裡。";
	assert.equal(qc.countSentence(8636, "treatment"), "PubMed 找到 8,636 篇。治療／預防題做系統性回顧時，初步檢索常見幾百到幾千篇。" + tail);
	assert.equal(qc.countSentence("150", "diagnosis"), "PubMed 找到 150 篇。診斷準確度的題目常比治療題少，幾十到幾百篇都常見。" + tail);
	assert.equal(qc.countSentence(1200, "prognosis"), "PubMed 找到 1,200 篇。預後和病因題多是觀察性研究，幾百到上千篇都常見。" + tail);
	assert.equal(qc.countSentence(1200, "etiology"), qc.countSentence(1200, "prognosis"));
	assert.equal(qc.countSentence(12, "meaning"), "PubMed 找到 12 篇。質性（經驗）題在 PubMed 常在 50 篇以下，也要查 CINAHL。" + tail);
	assert.equal(qc.countSentence(6845808, ""), "PubMed 找到 6,845,808 篇。筆數多少沒有標準答案。" + tail);
	assert.equal(qc.countSentence(5, "other"), "PubMed 找到 5 篇。筆數多少沒有標準答案。" + tail);
	assert.equal(qc.countSentence(null, "treatment"), "");
	assert.equal(qc.countSentence(undefined), "");
	assert.equal(qc.countSentence("abc"), "");
});

test("picoHints: MeSH without free text, truncation, phrases", () => {
	deq(qc.picoHints({ terms: [], mesh: ["Nurses"] }), ["有 MeSH 但沒有自由詞：剛收錄、還沒標上 MeSH 的新文獻會找不到，可以加幾個同義詞。"]);
	deq(qc.picoHints({ terms: ["elderly", "older adults"], mesh: ["Aged"] }), ["可以考慮截字，例如 nurs* 同時找 nurse、nursing、nurses（字根至少 4 個字母）。"]);
	deq(qc.picoHints({ terms: ["exercis*", "older adults"] }), []);
	deq(qc.picoHints({ terms: ["tai chi", "yoga"] }), [], "short single words only: no truncation hint; the page quotes phrases itself");
	deq(qc.picoHints({ terms: ["tai chi", "yoga"] }, { autoQuote: false }), ["多字的詞可以加引號當片語找，例如 \"hand hygiene\"。"]);
	deq(qc.picoHints({ terms: ["\"tai chi\""] }, { autoQuote: false }), []);
	deq(qc.picoHints({ terms: ["長者", "老人"] }), [], "no truncation hint for Chinese");
	deq(qc.picoHints({ terms: "elderly, older adults" }), ["可以考慮截字，例如 nurs* 同時找 nurse、nursing、nurses（字根至少 4 個字母）。"], "a comma list works too");
	assert.equal(qc.picoHints({ terms: ["elderly", "older adults"] }, { autoQuote: false }).length, 2);
	deq(qc.picoHints({}), []);
	deq(qc.picoHints(), []);
});

test("isUserQuery and checkTest: ZotMax's own query is skipped", () => {
	const gen = '("Accidental Falls"[Mesh] OR falls[tiab]) AND ("Aged"[Mesh] OR elderly[tiab])';
	assert.equal(qc.isUserQuery(gen, gen), false);
	assert.equal(qc.isUserQuery("  " + gen.toLowerCase().replace(/ /g, "\n  ") + " ", gen), false, "whitespace and case don't make it the user's");
	assert.equal(qc.isUserQuery("ＡＢＣ", "abc"), false, "NFKC");
	assert.equal(qc.isUserQuery(gen + " AND nurs*[tiab]", gen), true, "edited");
	assert.equal(qc.isUserQuery(gen, ""), true);
	assert.equal(qc.isUserQuery(gen, undefined), true);
	assert.equal(qc.isUserQuery(gen, []), true);
	assert.equal(qc.isUserQuery(gen, ["x", gen]), false);
	assert.equal(qc.isUserQuery(gen, [null, 3]), true);

	deq(qc.checkTest({ ...FIX.ordinary, query: gen }, { generated: gen, type: "treatment" }), { user: false, notes: [], explain: [], count: "" });
	const r = qc.checkTest(FIX.dropped, { generated: "something else", type: "treatment" });
	assert.equal(r.user, true);
	deq(codes(r.notes), ["longNoParens", "unknownField"]);
	assert.ok(r.explain.includes("這些詞 PubMed 沒有用到：zzqqx"));
	assert.equal(r.count, "PubMed 找到 0 篇。先看上面有沒有被略過的詞或找不到的片語。");
	assert.equal(qc.checkTest({ query: "a AND b OR c NOT d AND e (", count: 3 }, { max: 2 }).notes.length, 2);
	// a detail from before the translation set existed still works
	const old = qc.checkTest({ query: "fal* AND hip", translation: FIX.short.translation, count: 9 });
	deq(codes(old.notes), ["shortTruncation"]);
	assert.ok(old.explain.includes("fal* 沒有做截字（字根要 4 個字母以上）"));
	deq(qc.checkTest(null), { user: true, notes: [], explain: [], count: "" });
});

test("never rewrites the query, never uses banned words", () => {
	const queries = [...Object.values(FIX).map(f => f.query),
		"a AND b OR c", "NOT a AND b OR fal* AND c[xyz] ( AND \"x", "falls elderly exercise balance training program",
		"(" + Array.from({ length: 20 }, (_, i) => "term" + i).join(" OR ") + " AND x)"];
	const out = [];
	for (const q of queries) {
		const lines = [...qc.lint(q, { max: 10 }).map(n => n.text), ...qc.explainTranslation(FIX[Object.keys(FIX).find(k => FIX[k].query === q)] || { query: q, translation: "\"x\"[All Fields]" })];
		for (const line of lines) {
			out.push(line);
			// only fragments of the user's own text, at most 60 characters, ever appear
			if (q.length > 60) assert.ok(!line.includes(q), line);
			for (const m of line.matchAll(/（([^（）]*)）：/g)) assert.ok(m[1].length <= 60, m[1]);
			assert.ok(!/改成|改寫|建議改為|應改為/.test(line), line);
		}
	}
	for (const t of ["", "treatment", "diagnosis", "prognosis", "etiology", "meaning", "other"]) for (const n of [0, 1, 49, 50, 3000, 100000]) out.push(qc.countSentence(n, t));
	out.push(...qc.picoHints({ terms: ["elderly", "older adults"] }, { autoQuote: false }), ...qc.picoHints({ mesh: ["Aged"] }));
	for (const line of out) for (const w of BANNED) assert.ok(!line.includes(w), `${w} in ${line}`);
});

test("module file: inlinable, loads in a page scope and in the plugin scope", () => {
	const src = fs.readFileSync(path.join(__dirname, "..", "content", "query-check.js"), "utf8");
	assert.ok(!src.includes("</script"), "the page test inlines it");
	// a web page: window.ZBQueryCheck only
	const page = vm.createContext({});
	vm.runInContext(src, page);
	assert.equal(typeof page.ZBQueryCheck.lint, "function");
	assert.equal(page.ZB, undefined);
	// the plugin scope: ZB.queryCheck too
	const plugin = vm.createContext({ ZB: {} });
	vm.runInContext(src, plugin);
	for (const fn of ["tokenize", "parse", "lint", "explainTranslation", "countSentence", "picoHints", "isUserQuery", "checkTest"]) assert.equal(typeof plugin.ZB.queryCheck[fn], "function", fn);
	assert.equal(plugin.ZB.queryCheck, plugin.ZBQueryCheck);
});
