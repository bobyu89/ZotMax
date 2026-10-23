/*
 * ZotMax — 整理 vault 資料夾: moves a vault from the flat layout (before 0.23.0) to the organized one (core.js
 * LAYOUTS) and keeps every link working.
 *
 *   - planMigration() decides, from the files under the default folder and their frontmatter, what goes where:
 *     literature notes into 10 文獻/<Zotero collection> (or 未分類), each full-text note next to its literature
 *     note as "<name> · 全文", the annotation PNGs into that folder's 附件, the topic pages into their collection
 *     folder, 首頁 / 研究儀表板 to 00 / 01, and 概念, Reviews, 文獻比較, Drafts, 進度報告, 新文獻 and the
 *     system files (.base, references.json) into 20–90. Only the plugin's own places move: notes the user put
 *     elsewhere, routing-rule folders and the user's own files stay where they are; a taken target is skipped.
 *   - rewriteLinks() / rewriteCanvas() / rewriteBookmarks() update [[wikilinks]], ![[embeds]], Markdown links,
 *     Canvas cards and bookmarks that point at a moved file, in every note of the vault (not only ZotMax's).
 *   - run() (快速指令 / settings): shows the plan, moves, rewrites, writes 90 系統/整理紀錄 … .md (every move,
 *     for undoing by hand), switches the pref obsidian.structure to "organized" and rebuilds 首頁 and 主題頁.
 *   - Afterwards a sync keeps the folders in step with Zotero: a note whose item left its collection moves to
 *     the new one (relocate(); its full text and images go with it), and afterMoves() fixes the links.
 *
 * detect() picks the layout once per profile: a vault that already has the flat layout stays flat until the
 * user runs 整理 vault; an empty one starts organized.
 *
 * The functions down to "Zotero" are pure (Node tests); the rest needs Zotero.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(require("./core.js"), require("./dashboard.js"), globalThis);
	}
	else {
		(root.ZB = root.ZB || {}).vaultLayout = factory(root.ZB.core, root.ZB.dashboard, root);
	}
})(this, function (core, dashboard, scope) {
	const PREF = "extensions.zotero-bridge.";
	const TITLE = "ZotMax：整理 vault 資料夾";
	const IMAGE_RE = /^([0-9A-Z]{8})-([0-9A-Z]{8})\.png$/;
	const SYSTEM_FILE_RE = /^(?:.+\.base|references(?:-.+)?\.(?:json|bib)|\.zotero-bridge-citekeys\.json)$/i;
	const MAX_DEPTH = 16;
	const MAX_LOG_ROWS = 2000;
	const KIND_LABELS = {
		note: "文獻筆記", fulltext: "全文筆記", image: "劃線圖片", page: "首頁與儀表板", topic: "主題頁",
		folder: "概念、評讀、寫作與新文獻", system: "系統檔",
	};
	// Flat folders under <F> that move as a whole: [flat parts, layout kind]
	const FOLDER_MOVES = [
		[["Reviews"], "reviews"], [["文獻比較"], "synthesis"], [["Drafts"], "drafts"], [["進度報告"], "reports"], [["新文獻"], "digest"],
	];

	// ---------- the plan (pure) ----------

	const startsWith = (rel, parts) => rel.length > parts.length && parts.every((p, i) => rel[i] === p);
	const key = parts => parts.join("/");
	const stripMd = s => String(s).replace(/\.md$/i, "");

	/**
	 * What to move. files: [{ rel: ["Zotero", "x.md"], fm: parsed frontmatter ({} when none) }] for every file
	 * under the default folder. settings: { defaults: { obsidianFolder }, fullTextFolder ("全文"), conceptsFolder
	 * ("概念") }. Returns { moves: [{ from, to, kind }], skipped: [{ from, to, reason }] } (vault-relative parts).
	 */
	function planMigration(files, settings) {
		let target = Object.assign({}, settings, { structure: "organized" });
		let flat = Object.assign({}, settings, { structure: "flat" });
		let root = core.splitFolder(settings.defaults && settings.defaults.obsidianFolder);
		let fullTextFolder = core.sanitizeFilename(settings.fullTextFolder || "全文");
		let conceptsFolder = core.splitFolder(settings.conceptsFolder || "概念");
		let moves = [];
		let skipped = [];
		let taken = new Set(files.map(f => key(f.rel)));
		let handled = new Set();
		let add = (from, to, kind) => {
			let k = key(from);
			if (handled.has(k)) return;
			handled.add(k);
			if (key(to) === k) return;
			if (taken.has(key(to))) {
				skipped.push({ from, to, reason: "目標位置已有同名檔案" });
				return;
			}
			taken.add(key(to));
			moves.push({ from, to, kind });
		};

		// 1. Literature notes directly in <F> → 10 文獻/<collection>; those elsewhere stay (the user's choice or a rule)
		let notes = files.filter(f => f.fm && f.fm.zotero_key && !f.fm.fulltext_of && /\.md$/i.test(f.rel[f.rel.length - 1]));
		let dest = new Map();
		for (let f of notes) {
			let name = stripMd(f.rel[f.rel.length - 1]);
			let to = f.rel;
			if (f.rel.length === root.length + 1 && startsWith(f.rel, root)) {
				let collections = Array.isArray(f.fm.collections) ? f.fm.collections : f.fm.collections ? [f.fm.collections] : [];
				to = [...core.noteFolder(target, null, { collections }), name + ".md"];
				add(f.rel, to, "note");
			}
			let at = moves.find(m => key(m.from) === key(f.rel));
			let place = { from: f.rel.slice(0, -1), dir: (at ? at.to : f.rel).slice(0, -1), name: stripMd((at ? at.to : f.rel).slice(-1)[0]) };
			if (!dest.has(f.fm.zotero_key)) dest.set(f.fm.zotero_key, place);
			let itemKey = String(f.fm.zotero_key).split("/").pop();
			if (!dest.has("item:" + itemKey + ":" + key(place.from))) dest.set("item:" + itemKey + ":" + key(place.from), place);
		}

		// 2. Full-text notes → "<note> · 全文" next to the literature note
		for (let f of files) {
			if (!f.fm || !f.fm.fulltext_of || !/\.md$/i.test(f.rel[f.rel.length - 1])) continue;
			let place = dest.get(f.fm.fulltext_of);
			if (!place) continue; // its literature note is gone: leave it
			let inFolder = f.rel.length >= 2 && f.rel[f.rel.length - 2] === fullTextFolder;
			if (!inFolder && !startsWith(f.rel, root)) continue;
			add(f.rel, [...place.dir, place.name + core.FULLTEXT_SUFFIX + ".md"], "fulltext");
		}

		// 3. Annotation PNGs <note folder>/attachments/<item>-<annotation>.png → <new folder>/附件/
		for (let f of files) {
			let name = f.rel[f.rel.length - 1];
			let m = IMAGE_RE.exec(name);
			if (!m || f.rel[f.rel.length - 2] !== core.LAYOUTS.flat.attachments) continue;
			let place = dest.get("item:" + m[1] + ":" + key(f.rel.slice(0, -2)));
			if (!place) continue;
			add(f.rel, [...place.dir, core.LAYOUTS.organized.attachments, name], "image");
		}

		// 4. 首頁 and 研究儀表板; the system files at <F>
		let atRoot = f => f.rel.length === root.length + 1 && startsWith(f.rel, root);
		for (let f of files.filter(atRoot)) {
			let name = f.rel[f.rel.length - 1];
			let type = f.fm && f.fm.type;
			if (name === core.vaultPage(flat, "home") + ".md" && type === "home") add(f.rel, [...root, core.vaultPage(target, "home") + ".md"], "page");
			else if (name === core.vaultPage(flat, "dashboard") + ".md" && type === "research-dashboard") add(f.rel, [...root, core.vaultPage(target, "dashboard") + ".md"], "page");
			else if (SYSTEM_FILE_RE.test(name)) add(f.rel, [...core.vaultFolder(target, "system"), name], "system");
		}

		// 5. Topic pages → 10 文獻/<collection>/00 <name> 總覽
		let topics = [...root, ...core.LAYOUTS.flat.topics];
		for (let f of files) {
			if (f.rel.length !== topics.length + 1 || !startsWith(f.rel, topics)) continue;
			if (!f.fm || f.fm.type !== "topic" || !f.fm.zotero_collection) continue;
			let page = core.topicPage(target, String(f.fm.zotero_collection));
			add(f.rel, [...page.dirParts, page.name + ".md"], "topic");
			// Its 證據地圖 canvas goes with it
			let canvas = [...topics, stripMd(f.rel[f.rel.length - 1]) + " 證據地圖.canvas"];
			if (taken.has(key(canvas))) add(canvas, [...page.dirParts, page.name.replace(/ 總覽$/, "") + " 證據地圖.canvas"], "topic");
		}

		// 6. Whole folders: 概念 (when it is the default one), Reviews, 文獻比較, Drafts, 進度報告, 新文獻
		let folderMoves = FOLDER_MOVES.map(([from, kind]) => [[...root, ...from], core.vaultFolder(target, kind)]);
		if (key(conceptsFolder) === key(core.LAYOUTS.flat.concepts)) folderMoves.unshift([[...root, ...conceptsFolder], core.vaultFolder(target, "concepts")]);
		for (let f of files) {
			let hit = folderMoves.find(([from]) => startsWith(f.rel, from));
			if (hit) add(f.rel, [...hit[1], ...f.rel.slice(hit[0].length)], "folder");
		}
		return { moves, skipped };
	}

	/** Old → new link targets: notes without ".md" (as wikilinks write them), other files with their extension. */
	function linkMap(moves) {
		let map = new Map();
		for (let m of moves) {
			let from = key(m.from);
			let to = key(m.to);
			if (/\.md$/i.test(from)) map.set(stripMd(from), stripMd(to));
			else map.set(from, to);
		}
		return map;
	}

	function lookup(map, target) {
		let t = String(target).trim();
		let md = /\.md$/i.test(t);
		let hit = map.get(md ? stripMd(t) : t);
		if (hit === undefined) return null;
		return md ? hit + ".md" : hit;
	}

	// [[target#heading|label]], ![[embed]], and the "\|" form inside tables
	const WIKILINK_RE = /(!?\[\[)([^\[\]|#^\n]+?)((?:[#^][^\[\]|\n]*)?)((?:\\?\|[^\[\]\n]*)?)\]\]/g;
	// [label](path) and [label](<path with spaces>)
	const MDLINK_RE = /(\]\()(<[^<>\n]+>|[^()\s]+)(\))/g;

	/** The text with every link to a moved file pointing at its new place. Returns { text, count }. */
	function rewriteLinks(text, map) {
		let count = 0;
		let out = String(text || "").replace(WIKILINK_RE, (all, open, target, sub, label) => {
			let hit = lookup(map, target.replace(/\\$/, ""));
			if (hit === null) return all;
			count++;
			return `${open}${hit}${sub}${label}]]`;
		});
		out = out.replace(MDLINK_RE, (all, open, raw, close) => {
			let angle = raw.startsWith("<");
			let path = angle ? raw.slice(1, -1) : raw;
			if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return all;
			let hash = path.indexOf("#");
			let sub = hash >= 0 ? path.slice(hash) : "";
			path = hash >= 0 ? path.slice(0, hash) : path;
			let decoded;
			try {
				decoded = decodeURI(path);
			}
			catch (e) {
				return all;
			}
			let hit = lookup(map, decoded);
			if (hit === null) return all;
			count++;
			return `${open}${angle ? `<${hit}${sub}>` : hit.replace(/ /g, "%20") + sub}${close}`;
		});
		return { text: out, count };
	}

	/** A .canvas file (JSON) with its file cards pointing at the moved notes. Returns { text, count }. */
	function rewriteCanvas(text, map) {
		let data;
		try {
			data = JSON.parse(text);
		}
		catch (e) {
			return { text, count: 0 };
		}
		let count = 0;
		for (let node of (data && data.nodes) || []) {
			if (node && node.type === "file" && typeof node.file === "string") {
				let hit = lookup(map, node.file);
				if (hit !== null) {
					node.file = hit;
					count++;
				}
			}
		}
		return { text: count ? JSON.stringify(data, null, "\t") : text, count };
	}

	/** .obsidian/bookmarks.json with bookmarked files and folders moved. Returns { text, count }. */
	function rewriteBookmarks(text, map) {
		let data;
		try {
			data = JSON.parse(text);
		}
		catch (e) {
			return { text, count: 0 };
		}
		let count = 0;
		let visit = (items) => {
			for (let item of items || []) {
				if (item && item.type === "file" && typeof item.path === "string") {
					let hit = lookup(map, item.path);
					if (hit !== null) {
						item.path = hit;
						count++;
					}
				}
				if (item && Array.isArray(item.items)) visit(item.items);
			}
		};
		visit(data && data.items);
		return { text: count ? JSON.stringify(data, null, 2) : text, count };
	}

	/** { kind: n } of a plan's moves. */
	function counts(moves) {
		let out = {};
		for (let m of moves) out[m.kind] = (out[m.kind] || 0) + 1;
		return out;
	}

	/** The confirmation text for a plan. */
	function describePlan(plan, settings) {
		let c = counts(plan.moves);
		let root = core.splitFolder(settings.defaults && settings.defaults.obsidianFolder).join("/") || "vault 根目錄";
		let lines = [`會在「${root}」裡搬動 ${plan.moves.length} 個檔案：`];
		for (let kind of Object.keys(KIND_LABELS)) {
			if (c[kind]) lines.push(`・${KIND_LABELS[kind]} ${c[kind]} 個`);
		}
		lines.push("", "新的資料夾：00 首頁、01 研究儀表板、10 文獻（依 Zotero 分類）、20 概念、30 評讀與綜整、40 寫作、50 新文獻、90 系統。",
			"所有指向這些檔案的連結（包含你自己的筆記、Canvas 和書籤）會一起更新；你寫的內容不會被改動。");
		if (plan.skipped.length) lines.push(`有 ${plan.skipped.length} 個檔案因為目標位置已有同名檔案，會留在原處。`);
		lines.push("", "建議先關閉 Obsidian 再按「整理」，完成後再打開。整理紀錄會存在 90 系統。");
		return lines.join("\n");
	}

	/** The log note: every move, so it can be undone by hand. */
	function buildLog(plan, result, opts = {}) {
		let at = opts.now || new Date();
		let stamp = at.toISOString();
		let rows = plan.moves.slice(0, MAX_LOG_ROWS).map(m => `| ${KIND_LABELS[m.kind] || m.kind} | ${cellText(key(m.from))} | ${cellText(key(m.to))} |`);
		if (opts.layout === "board") return boardLog(plan, result, at, rows);
		return [
			"---", "type: vault-reorganize", `date: ${stamp}`, `moved: ${result.moved}`, "---", "",
			"# 整理 vault 資料夾紀錄", "",
			`> [!info] ${at.toLocaleString("zh-TW", { hour12: false })}：搬動 ${result.moved} 個檔案，更新 ${result.links} 個連結（${result.files} 個檔案）。`,
			"> 要還原：依下表把「新位置」搬回「原位置」，並到 設定 → ZotMax → Obsidian 把資料夾結構改回「舊版（平鋪）」。",
			"",
			...(result.failed.length ? ["## 沒有搬成功", "", ...result.failed.map(f => `- ${key(f.from)}：${f.error}`), ""] : []),
			...(plan.skipped.length ? ["## 留在原處（目標已有同名檔案）", "", ...plan.skipped.map(s => `- ${key(s.from)} → ${key(s.to)}`), ""] : []),
			"## 搬動清單", "", "| 類型 | 原位置 | 新位置 |", "|---|---|---|", ...rows,
			...(plan.moves.length > MAX_LOG_ROWS ? ["", `（另有 ${plan.moves.length - MAX_LOG_ROWS} 個未列出）`] : []),
			"",
		].join("\n");
	}

	/**
	 * The 看板 layout's log: the run as number cards (moved, links, failed or left in place), the moves by kind as bars,
	 * what went wrong open, the full table of moves folded.
	 */
	function boardLog(plan, result, at, rows) {
		let byKind = [...plan.moves.reduce((m, x) => m.set(KIND_LABELS[x.kind] || x.kind, (m.get(KIND_LABELS[x.kind] || x.kind) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
		let problems = result.failed.length + plan.skipped.length;
		return [
			"---", "type: vault-reorganize", `date: ${at.toISOString()}`, `moved: ${result.moved}`,
			"cssclasses:", `  - "${core.NOTE_CLASS}"`, `  - "${core.REVIEW_CLASS}"`, "---", "",
			"# 整理 vault 資料夾紀錄", "",
			core.metaFold(`🗂️ 整理 vault · ${at.toLocaleString("zh-TW", { hour12: false })}`, [
				"要還原：依下方「搬動清單」把「新位置」搬回「原位置」，並到 設定 → ZotMax → Obsidian 把資料夾結構改回「舊版（平鋪）」。",
			]), "",
			core.boardBlock("整理結果", [
				core.kpiCard("搬動", `${result.moved} 個檔案`, ""),
				core.kpiCard("更新連結", `${result.links} 個`, `在 ${result.files} 個檔案裡`),
				core.kpiCard("沒有搬動", `${problems} 個`, problems ? "見下方" : "全部完成"),
				core.chartCard("依類型", core.barRows(byKind, 8)),
			]), "",
			...(result.failed.length ? ["## 沒有搬成功", "", ...result.failed.map(f => `- ${key(f.from)}：${f.error}`), ""] : []),
			...(plan.skipped.length ? ["## 留在原處（目標已有同名檔案）", "", ...plan.skipped.map(s => `- ${key(s.from)} → ${key(s.to)}`), ""] : []),
			core.foldBlock(`搬動清單（${plan.moves.length}）`, ["| 類型 | 原位置 | 新位置 |", "|---|---|---|", ...rows,
				...(plan.moves.length > MAX_LOG_ROWS ? ["", `（另有 ${plan.moves.length - MAX_LOG_ROWS} 個未列出）`] : [])].join("\n")),
			"",
		].join("\n");
	}

	function cellText(s) {
		return String(s).replace(/\|/g, "\\|");
	}

	// Entries directly in <F> that only the flat layout has
	const FLAT_MARKERS = ["首頁.md", "研究儀表板.md", "Zotero 文獻庫.base", "研究儀表板.base", "全文", "Reviews", "主題", "概念", "attachments",
		"Drafts", "進度報告", "新文獻", "文獻比較"];

	/**
	 * Does the flat layout already exist under <F>? names: the entries directly in <F>; hasNote: a literature note
	 * sits directly in <F>.
	 */
	function looksFlat(names, hasNote) {
		let set = new Set(names);
		return !!hasNote || FLAT_MARKERS.some(n => set.has(n));
	}

	// ---------- Zotero ----------

	function pref(name) {
		return Zotero.Prefs.get(PREF + name, true);
	}

	function setPref(name, value) {
		Zotero.Prefs.set(PREF + name, value, true);
	}

	async function readFrontmatter(path) {
		let bytes = await IOUtils.read(path, { maxBytes: 8192 });
		let text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
		let { frontmatter } = core.splitFrontmatter(text);
		if (frontmatter === null && bytes.length >= 8192 && /^---\r?\n/.test(text)) {
			frontmatter = core.splitFrontmatter((await IOUtils.readUTF8(path)).replace(/^﻿/, "")).frontmatter;
		}
		return frontmatter ? dashboard.parseFrontmatter(frontmatter) : {};
	}

	/** Every file under parts (recursively; dot folders skipped, dot files kept): [{ rel, path, fm }]. */
	async function listFiles(vaultPath, parts, opts = {}) {
		let out = [];
		let visit = async (dir, rel) => {
			let children;
			try {
				children = await IOUtils.getChildren(dir);
			}
			catch (e) {
				return;
			}
			for (let child of children) {
				let name = PathUtils.filename(child);
				let info;
				try {
					info = await IOUtils.stat(child);
				}
				catch (e) {
					continue;
				}
				if (info.type === "directory") {
					if (!name.startsWith(".") && rel.length < MAX_DEPTH) await visit(child, [...rel, name]);
					continue;
				}
				let fm = {};
				if (opts.frontmatter && /\.md$/i.test(name)) {
					try {
						fm = await readFrontmatter(child);
					}
					catch (e) {
						Zotero.debug(`ZotMax: vault layout skipped ${child}: ${e}`);
					}
				}
				out.push({ rel: [...rel, name], path: child, fm });
			}
		};
		await visit(PathUtils.join(vaultPath, ...parts), parts);
		return out;
	}

	function planSettings(settings) {
		return {
			defaults: settings.defaults,
			fullTextFolder: String(pref("fullText.folder") || "").trim() || "全文",
			conceptsFolder: String(pref("concepts.folder") || "").trim() || "概念",
		};
	}

	/** The plan for this vault (no changes made). */
	async function plan(settings) {
		let root = core.splitFolder(settings.defaults.obsidianFolder);
		let files = await listFiles(settings.vaultPath, root, { frontmatter: true });
		return planMigration(files, planSettings(settings));
	}

	async function moveFile(vaultPath, from, to) {
		let src = PathUtils.join(vaultPath, ...from);
		let dst = PathUtils.join(vaultPath, ...to);
		await IOUtils.makeDirectory(PathUtils.parent(dst), { createAncestors: true, ignoreExisting: true });
		await IOUtils.move(src, dst, { noOverwrite: true });
	}

	/**
	 * Rewrite the links to moved files in every note, canvas and bookmark list of the vault.
	 * Returns { links, files }.
	 */
	async function rewriteVault(vaultPath, map) {
		let result = { links: 0, files: 0 };
		if (!map.size) return result;
		let needles = [...map.keys()].map(k => k.split("/").pop());
		for (let f of await listFiles(vaultPath, [])) {
			let name = f.rel[f.rel.length - 1];
			let canvas = /\.canvas$/i.test(name);
			if (!canvas && !/\.md$/i.test(name)) continue;
			try {
				let text = await IOUtils.readUTF8(f.path);
				// Cheap test first: a link to a moved file has its file name (or its %20 form) in it
				if (!needles.some(n => text.includes(n) || text.includes(n.replace(/ /g, "%20")))) continue;
				let out = canvas ? rewriteCanvas(text, map) : rewriteLinks(text, map);
				if (out.count && out.text !== text) {
					await IOUtils.writeUTF8(f.path, out.text);
					result.links += out.count;
					result.files++;
				}
			}
			catch (e) {
				Zotero.debug(`ZotMax: could not update links in ${f.path}: ${e}`);
			}
		}
		let bookmarks = PathUtils.join(vaultPath, ".obsidian", "bookmarks.json");
		try {
			if (await IOUtils.exists(bookmarks)) {
				let text = await IOUtils.readUTF8(bookmarks);
				let out = rewriteBookmarks(text, map);
				if (out.count) {
					await IOUtils.writeUTF8(bookmarks, out.text);
					result.links += out.count;
				}
			}
		}
		catch (e) {
			Zotero.debug(`ZotMax: could not update bookmarks: ${e}`);
		}
		return result;
	}

	/** Remove the folders the moves left empty (deepest first; only under <F>, never <F> itself). */
	async function removeEmptyFolders(vaultPath, moves, root) {
		let dirs = new Set();
		for (let m of moves) {
			for (let i = m.from.length - 1; i > root.length; i--) dirs.add(key(m.from.slice(0, i)));
		}
		for (let d of [...dirs].sort((a, b) => b.split("/").length - a.split("/").length)) {
			let path = PathUtils.join(vaultPath, ...d.split("/"));
			try {
				if ((await IOUtils.getChildren(path)).length === 0) await IOUtils.remove(path);
			}
			catch (e) {}
		}
	}

	/** Carry out a plan. Returns { moved, failed: [{ from, error }], links, files, done: moves that happened }. */
	async function apply(settings, thePlan) {
		let done = [];
		let failed = [];
		for (let m of thePlan.moves) {
			try {
				await moveFile(settings.vaultPath, m.from, m.to);
				done.push(m);
			}
			catch (e) {
				failed.push({ from: m.from, error: String((e && e.message) || e) });
			}
		}
		let rewritten = await rewriteVault(settings.vaultPath, linkMap(done));
		await removeEmptyFolders(settings.vaultPath, done, core.splitFolder(settings.defaults.obsidianFolder));
		return { moved: done.length, failed, links: rewritten.links, files: rewritten.files, done };
	}

	/**
	 * Pick the layout once per profile (pref obsidian.structure empty): flat when <F> already holds the flat
	 * layout, organized otherwise. Returns the structure in effect. Never throws.
	 */
	async function detect(settings) {
		try {
			let current = pref("obsidian.structure");
			if (current === "flat" || current === "organized") return current;
			if (!settings || !settings.vaultPath) return "organized";
			let root = core.splitFolder(settings.defaults.obsidianFolder);
			let dir = PathUtils.join(settings.vaultPath, ...root);
			let names = [];
			let hasNote = false;
			if (await IOUtils.exists(dir)) {
				for (let child of await IOUtils.getChildren(dir)) {
					let name = PathUtils.filename(child);
					names.push(name);
					if (!hasNote && /\.md$/i.test(name)) {
						try {
							hasNote = !!(await readFrontmatter(child)).zotero_key;
						}
						catch (e) {}
					}
				}
			}
			let structure = looksFlat(names, hasNote) ? "flat" : "organized";
			setPref("obsidian.structure", structure);
			return structure;
		}
		catch (e) {
			Zotero.logError(e);
			return "flat";
		}
	}

	/**
	 * During a sync (organized): the item's note sits in 10 文獻 but not in one of its collections' folders (the
	 * item moved in Zotero) → move it, its full text and its images to the primary collection's folder. entry:
	 * { path, relParts } from the vault index; returns the new entry, or null when it stays. moves (a Map, the run's)
	 * collects old → new link targets for afterMoves().
	 */
	async function relocate(settings, entry, data, moves) {
		if (core.structureOf(settings) !== "organized") return null;
		let dirParts = entry.relParts.slice(0, -1);
		let literature = core.vaultFolder(settings, "literature");
		if (!startsWith(dirParts.concat("x"), literature)) return null;
		if (core.noteFolders(settings, data).some(f => key(f) === key(dirParts))) return null;
		let route = core.resolveRoute(data, settings.rules, settings.defaults);
		let toDir = core.noteFolder(settings, route, data);
		if (!startsWith(toDir.concat("x"), literature) || key(toDir) === key(dirParts)) return null;
		let name = entry.relParts[entry.relParts.length - 1];
		let to = [...toDir, name];
		if (await IOUtils.exists(PathUtils.join(settings.vaultPath, ...to))) return null;
		let bundle = [{ from: entry.relParts, to }];
		let base = stripMd(name);
		let ft = [...dirParts, base + core.FULLTEXT_SUFFIX + ".md"];
		if (await IOUtils.exists(PathUtils.join(settings.vaultPath, ...ft))) bundle.push({ from: ft, to: [...toDir, base + core.FULLTEXT_SUFFIX + ".md"] });
		let imgDir = [...dirParts, core.LAYOUTS.organized.attachments];
		try {
			for (let child of await IOUtils.getChildren(PathUtils.join(settings.vaultPath, ...imgDir))) {
				let file = PathUtils.filename(child);
				let m = IMAGE_RE.exec(file);
				if (m && m[1] === data.key) bundle.push({ from: [...imgDir, file], to: [...toDir, core.LAYOUTS.organized.attachments, file] });
			}
		}
		catch (e) {}
		for (let m of bundle) {
			try {
				await moveFile(settings.vaultPath, m.from, m.to);
				if (moves) for (let [from, to] of linkMap([m])) moves.set(from, to);
			}
			catch (e) {
				Zotero.debug(`ZotMax: could not move ${key(m.from)}: ${e}`);
				if (m === bundle[0]) return null;
			}
		}
		await removeEmptyFolders(settings.vaultPath, bundle, literature);
		Zotero.debug(`ZotMax: moved ${key(entry.relParts)} → ${key(to)}`);
		return { path: PathUtils.join(settings.vaultPath, ...to), relParts: to };
	}

	/** After a sync run that moved notes: fix the links to them everywhere. Never throws. */
	async function afterMoves(settings, moves) {
		try {
			if (!moves || !moves.size || !settings.vaultPath) return null;
			return await rewriteVault(settings.vaultPath, moves);
		}
		catch (e) {
			Zotero.logError(e);
			return null;
		}
	}

	function stamp(d) {
		let p = n => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`;
	}

	/**
	 * 快速指令 / settings: plan, confirm, move, rewrite, log, switch the pref, rebuild 首頁 and 主題頁.
	 * opts.confirm(text) replaces the dialog (the e2e harness). Resolves to the result, or null.
	 */
	function run(opts = {}) {
		let ZB = scope.ZB;
		return ZB.main.enqueue(async () => {
			let settings;
			try {
				settings = await ZB.main.readSettings();
			}
			catch (e) {
				ZB.main.notify("ZotMax 設定有誤", String(e.message || e));
				return null;
			}
			if (!settings.vaultPath) {
				ZB.main.notify(TITLE, "請先到 設定 → ZotMax 填入 Obsidian vault 路徑。");
				return null;
			}
			let thePlan = await plan(settings);
			if (!thePlan.moves.length) {
				setPref("obsidian.structure", "organized");
				ZB.main.notify(TITLE, "資料夾已經是新的結構，沒有需要搬動的檔案。之後同步會照 Zotero 分類放。");
				return { moved: 0, failed: [], links: 0, files: 0, done: [] };
			}
			let text = describePlan(thePlan, settings);
			let ok = typeof opts.confirm === "function" ? opts.confirm(text) : Services.prompt.confirm(Zotero.getMainWindow(), TITLE, text);
			if (!ok) return null;
			let result = await apply(settings, thePlan);
			setPref("obsidian.structure", "organized");
			settings.structure = "organized";
			let now = new Date();
			let logParts = [...core.vaultFolder(settings, "system"), `整理紀錄 ${stamp(now)}.md`];
			try {
				await IOUtils.makeDirectory(PathUtils.join(settings.vaultPath, ...logParts.slice(0, -1)), { createAncestors: true, ignoreExisting: true });
				await IOUtils.writeUTF8(PathUtils.join(settings.vaultPath, ...logParts), buildLog(thePlan, result, { now, layout: core.layoutPref() }));
			}
			catch (e) {
				Zotero.logError(e);
			}
			// 首頁, 研究儀表板 and 主題頁 with the new paths
			try {
				if (ZB.dashboard && (!ZB.features || ZB.features.isEnabled("dashboard"))) await ZB.dashboard.update(settings);
			}
			catch (e) {
				Zotero.logError(e);
			}
			ZB.main.notify(TITLE, `已搬動 ${result.moved} 個檔案，更新 ${result.links} 個連結。`
				+ (result.failed.length ? `${result.failed.length} 個沒搬成功（見整理紀錄）。` : "")
				+ `紀錄：${logParts.join("/")}。打開 Obsidian 從「${core.vaultPage(settings, "home")}」開始。`);
			return Object.assign(result, { log: key(logParts) });
		});
	}

	return {
		TITLE, KIND_LABELS,
		planMigration, linkMap, rewriteLinks, rewriteCanvas, rewriteBookmarks, counts, describePlan, buildLog, looksFlat,
		listFiles, plan, apply, rewriteVault, detect, relocate, afterMoves, run,
	};
});
