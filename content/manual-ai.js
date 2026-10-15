/*
 * ZotMax — AI 筆記（複製貼上，免 API key）: the AI literature note without an API.
 *
 * The prompt is the one the API path sends (llm.js buildPrompt: the note template, the study-data JSON rules, the
 * item's metadata, abstract, highlights, notes and the trimmed full text), joined into one text for a chat website
 * (ChatGPT, Claude, Gemini, a school's AI — free or paid plans alike). The user pastes it there, copies the answer
 * back into the window, and the answer goes through the same path as an API answer (main.js saveManualNote():
 * the JSON block, the quote check, the AI child note, then a sync), so the 看板, the dashboard, the topic pages and
 * GRADE hints work as before. 「只複製指令」 leaves the text out for the user to attach the PDF in the chat (long
 * papers, scans). The provider 「網頁版 AI」 in the settings makes this the way AI notes are made: syncs then never
 * call an AI.
 *
 * The functions down to "Zotero" are pure (Node tests); the rest needs Zotero.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(require("./llm.js"), globalThis);
	}
	else {
		(root.ZB = root.ZB || {}).manualAI = factory(root.ZB.llm, root);
	}
})(this, function (llm, scope) {
	const TITLE = "AI 筆記（複製貼上，免 API key）";
	const URL = "chrome://zotero-bridge/content/manual-ai.xhtml";
	const ROOT = "zb-manual";
	const HTML_NS = "http://www.w3.org/1999/xhtml";
	// Beyond this a free chat plan may not take it in one message
	const LONG_PROMPT = 60000;
	// A real note is longer than this; shorter is a pasted fragment
	const MIN_ANSWER = 200;
	const DEFAULT_MODEL = "網頁版 AI（手動貼上）";
	const SITES = [
		{ id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
		{ id: "claude", name: "Claude", url: "https://claude.ai/new" },
		{ id: "gemini", name: "Gemini", url: "https://gemini.google.com/app" },
	];
	let runtime = {};

	// ---------- pure ----------

	/** The one text to paste into a chat: the instructions, the paper, what to answer with. */
	function promptText(prompt) {
		let system = (Array.isArray(prompt.system) ? prompt.system : [prompt.system]).filter(p => p && String(p).trim()).join("\n\n");
		return [
			"請依照下面「指示」的格式，為「文獻資料」裡的這篇文獻寫一份結構化的文獻筆記。",
			"", "# 指示", "", system.trim(),
			"", "# 文獻資料", "", String(prompt.user || "").trim(),
			"", "# 回答方式", "",
			"直接輸出筆記本文（Markdown，用 ## 標題分段），最後一定要附上 ```json 開頭的結構化資料區塊。不要加開場白、結語或提問。",
		].join("\n");
	}

	/** { chars, long, words } of a prompt (long: a free chat plan may not take it). */
	function promptStats(text) {
		let chars = String(text || "").length;
		return { chars, long: chars > LONG_PROMPT };
	}

	/**
	 * The pasted answer tidied: line endings, a chat's preamble before the first heading ("好的，以下是…"), and a JSON
	 * object pasted without its ``` fence (selected by hand instead of the copy button) put back in one.
	 */
	function cleanAnswer(text) {
		let s = String(text || "").replace(/\r\n?/g, "\n").replace(/ /g, " ").trim();
		let heading = /^#{1,6}\s/m.exec(s);
		if (heading && heading.index > 0 && heading.index < 400 && !/```/.test(s.slice(0, heading.index))) s = s.slice(heading.index);
		if (!/^\s*```/m.test(s)) {
			// A bare JSON object at the end: from the last line that starts with "{"
			let lines = s.split("\n");
			for (let i = lines.length - 1; i >= 0; i--) {
				if (!/^\s*\{/.test(lines[i])) continue;
				let body = lines.slice(i).join("\n").trim();
				try {
					let v = JSON.parse(body);
					if (v && typeof v === "object" && !Array.isArray(v)) {
						s = [...lines.slice(0, i), "```json", body, "```"].join("\n");
					}
				}
				catch (e) {}
				break;
			}
		}
		return s;
	}

	/**
	 * What the window says about the pasted answer before saving: [{ level: "ok" | "warn" | "error", text }] and
	 * canSave (false only when there is nothing usable).
	 */
	function checkAnswer(text) {
		let s = cleanAnswer(text);
		let items = [];
		if (!s) return { canSave: false, items: [{ level: "error", text: "還沒有貼上 AI 的回答。" }], cleaned: s };
		if (s.length < MIN_ANSWER) {
			items.push({ level: "error", text: "回答太短，看起來只貼到一部分。請用回答下方的「複製」按鈕複製整段。" });
			return { canSave: false, items, cleaned: s };
		}
		if (/^#{1,6}\s/m.test(s)) items.push({ level: "ok", text: "有分段的筆記本文。" });
		else items.push({ level: "warn", text: "找不到「## 標題」：可能是自己反白複製，格式掉了。可以改用回答下方的「複製」按鈕。" });
		let parsed = llm.extractStudyData(s);
		if (parsed.found && parsed.data) {
			let d = parsed.data;
			let facts = [d.study_design, Number.isFinite(d.sample_size) ? `N = ${d.sample_size}` : "", d.evidence_level ? `CEBM ${d.evidence_level}` : ""].filter(Boolean);
			items.push({ level: "ok", text: `找到結構化資料${facts.length ? `（${facts.join("、")}）` : ""}，看板和儀表板用得到。` });
		}
		else if (parsed.found) {
			items.push({ level: "warn", text: `結構化資料讀不懂（${parsed.error}）：研讀欄位會留空。可以請 AI「只重新輸出最後的 JSON 區塊」，貼在回答最後。` });
		}
		else {
			items.push({ level: "warn", text: "沒有 JSON 資料區塊：研讀欄位（研究設計、證據等級、PICO）會留空。可以請 AI「補上最後的 ```json 區塊」再貼一次。" });
		}
		if (/(^|\n)>\s*⚠️\s*輸出未完成/.test(s) || /```json[\s\S]*$/.test(s) && !/```json[\s\S]*```/.test(s)) {
			items.push({ level: "warn", text: "JSON 區塊沒有結尾，回答可能被截斷。請 AI「繼續」，把後半段接著貼上。" });
		}
		return { canSave: true, items, cleaned: s };
	}

	/** The full-text line in the window, from manualPrompt()'s fullTextStatus / truncated. */
	function fullTextLine(info) {
		if (info.userPDF) return "提示詞不含全文：請在 AI 網站把這篇的 PDF 一起附上。";
		switch (info.fullTextStatus) {
			case "ok": return info.truncated ? "含全文（太長，只放前段；可以改用「只複製指令」並上傳 PDF）。" : "含整理過的全文（參考文獻等段落已省略）。";
			case "partial": return "這份 PDF 大部分是掃描影像，只有少數頁有文字：建議改用「只複製指令」並上傳 PDF。";
			case "none": return "這份 PDF 是掃描版，沒有文字：請改用「只複製指令」並在 AI 網站上傳 PDF。";
			default: return "沒有可用的全文，只有書目、摘要和你的劃線：有 PDF 的話建議改用「只複製指令」並上傳 PDF。";
		}
	}

	// ---------- the window ----------

	function el(doc, tag, attrs, content) {
		let e = doc.createElementNS(HTML_NS, tag);
		for (let [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
		if (content !== undefined) e.textContent = content;
		return e;
	}

	/**
	 * Draw the window into `root`. info: { title, index, total, prompt: { text, stats, fullTextStatus, truncated },
	 * model }. handlers: { copy(userPDF) → Promise<{ text, stats, ... }>, open(url), onSave({ text, model }), onSkip(),
	 * onCancel() }.
	 */
	function renderWindow(doc, root, info, handlers) {
		root.replaceChildren();
		let decided = false;
		let finish = (fn, arg) => {
			if (decided) return;
			decided = true;
			fn(arg);
		};

		let head = el(doc, "header", { class: "zb-cl-head" });
		head.append(
			el(doc, "h1", { class: "zb-cl-title" }, info.total > 1 ? `${TITLE}（${info.index + 1}／${info.total}）` : TITLE),
			el(doc, "p", { class: "zb-cl-lead", "data-zb-title": "" }, info.title || ""),
			el(doc, "p", { class: "zb-cl-why" }, "不用 API key：把提示詞貼到你在用的 AI 網站（免費或訂閱都可以），再把回答貼回來。ZotMax 一樣會核對引文，整理成看板。"),
		);
		let list = el(doc, "div", { class: "zb-cl-list" });

		// 1. 複製提示詞
		let s1 = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-ma-1" });
		s1.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-ma-1" }, "1. 複製提示詞"));
		let ftLine = el(doc, "p", { class: "zb-cl-why", "data-zb-fulltext": "" }, fullTextLine(info.prompt));
		let row1 = el(doc, "div", { class: "zb-pc-row" });
		let copyFull = el(doc, "button", { type: "button", class: "zb-ma-copy" }, "複製提示詞（含全文）");
		let copyShort = el(doc, "button", { type: "button", class: "zb-ma-copy-short" }, "只複製指令（我自己上傳 PDF）");
		row1.append(copyFull, copyShort);
		let copyStatus = el(doc, "p", { class: "zb-cl-why", role: "status", "data-zb-copy-status": "" }, "");
		s1.append(ftLine, row1, copyStatus);

		// 2. 貼到 AI 網站
		let s2 = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-ma-2" });
		s2.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-ma-2" }, "2. 打開 AI 網站，貼上並送出"));
		let row2 = el(doc, "div", { class: "zb-pc-row" });
		for (let site of SITES) {
			let b = el(doc, "button", { type: "button", "data-zb-site": site.id }, `開啟 ${site.name}`);
			b.addEventListener("click", () => handlers.open(site.url));
			row2.append(b);
		}
		s2.append(row2,
			el(doc, "p", { class: "zb-cl-why" }, "等它寫完，按回答下面的「複製」按鈕（不要自己反白，格式會掉）。學校或醫院提供的 AI 也可以。"),
			el(doc, "p", { class: "zb-cl-why zb-ma-privacy" }, "全文會送到你選的網站。含病人資料或未發表的資料，請先確認可以分享；免費方案的內容可能被拿去訓練模型。"));

		// 3. 貼回答
		let s3 = el(doc, "section", { class: "zb-cl-item", "aria-labelledby": "zb-ma-3" });
		s3.append(el(doc, "h2", { class: "zb-cl-item-title", id: "zb-ma-3" }, "3. 把回答貼回來"));
		let field = el(doc, "div", { class: "zb-pc-field" });
		let answer = el(doc, "textarea", { id: "zb-ma-answer", rows: "12", placeholder: "在這裡貼上 AI 的整段回答（含最後的 JSON 區塊）" });
		field.append(el(doc, "label", { for: "zb-ma-answer", class: "zb-pc-label" }, "AI 的回答"), answer);
		let modelField = el(doc, "div", { class: "zb-pc-field" });
		let model = el(doc, "input", { type: "text", id: "zb-ma-model", list: "zb-ma-models", placeholder: "例如：ChatGPT、Claude、Gemini" });
		model.value = info.model || "";
		let datalist = el(doc, "datalist", { id: "zb-ma-models" });
		for (let site of SITES) datalist.append(el(doc, "option", { value: `${site.name} 網頁版` }));
		modelField.append(el(doc, "label", { for: "zb-ma-model", class: "zb-pc-label" }, "用的是哪個 AI（選填，記在筆記上）"), model, datalist);
		let checks = el(doc, "ul", { class: "zb-pc-checks", "data-zb-checks": "" });
		s3.append(field, checks, modelField);

		list.append(s1, s2, s3);

		let foot = el(doc, "footer", { class: "zb-cl-foot" });
		let summary = el(doc, "p", { class: "zb-cl-summary", role: "status" }, "");
		let buttons = el(doc, "div", { class: "zb-cl-buttons" });
		let cancel = el(doc, "button", { type: "button", class: "zb-cl-cancel" }, info.total > 1 ? "結束" : "取消");
		let skip = el(doc, "button", { type: "button", class: "zb-ma-skip" }, "跳過這篇");
		let save = el(doc, "button", { type: "button", class: "zb-cl-apply" }, "儲存 AI 筆記並同步");
		buttons.append(cancel, ...(info.total > 1 ? [skip] : []), save);
		foot.append(summary, buttons);
		root.append(head, list, foot);

		let doCopy = async (userPDF) => {
			copyStatus.textContent = "準備中…";
			try {
				let p = await handlers.copy(userPDF);
				ftLine.textContent = fullTextLine(Object.assign({}, p, { userPDF }));
				copyStatus.textContent = `已複製 ${p.stats.chars.toLocaleString("en-US")} 字，貼到 AI 網站的對話框送出。`
					+ (p.stats.long ? "很長：免費方案可能貼不下，可以改用「只複製指令」並上傳 PDF。" : "");
				copyStatus.setAttribute("data-zb-long", p.stats.long ? "true" : "false");
			}
			catch (e) {
				copyStatus.textContent = `複製失敗：${(e && e.message) || e}`;
			}
		};
		copyFull.addEventListener("click", () => doCopy(false));
		copyShort.addEventListener("click", () => doCopy(true));

		let update = () => {
			let r = checkAnswer(answer.value);
			checks.replaceChildren(...r.items.map(i => el(doc, "li", { "data-zb-level": i.level }, `${i.level === "ok" ? "✓" : i.level === "warn" ? "⚠️" : "✗"} ${i.text}`)));
			save.disabled = !r.canSave;
			summary.textContent = r.canSave ? "儲存後會寫成這篇的 AI 子筆記，並同步到 Obsidian／Notion。" : "";
			return r;
		};
		answer.addEventListener("input", update);
		update();

		cancel.addEventListener("click", () => finish(handlers.onCancel));
		skip.addEventListener("click", () => finish(handlers.onSkip));
		save.addEventListener("click", () => {
			let r = update();
			if (!r.canSave) return;
			finish(handlers.onSave, { text: r.cleaned, model: model.value.trim() || DEFAULT_MODEL });
		});
		root.addEventListener("keydown", (ev) => {
			if (ev.key === "Escape") {
				ev.preventDefault();
				finish(handlers.onCancel);
			}
		});
		return { answer, model, save, copyFull, copyShort, update };
	}

	// ---------- Zotero ----------

	function ZB() {
		return scope.ZB;
	}

	function copy(text) {
		if (runtime.copy) return runtime.copy(text);
		Zotero.Utilities.Internal.copyTextToClipboard(String(text || ""));
	}

	function open(url) {
		if (runtime.open) return runtime.open(url);
		Zotero.launchURL(url);
	}

	/** The prompt for an item, as text with its stats. */
	async function promptFor(item, userPDF) {
		let p = await ZB().main.manualPrompt(item, { userPDF });
		let text = promptText(p);
		return { text, stats: promptStats(text), fullTextStatus: p.fullTextStatus, truncated: p.truncated, userPDF };
	}

	/** One item's window: resolves to { action: "save", text, model } | { action: "skip" } | { action: "cancel" }. */
	async function dialog(info, win) {
		if (runtime.dialog) return runtime.dialog(info);
		let rootEl = await ZB().pico.waitForDialog(win, ROOT);
		return new Promise((resolve) => {
			let unload = () => resolve({ action: "cancel" });
			win.addEventListener("unload", unload, { once: true });
			renderWindow(win.document, rootEl, info, {
				copy: async (userPDF) => {
					let p = await promptFor(info.item, userPDF);
					copy(p.text);
					return p;
				},
				open,
				onSave: (r) => {
					win.removeEventListener("unload", unload);
					resolve(Object.assign({ action: "save" }, r));
				},
				onSkip: () => {
					win.removeEventListener("unload", unload);
					resolve({ action: "skip" });
				},
				onCancel: () => {
					win.removeEventListener("unload", unload);
					resolve({ action: "cancel" });
				},
			});
			let answer = win.document.getElementById("zb-ma-answer");
			if (answer) answer.focus();
		});
	}

	/**
	 * 快速指令 / item menu: one window for the selected items, one at a time. Resolves to { saved, skipped, messages }.
	 * opts: { sync (false: save the AI note only), onOpen(win) (the e2e harness) }.
	 */
	async function run(items, opts = {}) {
		let z = ZB();
		if (z.features && !z.features.isEnabled("aiNotes")) {
			z.main.notify("ZotMax", "「AI 文獻筆記」目前關閉。要使用的話：設定 → ZotMax → 功能，把它打開。");
			return null;
		}
		items = z.adapter.toRegularItems(items || []);
		if (!items.length) {
			z.main.notify(TITLE, "請先選取文獻。");
			return null;
		}
		let win = null;
		if (!runtime.dialog) {
			win = Zotero.getMainWindow().openDialog(URL, "zotero-bridge-manual-ai", "chrome,dialog=no,resizable,centerscreen");
			if (opts.onOpen) opts.onOpen(win);
		}
		let out = { saved: 0, skipped: 0, messages: [] };
		let lastModel = "";
		try {
			for (let [index, item] of items.entries()) {
				let prompt = await promptFor(item, false);
				let choice = await dialog({ item, title: item.getField("title"), index, total: items.length, prompt, model: lastModel }, win);
				if (!choice || choice.action === "cancel") break;
				if (choice.action === "skip") {
					out.skipped++;
					continue;
				}
				lastModel = choice.model;
				let result = await z.main.saveManualNote(item, cleanAnswer(choice.text), { model: choice.model || DEFAULT_MODEL, sync: opts.sync });
				out.saved++;
				out.messages.push(...(result.messages || []));
			}
		}
		catch (e) {
			Zotero.logError(e);
			z.main.notify(TITLE, `沒有完成：${(e && e.message) || e}`);
		}
		finally {
			try {
				if (win && !win.closed) win.close();
			}
			catch (e) {}
		}
		if (out.saved || out.skipped) {
			z.main.notify(TITLE, `已儲存 ${out.saved} 篇的 AI 筆記${out.skipped ? `，跳過 ${out.skipped} 篇` : ""}。`
				+ (out.messages.length ? out.messages.slice(0, 3).join("；") : ""));
		}
		return out;
	}

	return {
		TITLE, URL, ROOT, SITES, LONG_PROMPT, MIN_ANSWER, DEFAULT_MODEL, runtime,
		promptText, promptStats, cleanAnswer, checkAnswer, fullTextLine, renderWindow, promptFor, run,
	};
});
