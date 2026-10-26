// 建造星球 (content/planet-build.js), the pure parts: islands proposed from the AI notes' interventions and the
// papers' tags, and what the dialog's choices create. Also: 自動分類 is no island (planet.js findPlanets skip), and
// 首頁's hint while there is no planet.
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../content/planet-build.js");
const P = require("../content/planet.js");

const paper = (key, terms = [], tags = []) => ({ key, title: `Paper ${key}`, terms, tags });

test("proposeIslands: the label covering the most papers not yet placed, AI interventions before tags; the topic itself (most papers) and check tags are no island", () => {
	let papers = [
		paper("a", ["運動訓練"], ["Accidental Falls", "Humans", "Exercise Therapy"]),
		paper("b", ["運動訓練"], ["Accidental Falls", "Aged"]),
		paper("c", ["太極拳", "運動訓練"], ["Accidental Falls"]),
		paper("d", ["衛教"], ["Accidental Falls", "Patient Education as Topic"]),
		paper("e", ["衛教"], ["Accidental Falls", "Patient Education as Topic"]),
		paper("f", [], ["Accidental Falls", "Inappropriate Prescribing"]),
		paper("g", [], ["Inappropriate Prescribing"]),
		paper("h", [], ["Humans"]),
	];
	let p = B.proposeIslands(papers);
	assert.deepEqual(p.islands.map(is => [is.name, is.source, is.keys.join("")]), [
		["運動訓練", "ai", "abc"], ["衛教", "ai", "de"], ["Inappropriate Prescribing", "tag", "fg"],
	], "Accidental Falls is on 6 of 8: the topic itself; Humans is a check tag");
	assert.deepEqual(p.rest, ["h"]);
	// Each paper on one island at most; a label left with one unplaced paper is no island
	let keys = p.islands.flatMap(is => is.keys);
	assert.equal(new Set(keys).size, keys.length);
	assert.equal(B.proposeIslands(papers, { max: 2 }).islands.length, 2);
	// The AI note's word wins the name over the same tag
	let same = B.proposeIslands([paper("x", [], ["衛教"]), paper("y", ["衛教"]), paper("z", ["other"]), paper("w", ["other2"]), paper("v")]);
	assert.deepEqual(same.islands.map(is => [is.name, is.source]), [["衛教", "ai"]]);
	assert.deepEqual(B.proposeIslands([]), { islands: [], rest: [] });
	assert.equal(B.cleanName(" 碩論/跌倒  運動 "), "碩論／跌倒 運動");
});

test("planBuild: the user's names (cleaned), empty or nameless ones dropped, same names merged, an existing sub-collection reused", () => {
	let plan = B.planBuild([
		{ name: "運動", keys: ["a", "b"] }, { name: " 運動 ", keys: ["b", "c"] }, { name: "", keys: ["d"] }, { name: "空的", keys: [] }, { name: "衛教", keys: ["e"] },
	], ["衛教"]);
	assert.deepEqual(plan, [{ name: "運動", keys: ["a", "b", "c"], reuse: false }, { name: "衛教", keys: ["e"], reuse: true }]);
});

test("自動分類 (文獻自動分類's folder) is never an island or a planet; 首頁 says how to build one while there is none", () => {
	let rec = (title, col) => ({ title, link: title, collections: [col], status: "待讀" });
	let records = [
		rec("a", "碩論/跌倒/運動"), rec("b", "碩論/跌倒/衛教"),
		rec("c", "碩論/跌倒/自動分類/介入 I/運動"), rec("d", "碩論/跌倒/自動分類/研究設計/RCT"),
	];
	assert.deepEqual(P.findPlanets(records).map(p => [p.path, p.islands.map(i => i.name).join(",")]),
		[["碩論/跌倒", "自動分類,運動,衛教"], ["碩論/跌倒/自動分類", "介入 I,研究設計"]], "without the skip");
	assert.deepEqual(P.findPlanets(records, { skip: ["自動分類"] }).map(p => [p.path, p.islands.map(i => i.name).join(",")]),
		[["碩論/跌倒", "運動,衛教"]]);
	let hint = P.homePlanets([], "board", { suggest: "跌倒" });
	assert.match(hint, /^> \[!zm-board\] 🪐 我的星球\n> > \[!zm-next\|wide\] 建一顆星球\n> > 還沒有星球。.*在「跌倒」上按右鍵 → ZotMax ▸ 建造星球/);
	assert.match(P.homePlanets([], "classic", { suggest: "跌倒" }), /^## 🪐 我的星球\n\n還沒有星球。/);
	assert.equal(P.homePlanets([], "board", {}), "");
});
