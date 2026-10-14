/*
 * ZotMax — the 看板 style for Obsidian: one CSS snippet, `<vault>/.obsidian/snippets/zotmax.css`.
 *
 * The literature notes' 「重點」 board and the 研究儀表板's 總覽 are written as nested callouts with ZotMax's own
 * types (core.js buildBoard, dashboard.js overviewBoard and chartsBoard): `[!zm-board]` holds `[!zm-summary]`,
 * `[!zm-pico]`, `[!zm-findings]`, `[!zm-appraisal]`, `[!zm-highlights]`, `[!zm-next]`, `[!zm-kpi]`, `[!zm-chart]` and `[!zm-topic]` cards. Without the
 * snippet they read as stacked callouts; with it the board becomes a grid of flat cards (two to four columns,
 * one on a phone), the facts line becomes pills, each card type gets its own colour and Lucide icon, and KPI
 * numbers are set large. Only Obsidian's own CSS variables are used, so light, dark and any theme follow.
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
	const VERSION = 2;
	const HEADER_RE = /^\/\* ZotMax 看板樣式 v(\d+)\b/;

	/** Card types: [callout type, "r, g, b", Lucide icon]. */
	const CARDS = [
		["zm-summary", "59, 130, 246", "lucide-quote"],
		["zm-pico", "16, 163, 127", "lucide-target"],
		["zm-findings", "217, 119, 6", "lucide-sparkles"],
		["zm-appraisal", "124, 58, 237", "lucide-clipboard-check"],
		["zm-highlights", "202, 138, 4", "lucide-highlighter"],
		["zm-next", "225, 29, 72", "lucide-list-todo"],
		["zm-kpi", "79, 70, 229", "lucide-activity"],
		["zm-chart", "13, 148, 136", "lucide-chart-column"],
		["zm-topic", "8, 145, 178", "lucide-folder-open"],
	];

	function header() {
		return `/* ZotMax 看板樣式 v${VERSION} — 由 ZotMax 寫入，更新時會整個覆寫。想自己改，請另存成別的檔名再修改。 */`;
	}

	/** The snippet's text. */
	function css() {
		let cardRules = CARDS.map(([type, rgb, icon]) => `.callout[data-callout="${type}"] {\n\t--callout-color: ${rgb};\n\t--callout-icon: ${icon};\n}`).join("\n");
		return `${header()}

/* 看板：一個大框，裡面的卡片排成格狀（手機上自動變成一欄） */
.callout[data-callout="zm-board"] {
	--callout-color: 100, 116, 139;
	--callout-icon: lucide-layout-dashboard;
	background-color: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 14px;
	padding: 12px 14px 14px;
	mix-blend-mode: normal;
}
.callout[data-callout="zm-board"] > .callout-title {
	font-size: 1.05em;
	padding-bottom: 6px;
}
.callout[data-callout="zm-board"] > .callout-content {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
	gap: 10px;
	/* 同一排的卡片一樣高；半欄的卡片補進前面的空位（PICO 旁邊放評讀） */
	align-items: stretch;
	grid-auto-flow: row dense;
}
/* 文獻筆記的「重點」（有「下一步」卡）最多兩欄；儀表板的數字卡可以三、四欄 */
.callout[data-callout="zm-board"] > .callout-content:has(> .callout[data-callout="zm-next"]) {
	grid-template-columns: repeat(auto-fit, minmax(min(100%, max(230px, calc(50% - 5px))), 1fr));
}
/* 卡片以外的內容（第一行的標籤、最後一行的連結）佔滿整列 */
.callout[data-callout="zm-board"] > .callout-content > :not(.callout) {
	grid-column: 1 / -1;
	margin: 0;
}
.callout[data-callout="zm-board"] > .callout-content > .callout {
	margin: 0;
	padding: 10px 12px;
	background-color: var(--background-primary);
	border: 1px solid var(--background-modifier-border);
	border-top: 3px solid rgba(var(--callout-color), 0.85);
	border-radius: 10px;
	mix-blend-mode: normal;
	min-width: 0;
}
.callout[data-callout="zm-board"] .callout[data-callout-metadata~="wide"] {
	grid-column: 1 / -1;
}
/* 主要發現是長句子，佔滿整列才好讀；沒有評讀卡時，PICO 也佔滿整列，不會留半排空白 */
.callout[data-callout="zm-board"] > .callout-content > .callout[data-callout="zm-findings"],
.callout[data-callout="zm-board"] > .callout-content:not(:has(> .callout[data-callout="zm-appraisal"])) > .callout[data-callout="zm-pico"] {
	grid-column: 1 / -1;
}
.callout[data-callout="zm-board"] > .callout-content > .callout > .callout-title {
	font-size: 0.9em;
	padding: 0 0 6px;
}
.callout[data-callout="zm-board"] > .callout-content > .callout > .callout-content > :first-child {
	margin-top: 0;
}
.callout[data-callout="zm-board"] > .callout-content > .callout > .callout-content > :last-child {
	margin-bottom: 0;
}
/* 卡片裡的清單：縮排比 Obsidian 預設小，項目之間留一點距離 */
.callout[data-callout="zm-board"] > .callout-content > .callout {
	--list-indent: 1.1em;
	--list-spacing: 0.25em;
}
.callout[data-callout="zm-board"] > .callout-content > .callout ul {
	padding-inline-start: 1.1em;
	margin-block: 0;
}

/* 第一行的研究設計、樣本數、證據等級：膠囊標籤 */
.callout[data-callout="zm-board"] > .callout-content > p code {
	display: inline-block;
	margin: 0 4px 4px 0;
	padding: 1px 10px;
	border-radius: 999px;
	border: 1px solid var(--background-modifier-border);
	background-color: var(--background-primary);
	color: var(--text-normal);
	font-family: var(--font-interface);
	font-size: 0.85em;
}

/* 儀表板的數字卡：大數字 */
.callout[data-callout="zm-kpi"] strong {
	display: inline-block;
	font-size: 1.9em;
	line-height: 1.15;
	color: var(--text-normal);
	font-variant-numeric: tabular-nums;
}

/* 圖表卡：Mermaid 圓餅圖縮到卡片寬度；文字長條用等寬數字 */
.callout[data-callout="zm-chart"] .mermaid svg {
	max-width: 100%;
	height: auto;
}
.callout[data-callout="zm-chart"] > .callout-content {
	font-variant-numeric: tabular-nums;
}
/* 每月新增的走勢線：放大、去掉程式碼底色 */
.callout[data-callout="zm-chart"] code {
	display: inline-block;
	font-size: 1.6em;
	line-height: 1.1;
	letter-spacing: 1px;
	padding: 0;
	background: none;
	color: rgb(var(--callout-color));
}

/* 每種卡片的顏色和圖示 */
${cardRules}
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

	return { SNIPPET, FILE_NAME, VERSION, CARDS, header, css, versionOf, enableIn, install, afterSync, describe };
});
