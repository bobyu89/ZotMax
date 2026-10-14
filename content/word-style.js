/*
 * ZotMax — the Word citation style: 「APA 7 中英混排（臺灣，ZotMax）」 for the Zotero Word / LibreOffice plugin.
 *
 * Zotero's official APA style writes Chinese references with English rules (陳, 美. & 林, 小., et al.). The two
 * styles in content/styles/ (built by scripts/csl.mjs from the official one) add CSL-M layouts for items whose
 * language is zh / zh-TW: full names, 「、」 between authors, 「等」, （年）, 「。」 (or 「．」, 台灣護理學會) between
 * parts, journal and volume in italics, Chinese references first by stroke count. English items come out exactly
 * as with the official style, whatever the Word document's language (default-locale en-US).
 *
 * install() puts both into Zotero (Zotero.Styles.install, silent: no prompts); the user then picks one in Word →
 * Zotero → Document Preferences. Styles installed earlier are refreshed on startup when the bundled copy is newer.
 * The Chinese layout needs the item's language to be zh-TW (中文文獻補強 sets it).
 *
 * The functions down to "Zotero" are pure (Node tests); the rest needs Zotero.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(globalThis);
	}
	else {
		(root.ZB = root.ZB || {}).wordStyle = factory(root);
	}
})(this, function (scope) {
	const ID_BASE = "https://bobyu89.github.io/ZotMax/styles/";
	const STYLES = [
		{ file: "apa-7-zh-tw.csl", id: ID_BASE + "apa-7-zh-tw", title: "APA 7 中英混排（臺灣，ZotMax）", punctuation: "thesis" },
		{ file: "apa-7-zh-tw-twna.csl", id: ID_BASE + "apa-7-zh-tw-twna", title: "APA 7 中英混排（臺灣護理學會，ZotMax）", punctuation: "twna" },
	];
	let rootURI = "";
	let chrome = false;

	// ---------- pure ----------

	/** The <id> and <updated> of a CSL file. */
	function styleInfo(xml) {
		let text = String(xml || "");
		let id = /<id>([^<]+)<\/id>/.exec(text);
		let updated = /<updated>([^<]+)<\/updated>/.exec(text);
		let title = /<title>([^<]+)<\/title>/.exec(text);
		return { id: id ? id[1].trim() : "", updated: updated ? updated[1].trim() : "", title: title ? title[1].trim() : "" };
	}

	/** "2026-10-14T00:00:00+00:00" and Zotero's "2026-10-14 00:00:00" (Zotero.Style.updated) as one comparable form. */
	function updatedKey(value) {
		return String(value || "").trim().replace("T", " ").slice(0, 19);
	}

	/** Should a bundled style replace the installed one? Only when it is newer. */
	function isNewer(bundledUpdated, installedUpdated) {
		if (!updatedKey(bundledUpdated)) return false;
		if (!updatedKey(installedUpdated)) return true;
		return updatedKey(bundledUpdated) > updatedKey(installedUpdated);
	}

	/** The style to pick in Word, by the 中文 APA 標點 setting. */
	function preferred(punctuation) {
		return STYLES.find(s => s.punctuation === punctuation) || STYLES[0];
	}

	/** The result line for the settings pane and the palette. results: [{ title, status: "installed" | "updated" | "current" | "failed", error }] */
	function describe(results, punctuation) {
		if (!results || !results.length) return "";
		let failed = results.filter(r => r.status === "failed");
		if (failed.length === results.length) return `安裝失敗：${failed[0].error || "不明原因"}。可以改從 ZotMax 網站下載 .csl 檔，拖進 Zotero 設定 → 引用 → 樣式。`;
		let done = results.filter(r => r.status !== "failed");
		let what = done.every(r => r.status === "current") ? "已是最新版" : "已安裝";
		return `${what}：${done.map(r => `「${r.title}」`).join("、")}。到 Word 的 Zotero 分頁 → Document Preferences 選「${preferred(punctuation).title}」，再按 Refresh。`
			+ (failed.length ? `（${failed.map(r => r.title).join("、")} 沒裝成：${failed[0].error}）` : "");
	}

	// ---------- Zotero ----------

	function init(opts = {}) {
		rootURI = opts.rootURI || rootURI;
		chrome = !!opts.chrome;
		// Refresh styles installed earlier when this version bundles newer ones; never installs on its own
		refreshInstalled().catch(e => Zotero.logError(e));
	}

	function fileURL(file) {
		return (chrome ? "chrome://zotero-bridge/" : rootURI) + "content/styles/" + file;
	}

	async function bundledText(style) {
		return Zotero.File.getContentsFromURLAsync(fileURL(style.file));
	}

	async function ready() {
		if (Zotero.Styles && !Zotero.Styles.initialized && typeof Zotero.Styles.init === "function") await Zotero.Styles.init();
	}

	/** The installed Zotero.Style for one of ours, or null. */
	function installed(style) {
		try {
			let s = Zotero.Styles.get(style.id);
			return s && s.styleID === style.id ? s : null;
		}
		catch (e) {
			return null;
		}
	}

	async function installOne(style, { force = false, quiet = false } = {}) {
		try {
			let xml = await bundledText(style);
			let info = styleInfo(xml);
			let have = installed(style);
			if (have && !force && !isNewer(info.updated, have.updated)) return { title: style.title, id: style.id, status: "current" };
			await Zotero.Styles.install(xml, "ZotMax", true);
			if (!installed(style)) throw new Error("Zotero 沒有接受這個樣式");
			return { title: style.title, id: style.id, status: have ? "updated" : "installed" };
		}
		catch (e) {
			// The startup refresh only notes it; a click on the button shows the error
			if (quiet) Zotero.debug(`ZotMax: could not refresh ${style.file}: ${e}`);
			else Zotero.logError(e);
			return { title: style.title, id: style.id, status: "failed", error: String((e && e.message) || e) };
		}
	}

	/** Install (or refresh) both styles. Returns [{ title, id, status, error }]. */
	async function install(opts = {}) {
		await ready();
		let out = [];
		for (let style of STYLES) out.push(await installOne(style, opts));
		return out;
	}

	/** On startup: refresh only the styles the user installed before, when the bundled copy is newer. */
	async function refreshInstalled() {
		if (typeof Zotero === "undefined" || !Zotero.Styles) return [];
		await ready();
		let out = [];
		for (let style of STYLES) {
			if (installed(style)) out.push(await installOne(style, { quiet: true }));
		}
		return out.filter(r => r.status !== "current");
	}

	/** Are they installed? [{ title, id, installed: boolean }] */
	async function status() {
		await ready();
		return STYLES.map(s => ({ title: s.title, id: s.id, installed: !!installed(s) }));
	}

	function punctuationPref() {
		try {
			return Zotero.Prefs.get("extensions.zotero-bridge.apaZh.style", true) || "thesis";
		}
		catch (e) {
			return "thesis";
		}
	}

	/** 快速指令 / toolbar: install and say what to do in Word. */
	async function runFromMenu() {
		let results = await install();
		let text = describe(results, punctuationPref());
		if (scope.ZB && scope.ZB.main) scope.ZB.main.notify("ZotMax：Word 中文 APA 樣式", text);
		return results;
	}

	return { STYLES, styleInfo, isNewer, preferred, describe, init, install, refreshInstalled, status, runFromMenu };
});
