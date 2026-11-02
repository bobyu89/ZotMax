// site/search.html (醫學文獻快速搜尋): URL builders, EZproxy wrapping, PICO strings, Chinese detection,
// saved searches, the 「檢查我改過的檢索式」 box and PICO field hints, and the page wiring, loaded in jsdom.
// The query checker (content/query-check.js, window.ZBQueryCheck) is inlined in place of <script src="query-check.js">,
// like appraisal-page.test.cjs does with the checklist catalog.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");

const SITE = path.join(__dirname, "..", "site");
const HTML = fs.readFileSync(path.join(SITE, "search.html"), "utf8");
const CHECKER = path.join(__dirname, "..", "content", "query-check.js");
const TAG = '<script src="query-check.js"></script>';

function withChecker(file) {
	assert.ok(HTML.includes(TAG), "page loads query-check.js from the same folder");
	if (file === null) return HTML.replace(TAG, "");
	const src = fs.readFileSync(file, "utf8");
	assert.ok(!src.includes("</script"), "checker can be inlined");
	return HTML.replace(TAG, () => "<script>" + src + "</script>");
}

function load({ storage = true, confirm = true, checker = CHECKER } = {}) {
	const errors = [];
	const vc = new VirtualConsole();
	vc.on("jsdomError", e => errors.push(e.message));
	const dom = new JSDOM(withChecker(checker), {
		url: "https://bobyu89.github.io/ZotMax/search.html",
		runScripts: "dangerously",
		virtualConsole: vc,
		beforeParse(win) {
			win.confirm = () => confirm;
			if (!storage) Object.defineProperty(win, "localStorage", { get() { throw new Error("SecurityError"); } });
		}
	});
	const win = dom.window;
	const opened = [];
	win.ZBSearch.open = url => { opened.push(url); return {}; };
	return { win, doc: win.document, Z: win.ZBSearch, opened, errors };
}

// values built inside jsdom come from another realm; compare them as plain JSON
const deq = (actual, expected, msg) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, msg);
const input = (win, el, value) => { el.value = value; el.dispatchEvent(new win.Event("input", { bubbles: true })); };

const SAMPLE = {
	p: { terms: "older adults, elderly", mesh: "Aged" },
	i: { terms: "exercise, physical activity", mesh: "Exercise" },
	c: { terms: "usual care" },
	o: { terms: "falls\naccidental falls", mesh: "Accidental Falls" }
};

test("page loads without script errors and exposes window.ZBSearch", () => {
	const { Z, errors } = load();
	deq(errors, []);
	for (const fn of ["buildUrl", "wrapProxy", "needsProxy", "buildPico", "hasCJK", "splitTerms", "glossaryHints", "checkQuery"]) assert.equal(typeof Z[fn], "function", fn);
});

test("source list is complete and consistent", () => {
	const { Z, doc } = load();
	const ids = Z.SOURCES.map(s => s.id);
	assert.equal(new Set(ids).size, ids.length);
	for (const want of ["pubmed", "mesh", "cochrane", "cinahl", "embase", "scholar", "europepmc", "semantic", "trip", "jbi", "ctgov", "ictrp", "uptodate", "airiti", "ndltd", "tpi", "nice", "cdc", "gguide"]) assert.ok(ids.includes(want), want);
	const groups = Z.GROUPS.map(g => g.id);
	deq(groups, ["en", "ebp", "zh", "trials"]);
	for (const s of Z.SOURCES) {
		assert.ok(groups.includes(s.group), s.id);
		assert.match(s.home, /^https:\/\//, s.id);
		assert.ok(["free", "partial", "inst"].includes(s.access), s.id);
		assert.ok(["sure", "guess", "home"].includes(s.status), s.id);
		if (s.status !== "home") assert.match(s.search, /^https:\/\/[^{}]+\{q\}[^{}]*$/, s.id);
	}
	for (const p of Z.PRESETS) for (const id of p.ids) assert.ok(ids.includes(id), `${p.id}:${id}`);
	// one button per source, and the status table lists every source
	assert.equal(doc.querySelectorAll("a.db").length, Z.SOURCES.length);
	assert.equal(doc.querySelectorAll("#statusTable tbody tr").length, Z.SOURCES.length);
	// the comment block at the top of the script lists every source
	const comment = HTML.slice(HTML.indexOf("<script>"), HTML.indexOf("(function (global)"));
	for (const s of Z.SOURCES) assert.ok(comment.includes(s.status === "home" ? s.home : s.search), s.id);
});

test("URL builders: search URLs, homepage + copy, empty query", () => {
	const { Z } = load();
	const q = "falls older adults";
	const enc = encodeURIComponent(q);
	deq(Z.buildUrl("pubmed", q), { url: `https://pubmed.ncbi.nlm.nih.gov/?term=${enc}`, copy: false });
	assert.equal(Z.buildUrl("mesh", "Accidental Falls").url, "https://www.ncbi.nlm.nih.gov/mesh/?term=Accidental%20Falls");
	assert.equal(Z.buildUrl("scholar", q).url, `https://scholar.google.com/scholar?q=${enc}`);
	assert.equal(Z.buildUrl("europepmc", q).url, `https://europepmc.org/search?query=${enc}`);
	assert.equal(Z.buildUrl("semantic", q).url, `https://www.semanticscholar.org/search?q=${enc}`);
	assert.equal(Z.buildUrl("ctgov", q).url, `https://clinicaltrials.gov/search?term=${enc}`);
	assert.equal(Z.buildUrl("gguide", "fall prevention").url, "https://www.google.com/search?q=fall%20prevention%20guideline%20filetype%3Apdf");
	// PubMed syntax survives encoding
	assert.equal(Z.buildUrl("pubmed", '"Accidental Falls"[Mesh] AND exercis*[tiab]').url,
		"https://pubmed.ncbi.nlm.nih.gov/?term=%22Accidental%20Falls%22%5BMesh%5D%20AND%20exercis*%5Btiab%5D");
	// verified by the live check (test/live/check-links.mjs): search URL, nothing to copy
	deq(Z.buildUrl("trip", q), { url: `https://www.tripdatabase.com/Searchresult?criteria=${enc}`, copy: false });
	deq(Z.buildUrl("nice", q), { url: `https://www.nice.org.uk/search?q=${enc}`, copy: false });
	deq(Z.buildUrl("cdc", q), { url: `https://search.cdc.gov/search/?query=${enc}`, copy: false });
	deq(Z.buildUrl("cochrane", q), { url: `https://www.cochranelibrary.com/search?p_p_id=scolarissearchresultsportlet_WAR_scolarissearchresults&p_p_lifecycle=0&_scolarissearchresultsportlet_WAR_scolarissearchresults_searchType=basic&_scolarissearchresultsportlet_WAR_scolarissearchresults_searchBy=6&_scolarissearchresultsportlet_WAR_scolarissearchresults_searchText=${enc}`, copy: false });
	// behind a login (can't be checked to the results page): search URL, and the query is copied too
	deq(Z.buildUrl("cinahl", q), { url: `https://search.ebscohost.com/login.aspx?direct=true&db=rzh&bquery=${enc}&type=1&searchMode=And&site=ehost-live`, copy: true });
	// no reliable GET search: homepage + copy
	deq(Z.buildUrl("airiti", "跌倒"), { url: "https://www.airitilibrary.com/", copy: true });
	deq(Z.buildUrl("ndltd", "跌倒"), { url: "https://ndltd.ncl.edu.tw/", copy: true });
	deq(Z.buildUrl("ictrp", q), { url: "https://trialsearch.who.int/", copy: true });
	// empty query: homepage, nothing to copy
	deq(Z.buildUrl("pubmed", "  "), { url: "https://pubmed.ncbi.nlm.nih.gov/", copy: false });
	deq(Z.buildUrl("cinahl", ""), { url: "https://search.ebscohost.com/", copy: false });
	assert.throws(() => Z.buildUrl("nope", q));
});

test("EZproxy prefix is applied only to institution-only sources", () => {
	const { Z } = load();
	const pre = "https://ezproxy.example.edu/login?url=";
	const inst = Z.SOURCES.filter(s => Z.needsProxy(s)).map(s => s.id).sort();
	deq(inst, ["cinahl", "embase", "jbi", "uptodate"]);
	for (const s of Z.SOURCES) {
		const plain = Z.buildUrl(s, "falls").url;
		const viaProxy = Z.buildUrl(s, "falls", pre).url;
		if (inst.includes(s.id)) assert.equal(viaProxy, pre + plain, s.id);
		else assert.equal(viaProxy, plain, s.id);
	}
	assert.equal(Z.buildUrl("uptodate", "fall risk", pre).url, "https://ezproxy.example.edu/login?url=https://www.uptodate.com/contents/search?search=fall%20risk");
	assert.equal(Z.buildUrl("cinahl", "TI falls", pre).url, "https://ezproxy.example.edu/login?url=https://search.ebscohost.com/login.aspx?direct=true&db=rzh&bquery=TI%20falls&type=1&searchMode=And&site=ehost-live");
	// qurl= takes an encoded URL; anything that is not http(s) is ignored
	assert.equal(Z.wrapProxy("https://www.embase.com/", "https://p.example.edu/login?qurl="), "https://p.example.edu/login?qurl=https%3A%2F%2Fwww.embase.com%2F");
	assert.equal(Z.wrapProxy("https://www.embase.com/", "ezproxy.example.edu"), "https://www.embase.com/");
	assert.equal(Z.wrapProxy("https://www.embase.com/", ""), "https://www.embase.com/");
});

test("PICO builder: PubMed, CINAHL and plain strings for the falls example", () => {
	const { Z } = load();
	const r = Z.buildPico(SAMPLE);
	assert.equal(r.concepts, 4);
	assert.equal(r.pubmed,
		'("older adults"[tiab] OR elderly[tiab] OR "Aged"[Mesh]) AND (exercise[tiab] OR "physical activity"[tiab] OR "Exercise"[Mesh]) AND ("usual care"[tiab]) AND (falls[tiab] OR "accidental falls"[tiab] OR "Accidental Falls"[Mesh])');
	assert.equal(r.cinahl,
		'(TI ("older adults" OR elderly) OR AB ("older adults" OR elderly) OR MH "Aged+") AND (TI (exercise OR "physical activity") OR AB (exercise OR "physical activity") OR MH "Exercise+") AND (TI "usual care" OR AB "usual care") AND (TI (falls OR "accidental falls") OR AB (falls OR "accidental falls") OR MH "Accidental Falls+")');
	// MeSH terms that repeat a synonym are not repeated in the plain version
	assert.equal(r.plain, '("older adults" OR elderly OR Aged) AND (exercise OR "physical activity") AND "usual care" AND (falls OR "accidental falls")');
	deq(r.cinahlLimits, []);
});

test("PICO builder: filters, optional C, tags and separators", () => {
	const { Z } = load();
	const r = Z.buildPico({
		...SAMPLE, includeC: false,
		filters: { yearFrom: "2015", lang: { en: true, zh: true }, types: { rct: true, sr: true, guideline: true }, humans: true }
	});
	assert.equal(r.concepts, 3);
	assert.ok(!r.pubmed.includes("usual care"));
	assert.ok(r.pubmed.endsWith(
		' AND (randomized controlled trial[pt] OR systematic review[pt] OR meta-analysis[pt] OR guideline[pt] OR practice guideline[pt]) AND (english[la] OR chinese[la]) AND 2015:3000[dp] NOT (animals[mh] NOT humans[mh])'), r.pubmed);
	assert.equal(r.cinahlLimits.length, 4);
	// year range: swapped when reversed, open start, invalid ignored
	assert.ok(Z.buildPico({ p: { terms: "x" }, filters: { yearFrom: "2024", yearTo: "2010" } }).pubmed.endsWith(" AND 2010:2024[dp]"));
	assert.ok(Z.buildPico({ p: { terms: "x" }, filters: { yearTo: "2020" } }).pubmed.endsWith(" AND 1800:2020[dp]"));
	assert.equal(Z.buildPico({ p: { terms: "x" }, filters: { yearFrom: "abc" } }).pubmed, "(x[tiab])");
	// existing field tags are kept; Chinese separators split; duplicates and quotes removed
	assert.equal(Z.buildPico({ i: { terms: "exercis*[tiab]，運動、「x」; \"tai chi\", Tai Chi" } }).pubmed, '(exercis*[tiab] OR 運動[tiab] OR 「x」[tiab] OR "tai chi"[tiab])');
	deq(Z.splitTerms(" a ,\n\nb；a "), ["a", "b"]);
	// MeSH-only concept
	assert.equal(Z.buildPico({ p: { mesh: "Nurses" } }).cinahl, '(MH "Nurses+")');
	// nothing filled
	deq(Z.buildPico({}), { pubmed: "", cinahl: "", plain: "", cinahlLimits: [], concepts: 0 });
});

test("Chinese detection and glossary hints", () => {
	const { Z } = load();
	assert.equal(Z.hasCJK("跌倒預防"), true);
	assert.equal(Z.hasCJK("falls 長者"), true);
	assert.equal(Z.hasCJK("falls older adults"), false);
	assert.equal(Z.hasCJK("ｆａｌｌｓ，"), false);
	assert.equal(Z.hasCJK(""), false);
	const hits = Z.glossaryHints("腦中風 病人 跌倒");
	deq(hits.map(h => h.zh), ["腦中風", "跌倒"]);
	deq(hits[1].en, ["falls", "accidental falls"]);
});

test("UI: Chinese query moves Chinese databases first; links follow the query and proxy", () => {
	const { win, doc } = load();
	const order = () => [...doc.querySelectorAll("#groups .group")].map(g => g.dataset.group);
	deq(order(), ["en", "ebp", "zh", "trials"]);
	assert.equal(doc.getElementById("cjkNote").hidden, true);

	input(win, doc.getElementById("q"), "跌倒 長者");
	deq(order(), ["zh", "en", "ebp", "trials"]);
	assert.ok(doc.querySelector('.group[data-group="zh"]').classList.contains("hl"));
	assert.equal(doc.getElementById("cjkNote").hidden, false);
	assert.equal(doc.getElementById("useEnBtn").hidden, false);
	doc.getElementById("useEnBtn").click();
	assert.equal(doc.getElementById("q").value, "falls older adults");
	deq(order(), ["en", "ebp", "zh", "trials"]);
	assert.equal(doc.querySelector('a.db[data-id="pubmed"]').href, "https://pubmed.ncbi.nlm.nih.gov/?term=falls%20older%20adults");
	assert.equal(doc.querySelector('a.db[data-id="pubmed"]').target, "_blank");

	input(win, doc.getElementById("proxy"), "https://ezproxy.example.edu/login?url=");
	assert.equal(doc.querySelector('a.db[data-id="embase"]').href, "https://ezproxy.example.edu/login?url=https://www.embase.com/");
	assert.equal(doc.querySelector('a.db[data-id="europepmc"]').href, "https://europepmc.org/search?query=falls%20older%20adults");
	assert.ok(doc.querySelector('a.db[data-id="embase"]').classList.contains("proxied"));
	assert.equal(win.localStorage.getItem("zb-search-proxy"), "https://ezproxy.example.edu/login?url=");
	assert.match(doc.getElementById("proxyState").textContent, /已套用到/);
});

test("UI: open-all opens the chosen preset, reports blocked tabs, ignores IME Enter", () => {
	const { win, doc, Z, opened } = load();
	doc.getElementById("openAllBtn").click();
	assert.equal(opened.length, 0, "no query → nothing opened");

	input(win, doc.getElementById("q"), "pressure injury");
	const preset = doc.getElementById("preset");
	preset.value = "free"; preset.dispatchEvent(new win.Event("change"));
	assert.equal(win.localStorage.getItem("zb-search-preset"), "free");
	deq([...doc.querySelectorAll("a.db.in-preset")].map(a => a.dataset.id).sort(), ["europepmc", "pubmed", "scholar", "semantic", "trip"]);
	doc.getElementById("openAllBtn").click();
	assert.equal(opened.length, 5);
	assert.equal(opened[0], "https://pubmed.ncbi.nlm.nih.gov/?term=pressure%20injury");

	// Enter while an IME is composing must not open anything
	const q = doc.getElementById("q");
	q.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
	assert.equal(opened.length, 5);
	q.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	assert.equal(opened.length, 10);

	Z.open = () => null;
	doc.getElementById("openAllBtn").click();
	return new Promise(r => setTimeout(r, 0)).then(() => assert.match(doc.getElementById("toast").textContent, /擋下了 5 個分頁/));
});

test("UI: PICO outputs, run in PubMed, MeSH links", () => {
	const { win, doc, opened } = load();
	assert.equal(doc.getElementById("runPubmed").disabled, true);
	doc.getElementById("sampleBtn").click();
	const pm = doc.getElementById("out-pubmed").textContent;
	assert.match(pm, /^\("older adults"\[tiab\] OR elderly\[tiab\] OR aged\[tiab\] OR "Aged"\[Mesh\]\) AND/);
	assert.ok(!pm.includes("usual care"), "sample leaves C out of the search");
	assert.match(pm, /randomized controlled trial\[pt\]/);
	assert.equal(doc.getElementById("runPubmed").disabled, false);
	doc.getElementById("runPubmed").click();
	assert.equal(opened[0], "https://pubmed.ncbi.nlm.nih.gov/?term=" + encodeURIComponent(pm));
	assert.equal(doc.querySelector('.meshlink[data-k="o"]').href, "https://www.ncbi.nlm.nih.gov/mesh/?term=falls");

	input(win, doc.getElementById("p-terms"), "長者");
	assert.equal(doc.getElementById("picoCjk").hidden, false);
	doc.getElementById("clearPicoBtn").click();
	assert.equal(doc.getElementById("out-pubmed").classList.contains("empty"), true);
	assert.equal(doc.getElementById("picoCjk").hidden, true);
});

test("saved searches: save, reload from storage, load, delete, import merge", () => {
	const first = load();
	let { win, doc } = first;
	input(win, doc.getElementById("q"), "falls older adults");
	doc.getElementById("sampleBtn").click();
	doc.getElementById("saveName").value = "碩論 跌倒";
	doc.getElementById("saveBtn").click();
	const stored = JSON.parse(win.localStorage.getItem("zb-search-saved-v1"));
	assert.equal(stored.length, 1);
	assert.equal(stored[0].name, "碩論 跌倒");
	assert.equal(stored[0].query, "falls older adults");
	assert.equal(stored[0].pico.o.mesh, "Accidental Falls");

	// a new page in the same origin sees it, and loading restores query + PICO
	const dom2 = new JSDOM(HTML, { url: "https://bobyu89.github.io/ZotMax/search.html", runScripts: "dangerously", beforeParse(w) { w.localStorage.setItem("zb-search-saved-v1", JSON.stringify(stored)); w.confirm = () => true; } });
	win = dom2.window; doc = win.document;
	const items = doc.querySelectorAll("#savedList li");
	assert.equal(items.length, 1);
	items[0].querySelector("button").click();
	assert.equal(doc.getElementById("q").value, "falls older adults");
	assert.equal(doc.getElementById("o-mesh").value, "Accidental Falls");
	assert.equal(doc.getElementById("t-rct").checked, true);

	const Z = win.ZBSearch;
	const incoming = Z.normalizeSaved({ app: "zotero-bridge-search", version: 1, searches: [stored[0], { name: "新的", query: "delirium" }, { bogus: true }, { name: 3 }] });
	assert.equal(incoming.length, 2);
	const merged = Z.mergeSaved(Z.normalizeSaved(stored), incoming);
	assert.equal(merged.list.length, 2);
	assert.equal(merged.added, 1);
	deq(Z.normalizeSaved("nope"), []);

	// delete
	doc.querySelectorAll("#savedList li button")[1].click();
	deq(JSON.parse(win.localStorage.getItem("zb-search-saved-v1")), []);
});

test("works without localStorage (private mode): warns and keeps searches in memory", () => {
	const { win, doc, errors } = load({ storage: false });
	deq(errors, []);
	assert.equal(win.ZBSearch.store.ok, false);
	assert.equal(doc.getElementById("storeWarn").hidden, false);
	input(win, doc.getElementById("proxy"), "https://ezproxy.example.edu/login?url=");
	assert.equal(doc.querySelector('a.db[data-id="jbi"]').href, "https://ezproxy.example.edu/login?url=https://ovidsp.ovid.com/");
	input(win, doc.getElementById("q"), "sleep");
	doc.getElementById("saveBtn").click();
	assert.equal(doc.querySelectorAll("#savedList li .nm").length, 1);
	assert.equal(doc.querySelector("#savedList li .nm").textContent, "sleep");
});

test("install wizard links to the search page", () => {
	const index = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
	assert.match(index, /<a [^>]*href="search\.html"[^>]*>🔎 醫學文獻快速搜尋<\/a>/);
});

test("shared sources use the plugin's URLs and live-check results", () => {
	const { Z, doc } = load();
	const sl = require("../content/search-links.js");
	const plugin = Object.fromEntries(sl.BUILTIN.map(s => [s.id, s]));
	const pluginID = { ctgov: "clinicaltrials", tpi: "ncl-periodicals", gguide: "guideline-pdf" };
	for (const s of Z.SOURCES) {
		const p = plugin[pluginID[s.id] || s.id];
		assert.ok(p, s.id);
		assert.ok(["ok", "login", "blocked"].includes(s.ci), s.id);
		assert.equal(s.ci, p.ci, `${s.id}: same live-check result as the plugin`);
		// Same search URL where both search (Google Scholar: the plugin adds hl=zh-TW; Google: different wrappers)
		if (s.search && p.url && !["scholar", "gguide"].includes(s.id)) assert.equal(s.search, p.url, s.id);
		assert.equal(!s.search || s.status === "home", !p.url, `${s.id}: both open a search URL, or both the homepage`);
	}
	assert.equal(Z.CI_DATE, sl.CI_DATE);
	assert.equal(doc.getElementById("ciDate").textContent, sl.CI_DATE);
	const rows = [...doc.querySelectorAll("#statusTable tbody tr")];
	assert.match(rows.find(r => r.cells[0].textContent === "Europe PMC").cells[1].textContent, /確定CI 實測：被擋/);
	assert.match(rows.find(r => r.cells[0].textContent === "CINAHL").cells[1].textContent, /推測CI 實測：需登入/);
});

const notes = doc => [...doc.querySelectorAll("#qc-notes li")].map(li => li.textContent);

test("query check box: lints the user's query, never changes it, re-test label", () => {
	const { win, doc, Z, errors, opened } = load();
	deq(errors, []);
	assert.equal(typeof win.ZBQueryCheck.lint, "function");
	const box = doc.getElementById("qcBox");
	assert.equal(box.tagName, "DETAILS");
	assert.equal(box.querySelector("summary").textContent, "檢查我改過的檢索式");
	assert.ok(box.closest("#picoCard"), "inside the PICO card");
	assert.match(box.textContent, /這裡只看結構，不會改你的檢索式，也不連 PubMed。/);
	assert.match(box.textContent, /在 ZotMax 外掛的「測試檢索式」看得到/);
	assert.equal(doc.getElementById("qc-missing").hidden, true);
	const run = doc.getElementById("qc-run");
	assert.equal(run.textContent, "檢查");
	assert.equal(run.disabled, false);
	assert.equal(doc.getElementById("qc-notes").getAttribute("aria-live"), "polite");

	// empty: nothing checked, the label stays
	run.click();
	deq(notes(doc), []);
	assert.equal(run.textContent, "檢查");

	const ta = doc.getElementById("qc-input");
	const typed = "a AND b OR c";
	ta.value = typed;
	run.click();
	const first = notes(doc);
	assert.equal(first.length, 1);
	assert.match(first[0], /^同一層同時有 AND 和 OR（a AND b OR c）/);
	assert.equal(ta.value, typed, "the textarea is never changed");
	assert.equal(run.textContent, "我改好了，再測一次");

	// the user fixes it and tests again
	const fixed = "((falls[tiab] OR \"accidental falls\"[mh:noexp]) AND (\"nurs* care\"[tiab] OR Aged[majr])) NOT children[mh]";
	ta.value = fixed;
	run.click();
	deq(notes(doc), ["沒有發現結構上的提醒。"]);
	assert.equal(ta.value, fixed);
	assert.equal(run.textContent, "我改好了，再測一次");
	deq(Z.checkQuery().map(n => n.code), []);

	// at most 3 notes
	ta.value = "NOT a AND b OR fal* AND c[xyz] ( AND \"x";
	run.click();
	assert.equal(notes(doc).length, 3);

	// run in PubMed opens the textarea text as typed
	ta.value = typed;
	doc.getElementById("qc-pubmed").click();
	assert.equal(opened.pop(), "https://pubmed.ncbi.nlm.nih.gov/?term=" + encodeURIComponent(typed));
	assert.equal(ta.value, typed);
});

test("PICO field hints: MeSH only, no truncation; plain text, empty when nothing to say", () => {
	const { win, doc } = load();
	for (const k of ["p", "i", "c", "o"]) {
		const el = doc.getElementById(k + "-hint");
		assert.ok(el && el.classList.contains("qc-hint") && el.classList.contains("small"), k);
		assert.equal(el.textContent, "", k);
		assert.equal(el.hidden, true, k);
	}
	input(win, doc.getElementById("p-mesh"), "Nurses");
	assert.equal(doc.getElementById("p-hint").textContent, "有 MeSH 但沒有自由詞：剛收錄、還沒標上 MeSH 的新文獻會找不到，可以加幾個同義詞。");
	assert.equal(doc.getElementById("p-hint").hidden, false);
	input(win, doc.getElementById("i-terms"), "exercise, physical activity");
	assert.equal(doc.getElementById("i-hint").textContent, "可以考慮截字，例如 nurs* 同時找 nurse、nursing、nurses（字根至少 4 個字母）。");
	input(win, doc.getElementById("i-terms"), "exercis*, physical activity");
	assert.equal(doc.getElementById("i-hint").textContent, "");
	assert.equal(doc.getElementById("i-hint").hidden, true);
	// the page quotes phrases itself: no phrase hint
	input(win, doc.getElementById("o-terms"), "tai chi");
	assert.equal(doc.getElementById("o-hint").textContent, "");
	// clearing empties them; the generated query is untouched by the hints
	doc.getElementById("sampleBtn").click();
	assert.match(doc.getElementById("out-pubmed").textContent, /^\("older adults"\[tiab\]/);
	doc.getElementById("clearPicoBtn").click();
	for (const k of ["p", "i", "c", "o"]) assert.equal(doc.getElementById(k + "-hint").textContent, "", k);
});

test("PICO field hints: no C hint when C is left out of the query; each hint describes its field", () => {
	const { win, doc } = load();
	for (const k of ["p", "i", "c", "o"]) assert.equal(doc.getElementById(k + "-terms").getAttribute("aria-describedby"), k + "-hint", k);
	input(win, doc.getElementById("c-mesh"), "Standard of Care");
	assert.equal(doc.getElementById("c-hint").hidden, false);
	const box = doc.getElementById("c-include");
	box.checked = false;
	box.dispatchEvent(new win.Event("change", { bubbles: true }));
	assert.equal(doc.getElementById("c-hint").textContent, "");
	assert.equal(doc.getElementById("c-hint").hidden, true);
	box.checked = true;
	box.dispatchEvent(new win.Event("change", { bubbles: true }));
	assert.equal(doc.getElementById("c-hint").hidden, false);
});

test("the page's own generated queries give no structure notes", () => {
	const { win, Z } = load();
	const all = { yearFrom: "2015", yearTo: "2024", lang: { en: true, zh: true }, types: { rct: true, sr: true, guideline: true }, humans: true };
	for (const p of [{ ...SAMPLE, filters: all }, { ...SAMPLE, includeC: false, filters: all }, { p: { terms: "x" } }, { p: { mesh: "Nurses" }, filters: { yearFrom: "2015" } }]) {
		const q = Z.buildPico(p).pubmed;
		deq(win.ZBQueryCheck.lint(q, { max: 10 }), [], q);
	}
});

test("page works without query-check.js: fallback text, disabled button, no hints, no errors", () => {
	const { win, doc, Z, errors, opened } = load({ checker: null });
	deq(errors, []);
	assert.equal(win.ZBQueryCheck, undefined);
	assert.equal(doc.getElementById("qc-missing").hidden, false);
	assert.equal(doc.getElementById("qc-missing").textContent, "載入不到檢查工具（query-check.js），請重新整理頁面。");
	assert.equal(doc.getElementById("qc-run").disabled, true);
	deq(Z.checkQuery(), []);
	input(win, doc.getElementById("p-mesh"), "Nurses");
	assert.equal(doc.getElementById("p-hint").textContent, "");
	// the rest of the page still works
	doc.getElementById("sampleBtn").click();
	assert.match(doc.getElementById("out-pubmed").textContent, /^\("older adults"\[tiab\]/);
	input(win, doc.getElementById("q"), "falls");
	doc.getElementById("openAllBtn").click();
	assert.ok(opened.length > 0);
});

test("pages workflow copies the checker; the build copy is git-ignored", () => {
	const yml = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "pages.yml"), "utf8");
	assert.match(yml, /- name: Copy shared query checker into site\/\n\s+run: cp content\/query-check\.js site\/query-check\.js/);
	assert.match(yml, /paths:[\s\S]*- "content\/query-check\.js"/);
	const ignore = fs.readFileSync(path.join(__dirname, "..", ".gitignore"), "utf8").split("\n");
	assert.ok(ignore.includes("site/query-check.js"));
});
