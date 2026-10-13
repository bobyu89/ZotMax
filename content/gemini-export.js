/*
 * ZotMax — 匯出給 Gemini Notebook (feature geminiExport): the selected items, or a collection, as a folder of
 * files the user uploads to Gemini Notebook (formerly NotebookLM) themselves. Nothing is sent anywhere: the
 * export only writes files on this computer.
 *
 *   folder    <destination>/Gemini Notebook - <collection or 選取的文獻> - <YYYY-MM-DD>/ ; the destination is
 *             chosen in the export window (remembered in geminiExport.folder, else Downloads)
 *   per item  `Author Year - Short title.md`: title, authors, year, journal, DOI and APA 7 on top, then the
 *             full text as Markdown from the same pipeline as 全文筆記 (fulltext.js / fulltext-md.js: running
 *             heads, page numbers and hyphenation cleaned); the abstract when there is no usable text.
 *             With 「也複製 PDF」 the item's PDF too (a linked file that is missing is skipped with a note)
 *   lists     `00 參考文獻（APA 7）.md`: the reference list (Zotero's APA, Chinese APA 7 from apa-zh.js for
 *             Chinese items, Chinese first); `01 我的劃線與評讀.md` only when ticked: the user's highlights
 *             grouped by colour meaning and their own appraisal forms, labelled as the user's notes
 *   readme    `README - 如何加入 Gemini Notebook.txt`: where to upload, source limits, privacy, and that AI
 *             answers must be checked against the papers
 *   after     a native dialog: what was written, the notes, and 「打開資料夾」
 *
 * Gemini Notebook counts every file as one source, about 50 per notebook on the free plan (varies by plan):
 * the window counts the sources the export makes and says so when they pass the cap (geminiExport.cap).
 * The functions down to "Zotero" are pure (Node tests); the rest needs Zotero.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(require("./core.js"), require("./apa-zh.js"), globalThis);
	}
	else {
		(root.ZB = root.ZB || {}).geminiExport = factory(root.ZB.core, root.ZB.apaZh, root);
	}
})(this, function (core, apaZh, scope) {
	const PREF = "extensions.zotero-bridge.";
	const FEATURE = "geminiExport";
	const TITLE = "匯出給 Gemini Notebook";
	const DIALOG_URL = "chrome://zotero-bridge/content/gemini-export.xhtml";
	const DIALOG_ROOT = "zb-gemini";
	const HTML_NS = "http://www.w3.org/1999/xhtml";
	const SELECTED_NAME = "選取的文獻";
	const REFERENCES_FILE = "00 參考文獻（APA 7）.md";
	const HIGHLIGHTS_FILE = "01 我的劃線與評讀.md";
	const README_FILE = "README - 如何加入 Gemini Notebook.txt";
	const DEFAULT_CAP = 50;
	const MAX_BASENAME = 80;
	const NOTEBOOK_URL = "https://notebook.google.com";
	const OLD_NOTEBOOK_URL = "https://notebooklm.google.com";
	const LIMIT_TEXT = "每本筆記本約 50 個來源（依方案而異）";

	// Test hooks: dialog(info), notice(info), reveal(path), downloads(), now()
	const runtime = {};
	let busy = false;

	function ZB() {
		return scope.ZB;
	}

	// ---------- names (pure) ----------

	function pad(n) {
		return String(n).padStart(2, "0");
	}

	/** Local date as YYYY-MM-DD. */
	function dateStamp(date = new Date()) {
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	}

	/** "Gemini Notebook - <name> - <date>", safe as a folder name on every system. */
	function folderName(name, date = new Date()) {
		let n = core.sanitizeFilename(String(name || "").trim() || SELECTED_NAME).slice(0, 60).trim();
		return core.sanitizeFilename(`Gemini Notebook - ${n} - ${dateStamp(date)}`);
	}

	/** `Author Year - Short title` (the 文獻筆記's 「作者 年份 - 標題」 format), short enough for any file system. */
	function baseName(data) {
		let s = core.noteBasename(data, "authorYearTitle");
		if (s.length > MAX_BASENAME) s = s.slice(0, MAX_BASENAME).replace(/[\s.]+$/, "");
		return s || "Untitled";
	}

	/**
	 * One unique name per item (the same base for its .md and .pdf): a repeated name gets " (2)", " (3)"…
	 * Compared case-insensitively (Windows and macOS file systems). `reserved`: names already taken.
	 */
	function uniqueBaseNames(datas, reserved = []) {
		let used = new Set(reserved.map(n => n.toLowerCase()));
		return datas.map((d) => {
			let base = baseName(d);
			let name = base;
			for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
			used.add(name.toLowerCase());
			return name;
		});
	}

	/** Sources Gemini Notebook will count: one Markdown per item, the reference list, the highlights, the PDFs. */
	function sourceCount(o) {
		return (o.items || 0) + 1 + (o.highlights ? 1 : 0) + (o.copyPDF ? (o.pdfs || 0) : 0);
	}

	/** { count, cap, over } for the export window and the summary. */
	function capCheck(o, cap) {
		let c = Number(cap) > 0 ? Math.floor(Number(cap)) : DEFAULT_CAP;
		let count = sourceCount(o);
		return { count, cap: c, over: count > c };
	}

	/** The line under the options in the export window. */
	function capText(check) {
		if (!check.over) return `會產生 ${check.count} 個來源檔案；Gemini Notebook ${LIMIT_TEXT}。`;
		return `會產生 ${check.count} 個來源檔案，超過上限 ${check.cap} 個。Gemini Notebook ${LIMIT_TEXT}：`
			+ "超過的請分到另一本筆記本，或不要勾「也複製 PDF」。";
	}

	// ---------- files (pure) ----------

	function oneLine(s) {
		return String(s || "").replace(/\s+/g, " ").trim();
	}

	function doiURL(doi) {
		let d = String(doi || "").trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, "");
		return d ? `https://doi.org/${d}` : "";
	}

	function sourceLine(data) {
		let vi = data.volume ? `${data.volume}${data.issue ? `(${data.issue})` : ""}` : (data.issue ? `(${data.issue})` : "");
		return [data.publication, vi, data.pages].filter(Boolean).join(", ");
	}

	/**
	 * One item's Markdown: the bibliographic head, then the text. body: { kind: "fulltext" | "abstract" |
	 * "none", md, reason } — reason says why there is no full text ("scanned", "noFile").
	 */
	function itemMarkdown(data, body) {
		let head = [`# ${oneLine(data.title) || "（沒有篇名）"}`, ""];
		let authors = core.authorNames(data);
		let rows = [];
		if (authors.length) rows.push(`- 作者：${authors.join("、")}`);
		if (data.year) rows.push(`- 年份：${data.year}`);
		if (sourceLine(data)) rows.push(`- 出處：${sourceLine(data)}`);
		if (doiURL(data.doi)) rows.push(`- DOI：${doiURL(data.doi)}`);
		let apa = oneLine(data.apaMarkdown || data.apa);
		if (apa) rows.push(`- APA 7：${apa}`);
		head.push(...rows, "");
		let lead;
		if (body.kind === "fulltext") {
			lead = "> 由 ZotMax 從 Zotero 匯出：PDF 全文自動轉成 Markdown（表格、圖說和斷行可能不完整）。引用前請對照原文 PDF 與頁碼。";
		}
		else {
			let why = body.reason === "scanned" ? "PDF 是掃描檔、沒有文字層" : body.reason === "noFile" ? "Zotero 裡沒有這篇的 PDF 檔" : "沒有讀到全文";
			lead = `> 由 ZotMax 從 Zotero 匯出。${why}，所以這裡${body.kind === "abstract" ? "只有摘要" : "只有書目資料"}；需要全文時請上傳原文 PDF。`;
		}
		let parts = [...head, lead, "", "---", ""];
		if (body.kind === "fulltext") parts.push(String(body.md || "").trim());
		else if (body.kind === "abstract") parts.push("## 摘要（Abstract）", "", String(body.md || "").trim());
		return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
	}

	/** `00 參考文獻（APA 7）.md`: Chinese references first (stroke order), then the rest A–Z (apa-zh.js). */
	function referencesMarkdown(datas, o = {}) {
		let refs = datas.map(d => oneLine(d.apaMarkdown || d.apa) || `${core.authorNames(d).join(", ") || "（無作者）"} (${d.year || "n.d."}). ${oneLine(d.title)}.`);
		let sorted = apaZh ? apaZh.sortReferences(refs, datas) : refs.slice().sort((a, b) => a.localeCompare(b, "en"));
		return [
			"# 參考文獻（APA 7）",
			"",
			`${o.scopeName || SELECTED_NAME}・${datas.length} 篇・ZotMax 匯出於 ${o.date || dateStamp()}`,
			"",
			"> 由 Zotero 的書目資料產生（中文文獻用中文 APA 7）。作者、年份、卷期頁碼請以原文為準。",
			"",
			...sorted.flatMap(r => [r, ""]),
		].join("\n").trim() + "\n";
	}

	function annotationLine(ann) {
		let page = ann.pageLabel ? `（p. ${ann.pageLabel}）` : "";
		let text = oneLine(ann.text);
		let head;
		if ((ann.type === "highlight" || ann.type === "underline") && text) head = `「${text}」${page}`;
		else if (ann.type === "image") head = `（圖片註記）${page}`;
		else if (ann.type === "ink") head = `（手繪註記）${page}`;
		else if (ann.type === "note" || ann.type === "text") head = `（便利貼）${page}`;
		else head = `（劃線）${page}`;
		let out = [`- ${head}`];
		let comment = oneLine(ann.comment);
		if (comment) out.push(`  - 我的註記：${comment}`);
		return out.join("\n");
	}

	/**
	 * `01 我的劃線與評讀.md`: per item, the user's annotations grouped by colour meaning (core.annotationGroups)
	 * and their own appraisal form (a form that only holds the AI's prefill is left out). entries:
	 * [{ data, appraisal: { toolName, status, table, summary, overall } | null }]. "" when there is nothing.
	 */
	function highlightsMarkdown(entries, meanings, o = {}) {
		let sections = [];
		for (let { data, appraisal } of entries) {
			let groups = core.annotationGroups(data, meanings);
			if (!groups.length && !appraisal) continue;
			let part = [`## ${baseName(data)}`, ""];
			if (oneLine(data.title) && oneLine(data.title) !== baseName(data)) part.push(`篇名：${oneLine(data.title)}`, "");
			for (let g of groups) {
				part.push(`### ${g.info.emoji} ${g.meaning}（${g.items.length}）`, "");
				part.push(...g.items.map(({ ann }) => annotationLine(ann)), "");
			}
			if (appraisal) {
				part.push(`### 我的評讀：${appraisal.toolName}（${appraisal.status}）`, "");
				if (appraisal.summary) part.push(appraisal.summary, "");
				if (appraisal.table) part.push(appraisal.table, "");
				part.push(`整體評價：${appraisal.overall || "（未判定）"}`, "");
			}
			sections.push(part.join("\n").trim());
		}
		if (!sections.length) return "";
		return [
			"# 我的劃線與評讀",
			"",
			`${o.scopeName || SELECTED_NAME}・ZotMax 匯出於 ${o.date || dateStamp()}`,
			"",
			"> 這份是使用者自己在 Zotero 裡做的劃線、註記和評讀表，不是論文原文，也不是 AI 寫的。劃線依使用者設定的顏色意義分組；引用的文字請回原文核對頁碼。",
			"",
			sections.join("\n\n"),
		].join("\n").trim() + "\n";
	}

	/** `README - 如何加入 Gemini Notebook.txt`. */
	function readmeText(o) {
		let lines = [
			"如何把這個資料夾加入 Gemini Notebook",
			"====================================",
			"",
			`ZotMax 在 ${o.date} 從 Zotero 匯出：${o.scopeName}，${o.items} 篇文獻。`,
			"這個資料夾只在你的電腦上，ZotMax 沒有上傳任何東西。",
			"",
			"資料夾裡有什麼",
			"- 每篇文獻一個 .md 檔：標題、作者、年份、DOI 和 APA 7，接著是自動轉換的全文；沒有全文的只有摘要。",
			`- ${REFERENCES_FILE}：這些文獻的參考文獻清單。`,
		];
		if (o.highlights) lines.push(`- ${HIGHLIGHTS_FILE}：你自己的劃線、註記和評讀表（不是原文，也不是 AI 寫的）。`);
		if (o.pdfs) lines.push(`- ${o.pdfs} 個 PDF 檔：原文 PDF。`);
		lines.push("- 這份說明（不用上傳）。", "",
			"怎麼加入",
			`1. 用瀏覽器打開 ${NOTEBOOK_URL}（舊網址 ${OLD_NOTEBOOK_URL} 也會轉過去），登入你的 Google 帳號。`,
			"2. 建立新的筆記本，或打開一本既有的。",
			"3. 按「新增來源」→「上傳檔案」，把這個資料夾裡的 .md 檔（和要用的 PDF）拖進去。這份說明不用上傳。",
			"4. 等來源處理完成，就可以在 Gemini Notebook 裡提問、做摘要。",
			"",
			"注意",
			`- 來源有數量上限：${LIMIT_TEXT}，每個檔案也有大小上限。這次共 ${o.sources} 個檔案要上傳${o.over ? `，超過 ${o.cap} 個，請分成幾本筆記本` : ""}。`,
			"- 同一篇的 PDF 和 .md 都上傳，會占兩個來源，內容也重複，通常二選一就好。掃描版 PDF 沒有文字，.md 只有摘要，這時改上傳 PDF。",
			"- 上傳到 Gemini Notebook 就是把文獻內容交給 Google。未發表的研究資料、病人資訊不要上傳；也請確認期刊或學校對全文分享的規定。",
			"- AI 的摘要和回答可能出錯或漏掉重點：寫進報告或論文前，一定要回到原文核對，引用要用原文的頁碼。",
		);
		if (o.notes && o.notes.length) lines.push("", "這次匯出的備註", ...o.notes.map(n => `- ${n}`));
		return lines.join("\n") + "\n";
	}

	/** The dialog text after an export (and the notes, said once). */
	function doneText(r) {
		let lines = [`已匯出 ${r.items} 篇文獻到：`, r.dir, ""];
		lines.push(`共 ${r.sources} 個檔案要上傳（說明在資料夾裡的 README）。`);
		for (let n of r.notes) lines.push(`⚠ ${n}`);
		if (r.over) lines.push(`⚠ 超過 ${r.cap} 個來源的上限：Gemini Notebook ${LIMIT_TEXT}，請分成幾本筆記本。`);
		lines.push("", `沒有上傳任何東西。接下來在 ${NOTEBOOK_URL} 的筆記本按「新增來源」→「上傳檔案」。`);
		return lines.join("\n");
	}

	function listTitles(list, max = 3) {
		let shown = list.slice(0, max).map(t => `「${oneLine(t) || "（沒有篇名）"}」`).join("、");
		return list.length > max ? `${shown} 等 ${list.length} 篇` : shown;
	}

	/** The notes an export reports: no full text, PDFs that couldn't be copied, no highlights. */
	function exportNotes(r) {
		let notes = [];
		if (r.scanned.length) notes.push(`${r.scanned.length} 篇的 PDF 是掃描檔、沒有文字，.md 只有摘要：${listTitles(r.scanned)}。這幾篇建議改上傳 PDF。`);
		if (r.noText.length) notes.push(`${r.noText.length} 篇沒有讀到全文，.md 只有摘要或書目：${listTitles(r.noText)}。`);
		if (r.missingPDF.length) notes.push(`${r.missingPDF.length} 篇的 PDF 找不到檔案（連結的檔案可能搬走了），沒有複製：${listTitles(r.missingPDF)}。`);
		if (r.highlightsAsked && !r.highlights) notes.push("選取的文獻還沒有劃線或評讀表，所以沒有「我的劃線與評讀」。");
		return notes;
	}

	// ---------- the export window (DOM) ----------

	/**
	 * Draw the export options into `root` (an HTML element of the dialog window) and wire them up.
	 * info: { scopeName, titles, folder, folderName(name), pdfs, cap, copyPDF, highlights }
	 * handlers: { onExport({ folder, copyPDF, highlights }), onCancel(), pickFolder() → Promise<path|null> }
	 */
	function renderDialog(doc, root, info, handlers) {
		let el = (tag, attrs, text) => {
			let e = doc.createElementNS(HTML_NS, tag);
			for (let [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
			if (text !== undefined) e.textContent = text;
			return e;
		};
		root.replaceChildren();
		let decided = false;
		let folder = info.folder || "";

		let head = el("header", { class: "zb-cl-head" });
		head.append(
			el("h1", { class: "zb-cl-title" }, TITLE),
			el("p", { class: "zb-cl-lead" }, "只會在你的電腦上建立一個資料夾，不會上傳任何東西；之後由你自己把檔案加到 Gemini Notebook。"),
		);

		let list = el("div", { class: "zb-cl-list" });
		let what = el("section", { class: "zb-cl-item", "aria-labelledby": "zb-ge-what" });
		what.append(el("h2", { class: "zb-cl-item-title", id: "zb-ge-what" }, `${info.scopeName}：${info.titles.length} 篇文獻`));
		let details = el("details", { class: "zb-cl-without" });
		details.append(el("summary", {}, `看清單（${info.titles.length} 篇）`));
		let ul = el("ul");
		for (let t of info.titles) ul.append(el("li", {}, oneLine(t) || "（沒有篇名）"));
		details.append(ul);
		what.append(el("p", { class: "zb-cl-item-meta" }, "每篇一個全文 Markdown 檔（沒有全文的用摘要），加上參考文獻清單（APA 7）和一份使用說明。"), details);

		let where = el("section", { class: "zb-cl-item", "aria-labelledby": "zb-ge-where" });
		where.append(el("h2", { class: "zb-cl-item-title", id: "zb-ge-where" }, "放在哪裡"));
		let path = el("p", { class: "zb-ge-path", "data-zb-folder": "" });
		let row = el("div", { class: "zb-ge-row" });
		let pick = el("button", { type: "button", class: "zb-ge-pick" }, "選擇資料夾…");
		row.append(path, pick);
		let target = el("p", { class: "zb-cl-item-meta" });
		where.append(row, target);

		let options = el("section", { class: "zb-cl-item", "aria-labelledby": "zb-ge-options" });
		options.append(el("h2", { class: "zb-cl-item-title", id: "zb-ge-options" }, "也放進去"));
		let option = (id, label, hint, checked, disabled) => {
			let wrap = el("div", { class: "zb-ge-option" });
			let box = el("input", { type: "checkbox", id, "aria-describedby": `${id}-hint` });
			box.checked = !!checked;
			box.disabled = !!disabled;
			let lab = el("label", { for: id, class: "zb-ge-label" }, label);
			wrap.append(box, lab, el("p", { class: "zb-cl-why zb-ge-hint", id: `${id}-hint` }, hint));
			options.append(wrap);
			box.addEventListener("change", update);
			return box;
		};
		let pdf = option("zb-ge-pdf", info.pdfs ? `也複製 PDF（${info.pdfs} 篇有 PDF 檔）` : "也複製 PDF（選取的文獻沒有 PDF 檔）",
			"Gemini Notebook 把每個檔案算成一個來源：PDF 和 Markdown 都放，來源數會加倍、內容也重複。掃描檔沒有文字時才特別需要 PDF。",
			info.copyPDF && info.pdfs > 0, !info.pdfs);
		let mine = option("zb-ge-highlights", "加入「我的劃線與評讀」",
			"另一個檔案：你的劃線（依顏色意義分組）和你自己填的評讀表，會標明是你的筆記，不是原文。",
			info.highlights, false);
		let cap = el("p", { class: "zb-ge-cap", role: "status", "aria-live": "polite" });
		options.append(cap);
		list.append(what, where, options);

		let foot = el("footer", { class: "zb-cl-foot" });
		let summary = el("p", { class: "zb-cl-summary" }, "只寫入你電腦上的檔案。");
		let cancel = el("button", { type: "button", class: "zb-cl-cancel" }, "取消");
		let go = el("button", { type: "button", class: "zb-cl-apply" }, "匯出");
		cancel.addEventListener("click", () => finish(null));
		go.addEventListener("click", () => {
			if (folder) finish({ folder, copyPDF: pdf.checked, highlights: mine.checked });
		});
		pick.addEventListener("click", async () => {
			pick.disabled = true;
			try {
				let chosen = handlers.pickFolder ? await handlers.pickFolder(folder) : null;
				if (chosen) folder = chosen;
			}
			finally {
				pick.disabled = decided;
				update();
			}
		});
		let buttons = el("div", { class: "zb-cl-buttons" });
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
			target.textContent = folder ? `會在這裡建立「${info.folderName}」資料夾。` : "請先選一個資料夾。";
			let check = capCheck({ items: info.titles.length, pdfs: info.pdfs, copyPDF: pdf.checked, highlights: mine.checked }, info.cap);
			cap.textContent = capText(check);
			cap.classList.toggle("zb-ge-over", check.over);
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
		return { update, finish, boxes: { pdf, highlights: mine }, buttons: { go, cancel, pick } };
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

	function featureOn() {
		let f = ZB() && ZB().features;
		return !f || f.isEnabled(FEATURE);
	}

	function notify(text) {
		ZB().main.notify(`ZotMax：${TITLE}`, text);
	}

	function now() {
		return runtime.now ? runtime.now() : new Date();
	}

	/** The remembered destination, else the Downloads folder, else the home folder. */
	async function defaultFolder() {
		let saved = String(pref("geminiExport.folder") || "").trim();
		if (saved) {
			try {
				if (await IOUtils.exists(saved)) return saved;
			}
			catch (e) {}
		}
		if (runtime.downloads) return runtime.downloads();
		try {
			const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
			let dir = await Downloads.getPreferredDownloadsDirectory();
			if (dir) return dir;
		}
		catch (e) {}
		try {
			return Services.dirsvc.get("Home", Components.interfaces.nsIFile).path;
		}
		catch (e) {
			return "";
		}
	}

	/** The item's PDF to copy: { path } when its file is on this computer, { missing: true } when not, or null. */
	async function pdfOf(item) {
		let missing = false;
		for (let att of Zotero.Items.get(item.getAttachments())) {
			if (!att || !att.isPDFAttachment || !att.isPDFAttachment()) continue;
			let path = null;
			try {
				path = await att.getFilePathAsync();
			}
			catch (e) {
				path = null;
			}
			if (path) return { path };
			missing = true;
		}
		return missing ? { missing: true } : null;
	}

	/** The saved appraisal form of an item, as the highlights file shows it (null: none, or only the AI's prefill). */
	function appraisalOf(data) {
		let A = ZB().appraisalForm;
		let T = ZB().appraisalTools;
		if (!A || !T || !data.appraisalNote) return null;
		let record = A.readNoteHTML(data.appraisalNote.html);
		let tool = record && T.getTool(record.tool);
		if (!tool || !A.hasContent(record) || A.statusOf(record) === "ai") return null;
		return {
			toolName: tool.name,
			status: A.statusText(record),
			summary: T.describeSummary(T.summarize(tool, record.answers)),
			table: T.toMarkdownTable(tool, record.answers),
			overall: record.overall ? `${record.overall}${record.overallNote ? ` — ${record.overallNote}` : ""}` : "",
		};
	}

	/** One item's text: full text as Markdown (fulltext.js), else the abstract. */
	async function itemBody(data) {
		let prepared = null;
		try {
			prepared = await ZB().fulltext.prepare(data, null, null);
		}
		catch (e) {
			Zotero.logError(e);
		}
		if (prepared && prepared.sources.length) {
			let multi = prepared.sources.length > 1;
			let md = prepared.sources.map(s => (multi ? `## 附件：${s.title || s.key}\n\n${s.md}` : s.md)).join("\n\n---\n\n");
			return { kind: "fulltext", md };
		}
		let reason = data.fullTextStatus === "none" || data.fullTextStatus === "partial" ? "scanned" : data.fullTextStatus === "no_pdf" ? "noFile" : "";
		if (oneLine(data.abstract)) return { kind: "abstract", md: data.abstract, reason };
		return { kind: "none", md: "", reason };
	}

	async function freeDir(parent, name) {
		let dir = PathUtils.join(parent, name);
		for (let n = 2; await IOUtils.exists(dir); n++) dir = PathUtils.join(parent, `${name} (${n})`);
		return dir;
	}

	/**
	 * Write the export. opts: { folder (the destination), name (collection or 選取的文獻), copyPDF, highlights }.
	 * Returns { dir, items, files, pdfs, sources, cap, over, notes, scanned, noText, missingPDF }.
	 */
	async function exportTo(items, opts) {
		let date = dateStamp(now());
		let scopeName = String(opts.name || "").trim() || SELECTED_NAME;
		let A = ZB().adapter;
		let entries = [];
		for (let item of A.toRegularItems(items || [])) {
			let data = await A.extractItemData(item, { checkFullText: true });
			entries.push({ item, data });
		}
		if (!entries.length) throw new Error("沒有可以匯出的文獻。");
		let names = uniqueBaseNames(entries.map(e => e.data), [REFERENCES_FILE.replace(/\.md$/, ""), HIGHLIGHTS_FILE.replace(/\.md$/, "")]);
		let dir = await freeDir(opts.folder, folderName(scopeName, now()));
		await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
		let r = { dir, items: entries.length, files: [], pdfs: 0, scanned: [], noText: [], missingPDF: [], highlightsAsked: !!opts.highlights, highlights: false };
		for (let [i, e] of entries.entries()) {
			let body = await itemBody(e.data);
			if (body.kind !== "fulltext") (body.reason === "scanned" ? r.scanned : r.noText).push(e.data.title);
			let file = `${names[i]}.md`;
			await IOUtils.writeUTF8(PathUtils.join(dir, file), itemMarkdown(e.data, body));
			r.files.push(file);
			if (opts.copyPDF) {
				let pdf = await pdfOf(e.item);
				if (pdf && pdf.path) {
					try {
						await IOUtils.copy(pdf.path, PathUtils.join(dir, `${names[i]}.pdf`));
						r.files.push(`${names[i]}.pdf`);
						r.pdfs++;
					}
					catch (err) {
						Zotero.logError(err);
						r.missingPDF.push(e.data.title);
					}
				}
				else if (pdf && pdf.missing) r.missingPDF.push(e.data.title);
			}
		}
		let datas = entries.map(e => e.data);
		await IOUtils.writeUTF8(PathUtils.join(dir, REFERENCES_FILE), referencesMarkdown(datas, { scopeName, date }));
		r.files.push(REFERENCES_FILE);
		if (opts.highlights) {
			let meanings = core.colorMeanings(pref("annotations.colorMeanings") || "");
			let md = highlightsMarkdown(datas.map(data => ({ data, appraisal: appraisalOf(data) })), meanings, { scopeName, date });
			if (md) {
				await IOUtils.writeUTF8(PathUtils.join(dir, HIGHLIGHTS_FILE), md);
				r.files.push(HIGHLIGHTS_FILE);
				r.highlights = true;
			}
		}
		let check = capCheck({ items: entries.length, pdfs: r.pdfs, copyPDF: true, highlights: r.highlights }, pref("geminiExport.cap"));
		Object.assign(r, { sources: check.count, cap: check.cap, over: check.over });
		r.notes = exportNotes(r);
		await IOUtils.writeUTF8(PathUtils.join(dir, README_FILE), readmeText({
			date, scopeName, items: entries.length, highlights: r.highlights, pdfs: r.pdfs, sources: r.sources, cap: r.cap, over: r.over, notes: r.notes,
		}));
		r.files.push(README_FILE);
		return r;
	}

	/** Wait for the dialog document (not the initial about:blank) to be ready. */
	function waitForDialog(win, timeoutMs = 15000) {
		return new Promise((resolve, reject) => {
			let start = Date.now();
			let check = () => {
				try {
					let doc = win.document;
					let rootEl = doc && doc.getElementById(DIALOG_ROOT);
					if (rootEl && doc.readyState === "complete") {
						resolve(rootEl);
						return;
					}
				}
				catch (e) {}
				if (win.closed || Date.now() - start > timeoutMs) {
					reject(new Error("匯出視窗沒有開啟"));
					return;
				}
				setTimeout(check, 50);
			};
			check();
		});
	}

	async function pickFolder(win, current) {
		const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
		let fp = new FilePicker();
		fp.init(win, "匯出到哪個資料夾", fp.modeGetFolder);
		try {
			if (current) fp.displayDirectory = current;
		}
		catch (e) {}
		if (await fp.show() !== fp.returnOK) return null;
		return fp.file;
	}

	/** The export window: resolves { folder, copyPDF, highlights } or null (cancelled, closed). */
	async function dialog(info, opts = {}) {
		if (runtime.dialog) return runtime.dialog(info);
		let main = Zotero.getMainWindow();
		let win = main.openDialog(DIALOG_URL, "zotero-bridge-gemini-export", "chrome,dialog=no,resizable,centerscreen");
		let rootEl = await waitForDialog(win);
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
			renderDialog(win.document, rootEl, info, {
				onExport: choice => finish(choice),
				onCancel: () => finish(null),
				pickFolder: current => pickFolder(win, current),
			});
			if (opts.onOpen) opts.onOpen(win);
		});
	}

	/** After the export: { text, buttons } for the dialog (「打開資料夾」 and 「關閉」). */
	function noticeInfo(result) {
		return { text: doneText(result), buttons: ["open", "close"], result };
	}

	/** The native dialog after an export: "open" | "close". */
	function notice(info) {
		if (runtime.notice) return runtime.notice(info);
		let p = Services.prompt;
		let flags = p.BUTTON_POS_0 * p.BUTTON_TITLE_IS_STRING + p.BUTTON_POS_1 * p.BUTTON_TITLE_IS_STRING + p.BUTTON_POS_0_DEFAULT;
		let b = p.confirmEx(Zotero.getMainWindow(), TITLE, info.text, flags, "打開資料夾", "關閉", null, null, {});
		return b === 0 ? "open" : "close";
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
	 * The command: the selected items (or a collection's), the export window, the export, the dialog after
	 * it. scope: { name } (the collection's name; 選取的文獻 when empty). opts: { dialog(info), notice(info) }
	 * for tests. Returns the export result, { cancelled: true }, or null.
	 */
	async function run(items, scopeInfo = {}, opts = {}) {
		if (!featureOn()) {
			ZB().main.notifyFeatureOff(FEATURE);
			return null;
		}
		let regular = ZB().adapter.toRegularItems(items || []);
		if (!regular.length) {
			notify("請先選取文獻，或在分類上按右鍵。");
			return null;
		}
		if (busy) {
			notify("上一次的匯出還沒結束。");
			return null;
		}
		busy = true;
		try {
			let scopeName = String(scopeInfo.name || "").trim() || SELECTED_NAME;
			let pdfs = 0;
			for (let item of regular) {
				let pdf = await pdfOf(item);
				if (pdf && pdf.path) pdfs++;
			}
			let info = {
				scopeName,
				titles: regular.map(i => i.getField("title")),
				folder: await defaultFolder(),
				folderName: folderName(scopeName, now()),
				pdfs,
				cap: Number(pref("geminiExport.cap")) || DEFAULT_CAP,
				copyPDF: pref("geminiExport.copyPDF") === true,
				highlights: pref("geminiExport.highlights") === true,
			};
			let choice;
			try {
				choice = await (opts.dialog || dialog)(info);
			}
			catch (e) {
				Zotero.logError(e);
				notify(`匯出視窗沒有開啟（${e.message || e}）。可以重新啟動 Zotero 後再試一次。`);
				return null;
			}
			if (!choice) return { cancelled: true };
			setPref("geminiExport.folder", choice.folder);
			setPref("geminiExport.copyPDF", !!choice.copyPDF);
			setPref("geminiExport.highlights", !!choice.highlights);
			let result;
			try {
				result = await exportTo(regular, { folder: choice.folder, name: scopeName, copyPDF: choice.copyPDF, highlights: choice.highlights });
			}
			catch (e) {
				Zotero.logError(e);
				notify(`匯出失敗：${e.message || e}`);
				return null;
			}
			let shown = noticeInfo(result);
			let action = (opts.notice || notice)(shown);
			if (action === "open") await reveal(result.dir);
			return Object.assign({ action, buttons: shown.buttons }, result);
		}
		finally {
			busy = false;
		}
	}

	return {
		FEATURE, DIALOG_URL, DIALOG_ROOT, REFERENCES_FILE, HIGHLIGHTS_FILE, README_FILE, DEFAULT_CAP, SELECTED_NAME, NOTEBOOK_URL, runtime,
		// pure
		dateStamp, folderName, baseName, uniqueBaseNames, sourceCount, capCheck, capText, itemMarkdown, referencesMarkdown,
		highlightsMarkdown, readmeText, doneText, exportNotes, renderDialog,
		// Zotero
		defaultFolder, pdfOf, appraisalOf, exportTo, dialog, noticeInfo, run,
	};
});
