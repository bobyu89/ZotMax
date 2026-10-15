// 網頁版 AI (content/manual-ai.js) and OpenRouter (llm.js PROVIDERS, callChat), the pure parts: the providers, the
// Chat Completions request and its answer, the model list, the usage ledger's billed cost and free models; the
// copy-and-paste prompt, tidying and checking a pasted answer.
const test = require("node:test");
const assert = require("node:assert/strict");
const llm = require("../content/llm.js");
const usage = require("../content/usage.js");
const scanned = require("../content/scanned.js");
const M = require("../content/manual-ai.js");
const { AI_MD: NOTE } = require("./fixtures.cjs");

// An AI note as a chat website writes it: the note, then the JSON block
const AI_MD = NOTE + "\n\n```json\n" + JSON.stringify({ study_design: "RCT", sample_size: 120, evidence_level: "2", appraisal_overall: "納入", effect_direction: "有效" }, null, 2) + "\n```";

function response(status, json) {
	return { status, ok: status >= 200 && status < 300, statusText: String(status), headers: { get: () => null }, text: async () => JSON.stringify(json) };
}

test("providers: four choices, unknown values are Claude, only Claude takes images; PDFs go to Claude and OpenAI", () => {
	assert.deepEqual(Object.keys(llm.PROVIDERS), ["anthropic", "openai", "openrouter", "manual"]);
	assert.equal(llm.normalizeProvider("openrouter"), "openrouter");
	assert.equal(llm.normalizeProvider("gemini"), "anthropic");
	assert.equal(llm.normalizeProvider(undefined), "anthropic");
	assert.equal(llm.providerInfo("openrouter").secret, "openrouterKey");
	assert.equal(llm.providerInfo("manual").secret, "");
	assert.deepEqual(Object.values(llm.PROVIDERS).filter(p => p.images).map(p => p.id), ["anthropic"]);
	assert.equal(llm.DEFAULT_MODELS.openrouter, "openrouter/free");
	assert.equal(scanned.providerReadsPDF({ provider: "anthropic" }), true);
	assert.equal(scanned.providerReadsPDF({ provider: "openai" }), true);
	assert.equal(scanned.providerReadsPDF({ provider: "openai", baseURL: "http://localhost:11434/v1" }), false);
	assert.equal(scanned.providerReadsPDF({ provider: "openrouter" }), false);
});

test("OpenRouter: Chat Completions with the app's headers and usage accounting; text, model and billed cost come back", async () => {
	let sent = [];
	let fetch = async (url, init) => {
		sent.push({ url, init, body: JSON.parse(init.body) });
		return response(200, {
			model: "google/gemma-4-31b-it:free",
			choices: [{ finish_reason: "stop", message: { role: "assistant", content: AI_MD } }],
			usage: { prompt_tokens: 1200, completion_tokens: 400, prompt_tokens_details: { cached_tokens: 200 }, cost: 0.0012 },
		});
	};
	let r = await llm.generateText({ provider: "openrouter", apiKey: "sk-or-v1-test", model: "openrouter/free" }, ["系統", "JSON 規則"], "文獻", fetch);
	assert.equal(sent[0].url, "https://openrouter.ai/api/v1/chat/completions");
	assert.equal(sent[0].init.headers.authorization, "Bearer sk-or-v1-test");
	assert.equal(sent[0].init.headers["X-Title"], "ZotMax");
	assert.deepEqual(sent[0].body.messages, [{ role: "system", content: "系統\n\nJSON 規則" }, { role: "user", content: "文獻" }]);
	assert.deepEqual(sent[0].body.usage, { include: true });
	assert.equal(sent[0].body.model, "openrouter/free");
	assert.equal(r.text, AI_MD);
	assert.equal(r.model, "google/gemma-4-31b-it:free");
	assert.equal(r.provider, "openrouter");
	assert.deepEqual(r.usage, { input: 1000, output: 400, cacheRead: 200, cacheWrite: 0, cost: 0.0012 });
});

test("OpenRouter: a cut-off answer is marked, an empty one, a refusal and an error inside a 200 throw; no key → the no-key message", async () => {
	let answer = json => async () => response(200, json);
	let cut = await llm.callChat({ apiKey: "k", provider: "openrouter", system: "s", user: "u", fetch: answer({ choices: [{ finish_reason: "length", message: { content: "前半段" } }] }) });
	assert.match(cut.text, /^前半段\n\n> ⚠️ 輸出未完成/);
	await assert.rejects(llm.callChat({ apiKey: "k", provider: "openrouter", system: "s", user: "u", fetch: answer({ choices: [{ message: { content: "" } }] }) }), /OpenRouter 沒有回傳內容/);
	await assert.rejects(llm.callChat({ apiKey: "k", provider: "openrouter", system: "s", user: "u", fetch: answer({ choices: [{ message: { refusal: "不行" } }] }) }), /OpenRouter 拒絕處理：不行/);
	await assert.rejects(llm.callChat({ apiKey: "k", provider: "openrouter", system: "s", user: "u", fetch: answer({ error: { code: 502, message: "upstream failed" } }) }), /OpenRouter API 502: upstream failed/);
	await assert.rejects(llm.callChat({ apiKey: "bad", provider: "openrouter", system: "s", user: "u", fetch: async () => response(401, { error: { message: "No auth credentials found" } }), retry: { sleep: async () => {} } }),
		/OpenRouter API 401: No auth credentials found/);
	await assert.rejects(llm.generateText({ provider: "openrouter", apiKey: "" }, "s", "u", async () => assert.fail("no request")), /OpenRouter 有免費模型/);
	await assert.rejects(llm.generateText({ provider: "manual", apiKey: "x" }, "s", "u", async () => assert.fail("no request")), /網頁版 AI（複製貼上）/);
	// The PDF as a file part ahead of the text
	let msgs = llm.chatMessages("s", "u", { data: "QUJD", filename: "a.pdf" });
	assert.deepEqual(msgs[1].content[0], { type: "file", file: { filename: "a.pdf", file_data: "data:application/pdf;base64,QUJD" } });
});

test("OpenRouter's model list: text models without batch copies, free first, a label with the price", () => {
	let list = llm.parseOpenRouterModels({ data: [
		{ id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", pricing: { prompt: "0.000002", completion: "0.00001" }, architecture: { output_modalities: ["text"] } },
		{ id: "anthropic/claude-sonnet-5.5:batch", name: "batch", pricing: { prompt: "0.000001" }, architecture: { output_modalities: ["text"] } },
		{ id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B (free)", pricing: { prompt: "0", completion: "0" } },
		{ id: "google/lyria-3", name: "Lyria", pricing: { prompt: "0", completion: "0" }, architecture: { output_modalities: ["audio"] } },
		{ id: "openrouter/free", name: "Free Models Router", pricing: { prompt: "-1", completion: "-1" } },
	] });
	assert.deepEqual(list.map(m => m.id), ["google/gemma-4-31b-it:free", "openrouter/free", "anthropic/claude-sonnet-5.5"]);
	assert.equal(list[0].label, "Gemma 4 31B (free) · 免費");
	assert.equal(list[2].label, "Claude Sonnet 5.5 · US$2.0／百萬 tokens");
	assert.deepEqual(llm.parseOpenRouterModels(null), []);
});

test("usage: free models cost nothing; a billed cost counts for a model without a price", () => {
	let prices = usage.parsePrices("").prices;
	assert.equal(usage.costOf({ input: 1e6, output: 1e6 }, usage.priceFor("google/gemma-4-31b-it:free", prices)), 0);
	assert.ok(usage.priceFor("openrouter/free", prices));
	let ledger = usage.recordUsage({}, { model: "deepseek/deepseek-v4.1-flash", usage: { input: 1000, output: 100, cost: 0.002 } }, new Date(2026, 9, 1));
	ledger = usage.recordUsage(ledger, { model: "deepseek/deepseek-v4.1-flash", usage: { input: 1000, output: 100, cost: 0.003 } }, new Date(2026, 9, 2));
	let month = usage.parseLedger(JSON.stringify(ledger))["2026-10"];
	assert.equal(month.byModel["deepseek/deepseek-v4.1-flash"].cost, 0.005);
	let s = usage.summarize(month, prices);
	assert.ok(Math.abs(s.cost - 0.005) < 1e-9);
	assert.equal(s.unpricedCalls, 0);
});

test("the copy-and-paste prompt: instructions, the paper, how to answer; long ones are flagged", () => {
	let text = M.promptText({ system: ["筆記模板", "JSON 規則"], user: "<metadata>\n標題：Falls\n</metadata>" });
	assert.match(text, /^請依照下面「指示」的格式/);
	assert.match(text, /\n# 指示\n\n筆記模板\n\nJSON 規則\n\n# 文獻資料\n\n<metadata>\n標題：Falls\n<\/metadata>\n\n# 回答方式\n\n/);
	assert.match(text, /最後一定要附上 ```json/);
	assert.deepEqual(M.promptStats("x".repeat(10)), { chars: 10, long: false });
	assert.equal(M.promptStats("x".repeat(M.LONG_PROMPT + 1)).long, true);
	assert.match(M.fullTextLine({ fullTextStatus: "ok" }), /含整理過的全文/);
	assert.match(M.fullTextLine({ fullTextStatus: "ok", truncated: true }), /只放前段/);
	assert.match(M.fullTextLine({ fullTextStatus: "none" }), /掃描版/);
	assert.match(M.fullTextLine({ userPDF: true }), /不含全文/);
	// The user-attaches-the-PDF prompt asks for the PDF instead of the text
	let p = llm.buildPrompt({ title: "T", fullText: "全文內容", fullTextStatus: "ok" }, { userPDF: true });
	assert.ok(p.user.includes(llm.USER_PDF_NOTE));
	assert.doesNotMatch(p.user, /全文內容/);
});

test("a pasted answer: the chat's preamble goes, a bare JSON object gets its fence back, the checks say what is missing", () => {
	let pasted = "好的，以下是這篇文獻的筆記：\n\n" + AI_MD;
	let cleaned = M.cleanAnswer(pasted);
	assert.ok(cleaned.startsWith("## "), cleaned.slice(0, 20));
	let ok = M.checkAnswer(pasted);
	assert.equal(ok.canSave, true);
	assert.deepEqual(ok.items.map(i => i.level), ["ok", "ok"]);
	assert.match(ok.items[1].text, /找到結構化資料/);
	// Selected by hand: no fences around the JSON
	let bare = AI_MD.replace(/```json\n/, "").replace(/\n```\s*$/, "");
	assert.doesNotMatch(bare, /```/);
	assert.match(M.cleanAnswer(bare), /\n```json\n\{[\s\S]*\}\n```$/);
	assert.equal(M.checkAnswer(bare).items[1].level, "ok");
	// No JSON at all; too short; empty; cut off inside the JSON
	let noJSON = AI_MD.replace(/```json[\s\S]*$/, "");
	assert.equal(M.checkAnswer(noJSON).items[1].level, "warn");
	assert.match(M.checkAnswer(noJSON).items[1].text, /沒有 JSON 資料區塊/);
	assert.equal(M.checkAnswer("太短").canSave, false);
	assert.equal(M.checkAnswer("").items[0].text, "還沒有貼上 AI 的回答。");
	let cut = AI_MD.replace(/\n```\s*$/, "").slice(0, -10);
	assert.ok(M.checkAnswer(cut).items.some(i => /沒有結尾/.test(i.text)));
});
