// 「幫我建立 Notion 資料庫」 (content/notion.js): createLiteratureDatabase sends one POST /v1/databases under
// the chosen page with every column the sync writes (the same schema ensureSchema adds, under the Chinese
// names), listSharedPages reads POST /v1/search (pages only, last edited first, rows of databases and
// trashed pages left out, paginated, capped), and errors read as Chinese sentences (token, not shared,
// missing or trashed database with the 重新建立 hint). No network: fetch is stubbed.
const test = require("node:test");
const assert = require("node:assert/strict");
const notion = require("../content/notion.js");

const PAGE_ID = "0123456789abcdef0123456789abcdef";
const PAGE_UUID = "01234567-89ab-cdef-0123-456789abcdef";
const DB_HEX = "fedcba9876543210fedcba9876543210";
const DB_UUID = "fedcba98-7654-3210-fedc-ba9876543210";
const noSleep = async () => {};

function response(status, json) {
	return { status, ok: status >= 200 && status < 300, headers: { get: () => null }, text: async () => JSON.stringify(json) };
}

function client(handler) {
	let calls = [];
	let fetch = async (url, init) => {
		let path = url.replace("https://api.notion.com/v1/", "");
		let body = init.body ? JSON.parse(init.body) : undefined;
		calls.push({ method: init.method, path, body, headers: init.headers });
		return handler(path, init.method, body, calls);
	};
	return { client: new notion.NotionClient({ token: "ntn_test", fetch, sleep: noSleep }), calls };
}

function page(id, title, extra = {}) {
	return Object.assign({
		object: "page", id, url: `https://www.notion.so/${id.replace(/-/g, "")}`,
		parent: { type: "workspace", workspace: true },
		properties: { title: { id: "title", type: "title", title: [{ plain_text: title }] } },
	}, extra);
}

test("createLiteratureDatabase: one POST /v1/databases under the page, with every synced column under its Chinese name", async () => {
	let { client: c, calls } = client((path, method, body) => {
		if (path === "databases" && method === "POST") {
			return response(200, { object: "database", id: DB_UUID, url: `https://www.notion.so/ZotMax-${DB_HEX}`, data_sources: [{ id: "ds-1111", name: "ZotMax 文獻" }] });
		}
		return response(404, { code: "object_not_found", message: path });
	});
	let out = await c.createLiteratureDatabase({ parentPageId: `https://www.notion.so/My-thesis-${PAGE_ID}` });
	assert.deepEqual(out, { databaseId: DB_UUID, dataSourceId: "ds-1111", url: `https://www.notion.so/ZotMax-${DB_HEX}` });
	assert.equal(calls.length, 1, "one request, one database");
	let { method, path, body, headers } = calls[0];
	assert.equal(method, "POST");
	assert.equal(path, "databases");
	assert.equal(headers["Notion-Version"], "2025-09-03");
	assert.deepEqual(body.parent, { type: "page_id", page_id: PAGE_UUID });
	assert.deepEqual(body.title, [{ type: "text", text: { content: "ZotMax 文獻" } }]);
	assert.equal(notion.DEFAULT_DATABASE_TITLE, "ZotMax 文獻");
	let props = body.initial_data_source.properties;
	// 標題 plus one column per PROPERTY_SCHEMA key, named as PROPERTY_NAMES_ZH, with the same definition
	assert.deepEqual(props[notion.TITLE_NAME_ZH], { title: {} });
	assert.equal(Object.keys(props).length, Object.keys(notion.PROPERTY_SCHEMA).length + 1);
	for (let [key, def] of Object.entries(notion.PROPERTY_SCHEMA)) {
		assert.deepEqual(props[notion.PROPERTY_NAMES_ZH[key]], def, key);
	}
	assert.deepEqual(props["閱讀狀態"].select.options.map(o => o.name), ["待讀", "閱讀中", "已讀", "已引用", "已刪除"]);
	// The sync reads the created columns as its own: nothing left for ensureSchema to add
	let asCreated = {};
	let i = 0;
	for (let [name, def] of Object.entries(props)) asCreated[name] = { id: `p${i++}`, type: Object.keys(def)[0] };
	let schema = notion.resolveSchema(asCreated);
	assert.deepEqual(Object.keys(schema.names).sort(), Object.keys(notion.PROPERTY_SCHEMA).sort());
	for (let [key, def] of Object.entries(notion.PROPERTY_SCHEMA)) assert.equal(schema.props[key], Object.keys(def)[0], key);
	assert.equal(schema.titleName, "標題");
	assert.equal(schema.chinese, Object.keys(notion.PROPERTY_SCHEMA).filter(k => notion.PROPERTY_NAMES_ZH[k] !== k).length);
	// The new database resolves without another request
	assert.equal(await c.resolveDataSourceId(out.url), "ds-1111");
	assert.equal(calls.length, 1);
	// newDatabaseProperties hands out copies: the schema can't be changed through them
	notion.newDatabaseProperties()["閱讀狀態"].select.options.push({ name: "x" });
	assert.equal(notion.PROPERTY_SCHEMA.Status.select.options.length, 5);
});

test("createLiteratureDatabase: a custom title; a partial response is completed with GET; a bad page link never calls", async () => {
	let { client: c, calls } = client((path, method) => {
		if (path === "databases" && method === "POST") return response(200, { object: "database", id: "db-2" });
		if (path === "databases/db-2") return response(200, { object: "database", id: "db-2", url: "https://www.notion.so/db2", data_sources: [{ id: "ds-2" }] });
		return response(404, { code: "object_not_found", message: path });
	});
	let out = await c.createLiteratureDatabase({ parentPageId: PAGE_ID, title: "  碩論文獻  " });
	assert.deepEqual(out, { databaseId: "db-2", dataSourceId: "ds-2", url: "https://www.notion.so/db2" });
	assert.equal(calls[0].body.title[0].text.content, "碩論文獻");
	assert.deepEqual(calls.map(x => `${x.method} ${x.path}`), ["POST databases", "GET databases/db-2"]);
	await assert.rejects(c.createLiteratureDatabase({ parentPageId: "https://www.notion.so/my-page" }), /無法從「https:\/\/www\.notion\.so\/my-page」解析出 Notion 頁面 ID/);
	assert.equal(calls.length, 2);
});

test("createLiteratureDatabase errors: bad token, page not shared (404 / 403) in Chinese", async () => {
	let status = 401;
	let code = "unauthorized";
	let { client: c } = client(() => response(status, { object: "error", code, message: "API token is invalid." }));
	await assert.rejects(c.createLiteratureDatabase({ parentPageId: PAGE_ID }), (e) => {
		assert.ok(e instanceof notion.NotionError);
		assert.equal(e.status, 401);
		assert.match(e.message, /^Notion 不接受這個 token/);
		assert.match(e.message, /notion\.so\/profile\/integrations/);
		return true;
	});
	status = 404;
	code = "object_not_found";
	await assert.rejects(c.createLiteratureDatabase({ parentPageId: PAGE_ID }), (e) => {
		assert.equal(e.code, "object_not_found");
		assert.match(e.message, /^這個頁面還沒分享給 integration/);
		assert.match(e.message, /⋯ → Connections → 選你的 integration/);
		return true;
	});
	status = 403;
	code = "restricted_resource";
	await assert.rejects(c.createLiteratureDatabase({ parentPageId: PAGE_ID }), /這個頁面還沒分享給 integration.*Insert content/);
	// Anything else keeps Notion's own words
	status = 400;
	code = "validation_error";
	await assert.rejects(c.createLiteratureDatabase({ parentPageId: PAGE_ID }), /^Error: Notion API 400 \(validation_error\): API token is invalid\.$|Notion API 400 \(validation_error\)/);
});

test("listSharedPages: POST /v1/search for pages, last edited first; rows of databases and trashed pages left out; titles and icons", async () => {
	let { client: c, calls } = client((path, method, body) => {
		assert.equal(path, "search");
		assert.equal(method, "POST");
		if (!body.start_cursor) {
			return response(200, {
				object: "list", has_more: true, next_cursor: "c2",
				results: [
					page("aaaaaaaa-0000-0000-0000-000000000001", "碩論", { icon: { type: "emoji", emoji: "🎓" } }),
					// A literature page synced earlier: a row of the database, not a place for a new one
					page("aaaaaaaa-0000-0000-0000-000000000002", "Exercise and falls", { parent: { type: "data_source_id", data_source_id: "ds", database_id: "db" } }),
					page("aaaaaaaa-0000-0000-0000-000000000003", "Old row", { parent: { type: "database_id", database_id: "db" } }),
					page("aaaaaaaa-0000-0000-0000-000000000004", "In the trash", { in_trash: true }),
					{ object: "page", id: "aaaaaaaa-0000-0000-0000-000000000005", url: "https://www.notion.so/untitled", parent: { type: "page_id", page_id: "x" }, properties: { Name: { type: "title", title: [] } } },
				],
			});
		}
		return response(200, { object: "list", has_more: false, next_cursor: null, results: [page("aaaaaaaa-0000-0000-0000-000000000006", "Notes", { icon: { type: "external", external: { url: "x" } } })] });
	});
	let pages = await c.listSharedPages();
	assert.deepEqual(pages, [
		{ id: "aaaaaaaa-0000-0000-0000-000000000001", title: "碩論", url: "https://www.notion.so/aaaaaaaa000000000000000000000001", icon: "🎓" },
		{ id: "aaaaaaaa-0000-0000-0000-000000000005", title: "", url: "https://www.notion.so/untitled", icon: "" },
		{ id: "aaaaaaaa-0000-0000-0000-000000000006", title: "Notes", url: "https://www.notion.so/aaaaaaaa000000000000000000000006", icon: "" },
	]);
	assert.equal(calls.length, 2);
	assert.deepEqual(calls[0].body, {
		filter: { property: "object", value: "page" },
		sort: { timestamp: "last_edited_time", direction: "descending" },
		page_size: 100,
	});
	assert.equal(calls[1].body.start_cursor, "c2");
});

test("listSharedPages: stops at the limit and after a few requests; none shared is an empty list", async () => {
	let n = 0;
	let { client: c, calls } = client(() => {
		let results = Array.from({ length: 100 }, (_, i) => page(`bbbbbbbb-0000-0000-0000-${String(n * 100 + i).padStart(12, "0")}`, `P${n * 100 + i}`));
		n++;
		return response(200, { object: "list", has_more: true, next_cursor: `c${n}`, results });
	});
	let pages = await c.listSharedPages();
	assert.equal(pages.length, 50);
	assert.equal(calls.length, 1);
	// Only rows of databases: the cap on requests ends it
	let rows = client((path, method, body) => response(200, {
		object: "list", has_more: true, next_cursor: `${body.start_cursor || "c"}x`,
		results: [page("cccccccc-0000-0000-0000-000000000001", "row", { parent: { type: "data_source_id", data_source_id: "ds" } })],
	}));
	assert.deepEqual(await rows.client.listSharedPages({ maxRequests: 3 }), []);
	assert.equal(rows.calls.length, 3);
	let none = client(() => response(200, { object: "list", has_more: false, next_cursor: null, results: [] }));
	assert.deepEqual(await none.client.listSharedPages(), []);
	let bad = client(() => response(401, { code: "unauthorized", message: "API token is invalid." }));
	await assert.rejects(bad.client.listSharedPages(), /^Error: Notion 不接受這個 token|Notion 不接受這個 token/);
});

test("the configured database missing, not shared or in the trash: Chinese words that suggest 重新建立 (nothing created)", async () => {
	let { client: c, calls } = client(path => response(404, { object: "error", code: "object_not_found", message: `Could not find ${path}.` }));
	await assert.rejects(c.resolveDataSourceId(`https://www.notion.so/Literature-${PAGE_ID}?v=1`), (e) => {
		assert.equal(e.status, 404);
		assert.match(e.message, /^找不到這個 Notion 資料庫：可能被刪除、移到垃圾桶，或沒有分享給 integration/);
		assert.match(e.message, /建立新的資料庫…/);
		assert.match(e.message, /設定精靈讓 ZotMax 重新建立/);
		return true;
	});
	assert.deepEqual(calls.map(x => `${x.method} ${x.path}`), [`GET databases/${PAGE_UUID}`, `GET data_sources/${PAGE_UUID}`]);
	let trashed = client(path => (path.startsWith("databases/")
		? response(200, { object: "database", id: PAGE_UUID, in_trash: true, data_sources: [{ id: "ds" }] })
		: response(404, { code: "object_not_found", message: path })));
	await assert.rejects(trashed.client.resolveDataSourceId(PAGE_ID), /^Error: 這個 Notion 資料庫在垃圾桶裡.*重新建立|這個 Notion 資料庫在垃圾桶裡.*重新建立/);
	assert.ok(!trashed.calls.some(x => x.method !== "GET"), "nothing is created or changed");
	// A token Notion refuses while resolving keeps saying so
	let refused = client(() => response(401, { code: "unauthorized", message: "API token is invalid." }));
	await assert.rejects(refused.client.resolveDataSourceId(PAGE_ID), /Notion API 401/);
});

test("friendlyError leaves other errors alone", () => {
	let plain = new Error("network down");
	assert.equal(notion.friendlyError(plain, "page"), plain);
	let other = new notion.NotionError(409, "conflict_error", "Conflict");
	assert.equal(notion.friendlyError(other, "database"), other);
	assert.match(notion.friendlyError(new notion.NotionError(403, "restricted_resource", "x"), "search").message, /^integration 沒有權限/);
});
