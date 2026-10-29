# 21 個提案與審查判斷（審查者的意見優先於提案）


## #1 撤稿與關切聲明旗標：從 Zotero 一路帶到筆記、PICO 表、GRADE 和 PRISMA
- 審查後標題：撤稿旗標第一階段：把 Zotero 的撤稿資料帶到筆記、PICO 和 GRADE 表與 PRISMA 檢查（PubMed／OpenAlex 關切聲明月檢列第二階段）
- keep=True・effort M→M・impact 5→3

**WHAT** 同步時，Zotero 已標為撤稿的條目會在文獻筆記 frontmatter 寫入 retraction: retracted 和 retraction_date，筆記看板頂端顯示紅色 callout：「這篇已撤稿（日期／原因），不要引用；若已納入回顧，請在 PRISMA 筆記說明怎麼處理」。首頁、主題頁、PICO 表、GRADE 研究清單和評讀總表在這類研究前加 ⛔；島嶼大綱的「先讀、先引用」不會再推薦它。PRISMA 一致性檢查多一條「已納入的研究被撤稿（n 篇）」，進度報告加一行「本期新發現被撤稿／有關切聲明的已納入研究」。另有一個預設關閉的 PubMed 月檢：讀 efetch 的 CommentsCorrections（RetractionIn、ExpressionOfConcernIn、ErratumIn），補上 Zotero 沒標到的關切聲明與勘誤。

**HOW** 1) content/main.js 組 data 時（fullTextStatus 旁邊），用 Zotero.Retractions.isRetracted(item) 和 getData(item) 填入 data.retraction = { status, date, reasons }，整段包在 try 裡，API 不存在就略過。2) content/core.js 的 managedFrontmatter() 加 retraction、retraction_date、post_pub 三個欄位，content/obsidian-style.js 的受管欄位清單也要加；content/notion.js 加「撤稿」checkbox 欄。3) content/dashboard.js 的 noteRecord() 加 retracted 和 postPub；issuesOf() 加「已撤稿」，overviewBoard 加一張 KPI 卡。content/topics.js 的 paperSection／startHere 和 content/planet.js 的 keyPapers() 排除或標示這些研究，pickQuests() 不再派它當任務。4) content/screening.js 在 ISSUES 加 ["retractedIncluded","warn",…]，computePrisma() 已收集 included，只要 record 多帶 retracted 欄位（呼叫端從 Zotero.Retractions 填入）；content/pico.js 的 tableRow() 和 content/grade.js 的研究清單在標題前加 ⛔。5) 月檢：在 content/topic-bot.js 的 parseEFetch() 旁加純函式 commentsCorrections(xml)，回傳 [{refType, pmid}]。content/pubmed-watch.js 每月一次，只對「全文已納入且有 PMID」的條目分批 efetch，用現有的 createThrottle 限速，結果存 pref（例如 retraction.checks）。6) content/progress-report.js 的 collectFacts() 和上一期的 history 比對，只列這一期新出現的旗標。要寫測試的純函式：commentsCorrections、noteRecord 的新欄位、computePrisma 的新 issue。

**COACH** 整個功能不用 AI，只把資料庫裡的事實帶到使用者每天會看的地方。提示寫成問題（「這篇在你的回顧裡要怎麼處理？」），要不要排除、方法章怎麼寫由使用者決定；ZotMax 不刪條目，也不改篩選標籤。

**RISKS** Zotero.Retractions 是內部 API，版本更新可能改名，要包 try，並在設定頁顯示「撤稿資料不可用」。它只認有 DOI 或 PMID 的條目，華藝和學位論文都查不到，所以提示要寫「沒有旗標不代表沒問題」。PubMed 月檢要遵守 NCBI 速率限制；有 API key 時用現有的 ncbiSettings()。預印本後來正式發表這一塊不在這次範圍。

**REVIEWER** Keep it, but cut the scope down. Why I could not reject it: ZotMax has no retraction handling at all. Zotero already shows its own red retraction banner, but only inside Zotero, and BOB works from the Obsidian notes, the PICO/GRADE tables and the PRISMA flow, where the flag never shows up. If a study in the review is retracted and nobody catches it, an examiner or reviewer can catch it later, so the cost is high. No AI is involved, so it stays a coach: the prompt is a question, and ZotMax deletes nothing and changes no screening tags.

Weaknesses and changes:
(1) Retracted papers in nursing are rare, so impact is a 3, not a 5. It matters a lot when it happens, but it seldom happens. The proposal also touches more than 12 files (main, core, obsidian-style, notion, dashboard, topics, planet, screening, pico, grade, pubmed-watch, progress-report), which is too much for a "quick" item.
(2) Phase 1 should be only: data.retraction from Zotero.Retractions wrapped in try; frontmatter retraction / retraction_date; the red callout in the note; ⛔ in the PICO table, the GRADE study list and the appraisal summary; the PRISMA issue retractedIncluded; and one dashboard issue. Drop the Notion column, the KPI card, the topic/planet re-ranking and the progress-report diff for now. A ⛔ in noteRecord already lets keyPapers() and pickQuests() skip those papers with a single filter line.
(3) Zotero.Retractions only covers retractions (Retraction Watch data). It does not give expressions of concern or errata, so the post_pub field has no data source in phase 1. Leave it out until phase 2.
(4) Make the PubMed monthly check phase 2 and keep it off by default. Also consider OpenAlex is_retracted, which can be fetched through the existing OpenAlex client in citation-chase. It is free and also covers DOIs that are not in PubMed. Neither source covers 華藝 or theses, so keep the warning that no flag does not mean no problem.
(5) A paper can be retracted after its note was written, so the sync has to rewrite managed frontmatter on unchanged items, or the flag never reaches existing notes. Check that the incremental sync does this.
(6) Add an on/off switch in features.js, and a notice in settings when the Zotero.Retractions API is missing.
(7) Tests: commentsCorrections() in phase 2; computePrisma() retractedIncluded and the noteRecord() fields in phase 1.


## #2 檢索日誌：每次開資料庫或匯入時記一筆，自動產生 PRISMA-S 附錄，PRISMA 的「辨識」也改從日誌加總
- 審查後標題：檢索日誌：記下每次檢索（含中文庫與 0 筆），匯出 PRISMA-S 草稿，並與 PRISMA 來源標籤對帳（不改辨識數）
- keep=True・effort M→M・impact 5→4

**WHAT** 每個分類有一份「檢索日誌.md」，每一列是一次檢索：日期、資料庫、平台／介面、完整檢索式、限制條件（年份／語言／文章類型）、命中筆數、匯入檔名、匯入筆數、備註，查到 0 筆也記。記錄的入口有三個：(a) 在 PubMed 追蹤按「測試檢索式」後多一個「記到檢索日誌」按鈕，自動帶入命中數與 PubMed 的 query translation；(b) 從「醫學文獻快速搜尋」打開華藝、臺灣博碩士論文、國圖期刊、CINAHL 或灰色文獻網站時，跳出一張小卡，預先填好資料庫、日期和複製出去的檢索詞，只要補上命中數；(c) 匯入一批帶 來源/ 標籤的條目後，提醒補記一筆。日誌筆記底部提供「匯出 PRISMA-S 附錄」，依資料庫列出 16 項。PRISMA 流程圖的 Records identified 優先用日誌加總，並和 Zotero 裡的 來源/ 標籤數對帳，例如「華藝日誌記 42 筆，Zotero 只有 30 筆標了 來源/華藝」。快速搜尋也補上 CNKI（開首頁並複製檢索詞）。

**HOW** 1) 新增純模組 content/search-log.js：parseLog(md)／buildLog(rows) 處理 Markdown 表格，並用 %% 區塊標記保留使用者手寫的部分；prismaS(rows) 輸出附錄；reconcile(rows, prismaResult.sources) 對帳。2) content/pubmed-watch.js 的 testQuery() 已拿到 count 和 translation（parseESearch），在結果視窗加按鈕，呼叫 searchLog.append()。3) content/search-links.js 的 openTarget(t)：設定開啟、且 t.copy 為真或 source.lang === "zh" 時，開一個小 dialog（沿用 progress-report 的 <dialog> 模式），把 t.name、t.query 和今天日期預填好。BUILTIN 加 { id: "cnki", name: "CNKI 中國知網", home: "https://www.cnki.net/", lang: "zh", check: "copy" }。4) content/screening.js 的 computePrisma() 加 opts.logIdentified：有日誌時 counts.identified 用日誌加總，另外算 sources 與日誌的差額，放進 issues（code "logMismatch"）。buildReviewSection() 加一節「檢索紀錄」連到日誌。5) content/topic-bot.js 的 chineseRow() 文字從「請自己查」改成「查完請記到檢索日誌」，並附上日誌連結。功能開關：searchLog.enabled。

**COACH** 這是記錄用的鷹架，不碰 AI。欄位由使用者填，ZotMax 只預填它確實知道的事（日期、檢索式、PubMed 的筆數），對帳結果也只指出數字對不上，不替使用者改數字。

**RISKS** 每次開連結都跳卡片會很煩，所以要能在設定裡改成只對中文庫和灰色文獻跳，或整個關閉。使用者忘了記，日誌就會不完整，這時 PRISMA 要退回原本的標籤計數並清楚標示資料來源。PRISMA-S 匯出只是草稿，正式附錄仍需使用者核對。CNKI 的簡體轉換這次不做，只複製原檢索詞並提醒用簡體重查。

**REVIEWER** Verdict: keep it, but with changes. I checked the repo and the gap is real. ZotMax builds query strings (pico.searchQuery, quick search, the web PICO generator) and counts records (screening.computePrisma uses 來源/ tags). It never records which query was run, in which database, on which date, with which limits, or how many hits came back. That record is exactly what PRISMA-S asks for, and what the TWNA EBHC report scores under 文獻搜尋. Chinese databases (華藝, NDLTD, 國圖) are copy-and-open only, so they leave no trace at all, and topic-bot's chineseRow() just says 「請自己查」. Everything is local Markdown. There is no AI, so the coach principle holds, and no paid API.

Changes I would require:

1) Do NOT replace counts.identified with the log total. The rest of computePrisma checks "identified = duplicates + screened" (screening.js:474), which ties duplicates to identified. If identified came from the log (say 華藝 42 hits) while screened stays a count of Zotero items (30 imported), the 12 records that were never imported would be miscounted as duplicates and the consistency check would break. Keep the tag-based flow as it is. Show the log total next to it per database in a 「檢索紀錄對帳」 section, and add a logMismatch issue that only points out the gap and suggests a cause (not exported, not tagged 來源/X, imported twice). The user decides which number to report.

2) No popup every time a link opens. Instead, after a zh or copy source opens, show a non-blocking button or toast 「記到檢索日誌」, plus a 「記一筆」 button in the quick-search dialog. The PubMed 「測試檢索式」 button (pubmed-watch.js:881 and topic-bot.js:878) is the high-value entry point, because count and translation are already there. Start with that one.

3) Drop CNKI from this item. It is unrelated scope creep, and copying the Traditional Chinese query into CNKI gives misleadingly low hit counts. It can be its own small search-links entry later.

4) Treat the PRISMA-S export as a checklist draft, not a 16-item-per-database table. Several items are review-level: search peer review, deduplication method, updates, total records. Fill only what the log knows, and mark the rest 「待填」. That keeps the user doing the reporting.

5) Store the log per collection in the existing 30 評讀與綜整 folder, with a %% user-zone %% block like the other notes. Also allow a Zotero-pref copy so the reconciliation works without Obsidian.

Remaining risks: the log is only as complete as the user's habit. The step-(c) reminder after a batch with 來源/ tags helps. The MeSH, CINAHL Headings and Emtree translation pain is only documented here, not solved, so don't claim it. Impact 4, not 5: high for anyone writing a systematic review, scoping review or EBHC report, lower for everyday reading. Effort is M once trimmed to the PubMed button, the zh-source button, the import reminder, the parse/build/prismaS/reconcile pure module and the PRISMA side section.


## #3 檢索健康檢查：產生 PRISMA、PICO 檢索式或進度報告時，主動列出客觀的檢索缺漏
- 審查後標題：PRISMA 筆記的「檢索健康檢查」卡（資料庫涵蓋、Scholar 欄位、質性題 CINAHL、6S 上層），加上 PICO 題型檢索提醒與使用者自填的停止理由
- keep=True・effort M→M・impact 4→4

**WHAT** PRISMA 筆記、PICO 問題卡和進度報告會出現一塊「🩺 檢索健康檢查」，用規則列出可以客觀判斷的問題，例如：只有 1 個資料庫；Google Scholar 被算在「資料庫」欄（建議改列補充檢索）；有納入研究只靠 Google Scholar 找到；質性題型卻沒查 CINAHL；分類裡有 3 篇以上 RCT，卻沒有 SR 或指引（先往 6S 上層找）；PICO 檢索式某個概念只有 MeSH、沒有自由詞（或反過來）；CINAHL 版的 MH 詞直接沿用 MeSH，還沒核對；沒做引文追蹤；最近兩輪引文追蹤都沒有新納入（可以考慮停，請寫下停止理由）。每一項附一句「為什麼重要」和下一步連結，最後一行是「把這份清單帶去給館員或指導教授看」。另外加一個「停止搜尋的理由」欄位，內容寫進 PRISMA 筆記的 frontmatter 和進度報告。

**HOW** 1) 在 content/screening.js 新增純函式 searchHealth({ prisma, cfg, card, chase, log })，回傳 [{level, code, text, why, action}]。資料來源：prisma.sources（來源/ 標籤統計）、prisma.included 搭配每筆的 來源/ 標籤（判斷是否只來自 Scholar）、content/pico.js 的 normalizeCard().type（質性題型 "meaning"）、content/dashboard.js 的 noteRecord().studyDesign 計數（RCT 與 SR、指引的比例）、content/search-links.js 的 picoQuery()／buildMeshQuery() 輸出（每個概念有沒有 [tiab] 和 [Mesh]），以及 content/citation-chase.js 存下的每次查詢結果（新候選數、新納入數）。2) content/screening.js 的 isOtherMethod() 保持原樣，但 searchHealth 遇到 cfg.otherSources 不含 "Google Scholar"、prisma.sources 卻有它時，給出建議。3) 在 buildReviewSection()、content/pico.js 的 checkCard() 輸出之後（新增一個「檢索」分類）、content/progress-report.js 的 buildSections() 裡插入這塊，各自有開關。4) content/pico.js 的 checkCard() 加兩條純規則：type === "meaning" 時提醒加質性研究詞並查 CINAHL；type === "diagnosis" 時提醒 O 通常不放進檢索式。5) 停止理由：PRISMA 筆記 frontmatter 加 search_stop_reason，由使用者在筆記裡填寫，progress-report 的 reviewRecord() 讀出來。

**COACH** 給的是客觀訊號和問題，不打分數、不替使用者判斷「查夠了」。停止理由由使用者寫，ZotMax 只顯示佐證數字。目的是補上 Dunning-Kruger 那一塊，讓低估缺漏的人也看得見問題，並把人導向館員和指導教授，而不是導向 AI。

**RISKS** 規則太多會變成噪音，所以每個畫面最多顯示 5 條，依嚴重度排序，每條都能「略過這條」並記住。設計判讀依賴 AI 筆記的 study_design，沒有 AI 筆記的條目就不計入，要在畫面上說明。Scholar 該算資料庫還是其他方法，各校規定不同，所以只提醒、不自動移欄。

**REVIEWER** 結論是保留，但範圍要大幅縮小。原提案自稱 quick，實際上要動三個畫面、加上逐條略過的記憶和 frontmatter 欄位，屬於 M。有幾條規則找不到資料來源。
(1) 拿掉的規則：
- 「CINAHL 的 MH 詞沿用 MeSH、還沒核對」：ZotMax 根本不會產生 CINAHL MH 檢索式（search-links.js 只有 buildMeshQuery 和 PubMed 的 [Mesh]/[tiab]），沒有東西可以檢查。
- 「最近兩輪引文追蹤都沒有新納入」：citation-chase.js 沒有保存每一輪的紀錄（新候選數、新納入數）。要先新增歷史狀態才能判斷，不屬於快速改進，留到下一步。
- 「某個概念只有 MeSH、沒有自由詞」：buildMeshQuery 一定會為每個概念加上 [tiab]，所以 ZotMax 自己產生的檢索式不會觸發。剩下的情況得解析使用者手寫的檢索式，又脆弱又容易誤報。
(2) 保留的規則，都能從現有資料客觀判斷：
- 已命名的資料庫來源只有一個（看 computePrisma 的 result.sources，扣掉 NO_SOURCE）。
- 很多筆沒有「來源/」標籤：直接說「無法判斷資料庫涵蓋度，請先加來源標籤」，不要用它去算「只有一個資料庫」。
- Google Scholar 出現在資料庫欄（預設的 DEFAULT_OTHER_SOURCES 沒有 Scholar）：只提醒，不自動移欄。
- 有納入研究只靠 Scholar 找到。
- PICO 卡 type === "meaning"，來源卻沒有 CINAHL。
- 納入研究裡 RCT ≥3 篇，卻沒有 SR 或指引：用 rows 的 design 判斷，沒有 AI 筆記的條目要註明不計入。
- 引文追蹤欄是空的。
(3) checkCard() 加兩條純規則：meaning 題型提醒加質性詞並查 CINAHL；diagnosis 題型提醒 O 通常不放進檢索式。這部分是 S，可以先做。
(4) 第一版只放在 PRISMA 筆記，做成 issuesMarkdown 旁邊的一張卡，或 board 版面的一張 chartCard。進度報告只讀 search_stop_reason 和檢查的條數，不必再做一份完整清單。PICO 卡那邊只靠 checkCard 的新規則，不另做區塊。這樣「每條都能略過並記住」就可以延後。
(5) search_stop_reason 由使用者自己在 frontmatter 填寫，進度報告的 reviewRecord() 讀出來。要確認重新產生 PRISMA 筆記時不會覆蓋使用者寫的值，也就是寫進 frontmatterFor 時要保留原值。
教練角色沒問題：只列客觀訊號和下一步，不打分數，最後把人導向館員和指導教授。痛點也是真的：台灣護理研究生常常只查一個資料庫、把 Google Scholar 當資料庫、質性題不查 CINAHL，口試和投稿審查都會被問到這些。


## #4 PubMed 追蹤改走候選看板：評分、每週閱讀上限、逾期自動清掉，會影響 GRADE 的置頂
- 審查後標題：主題搜尋機器人：新 SR/RCT 命中 GRADE 結果指標時 🔔 置頂提醒（用概念別名比對），待看候選逾期自動摺疊
- keep=False・effort M→M・impact 4→2

**WHAT** PubMed 追蹤多一個「候選模式」（新安裝預設開啟）：新文獻不直接匯入 Zotero，而是出現在追蹤筆記的勾選清單，和主題機器人一樣有 0–100 分、⭐ 分級和評分理由。設定裡有「每週最多看 N 篇」（全部追蹤與機器人合計），超過上限的低分候選先收進摺疊區。每篇都要做一個決定：匯入、略過，或之後再看；4 週沒處理的候選自動移到「已過期」，不再算進待看數。有兩種情況會置頂並加 🔔：新的 SR 或 RCT 命中你已建 GRADE 表的結果指標，或命中 PICO 問題卡的 P、I、O。看板最上方依證據層級排序，指引和 SR 在前，原始研究在後。

**HOW** 1) content/pubmed-watch.js 的檢查流程目前是先 esummary 再直接 importPMIDs()。候選模式改成用 efetch 取得摘要和 MeSH（重用 content/topic-bot.js 的 parseEFetch），再交給 topicBot 的 scoreCandidate(c, profile)。profile 用 queryBlocks(watch.term)／profileFrom() 從追蹤的檢索式建立，清單用 botLine() 輸出。勾選後的匯入沿用 topic-bot 現有的「只匯入勾選的」流程（parseListed 加 importPMIDs），匯入時加 來源/PubMed 和 watchTag。2) 逾期：在 topic-bot.js 的 buildBotSection() 加 opts.expireDays，用 parseListed 讀到的首次列出日期判斷，逾期的移到 <details> 區塊；現有的 stats.pending 就不會把它算進去。3) 每週上限：新增 pref feed.weeklyCap，在 content/topics.js 首頁統計和 botSummaries() 的 pending 加總，超出時只顯示前 N 篇高分候選，其餘摺疊。4) GRADE 置頂：讀 content/grade.js 的 pref grade.tables（各結果指標名稱），加上 pico.cards 的 o 欄位，產生額外的 profile 元素（權重高）；designOf(c) 為 SR、MA 或 RCT 且命中結果指標時加 🔔，排到最上面。這些都是純函式，可以測試。5) 舊使用者維持直接匯入（pubmedWatch.mode = "import"），設定頁可切換。

**COACH** 規則評分只負責排序和提醒，讀不讀、收不收由使用者決定，每篇都要人按一下。不用 AI 摘要取代閱讀；🔔 只說明「這篇可能影響你的 GRADE 判斷，請讀過再決定」。

**RISKS** 改變了老使用者習慣的行為，所以預設只對新增的追蹤開候選模式，並在更新說明裡講清楚。efetch 比 esummary 重，要分批並限速。GRADE 結果指標用字面比對，可能誤判，🔔 旁要寫出命中的詞。逾期清單要能一鍵恢復。

**REVIEWER** 結論：照目前的寫法不收。痛點是真的，但大部分已經有現成功能。

1) 核心內容重複。在 PubMed 追蹤加一個「候選模式」，等於再做一次主題搜尋機器人，只是少了核心文獻、少了 OpenAlex 被引用來源，也少了島嶼分流。兩個功能幾乎一樣、只差預設行為，反而更難懂。研究生引導模式本來就是把追蹤關掉，讓人改用機器人。需要候選清單的使用者，應該引導去「從這個追蹤建立主題搜尋機器人」，不是在追蹤裡複製一套。追蹤的檢索式本來也能直接存成機器人。

2) 「每週最多看 N 篇」對證據工作不利。把低分候選摺起來，等於用字面比對的規則幫人決定要不要讀，可能因此漏掉相關研究。這跟 SR 和實證報告要求的完整檢索相衝突。現有的 MAX_LISTED 截斷已經能控制清單長度。

3) GRADE 🔔 的比對做不起來。grade.tables 的結果指標是使用者自己取的名稱，通常是中文（例如「跌倒率」），PubMed 的摘要卻是英文，用字面比對幾乎不會命中。要命中就得透過概念卡片的別名（concepts.js 的 parseAliases）轉成英文詞，提案沒有提到這一步。「命中 PICO 的 P、I、O」也已經是機器人評分的一部分，不算新功能。

4) 依證據層級排序也已經有了：designOf 的設計分數會算進 score，清單依分數排序。

真正新的、值得做的只有兩件小事，建議改成另一個範圍窄很多的提案，接在主題搜尋機器人上，不改 PubMed 追蹤：
(a) GRADE 證據更新提醒。分類已經有 GRADE 表時，機器人的新候選如果是 SR、MA 或 RCT，而且摘要命中某個結果指標（用 GRADE 結果名稱，加上概念卡片別名和 PICO 卡的 O 轉成英文詞），就在那行加「🔔 可能影響 GRADE：〈結果名稱〉（命中詞）」並置頂，提醒使用者讀過再決定是否更新評分。這對博士生在做的 living review 和要更新的實證報告是真的痛點，而且只是提醒，判斷還是人做。
(b) 候選逾期。在 parseListed 記錄首次列出的日期，超過設定週數沒處理就收進「已過期」摺疊區，不算進待看數，要能一鍵恢復，讓首頁的待看數不會一直累積成噪音。
建議修改後的範圍：effort S～M，impact 3。


## #5 進度報告加入「我卡在哪裡／需要老師決定的事」，從評讀與查證狀態自動整理成候選問題
- 審查後標題：進度報告的「想請老師看的地方」：從評讀、查證、PRISMA、GRADE 的未決事項列出可勾選的候選問題
- keep=True・effort S→M・impact 4→3

**WHAT** 進度報告的對話框裡，「本次想討論的問題」上方多一個可勾選的「候選問題」清單，ZotMax 從使用者自己的資料整理出來，例如：「〈Smith 2022〉評讀第 3 題（隱匿分派）答『不清楚』，想請老師看判讀依據」、「3 篇 AI 筆記有 ⚠️ 未在全文中找到的句子，還沒核對」、「PRISMA 有 2 篇標題摘要和全文決定衝突」、「GRADE『跌倒率』的不精確性還沒寫理由」、「檢索健康檢查：只查了 1 個資料庫」。勾選的項目會帶進問題欄，使用者可以再改寫。報告另外固定兩個欄位：「我卡在哪裡」和「需要老師決定的事」，留空時顯示引導句，不留白。報告開頭先列「本期完成的小步驟」（任務、核對過的評讀、寫作字數），再列待處理事項。

**HOW** 1) content/progress-report.js 的 collectFacts()（約第 1210 行）新增 candidateQuestions：(a) 讀評讀表筆記（content/appraisal-form.js 的答案已經依題目存下，計算「常見弱點」時讀的就是 answers，見約第 348 行），取答「不清楚」的題目，附題目文字和文獻連結；(b) 用 content/verify.js 的 MARK_NOT_FOUND／MARK_NO_FULLTEXT 字串計算每篇 AI 筆記有幾句未查證；(c) content/screening.js computePrisma().issues 中 level 為 warn 的項目；(d) grade.tables 中 domain 有值但理由空白的項目；(e) 提案三的 searchHealth()。這些都寫成純函式 candidateQuestions(facts)，上限 8 條，依類型排序。2) 對話框（約第 1339 行 area(QUESTIONS_HEADING…)）上方加 checkbox 清單，勾選後 append 到 textarea。3) buildSections() 加 stuck 和 decide 兩個區塊（新的 heading 常數），carryOverGoals() 的做法同樣套用到「需要老師決定」，上次沒解決的會帶過來。4) readingSection() 已列出完成的任務；把它移到報告最前面，改名為「本期完成」，數字從 0 也照樣顯示。5) toPlainText() 不用改。SUMMARY_PROMPT 加一句：要點出卡關處，但不得新增內容。

**COACH** 候選問題全部來自使用者自己的評讀、查證和篩選紀錄，AI 不提出研究判斷。工具只幫人把「不確定」說出口、帶到導師面前，判讀仍由學生和導師完成，符合「缺乏 EBP 導師」時應該讓導師時間花在刀口上的方向。

**RISKS** 評讀筆記的格式要穩定，解析失敗時直接略過那一類，不報錯。列出太多「不清楚」可能讓人焦慮，所以措辭寫成「想請老師看」，不寫成「錯誤」，並限制條數。需要確認 appraisal-form 的答案存在 frontmatter 還是內文，再決定讀取的位置。

**REVIEWER** 結論：保留，但要改。

目前沒有這個功能。進度報告裡只有一個自由輸入的「本次想討論的問題」（progress-report.js 第 51、555、1339 行）。儀表板的「待處理」（dashboard.js 第 679、801 行）和單篇筆記的「下一步」（core.js 第 785 行）列的是單篇文獻的雜事，不是要帶去給導師的問題。程式碼裡搜尋「卡在、需要老師、候選問題」都沒有結果。

可行性：資料都在本機，而且已經是結構化的，風險比提案寫的低。
- 評讀答案不必解析筆記。appraisalForm.loadRecord(item) 會直接回傳 record.answers、answersB 和 verified，progress-report 的 verifiedAppraisals()（約第 1095 行）已經在用。所以提案裡「frontmatter 還是內文」的風險其實不存在。
- GRADE 已經有「降級了，寫一句理由」的警告（grade.js 第 363、367 行），直接沿用這個檢查就好，不必重寫。
- screening.computePrisma().issues 已經有 level 為 warn 的項目，可以直接用。
- verify.js 匯出了 MARK_NOT_FOUND 和 MARK_NO_FULLTEXT。不過每次都要讀每篇 AI 筆記檔來數，比較耗時，限定本期產生的或狀態是已讀的筆記就好。
- (e) searchHealth() 目前不存在，它依賴另一個還沒做的提案，這一版先拿掉。

教練角色：沒有問題。候選問題全部是規則從使用者自己的紀錄算出來的，不用 LLM，最後由使用者勾選、改寫。提案第 5 點要在 SUMMARY_PROMPT 加「點出卡關處」，這等於讓 AI 詮釋使用者的困難，又增加一個可能編造內容的地方，建議刪掉。現有的提示詞已經會在最後一句帶到要討論的問題，這樣就夠了。

要修改的地方：
1. 不要把所有答「不清楚」的題目都列出來。CASP／JBI 的「不清楚」常常只是原文沒報告，本身就是正確答案，不需要導師判斷，全列出來只會製造噪音和焦慮。改成只列以下幾種：
   (a) 雙人評讀中 A、B 意見不一致的題目（tools.disagreements() 已經有）；
   (b) 答「不清楚」而且使用者在該題的備註裡寫了問號、或寫了「問老師」的題目；
   (c) 同一種評讀工具、同一題在 2 篇以上文獻都答「不清楚」的，合併成一條，例如「隱匿分派在 3 篇都判不清楚，想確認判讀標準」，比逐篇列出更適合帶到導師面前。
2. 不要新增「我卡在哪裡」和「需要老師決定的事」兩個固定欄位。這兩欄和「本次想討論的問題」重疊，對話框會從 2 個文字欄變成 4 個，留空時的引導句也會讓報告看起來沒寫完。改成在現有的問題欄裡，每條問題前面可以加「【決定】」或「【卡關】」標籤；carryOverGoals 的做法只套用在加了【決定】標籤、而且上次沒有打勾的項目。
3. 不要把「本期閱讀」移到最前面並改名。這會改變現有報告的結構（SECTIONS 順序、Notion 版面、使用者已經習慣的閱讀順序）。真的想要的話，做成一個開關，預設關閉。
4. 候選問題最多 6 條。每條附上文獻的 wikilink，以及「為什麼列出來」（例如「A/B 不一致」「降級未寫理由」）。checkbox 清單要能整個摺起來，並放在 features 開關裡。
5. 工作量從 S 改成 M：要整合 4 個資料來源，寫一個純函式加單元測試，修改對話框（模態 dialog 和 Services.prompt 兩條路徑都要支援），還要加開關。

影響評估：準備 meeting 的時候，把評讀和證據判斷上的不確定說出口，對沒有實證導師帶領的碩博士生是真實的痛點，對冒牌者感也有幫助。不過這是報告裡的輔助功能，使用頻率是兩週一次，所以影響給 3 分，不是 4 分。


## #6 修正 PubMed 方括號英譯標題的中文文獻：APA 判斷、補強提醒、跨語言去重
- 審查後標題：PubMed 匯入的《護理雜誌》英譯標題：判為中文、提醒補中文原標題，找重複加 PMID 與期刊卷頁規則
- keep=True・effort S→S・impact 4→3

**WHAT** 從 PubMed 匯入的《護理雜誌》這類文章（標題是 [英譯]、language 為 chi），APA 會改判為中文文獻、排進中文區，「中文文獻補強」也會提醒：「這是 PubMed 的英譯標題，請補上中文原標題與中文作者名（英譯會存進 Extra 的 translated-title）」。找重複時多兩條規則：同一個 PMID；或期刊（含 ISSN）、年份、卷、起始頁都相同（例如 Hu Li Za Zhi 和 護理雜誌）。這樣同一篇文章從 PubMed 和華藝各匯入一次，就能配成一組，確認視窗會寫出比對依據「期刊卷期頁相同（可能是中英文版本）」。篩選面板對這類條目顯示「全文是中文」。

**HOW** 1) content/apa-zh.js 的 isChineseItem()（第 118–126 行）：在 LATIN_RE 判斷之前加一條，ZH_LANG_RE.test(language) 且標題符合 /^\[.*\]\.?$/ 時回傳 true；同時匯出 isBracketTranslation(data) 給其他模組用。2) content/zh-meta.js 的檢查清單加一項 bracketTitle：建議把原標題搬到 Extra 的 translated-title，請使用者貼上中文標題（不由程式猜）。之後 CSL 可以讀這個欄位，與「中文文獻英譯」需求相通。3) content/screening.js 的 findDuplicates() 在 DOI 之後加兩個 bucket：bucket(r => r.pmid) 標「PMID 相同」，以及 bucket(r => venueKey(r)) 標「期刊卷期頁相同」。venueKey 是新純函式，用 ISSN 或正規化期刊名（加一張小對照表 {"hu li za zhi":"護理雜誌", …}）加上年、卷、起始頁。record 需要多帶 pmid、issn、volume、pages，在 screening 的 Zotero 讀取端補上。4) 確認視窗原本就列出比對依據，新的 basis 字串直接顯示。5) 新增測試：isChineseItem 的方括號案例、venueKey、findDuplicates 的中英版本配對。

**COACH** 這是資料修正，沒有 AI。中文原標題由使用者貼上，ZotMax 不翻譯也不猜；重複的判斷只是候選，仍由使用者確認。

**RISKS** 方括號標題也可能是其他語言的英譯（日文、韓文），所以 language 必須是 chi 或 zho 才判為中文。期刊對照表需要維護，先放《護理雜誌》、《榮總護理》等幾本常見 MEDLINE 收錄的臺灣期刊。卷期頁比對可能把同一期的勘誤配進來，因此只列為候選，不自動標重複。目前確認視窗是一次全部套用，這個缺點也會影響新規則；可以順手改成逐組勾選，但這會讓工作量變成 M。

**REVIEWER** I tried to reject this and couldn't. The gap is real and the code backs it up. Today isChineseItem() returns false as soon as the title is in Latin script, so a PubMed-imported Hu Li Za Zhi item with the title "[Effect of ...]" and language "chi" gets the English APA format. findDuplicates() only compares DOI and title+year, and itemRecord() does not carry pmid, issn, volume or pages. README line 434 also says the 中文文獻英譯 issue is not handled yet. Everything is local and rule-based with no AI, and the user pastes the Chinese title, so the coach principle holds.

Changes needed before building:
(1) MISSED BUG, must fix in the same change. zh-meta.js englishLanguage() currently flags exactly these items as 「英文文獻的語言寫成中文」 and suggests changing chi to en. That would undo the new rule and push the user to corrupt correct metadata. Exclude items that isBracketTranslation() matches, and replace that suggestion with the new bracketTitle reminder.
(2) Do not depend only on the brackets. Depending on the Zotero PubMed translator version, the trailing period or the brackets may be stripped. Use this detection: language is chi or zho, the title is in Latin script, and either it is wrapped in [..] (with or without a period) or the journal matches the small map / ISSN (Hu Li Za Zhi / The Journal of Nursing, ISSN 0047-262X). Test both title shapes.
(3) Make the map honest. Of the Taiwanese nursing journals, only 《護理雜誌》 is really MEDLINE-indexed, and J Nurs Res is in English. Drop the claim about 榮總護理 and others unless someone checks it. This narrow scope is also why impact is 3, not 4.
(4) Dedup. In itemRecord, read the PMID from Extra ("PMID: …"), and read issn, volume and the first page of pages. Add the PMID-same rule. Only bucket on journal+year+volume+start page when all four parts are present, so no blank-field collisions. Many Airiti and PubMed copies already share the DOI 10.6224/JN…, so the DOI rule covers part of this. Present the new rule as a fallback for items without a DOI.
(5) Keep the all-at-once confirm as it is. Do not add per-group checkboxes here; that is scope creep and would make this M. But give the new venue basis string the wording 「可能是中英文版本，請確認」, and keep tagging only, never merging.
(6) Leave CSL reading of translated-title for later. Only store the English title in Extra now, and do it only after the user pastes the Chinese title.
(7) Showing 「全文是中文」 in the screening panel is a nice extra; fold it in only if it's trivial.
Tests: isChineseItem with bracketed and bare Latin titles plus chi, the englishLanguage exclusion, venueKey with missing parts, and findDuplicates on a PMID pair and on a PubMed/Airiti pair without a DOI.


## #7 島嶼大綱的寫作提問升級：先寫主張，品質與效果方向並排，把缺口改寫成「為什麼重要」
- 審查後標題：島嶼大綱提問升級：缺口改問「為什麼重要」、主張提問、方向分組，加上 GRADE 確定性與在地適用性提醒（不在自動區塊放可填欄位）
- keep=True・effort S→S・impact 4→3

**WHAT** 主題頁的「📝 文獻探討大綱（依島）」每座島多三樣東西。(1) 主張鷹架：「這一段的主張（一句話，你寫）：____」，下面自動列出「支持」與「不支持／不一致」的研究，依效果方向分組，每篇旁邊標出評讀總評和 CEBM 等級。(2) 品質對照提問：高品質研究和低品質研究的方向不同時，提問「品質高的研究結論和品質低的一樣嗎？你的主張應該以哪一群為準？」。(3) 缺口提問改寫：原本是「缺口要寫出來，這可能就是你研究的理由」，改成三個問題：為什麼這個缺口重要？誰會在乎（病人、單位、政策）？既有研究背後有什麼你不同意的假設？另外，島上有 GRADE 時，在 CEBM 旁並列「GRADE：跌倒率 低」；沒做 GRADE 時，提醒「CEBM 等級不是確定性，要寫結論前先對主要結果指標做 GRADE」。如果使用者的 PICO 卡寫了「我的情境」，再加一題：「這些研究的場域和你的單位（護病比、病人特性、健保給付）差在哪？」

**HOW** 全部改在 content/planet.js 的純函式部分。1) writingPrompts(n, s) 把最後的 gaps 句子換成三條提問，文字放在常數 GAP_PROMPTS，方便日後調整。2) keyPapers() 旁新增 claimEvidence(records)，依 noteRecord().direction（effect_direction）分成 support、against、unclear，每筆帶 appraisal（appraisal_overall）、appraisalVerified、evidenceLevel；qualityContrast(groups) 判斷高品質（appraisal 為「納入」或「高」且已核對）和低品質兩群的主要方向是否不同。3) outlineSection(data, layout) 在每個 #### 島標題下，於 prompts 之前插入「- ✍️ 主張：」占位行，放在 %% zm-keep %% 區塊裡，重建時保留使用者寫的文字（沿用 vault-layout／topics 已有的自動區塊與保留機制），接著列支持與反對兩組清單。4) planetData() 讀 pref grade.tables（content/grade.js 的 readTables），用 outcome 名稱比對島上研究的 outcomes，帶出 certainty 並顯示在事實列。5) 讀 pico.cards 的 setting，有值時才加入適用性問題。content/topics.js 的 nextSteps() 缺口項目用相同的 GAP_PROMPTS 措辭。

**COACH** 段落完全不由 AI 寫。ZotMax 只用使用者已有的評讀、方向和 GRADE 資料排出對照，留下要回答的問題，主張那一行由使用者填。這和目前 review-draft.js 由 AI 寫整章的路線相反，也可以把這份大綱當作 review-draft 的「只提問」替代方案。

**RISKS** effect_direction 來自 AI 筆記，沒有 AI 筆記的研究會落在「不明」，要清楚標示「方向未判讀」。品質分群依賴評讀總評的用字，各工具不同，需要一張對照表。主張那一行的保留機制，要確認 planet 主題頁重建時不會覆寫使用者文字，並寫測試。

**REVIEWER** Keep the cheap, sound parts and drop or redesign the parts that rest on wrong assumptions about the code.

Problems with the proposal as written:
(1) There is no %% zm-keep %% mechanism in the code. topics.js rewrites only the %% zotero-bridge:start/end %% block and keeps 「✍️ 我的筆記」. The outline is inside the rewritten block, so a 「✍️ 主張：____」 line the user fills in there is wiped on the next rebuild. Building in-block preservation is new, risky work, not effort S.
(2) The 「支持／不支持」 split is not possible. ZotMax cannot know which direction supports a claim the user has not written yet. All it can do is group by effect_direction (有效/無差異/有害/不一致/未判定), and topics.js and the evidence canvas already do that.
(3) The quality contrast has nothing reliable to compare. appraisal_overall uses VERDICTS = 納入/排除/需更多資訊, which is an inclusion decision, not a quality grade. 「納入 vs 排除」 is not 「高品質 vs 低品質」, and excluded papers should not support a claim in the first place. percentYes lives in the appraisal form store, not in frontmatter. As specified, qualityContrast would usually return nothing or mislead.
(4) GRADE tables are stored per collection, which is the planet, not the island. Matching an outcome name to an island's free-text outcomes is fuzzy and could show a certainty against the wrong island.

Keep these (pure functions in planet.js, about 1 day, with Node tests):
(a) GAP_PROMPTS: turn the gap line into the questions 「為什麼重要／誰會在乎（病人、單位、政策）／既有研究有什麼你不同意的假設」, and use the same wording in topics.js nextSteps(). This addresses the pain that students can name a gap but not say what their study contributes.
(b) A claim question, not a fill-in field: 「這一段你的主張是什麼（一句話）？寫在下方 ✍️ 我的筆記」, so nothing the user writes sits in the regenerated block.
(c) A per-island direction tally with each paper's CEBM level and 已核對 marker. Label it 「方向（AI 初判）」 and show 方向未判讀 for papers without an AI note.
(d) A certainty reminder: if the planet has no GRADE table, show 「CEBM 等級是研究設計，不是證據確定性；下結論前對主要結果做 GRADE」. If it has one, list the planet-level outcome certainties once in the outline intro, not per island.
(e) The applicability question 「這些研究的場域和你的單位（護病比、病人特性、健保給付）差在哪？」, shown only when the PICO card's setting is filled in.

For the quality contrast, either drop it or limit it to 「已核對 vs 未核對」 with neutral wording: 「已核對評讀的研究和未核對的結論一樣嗎？」.

The coach principle holds, since every item is a question or a fact drawn from the user's own data.


## #8 檢索日誌與 PRISMA-S 附錄（含檢索健康檢查與去重紀錄）
- 審查後標題：檢索日誌與 PRISMA-S 附錄（正式／探索檢索分流、命中數對帳、檢索健康提問）
- keep=True・effort L→M・impact 5→5

**WHAT** 每個研究專案（分類）有一份「檢索日誌」：每一筆是一次檢索，欄位有資料庫、平台／介面、完整檢索式、執行日期、限制條件與理由、命中筆數、匯出檔名、匯入筆數和備註（0 筆的灰色文獻檢索也要記）。PubMed 追蹤的「測試檢索式」、主題機器人每次執行、引文追蹤每次查詢會自動記一筆，PubMed 會帶入 query translation 和筆數。華藝、臺灣期刊論文索引、臺灣博碩士論文、CNKI、CINAHL、Google Scholar 和機構網站有一張手動紀錄卡，預先帶入 ZotMax 剛複製的查詢字串。匯入一批帶 `來源/X` 標籤的文獻時，會問「這批來自哪一筆檢索？」，匯入數就自動對上。產出：(1) Obsidian 的 `30 評讀與綜整/檢索日誌/<分類>.md` 看板，依資料庫分表；(2) 一鍵匯出符合 PRISMA-S 16 項的附錄（Markdown，可用 Pandoc 轉 Word）和 CSV；(3) PRISMA 的「Records identified」改用日誌加總的資料庫命中數，再和 Zotero 標籤數對帳，例如「華藝：日誌命中 37、匯入 35、標籤 33，差 2 筆」；(4) 「更新檢索」：PubMed 用原檢索式加上 `AND ("上次日期"[edat] : "3000"[edat])` 重跑，中文資料庫顯示原字串與上次日期，讓使用者照做；(5) 「找出可能重複」每次執行時寫一筆去重紀錄（日期、規則、組數、移除數，對應 PRISMA-S 第 16 項）；(6) 檢索健康檢查會出現在 PRISMA 筆記和進度報告：只查一個資料庫、Google Scholar 被算成主要資料庫、英文檢索式完全沒有受控詞彙（[Mesh]／MH）或沒有自由詞、有日期或語言限制卻沒寫理由、沒有灰色文獻、試驗登錄或引文追蹤紀錄。每一項都附「建議找館員或指導教授確認」。

**HOW** 新增 content/search-log.js，沿用 screening.js 的 UMD 寫法，純函式和 Zotero 黏合分開。純函式：normalizeEntry、identifiedBySource(log)（依資料庫加總命中數）、reconcile(log, prismaResult.sources)（對帳，產生新 issue code `logMismatch` 加進 screening.js 的 ISSUES）、healthCheck(log, records, cfg)（規則用 regex 偵測 `[Mesh]|[MeSH Terms]|\bMH\b|/exp`、`[tiab]|TI |AB `、限制欄與理由欄）、buildLogSection(log, layout)（看板版和精簡版，沿用 dashboard.foldSection）、buildPrismaSAppendix(log, dedupLog, meta)、updateQuery(entry, sinceDate)。儲存方式比照 pico.cards／grade.tables：放在 pref `searchLog.entries`，以 collectionKey 為鍵，再鏡像寫到 vault 筆記的受管理區塊；使用者的備註寫在區塊外。黏合點：pubmed-watch.js 的 testQuery()（約第 881 行）回傳 count 與 translation 後，多一個「記入檢索日誌」按鈕；topic-bot.js 每次執行後 append；citation-chase.js 的 runChase() 寫完筆記後 append（type: citation）；search-links.js 的 openTarget() 開資料庫後，側邊面板出現「記一筆檢索」chip，預先帶入 db 和 q；screening.js 的 dedupCollection() append 去重紀錄；computePrisma(records, cfg, log?) 有日誌時以日誌數字為 identified，沒有時維持現在的標籤計數，並標示「來源：Zotero 標籤」。search-links.js 補 CNKI 來源（簡體轉換先用常用醫護詞對照表，非全文轉換）。features.js 加 `feature.searchLog`（找文獻組，研究生引導預設開啟，不連網、不用 AI）。tests/ 為純函式加 Node 測試。

**COACH** 完全不用 AI。ZotMax 只負責記錄、加總、對帳和提問；檢索式、限制條件的理由、要不要補查資料庫，都由使用者決定和撰寫。健康檢查用問句呈現（「這次只查了 PubMed 和 Google Scholar：方法章要怎麼說明？要不要請館員看一下檢索式？」），不會替使用者改檢索式。

**RISKS** 手動紀錄有摩擦，使用者可能跳過，所以要靠匯入時的提示和預先帶入的欄位降低負擔。中文資料庫的命中數由使用者輸入，可能填錯，對帳只能提示不一致。PRISMA identified 的定義改變後，舊的回顧專案數字會跳動，必須並列「日誌數／標籤數」並說明來源。pref 的 JSON 會隨日誌變大，可能要改成以 vault 筆記為主、pref 只存索引。PRISMA-S 16 項裡有幾項（同儕審查檢索式、檢索者）只能由使用者填寫。

**REVIEWER** I tried to reject this and mostly failed, so I would keep it with a much smaller first version.

Why it survives:
- The pain is real. A PhD-level review or thesis methods chapter needs reproducible search reporting (PRISMA-S). Chinese databases (華藝, 臺灣博碩士論文) have no API, so their searches leave no trace unless the user records them.
- ZotMax currently reports "Records identified" from 來源/ tag counts. That number is the records that reached Zotero, not the hits each database returned, and PRISMA wants the database hits. Nothing in the repo stores search strings, dates, limits or hit counts.
- It needs no AI and no paid API, so it stays a coach: the user writes the search strings and the reasons for any limits.

Changes I would make:
1. Do not change what computePrisma reports as "identified" in version 1. Show the log total next to the tag count ("日誌命中 37／匯入 35／標籤 33"), add the logMismatch issue, and leave the switch to log-based identified as an explicit option. This avoids silently changing numbers in reviews that already exist.
2. Every entry needs a 正式／探索 (formal or exploratory) flag. Only formal entries go into PRISMA and the PRISMA-S appendix. Topic-bot runs and PubMed-watch test queries are current-awareness or scoping searches. If they are logged automatically as formal, they will pollute the appendix. They should create exploratory drafts that the user promotes. The "記入檢索日誌" button on testQuery is fine. Also note that watchTerm() can change the query, so record the exact term that was sent.
3. Cut from version 1:
   - CNKI and the simplified-Chinese term table. This is scope creep: access from Taiwan is patchy, and a term table is not a reliable conversion.
   - The automatic "更新檢索" (update search) query rewriting. Keep only "show the original string and the last search date"; the PubMed edat re-run can come later.
   - The "這批來自哪一筆檢索？" (which search did this batch come from?) prompt on every import. It adds friction; offer it optionally from the 來源/ tag instead.
4. Dedup record: dedupCollection only tags duplicates and never removes anything. Record "組數／標記數／規則" (groups, tagged count, rule), not "移除數" (removed count).
5. Storage: put the log in the vault note's managed block or a JSON file in the data directory, with at most an index in prefs. Logs grow without limit, and pico.cards-style prefs JSON is the wrong place.
6. Health check: keep the question-style prompts that end with "請館員或指導教授確認" (ask a librarian or your advisor). Limit the regex checks to English (MeSH/MH vs tiab), since Chinese databases have no controlled-vocabulary syntax to check. Do not flag a single-database search as an error, because scoping reviews and theses vary.

Smallest useful version:
- the log data model and pure functions with Node tests
- a manual entry card prefilled from search-links
- a formal entry from PubMed testQuery
- the vault board
- the PRISMA-S appendix as Markdown plus CSV
- the side-by-side reconciliation
- the health-check questions

At that scope it is M, not L. The rest can follow.


## #9 檢索驗證與停止判斷：基準文獻回收率、資料庫重疊估計、引文追蹤輪次、停止理由
- 審查後標題：檢索驗證：基準文獻回收率（PubMed）、引文追蹤輪次與停止理由（資料庫重疊只列原始表）
- keep=True・effort L→M・impact 4→4

**WHAT** 「檢索驗證」卡出現在 PRISMA 筆記和主題頁，內容有四塊。(1) 基準文獻回收率：使用者把已知一定要收的研究加上 `基準/必收` 標籤（或從 PICO 問題卡挑選）。ZotMax 把每個已存的 PubMed 檢索式 AND 上基準 PMID 清單送 ESearch，顯示「你的檢索式找回 7/9 篇基準文獻」，列出漏掉的 2 篇，以及它們有、你的檢索式卻沒有的 MeSH 或標題詞，並問「要不要把這些詞加進哪個概念區塊？」。(2) 資料庫重疊估計：依通過標題摘要篩選的文獻的 `來源/` 標籤，算每對資料庫的重疊數，用 Chapman capture–recapture 估計「兩庫都沒抓到的相關研究約 x 篇（粗估，95% CI）」；重疊不足 5 篇時只顯示原始重疊表。(3) 引文追蹤輪次：每次追蹤記成第 n 輪（日期、種子、方向、候選數、最後新納入數）。「下一輪」只拿上一輪之後新納入的研究當種子；連續一輪沒有新納入時提示「可能已飽和」。(4) 飽和曲線與停止理由：每輪（資料庫檢索、更新、機器人、引文追蹤）的「新找到且最後納入」篇數畫成小長條圖。旁邊有必填的「停止搜尋的理由」欄位，空白時 PRISMA 匯出和進度報告會提醒。寫好的理由會帶進方法章附錄。

**HOW** 新增 content/saturation.js（純函式）：benchmarkQuery(query, pmids) 組 `(原式) AND (123[uid] OR …)`；missedTerms(missedRecords, query)，用 search-links.js 的 meshTerms() 取漏掉文獻的 MeSH 標籤，和檢索式的詞比對；chapman(n1, n2, m) 與 CI；overlapMatrix(records, cfg)，用 screening.readState() 的 sources 和 TA 決定；roundSummary(rounds, records)，用篩選標籤判斷每輪候選後來是否納入。ESearch 呼叫重用 pubmed-watch.js 的 ESearch 解析（約第 187 行，回傳 count、ids、translation）和它的節流器。citation-chase.js：frontmatterFor() 多 `rounds:` 陣列；runChase() 依現有 rounds 決定輪次，種子是上一輪 generatedAt 之後才加上 `篩選/全文納入` 的條目；buildChaseSection()／boardChaseSection() 加輪次表；因為重新查詢會覆寫自動區塊，輪次歷史放在 frontmatter 保存。screening.js 的 buildReviewSection() 加「檢索驗證與停止」段落，停止理由放在受管理區塊外的使用者小節，由 progress-report.js 的 extractSection() 讀回。有提案 1 的檢索日誌時，用它的檢索式和輪次；沒有時退回用 pubmedWatch.watches 和 topicBot.bots 已存的檢索式。

**COACH** 不用 AI，只給客觀數字和問題：漏了哪幾篇、可能漏多少、最近一輪還有沒有收穫。要不要繼續搜、為什麼停，由使用者判斷並寫下理由，可以直接拿去和指導教授討論。漏詞只列出來讓使用者自己決定要不要加，不會自動改檢索式。

**RISKS** capture–recapture 假設資料庫彼此獨立，實際上 PubMed 和 CINAHL 高度相關，估計會偏低，介面必須標示「粗估」並附限制說明。小樣本時數字不穩定。基準回收率只能驗證有 PMID 的研究，華藝和博碩士論文要標「無法自動驗證」。多輪引文追蹤會增加 OpenAlex 請求，可能碰到上限。使用者可能把「飽和」當成可以停的保證，所以文案要寫成「訊號」，不是規則。

**REVIEWER** Keep it, but only after cutting it down. Parts (1), (3) and (4) are worth building and fit ZotMax well. Part (2), as written, is both statistically and technically wrong.

What holds up:
- Benchmark (relative) recall is the standard, defensible way to check a search (PRESS, Sampson et al.). The check `(saved query) AND (pmid[uid] OR …)` reuses pubmed-watch's esearchURL/parseESearch and its throttle, needs no AI, and gives the user a number and a list of missed papers to take to the advisor.
- Listing the missed papers' MeSH next to the query terms, and only asking whether to add them, keeps the AI a coach.
- Recording chase rounds and seeding the next round only with newly included papers turns ad hoc snowballing into a documented method. This matters for a methods chapter or a TWNA/JBI report.
- A stop-reason field shown in PRISMA and the progress report is cheap and helps with the advisor.

What to change:
1. Drop the Chapman capture–recapture estimate and its CI. The databases a Taiwanese nursing student uses (PubMed, CINAHL, Cochrane, Embase) overlap heavily and are not independent, so the estimate is biased. Examiners rarely expect it, and a number with a CI will be read as authoritative however it is labelled.
2. The overlap data source in the proposal is wrong. Dedup tags the extra copies 篩選/重複, and they never get a title/abstract decision. The kept record carries only its own 來源/ tag, so reading sources from TA-included records finds almost no overlap. To keep anything here, rerun screening.findDuplicates() and union the 來源/ tags across each duplicate group. Then show only a raw overlap table ("unique to each database: n"), which also answers whether a given database was worth searching.
3. The benchmark source should not be a new 基準/必收 tag on its own. Let the user pick from the collection, and default to full-text-included papers that have a PMID and were not found by the query, with a selectable "known before searching" set. Papers without a PMID (華藝, 臺灣博碩士論文, CINAHL-only) should be listed under 無法自動驗證, not quietly left out of the denominator.
4. Missed-term extraction: the missed items' Zotero tags only hold MeSH when they were imported from PubMed. Otherwise fetch the MeSH with EFetch, compare it with the query's [Mesh]/[tiab] terms, and also show the ESearch translation so the user can see how PubMed actually mapped their words.
5. Do not depend on 提案 1. Fall back to the saved queries in pubmedWatch.watches and topicBot.bots, plus a query the user pastes in.
6. Keep the round history in frontmatter as proposed, because rerunning a chase overwrites the auto block. The "no new inclusions" message should read 訊號 (a signal), not 可以停 (you can stop).
7. Scope: the CINAHL Headings, Emtree and MeSH pain point is NOT addressed by this proposal. Drop it from painTitles or flag it as out of scope.
8. Effort: without capture–recapture and the saturation chart, it is about M. Use simple text counts per round, not a new chart type.
9. Put the whole feature behind its own switch, as ZotMax requires.


## #10 主張–證據綜整矩陣（品質 × 效果方向對照，段落由你寫）
- 審查後標題：島的主張鷹架：品質分層的效果方向、等級 vs 確定性、情境對照（加在文獻探討大綱，主張句由你寫）
- keep=True・effort M→S・impact 5→4

**WHAT** 「綜整矩陣」是一則 Obsidian 筆記，放在 `30 評讀與綜整/綜整矩陣/<分類>.md`。列是納入研究，自動欄位有研究設計、CEBM 等級、評讀整體評價（✅ 已核對／🤖 只有 AI 初評）、樣本數、國家與場域、效果方向，以及該結果指標的 GRADE 確定性（有 GRADE 表時）；設計等級和確定性並排，不再只顯示「CEBM 1」。使用者欄位是主題或主張，預設從星球的島名或文獻探討大綱帶入，格子裡是使用者自己寫的一句話發現，附 PDF 頁碼連結。矩陣下面，每個主張各有一組段落鷹架：(1)「我的主張句」空白，由使用者寫；(2) 支持、反對、不一致的研究分三欄，依品質排序；(3) 品質 × 方向交叉表，例如「已核對且品質佳的 3 篇都無效，品質低的 4 篇有效，你的結論要依哪一組？」；(4) 提問：結果不一致時，比較族群、劑量、測量工具和追蹤時間；這個主張對應哪一個結果指標？還沒做 GRADE 時問「你說的『強證據』指設計還是確定性？」；有「我的情境」時，並排各研究的場域，問「哪些研究的情境接近你的單位？」。

**HOW** 新增 content/synthesis-matrix.js。純函式：matrixRows(records, gradeTables, appraisals) 用 dashboard.noteRecord() 已有的 studyDesign、evidenceLevel、appraisal、appraisalVerified、direction、sampleSize 欄位；GRADE 部分從 pref `grade.tables` 讀 normalizeOutcome() 和 certainty()，用 outcome.studies 對到研究；parseUserCells(md) 依 citekey × 欄位鍵讀回使用者寫的格子（做法同 citation-chase.js 的 parseChecked() 從筆記讀回勾選）；mergeCells、qualityDirection(rows, claimKey)、claimScaffold(claim, rows, picoCard)、buildMatrixNote(existing, …)，沿用 screening.buildReviewNote 和受管理區塊的慣例：自動欄位每次重算，使用者格子保留。欄位種子來自 planet.findPlanets() 的島，或 review-draft.js 存的 outline（parseOutline），使用者也可以手動加欄。planet.js 的 outlineSection() 每座島多一個「到綜整矩陣寫這座島的主張」連結。提供 CSV 和 Word 附錄匯出。commands.js 加指令「產生綜整矩陣（目前分類）」，features.js 加 `feature.synthesisMatrix`（篩選與評讀組）。

**COACH** 不呼叫 AI，矩陣的格子和主張句都是使用者寫的。ZotMax 只把評讀、GRADE 和效果方向這些已知事實排在一起，並提出對比問題。這正好對應口委看重的「對整體文獻的批判評估」，也和現有的 AI 文獻比較表（synthesis.js）分開，讓使用者自己做綜整。

**RISKS** 效果方向來自 AI 筆記的 effect_direction，可能有錯，所以只用「已核對」的評讀做品質分組，AI 欄位要標 🤖。使用者格子讀回時，如果使用者改了表格結構會解析失敗，需要寬鬆的解析和衝突提示。主張欄太多時表格在手機上不好讀，要有依主張展開的看板版。納入研究多（例如 60 篇以上）時要分頁或依島拆開。

**REVIEWER** Keep it, but only the parts that are new, and build them into what already exists. Do not add a new matrix module.

Reasons to reject the proposal as written:
(a) About 70% of the matrix's auto columns are already in the PICO table, the PRISMA evidence table and GRADE's study list. A fourth study-by-field table in 30 評讀與綜整 adds clutter and one more file that can drift out of sync.
(b) The user-written grid (citekey × claim cells, read back with parseUserCells) is fragile. Markdown tables are a poor place to write prose: no line breaks in a cell, alignment breaks, and Obsidian's table editor reflows the table. A round-trip parser with conflict prompts costs a lot of upkeep for a single user. citation-chase's parseChecked only reads checkboxes, which is a much easier case.
(c) The claim-by-study grid duplicates the planet outline, whose islands already serve as the claims/themes.

What is new and does address real pain:
- "Serial summaries instead of synthesis": a blank claim sentence for the user to write, plus supporting / opposing / mixed lists.
- "Level ≠ certainty": show CEBM level and GRADE certainty side by side.
- Quality-stratified direction: "the 3 verified good-quality studies found no effect, the 4 low-quality ones found an effect, which group does your conclusion follow?" This is a real critical-appraisal skill examiners look for, and no current feature does it.
- Applicability: use the 我的情境 field the PICO card already collects but never uses.

Proposed changes, scoped as an extension of planet.js writingPrompts/outlineSection (and the topic page for collections without islands):
1. For each island, add a 「✍️ 我的主張句」 line outside the managed markers. It stays blank and is preserved, the same way as ✍️ 我的筆記.
2. Under each island, add a compact 支持/反對/不一致 list ordered by verified appraisal, then CEBM. Use links only, not a grid.
3. Add a rule-based quality × direction prompt. It fires only when there are at least 2 studies with verified appraisals and their direction differs from the unverified or lower-rated studies. Mark AI-derived direction with 🤖 and count only appraisalVerified studies as "quality known".
4. If grade.tables has an outcome whose studies overlap the island, show "CEBM n · GRADE ⊕⊕◯◯". If not, ask 「你說的『強證據』指設計等級還是確定性？還沒做 GRADE」.
5. If the PICO card has a setting, list each key paper's country/setting next to it and ask 「哪些研究的情境接近你的單位？」.
6. Optional: a CSV export of the per-island lists. Skip the Word appendix and the board version of the matrix.

All of this is pure functions over dashboard.noteRecord() fields and grade.normalizeOutcome/certainty, plus tests. It needs no AI and no network. Put it behind the existing planet/topic switch, or a sub-toggle `planet.claimScaffold`, not a new feature group.

Risks: effect_direction is AI-extracted and can be wrong, so the cross-tab must say 「方向來自 AI 筆記，未核對」 unless the user has checked it. With small n (1-2 verified) the cross-tab is misleading, so suppress it below the threshold.


## #11 草稿綜整健檢（偵測逐篇摘要段落）＋文獻探討草稿的「只提問」模式
- 審查後標題：草稿綜整健檢：偵測逐篇摘要與過強用語（只診斷、只提問，不用 AI）
- keep=True・effort M→M・impact 4→3

**WHAT** 指令「檢查我的草稿」：讀使用者在 `40 寫作` 自己寫的文字（自動區塊以外），逐段分析後產生一則健檢筆記，不會改動草稿本身。偵測項目：(1) 連續 3 段以上每段只引用 1 篇，屬於逐篇摘要式寫法；(2) 段落以「Wang 等人（2020）發現」或「X (2020) found」開頭，以作者為主詞而不是以主張為主詞；(3) 一段引用 3 篇以上，卻沒有任何比較用語（然而、相較之下、一致、不一致、whereas）；(4) 出現「證實、強證據、Level 1、有效」這類用語，但引用的研究在該結果指標沒有 GRADE、評讀還沒核對，或屬於低設計等級；(5) 引用的文獻不在回顧的納入清單裡，或評讀結論是「不建議納入」。每一項都列出段落編號和開頭 30 字，再附一個問題，例如「這三段各講一篇：它們的共同結論或差異是什麼？能不能用一句主張開頭，合成一段？」。另外替 review-draft.js 加一個「只提問」模式：AI 依各節大綱，只產生該節要回答的問題、證據對照（[S#] 支持／反對）和要回原文確認的地方，不產生段落；研究生引導預設改成這個模式。

**HOW** 新增 content/draft-check.js（純函式）。把 progress-report.js 的 userText()（約第 299 行）移到 core.js 共用；段落切分重用 review-draft.js 的 paragraphs()（約第 211 行）；從 `[@citekey]` 抽出引用（Pandoc 語法，與 review-draft 的 citekey 對應相同）；用文獻筆記 frontmatter 的 citekey 對到 dashboard.noteRecord()，取設計、評讀是否核對、方向；從 grade.tables 判斷某結果指標有沒有做 GRADE；用 screening.computePrisma().included 判斷是否為納入研究。規則函式有 singleSourceRuns(paras)、authorLedOpenings(paras)（中英文 regex）、noContrast(paras)、overclaim(paras, records, grade) 和 offList(paras, included)。健檢結果寫到 `40 寫作/<草稿名> 健檢.md`，進度報告「寫作進度」多一行「健檢待處理 n 項」。review-draft.js：buildReviewPrompt(sources, { mode: "questions" }) 改用另一套系統提示；processDraft() 在 questions 模式下拿掉沒有問號且超過 60 字的敘述句，保留 [S#] 對照；features.js 的 guided 預設 mode 改成 questions。

**COACH** 健檢只診斷、只提問，不改寫任何一句草稿。「只提問」模式消除了 review-draft.js 由 AI 代寫整章、與「教練不代寫」原則之間的張力：AI 只負責整理問題和證據對照，段落仍由使用者自己寫。

**RISKS** 規則會誤判：以作者開頭的段落在方法學比較時有時是合理的，所以要允許「忽略這一項」並記住。只支援 Pandoc 引文；用 Word 加 Zotero 外掛寫作的人沒辦法分析，之後可以考慮讀 docx 的 Zotero 欄位。中文比較用語的清單需要持續補充。「只提問」模式可能被進階使用者覺得是功能退步，所以保留「草稿」模式作為選項。

**REVIEWER** Keep only the draft check. Drop the review-draft "只提問" mode.

1) The questions mode duplicates planet.js outlineSection()/writingPrompts(), which already gives per-section questions and key papers offline with no AI and no API cost. Its stated reason, making the guided preset default to questions, does not apply: features.js already ships reviewDraft (and synthesis) as guided:false, so guided users never see the AI draft. If a section-level evidence map is wanted ([S#] for/against), add it to the existing planet outline from note frontmatter (effect_direction), not as a paid LLM mode.

2) Implementation flaws in the proposal:
- progress-report.js userText() (line 299) strips Pandoc citations (`.replace(/\[(?:-?@[^\]]*)\]/g, "")`). Moving it to core and running it first would remove every citation before the checks run. Extract citations per paragraph from the raw text, or give userText an option to keep citations.
- dashboard.noteRecord() has no citekey field, although the frontmatter has `citekey` (core.js line 28). Add it.
- The user's own text in 40 寫作 is mostly outside the review-draft region, so reading it is fine. But the main thesis is usually written in Word with the Zotero Word plugin, so a Pandoc-only check would see almost nothing for this user. Support at least APA narrative and parenthetical citations in plain text ("Wang 等人（2020）", "(Wang et al., 2020)", "王小明（2021）"), matched to library records by first author and year. Add a "貼上文字檢查" dialog as well as the vault note. Reading docx field codes can come later.

3) Tighten the rules to cut false positives:
- Rule (2), author-led openings: 「Wang 等人（2020）指出」 is a normal APA 7 narrative citation in Taiwanese nursing theses. Flag it only when it falls inside a single-source run from rule (1), not on its own.
- Rule (4), overclaim: tying a sentence to a GRADE outcome is not reliable with regex. Simplify it: flag strong words (證實、顯著有效、強證據、Level 1) when every cited study's best CEBM level is 3 or worse, or no cited study has a verified appraisal. Point to the GRADE table only as a question.
- Rule (5), off-list: useful, but only when a screening review exists. Otherwise skip it silently.
- Keep "忽略這一項", stored per paragraph hash.

4) Output: the 健檢 note plus one line in the progress report is fine. Keep a feature switch (on in guided: no AI, no network). The "3 or more consecutive single-citation paragraphs" threshold should be a pref.

Pain point: paper-by-paper literature reviews and overstated evidence claims are well documented for nursing master's and PhD students. Because the check is offline and only asks questions, it fits the coach principle better than the existing AI draft. Impact is lowered to 3 because of the citation-format coverage limit, until plain-text APA citations are supported.


## #12 缺口論證卡：從「這裡研究少」走到「為什麼值得做」
- 審查後標題：缺口論證卡：先查是不是漏找，再由你寫出為什麼值得做
- keep=True・effort M→M・impact 4→4

**WHAT** 主題頁「研究缺口與下一步」裡標成缺口的項目、星球的「未探索海域」（介入 × 結果的空組合），以及證據缺口地圖的空格，旁邊都有「論證這個缺口」連結，會開一張缺口論證卡（`30 評讀與綜整/缺口/<主題>-<缺口>.md`）。卡片上半是自動事實：附近有哪些研究、最新一篇的年份，以及「真的沒有嗎？」驗證：一鍵用 PubMed 查 I AND O 的筆數，附 Cochrane、PROSPERO 和華藝的查詢連結；查過之後狀態改成「已確認不是漏找」，有檢索日誌時會連到那一筆。下半是使用者回答的問題：缺口類型（證據矛盾、知識、實務、方法、族群、理論）；為什麼重要（病人、臨床、政策）；誰會在乎；既有研究共同的假設是什麼、你要挑戰哪一個；補上之後會改變什麼理解。如果使用者只寫了「臺灣沒有人做過」，會追問「臺灣的什麼條件（護病比、健保給付、家屬照顧文化）讓國外結果不能直接套用？」，並附 Burchett 的場域、介入、結果、證據四類適用性提問。卡片狀態（未驗證、已驗證、已寫理由）會顯示在主題頁、星球看板和進度報告上。

**HOW** 新增 content/gap-cards.js。純函式：gapId(topicPath, step)、從 topics.js 的 nextSteps()（gap: true 的項目）和 planet.js 的 seasOf() 取得缺口；cardTemplate(gap, facts)、cardStatus(text)（解析使用者小節的標題底下有沒有內容）、thinRationale(text)（只寫到「臺灣、台灣」加「沒有、未有」時追問）。黏合：卡片不存在才建立；事實區塊每次儀表板更新時重算，使用者小節永不覆寫（沿用 concepts.js 的 managedRegion() 和 replaceManaged()）；PubMed 筆數重用 pubmed-watch.js 的 ESearch；外部連結用 search-links.js 的 buildTarget()。topics.js 的 gapSection() 和 stepsBoard() 在每個缺口加上連結和狀態徽章。planet.js 的 writingPrompts() 把「這可能就是你研究的理由」改成「先確認不是漏找，再寫它為什麼重要（缺口論證卡：未驗證）」。progress-report.js 的 collectFacts() 加入缺口卡狀態統計。

**COACH** AI 不判斷缺口值不值得做，也不寫理由。ZotMax 先擋掉最常見的錯誤（其實是漏找），再用 problematization 的問題逼使用者說出貢獻，答案由使用者寫。卡片也可以直接當作和指導教授討論研究問題時的材料。

**RISKS** 自動缺口來自 AI 筆記的介入和結果欄位，詞彙不一致時會出現假缺口，卡片要明說「這是依筆記欄位推算的」。卡片數量可能很多，所以只對使用者點開的缺口建立卡片，不自動大量產生。PubMed 的 I AND O 筆數受詞彙影響很大，0 筆不代表真的沒有研究，文案要提醒試同義詞。

**REVIEWER** Worth keeping, but narrower than proposed. The code shows a real hole. ZotMax flags gaps in three places (nextSteps gap steps, gap-map empty cells, planet seas) and then just tells the user "這可能就是你研究的理由" (planet.js writingPrompts, around line 536). That pushes the exact mistake the proposal targets: a gap that is really a missed search turns into the study's rationale. Moving from "nobody studied it" to "why it matters" is a well-documented weak point for PhD students, and transferability to the Taiwanese setting is a real issue for nursing EBP. Coach fit is good: the user writes the answers, and the card is facts plus questions. Everything needed already exists and is free: PubMed ESearch in pubmed-watch.js, buildTarget and MeSH lookup in search-links.js, managedRegion/replaceManaged in concepts.js.

Changes required:
1) Limit cards to gaps that can be argued. Not every nextSteps gap:true item is a research gap. "最新一篇是 X 年" and "樣本數中位數 n 人" are hints to search again or to note imprecision, not contributions. Cards and the PubMed I AND O check should apply only to (a) empty I×O pairs (gap-map cells, seas, the "還沒有研究的組合" step) and (b) "有 RCT 但沒有系統性回顧", which gets Cochrane/PROSPERO links instead of an I AND O count. A "結論分歧" card is fine but has no count check.
2) Don't auto-set "已確認不是漏找". One query returning a count proves nothing. Record a fact instead ("PubMed I AND O：n 筆（日期、檢索式）"), and let the user tick 已確認 after they look. Build the query from MeSH terms plus the concept-card aliases OR'd together, not raw AI-note terms. Show a copyable query and a "試同義詞" hint. A count above 0 should say "可能不是缺口——先看這 n 筆".
3) Drop the "有檢索日誌時連到那一筆" clause. The repo has no search-log feature.
4) Make thinRationale more than a 臺灣+沒有 regex: also trigger when the 為什麼重要 section is very short or only restates the gap. Keep it as a question, never a rewrite. Fix the Burchett applicability prompts as a short static list.
5) Phase it. v1 covers the card, links from the topic page gap section and seas, and status badges, plus a change to the writingPrompts wording. The progress-report counts and the planet map panel come later. Put it behind its own switch (e.g., 主題頁 → 缺口論證卡), default on only where the gap map is on. Cards are created on click only. The facts block is a managed region, and the user sections are never rewritten.
6) The card should say plainly that the gap comes from AI-note words in the user's own Zotero library, not from a systematic search.
Effort stays M. Impact 4 if narrowed this way; as proposed, the PubMed check on vague AI terms would produce false "confirmed" gaps and do harm.


## #13 理論架構對應圖：理論構念 ↔ PICO 變項 ↔ 概念卡 ↔ 測量工具（含 COSMIN 工具卡）
- 審查後標題：研究工具卡（信效度、中文版、授權）＋理論架構卡（構念 ↔ 工具對應與缺口問句）
- keep=True・effort L→M・impact 4→4

**WHAT** 新的「理論架構卡」：使用者寫下理論或模式（例如 Health Belief Model、Roy 適應模式、Orem），列出構念，再把每個構念對應到 PICO 問題卡的變項、概念卡、測量工具卡和研究假設。ZotMax 用 Mermaid 畫出「理論 → 構念 → 測量工具 → 結果指標」，並做一致性檢查：哪些構念沒有測量工具；哪些測量工具沒有對應構念（量了但理論上說不出為什麼）；哪些 PICO 結果指標不屬於任何構念；工具卡缺信效度或中文版驗證；文獻庫裡沒有任何研究用過這個理論。測量工具卡（concepts.js 已有的「測量工具」類型）擴充欄位：構念、題數與計分、原始驗證文獻、中文版驗證文獻、Cronbach's α、再測信度、效度證據、授權與聯絡方式、適用族群；這些欄位由使用者填，旁邊列出「AI 筆記提到的信效度」做參考（已經過 verify.js 原文比對的句子才列）。卡片上的按鈕：「測量特性檢索」，用 PubMed 查「工具名[tiab] AND Terwee 精準版過濾器」；「中文版信效度」，查華藝和臺灣博碩士論文的「量表名 信效度」。評讀工具另外加上 COSMIN 測量特性研究的檢核項目。

**HOW** concepts.js：在 TYPES（約第 34 行）加 theory: "理論"；使用者在理論卡的 frontmatter 寫 `constructs:` 清單（name、measures: [[工具卡]]、pico: O1、hypothesis）。新增純函式模組 content/theory-map.js：parseTheoryCard(fm)、consistencyChecks(card, picoCard, measureCards, papers)、buildMermaid(card)。PICO 變項來自 pico.js 的 cardFor()；工具卡欄位從 frontmatter 讀；用 concepts.collectConcepts() 的 papers 計算理論被引用的篇數。search-links.js 加 TERWEE_PRECISE 常數和 measurementQuery(tool)，用 buildTarget() 產生華藝和臺灣博碩士論文的查詢。appraisal-tools.js 新增 COSMIN 工具定義（比照 CASP、JBI 的資料結構：題號、中文意譯、英文原題、看什麼）。概念總覽頁在有理論卡時多一張「架構一致性」卡；progress-report.js 可選擇附上未對應的項目數。features.js 掛在 `concepts` 功能底下的子選項。

**COACH** 理論的選擇、構念的對應和工具的判斷都由使用者決定和填寫。ZotMax 只畫圖和做一致性檢查，用問句指出斷裂的地方（「『自我效能』這個構念要用哪個工具測？」）。AI 筆記提到的信效度只當作已查證的參考線索，不會自動填進欄位。

**RISKS** 使用者要先寫 frontmatter 結構，對不熟 YAML 的人門檻高，可能要提供 Obsidian 範本或 Zotero 內的編輯視窗。Terwee 過濾器的精準度很低（約 9%），結果量大，要說明這是正常現象。中文量表名稱寫法很多（簡稱、全名、版本），跨資料庫查詢容易漏。COSMIN 完整清單很長，第一版可能只放核心項目。

**REVIEWER** 建議保留，但要縮小範圍，分兩期做。

痛點是真的：臺灣護理碩博士論文第三章固定要寫「研究架構」和「研究工具」，研究工具要交代信效度、中文版驗證和授權。這些現在都要在華藝、臺灣博碩士論文和 PubMed 之間手動來回查，非常耗時。這份提案用到的都是本地 frontmatter、Mermaid、PubMed E-utilities 和開首頁的連結，不需要付費 API。教練原則也守住了：欄位由使用者填，ZotMax 只用問句指出斷裂的地方。

我反對照原提案做的理由：
(1) 一個 L 級提案綁了 7 件事：理論卡、Mermaid 圖、一致性檢查、工具卡擴充、兩個檢索按鈕、COSMIN、儀表板加報告。
(2) 「構念 ↔ PICO 變項」對不上。理論導向的論文多半是相關性或描述性研究，用的是自變項、依變項、中介變項，不是 PICO。PICO 卡是實證護理（EBP）問題用的，硬接會讓使用者困惑。
(3) 「只列 verify.js 已查證的信效度句子」做不到。verify.js 只核對「可引用的句子」段落（verify.js 第 22 行 QUOTES_HEADING），而 AI 筆記「測量工具（含信效度）」是改寫過的文字，逐字比對幾乎都會失敗。應該改成：列出 AI 筆記提到的 α 值和效度，標上「⚠️ AI 摘錄，請回原文核對」並附連結；或者沿用 review-draft.js 的數字比對。
(4) 完整的 COSMIN 檢核表很長，碩士生很少需要評讀測量特性研究，價值低。
(5) 第三個痛點「框架選錯」大部分已經處理了，不該算進來。

建議的改法：

第一期（M）：擴充測量工具卡。
- 在 frontmatter 加使用者自填的欄位：construct、items_scoring、original_validation、zh_validation、alpha、retest、validity、license_contact、population。
- 提供 Obsidian 範本片段，降低寫 YAML 的門檻。
- 加三個按鈕：
  - 「測量特性檢索」：PubMed 查「"工具名"[tiab] AND Terwee 過濾器」，並說明結果量大、精準度低是正常的。
  - 「中文版信效度」：在 search-links.js 用 buildTarget 產生華藝和臺灣博碩士論文的「量表名 信效度」查詢；量表名稱的簡稱和全名用 aliases 一起查。
  - 「授權聯絡」：只是提醒清單。
- 卡片頂端顯示缺漏問句，例如「中文版信效度還沒有出處，要查哪一篇？」。

第二期（M）：理論卡，type: theory。
- frontmatter 寫 constructs（name、measures: [[工具卡]]、variable_role、hypothesis）。
- 用 Mermaid 畫出理論 → 構念 → 工具。
- 只做三項一致性檢查：構念沒有工具；工具沒有對應構念；文獻庫裡用過這個理論的篇數。
- PICO 的連結改成選填，只比對 O。

COSMIN 和進度報告的整合延後，等使用者實際用過再說。功能開關掛在 concepts 底下的子選項。


## #14 指導教授迴圈：自動整理「需要老師看的事」、決策紀錄與口試問題庫
- 審查後標題：指導教授會議加強：決策紀錄（只增不改）＋使用者標記的「想問老師」項目＋規則式口試問題庫
- keep=True・effort M→M・impact 5→4

**WHAT** 進度報告新增這些段落。(1)「需要老師看的事」：自動整理已核對評讀表中答「不清楚」的題目、納入研究裡 ⚠️ 未查證的可引用句、PRISMA 一致性問題、檢索健康檢查的警示、還沒寫理由的缺口卡、草稿健檢的待處理項目，以及雙人評讀不一致的題目。每項一行，附連結和「老師意見：＿＿」欄位。(2) 固定欄位「我卡在哪裡」和「需要老師決定的事」，可選常見決定：納入年份、語言範圍、要不要加查 CINAHL、是否擴大族群。(3)「本期實際完成的小步驟」：把完成的島嶼任務、讀完的文獻和核對過的評讀列成正向回顧，放在數字卡前面。(4) 決策紀錄：下一次產生報告時，上一份報告裡填了的「老師意見／決定」會轉進 `40 寫作/決策紀錄.md`，形成只增不改的清單（日期、決定、理由、誰提出），例如「2026-10-03：只納入 2015 年以後的研究，理由是指引在 2015 年改版」。這份清單可以直接用於方法章的計畫偏離說明、檢索日誌的限制理由和語言範圍理由。(5) 評讀表的評讀者 B 可以標成「指導教授」，κ 和分歧題目會進報告。(6) 口試問題庫：依專案目前的狀態，用規則產生委員可能會問的問題，例如「為什麼只查 PubMed 和華藝？」「為什麼限定中英文？」「品質最差的研究會改變你的結論嗎？」「你的理論架構裡『自我效能』怎麼測？」「這個缺口為什麼重要？」，答案由使用者寫在 `口試準備.md`，報告顯示已回答幾題。(7) 第一次產生報告時附一份「期待對齊表」（會談頻率、回饋方式、什麼算進度、截止日），每半年提醒重看一次。

**HOW** progress-report.js：SECTIONS（約第 63 行）加入 ["advisor", "需要老師看的事"] 和 ["done", "本期完成的小步驟"]。collectFacts()（約第 1210 行）新增資料來源：appraisal-form 記錄裡 answer 為「不清楚」的題目（只看 verified 的記錄，避免把 AI 初評當成問題）；AI 筆記裡 ⚠️ 的句數（verify.js 的結果）；screening.computePrisma().issues；有檢索日誌、缺口卡和草稿健檢時讀它們的狀態；planet.questsIn() 取得完成的任務（已用於進度報告）。決策紀錄用既有的 extractSection() 和 parseChecklist() 讀上一份報告的「老師意見」小節，寫入以 `%% decision-log %%` 標記的只增清單。新增純函式模組 content/defense-questions.js，以 facts 為輸入、問題清單為輸出，每條規則附出處（例如 PRISMA-S item 9、GRADE inconsistency）。appraisal-form.js 加 pref `appraisal.reviewerBLabel`。純文字版（toPlainText）帶入新段落，方便貼到 LINE 或 Email。

**COACH** 全部用規則，不需要 AI；選用的 AI 摘要仍沿用現有的數字核對。ZotMax 只整理問題和事實，判斷和決定留給學生和指導教授，並把決定留下紀錄。學生帶著具體問題去開會，不必等老師主動指導；正向回顧讓進度看得見，能減少冒牌者感受；口試問題由使用者自己準備答案。

**RISKS** 自動整理的項目太多會變成新的焦慮清單，所以要依嚴重度排序、只顯示前 5 項，其餘摺疊。指導教授不一定會在報告上回填意見，決策紀錄可能常是空的，因此也要能在 Zotero 或 Obsidian 手動新增決定。評讀表的「不清楚」有時是正確答案（原文真的沒寫），不該被當成學生不懂，文案要分清楚。口試問題庫的規則可能過時，或和學校、委員的實際關注不同。

**REVIEWER** Keep only after cutting it down a lot. As proposed it bundles 7 sub-features, and several are weak.

Reasons for skepticism:
- (5) "label reviewer B as advisor" already works: reviewerB is free text, and κ plus the disagreeing items are already exported. All that's missing is linking them into the report, which is about 10 lines of work.
- (1) depends on three modules that don't exist (search health check, gap cards, draft health check). Auto-listing every verified 「不清楚」 answer is a bad signal. 「不清楚」 is often the correct answer (the paper doesn't report it), so the list would turn into an anxiety list and work against the stated impostor-feeling goal.
- (3) is largely already there: quests done, papers finished and appraisals verified are listed. Reordering them before the KPI cards is a tweak, not a feature.
- (7) the expectation-alignment table is paternalistic boilerplate, and a 6-month nag is low value. Drop it.
- The pain mapping is padded. English reading burden, appraisal tools lacking a gold standard, and Dunning-Kruger in searching are not really addressed here.

What is genuinely new and valuable:
- (4) An append-only decision log (`40 寫作/決策紀錄.md`: date, decision, rationale, who proposed it). Nobody records these decisions, yet they feed the protocol-deviation section in the methods chapter, the year and language limits in PRISMA-S, and the rationale for including or excluding non-English studies. It is cheap because extractSection and parseChecklist already exist. It must also allow manual entry from Zotero or Obsidian, not only harvesting from the report.
- (6) A rule-based defense question bank (pure module content/defense-questions.js, each rule citing PRISMA-S, GRADE or a CASP item). The user writes the answers in 口試準備.md, so it stays coaching. For a PhD-bound student this is a real, documented anxiety.
- A narrow version of (1): instead of inferring from 「不清楚」, add an explicit per-item 「想問老師」 flag in the appraisal form and on ⚠️ sentences. Show only what the user flagged, plus PRISMA countMismatch issues. These go in as suggested lines in the existing 「本次想討論的問題」 field, which the user can delete, capped at 5.

Changes:
- Drop (3), (5) and (7) as separate work.
- Don't read from modules that don't exist yet.
- Ship as three switchable sections: decision log, flagged items for the advisor, and the defense question bank (the bank could also live on the dashboard rather than in the report).
- Add a plain-text export for LINE.

Effort is M (the decision log alone is S). Impact is 4, not 5, because most of it duplicates or wraps existing report pieces.


## #15 檢索式教練：每次查完給客觀回饋，並記下你進步了什麼
- 審查後標題：檢索式體檢：自己寫的 PubMed 檢索式給結構提醒和中文版 PubMed 解讀，PRISMA 附整次檢索健康檢查
- keep=True・effort M→M・impact 5→4

**WHAT** 在快速搜尋、PubMed 追蹤的「測試檢索式」、主題機器人、site/search.html 的 PICO 檢索式產生器，每產生或測試一個檢索式，就出現一張「檢索式體檢」卡，用規則逐項打燈號，每個燈號附一句白話說明和「怎麼改」：(1) 某個概念只有 [Mesh] 沒有 [tiab] 自由詞，或只有自由詞沒有主題詞；(2) 同一概念的同義詞用 AND 連接，或不同概念用 OR 連接（括號層級檢查）；(3) 沒用截字或片語引號（例如 nurs* 或 "pressure injury"）；(4) PubMed 的 warninglist 和 phrasesnotfound 翻成中文，並說明 query translation 把你的詞展開成了什麼；(5) 筆數異常（少於 10 或多於 3,000）時給方向（加 OR 同義詞／加族群或設計限制）；(6) CINAHL 版的 MH 標成「⚠️ 未核對：MeSH 不一定等於 CINAHL Heading」並附 CINAHL Headings 查詢連結。另外產生 PRISMA 或進度報告時，加一張「整次檢索健康檢查」：用 `來源/` 標籤看是否只用了一個資料庫或只有 Google Scholar（建議改列為補充檢索）、有沒有做引文追蹤、有沒有中文資料庫，最後附「建議找館員或指導教授確認的 3 件事」。每次體檢的結果存下來，首頁顯示「技能成長」：例如「最近 5 個檢索式都有自由詞＋MeSH ✓；截字還沒用過」。

**HOW** 新增 content/query-coach.js（純函式，可用 Node 測）：parseQuery(q) 把 PubMed 語法切成 AND 區塊和 OR 詞，辨識 [Mesh]/[MH]/[tiab]/[tw]/引號/星號；checkQuery(q, {db, count, warnings, translation}) 回傳 [{level, rule, text, fix}]，沿用 pico.js checkCard() 的 {level, field, text} 格式。PubMed 部分直接吃 pubmed-watch.js parseESearch() 已有的 count、translation、warnings；search-links.js 的 buildMeshQuery() 和 quickSearch() 在顯示 entries 前呼叫 checkQuery；pubmed-watch.js testQuery() 和 topic-bot 的測試檢索式把燈號加進現有提示文字。site/search.html 在 cinahlConcept() 輸出的每個 MH 後面加「未核對」標記，並內嵌同一份 query-coach.js（UMD 已能在瀏覽器載入）。整次檢查 searchHealth(sourceCounts, opts) 讀 screening.js 依 cfg.sourcePrefix 計算的來源分布，結果交給 progress-report.js buildSections() 作為新的一節、PRISMA 筆記作為提醒 callout。技能紀錄存在 prefs（例如 queryCoach.history，只存規則 id 和日期，不存檢索式），topics.js 首頁讀取後顯示一張小卡。設定裡加 feature 開關 queryCoach。

**COACH** 完全不用 AI，也不替使用者改寫檢索式：只指出哪裡可能有問題、為什麼，再給一個「你可以試試」的方向，按鈕只有「我改好了，再測一次」。技能成長卡強調使用者自己學會的規則，最後一關是建議找館員或指導教授，而不是由工具判定「查完了」。

**RISKS** PubMed 語法解析遇到巢狀括號或欄位標籤組合可能誤判，規則必須保守，只用「提醒」語氣；燈號太多會變成噪音，每次最多顯示 3 個最重要的。CINAHL 與 Emtree 沒有免費 API，只能提示核對、不能自動對照。筆數門檻要依題型調整（質性題型本來就少）。

**REVIEWER** The pain is real. Nursing master's and PhD students routinely run AND/OR-flat queries with no free-text terms, and they don't know their search is weak. That is the gap: what ZotMax has today just echoes PubMed's raw output. The checks are rule-based and need no AI or paid API, and the "you could try" wording fits the coach principle. But the proposal is too broad, and several parts are redundant or weak. Cut it like this:
(1) Only lint queries the user wrote. buildMeshQuery()/quickSearch() and the search.html PICO generator produce the MeSH+tiab, OR-within/AND-between structure by construction, so linting their output is noise. Hook query-coach.js into pubmed-watch.js testQuery(), topic-bot.js testQuery(), and a new optional 「檢查我改過的檢索式」 box in search.html. For PICO fields in search.html, add field-level hints instead of parsing: this concept has MeSH but no free text, or the reverse; no truncation or phrase quotes. That needs no parser.
(2) Rule 2 as written ("synonyms joined by AND") can't be detected without understanding meaning. Keep it structural only: a long flat chain with no parentheses, mixed AND/OR at one level with no brackets, unbalanced brackets, a NOT used early. Use reminder wording and show at most 3 lights.
(3) Turning querytranslation into readable Chinese is the most valuable novice piece. Show which terms got Automatic Term Mapping, which became [MeSH Terms], and which were dropped. Pull this from the existing translation string, don't add a new call.
(4) The CINAHL 「未核對」 marker is already covered by the existing cinahlNotes caveat. At most, add a CINAHL Headings link; don't build a new mechanism.
(5) The hit-count thresholds (<10, >3000) are arbitrary. Show them as a neutral sentence that depends on question type ("qualitative/rare topics are often under 50"), not as a red light.
(6) Keep the whole-search check, but only as a PRISMA-note callout built from screening.js source counts: one database only, Google Scholar only, no citation chasing, no Chinese database. It's cheap and high-value. Drop the progress-report section for now (it duplicates PRISMA), or make it one line.
(7) Drop the 「技能成長」 home card and the prefs history, or defer them. It's gamification on thin signals (counting rule ids across a handful of queries), it adds state, and it isn't evidence of learning. If kept later, only list which rules were triggered recently, with no scoring.
Ending with 「建議找館員或指導教授確認的 3 件事」 is good. Make it a fixed checklist (PRESS-style items), not generated per search.
Put it behind a queryCoach feature switch, and write Node tests for parseQuery/checkQuery with nested brackets and field-tag edge cases (e.g. [mh:noexp], [majr], [tw], wildcards inside quotes). Effort stays M after these cuts; impact 4, not 5, because a big part of the value (MeSH+tiab pairing) is already enforced by the existing generators.


## #16 概念詞彙梯：每個概念一列中文、簡中、英文自由詞、MeSH 與 Entry Terms
- 審查後標題：PICO 檢索詞表：每個要素一列中文詞、英文自由詞、MeSH（可勾 Entry Terms）、CINAHL MH（自填未核對），產生 PubMed／CINAHL／華藝檢索式與方法章關鍵字表
- keep=True・effort L→M・impact 5→4

**WHAT** PICO 問題卡多一個「詞彙梯」分頁：P、I、O 每個概念一列，欄位是：臺灣繁中詞（可多個）、中國簡中詞、英文自由詞、MeSH 主題詞、MeSH Entry Terms（勾選後變成自由詞）、CINAHL Heading（使用者填寫，預設未核對）、出處（MeSH／樂詞網／我的別名／文獻標籤）。每個詞旁邊標示「已在檢索式」或「還沒用到」。從詞彙梯一鍵產生四種檢索式：PubMed（MeSH OR tiab）、CINAHL（MH OR TI/AB）、華藝與臺灣博碩士論文（繁中 OR 區塊＋英文原文詞）、CNKI（簡中 OR 區塊）。另附樂詞網與兩岸對照醫學名詞的查詢連結，讓使用者查證中文譯名。概念卡（concepts.js）的別名會依語言自動歸到對應欄，在詞彙梯新增的詞也能寫回概念卡的 aliases。

**HOW** 純函式部分放在 pico.js 或新的 content/vocab.js：vocabRow(concept)、classifyTerm(t)（臺灣繁中、簡中、英文；判斷方式是比對內建的繁簡差異字表，約 2,500 字、約 10 KB，以 JSON 放在 content/data/），vocabQueries(rows) 產生四種檢索式，並重用 search-links.js 的 block()、quoted()、tiab()、buildMeshQuery()。MeSH Entry Terms 用免費的 NCBI E-utilities：先用 esearch db=mesh 找 UI，再用 efetch db=mesh（純文字格式）取 Entry Terms；parseMeshSummary() 目前只取 ds_meshterms[0]，可擴充成保留 ds_meshterms 整個陣列，這樣一次 esummary 就夠。種子詞來源：pico.js keywordSuggestions() 從標籤找到的詞、concepts.js parseAliases() 和 collectConcepts() 的別名、search.html 的常見護理詞對照。卡片資料仍存在 pico.cards，新增 vocab 欄位；cardMarkdown() 把詞彙梯輸出成 Obsidian 表格，方法章附錄可以直接引用。search-links.js 補上 CNKI 來源（只開首頁並複製簡中檢索式）。

**COACH** 不由 AI 翻譯或決定同義詞：MeSH 和 Entry Terms 來自 NLM 官方資料，中文詞由使用者填寫，並引導他們到樂詞網查證。每個詞都要使用者勾選才會進檢索式；簡中欄只做字形轉換，並提醒「中國用語可能不同（例如 護士／護理師），請自己確認」。

**RISKS** 字形轉換不等於用語轉換，可能讓使用者以為簡中詞已經處理好了，介面必須明說。Entry Terms 有時數十個，要預設摺疊、只建議常見的幾個。NCBI 有速率限制，要沿用 pubmed-watch 的 API key 和節流設定。詞彙梯資料變多後，pico.cards 這個 pref 可能變得很大，可能需要改存成 vault 檔案。

**REVIEWER** Keep it, but much smaller. The core gap is real. Inside the plugin, the PICO card stores each element as one free-text line. Its search string is just P AND I AND O over those words. Nothing lays out synonyms concept by concept, and it never offers MeSH Entry Terms as free-text synonyms, which is the main thing novices miss. The plugin also has no CINAHL MH block. Only the separate web page does. A keyword table (Chinese / English / MeSH / synonyms) is also a standard deliverable in Taiwanese 實證報告 (TWNA EBHC scoring) and in thesis methods chapters, so a cardMarkdown table that can be cited is real value. Entry Terms are cheap: the esummary db=mesh ds_meshterms array already has the heading followed by its entry terms. Keeping the whole array in parseMeshSummary covers it with no efetch call, and it reuses the NCBI email, API key and throttling settings. Coach fit is fine: terms come from NLM or from the user, and nothing enters the query until the user ticks it.

What to cut:
(1) Drop the 簡中 column, the CNKI source and the ~2,500-character 繁簡 table. Converting character shapes one by one is error-prone (one simplified character can map to several traditional ones, e.g. 后/後), and it invites the false belief that the terms are localized. CNKI is rarely a core source for this user, and access from Taiwan is often restricted. At most, keep a free-text "其他中文用語" cell and a link.
(2) Drop the PRISMA-S / search-log pain from the claim. This proposal records no database, date, hit count or final string per run, so it does not address reproducibility. That belongs in a separate search-log feature.
(3) CINAHL Heading stays a user-filled cell, marked 未核對 by default, and goes into the query as MH "x+" only after the user enters it. Do not guess it from MeSH.
(4) Keep the 樂詞網 lookup link, add a 華藝/NDLTD as-written block (Chinese OR terms plus the English original), and keep the 已在檢索式 / 還沒用到 marks (keywordSuggestions already does this).
(5) Store the new data as a vocab field per element in pico.cards (small). Writing terms back to concept aliases should be opt-in per term, not automatic.

Revised scope: one block per element in the PICO card (中文詞 / 英文自由詞 / MeSH + collapsible Entry Terms checklist / CINAHL MH (未核對) / 出處), output as PubMed, CINAHL and 華藝-NDLTD strings, plus a keyword table in cardMarkdown. Effort M, not L. Impact 4, not 5, since the web page already covers part of it.


## #17 英文論文導讀：先讀這幾段、我的術語本、用自己的話回述
- 審查後標題：評讀導讀：先讀這幾段（附頁碼）＋我的術語本
- keep=True・effort M→M・impact 5→4

**WHAT** 每篇有全文的文獻筆記頂端多一張「導讀」卡：(1)「先讀這幾段」：依研究設計列出影響評讀的 3 到 5 個原文段落（RCT 是隨機產生、allocation concealment、盲化、流失與 ITT、主要結果），每段附 PDF 頁碼，點一下跳到 PDF 對應位置；(2)「主要結果 vs 作者結論」並排：左邊是原文 Results 的主要結果句，右邊是 Abstract 或 Conclusion 的結論句，下面問三個問題：主要結果顯著嗎？結論有沒有說得比結果多？標題是不是說有效？(3)「我的話」：讀完後用中文寫兩三句這篇在做什麼、發現什麼，寫完才展開 AI 筆記對照。另外在 PDF 選取文字的選單加一個「加入我的術語本」：存英文原句、頁碼和使用者自己寫的中文解釋，彙整成一份跨文獻的 Obsidian「術語本」，同一個術語會累積多篇原文例句；概念卡也會顯示這些例句。儀表板多一個比例：「已回原文核對」和「只讀 AI 筆記或摘要」各占多少。

**HOW** 段落定位全部用規則：fulltext-md.js 已有 SECTIONS（methods、results、conclusion），也有 buildIndex()、findSpan() 和 locate() 可以把句子對到頁碼；新增純函式 readingGuide(md, design)，用設計對應的關鍵詞表（random*、allocat*、conceal*、blind*、lost to follow-up、intention-to-treat、primary outcome）在 methods 和 results 段落裡找句子，每個項目最多一句，並把結果寫進文獻筆記中使用者區塊以外的自動區塊（markdown.js）。跳到 PDF 的連結沿用 stats-explainer.js「連回 PDF 頁」的做法（zotero://open-pdf?page=）。術語本：stats-explainer.js 已經註冊 renderTextSelectionPopup，在旁邊再加一個按鈕；資料存成 Zotero 子筆記（比照 NOTE_TAG 的做法），同步時由 concepts.js 寫出 `概念/術語本.md`。「我的話」是筆記裡使用者區塊的一個 callout，同步時只讀取是否已填寫，用來決定 AI 筆記 callout 是否預設摺疊，並把核對狀態交給 dashboard.js 統計。整個功能用 feature 開關 readingGuide 控制。

**COACH** 導讀只指出原文的位置，不翻譯也不摘要；spin 比對只把兩句原文並排再提出問題，由使用者判斷。術語本的中文解釋由使用者自己寫（stats-explainer 的解釋可以作為參考，但不會自動填入）。「先回述、再看 AI」的順序和評讀陪練的「先自己答再對照」一致。

**RISKS** PDF 轉文字的品質不一（掃描檔或雙欄排版），關鍵詞找不到時要明說「這篇沒找到，請自己看 Methods」，不能假裝有；只能用英文關鍵詞，中文論文要另外準備一套詞表。「先回述才展開」如果強制執行會讓人覺得煩，應該做成可關閉的預設。

**REVIEWER** I'd keep it, but only after cutting it down. As proposed it is four features (passage locator, spin comparison, "my words" gate, glossary) plus a dashboard metric. That is closer to L than M, and two of the parts don't hold up.

Why keep it:
- The pain is real for a Taiwanese nursing student reading in a second language. Nothing in ZotMax currently points the reader back to the specific passages that decide an appraisal before they fall back on the AI note.
- It fits the coach rule: it points to text and asks questions, and the user writes every explanation.
- It works locally and needs no AI, which also helps people without an API key. Today 評讀陪練 and 讀懂統計 both need a paid key.

What to change:
1) Don't add a new card at the top of the note. Put the locator in the 文獻評讀表 (appraisal-form.js). For each CASP/JBI item, add a 「原文在哪」 link: one rule-matched sentence with its page, from fulltext-md SECTIONS plus verify.buildIndex/locate, opening via the stats-explainer zotero://open-pdf?page= helper. The checklist already says which passages matter (randomisation, concealment, blinding, ITT), so the keyword table is just the checklist items. If nothing matches, show 「沒找到，請自己看 Methods」. Never guess.
2) Drop picking the "main result sentence" by rules. Finding the primary-outcome sentence in Results from keywords is unreliable, especially with two-column PDFs, and if it lands on the wrong sentence the spin check teaches the wrong lesson. Instead, show only the Abstract/Conclusion sentence (easy to find), link to the Results section, and ask the three questions. The user does the comparing.
3) Drop the dashboard ratio 「已回原文核對 vs 只讀 AI」. All it can see is whether a callout has text, so it would be a vanity metric that is easy to game and would mislabel careful readers.
4) Keep 「我的話」 only as an optional callout in the user block. Don't tie the AI note's folding to it, or at most make that an off-by-default preference. Notes with no AI note don't need it at all.
5) The 術語本 is the strongest standalone piece and is cheap: a second button next to the existing stats-explainer popup button, stored as a tagged child note, written out by concepts.js. Make sure it isn't a copy of stats-explainer: no auto-filled explanation. If the user wants a hint, they can press 讀懂統計 themselves.
6) Each piece gets its own switch (readingGuide, glossary).
7) Chinese papers: start with English only, and say so in the UI. Don't build a Chinese keyword list until there is demand.

Remaining risks: PDF text quality (scanned or two-column files), and duplication with 評讀陪練. The locator must not quote passages under a CASP item label the way the coach does, or the two will feel like the same feature.


## #18 新文獻收件匣：每週可讀量上限、逐篇決定、證據上層優先
- 審查後標題：搜尋機器人：加入臨床指引層級與「可能影響 GRADE」標記（取代收件匣提案）
- keep=False・effort M→M・impact 4→2

**WHAT** 把 PubMed 新文獻追蹤和主題機器人的新結果收進同一個「收件匣」，不再直接匯入 Zotero。使用者設定每週想看幾篇（例如 10 篇），收件匣只顯示分數最高的那幾篇，排序先看證據層級：指引和系統性回顧，然後 RCT，最後其他設計。每篇只有三個按鈕：納入（匯入 Zotero）、略過、之後再看。「之後再看」超過 4 週沒處理就自動移到「過期」區，不再算進待看數。如果某篇新的系統性回顧或大型 RCT 對應到已經做過 GRADE 的結果指標，或對應到 PICO 問題卡，就置頂顯示「這篇可能會改變你的 GRADE 判斷」。首頁和島嶼地圖的「待看 n」改成「本週 3／10」，量變得有上限。

**HOW** pubmed-watch.js checkWatch() 加一個 mode 設定：「import」（現行）或「inbox」。inbox 模式在 summaries() 之後不呼叫 importPMIDs()，改成把 records 轉成 topic-bot 的 candidate 格式，交給 topic-bot.js scoreCandidate() 和 designOf() 評分，再用 buildBotSection() 的勾選清單格式寫進收件匣筆記。這樣使用者仍然只在 Obsidian 勾選，下次同步時由現有的「只匯入勾選的」流程匯入。新增純函式 weeklySlice(rows, cap, now)：依決定狀態、層級、分數排序並截斷；expire(rows, now, weeks) 依 parseListed() 已有的狀態加上首次出現日期（新欄位）判斷過期。「可能改變 GRADE」的判斷：用 grade.js 已存的結果指標名稱和 pico.js matchCard() 比對候選的標題與摘要，設計必須是 SR 或 RCT 才觸發。首頁卡片在 topics.js 讀 botSummaries()。設定加 inbox.weeklyCap 和 inbox.expireWeeks。

**COACH** 沒有 AI，排序規則全部寫明（層級、分數理由沿用 reasons）。決定權完全在使用者：工具只限制每次要面對的量，並提醒「先看上層證據」，不替使用者決定納入哪篇。

**RISKS** 已經習慣自動匯入的使用者升級後會覺得「怎麼沒進來」，預設值應該維持 import，只在設定精靈或首頁提示可以改用收件匣。過期機制可能讓人錯過真正重要的文獻，過期區要能搜尋，置頂的 GRADE 相關文獻也不應該過期。比對 GRADE 結果指標的字詞可能有誤報，所以只顯示「可能」。

**REVIEWER** Reject as written. The core ask, a scored and design-ranked inbox where only the user's picks reach Zotero, already exists as the topic bot. Adding an "inbox" mode to pubmed-watch.js would make a second, overlapping triage path. The simpler fix is in onboarding: novices who want triage use the bot, and power users who want auto-import use the watch. The remaining parts add little or add risk:
(1) A weekly cap of "本週 3/10" is cosmetic. The list is already sorted by score with ⭐⭐⭐ counts, so "read the top 10" is the same thing without a new limit.
(2) A 4-week "之後再看" expiry adds new state to Markdown checklists, because parseListed() only reads ticked or unticked and has no first-seen date. It also risks quietly hiding papers, the opposite of what a PhD student doing a systematic search needs, and the bot already ages out low scorers through MAX_LISTED.
(3) Three buttons do not fit the Obsidian checkbox workflow. "略過" would need a new syntax.

Two small parts are real gaps and worth splitting out as an S-effort change inside topic-bot.js:
(a) DESIGNS has no guideline tier. Add {label:"臨床指引", pubTypes:["Practice Guideline","Guideline","Consensus Development Conference"], re:/\b(guideline|recommendation|consensus statement)\b/i} ranked above 系統性回顧. This serves the 6S pyramid pain directly.
(b) A "可能影響你的 GRADE 判斷" marker on a line, only for a 系統性回顧 or RCT candidate in a collection that has a saved GRADE profile. The candidate must match that profile's outcome names (grade.js normalizeOutcome().name) AND the collection's PICO card through pico.js. Requiring both keeps false positives down. Label it "可能" and show the matched outcome in the reasons.
Both are rule-based with no AI, they only add facts the user can decide on, and they fit the coach principle.

Suggested follow-up title: 搜尋機器人：加入臨床指引層級與「可能影響 GRADE」標記. Effort S, impact 3.


## #19 25 分鐘小任務、本週完成回顧、自動整理的「卡關與要請老師決定」
- 審查後標題：進度報告自動列出「待決定的評讀題」供勾選，首頁加「今天先做這件」
- keep=True・effort M→M・impact 4→3

**WHAT** (1) 每週任務多一種大小：每項任務標示預估時間（讀摘要 10 分鐘、核對一題評讀 15 分鐘、讀一段 Methods 25 分鐘），首頁永遠有一項「今天只做這件：25 分鐘內做得完」的最小下一步；(2) 首頁和進度報告開頭先放「這週你做到了」：完成的任務、核對過的評讀、寫了多少字、學會的檢索規則，再談缺口；把「荒島」「待讀」這類字眼放到後面，語氣改成「下一步」；(3) 進度報告的「本次想討論的問題」不再是空白欄位，而是先自動列出候選問題讓使用者勾選：評讀表中答「不清楚」的題目、AI 筆記裡 ⚠️ 未查證的句子、評讀陪練中使用者與 AI 意見不同且還沒決定的題目、檢索健康檢查的建議事項，並分成「我卡在哪裡」和「需要老師決定」兩欄；(4) 一張「和老師的約定」卡：會談頻率、希望怎麼回饋（書面／口頭）、什麼算一次的進度，寫一次之後每份報告都會附上，學期中可以回頭調整。

**HOW** planet.js pickQuests() 在 QUEST_VERBS 旁邊加一張 QUEST_MINUTES 表，再加一個 kind「method」（讀 Methods 段落，配合 fulltext-md 的段落定位）；新增純函式 smallestNext(quests, records) 從本週還沒做的任務挑時間最短的一項，交給 topics.js 首頁顯示。「這週你做到了」直接用現有的 questsIn(history, start, end)、progress-report.js readingChanges() 和寫作字數 draftRecord()，在 buildSections() 裡把這節移到最前面。候選問題用新的純函式 candidateQuestions(facts)：從 appraisal-form.js 的記錄讀取「不清楚」的題目（常見弱點的計算已經在掃這些答案）、從 verify.js verifyQuotes() 的結果讀取 ⚠️ 句子、從 appraisal-coach.js disagreements(run) 讀取尚未決定的題目；對話框（progress-report 的 dialog）改成勾選清單，再加一個自由輸入欄。約定卡存成 vault 中的一個檔案（使用者可編輯），progress-report.js 用 extractSection() 讀出後附在報告最後。

**COACH** AI 不參與，全部來自使用者自己的紀錄。候選問題只是讓使用者勾選，問什麼、要不要問都由使用者決定；工具不替使用者寫問題答案，而是讓「不懂的地方」變成可以帶去問老師的具體問題，彌補沒有 EBP 導師的困境。

**RISKS** 正向回顧如果寫得太「打氣」會讓人覺得虛假，文字要具體、平實（數字和連結）。自動列出的不清楚題目可能很多，每類最多 3 項。約定卡涉及師生關係，必須是選用、預設不顯示在報告中，除非使用者勾選。預估時間只是粗估，要讓使用者能改。

**REVIEWER** Keep, but only a narrowed version. Most of the bundle is either already in the plugin or weak. One part is new and worth building: the candidate-question checklist.

What to cut and why:
(a) "這週你做到了" first: the report already opens with 本期閱讀, which lists completed quests, verified appraisals and new AI notes, and then the user's own word count. Moving sections around adds nothing. Renaming 荒島/待讀 to "下一步" goes against the planet and islands design (DESIGN.md: stages 🌱 荒島…🏙️ 城鎮 are the core metaphor). Leave this out.
(b) 25-minute time estimates and a new "method" quest kind: the existing quest kinds don't fit fixed times. "讀完" a paper is not a 10 or 25 minute job, so the numbers would be made up. The Methods-paragraph quest needs paragraph locating in fulltext-md for every paper, which is scope creep. A cheap version is enough: a smallestNext() that picks one open quest from this week's set, preferring verify, then ai, then read, and shows it as "今天先做這件" on 首頁's planet card. No minute table.
(c) 和老師的約定 card: this is relationship and administrative work, not literature work. The user can keep a plain vault note for it. It also adds a pref, a file and an opt-in toggle for very little benefit. Drop it.

What to build (candidate questions in the progress-report dialog), with fixes:
- CASP/JBI "不清楚" means "the paper doesn't report it". It does not mean "I don't understand", so listing it as "我卡在哪裡" mislabels it. Phrase the candidate as a question about the paper, for example "《X》沒有報告 allocation concealment，評讀判為不清楚，這樣會影響納入／GRADE 嗎？", and put it in the "需要老師決定" column. Only list it for papers in an active review or island, at most 3, and give priority to items appraisal-form weakItems() shows recurring across papers. A recurring item is a real methods question for the advisor.
- appraisal-coach: list the items from disagreements(latestRun(record)) that have no decision yet (summaryLine already counts these as "尚未決定"). These are the strongest candidates, because the user and the AI disagreed and the user hasn't decided.
- verify.js: count the "⚠️ 未在全文中找到" sentences in AI notes. Show them as a to-do ("先自己核對"), not as a question for the advisor. The advisor shouldn't be asked to check AI output.
- Search health-check suggestions: add one line per review at most, if a health-check result is stored. Otherwise skip it.
- Each candidate is shown with a checkbox and stays unchecked by default. Only checked ones go into 本次想討論的問題, as text the user can edit. The free textarea stays. The Services.prompt fallback keeps working without the list. Add a pure candidateQuestions(facts) with Node tests, as for the other pure helpers.

This meets the coach rule: no AI, and the questions are built from the user's own records. The user chooses and edits what to ask. It also fits the real gaps: a novice without an EBP mentor doesn't know what to bring to an advisor meeting, and unresolved appraisal decisions are exactly what an advisor should rule on. Data access is local (coach runs on records, ⚠️ marks in notes, appraisal entries), so no paid API is needed.

Revised scope: candidate checklist (two columns: "我卡在哪裡" for coach items still undecided and ⚠️ to-dos, "需要老師決定" for recurring 不清楚 items and inclusion or GRADE calls) plus the smallestNext line on 首頁. Effort S/M, closer to M because of the dialog UI. Impact 3, not 4, because the sections dropped above carried little real value.


## #20 臨床疑問收件匣：手機記一句話，下班後變成 PICO 草稿和先上層的搜尋
- 審查後標題：PICO 問題卡加上「先上層」6S 搜尋順序（臨床問題／論文回顧兩種模式）與題型判斷小幫手
- keep=True・effort M→S・impact 4→3

**WHAT** Obsidian 裡有一份「臨床疑問.md」，值班時在手機上隨手記一行（例如「失智長輩夜間躁動，音樂有沒有用？」）。下一次 Zotero 同步時，ZotMax 把每一行轉成一張 PICO 草稿卡：先用 5 個是非題判斷題型（是在比較兩種做法嗎？是在問準不準？是在問以後會怎樣？是在問原因？是在問病人的感受嗎？），選出治療、診斷、預後、病因或經驗型，並用規則把詞放進 P／I／O 的候選欄位，空的欄位留下引導問題。每張卡附一個「先上層」搜尋清單，依 6S 順序排列：臨床指引（NICE、RNAO、G-I-N、臺灣各學會、衛福部）→ 摘要型資源（UpToDate、TRIP）→ 系統性回顧（Cochrane、PubMed SR filter）→ 單篇研究，每層都有「這層找到了就可以停」的勾選。累積的疑問會出現在每週任務裡（例如「把 1 個臨床疑問整理成問題卡」）。

**HOW** vault 裡固定一個檔案（vault-layout.js 決定路徑，例如 00 收件匣/臨床疑問.md）；同步時（main.js 的 vault 同步流程）讀取未處理的行（沒有 ✓ 標記的），呼叫新的純函式 draftCard(line)：先用關鍵詞規則猜題型（有沒有／比較 → treatment；準不準、篩檢 → diagnosis；會不會、預後 → prognosis；感受、經驗 → meaning），再用 picoTerms() 切詞填入候選欄位；之後以 pico.js normalizeCard() 存成草稿，並在原始行尾加上 ✓ 和問題卡連結。PICO 卡目前只存在 pico.cards，這裡順便讓 cardMarkdown() 把每張卡寫成 vault 檔，手機上也能看。題型判斷的 5 題放進 pico-card.xhtml（renderCard() 加一個步驟）。上層搜尋清單用 search-links.js routeSources() 和 buildTarget()，新增 layer 屬性（guideline、summary、sr、study）來排序，並補上 RNAO、G-I-N、臺灣學會的來源；PubMed 的 SR 層用 "systematic[sb]" 過濾器。planet.js pickQuests() 加 kind「question」。

**COACH** 不呼叫 AI。草稿卡只用規則填入候選詞，每個欄位都是「請確認或改寫」，題型由使用者回答是非題決定，工具只說明每種題型適合哪個框架（PICO、PICo、PEO）。先上層的清單教的是找證據的順序，不替使用者判斷證據。

**RISKS** 關鍵詞猜題型會猜錯，要明確顯示「這是猜的，請按 5 題確認」。vault 檔案在手機端和桌面端同時編輯可能有衝突，只在行尾加標記、不改寫原文可以減少衝突。臺灣學會指引沒有統一網址，需要使用者自訂來源。

**REVIEWER** Reject the proposal as written. Keep only a small part.

What to cut, and why:
(1) The 臨床疑問.md phone inbox, which is parsed during sync and then has ✓ and links written back into it. Today ZotMax writes notes and only keeps the user's own sections. Changing lines in a file the user edits on a phone over Obsidian Sync/iCloud is a new two-way write path, and it risks conflicts and lost lines. The capture step itself (one line on a phone) is already free in Obsidian, so the value is in what happens after capture.
(2) One card per inbox line. PICO cards are one per research project/collection (pico.cards keyed by collection). Turning every jotted thought into a card would flood that model and the vault, and it fights the per-collection design used by the PICO table, PRISMA and planets.
(3) Rule-based keyword guessing to fill P/I/O. Chinese segmentation rules will often guess wrong. Pre-filled fields also nudge a novice toward accepting the tool's wording, which weakens the coaching. The existing per-field hints already do the scaffolding.
(4) A new quest kind 「question」, which is tied to the inbox.

Also, the target user's main job is a thesis or systematic/integrative review. There, "stop at the guideline layer" is wrong advice, because a review needs a comprehensive search. The pain is real for clinical EBP questions and TWNA EBHC A 類 reports, where top-down 6S searching is taught and scored. It is not the thesis search pain.

What to keep (small, inside the existing PICO card):
(a) A 「先上層」 block on the card. It regroups sources that already exist into 6S layers (guideline: NICE, tw-gov, guideline-pdf, plus RNAO, G-I-N and user-defined Taiwan society URLs; summary: UpToDate, TRIP, JBI EBP; SR: Cochrane, plus a PubMed link with the card query AND systematic[sb]; study: PubMed, PubMed Clinical Queries, CINAHL, 華藝, NDLTD).
(b) A mode switch on that block. 「臨床問題」 shows "found it at this layer? you may stop". 「論文／系統性回顧」 says every layer must be searched and logged for PRISMA.
(c) The 5 yes/no questions as an optional helper above the existing type selector. They only explain the choice. They never change the type for the user.

No AI is involved. Everything uses existing source definitions plus a `layer` property on BUILTIN, so this is a small change to search-links.js and to renderCard in pico.js. If the inbox idea comes back later, it should be a read-only list that turns a line into a new card only when the user clicks.


## #21 中文文獻一條龍：《護理雜誌》方括號英譯辨識、CNKI 簡體檢索、拼音保留、中文資料庫手動檢索小卡
- 審查後標題：PubMed《護理雜誌》方括號英譯標題辨識（修正「改成 en」誤建議）＋刪拼音前先存入 Extra
- keep=True・effort M→S・impact 4→3

**WHAT** (1) 從 PubMed 匯入、標題整個用方括號包住或 language 為 chi／zho 的條目，自動標成「中文原文、標題是英譯」，中文文獻補強會提醒補上中文原標題和中文作者姓名（英譯標題存到 Extra），APA 輸出改用中文著錄；同一篇再從華藝匯入時，用 DOI（10.6224/JN…）或期刊加卷期頁判定為重複；(2) 中文文獻補強要刪掉「陳美玲(Chen, Mei-Ling)」中的拼音時，先把拼音存進 Extra 的作者別名，不讓資訊消失；(3) 快速搜尋新增 CNKI，並產生簡體字版本的檢索式（只做字形轉換，提醒用語差異）；(4) 從 ZotMax 開華藝、臺灣期刊論文索引、臺灣博碩士論文或 CNKI 時，彈出一張填寫只要 30 秒的「手動檢索小卡」：日期（自動帶入）、實際使用的檢索式（預先填好複製的那一段）、限制條件、命中筆數、匯入幾筆，存進 Obsidian 的檢索紀錄表，PRISMA 的資料庫辨識數字可以和它對照。

**HOW** apa-zh.js isChineseItem()（約第 118–126 行）目前只要標題是拉丁字母就回傳 false；新增判斷：標題符合 /^\[.*\]\.?$/ 或 language 符合 /^(chi|zho)$/ 時，回傳 true 並加上 translatedTitle 旗標（純函式，Node 測試加入 Hu Li Za Zhi 的範例）。zh-meta.js 的補強檢查加一條規則「方括號英譯標題」，在現有的審閱對話框（zh-meta-review.xhtml）中顯示，由使用者貼上中文標題；第 347–352 行附近建議刪除拼音的規則，改成先寫 Extra「original-author: Chen, Mei-Ling」再刪。screening.js findDuplicates() 加一個比對層：DOI 前綴 10.6224/ 或 PMID 對應的期刊 ISSN、年、卷、起始頁相同就視為重複。search-links.js 加 CNKI 來源（mode: open+copy），簡體轉換共用「概念詞彙梯」提案中的繁簡字表；openTarget() 在開啟中文資料庫後呼叫新的 logPrompt()，小卡寫入 vault 的 `檢索紀錄.md`（表格列以 append 方式加入，不覆寫）。screening.js 的 PRISMA 輸出在有紀錄時顯示「資料庫命中（紀錄）／匯入後標籤數」兩欄。

**COACH** 不用 AI 翻譯標題或姓名：中文原標題由使用者從華藝或期刊網站貼上，工具只負責偵測和提醒。手動檢索小卡是幫使用者養成記錄習慣的鷹架，欄位預先填好但每項都可以改，也可以按「這次不記」。

**RISKS** 有些英文期刊的標題也可能被方括號包住（例如更正聲明），要同時看期刊或 language 欄才標記，並且只提醒、不自動改寫。每次開中文資料庫都彈小卡可能很煩，要提供「只在系統性回顧分類中詢問」的設定。修改 isChineseItem() 會影響現有引用格式，需要完整的回歸測試（apa-zh 的 Node 測試和 CSL 輸出比對）。

**REVIEWER** Keep only part (1)+(2), narrowed. Parts (3) and (4) should be cut or moved to separate proposals.

Evidence for the core: a PubMed record for a 護理雜誌 (Hu Li Za Zhi) article has a bracketed English title and language "chi". Today zh-meta.js englishLanguage() checks that GENERIC_ZH matches "chi" and that guessLanguage(title) returns "en", then suggests changing language to "en" with the hint "英文文章請改成 en". That is the wrong fix for this case: the coach would push BOB to mark a Chinese-original article as English, and the Word style would then cite it in English format. This is a real bug that fits Taiwanese nursing work, since 護理雜誌 is MEDLINE-indexed and shows up in every PubMed search on Taiwanese nursing topics.

The fix is narrow. In englishLanguage(), and as a new finding in analyze(), treat /^\[.*\]\.?$/ together with language chi/zho (or a known ISSN/journal such as Hu Li Za Zhi) as "中文原文、標題是英譯". Don't suggest en. Instead, prompt the user to paste the Chinese title and Chinese author names from 華藝 or the journal site, and move the English title into Extra (the "original-title" style). No AI translation, so it stays a coach.

Do NOT change apa-zh.js isChineseItem(). Once the user pastes the Han title it already returns true, so the proposed edit adds regression risk to CSL/Word output for no gain. Leave citation output alone until the Chinese title is there.

(2) Pinyin preservation is a cheap fix that clearly helps. The rule at zh-meta.js ~l.347 currently throws the pinyin away. Write it into Extra first (e.g. "original-author: Chen || Mei-Ling"), which helps later OpenAlex/PubMed author matching.

Dedup: PubMed 護理雜誌 records usually carry the 10.6224/JN DOI, and findDuplicates() already merges on the same DOI. Only add a journal+volume+first-page fallback for records with no DOI, and keep it as a suggestion, never an automatic merge.

Cut (3) CNKI + simplified-character query. Access from Taiwan is limited or subscription-only, mainland literature matters little for a Taiwanese nursing SR, it depends on a 繁簡 table from another proposal that doesn't exist yet, and character-form conversion alone misleads because the terminology differs.

Split (4), the manual search-log card (PRISMA-S), into its own proposal. Nothing like it exists today (no search log anywhere in content/), and it is valuable for a PhD-level SR. But a popup every time a database is opened is intrusive. It should be an opt-in "記錄這次檢索" button on the search panel, limited to SR-flagged collections, writing an append-only 檢索紀錄.md. Bundling it here makes this an L-sized grab-bag.

Revised scope: effort S, impact 3 (fixes a misleading suggestion plus data loss; the user is affected every time a 護理雜誌 PubMed record is imported).
