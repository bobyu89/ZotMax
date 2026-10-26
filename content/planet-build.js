/*
 * ZotMax — 建造星球: turn a topic (a Zotero collection without sub-collections yet) into a planet.
 *
 * The papers in the collection are grouped by what they study: the AI notes' interventions (merged by the concept
 * cards' aliases) and the papers' Zotero tags (MeSH, keywords). proposeIslands picks, greedily, the label that covers
 * the most papers not yet on an island (at least two, and not one that nearly every paper has: that is the topic
 * itself), up to six islands; the rest stay in the collection. The user renames, unticks or keeps each island in a
 * dialog; the plugin then creates the sub-collections and adds the papers (never removes anything), re-syncs those
 * notes to Obsidian without AI (so their `collections` and folders follow) and rebuilds the dashboard, where the
 * planet appears. The run is kept (pref planet.lastBuild) so 「復原上次建造星球」 takes exactly those memberships back
 * and deletes the sub-collections it created once they are empty.
 *
 * The functions down to "Zotero" are pure (Node tests); the rest needs Zotero.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(require("./dashboard.js"), globalThis);
	}
	else {
		(root.ZB = root.ZB || {}).planetBuild = factory(root.ZB.dashboard, root);
	}
})(this, function (dashboard, scope) {
	const PREF = "extensions.zotero-bridge.";
	const TITLE = "ZotMax：建造星球";
	const LAST_PREF = "planet.lastBuild";
	const HTML_NS = "http://www.w3.org/1999/xhtml";
	const MAX_ISLANDS = 6;
	const MIN_PAPERS = 2;
	// A label most papers carry is the topic itself, not an island
	const GENERIC_SHARE = 0.6;
	const MAX_NAME = 60;
	const SOURCE_LABELS = { ai: "AI 筆記的介入", tag: "Zotero 標籤" };
	// Check tags and ZotMax's own tags say nothing about a sub-topic
	const SKIP_TAG_RE = /[/:：#]|^新文獻$|^(humans?|animals?|female|male|adult|aged|middle aged|aged, 80 and over|young adult|adolescent|child|infant|child, preschool|infant, newborn|retrospective studies|prospective studies|cross-sectional studies|cohort studies|surveys and questionnaires|randomized controlled trials as topic|treatment outcome)$/i;

	// Test hooks: ask(init) → { islands: [{ name, keys }] } | null, confirmUndo(), notify(text)
	const runtime = {};
	let busy = false;

	// ---------- the proposal (pure) ----------

	function cleanName(s) {
		return String(s || "").normalize("NFKC").replace(/[/\\]+/g, "／").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
	}

	/**
	 * Islands for a topic. papers: [{ key, title, tags: [Zotero tags], terms: [the AI note's interventions, alias names] }].
	 * Returns { islands: [{ name, source: "ai" | "tag", keys }], rest: [keys] } — every paper on one island at most.
	 */
	function proposeIslands(papers, opts = {}) {
		let max = opts.max || MAX_ISLANDS;
		let all = (papers || []).filter(p => p && p.key);
		let labels = new Map();
		let add = (raw, source, key) => {
			let name = cleanName(raw);
			if (name.length < 2 || (source === "tag" && SKIP_TAG_RE.test(name))) return;
			let k = name.toLowerCase();
			let e = labels.get(k) || { name, source, keys: new Set() };
			// The AI note's own word wins over a tag that says the same
			if (source === "ai" && e.source === "tag") Object.assign(e, { name, source });
			e.keys.add(key);
			labels.set(k, e);
		};
		for (let p of all) {
			for (let t of new Set(p.terms || [])) add(t, "ai", p.key);
			for (let t of new Set(p.tags || [])) add(t, "tag", p.key);
		}
		let generic = Math.max(MIN_PAPERS + 1, Math.ceil(all.length * GENERIC_SHARE));
		let pool = [...labels.values()].filter(l => l.keys.size >= MIN_PAPERS && (l.keys.size < generic || all.length < 4));
		let taken = new Set();
		let islands = [];
		while (islands.length < max) {
			let best = null;
			let bestN = 0;
			for (let l of pool) {
				let n = [...l.keys].filter(k => !taken.has(k)).length;
				let better = n > bestN || (n === bestN && best && (l.source === "ai" && best.source !== "ai" || (l.source === best.source && l.name.localeCompare(best.name, "zh-Hant") < 0)));
				if (n >= MIN_PAPERS && better) {
					best = l;
					bestN = n;
				}
			}
			if (!best) break;
			let keys = [...best.keys].filter(k => !taken.has(k));
			keys.forEach(k => taken.add(k));
			islands.push({ name: best.name, source: best.source, keys });
			pool = pool.filter(l => l !== best);
		}
		return { islands, rest: all.map(p => p.key).filter(k => !taken.has(k)) };
	}

	/** What the dialog's choices will do: [{ name, keys, reuse }] (an existing sub-collection of that name is reused). */
	function planBuild(choices, existing = []) {
		let seen = new Map();
		for (let c of choices || []) {
			let name = cleanName(c.name);
			if (!name || !(c.keys || []).length) continue;
			let k = name.toLowerCase();
			let e = seen.get(k) || { name, keys: [], reuse: existing.some(x => cleanName(x).toLowerCase() === k) };
			for (let key of c.keys) if (!e.keys.includes(key)) e.keys.push(key);
			seen.set(k, e);
		}
		return [...seen.values()];
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
		Zotero.Prefs.set(PREF + key, value, true);
	}

	function notify(text) {
		if (runtime.notify) return runtime.notify(text);
		scope.ZB.main.notify(TITLE, text);
	}

	function readLast() {
		try {
			let run = JSON.parse(pref(LAST_PREF) || "null");
			return run && Array.isArray(run.added) ? run : null;
		}
		catch (e) {
			return null;
		}
	}

	function children(collection) {
		try {
			return (Zotero.Collections.getByParent(collection.id) || []).filter(c => c && !c.deleted);
		}
		catch (e) {
			return [];
		}
	}

	/** The papers of a collection with their tags and the AI notes' interventions (alias names). */
	async function papersOf(collection, settings) {
		let ZB = scope.ZB;
		let items = collection.getChildItems(false).filter(it => it.isRegularItem() && !it.deleted);
		let byKey = new Map();
		try {
			let records = settings && settings.vaultPath ? await ZB.dashboard.literatureRecords(settings) : [];
			for (let r of records) if (r.zoteroKey && !r.deleted) byKey.set(r.zoteroKey, r);
		}
		catch (e) {
			Zotero.logError(e);
		}
		let aliases = null;
		try {
			aliases = ZB.concepts ? ZB.concepts.parseAliases(pref("concepts.aliases")).map : null;
		}
		catch (e) {
			aliases = null;
		}
		let alias = (raw) => {
			let g = aliases && aliases.get(dashboard.termKey(raw));
			return g ? g.name : raw;
		};
		return items.map((it) => {
			let r = byKey.get(ZB.adapter.zoteroKeyFor(it.libraryID, it.key));
			return {
				key: it.key,
				title: it.getField("title"),
				tags: it.getTags().map(t => t.tag),
				terms: r ? dashboard.splitTerms(r.intervention).map(alias) : [],
				item: it,
			};
		});
	}

	/** The dialog: each island with a tick, an editable name, its count and a few titles. Resolves choices or null. */
	function ask(win, init) {
		if (runtime.ask) return Promise.resolve(runtime.ask(init));
		let doc = win && win.document;
		let dialog = null;
		try {
			dialog = doc.createElementNS(HTML_NS, "dialog");
		}
		catch (e) {}
		if (!dialog || typeof dialog.showModal !== "function") return Promise.resolve(askWithPrompt(win, init));
		return new Promise((resolve) => {
			let el = (tag, style, text) => {
				let e = doc.createElementNS(HTML_NS, tag);
				if (style) e.setAttribute("style", style);
				if (text !== undefined) e.textContent = text;
				return e;
			};
			dialog.setAttribute("style", "width: min(680px, 94vw); padding: 16px 18px; border: 1px solid rgba(128,128,128,0.5); border-radius: 8px; background: Canvas; color: CanvasText; font: message-box;");
			let head = el("div", "font-size: 1.15em; font-weight: 600;", `🪐 建造星球：${init.name}`);
			let intro = el("div", "opacity: 0.8; margin: 4px 0 10px;",
				`依這 ${init.total} 篇的 AI 筆記介入與 Zotero 標籤，建議分成下面幾座島（子分類）。勾選要建的、改成你習慣的名字；文獻只會加入子分類，不會從「${init.name}」移出。`);
			let list = el("div", "max-height: 340px; overflow: auto; border: 1px solid rgba(128,128,128,0.35); border-radius: 6px; padding: 6px 10px;");
			let rows = [];
			for (let is of init.islands) {
				let row = el("div", "padding: 6px 0; border-bottom: 1px dashed rgba(128,128,128,0.3);");
				let line = el("div", "display: flex; gap: 8px; align-items: center;");
				let box = el("input");
				box.setAttribute("type", "checkbox");
				box.checked = true;
				let name = el("input", "flex: 1; font: inherit;");
				name.setAttribute("type", "text");
				name.value = is.name;
				let count = el("span", "opacity: 0.8; white-space: nowrap;", `${is.keys.length} 篇 · ${SOURCE_LABELS[is.source] || ""}`);
				line.append(box, name, count);
				let titles = el("div", "opacity: 0.7; font-size: 0.9em; margin: 2px 0 0 24px;", is.titles.slice(0, 3).map(t => `・${String(t).slice(0, 70)}`).join("　"));
				row.append(line, titles);
				list.append(row);
				rows.push({ box, name, is });
			}
			let rest = el("div", "opacity: 0.8; margin-top: 8px;", init.rest.length
				? `另有 ${init.rest.length} 篇沒有明顯的子題，留在「${init.name}」本身；之後可以自己拖進任何一座島。`
				: "每一篇都分到了島上。");
			let after = el("div", "opacity: 0.8; margin-top: 6px; font-size: 0.92em;",
				"建好後會把這些文獻的筆記重新同步到 Obsidian（不呼叫 AI），再更新研究儀表板，星球就會出現。不滿意可以用「復原上次建造星球」收回。");
			let buttons = el("div", "display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;");
			let cancel = el("button", "", "取消");
			let go = el("button", "font-weight: 600;", "建造星球");
			cancel.setAttribute("type", "button");
			go.setAttribute("type", "button");
			buttons.append(cancel, go);
			dialog.append(head, intro, list, rest, after, buttons);
			let done = (value) => {
				dialog.close();
				dialog.remove();
				resolve(value);
			};
			cancel.addEventListener("click", () => done(null));
			go.addEventListener("click", () => done(rows.filter(r => r.box.checked).map(r => ({ name: r.name.value, keys: r.is.keys }))));
			dialog.addEventListener("cancel", () => done(null));
			(doc.body || doc.documentElement).append(dialog);
			try {
				dialog.showModal();
			}
			catch (e) {
				Zotero.logError(e);
			}
			if (!dialog.open) {
				dialog.remove();
				resolve(askWithPrompt(win, init));
			}
		});
	}

	/** Without a modal dialog: one confirm for all the proposed islands, as named. */
	function askWithPrompt(win, init) {
		let ok = Services.prompt.confirm(win, TITLE, `要在「${init.name}」底下建立這 ${init.islands.length} 座島嗎？\n\n`
			+ init.islands.map(is => `・${is.name}（${is.keys.length} 篇）`).join("\n") + `\n\n其餘 ${init.rest.length} 篇留在「${init.name}」。`);
		return ok ? init.islands.map(is => ({ name: is.name, keys: is.keys })) : null;
	}

	/**
	 * Command: propose islands for the selected collection, create what the user keeps, re-sync those notes and rebuild
	 * the dashboard. Returns { created, added, islands } or null.
	 */
	async function run(collection) {
		let ZB = scope.ZB;
		if (!collection) {
			notify("請先在左側選一個 Zotero 分類（你的研究主題）。");
			return null;
		}
		if (busy) return null;
		let existing = children(collection);
		let settings = await ZB.main.readSettings().catch(() => null);
		let papers = await papersOf(collection, settings);
		if (papers.length < 2 * MIN_PAPERS) {
			notify(`「${collection.name}」只有 ${papers.length} 篇文獻，先多收集幾篇再分島。`);
			return null;
		}
		let proposal = proposeIslands(papers);
		if (proposal.islands.length < 2) {
			notify(`「${collection.name}」的文獻還看不出兩個以上的子題：先替它們產生 AI 筆記（會寫出介入），或用 PubMed 匯入（會帶 MeSH 標籤），也可以自己在 Zotero 建子分類。`);
			return null;
		}
		let titleOf = new Map(papers.map(p => [p.key, p.title]));
		let init = {
			name: collection.name, total: papers.length, rest: proposal.rest, existing: existing.map(c => c.name),
			islands: proposal.islands.map(is => Object.assign({}, is, { titles: is.keys.map(k => titleOf.get(k)) })),
		};
		let choices = await ask(Zotero.getMainWindow(), init);
		if (!choices || !choices.length) return null;
		busy = true;
		try {
			let plan = planBuild(choices, existing.map(c => c.name));
			let record = { at: new Date().toISOString(), libraryID: collection.libraryID, parent: collection.key, name: collection.name, created: [], added: [] };
			let touched = new Map();
			for (let island of plan) {
				let target = existing.find(c => cleanName(c.name).toLowerCase() === island.name.toLowerCase());
				if (!target) {
					target = new Zotero.Collection();
					target.libraryID = collection.libraryID;
					target.name = island.name;
					target.parentID = collection.id;
					await target.saveTx();
					record.created.push(target.key);
				}
				for (let key of island.keys) {
					let item = Zotero.Items.getByLibraryAndKey(collection.libraryID, key);
					if (!item || item.deleted || item.inCollection(target.id)) continue;
					item.addToCollection(target.id);
					touched.set(key, item);
					record.added.push({ item: key, collection: target.key });
				}
			}
			for (let item of touched.values()) await item.saveTx();
			if (record.created.length || record.added.length) setPref(LAST_PREF, JSON.stringify(record));
			// The notes' collections and folders follow, then the planet appears on the dashboard
			if (touched.size && settings && settings.vaultPath) {
				try {
					await ZB.main.run([...touched.values()], { targets: ["obsidian"], ai: "reuse", silent: true });
					await ZB.dashboard.update(settings);
				}
				catch (e) {
					Zotero.logError(e);
				}
			}
			let result = { created: record.created.length, added: record.added.length, islands: plan.map(p => p.name) };
			notify(`「${collection.name}」建好 ${plan.length} 座島（新建 ${result.created} 個子分類，加入 ${result.added} 筆）。`
				+ (settings && settings.vaultPath ? "星球已出現在主題頁和首頁；也可以按右鍵 → 開啟群島地圖。" : ""));
			return result;
		}
		catch (e) {
			Zotero.logError(e);
			notify(`建造失敗：${e.message || e}`);
			return null;
		}
		finally {
			busy = false;
		}
	}

	/** 「復原上次建造星球」: take back exactly the memberships it added, delete the sub-collections it created if empty. */
	async function undoLast() {
		let run = readLast();
		if (!run) {
			notify("沒有可以復原的建造紀錄（只能復原最後一次）。");
			return null;
		}
		let ok = runtime.confirmUndo ? runtime.confirmUndo(run) : Services.prompt.confirm(Zotero.getMainWindow(), TITLE,
			`要復原「${run.name}」的建造星球嗎？\n\n會把那次加入子分類的 ${run.added.length} 筆收回，並刪除那次新建、現在又是空的子分類（最多 ${run.created.length} 個）。文獻本身和你原本的分類都不會動。`);
		if (!ok) return null;
		let result = { removed: 0, deleted: 0 };
		let items = new Map();
		for (let a of run.added) {
			let item = Zotero.Items.getByLibraryAndKey(run.libraryID, a.item);
			let c = Zotero.Collections.getByLibraryAndKey(run.libraryID, a.collection);
			if (!item || !c || !item.inCollection(c.id)) continue;
			item.removeFromCollection(c.id);
			items.set(a.item, item);
			result.removed++;
		}
		for (let item of items.values()) {
			try {
				await item.saveTx();
			}
			catch (e) {
				Zotero.logError(e);
			}
		}
		for (let key of run.created) {
			let c = Zotero.Collections.getByLibraryAndKey(run.libraryID, key);
			if (!c || c.getChildItems(false).length || children(c).length) continue;
			try {
				await c.eraseTx();
				result.deleted++;
			}
			catch (e) {
				Zotero.logError(e);
			}
		}
		setPref(LAST_PREF, "");
		notify(`已收回 ${result.removed} 筆，刪除 ${result.deleted} 個空的子分類。`);
		return result;
	}

	return {
		MAX_ISLANDS, MIN_PAPERS, GENERIC_SHARE, SOURCE_LABELS, runtime,
		cleanName, proposeIslands, planBuild,
		readLast, run, undoLast,
	};
});
