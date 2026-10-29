// 中文文獻補強 (content/zh-meta.js), the pure part: the helpers (pages, 民國 years, DOI, creators, language,
// thesis), analyze() on records as Airiti, NDLTD and journal sites deliver them, and that correct Chinese
// items and English items produce nothing; applyChanges() and the default picks.
const test = require("node:test");
const assert = require("node:assert/strict");
const Z = require("../content/zh-meta.js");

const plain = v => JSON.parse(JSON.stringify(v));
const ids = findings => findings.map(f => f.id);
const byID = (findings, id) => findings.find(f => f.id === id);

// A Chinese journal article with nothing to fix (two-field and single-field names both fine)
function clean(over = {}) {
	return Object.assign({
		itemType: "journalArticle",
		title: "護理人員跌倒預防衛教之成效",
		creators: [
			{ lastName: "陳", firstName: "美玲", creatorType: "author" },
			{ name: "林小華", creatorType: "author" },
			{ lastName: "歐陽志明", firstName: "", creatorType: "author" },
		],
		date: "2023-04",
		publicationTitle: "護理雜誌",
		volume: "70",
		issue: "2",
		pages: "45-56",
		DOI: "10.6224/JN.202304_70(2).07",
		url: "https://www.airitilibrary.com/Article/Detail/10256546-202304-202304240012-202304240012-45-56",
		extra: "",
		language: "zh-TW",
		libraryCatalog: "Airiti Library",
	}, over);
}

// ---------- helpers ----------

test("normalizePages: full-width digits, 頁, p./pp., ~ and 至 become a plain range; anything else is left alone", () => {
	const cases = [
		["４５－５６頁", "45-56"], ["45~56", "45-56"], ["45～56", "45-56"], ["45〜56", "45-56"], ["p. 45-56", "45-56"], ["pp.45–56", "45-56"],
		["頁45-56", "45-56"], ["頁碼：45-56", "45-56"], ["第45至56頁", "45-56"], ["45 - 56", "45-56"], ["45—56", "45-56"], ["１２３", "123"],
		["e123", "e123"], ["S12-S20", "S12-S20"], ["45-56，60", "45-56, 60"], ["45-56", "45-56"],
	];
	for (let [raw, want] of cases) assert.equal(Z.normalizePages(raw), want, raw);
	for (let raw of ["", "   ", "補遺", "45-56 (附錄)", "第三章"]) assert.equal(Z.normalizePages(raw), null, raw);
});

test("volume and issue: written together, with 卷／期, Vol./No., parentheses or full-width digits", () => {
	assert.deepEqual(plain(Z.splitVolume("70(2)")), { volume: "70", issue: "2" });
	assert.deepEqual(plain(Z.splitVolume("70（2）")), { volume: "70", issue: "2" });
	assert.deepEqual(plain(Z.splitVolume("７０（２）")), { volume: "70", issue: "2" });
	assert.deepEqual(plain(Z.splitVolume("第70卷第2期")), { volume: "70", issue: "2" });
	assert.deepEqual(plain(Z.splitVolume("70卷2期")), { volume: "70", issue: "2" });
	assert.deepEqual(plain(Z.splitVolume("Vol. 70, No. 2")), { volume: "70", issue: "2" });
	assert.deepEqual(plain(Z.splitVolume("41(3-4)")), { volume: "41", issue: "3-4" });
	for (let raw of ["70", "", "70-71", "增刊"]) assert.equal(Z.splitVolume(raw), null, raw);
	assert.equal(Z.cleanVolume("第70卷"), "70");
	assert.equal(Z.cleanVolume("７０"), "70");
	assert.equal(Z.cleanVolume("Vol. 70"), "70");
	assert.equal(Z.cleanVolume("增刊"), null);
	assert.equal(Z.cleanIssue("第2期"), "2");
	assert.equal(Z.cleanIssue("No. 2"), "2");
	assert.equal(Z.cleanIssue("(2)"), "2");
	assert.equal(Z.cleanIssue("２"), "2");
	assert.equal(Z.cleanIssue("3-4"), "3-4");
	assert.equal(Z.cleanIssue("春季號"), null);
});

test("rocYear: 民國 years with 年 are sure; bare numbers with separators need a check; Western years are not ROC", () => {
	assert.deepEqual(plain(Z.rocYear("民國112年")), { year: 2023, date: "2023", sure: true });
	assert.deepEqual(plain(Z.rocYear("中華民國112年4月1日")), { year: 2023, date: "2023-04-01", sure: true });
	assert.deepEqual(plain(Z.rocYear("112年4月")), { year: 2023, date: "2023-04", sure: true });
	assert.deepEqual(plain(Z.rocYear("１１２年")), { year: 2023, date: "2023", sure: true });
	assert.deepEqual(plain(Z.rocYear("民國 99 年")), { year: 2010, date: "2010", sure: true });
	assert.deepEqual(plain(Z.rocYear("112/04/01")), { year: 2023, date: "2023-04-01", sure: false });
	assert.deepEqual(plain(Z.rocYear("112.04")), { year: 2023, date: "2023-04", sure: false });
	assert.deepEqual(plain(Z.rocYear("112")), { year: 2023, date: "2023", sure: false });
	assert.deepEqual(plain(Z.rocYear("99.04")), { year: 2010, date: "2010-04", sure: false });
	for (let raw of ["2023", "2023年4月", "112年13月", "112年4月32日", "", "April 2023", "1999-01", "23", "2023/04/01"]) assert.equal(Z.rocYear(raw), null, raw);
});

test("normalizeDOI: prefixes, trailing punctuation and full-width characters go; airiti parentheses stay", () => {
	const airiti = "10.6224/JN.202304_70(2).07";
	for (let raw of [airiti, `https://doi.org/${airiti}`, `http://dx.doi.org/${airiti}`, `doi:${airiti}`, `DOI: ${airiti}`, `${airiti}.`, `${airiti}。`,
		` ${airiti} `, "https://doi.org/10.6224%2FJN.202304_70%282%29.07"]) {
		assert.equal(Z.normalizeDOI(raw), airiti, raw);
	}
	assert.equal(Z.normalizeDOI("１０.３９６６/１６０７８１５７２０２２０６３３０３００５"), "10.3966/160781572022063303005");
	assert.equal(Z.normalizeDOI("10.1000/xyz)"), "10.1000/xyz", "an unmatched closing parenthesis");
	assert.equal(Z.normalizeDOI("10.1000/abc(1)"), "10.1000/abc(1)", "a matched one stays");
	for (let raw of ["", "not a doi", "10.6224", "https://www.airitilibrary.com/Article/Detail?DocID=123"]) assert.equal(Z.normalizeDOI(raw), "", raw);
});

test("detectDOI: a DOI line in Extra, or a doi.org / …/doi/… / ?doi= URL; nothing in ordinary URLs", () => {
	assert.deepEqual(plain(Z.detectDOI({ extra: "原始出處：護理雜誌\nDOI: 10.6224/JN.202304_70(2).07" })),
		{ doi: "10.6224/JN.202304_70(2).07", source: "extra", line: "DOI: 10.6224/JN.202304_70(2).07" });
	assert.deepEqual(plain(Z.detectDOI({ extra: "doi：10.3966/160781572022063303005" })).doi, "10.3966/160781572022063303005");
	assert.deepEqual(plain(Z.detectDOI({ url: "https://doi.org/10.3966/160781572022063303005" })),
		{ doi: "10.3966/160781572022063303005", source: "url", line: "" });
	assert.equal(Z.detectDOI({ url: "https://www.example.org/doi/full/10.1111/jan.12345?x=1" }).doi, "10.1111/jan.12345");
	assert.equal(Z.detectDOI({ url: "https://www.airitilibrary.com/Article/Detail?doi=10.6224%2FJN.202304_70%282%29.07" }).doi, "10.6224/JN.202304_70(2).07");
	assert.equal(Z.detectDOI({ url: "https://www.airitilibrary.com/Article/Detail/10256546-202304", extra: "CNKI: 123" }), null);
	assert.equal(Z.detectDOI({}), null);
});

test("guessLanguage by script and zhVariant by traditional/simplified characters", () => {
	assert.equal(Z.guessLanguage("護理人員跌倒預防衛教之成效"), "zh");
	assert.equal(Z.guessLanguage("COVID-19 疫情下護理人員之工作壓力"), "zh", "English terms in a Chinese title");
	assert.equal(Z.guessLanguage("以 Orem 自我照顧理論照護一位糖尿病個案之護理經驗"), "zh");
	assert.equal(Z.guessLanguage("Effects of nurse-led education on fall prevention"), "en");
	assert.equal(Z.guessLanguage("Fall prevention in 台灣 hospitals: a national survey of nurses"), "en");
	assert.equal(Z.guessLanguage("看護師の転倒予防"), "ja");
	assert.equal(Z.guessLanguage("간호사의 낙상 예방"), "ko");
	assert.equal(Z.guessLanguage("2023"), "");
	assert.equal(Z.zhVariant("護理人員跌倒預防衛教之成效"), "TW");
	assert.equal(Z.zhVariant("护理人员跌倒预防卫教之成效"), "CN");
	assert.equal(Z.zhVariant("老人"), "");
});

test("guessThesis: the NDLTD URL or catalog, or 碩士論文 in the journal/publisher/Extra; not an article about theses", () => {
	assert.deepEqual(plain(Z.guessThesis({ url: "https://hdl.handle.net/11296/abc123", title: "題目" })), { degree: "", reason: "網址是臺灣博碩士論文知識加值系統" });
	assert.equal(Z.guessThesis({ url: "https://ndltd.ncl.edu.tw/cgi-bin/gs32/gsweb.cgi?o=dnclcdr" }).reason, "網址是臺灣博碩士論文知識加值系統");
	assert.equal(Z.guessThesis({ libraryCatalog: "臺灣博碩士論文知識加值系統" }).reason, "來源是臺灣博碩士論文知識加值系統");
	assert.deepEqual(plain(Z.guessThesis({ publicationTitle: "國立臺灣大學護理學研究所碩士論文" })), { degree: "碩士論文", reason: "資料裡寫著「碩士論文」" });
	assert.equal(Z.guessThesis({ publisher: "國防醫學院", extra: "博士論文" }).degree, "博士論文");
	assert.equal(Z.guessThesis({ title: "護理研究所碩士論文主題之分析", publicationTitle: "護理雜誌" }), null);
	assert.equal(Z.guessThesis({ publicationTitle: "護理雜誌", url: "https://www.airitilibrary.com/Article/Detail/1" }), null);
	assert.equal(Z.degreeOf({ title: "某某之研究（碩士論文）" }), "碩士論文");
});

test("splitCreators: 、；， are sure, spaces only between whole names and need a check; one name stays one", () => {
	assert.deepEqual(plain(Z.splitCreators("陳美玲、林小華")), { names: ["陳美玲", "林小華"], sure: true });
	assert.deepEqual(plain(Z.splitCreators("陳美玲;林小華；歐陽志明")), { names: ["陳美玲", "林小華", "歐陽志明"], sure: true });
	assert.deepEqual(plain(Z.splitCreators("陳美玲，林小華")), { names: ["陳美玲", "林小華"], sure: true });
	assert.deepEqual(plain(Z.splitCreators("陳 美玲、林 小華")), { names: ["陳美玲", "林小華"], sure: true });
	assert.deepEqual(plain(Z.splitCreators("陳美玲 林小華")), { names: ["陳美玲", "林小華"], sure: false });
	for (let raw of ["陳 美玲", "歐陽 志明", "陳美玲", "Chen, Mei-Ling", "Chen, M.; Lin, H.", "陳美玲、Smith", ""]) assert.equal(Z.splitCreators(raw), null, raw);
});

test("analyzeCreator: correct splits are left alone; swapped, spaced, packed, compound and mixed names are found", () => {
	let none = [
		{ lastName: "陳", firstName: "美玲" }, { name: "陳美玲" }, { lastName: "陳美玲", firstName: "" }, { lastName: "歐陽", firstName: "志明" },
		{ name: "歐陽志明" }, { lastName: "張簡", firstName: "美玲" }, { lastName: "Chen", firstName: "Mei-Ling" }, { name: "World Health Organization" },
		{ lastName: "陳", firstName: "林" }, { name: "衛生福利部" }, { name: "衛生福利部 國民健康署" }, { name: "臺北榮民總醫院護理部" },
	];
	for (let c of none) assert.equal(Z.analyzeCreator(Object.assign({ creatorType: "author" }, c), 0), null, JSON.stringify(c));

	let f = Z.analyzeCreator({ firstName: "陳", lastName: "美玲", creatorType: "author" }, 1);
	assert.equal(f.id, "creators-1");
	assert.equal(f.confidence, "sure");
	assert.equal(f.problem, "姓和名前後顛倒");
	assert.deepEqual(plain(f.changes), { creator: { index: 1, replacement: [{ lastName: "陳", firstName: "美玲", creatorType: "author" }] } });
	assert.equal(f.current, "姓「美玲」名「陳」");
	assert.equal(f.suggested, "姓「陳」名「美玲」");

	f = Z.analyzeCreator({ name: "陳 美玲", creatorType: "author" }, 0);
	assert.equal(f.confidence, "sure");
	assert.deepEqual(plain(f.changes.creator.replacement), [{ name: "陳美玲", creatorType: "author" }]);
	f = Z.analyzeCreator({ lastName: "陳　", firstName: " 美玲", creatorType: "editor" }, 0);
	assert.equal(f.confidence, "sure");
	assert.deepEqual(plain(f.changes.creator.replacement), [{ lastName: "陳", firstName: "美玲", creatorType: "editor" }]);

	f = Z.analyzeCreator({ name: "陳美玲、林小華", creatorType: "author" }, 0);
	assert.equal(f.confidence, "sure");
	assert.equal(f.problem, "2 位作者擠在同一個欄位");
	assert.deepEqual(plain(f.changes.creator.replacement), [{ name: "陳美玲", creatorType: "author" }, { name: "林小華", creatorType: "author" }]);
	assert.equal(f.suggested, "「陳美玲」（單一欄位）、「林小華」（單一欄位）");
	f = Z.analyzeCreator({ lastName: "陳美玲；林小華；歐陽志明", firstName: "", creatorType: "author" }, 2);
	assert.equal(f.changes.creator.replacement.length, 3);
	assert.equal(Z.analyzeCreator({ name: "陳美玲 林小華", creatorType: "author" }, 0).confidence, "check");

	// Which part is the surname: the user decides
	f = Z.analyzeCreator({ lastName: "歐", firstName: "陽志明", creatorType: "author" }, 2);
	assert.equal(f.confidence, "check");
	assert.equal(f.problem, "複姓可能被拆錯");
	assert.deepEqual(plain(f.changes.creator.replacement), [{ lastName: "歐陽", firstName: "志明", creatorType: "author" }]);
	assert.match(f.hint, /也可能姓「歐」名「陽志明」/);
	f = Z.analyzeCreator({ firstName: "陳", lastName: "林華", creatorType: "author" }, 0);
	assert.equal(f.confidence, "check");
	assert.equal(f.problem, "姓和名可能前後顛倒");
	f = Z.analyzeCreator({ lastName: "陳美玲", firstName: "林小華", creatorType: "author" }, 0);
	assert.equal(f.confidence, "check");
	assert.equal(f.changes.creator.replacement.length, 2);

	// Chinese and pinyin together: keep the Chinese name, but ask
	for (let c of [{ name: "陳美玲(Chen, Mei-Ling)" }, { name: "陳美玲 Chen Mei-Ling" }, { lastName: "陳美玲 Chen", firstName: "Mei-Ling" }, { lastName: "Chen", firstName: "Mei-Ling 陳美玲" }]) {
		f = Z.analyzeCreator(Object.assign({ creatorType: "author" }, c), 0);
		assert.equal(f.confidence, "check", JSON.stringify(c));
		assert.deepEqual(plain(f.changes.creator.replacement), [{ name: "陳美玲", creatorType: "author" }], JSON.stringify(c));
	}
});

// ---------- analyze ----------

test("correct Chinese items produce no findings (journal article with en dash, single and two-field names, thesis, book)", () => {
	assert.deepEqual(Z.analyze(clean()), []);
	assert.deepEqual(Z.analyze(clean({ pages: "45–56", date: "2023年4月", language: "zh-TW" })), []);
	assert.deepEqual(Z.analyze(clean({ pages: "e1023", issue: "", language: "zh-Hant-TW" })), []);
	assert.deepEqual(Z.analyze(clean({ DOI: "", url: "", language: "zh-CN", title: "护理人员跌倒预防卫教之成效" })), []);
	assert.deepEqual(Z.analyze({
		itemType: "thesis", title: "加護病房護理人員之睡眠品質", creators: [{ name: "王大明", creatorType: "author" }], date: "2020",
		publisher: "國防醫學院護理研究所", thesisType: "碩士論文", url: "https://hdl.handle.net/11296/abc", language: "zh-TW", extra: "",
	}), []);
	assert.deepEqual(Z.analyze({
		itemType: "book", title: "護理研究概論", creators: [{ lastName: "王", firstName: "大明", creatorType: "author" }], date: "2019",
		publisher: "華杏", language: "zh-TW",
	}), []);
	// A subtitle with 「：」 and a question mark are fine
	assert.deepEqual(Z.analyze(clean({ title: "護理人員跌倒預防衛教之成效：以某醫學中心為例？" })), []);
});

test("English items are never touched, even when their fields look messy; only a zh language is a check (the Word style would use Chinese rules)", () => {
	let english = {
		itemType: "journalArticle", title: "Effects of nurse-led education on fall prevention: a randomized controlled trial.",
		creators: [{ lastName: "Chen", firstName: "Mei-Ling", creatorType: "author" }, { name: "陳美玲、林小華", creatorType: "author" }],
		date: "民國112年", publicationTitle: "《Journal of Nursing》", volume: "70(2)", issue: "", pages: "４５－５６頁",
		DOI: "https://doi.org/10.1111/jan.12345.", extra: "DOI: 10.1111/jan.12345", language: "zh",
	};
	assert.equal(Z.isChinese(english), false);
	let found = Z.analyze(english);
	assert.equal(found.length, 1, "nothing but the language");
	assert.deepEqual([found[0].field, found[0].problem, found[0].confidence, found[0].current, found[0].suggested], ["language", "英文文獻的語言寫成中文", "check", "zh", "en"]);
	assert.deepEqual(found[0].changes, { fields: { language: "en" } });
	assert.match(found[0].hint, /APA 7 中英混排/);
	assert.equal(Z.analyze(Object.assign({}, english, { language: "zh-TW" })).length, 1);
	assert.deepEqual(Z.analyze(Object.assign({}, english, { language: "en" })), []);
	assert.deepEqual(Z.analyze({ itemType: "journalArticle", title: "Fall prevention", language: "" }), []);
	assert.deepEqual(Z.analyze({ itemType: "journalArticle", title: "看護師の転倒予防に関する研究", language: "" }), [], "Japanese");
	assert.deepEqual(Z.analyze(null), []);
});

test("the messy Airiti record: every problem found, sure ones with a mechanical fix, nothing invented", () => {
	let data = clean({
		creators: [{ name: "陳美玲、林小華", creatorType: "author" }, { lastName: "歐", firstName: "陽志明", creatorType: "author" }],
		date: "民國112年", volume: "70(2)", issue: "", pages: "４５－５６頁", DOI: "", extra: "DOI: 10.6224/JN.202304_70(2).07", language: "",
	});
	let findings = Z.analyze(data);
	assert.deepEqual(ids(findings), ["creators-0", "creators-1", "date", "volume", "pages", "DOI", "language"]);
	let conf = Object.fromEntries(findings.map(f => [f.id, f.confidence]));
	assert.deepEqual(conf, { "creators-0": "sure", "creators-1": "check", date: "sure", volume: "sure", pages: "sure", DOI: "sure", language: "sure" });
	assert.deepEqual(plain(byID(findings, "date").changes), { fields: { date: "2023" } });
	assert.deepEqual(plain(byID(findings, "volume").changes), { fields: { volume: "70", issue: "2" } });
	assert.deepEqual(plain(byID(findings, "pages").changes), { fields: { pages: "45-56" } });
	assert.deepEqual(plain(byID(findings, "DOI").changes), { fields: { DOI: "10.6224/JN.202304_70(2).07", extra: "" } });
	assert.deepEqual(plain(byID(findings, "language").changes), { fields: { language: "zh-TW" } });
	for (let f of findings) {
		assert.ok(f.label && f.problem && f.hint, f.id);
		assert.ok(["sure", "check"].includes(f.confidence), f.id);
		if (f.changes) assert.ok(String(f.suggested).trim(), `${f.id}: a fix always shows what it writes`);
	}
	// Applying everything
	let out = Z.applyChanges(data, findings);
	assert.equal(out.itemType, null);
	assert.deepEqual(plain(out.fields), { date: "2023", volume: "70", issue: "2", pages: "45-56", DOI: "10.6224/JN.202304_70(2).07", extra: "", language: "zh-TW" });
	assert.deepEqual(plain(out.creators), [
		{ name: "陳美玲", creatorType: "author" }, { name: "林小華", creatorType: "author" }, { lastName: "歐陽", firstName: "志明", creatorType: "author" },
	]);
	// Applying only the sure ones: the compound surname stays as it was
	out = Z.applyChanges(data, findings.filter(f => f.confidence === "sure"));
	assert.deepEqual(plain(out.creators[2]), { lastName: "歐", firstName: "陽志明", creatorType: "author" });
	// The fixed record has nothing left but the compound surname (a question only the user can answer)
	let fixed = Object.assign({}, data, out.fields, { creators: out.creators });
	assert.deepEqual(ids(Z.analyze(fixed)), ["creators-2"]);
});

test("missing volume, pages, year: reported with where to look, never filled in", () => {
	let findings = Z.analyze(clean({ volume: "", issue: "", pages: "", date: "" }));
	assert.deepEqual(ids(findings), ["date-missing", "volume-missing"]);
	let vol = byID(findings, "volume-missing");
	assert.equal(vol.problem, "缺卷期頁");
	assert.equal(vol.current, "沒有卷數、頁碼");
	assert.equal(vol.suggested, "");
	assert.equal(vol.changes, null);
	assert.equal(vol.confidence, "check");
	assert.match(vol.hint, /不連網查詢/);
	assert.match(vol.hint, /華藝/);
	let date = byID(findings, "date-missing");
	assert.equal(date.problem, "缺年份");
	assert.equal(date.changes, null);
	// Only the pages missing
	assert.equal(byID(Z.analyze(clean({ pages: "" })), "volume-missing").current, "沒有頁碼");
	// An issue alone may be missing (some journals have none)
	assert.deepEqual(Z.analyze(clean({ issue: "" })), []);
	// A date with no Western year in it
	let odd = byID(Z.analyze(clean({ date: "春季" })), "date-missing");
	assert.equal(odd.problem, "日期裡找不到西元年");
	assert.equal(odd.changes, null);
	// Full-width digits
	assert.deepEqual(plain(byID(Z.analyze(clean({ date: "２０２３年４月" })), "date").changes), { fields: { date: "2023年4月" } });
	// A date that might be 民國 without 年: a check
	assert.equal(byID(Z.analyze(clean({ date: "112/04/01" })), "date").confidence, "check");
});

test("volume and issue: 卷期 words and full-width digits are sure; a clash with the issue field is a check", () => {
	assert.deepEqual(plain(byID(Z.analyze(clean({ volume: "第70卷", issue: "第2期" })), "volume").changes), { fields: { volume: "70", issue: "2" } });
	assert.deepEqual(plain(byID(Z.analyze(clean({ volume: "７０" })), "volume").changes), { fields: { volume: "70" } });
	let clash = byID(Z.analyze(clean({ volume: "70(2)", issue: "3" })), "volume");
	assert.equal(clash.confidence, "check");
	assert.match(clash.hint, /請看原文是哪一期/);
	assert.equal(byID(Z.analyze(clean({ volume: "70(2)", issue: "2" })), "volume").confidence, "sure", "the same issue twice is no clash");
	// Text that is no number is left to the user
	assert.deepEqual(Z.analyze(clean({ volume: "增刊" })), []);
});

test("DOI: prefix and trailing period fixed, moved out of the URL or Extra, a broken one reported; types without the field are left alone", () => {
	let f = byID(Z.analyze(clean({ DOI: "https://doi.org/10.6224/JN.202304_70(2).07." })), "DOI");
	assert.equal(f.confidence, "sure");
	assert.equal(f.problem, "DOI 前面多了網址或「doi:」");
	assert.equal(f.suggested, "10.6224/JN.202304_70(2).07");
	f = byID(Z.analyze(clean({ DOI: "", url: "https://doi.org/10.3966/160781572022063303005" })), "DOI");
	assert.equal(f.problem, "DOI 只在網址裡");
	assert.deepEqual(plain(f.changes), { fields: { DOI: "10.3966/160781572022063303005" } }, "the URL stays");
	f = byID(Z.analyze(clean({ DOI: "", extra: "原始出處：護理雜誌\nDOI: 10.6224/JN.202304_70(2).07\n頁數：12" })), "DOI");
	assert.deepEqual(plain(f.changes), { fields: { DOI: "10.6224/JN.202304_70(2).07", extra: "原始出處：護理雜誌\n頁數：12" } });
	f = byID(Z.analyze(clean({ DOI: "10.6224" })), "DOI-bad");
	assert.equal(f.changes, null);
	// No DOI anywhere: nothing to say (many Chinese articles have none)
	assert.deepEqual(Z.analyze(clean({ DOI: "", url: "" })), []);
	// The item type has no DOI field: Extra is where Zotero keeps it, apa-zh reads it there
	assert.deepEqual(Z.analyze(clean({ DOI: "", extra: "DOI: 10.6224/JN.1" }), { hasField: (t, f) => f !== "DOI" }), []);
});

test("language: empty, zh, Chinese, 中文 and zh_TW become zh-TW; simplified text and other languages are a check", () => {
	let lang = (language, over = {}) => byID(Z.analyze(clean(Object.assign({ language }, over))), "language");
	for (let raw of ["", "zh", "ZH", "Chinese", "chi", "中文", "華語", "繁體中文"]) {
		let f = lang(raw);
		assert.equal(f.suggested, "zh-TW", raw);
		assert.equal(f.confidence, "sure", raw);
	}
	assert.equal(lang("zh_TW").problem, "語言代碼寫法不標準");
	assert.equal(lang("zh-tw").suggested, "zh-TW");
	assert.equal(lang("zh_cn").suggested, "zh-CN");
	assert.equal(lang("简体中文").suggested, "zh-CN");
	for (let ok of ["zh-TW", "zh-CN", "zh-HK", "zh-Hant", "zh-Hant-TW", "zh-Hans"]) assert.equal(lang(ok), undefined, ok);
	let simp = lang("", { title: "护理人员跌倒预防卫教之成效" });
	assert.deepEqual([simp.suggested, simp.confidence], ["zh-CN", "check"]);
	let neutral = lang("", { title: "老人", publicationTitle: "長期照顧" });
	assert.deepEqual([neutral.suggested, neutral.confidence], ["zh-TW", "sure"], "長 is traditional");
	let unknown = lang("", { title: "老人", publicationTitle: "", creators: [] });
	assert.deepEqual([unknown.suggested, unknown.confidence], ["zh-TW", "check"], "nothing tells traditional from simplified");
	let english = lang("en");
	assert.deepEqual([english.suggested, english.confidence, english.problem], ["zh-TW", "check", "語言欄和篇名的語言不一致"]);
});

test("titles and journal names: mechanical tidying is sure, cutting English or replacing spaces is a check", () => {
	let f = byID(Z.analyze(clean({ title: "　護理人員跌倒預防衛教之成效。 " })), "title");
	assert.equal(f.confidence, "sure");
	assert.equal(f.suggested, "護理人員跌倒預防衛教之成效");
	assert.match(f.problem, /空白/);
	assert.match(f.problem, /句點/);
	assert.equal(byID(Z.analyze(clean({ title: "護理人員跌倒預防:以某醫學中心為例" })), "title").suggested, "護理人員跌倒預防：以某醫學中心為例");
	assert.equal(byID(Z.analyze(clean({ title: "護理人員,跌倒預防" })), "title").suggested, "護理人員，跌倒預防");
	let bilingual = Z.analyze(clean({ title: "護理人員跌倒預防衛教之成效 The Effectiveness of Fall Prevention Education for Nurses" }));
	assert.deepEqual(ids(bilingual), ["title-english"]);
	assert.equal(bilingual[0].confidence, "check");
	assert.equal(bilingual[0].suggested, "護理人員跌倒預防衛教之成效");
	assert.doesNotMatch(bilingual[0].hint, /上一項/, "no tidying finding before it");
	let both = Z.analyze(clean({ title: "\u3000護理人員跌倒預防衛教之成效 = The Effectiveness of Fall Prevention" }));
	assert.equal(byID(Z.analyze(clean({ title: "護理人員跌倒預防衛教之成效。The Effectiveness of Fall Prevention" })), "title-english").suggested, "護理人員跌倒預防衛教之成效");
	assert.deepEqual(ids(both), ["title", "title-english"]);
	assert.match(both[1].hint, /一併套用上一項/);
	let spaced = byID(Z.analyze(clean({ title: "護理人員跌倒預防衛教之成效 以某醫學中心為例" })), "title-space");
	assert.equal(spaced.confidence, "check");
	assert.equal(spaced.suggested, "護理人員跌倒預防衛教之成效：以某醫學中心為例");
	// English terms inside a Chinese title are not a translation
	assert.deepEqual(Z.analyze(clean({ title: "以 Orem 自我照顧理論照護一位 COVID-19 個案之護理經驗" })), []);
	assert.deepEqual(Z.analyze(clean({ title: "護理人員對 Evidence-Based Practice 的態度" })), []);

	f = byID(Z.analyze(clean({ publicationTitle: "《護理雜誌》" })), "publicationTitle");
	assert.deepEqual([f.confidence, f.suggested, f.problem], ["sure", "護理雜誌", "期刊名外面加了書名號"]);
	f = byID(Z.analyze(clean({ publicationTitle: "護理雜誌 The Journal of Nursing" })), "publicationTitle-english");
	assert.deepEqual([f.confidence, f.suggested], ["check", "護理雜誌"]);
	assert.equal(byID(Z.analyze(clean({ publicationTitle: "長庚護理=Chang Gung Nursing" })), "publicationTitle-english").suggested, "長庚護理");
	assert.equal(byID(Z.analyze(clean({ publicationTitle: "榮總護理 VGH Nursing" })), "publicationTitle-english").suggested, "榮總護理");
	assert.deepEqual(Z.analyze(clean({ publicationTitle: "Journal of Nursing Research" })), [], "an English journal name on a Chinese article is the user's call");
});

test("a thesis imported as a journal article: a check that also sets the degree; a thesis missing its degree or school", () => {
	let data = {
		itemType: "journalArticle", title: "加護病房護理人員之睡眠品質", creators: [{ name: "王大明", creatorType: "author" }], date: "2020",
		publicationTitle: "國防醫學院護理研究所碩士論文", url: "https://hdl.handle.net/11296/abc123", language: "zh-TW", pages: "1-120", volume: "1",
	};
	let f = byID(Z.analyze(data), "itemType");
	assert.equal(f.confidence, "check");
	assert.equal(f.current, "期刊文章");
	assert.equal(f.suggested, "學位論文（碩士論文）");
	assert.deepEqual(plain(f.changes), { itemType: "thesis", fields: { thesisType: "碩士論文" } });
	assert.match(f.hint, /網址是臺灣博碩士論文知識加值系統/);
	assert.deepEqual(plain(Z.applyChanges(data, [f])), { itemType: "thesis", fields: { thesisType: "碩士論文" }, creators: null });
	assert.equal(ids(Z.analyze(data))[0], "itemType", "first: it changes which fields exist");

	let thesis = { itemType: "thesis", title: "加護病房護理人員之睡眠品質", creators: [{ name: "王大明", creatorType: "author" }], date: "2020", language: "zh-TW" };
	let findings = Z.analyze(thesis);
	assert.deepEqual(ids(findings), ["thesisType", "publisher"]);
	assert.ok(findings.every(x => x.changes === null), "nothing to invent");
	findings = Z.analyze(Object.assign({}, thesis, { extra: "碩士論文", publisher: "國防醫學院" }));
	assert.deepEqual(ids(findings), ["thesisType"]);
	assert.deepEqual(plain(findings[0].changes), { fields: { thesisType: "碩士論文" } });
	assert.equal(findings[0].confidence, "check");
});

test("applyChanges: later findings on a field win, unchanged values drop out, splits keep the other creators in place", () => {
	let data = clean({ title: " 題目 = English Title Here Again", creators: [{ name: "甲", creatorType: "author" }, { name: "陳美玲、林小華", creatorType: "author" }, { name: "王大明", creatorType: "author" }] });
	let findings = Z.analyze(data);
	let out = Z.applyChanges(data, findings);
	assert.equal(out.fields.title, "題目");
	assert.deepEqual(plain(out.creators).map(c => c.name), ["甲", "陳美玲", "林小華", "王大明"]);
	assert.deepEqual(plain(Z.applyChanges(data, [])), { itemType: null, fields: {}, creators: null });
	assert.deepEqual(plain(Z.applyChanges(clean(), [{ changes: { fields: { volume: "70", issue: "3" } } }]).fields), { issue: "3" });
});

test("defaultPicks: only sure fixes start ticked; describePicks counts fixes, items and what the user has to add", () => {
	let plan = { items: [
		{ key: "A", libraryID: 1, findings: Z.analyze(clean({ pages: "45~56", creators: [{ lastName: "歐", firstName: "陽志明", creatorType: "author" }] })) },
		{ key: "B", libraryID: 1, findings: Z.analyze(clean({ date: "民國112年", pages: "" })) },
	] };
	assert.deepEqual(plain(Z.defaultPicks(plan)), [{ libraryID: 1, key: "A", id: "pages" }, { libraryID: 1, key: "B", id: "date" }]);
	assert.equal(Z.describePicks(Z.defaultPicks(plan), 1), "已勾選 2 項修正，會改動 2 篇文獻。另有 1 項資料要你自己補（不會自動填入）。");
	assert.equal(Z.describePicks([], 0), "還沒有勾選任何修正。");
});

// ---------- PubMed records of Chinese-language journals (《護理雜誌》 Hu Li Za Zhi) ----------

// A 《護理雜誌》 article as PubMed delivers it: NLM's English title in [ ], pinyin authors, language chi
function huLi(over = {}) {
	return Object.assign({
		itemType: "journalArticle",
		title: "[Effects of a Nurse-Led Fall Prevention Program in Hospitalized Older Adults].",
		creators: [{ lastName: "Chen", firstName: "Mei-Ling", creatorType: "author" }, { lastName: "Lin", firstName: "Hsiao-Hua", creatorType: "author" }],
		date: "2023-04", publicationTitle: "Hu li za zhi The journal of nursing", journalAbbreviation: "Hu Li Za Zhi", ISSN: "0047-262X",
		volume: "70", issue: "2", pages: "45-56", DOI: "10.6224/JN.202304_70(2).07", extra: "PMID: 37000000", language: "chi",
	}, over);
}

test("pubmedZhJournal / bracketedTitle / pubmedTranslatedTitle: brackets, journal name, abbreviation or ISSN, but only with a Chinese language", () => {
	assert.equal(Z.pubmedZhJournal(huLi()).name, "護理雜誌");
	for (let over of [
		{ publicationTitle: "Hu Li Za Zhi", journalAbbreviation: "", ISSN: "" }, { publicationTitle: "", journalAbbreviation: "Hu Li Za Zhi", ISSN: "" },
		{ publicationTitle: "《護理雜誌》", journalAbbreviation: "", ISSN: "" }, { publicationTitle: "護理雜誌 The Journal of Nursing", journalAbbreviation: "", ISSN: "" },
		{ publicationTitle: "", journalAbbreviation: "", ISSN: "0047262x" }, { publicationTitle: "", journalAbbreviation: "", ISSN: "2224-8986, 0047-262X" },
	]) assert.equal((Z.pubmedZhJournal(huLi(over)) || {}).name, "護理雜誌", JSON.stringify(over));
	for (let over of [
		{ publicationTitle: "Journal of Nursing", journalAbbreviation: "", ISSN: "" }, { publicationTitle: "The Journal of Nursing", journalAbbreviation: "J Nurs", ISSN: "" },
		{ publicationTitle: "長庚護理", journalAbbreviation: "", ISSN: "1015-8383" }, { publicationTitle: "Journal of Advanced Nursing", journalAbbreviation: "J Adv Nurs", ISSN: "0309-2402" },
	]) assert.equal(Z.pubmedZhJournal(huLi(over)), null, JSON.stringify(over));

	assert.equal(Z.bracketedTitle("[Effects of X on Y]."), "Effects of X on Y");
	assert.equal(Z.bracketedTitle(" [Effects of X: a [pilot] study] "), "Effects of X: a [pilot] study");
	assert.equal(Z.bracketedTitle("Effects of X on Y."), null);
	assert.equal(Z.bracketedTitle("[ ]"), null);
	// Two bracketed parts are not one translated title: nothing to strip
	assert.equal(Z.bracketedTitle("[Effects of X] and [Y]"), null);
	assert.equal(Z.bracketedTitle("[Effects of X]] and [[Y]."), null);
	assert.equal(Z.pubmedTranslatedTitle(huLi({ title: "[Effects of X] and [Y]", publicationTitle: "", journalAbbreviation: "", ISSN: "" })), null);
	assert.deepEqual(plain(Z.pubmedTranslatedTitle(huLi({ title: "[Effects of X] and [Y]" }))).english, "[Effects of X] and [Y]", "the journal still tells; the title is kept as it is");

	assert.deepEqual(plain(Z.pubmedTranslatedTitle(huLi())), { journal: plain(Z.PUBMED_ZH_JOURNALS[0]), bracketed: true, english: "Effects of a Nurse-Led Fall Prevention Program in Hospitalized Older Adults" });
	// Brackets alone are enough; so is the journal alone (a translator may have dropped the brackets)
	let bare = { publicationTitle: "Some Journal", journalAbbreviation: "", ISSN: "" };
	assert.equal(Z.pubmedTranslatedTitle(huLi(bare)).bracketed, true);
	let stripped = Z.pubmedTranslatedTitle(huLi({ title: "Effects of a Nurse-Led Fall Prevention Program in Hospitalized Older Adults." }));
	assert.equal(stripped.bracketed, false);
	assert.equal(stripped.english, "Effects of a Nurse-Led Fall Prevention Program in Hospitalized Older Adults");
	// Neither: an ordinary English article
	assert.equal(Z.pubmedTranslatedTitle(huLi(Object.assign({ title: "Effects of a program." }, bare))), null);
	// The language must say Chinese
	for (let language of ["en", "eng", "", "ja"]) assert.equal(Z.pubmedTranslatedTitle(huLi({ language })), null, language);
	for (let language of ["chi", "zh", "zho", "zh-TW", "中文", "Chinese"]) assert.ok(Z.isZhLanguage(language), language);
});

test("a 《護理雜誌》 PubMed record never gets 「en」: one finding asks for the Chinese title and names and keeps the English title in Extra", () => {
	let cases = {
		"brackets, name, abbreviation and ISSN": huLi(),
		"no brackets": huLi({ title: "Effects of a Nurse-Led Fall Prevention Program in Hospitalized Older Adults." }),
		"ISSN only": huLi({ title: "Effects of a Nurse-Led Fall Prevention Program in Hospitalized Older Adults.", publicationTitle: "", journalAbbreviation: "" }),
		"abbreviation only": huLi({ title: "Effects of a Nurse-Led Fall Prevention Program in Hospitalized Older Adults.", publicationTitle: "", ISSN: "" }),
		"brackets only": huLi({ publicationTitle: "", journalAbbreviation: "", ISSN: "" }),
		"language zh": huLi({ language: "zh" }),
	};
	for (let [name, data] of Object.entries(cases)) {
		assert.equal(Z.isChinese(data), false, name);
		let found = Z.analyze(data);
		assert.equal(found.length, 1, name);
		let f = found[0];
		assert.equal(f.id, "title-translated", name);
		assert.equal(f.field, "extra", "the fix writes only Extra: the review window shows 「其他」, not the title");
		assert.equal(f.label, "其他");
		assert.equal(f.current, data.extra);
		assert.equal(f.confidence, "check", name);
		assert.ok(!found.some(x => x.changes && x.changes.fields && x.changes.fields.language === "en"), `${name}: no 「en」`);
		assert.match(f.hint, /中文篇名和中文作者姓名/);
		assert.match(f.hint, /ZotMax 不翻譯/);
		assert.match(f.hint, /不要改成 en/);
		assert.deepEqual(plain(f.changes), { extraLines: ["PubMed title: Effects of a Nurse-Led Fall Prevention Program in Hospitalized Older Adults"] }, name);
		assert.match(f.suggested, /PubMed title: Effects of a Nurse-Led/);
		assert.match(f.hint, /引用格式不會印出這一行/);
		// Applying it keeps every Extra line and adds the PubMed title at the end
		assert.deepEqual(plain(Z.applyChanges(data, found)), { itemType: null, creators: null,
			fields: { extra: "PMID: 37000000\nPubMed title: Effects of a Nurse-Led Fall Prevention Program in Hospitalized Older Adults" } }, name);
	}
	assert.match(Z.analyze(huLi())[0].hint, /篇名外面有 \[ \].*期刊是《護理雜誌》/);
	assert.doesNotMatch(Z.analyze(cases["ISSN only"])[0].hint, /篇名外面有/);
	assert.doesNotMatch(Z.analyze(cases["brackets only"])[0].hint, /期刊是/);
	assert.equal(Z.applyChanges(huLi({ extra: "" }), Z.analyze(huLi({ extra: "" }))).fields.extra,
		"PubMed title: Effects of a Nurse-Led Fall Prevention Program in Hospitalized Older Adults");
});

test("an English title already kept in Extra (PubMed title or original-title) is never duplicated: the finding stays, without a fix", () => {
	for (let kept of ["PubMed title: Effects of a nurse-led program", "original-title: Effects of a nurse-led program"]) {
		let data = huLi({ extra: `PMID: 37000000\n${kept}` });
		let found = Z.analyze(data);
		assert.deepEqual(ids(found), ["title-translated"]);
		assert.equal(found[0].changes, null, "nothing to write: the user pastes the Chinese title");
		assert.match(found[0].hint, /已經記著英譯篇名，不會重複寫入/);
		assert.deepEqual(plain(Z.applyChanges(data, found)), { itemType: null, fields: {}, creators: null });
	}
	// Case and spacing of the label do not matter
	assert.equal(Z.analyze(huLi({ extra: "pubmed TITLE : Something" }))[0].changes, null);
	assert.equal(Z.analyze(huLi({ extra: "Original-Title : Something" }))[0].changes, null);
	// The same line coming twice (or already in Extra) is written once
	let line = "PubMed title: Effects of a Nurse-Led Fall Prevention Program in Hospitalized Older Adults";
	let f = { changes: { extraLines: [line] } };
	assert.equal(Z.applyChanges(huLi(), [f, f]).fields.extra, `PMID: 37000000\n${line}`);
	assert.deepEqual(plain(Z.applyChanges(huLi({ extra: `PMID: 1\n${line}` }), [f]).fields), {});
});

test("a genuine English article with a Chinese language label still gets the 「en」 suggestion", () => {
	let english = {
		itemType: "journalArticle", title: "Effects of a nurse-led program on falls: a randomized controlled trial.",
		creators: [{ lastName: "Smith", firstName: "John", creatorType: "author" }], publicationTitle: "Journal of Advanced Nursing",
		journalAbbreviation: "J Adv Nurs", ISSN: "0309-2402", language: "chi", extra: "",
	};
	let found = Z.analyze(english);
	assert.deepEqual([found.length, found[0].id, found[0].suggested], [1, "language", "en"]);
	assert.deepEqual(plain(found[0].changes), { fields: { language: "en" } });
	// 「The Journal of Nursing」 alone is not enough to call it 《護理雜誌》
	assert.equal(Z.analyze(Object.assign({}, english, { publicationTitle: "The Journal of Nursing", journalAbbreviation: "", ISSN: "" }))[0].suggested, "en");
	// Once the user pastes the Chinese title, the item is Chinese and checked as such (no 「en」, no translated-title finding)
	let pasted = huLi({ title: "護理人員跌倒預防衛教之成效", extra: "PMID: 37000000\noriginal-title: Effects of a nurse-led program" });
	assert.equal(Z.isChinese(pasted), true);
	let zh = Z.analyze(pasted);
	assert.ok(!zh.some(f => f.id === "title-translated" || f.suggested === "en"));
	assert.equal(byID(zh, "language").suggested, "zh-TW");
});

test("romanizedName: the pinyin of a mixed name as a CSL Extra name (family || given when the record tells, else literal)", () => {
	const cases = [
		[{ name: "陳美玲(Chen, Mei-Ling)" }, "Chen || Mei-Ling"],
		[{ name: "陳美玲（Chen, Mei-Ling）" }, "Chen || Mei-Ling"],
		[{ name: "陳美玲 Chen Mei-Ling" }, "Chen || Mei-Ling"],
		[{ name: "陳美玲 Mei-Ling Chen" }, "Chen || Mei-Ling"],
		[{ lastName: "陳美玲 Chen", firstName: "Mei-Ling" }, "Chen || Mei-Ling"],
		[{ lastName: "Chen", firstName: "Mei-Ling 陳美玲" }, "Chen || Mei-Ling"],
		[{ lastName: "陳美玲", firstName: "Chen Mei Ling" }, "Chen Mei Ling"],
		[{ name: "陳美玲 Chen MeiLing" }, "Chen MeiLing"],
		[{ name: "陳美玲" }, ""],
	];
	for (let [c, want] of cases) assert.equal(Z.romanizedName(c), want, JSON.stringify(c));
});

test("pinyin dropped from a mixed name is written to Extra first (original-author), once, keeping the other Extra lines", () => {
	let f = Z.analyzeCreator({ name: "陳美玲(Chen, Mei-Ling)", creatorType: "author" }, 0);
	assert.equal(f.confidence, "check");
	assert.deepEqual(plain(f.changes), { creator: { index: 0, replacement: [{ name: "陳美玲", creatorType: "author" }] }, extraLines: ["original-author: Chen || Mei-Ling"] });
	assert.match(f.suggested, /^「陳美玲」（單一欄位）；「其他」欄加上「original-author: Chen \|\| Mei-Ling」$/);
	assert.match(f.hint, /original-author/);
	assert.match(f.hint, /只記這一位的拼音/);
	assert.doesNotMatch(f.hint, /引用格式還用得到/, "no citation style prints original-author: the hint does not promise it");
	// The same line already in Extra: no Extra change offered, and the suggestion does not promise one
	let again = Z.analyzeCreator({ name: "陳美玲(Chen, Mei-Ling)", creatorType: "author" }, 0, "PMID: 1\noriginal-author: Chen || Mei-Ling");
	assert.deepEqual(plain(again.changes), { creator: { index: 0, replacement: [{ name: "陳美玲", creatorType: "author" }] } });
	assert.equal(again.suggested, "「陳美玲」（單一欄位）");
	assert.match(again.hint, /已經以「original-author: Chen \|\| Mei-Ling」記在「其他」欄，不會重複寫入/);
	let viaAnalyze = Z.analyze(clean({ creators: [{ name: "陳美玲(Chen, Mei-Ling)", creatorType: "author" }], DOI: "", url: "", extra: "PMID: 1\noriginal-author: Chen || Mei-Ling" }));
	assert.equal(byID(viaAnalyze, "creators-0").suggested, "「陳美玲」（單一欄位）");

	let data = clean({
		creators: [{ name: "陳美玲(Chen, Mei-Ling)", creatorType: "author" }, { lastName: "林小華 Lin", firstName: "Hsiao-Hua", creatorType: "author" }],
		extra: "PMID: 37000000\noriginal-author: Lin || Hsiao-Hua", DOI: "", url: "",
	});
	let findings = Z.analyze(data);
	assert.deepEqual(ids(findings), ["creators-0", "creators-1"]);
	let out = Z.applyChanges(data, findings);
	assert.deepEqual(plain(out.creators), [{ name: "陳美玲", creatorType: "author" }, { name: "林小華", creatorType: "author" }]);
	// One line per creator, an identical line not written again, the existing lines kept in place
	assert.equal(out.fields.extra, "PMID: 37000000\noriginal-author: Lin || Hsiao-Hua\noriginal-author: Chen || Mei-Ling");
	// With the DOI moved out of Extra in the same run: the DOI line goes, the pinyin line is still added
	data = clean({ creators: [{ name: "陳美玲(Chen, Mei-Ling)", creatorType: "author" }], DOI: "", url: "", extra: "DOI: 10.6224/JN.202304_70(2).07\nPMID: 1" });
	findings = Z.analyze(data);
	out = Z.applyChanges(data, findings);
	assert.equal(out.fields.DOI, "10.6224/JN.202304_70(2).07");
	assert.equal(out.fields.extra, "PMID: 1\noriginal-author: Chen || Mei-Ling");
	// Order of the findings does not matter
	assert.equal(Z.applyChanges(data, findings.slice().reverse()).fields.extra, "PMID: 1\noriginal-author: Chen || Mei-Ling");
	// Not ticking the creator fix writes nothing to Extra
	assert.equal(Z.applyChanges(data, findings.filter(x => x.id === "DOI")).fields.extra, "PMID: 1");
});

test("the Extra line the 《護理雜誌》 fix writes is not printed by the APA styles (CSL original-title would be)", () => {
	// Rendered with citeproc-js, as Zotero's Word plugin does; Zotero hands the rest of Extra to citeproc as note
	const fs = require("node:fs");
	const path = require("node:path");
	const CSL = require("citeproc");
	const locales = path.join(__dirname, "fixtures", "csl-locales");
	let render = (file, item) => {
		let sys = {
			retrieveLocale: l => fs.readFileSync(path.join(locales, /^zh/.test(l) ? "locales-zh-TW.xml" : "locales-en-US.xml"), "utf8"),
			retrieveItem: () => item,
		};
		let e = new CSL.Engine(sys, fs.readFileSync(path.join(__dirname, "..", "content", "styles", file), "utf8"), "en-US");
		e.setOutputFormat("text");
		e.updateItems([item.id]);
		return e.makeBibliography()[1].join("");
	};
	let data = huLi({ extra: "PMID: 37000000" });
	let line = Z.analyze(data)[0].changes.extraLines[0];
	assert.match(line, /^PubMed title: /);
	for (let file of ["apa-7-zh-tw.csl", "apa-7-zh-tw-twna.csl"]) {
		// Before and after the user pastes the Chinese title, in the English branch (chi, en) and the Chinese one (zh-TW)
		for (let language of ["chi", "en", "zh-TW"]) {
			for (let title of [data.title, "護理人員跌倒預防衛教之成效"]) {
				let item = { id: "hu", type: "article-journal", language, title, "container-title": "護理雜誌", volume: "70", page: "45-56",
					issued: { "date-parts": [[2023]] }, author: [{ family: "Chen", given: "Mei-Ling" }] };
				let kept = render(file, Object.assign({}, item, { note: `PMID: 37000000\n${line}` }));
				assert.doesNotMatch(kept, /Original work published|Hospitalized Older Adults\)/, `${file} ${language} ${title}: ${kept}`);
				assert.equal(kept, render(file, Object.assign({}, item, { note: "PMID: 37000000" })), `${file} ${language}: the line changes nothing`);
			}
		}
		// Why not original-title: the English branch adds 「(Original work published as …)」
		let orig = render(file, { id: "hu", type: "article-journal", language: "en", title: "護理人員跌倒預防衛教之成效", "container-title": "護理雜誌",
			volume: "70", page: "45-56", issued: { "date-parts": [[2023]] }, author: [{ family: "Chen", given: "Mei-Ling" }],
			note: "original-title: Effects of a Nurse-Led Fall Prevention Program" });
		assert.match(orig, /Original work published as Effects of a Nurse-Led/, file);
	}
});
