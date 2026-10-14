// The Word citation styles (content/styles/*.csl, word-style.js): rendered with citeproc-js — the engine Zotero's
// Word plugin uses — Chinese items (language zh-TW) come out as apa-zh.js writes Chinese APA 7, English items as
// the official APA style, Chinese references first by stroke count, whatever the document language.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const CSL = require("citeproc");
const apaZh = require("../content/apa-zh.js");
const W = require("../content/word-style.js");

const ROOT = path.join(__dirname, "..");
const LOCALES = path.join(__dirname, "fixtures", "csl-locales");

function engine(file, lang = "en-US", items) {
	let byId = Object.fromEntries(items.map(i => [i.id, i]));
	let sys = {
		retrieveLocale: l => fs.readFileSync(path.join(LOCALES, /^zh/.test(l) ? "locales-zh-TW.xml" : "locales-en-US.xml"), "utf8"),
		retrieveItem: id => byId[id],
	};
	let e = new CSL.Engine(sys, fs.readFileSync(path.join(ROOT, "content", "styles", file), "utf8"), lang);
	e.opt.development_extensions.wrap_url_and_doi = false;
	e.setOutputFormat("text");
	e.updateItems(items.map(i => i.id));
	return e;
}

const bibliography = e => e.makeBibliography()[1].map(s => s.trim());
const cite = (e, id, extra = {}) => e.makeCitationCluster([Object.assign({ id }, extra)]);

// The same Chinese items as CSL JSON (what Zotero hands citeproc) and as apa-zh.js data
const ZH = [
	{
		csl: { id: "journal", type: "article-journal", language: "zh-TW", title: "護理師主導運動對住院長者跌倒之成效", "container-title": "護理雜誌", volume: "70", issue: "2", page: "45-56",
			DOI: "10.6224/JN.202304_70(2).07", issued: { "date-parts": [[2023]] }, author: [{ family: "陳", given: "美玲" }, { literal: "林小華" }] },
		data: { itemType: "journalArticle", title: "護理師主導運動對住院長者跌倒之成效", publication: "護理雜誌", volume: "70", issue: "2", pages: "45-56", doi: "10.6224/JN.202304_70(2).07", year: "2023",
			creators: [{ lastName: "陳", firstName: "美玲", creatorType: "author" }, { name: "林小華", creatorType: "author" }] },
	},
	{
		csl: { id: "three", type: "article-journal", language: "zh-TW", title: "長期照護機構跌倒預防", "container-title": "長期照護雜誌", volume: "25", issue: "1", page: "1-15",
			issued: { "date-parts": [[2021]] }, author: [{ literal: "王大明" }, { literal: "歐陽志明" }, { literal: "張簡美惠" }] },
		data: { itemType: "journalArticle", title: "長期照護機構跌倒預防", publication: "長期照護雜誌", volume: "25", issue: "1", pages: "1-15", year: "2021",
			creators: ["王大明", "歐陽志明", "張簡美惠"].map(name => ({ name, creatorType: "author" })) },
	},
	{
		csl: { id: "book", type: "book", language: "zh-TW", title: "護理研究概論", edition: "3", publisher: "華杏", issued: { "date-parts": [[2020]] }, author: [{ literal: "李玉嬋" }] },
		data: { itemType: "book", title: "護理研究概論", edition: "3", publisher: "華杏", year: "2020", creators: [{ name: "李玉嬋", creatorType: "author" }] },
	},
	{
		csl: { id: "edited", type: "book", language: "zh-TW", title: "實證護理學導論", publisher: "華杏", issued: { "date-parts": [[2019]] }, editor: [{ literal: "陳可欣" }] },
		data: { itemType: "book", title: "實證護理學導論", publisher: "華杏", year: "2019", creators: [{ name: "陳可欣", creatorType: "editor" }] },
	},
	{
		csl: { id: "chapter", type: "chapter", language: "zh-TW", title: "跌倒評估", "container-title": "老人護理學", page: "120-135", publisher: "永大", issued: { "date-parts": [[2022]] },
			author: [{ literal: "吳淑芬" }], editor: [{ literal: "林麗嬋" }] },
		data: { itemType: "bookSection", title: "跌倒評估", publication: "老人護理學", pages: "120-135", publisher: "永大", year: "2022",
			creators: [{ name: "吳淑芬", creatorType: "author" }, { name: "林麗嬋", creatorType: "editor" }] },
	},
	{
		csl: { id: "thesis", type: "thesis", language: "zh-TW", title: "住院病人跌倒危險因子之探討", genre: "碩士論文", publisher: "國防醫學院", issued: { "date-parts": [[2020]] }, author: [{ literal: "黃小玉" }] },
		data: { itemType: "thesis", title: "住院病人跌倒危險因子之探討", thesisType: "碩士論文", publisher: "國防醫學院", year: "2020", creators: [{ name: "黃小玉", creatorType: "author" }] },
	},
	{
		csl: { id: "thesis-online", type: "thesis", language: "zh-TW", title: "居家長者跌倒恐懼", genre: "博士論文", publisher: "國立臺灣大學", URL: "https://repository.ntu.edu.tw/x",
			issued: { "date-parts": [[2018]] }, author: [{ literal: "蔡宜芳" }] },
		data: { itemType: "thesis", title: "居家長者跌倒恐懼", thesisType: "博士論文", publisher: "國立臺灣大學", url: "https://repository.ntu.edu.tw/x", year: "2018",
			creators: [{ name: "蔡宜芳", creatorType: "author" }] },
	},
	{
		csl: { id: "web", type: "webpage", language: "zh-TW", title: "跌倒防制指引", "container-title": "衛生福利部", URL: "https://www.hpa.gov.tw/x", issued: { "date-parts": [[2024]] },
			author: [{ literal: "國民健康署" }] },
		data: { itemType: "webpage", title: "跌倒防制指引", publication: "衛生福利部", url: "https://www.hpa.gov.tw/x", year: "2024", creators: [{ name: "國民健康署", creatorType: "author" }] },
	},
];

const EN = [
	{ id: "en-journal", type: "article-journal", language: "en", title: "Exercise and falls in hospital: A randomized trial", "container-title": "Journal of Fall Research", volume: "12", issue: "3",
		page: "100-110", DOI: "10.1000/jfr.2021.1", issued: { "date-parts": [[2021]] }, author: [{ family: "Lee", given: "Anna" }, { family: "Smith", given: "John" }, { family: "Brown", given: "Kate" }] },
	{ id: "en-book", type: "book", title: "Nursing research methods", publisher: "Elsevier", issued: { "date-parts": [[2019]] }, author: [{ family: "Adams", given: "Ruth" }] },
];

const ITEMS = [...ZH.map(x => x.csl), ...EN];

test("the two styles: our ids and titles, CSL-M Chinese layouts on top of the official APA 7, the same file in the plugin and on the site", () => {
	assert.deepEqual(W.STYLES.map(s => s.punctuation), ["thesis", "twna"]);
	for (let s of W.STYLES) {
		let xml = fs.readFileSync(path.join(ROOT, "content", "styles", s.file), "utf8");
		assert.equal(xml, fs.readFileSync(path.join(ROOT, "site", "styles", s.file), "utf8"), `${s.file}: the site copy matches`);
		let info = W.styleInfo(xml);
		assert.equal(info.id, s.id);
		assert.equal(info.title, s.title);
		assert.match(info.updated, /^\d{4}-\d{2}-\d{2}T/);
		assert.match(xml, /default-locale="en-US" default-locale-sort="zh-TW"/);
		assert.match(xml, /<layout delimiter="; " locale="zh" prefix="\(" suffix="\)">/);
		assert.match(xml, /<layout locale="zh">\n\s*<text macro="zh-bibliography"\/>/);
		assert.match(xml, /<link href="http:\/\/www.zotero.org\/styles\/apa" rel="template"\/>/);
		assert.match(xml, /creativecommons.org\/licenses\/by-sa\/3.0/, "the official style's licence stays");
		assert.doesNotMatch(xml.match(/<info>[\s\S]*<\/info>/)[0].match(/href="[^"]*"/g).join(" "), /[^\x20-\x7e]/, "ASCII links (the CSL schema's anyURI)");
	}
	assert.equal(W.preferred("twna").file, "apa-7-zh-tw-twna.csl");
	assert.equal(W.preferred("whatever").file, "apa-7-zh-tw.csl");
	assert.equal(W.isNewer("2026-10-14T00:00:00+00:00", "2026-10-01T00:00:00+00:00"), true);
	assert.equal(W.isNewer("2026-10-14T00:00:00+00:00", "2026-10-14T00:00:00+00:00"), false);
	assert.equal(W.isNewer("2026-10-14T00:00:00+00:00", ""), true);
	assert.equal(W.isNewer("", "2026-10-14"), false);
	// Zotero keeps <updated> as "2026-10-14 00:00:00" (Zotero.Style.updated): the same date is not newer
	assert.equal(W.isNewer("2026-10-14T00:00:00+00:00", "2026-10-14 00:00:00"), false);
	assert.equal(W.isNewer("2026-10-15T00:00:00+00:00", "2026-10-14 00:00:00"), true);
});

for (let [file, style] of [["apa-7-zh-tw.csl", "thesis"], ["apa-7-zh-tw-twna.csl", "twna"]]) {
	test(`${file}: every Chinese reference reads exactly as apa-zh.js writes it (${style})`, () => {
		let e = engine(file, "en-US", ITEMS);
		let bib = bibliography(e);
		for (let { csl, data } of ZH) {
			let expected = apaZh.formatReference(data, { format: "text", style, enabled: true });
			assert.ok(bib.includes(expected), `${csl.id}:\n  expected ${expected}\n  in ${JSON.stringify(bib, null, 1)}`);
		}
	});
}

test("in-text citations: (陳美玲、林小華，2023), (王大明等，2021), page locators as 頁; English as the official style; mixed clusters", () => {
	let e = engine("apa-7-zh-tw.csl", "en-US", ITEMS);
	for (let { csl, data } of ZH) assert.equal(cite(e, csl.id), `(${apaZh.shortCitation(data)})`, csl.id);
	assert.equal(cite(e, "journal", { locator: "5", label: "page" }), "(陳美玲、林小華，2023，頁 5)");
	assert.equal(cite(e, "en-journal"), "(Lee et al., 2021)");
	assert.equal(cite(e, "en-journal", { locator: "5", label: "page" }), "(Lee et al., 2021, p. 5)");
	assert.equal(e.makeCitationCluster([{ id: "en-book" }, { id: "three" }]), "(王大明等，2021; Adams, 2019)");
});

test("the reference list: Chinese first by stroke count, then English alphabetically as the official APA 7 writes it; italics in HTML", () => {
	let e = engine("apa-7-zh-tw.csl", "en-US", ITEMS);
	let bib = bibliography(e);
	assert.deepEqual(bib.map(b => b.split(/[（(]/)[0].split("、")[0]), ["王大明", "吳淑芬", "李玉嬋", "國民健康署", "陳可欣", "陳美玲", "黃小玉", "蔡宜芳", "Adams, R. ", "Lee, A., Smith, J., & Brown, K. "]);
	assert.equal(bib[9], "Lee, A., Smith, J., & Brown, K. (2021). Exercise and falls in hospital: A randomized trial. Journal of Fall Research, 12(3), 100–110. https://doi.org/10.1000/jfr.2021.1");
	e.setOutputFormat("html");
	let html = e.makeBibliography()[1].join("");
	assert.match(html, /陳美玲、林小華（2023）。護理師主導運動對住院長者跌倒之成效。<i>護理雜誌，70<\/i>\(2\)，45–56。/);
	assert.match(html, /李玉嬋（2020）。<i>護理研究概論<\/i>（第3版）。華杏。/);
	assert.match(html, /黃小玉（2020）。<i>住院病人跌倒危險因子之探討<\/i>〔未出版之碩士論文〕。國防醫學院。/);
	assert.match(html, /<i>Nursing research methods<\/i>/);
});

test("a Word document set to Chinese: English items still in English (the style's default-locale wins over the document language)", () => {
	let e = engine("apa-7-zh-tw.csl", "zh-TW", ITEMS);
	assert.equal(cite(e, "en-journal"), "(Lee et al., 2021)");
	assert.ok(bibliography(e).includes("Lee, A., Smith, J., & Brown, K. (2021). Exercise and falls in hospital: A randomized trial. Journal of Fall Research, 12(3), 100–110. https://doi.org/10.1000/jfr.2021.1"));
	assert.equal(cite(e, "three"), "(王大明等，2021)");
});

test("a Chinese item without the zh language falls back to the English rules (why 中文文獻補強 sets zh-TW)", () => {
	let item = Object.assign({}, ZH[0].csl, { id: "nolang", language: "" });
	let e = engine("apa-7-zh-tw.csl", "en-US", [item]);
	assert.doesNotMatch(cite(e, "nolang"), /，/);
	assert.doesNotMatch(bibliography(e)[0], /（2023）/);
});

test("describe: what was installed and what to pick in Word; failures say where to download the file", () => {
	let ok = [{ title: W.STYLES[0].title, status: "installed" }, { title: W.STYLES[1].title, status: "updated" }];
	assert.equal(W.describe(ok, "thesis"), "已安裝：「APA 7 中英混排（臺灣，ZotMax）」、「APA 7 中英混排（臺灣護理學會，ZotMax）」。到 Word 的 Zotero 分頁 → Document Preferences 選「APA 7 中英混排（臺灣，ZotMax）」，再按 Refresh。");
	assert.match(W.describe(ok.map(r => Object.assign({}, r, { status: "current" })), "twna"), /^已是最新版：.*選「APA 7 中英混排（臺灣護理學會，ZotMax）」/);
	assert.match(W.describe([{ title: "a", status: "failed", error: "boom" }, { title: "b", status: "failed", error: "boom" }]), /^安裝失敗：boom。可以改從 ZotMax 網站下載/);
	assert.match(W.describe([ok[0], { title: "b", status: "failed", error: "boom" }]), /（b 沒裝成：boom）$/);
	assert.equal(W.describe([]), "");
});
