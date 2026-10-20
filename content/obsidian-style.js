/*
 * ZotMax — the 看板 style for Obsidian: one CSS snippet, `<vault>/.obsidian/snippets/zotmax.css`.
 *
 * The literature notes' 「重點」 board, the 研究儀表板 and the 首頁 are written as nested callouts with ZotMax's own
 * types (core.js buildBoard, dashboard.js boardDashboard, topics.js boardHome): `[!zm-board]` holds `[!zm-stats]`,
 * `[!zm-summary]`, `[!zm-pico]`, `[!zm-findings]`, `[!zm-appraisal]`, `[!zm-highlights]`, `[!zm-next]`, `[!zm-kpi]`,
 * `[!zm-chart]`, `[!zm-topic]` and the to-do list cards; below it the long parts sit in four folded groups
 * (`[!zm-mine]`, `[!zm-form]`, `[!zm-ai]`, `[!zm-ref]`). Without the snippet they read as stacked callouts; with it the
 * board becomes a grid of flat cards (two to four columns, two or one on a phone), 研究概要 becomes tiles, PICO a
 * grid with letter badges, and KPI numbers are set large. Every card shares one look (neutral, titles and Lucide
 * icons in the theme's accent colour); only colour that means something stays. `cssclasses: zm-compact-props` on a
 * note hides the properties the board already shows. Only Obsidian's own CSS variables are used, so light, dark and
 * any theme follow. The snippet arranges and colours; it never carries meaning (DESIGN.md, Plain-Markdown Rule).
 *
 * Installing (the settings button, or once on the first sync with the 看板 layout): the file is written and
 * "zotmax" is added to `.obsidian/appearance.json` → enabledCssSnippets. A snippet the user turned off stays off
 * (installation runs once; the pref obsidian.styleInstalled records it). Later versions rewrite the file only
 * while it still starts with ZotMax's header, so a copy the user edited is never touched.
 *
 * The functions down to "Zotero" are pure (Node tests); the rest needs Zotero.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(globalThis);
	}
	else {
		(root.ZB = root.ZB || {}).obsidianStyle = factory(root);
	}
})(this, function (scope) {
	const PREF = "extensions.zotero-bridge.";
	const SNIPPET = "zotmax";
	const FILE_NAME = `${SNIPPET}.css`;
	// Bumped whenever the CSS changes, so installed copies are refreshed on the next sync
	const VERSION = 4;
	const HEADER_RE = /^\/\* ZotMax 看板樣式 v(\d+)\b/;

	/**
	 * Card types and their Lucide icons. Since v4 every card shares one look: neutral cards, titles and icons in the
	 * user's accent colour (--text-accent), so a page reads as one set; colour that means something stays (the
	 * highlight and status squares, 下一步's amber).
	 */
	const CARDS = [
		["zm-stats", "lucide-gauge"],
		["zm-summary", "lucide-quote"],
		["zm-pico", "lucide-target"],
		["zm-findings", "lucide-sparkles"],
		["zm-appraisal", "lucide-clipboard-check"],
		["zm-highlights", "lucide-highlighter"],
		["zm-next", "lucide-list-todo"],
		["zm-kpi", "lucide-activity"],
		["zm-chart", "lucide-chart-column"],
		["zm-topic", "lucide-folder-open"],
		["zm-reading", "lucide-book-open"],
		["zm-inbox", "lucide-inbox"],
		["zm-issues", "lucide-triangle-alert"],
		["zm-review", "lucide-git-branch"],
	];

	// The folded groups at the bottom of a literature note and the dashboard's details (core.js SECTION_GROUPS)
	const GROUPS = [
		["zm-mine", "lucide-highlighter"],
		["zm-form", "lucide-clipboard-list"],
		["zm-ai", "lucide-bot"],
		["zm-ref", "lucide-library"],
	];

	// Plugin-managed properties the compact properties area hides (core.js MANAGED_KEYS without tags, plus the
	// reading-status bookkeeping); the 看板 shows what matters of them. A test keeps the list in step.
	const HIDDEN_PROPERTIES = [
		"title", "authors", "year", "publication", "item_type", "doi", "url", "citekey",
		"zotero", "zotero_key", "library", "collections", "notion",
		"study_design", "sample_size", "evidence_level", "jbi_level", "appraisal_tool", "appraisal_overall",
		"setting", "population", "intervention", "comparison", "outcomes", "measures", "country", "effect_direction",
		"appraisal_verified", "ai_model", "ai_generated", "fulltext_truncated", "date_added", "last_synced",
		"full_text", "fulltext", "zotero_deleted", "status_before_delete", "cssclasses", "status_synced",
	];

	function header() {
		return `/* ZotMax 看板樣式 v${VERSION} — 由 ZotMax 寫入，更新時會整個覆寫。想自己改，請另存成別的檔名再修改。 */`;
	}

	/** The snippet's text. */
	function css() {
		let icons = [...CARDS, ...GROUPS].map(([type, icon]) => `.callout[data-callout="${type}"] {\n\t--callout-icon: ${icon};\n}`).join("\n");
		let cards = CARDS.map(([type]) => `.callout[data-callout="${type}"]`).join(",\n");
		let groups = GROUPS.map(([type]) => `.callout[data-callout="${type}"]`).join(",\n");
		let hidden = HIDDEN_PROPERTIES.map(k => `\t[data-property-key="${k}"]`).join(",\n");
		return `${header()}

/* 共用：一個中性色加上你在 Obsidian 選的強調色；有意義的顏色（劃線、閱讀狀態、下一步）才另外上色 */
body {
	--zm-neutral: 100, 116, 139;
	--zm-attention: 217, 119, 6;
}
.callout[data-callout^="zm-"] {
	--callout-color: var(--zm-neutral);
	mix-blend-mode: normal;
}

/* 看板：一個大框，裡面的卡片排成格狀（手機上自動變成一欄） */
.callout[data-callout="zm-board"] {
	--callout-icon: lucide-layout-dashboard;
	background-color: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 14px;
	padding: 12px 14px 14px;
}
.callout[data-callout="zm-board"] > .callout-title {
	font-size: 0.95em;
	color: var(--text-muted);
	padding-bottom: 8px;
}
.callout[data-callout="zm-board"] > .callout-content {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
	gap: 10px;
	/* 同一排的卡片一樣高；半欄的卡片補進前面的空位 */
	align-items: stretch;
	grid-auto-flow: row dense;
}
/* 文獻筆記的「重點」（有「下一步」卡）最多兩欄；儀表板的數字卡可以三、四欄 */
.callout[data-callout="zm-board"] > .callout-content:has(> .callout[data-callout="zm-next"]) {
	grid-template-columns: repeat(auto-fit, minmax(min(100%, max(230px, calc(50% - 5px))), 1fr));
}
/* 卡片以外的內容（最上面的作者・年份・期刊、最下面的連結）佔滿整列 */
.callout[data-callout="zm-board"] > .callout-content > :not(.callout) {
	grid-column: 1 / -1;
	margin: 0;
}
.callout[data-callout="zm-board"] > .callout-content > p:first-child {
	color: var(--text-muted);
	font-size: 0.92em;
}
.callout[data-callout="zm-board"] > .callout-content > p:last-child {
	font-size: 0.9em;
}

/* 卡片：平的、細框、圓角，標題小字用強調色 */
${cards} {
	margin: 0;
	padding: 10px 12px;
	background-color: var(--background-primary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 10px;
	min-width: 0;
	--list-indent: 1.1em;
	--list-spacing: 0.25em;
}
.callout[data-callout="zm-board"] > .callout-content > .callout > .callout-title {
	font-size: 0.8em;
	font-weight: 600;
	letter-spacing: 0.02em;
	color: var(--text-accent);
	padding: 0 0 6px;
}
.callout[data-callout="zm-board"] > .callout-content > .callout > .callout-content > :first-child {
	margin-top: 0;
}
.callout[data-callout="zm-board"] > .callout-content > .callout > .callout-content > :last-child {
	margin-bottom: 0;
}
.callout[data-callout="zm-board"] > .callout-content > .callout ul {
	padding-inline-start: 1.1em;
	margin-block: 0;
}
.callout[data-callout="zm-board"] .callout[data-callout-metadata~="wide"] {
	grid-column: 1 / -1;
}
/* 沒有評讀卡時 PICO 佔滿整列；沒有 PICO 時評讀佔滿整列 */
.callout[data-callout="zm-board"] > .callout-content:not(:has(> .callout[data-callout="zm-appraisal"])) > .callout[data-callout="zm-pico"],
.callout[data-callout="zm-board"] > .callout-content:not(:has(> .callout[data-callout="zm-pico"])) > .callout[data-callout="zm-appraisal"] {
	grid-column: 1 / -1;
}

/* 研究概要：一排數字磚（上面小字是項目，下面大字是值） */
.callout[data-callout="zm-stats"] {
	background-color: transparent;
	border: none;
	padding: 0;
}
.callout[data-callout="zm-board"] > .callout-content > .callout[data-callout="zm-stats"] > .callout-title {
	display: none;
}
.callout[data-callout="zm-stats"] ul {
	list-style: none;
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 118px), 1fr));
	gap: 8px;
	padding-inline-start: 0;
	margin: 0;
}
.callout[data-callout="zm-board"] > .callout-content > .callout[data-callout="zm-stats"] ul {
	padding-inline-start: 0;
}
.callout[data-callout="zm-stats"] li {
	margin: 0;
	padding: 8px 10px;
	background-color: var(--background-primary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 10px;
	font-size: 0.78em;
	color: var(--text-muted);
	line-height: 1.35;
}
.callout[data-callout="zm-stats"] li strong {
	display: block;
	font-size: 1.4em;
	font-weight: 650;
	line-height: 1.3;
	color: var(--text-normal);
}
.callout:is([data-callout="zm-stats"], [data-callout="zm-pico"]) li::marker {
	content: "";
}
.callout:is([data-callout="zm-stats"], [data-callout="zm-pico"]) .list-bullet,
.callout:is([data-callout="zm-stats"], [data-callout="zm-pico"]) .list-collapse-indicator {
	display: none;
}

/* 一句話：大一點的字，第一眼就讀到 */
.callout[data-callout="zm-summary"] > .callout-content {
	font-size: 1.1em;
	line-height: 1.6;
}

/* PICO：四格，字母是圓形標記 */
.callout[data-callout="zm-pico"] ul {
	list-style: none;
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
	gap: 6px;
	margin: 0;
}
.callout[data-callout="zm-board"] > .callout-content > .callout[data-callout="zm-pico"] ul {
	padding-inline-start: 0;
}
.callout[data-callout="zm-pico"] li {
	margin: 0;
	padding: 6px 8px;
	background-color: var(--background-secondary);
	border-radius: 8px;
	line-height: 1.45;
}
.callout[data-callout="zm-pico"] li > strong:first-child {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1.6em;
	height: 1.6em;
	margin-inline-end: 6px;
	border-radius: 50%;
	background-color: var(--interactive-accent);
	color: var(--text-on-accent);
	font-size: 0.78em;
}

/* 我的劃線：第一行的色塊條放大 */
.callout[data-callout="zm-highlights"] > .callout-content > p:first-child {
	font-size: 1.15em;
	letter-spacing: 1px;
	line-height: 1.2;
	margin-bottom: 4px;
}

/* 下一步：唯一用提醒色的卡片 */
.callout[data-callout="zm-board"] > .callout-content > .callout[data-callout="zm-next"] {
	background-color: rgba(var(--zm-attention), 0.06);
	border-color: rgba(var(--zm-attention), 0.35);
}
.callout[data-callout="zm-board"] > .callout-content > .callout[data-callout="zm-next"] > .callout-title {
	color: rgb(var(--zm-attention));
}

/* 數字卡：四張時排成一列（首頁），六張時三欄兩列（儀表板） */
body:not(.is-phone) .callout[data-callout="zm-board"] > .callout-content:has(> .callout[data-callout="zm-kpi"]:last-child:nth-child(4)) {
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
}
.callout[data-callout="zm-kpi"] strong {
	display: inline-block;
	font-size: 1.9em;
	line-height: 1.15;
	color: var(--text-normal);
	font-variant-numeric: tabular-nums;
}

/* 圖表卡：Mermaid 圓餅圖縮到卡片寬度；文字長條用等寬數字；走勢線放大 */
.callout[data-callout="zm-chart"] .mermaid svg {
	max-width: 100%;
	height: auto;
}
.callout[data-callout="zm-chart"] > .callout-content {
	font-variant-numeric: tabular-nums;
}
.callout[data-callout="zm-chart"] code {
	display: inline-block;
	font-size: 1.6em;
	line-height: 1.1;
	letter-spacing: 1px;
	padding: 0;
	background: none;
	color: var(--text-accent);
}

/* 快速入口：一排按鈕 */
.callout[data-callout="zm-links"] {
	--callout-icon: lucide-rocket;
	background-color: transparent;
	border: none;
	padding: 0;
}
.callout[data-callout="zm-links"] > .callout-title {
	font-size: 0.85em;
	color: var(--text-muted);
	padding: 0 0 6px;
}
.callout[data-callout="zm-links"] > .callout-content > p {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin: 0;
	font-size: 0;
}
.callout[data-callout="zm-links"] > .callout-content > p a {
	font-size: var(--font-text-size);
	padding: 6px 12px;
	border-radius: 999px;
	border: 1px solid var(--background-modifier-border);
	background-color: var(--background-secondary);
	color: var(--text-normal);
	text-decoration: none;
}

/* 下面收起來的區塊（文獻筆記的四組、儀表板的詳細數字）：同一個樣子，整列都好按 */
${groups} {
	margin: 8px 0;
	padding: 0;
	background-color: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 10px;
}
.callout:is(${GROUPS.map(([t]) => `[data-callout="${t}"]`).join(", ")}) > .callout-title {
	padding: 11px 14px;
	color: var(--text-normal);
	font-weight: 600;
}
.callout:is(${GROUPS.map(([t]) => `[data-callout="${t}"]`).join(", ")}) > .callout-title .callout-icon {
	color: var(--text-accent);
}
.callout:is(${GROUPS.map(([t]) => `[data-callout="${t}"]`).join(", ")}) > .callout-content {
	padding: 0 14px 12px;
}

/* 最上面的「更新於…」：小字、收起來 */
.callout[data-callout="zm-meta"] {
	--callout-icon: lucide-info;
	background-color: transparent;
	border: none;
	padding: 0;
	font-size: 0.85em;
}
.callout[data-callout="zm-meta"] > .callout-title {
	color: var(--text-muted);
	font-weight: 500;
}

/* 文獻筆記最上面的導覽列：🏠 首頁 › 主題，下一行「跳到」各段 */
.callout[data-callout="zm-nav"] {
	--callout-icon: lucide-compass;
	padding: 6px 12px;
	border-radius: 10px;
	border: 1px solid var(--background-modifier-border);
	background-color: var(--background-secondary);
	font-size: 0.9em;
}
.callout[data-callout="zm-nav"] > .callout-title {
	padding: 0;
	gap: 6px;
}
.callout[data-callout="zm-nav"] > .callout-content {
	padding: 2px 0 0;
	color: var(--text-muted);
}
.callout[data-callout="zm-nav"] > .callout-content > p {
	margin: 0;
}

/* 文獻筆記：檔名（citekey）小字，標題不要大到佔滿手機螢幕 */
.zotmax-note .inline-title {
	font-size: 0.95em;
	font-weight: 500;
	color: var(--text-faint);
}
.zotmax-note h1 {
	font-size: 1.55em;
	line-height: 1.3;
}
/* 精簡的屬性區：只留閱讀狀態、標籤和你自己加的屬性；其他都在看板上 */
.zm-compact-props .metadata-property:is(
${hidden}
) {
	display: none;
}

/* 手機與平板：外框和卡片的內距縮小，數字小一點，數字磚兩個一排，寬表格可以左右滑 */
.is-mobile .callout[data-callout="zm-board"] {
	padding: 8px 8px 10px;
	border-radius: 12px;
}
.is-mobile .callout[data-callout="zm-board"] > .callout-content {
	gap: 8px;
}
.is-mobile .callout[data-callout="zm-board"] > .callout-content > .callout {
	padding: 8px 10px;
}
.is-mobile .callout[data-callout="zm-board"] > .callout-content > .callout[data-callout="zm-stats"] {
	padding: 0;
}
.is-phone .callout[data-callout="zm-stats"] ul {
	grid-template-columns: repeat(2, minmax(0, 1fr));
}
/* 手機上數字卡兩張一排，不會一張一張往下排太長 */
.is-phone .callout[data-callout="zm-board"] > .callout-content:has(> .callout[data-callout="zm-kpi"]) {
	grid-template-columns: repeat(2, minmax(0, 1fr));
}
.is-phone .callout[data-callout="zm-kpi"] strong {
	font-size: 1.5em;
}
.is-phone .callout[data-callout="zm-kpi"] > .callout-content {
	font-size: 0.85em;
}
.is-phone .zotmax-note h1 {
	font-size: 1.3em;
}
.is-phone .callout[data-callout="zm-nav"] {
	padding: 6px 10px;
}
.is-mobile .callout:is(${GROUPS.map(([t]) => `[data-callout="${t}"]`).join(", ")}) > .callout-title {
	padding: 13px 12px;
}
.is-mobile .markdown-rendered:has(.callout[data-callout^="zm-"]) table {
	display: block;
	max-width: 100%;
	overflow-x: auto;
}

/* 每種卡片的圖示 */
${icons}
`;
	}

	/** The version a snippet's text was written by; null when it isn't ZotMax's (or was edited at the top). */
	function versionOf(text) {
		let m = HEADER_RE.exec(String(text || ""));
		return m ? Number(m[1]) : null;
	}

	/**
	 * appearance.json with "zotmax" among enabledCssSnippets. Returns { text, changed }; a file that isn't valid JSON
	 * is left alone (changed false, error set).
	 */
	function enableIn(text) {
		let conf;
		try {
			conf = text && String(text).trim() ? JSON.parse(text) : {};
		}
		catch (e) {
			return { text, changed: false, error: "appearance.json 不是有效的 JSON" };
		}
		if (!conf || typeof conf !== "object" || Array.isArray(conf)) return { text, changed: false, error: "appearance.json 的格式看不懂" };
		let list = Array.isArray(conf.enabledCssSnippets) ? conf.enabledCssSnippets.slice() : [];
		if (list.includes(SNIPPET)) return { text, changed: false };
		list.push(SNIPPET);
		conf.enabledCssSnippets = list;
		return { text: JSON.stringify(conf, null, 2), changed: true };
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

	function paths(vaultPath) {
		let config = PathUtils.join(vaultPath, ".obsidian");
		return { config, snippets: PathUtils.join(config, "snippets"), file: PathUtils.join(config, "snippets", FILE_NAME), appearance: PathUtils.join(config, "appearance.json") };
	}

	/**
	 * Write the snippet (and, with opts.enable, turn it on in appearance.json). opts.force rewrites a copy the user
	 * edited. Returns { status: "written" | "updated" | "current" | "edited" | "noConfig", enabled, error, path }.
	 */
	async function install(vaultPath, opts = {}) {
		let p = paths(vaultPath);
		if (!vaultPath || !(await IOUtils.exists(p.config))) return { status: "noConfig", enabled: false, path: p.file };
		let existing = (await IOUtils.exists(p.file)) ? await IOUtils.readUTF8(p.file) : null;
		let text = css();
		let status;
		if (existing === null) status = "written";
		else if (existing === text) status = "current";
		else if (versionOf(existing) === null && !opts.force) status = "edited";
		else status = "updated";
		if (status === "written" || status === "updated") {
			await IOUtils.makeDirectory(p.snippets, { createAncestors: true, ignoreExisting: true });
			await IOUtils.writeUTF8(p.file, text);
		}
		let r = { status, enabled: false, error: "", path: p.file };
		if (opts.enable) {
			let before = (await IOUtils.exists(p.appearance)) ? await IOUtils.readUTF8(p.appearance) : "";
			let e = enableIn(before);
			if (e.error) r.error = e.error;
			else {
				if (e.changed) await IOUtils.writeUTF8(p.appearance, e.text);
				r.enabled = true;
			}
		}
		return r;
	}

	/**
	 * After a sync into the vault with the 看板 layout: install and enable once (the first time), afterwards only
	 * refresh an outdated copy that is still ZotMax's. Never throws; returns install()'s result or null.
	 */
	async function afterSync(settings) {
		try {
			if (!settings || !settings.vaultPath || pref("obsidian.layout") === "classic") return null;
			if (pref("obsidian.styleInstalled") !== true) {
				let r = await install(settings.vaultPath, { enable: true });
				if (r.status !== "noConfig") setPref("obsidian.styleInstalled", true);
				return r;
			}
			let p = paths(settings.vaultPath);
			if (!(await IOUtils.exists(p.file))) return null;
			let existing = await IOUtils.readUTF8(p.file);
			let v = versionOf(existing);
			if (v === null || v >= VERSION) return null;
			return await install(settings.vaultPath);
		}
		catch (e) {
			Zotero.logError(e);
			return null;
		}
	}

	/** The settings button's line after an install. */
	function describe(r) {
		if (!r) return "";
		if (r.status === "noConfig") return "找不到 vault 裡的 .obsidian 資料夾：請先用 Obsidian 打開這個 vault 一次，再按一次。";
		let what = { written: "已寫入", updated: "已更新", current: "已是最新版", edited: "你改過這個檔案，所以沒有覆寫" }[r.status];
		let tail = r.enabled ? "，也已在 Obsidian 啟用（Obsidian 開著的話，到 設定 → 外觀 → CSS 片段 按重新整理）。"
			: r.error ? `；沒有自動啟用（${r.error}），請到 Obsidian 設定 → 外觀 → CSS 片段 打開「${SNIPPET}」。`
			: `；請到 Obsidian 設定 → 外觀 → CSS 片段 打開「${SNIPPET}」。`;
		return `看板樣式 ${what}：.obsidian/snippets/${FILE_NAME}${tail}`;
	}

	return { SNIPPET, FILE_NAME, VERSION, CARDS, GROUPS, HIDDEN_PROPERTIES, header, css, versionOf, enableIn, install, afterSync, describe };
});
