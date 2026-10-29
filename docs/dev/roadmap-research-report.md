# ZotMax 改進建議：一般人與博士生找文獻、讀文獻、寫文獻時卡住的地方

## 1. 結論先行

- **最大的缺口在「交代得清楚、站得住腳」，不在「找得到」。** 目前有四個問題沒解決：
  - 檢索過程沒有留下可重現的紀錄，中文資料庫的手動檢索完全沒有紀錄。
  - 使用者看不到自己漏查了什麼。
  - 撤稿旗標只停在 Zotero，帶不到 Obsidian 的筆記、PICO 表、GRADE 和 PRISMA。
  - 文獻探討容易寫成逐篇摘要，或把「研究少」直接當成研究的貢獻。
- **兩群人卡住的地方不同。** 一般人卡在找對的字、判斷可信度、讀英文。博士生卡在檢索能否重現、能否綜整，以及能否對口試委員交代清楚。
- **最優先的三項：**
  1. 檢索日誌，加上 PRISMA-S 草稿，並與「來源/」標籤對帳。
  2. 檢索健康檢查與檢索式體檢。
  3. 島嶼大綱的「主張鷹架」。
- **有一個 bug 應該馬上修。** PubMed 匯入的《護理雜誌》條目，目前會被「中文文獻補強」建議把語言「改成 en」。照做會破壞原本正確的中繼資料。

---

## 2.「一般人 vs 博士生」最常卡住的地方

**一般人**主要卡在四件事：找對的字、分辨可信度（掠奪性期刊、spin、AI 捏造的引用）、讀英文，以及臨床上時間太零碎。

**博士生**主要卡在五件事：檢索能否重現、什麼時候可以停、怎麼綜整與批判、研究貢獻與理論架構，以及和指導教授之間的期待落差。

下表依嚴重度排序，從 5 排到 2。

| 問題 | 誰 | 階段 | ZotMax 現況 | 證據 |
|---|---|---|---|---|
| 已撤稿、有關切聲明或被取代的研究仍留在庫裡與筆記中 | 兩者 | 評讀 | **none** | (Brown et al., 2022; Candal-Pedreira et al., 2020; Gray et al., 2018; Brierley et al., 2022; Zotero, 2023; Cochrane Library, n.d.) |
| 檢索沒有可重現的紀錄（PRISMA-S），中文庫手動檢索沒有紀錄 | 兩者 | 檢索 | partial | (Rethlefsen et al., 2021a, 2021b, 2024; Koffel & Rethlefsen, 2016; Cohen et al., 2015; Xia et al., 2008; Kuo et al., 2016) |
| 英文閱讀負擔、缺乏 EBP 導師 | 兩者 | 評讀 | partial | (Amano et al., 2023; Hung et al., 2026; Cheng et al., 2024; Yeh et al., 2025; Hanauer et al., 2019; Lu, 2019) |
| 分不清自由詞與 MeSH／CINAHL Headings | 兩者 | 檢索 | partial | (Duncan & Holtslander, 2012) |
| 主題詞跨庫轉換錯誤 | 兩者 | 檢索 | partial | (Salvador-Oliván et al., 2019; Clark et al., 2020) |
| 評讀能力不足，評讀工具沒有黃金標準 | 兩者 | 評讀 | partial | (Melnyk et al., 2018; Katrak et al., 2004) |
| 文獻探討寫成逐篇摘要 | 博士生 | 綜整 | partial | (Boote & Beile, 2005; Holbrook et al., 2007) |
| 新文獻太多，提醒變成噪音 | 兩者 | 追蹤新知 | partial | (Bastian et al., 2010; Hoffmann et al., 2021) |
| 不知道自己查得不好（Dunning-Kruger） | 一般人 | 檢索 | partial | (Gross & Latham, 2012; Mahmood, 2016) |
| 預設用 Google Scholar | 兩者 | 檢索 | partial | (Gusenbauer & Haddaway, 2020; Beel & Gipp, 2009) |
| 掠奪性期刊混進來 | 兩者 | 評讀 | **none** | (Oermann et al., 2019, 2020, 2021) |
| 看表面線索判斷可信度，被摘要 spin 誤導 | 一般人 | 評讀 | partial | (Boutron et al., 2010; Wineburg & McGrew, 2019) |
| AI 給的參考文獻是捏造的 | 兩者 | 檢索 | partial | (Walters & Wilder, 2023) |
| 不知道查到什麼程度才「夠了」 | 博士生 | 檢索 | partial | (Booth, 2010; Kastner et al., 2009) |
| 只會找缺口，說不出貢獻與理論架構 | 博士生 | 形成問題 | partial | (Sandberg & Alvesson, 2011; Piper & Stokes, 2020) |
| 心理負荷、冒牌者感受、與指導教授期待落差 | 博士生 | 身心 | partial | (Levecque et al., 2017; Evans et al., 2018; Wang & Li, 2023; Cardilini et al., 2022) |
| 什麼題目都套 PICO | 兩者 | 形成問題 | partial | (Methley et al., 2014; Booth, 2016) |
| 跳過 6S 金字塔，指引難找 | 兩者 | 檢索 | partial | (DiCenso et al., 2009; Alonso-Coello et al., 2010) |
| 把證據等級當成證據確定性 | 兩者 | 評讀 | partial | (Murad et al., 2016) |
| 臨床時間零碎，問人比查資料庫快 | 一般人 | 檢索 | partial | (McKnight, 2006; Melnyk et al., 2018) |
| 證據難套用到在地情境 | 兩者 | 綜整 | partial | (Burchett et al., 2011; Alonso-Coello et al., 2010) |
| 找測量工具和信效度（含中文版）很耗時 | 博士生 | 檢索 | partial | (Terwee et al., 2009; Prinsen et al., 2018) |
| 質性證據難檢索，確定性難判讀 | 博士生 | 綜整 | partial | (Wright et al., 2015; Lewin et al., 2018) |
| MeSH 和繁中檢索詞沒有可靠對照 | 兩者 | 檢索 | partial | (Lu et al., 2005; Xia et al., 2008; 國家教育研究院, n.d.) |
| PubMed 匯入的《護理雜誌》被當成英文文獻 | 兩者 | 管理 | **none** | (National Library of Medicine, n.d.; Lee et al., 2023; University of Melbourne Library, n.d.) |
| 學位論文手冊和期刊規定的參考文獻排序相反 | 兩者 | 寫作 | partial | (中國醫藥大學, 2019; University of Melbourne Library, n.d.) |
| 付費牆擋住全文 | 一般人 | 取得全文 | partial | (Piwowar et al., 2018; Bohannon, 2016) |
| 灰色文獻與在地文獻零散，說不清楚怎麼找的 | 兩者 | 檢索 | partial | (Mahood et al., 2014) |
| 引文追蹤隨興做、沒有紀錄 | 博士生 | 檢索 | partial | (Hirt et al., 2023) |
| 多來源匯入造成重複，去重沒有紀錄 | 兩者 | 管理 | partial | (McKeown & Mir, 2021) |
| 要投稿，卻不願花時間學英文論文寫作 | 博士生 | 寫作 | **none** | (Huang, 2010) |
| 中文姓名拼音不一，作者辨識出錯 | 兩者 | 追蹤新知 | **none** | (Kim et al., 2021) |
| 中文 RCT 的真實性與跨語言重複發表 | 兩者 | 評讀 | **none** | (Wu et al., 2009; Jia et al., 2020) |
| 臺灣博碩士論文延後公開，拿不到全文 | 兩者 | 取得全文 | partial | (國家圖書館, n.d.; 國立臺灣大學圖書館, n.d.) |
| 要不要納入非英文文獻，沒有依據可引用 | 兩者 | 篩選 | partial | (Dobrescu et al., 2021; Cochrane Colloquium, 2020) |

---

## 3. 建議路線圖

幾點說明：

- 工作量（S／M）和影響（1–5）採用審查者修正後的數字。
- 原本重疊的提案已經合併，例如三份「進度報告候選問題」合成一項，兩份「檢索日誌」合成一項。
- 版本號只是建議，依目前版本往後排即可。

### 0.39.0：先修 bug，補上寫作提問（全部是 S，彼此沒有相依）

**A.《護理雜誌》英譯標題修正，刪拼音前先保留**（S／影響 3）
- **你會得到：**
  - PubMed 匯入的條目（language 是 chi、標題是 [英譯]、或期刊是 Hu Li Za Zhi／ISSN 0047-262X）不會再被建議改成 en。
  - 中文文獻補強會改成提醒你貼上中文原標題和中文作者名，英譯標題存到 Extra。
  - 刪掉「陳美玲(Chen, Mei-Ling)」裡的拼音之前，先把拼音寫進 Extra 的 `original-author`。
  - 找重複時多兩條規則：PMID 相同；或期刊＋年＋卷＋起始頁四項都有而且都相同。
- **對應痛點：** 護理雜誌、去重、拼音。
- **教練原則：** 中文標題由你貼上，程式不翻譯也不猜。重複只列為候選，不會自動合併。
- **審查提醒：**
  - `zh-meta.js englishLanguage()` 的「改成 en」誤建議要在同一次修改裡修掉。
  - 偵測不能只靠方括號，因為 Zotero 的 PubMed 匯入程式（translator）可能會把方括號去掉。
  - 期刊對照表只放確定被 MEDLINE 收錄的《護理雜誌》，其他期刊沒查證前不要加。
  - 兩位審查者對要不要改 `isChineseItem()` 意見不同。**建議先不改**：你貼上中文標題後它自然會判對。如果要改，必須跑完整的 CSL 回歸測試。
  - 確認視窗維持「一次套用」，措辭寫成「可能是中英文版本，請確認」。

**B. 島嶼大綱提問升級與主張鷹架**（S／影響 4）
- **你會得到：**
  - 原本的「缺口要寫出來，這可能就是你研究的理由」改成三個問題：為什麼重要？誰會在乎？既有研究背後有什麼你不同意的假設？
  - 每座島多一題「這一段你的主張是什麼？寫在下方 ✍️ 我的筆記」。
  - 研究依 effect_direction 分組列出，標「方向（AI 初判）」，並附 CEBM 等級和「已核對」標記。
  - 有 ≥2 篇已核對評讀，而且方向和未核對的研究不同時，才出現品質對照提問。
  - 有 GRADE 時，大綱開頭列出確定性。沒有 GRADE 時，提醒「CEBM 等級是研究設計，不是證據確定性」。
  - PICO 卡有填「我的情境」時，多一題在地適用性提問（護病比、病人特性、健保給付）。
- **對應痛點：** 逐篇摘要、gap-spotting、把等級當確定性、在地適用性。
- **教練原則：** 不寫段落，只排列你自己的資料並提出問題。主張由你寫。
- **審查提醒：**
  - 程式裡沒有 `%% zm-keep %%` 這種保留機制，所以可填寫的欄位不能放進會被重建的自動區塊。
  - 不做「支持／不支持」分欄，因為 ZotMax 不知道你的主張是什麼。
  - `appraisal_overall` 記的是納入決定，不是品質高低，不能拿來分品質。
  - GRADE 表是以整個分類（星球）存的，不要硬對到單一島嶼。

**C. PICO 問題卡加「先上層」6S 順序與題型小幫手**（S／影響 3）
- **你會得到：**
  - 現有來源依「指引 → 摘要型資源 → SR → 單篇研究」分層排列，另外補上 RNAO、G-I-N、自訂的臺灣學會網址，以及 PubMed `systematic[sb]`。
  - 兩種模式：「臨床問題」模式顯示「這層找到就可以停」；「論文／系統性回顧」模式要求每層都查並記錄。
  - 5 個是非題，說明你的問題屬於哪一種題型。
  - `checkCard` 多兩條規則：質性題提醒加質性研究詞並查 CINAHL；診斷題提醒 O 通常不放進檢索式。
- **對應痛點：** 6S、框架選錯、質性。
- **教練原則：** 題型由你決定，小幫手只負責解釋。
- **審查提醒：** 不做手機收件匣、每行一張卡、用規則自動填 PICO。寫論文的回顧不能「找到就停」。

### 0.40.0：讓檢索交代得清楚（核心版本）

**D. 檢索日誌、PRISMA-S 草稿與對帳**（M／影響 5）
- **你會得到：**
  - 每個分類一份日誌，放在 `30 評讀與綜整`。欄位有資料庫、平台、完整檢索式、日期、限制條件與理由、命中數、匯入檔名與筆數。**查到 0 筆也要記。**
  - 每筆分成「正式」或「探索」，只有正式的會進 PRISMA 和附錄。
  - 三個記錄入口：
    - PubMed「測試檢索式」旁的「記入檢索日誌」按鈕，自動帶入命中數、query translation 和實際送出的檢索式。
    - 開啟中文庫或灰色文獻網站後，出現一個不打斷操作的「記一筆」按鈕，已預填資料庫、日期和檢索詞。
    - 匯入一批帶「來源/」標籤的文獻後，可以選擇補記一筆。
  - PRISMA 筆記並列「日誌命中／匯入／標籤」三個數字，對不上時出現 `logMismatch` 提醒。
  - PRISMA-S 匯出成清單草稿，日誌不知道的項目標「待填」。
  - 每次找重複都留一筆去重紀錄（規則、組數、標記數）。
  - 主題機器人原本寫「請自己查」，改成「查完請記到檢索日誌」。
- **對應痛點：** PRISMA-S、中文資料庫、灰色文獻、去重沒有紀錄。
- **教練原則：** 不用 AI。只預填 ZotMax 確實知道的事實，數字對不上時只指出來，不替你改。
- **審查提醒：**
  - **不要用日誌加總取代 PRISMA 的 identified。** 程式有一條「identified = duplicates + screened」的檢查，硬換會讓沒匯入的筆數被誤算成重複，所以只並列，換不換由你決定。
  - 主題機器人和 PubMed 追蹤的自動執行只產生「探索」草稿，由你決定要不要升為正式。
  - 不做 CNKI、自動改寫「更新檢索」、每次匯入都跳問題。
  - 日誌存在 vault 的受管理區塊或資料夾裡的 JSON，不放在 prefs。
  - 日誌完不完整，取決於你有沒有養成記錄的習慣。

**E. PRISMA 筆記的「檢索健康檢查」卡，加上停止理由**（M／影響 4）
- **你會得到以下規則提醒：**
  - 有名稱的資料庫只有一個。如果很多筆沒有來源標籤，會改說「無法判斷，請先加來源標籤」。
  - Google Scholar 被算在「資料庫」欄。
  - 有納入研究只靠 Google Scholar 找到。
  - 質性題沒有查 CINAHL。
  - 納入 RCT ≥3 篇，卻沒有 SR 或指引。沒有 AI 筆記的條目不計入，畫面上會註明。
  - 沒有做引文追蹤。
  - 最後固定附上 PRESS 式的「帶去給館員或指導教授看的 3 件事」。
  - `search_stop_reason`（停止搜尋的理由）由你自己填，重新產生筆記時會保留，進度報告會讀出來。
- **對應痛點：** Dunning-Kruger、Google Scholar、6S、質性。
- **教練原則：** 只給客觀訊號和下一步，不打分數，也不會判定「查完了」。
- **審查提醒：**
  - 拿掉三條沒有資料來源的規則：CINAHL MH 未核對（ZotMax 不產生 MH 檢索式）；兩輪追蹤沒有新納入（要等 H 做出輪次紀錄）；只有 MeSH 沒有自由詞（ZotMax 自己產生的檢索式不會觸發）。
  - Google Scholar 只提醒，不自動移欄。

**F. 檢索式體檢**（M／影響 4）
- **你會得到：**
  - 只檢查你自己寫或改過的檢索式，入口是「測試檢索式」和網頁版新增的「檢查我改過的檢索式」框。
  - 結構提醒最多 3 條：長串沒有括號、同一層混用 AND／OR、括號不成對、NOT 用得太早。
  - 把 query translation 翻成中文說明：哪些詞被自動對到 MeSH，哪些詞被丟掉。
  - 筆數只用一句中性的話、依題型說明，不打紅燈。
  - PICO 欄位提示：有 MeSH 沒有自由詞，或沒用截字和片語引號。
- **教練原則：** 不改寫你的檢索式，按鈕只有「我改好了，再測一次」。
- **審查提醒：**
  - 不檢查 ZotMax 自己產生的檢索式。
  - CINAHL 的註記已經有了，只加查詢連結。
  - 不做「技能成長卡」。
  - Node 測試要涵蓋 `[mh:noexp]`、`[majr]`、引號內的萬用字元等邊界情況。

### 0.41.0：證據完整性

**G. 撤稿旗標第一階段**（M／影響 3）
- **你會得到：**
  - 從 `Zotero.Retractions` 讀出撤稿資料，寫進 frontmatter 的 `retraction` 和 `retraction_date`。
  - 筆記頂端出現紅色 callout。
  - PICO 表、GRADE 研究清單、評讀總表在撤稿研究前加 ⛔。
  - PRISMA 多一條 `retractedIncluded` 提醒，儀表板多一個問題項。
  - 「先讀、先引用」和每週任務不再推薦撤稿研究。
- **教練原則：** 不用 AI、不刪條目、不改篩選標籤。提示寫成問題：「這篇在你的回顧裡要怎麼處理？」
- **審查提醒：**
  - 撤稿很少見，但一旦發生代價很高。
  - 內部 API 要包在 try 裡，取不到時在設定頁顯示「撤稿資料不可用」。
  - 只認得有 DOI 或 PMID 的條目，所以要寫明「沒有旗標不代表沒問題」。
  - 增量同步必須能改寫沒變動條目的受管理 frontmatter，否則旗標到不了已經存在的筆記。
  - Notion 欄位、KPI 卡、進度報告差異延後。
  - 關切聲明、勘誤和預印本正式版延到第二階段（PubMed CommentsCorrections、OpenAlex `is_retracted`，預設關閉）。

**H. 檢索驗證：基準文獻回收率與引文追蹤輪次**（M／影響 4）
- **你會得到：**
  - **基準文獻回收率：**
    - 從分類裡挑基準文獻。預設是已全文納入、有 PMID、但檢索式沒找到的研究。
    - 檢索式 AND 上這份 PMID 清單送 ESearch，結果顯示成「找回 7/9」。
    - 列出漏掉的文獻和它們的 MeSH，問你要不要把這些詞加進檢索式。
    - 沒有 PMID 的研究列為「無法自動驗證」，不會被悄悄排除在分母之外。
  - **引文追蹤輪次：**
    - 每輪記錄日期、種子、方向、候選數和新納入數。
    - 下一輪只拿上一輪之後新納入的研究當種子。
    - 連續沒有新納入時，只顯示「可能已飽和」的訊號。
- **教練原則：** 只給數字和問題，不自動改檢索式，也不說「可以停了」。
- **審查提醒：**
  - **拿掉 Chapman capture–recapture 估計。** 資料庫彼此高度重疊、不獨立，估計會偏差，而且附上信賴區間的數字會被當成權威。
  - 資料庫重疊只列原始表，資料要從找重複的群組合併來源標籤。
  - 不依賴檢索日誌，沒有日誌時改用已存的追蹤或機器人檢索式。
  - 這一項不處理 MeSH／CINAHL／Emtree 轉換的痛點。

**I. PICO 檢索詞表**（M／影響 4）
- **你會得到：**
  - P／I／O 每個要素一塊：中文詞、英文自由詞、MeSH（Entry Terms 可摺疊、可勾選）、CINAHL MH（你自己填，預設標「未核對」）、出處。
  - 每個詞標示「已在檢索式」或「還沒用到」。
  - 產生 PubMed、CINAHL、華藝與臺灣博碩士論文三種檢索式。
  - 輸出方法章可用的關鍵字表，並附樂詞網連結。
- **教練原則：** 詞來自 NLM 或你自己，你勾選了才會進檢索式。不用 AI 翻譯。
- **審查提醒：**
  - Entry Terms 直接從 esummary 的 `ds_meshterms` 整個陣列取，不需要另外呼叫 efetch。
  - 不做簡中欄、CNKI、繁簡字表。字形轉換不等於用語轉換，容易誤導。
  - 寫回概念卡別名要逐詞勾選，不自動寫回。

**J. 主題機器人：臨床指引層級與「可能影響 GRADE」標記**（S／影響 3，從被刪的提案中保留下來的部分）
- **你會得到：**
  - 研究設計多一個「臨床指引」層級，排在 SR 之前。
  - 分類已經有 GRADE 時，SR 或 RCT 候選如果同時命中結果指標名稱（透過概念卡別名轉成英文）和 PICO 卡，就標「可能影響 GRADE：〈結果〉」。
  - 選配：候選過期後收進摺疊區，可以一鍵恢復。
- **對應痛點：** 資訊超載、6S。
- **審查提醒：** 中文的結果名稱直接拿去比對英文摘要幾乎不會命中，必須經過別名轉換。標記一律寫「可能」。

### 0.42.0：指導教授與寫作

**K. 進度報告：想問老師的地方、決策紀錄、口試問題庫、「今天先做這件」**（M／影響 4）
- **候選問題清單**（預設不勾、最多 6 條、可摺疊、每條附連結和「為什麼列出來」）：
  - 評讀陪練中你和 AI 不同、而且還沒決定的題目。
  - 雙人評讀 A、B 不一致的題目。評讀者 B 現在就可以填「指導教授」。
  - 你自己在評讀題或 ⚠️ 句子上標了「想問老師」的項目。
  - 同一工具的同一題在 ≥2 篇都判「不清楚」，合併成一條，例如「隱匿分派在 3 篇都判不清楚，想確認判讀標準」。
  - PRISMA 的 warn 項目，以及 GRADE 降級了卻沒寫理由的項目。
  - 勾選的項目會變成「本次想討論的問題」裡可以修改的文字，可以加上【決定】【卡關】標籤。標了【決定】但上次沒打勾的，下一期會自動帶過來。
- **決策紀錄**（`40 寫作/決策紀錄.md`）：
  - 只增不改，記錄日期、決定、理由、誰提出，也可以手動新增。
  - 可以直接用在方法章的計畫偏離說明，以及年份和語言限制的理由。這也回應了「非英文文獻納入理由」這個痛點。
- **口試問題庫：**
  - 依專案目前的狀態用規則出題，每題附出處（PRISMA-S、GRADE、CASP）。
  - 答案由你寫在 `口試準備.md`。
- **首頁「今天先做這件」：** 從本週任務挑一件。
- **教練原則：** 全部用規則，AI 不參與。要問什麼、要不要問，由你決定。
- **審查提醒：**
  - 「不清楚」常常是正確答案（原文真的沒寫），所以不全列，措辭寫成關於論文的問題，不寫成「你不懂」。
  - ⚠️ 未查證的句子列為你自己的待辦，不拿去給老師看。
  - 不新增兩個固定欄位、不改 SUMMARY_PROMPT、不移動「本期閱讀」的位置。
  - 不做 25 分鐘時間表和「和老師的約定」卡。

**L. 草稿綜整健檢**（M／影響 3）
- **你會得到：** 「檢查我的草稿」指令，讀 `40 寫作` 裡你自己的文字或你貼上的文字，產生一則健檢筆記，**不改草稿本身**。偵測項目：
  - 連續 ≥3 段（門檻可以調）每段只引用一篇。
  - 在這種單一引用的段落串中，以作者為主詞開頭。
  - 一段引用 ≥3 篇，卻沒有任何比較用語（然而、相較之下、一致、不一致）。
  - 出現「證實」「強證據」「Level 1」，但引用的研究最好只到 CEBM 3 或更差，或沒有已核對的評讀。
  - 引用的文獻不在納入清單裡。
  - 每一項附段落編號、開頭 30 字和一個問題，可以按「忽略」。
- **教練原則：** 只診斷、只提問。
- **審查提醒：**
  - **不做** review-draft 的「只提問」模式，因為它和島嶼大綱重複，而且研究生引導模式本來就把 AI 草稿關掉了。
  - `userText()` 會把 Pandoc 引文刪掉，必須先抽出引文再清理文字。`noteRecord` 要補上 citekey 欄位。
  - 你的論文多半在 Word 寫，所以必須支援純文字的 APA 引文，例如「Wang 等人（2020）」「(Wang et al., 2020)」「王小明（2021）」，以第一作者＋年份比對。
  - 以作者開頭在 APA 7 是正常寫法，單獨出現時不提醒。

**M. 缺口論證卡**（M／影響 4，排在 B 之後）
- **你會得到：**
  - 只針對可以論證的缺口：空的「介入 × 結果」組合，以及「有 RCT 卻沒有 SR」。你點了才建立卡片。
  - **事實區：**
    - 附近有哪些研究、最新一篇是哪一年。
    - PubMed 的 I AND O 筆數，用 MeSH 加概念卡別名組成 OR，並附可以複製的檢索式。
    - 筆數大於 0 時，顯示「可能不是缺口，先看這 n 筆」。
    - 「已確認不是漏找」由你自己勾。
  - **你的回答區：** 缺口類型、為什麼重要、誰在乎、要挑戰哪個假設、補上之後會改變什麼。
  - 如果只寫了「臺灣沒人做過」，會追問：「臺灣的什麼條件讓國外結果不能直接套用？」並附 Burchett 的四類適用性提問。
- **教練原則：** AI 不判斷這個缺口值不值得做，答案由你寫。
- **審查提醒：**
  - 不自動標成「已確認」，查到一個筆數證明不了什麼。
  - 要明說：這個缺口是從你文獻庫的 AI 筆記字詞推算出來的，不是系統性檢索的結果。
  - 進度報告的統計和地圖面板延後再做。

### 0.43.0：讀得懂、量得到

**N. 評讀導讀與「我的術語本」**（M／影響 4）
- **你會得到：**
  - 評讀表每一題 CASP／JBI 旁邊有「原文在哪」：用規則找出一句原文並附頁碼，點一下跳到 PDF。找不到時直接說「沒找到，請自己看 Methods」。
  - 摘要或結論句旁邊附 Results 的連結，加上三個 spin 問題：主要結果顯著嗎？結論有沒有說得比結果多？標題是不是說有效？
  - PDF 選字選單多一個「加入我的術語本」，存英文原句、頁碼和你自己寫的中文解釋。
- **對應痛點：** 英文閱讀負擔、評讀能力、spin。
- **教練原則：** 只指出原文位置，不翻譯也不摘要。解釋由你寫，不會自動填入。
- **審查提醒：**
  - 放在評讀表裡，不放在筆記頂端。
  - 不用規則去挑「主要結果句」，挑錯了反而會教錯。
  - 不做「已回原文核對」比例。
  - 「我的話」只是選用的欄位，不綁 AI 筆記的摺疊。
  - 先只支援英文論文。
  - 外觀和操作要和評讀陪練有區別，避免看起來像同一個功能。

**O. 研究工具卡（第一期）**（M／影響 4）
- **你會得到：**
  - 自填欄位：構念、題數與計分、原始驗證文獻、中文版驗證文獻、α、再測信度、效度證據、授權與聯絡方式、適用族群。
  - 「測量特性檢索」按鈕：`"工具名"[tiab]` AND Terwee 過濾器，並說明精準度低是正常現象。
  - 「中文版信效度」按鈕：查華藝和臺灣博碩士論文。
- **教練原則：** 欄位都由你填。AI 筆記提到的 α 值只標「⚠️ AI 摘錄，請回原文核對」。
- **審查提醒：** verify.js 只核對「可引用的句子」，不能拿來核對信效度段落。

### 0.44.0 以後
- **理論架構卡（第二期）：** 列出構念、對應的工具和研究假設，用 Mermaid 畫圖，只做三項一致性檢查。PICO 連結是選填，只比對 O，因為理論導向的研究多半是相關性研究，變項不是 PICO。
- **撤稿第二階段：** 關切聲明、勘誤、預印本正式版。
- **COSMIN 核心項目：** 等實際用過工具卡之後再做。

### 目前還沒有提案涵蓋的痛點（下一輪候選）
- **掠奪性期刊**（none）：用 NLM Catalog 和 DOAJ 提供期刊可信度訊號，並附橫向閱讀清單。
- **AI 捏造的引用：** 貼上 ChatGPT 給的參考文獻，逐筆用 Crossref、PubMed、OpenAlex 驗證。
- **付費牆：** 用 OpenAlex 的 `best_oa_location` 提供合法免費全文連結。沒有 PDF 時，評讀表不能勾「已核對」。
- **學位論文排序：** 提供英文在前的 CSL、依輸出目標的預設，以及中文文獻英譯欄位。README 已經列為尚未處理。
- **中文 RCT 真實性：** PRISMA 和 GRADE 要支援「一個研究、多篇報告」。
- **其他：** 博碩士論文延後公開的狀態欄位、GRADE-CERQual 表、投稿教練與投稿里程碑、ClinicalTrials.gov API。

---

## 4. 刻意不做的

**整份提案被刪：**
- **PubMed 追蹤改走候選看板：** 和主題機器人重複；「每週閱讀上限」會讓你漏讀相關研究，違反完整檢索；GRADE 的中文結果名稱和英文摘要字面比對幾乎不會命中。
- **新文獻收件匣：** 主題機器人已經在做這件事；逾期自動清掉可能悄悄藏起文獻；三顆按鈕也不適合 Obsidian 的勾選框流程。

**合併後刪掉的子功能：**
- **Chapman capture–recapture 估計：** 資料庫不獨立，估計有偏差，又容易被當成權威數字。
- **CNKI 與簡中字形轉換：** 從臺灣使用受限，而且字形轉換不等於用語轉換。
- **review-draft「只提問」模式：** 和島嶼大綱重複，研究生引導模式本來就關閉了 AI 草稿。
- **用日誌加總取代 PRISMA identified：** 會破壞去重檢查和現有回顧的數字。
- **每次開連結都跳出紀錄卡：** 太打擾。
- **技能成長卡、25 分鐘時間表、「和老師的約定」卡、期待對齊表：** 訊號太薄，或不屬於文獻工作。
- **手機臨床疑問收件匣、每行一張卡、用規則自動填 PICO：** 有雙向寫入衝突的風險，猜錯詞反而削弱教練效果。
- **「支持／不支持」分欄、用「納入／排除」當品質高低：** ZotMax 不知道你的主張，而納入決定也不代表品質。
- **在自動區塊放可填寫的欄位：** 程式沒有保留機制，重建時會被清掉。
- **「已回原文核對」比例、強制先回述才能展開 AI 筆記：** 這個比例只是表面數字，容易灌水；強制回述的設計也太煩人。
- **完整 COSMIN、Notion 撤稿欄位與 KPI 卡、進度報告差異：** 延後，等使用者實際用過之後再決定。

---

## 5. 參考文獻

Alonso-Coello, P., Irfan, A., Solà, I., Gich, I., Delgado-Noguera, M., Rigau, D., Tort, S., Bonfill, X., Burgers, J., & Schunemann, H. (2010). The quality of clinical practice guidelines over the last two decades: A systematic review of guideline appraisal studies. *Quality & Safety in Health Care, 19*(6), e58. https://doi.org/10.1136/qshc.2010.042077

Amano, T., Ramírez-Castañeda, V., Berdejo-Espinola, V., Borokini, I., Chowdhury, S., Golivets, M., González-Trujillo, J. D., Montaño-Centellas, F., Paudel, K., White, R. L., & Veríssimo, D. (2023). The manifold costs of being a non-native English speaker in science. *PLOS Biology, 21*(7), Article e3002184. https://doi.org/10.1371/journal.pbio.3002184

Bastian, H., Glasziou, P., & Chalmers, I. (2010). Seventy-five trials and eleven systematic reviews a day: How will we ever keep up? *PLOS Medicine, 7*(9), Article e1000326. https://doi.org/10.1371/journal.pmed.1000326

Beel, J., & Gipp, B. (2009). Google Scholar's ranking algorithm: The impact of citation counts (an empirical study). In *Proceedings of the Third IEEE International Conference on Research Challenges in Information Science (RCIS 2009)* (pp. 439–446). IEEE. https://doi.org/10.1109/RCIS.2009.5089308

Bohannon, J. (2016). Who's downloading pirated papers? Everyone. *Science, 352*(6285), 508–512. https://doi.org/10.1126/science.352.6285.508

Boote, D. N., & Beile, P. (2005). Scholars before researchers: On the centrality of the dissertation literature review in research preparation. *Educational Researcher, 34*(6), 3–15. https://doi.org/10.3102/0013189X034006003

Booth, A. (2010). How much searching is enough? Comprehensive versus optimal retrieval for technology assessments. *International Journal of Technology Assessment in Health Care, 26*(4), 431–435. https://doi.org/10.1017/S0266462310000966

Booth, A. (2016). Searching for qualitative research for inclusion in systematic reviews: A structured methodological review. *Systematic Reviews, 5*, Article 74. https://doi.org/10.1186/s13643-016-0249-x

Boutron, I., Dutton, S., Ravaud, P., & Altman, D. G. (2010). Reporting and interpretation of randomized controlled trials with statistically nonsignificant results for primary outcomes. *JAMA, 303*(20), 2058–2064. https://doi.org/10.1001/jama.2010.651

Brierley, L., Nanni, F., Polka, J. K., Dey, G., Pálfy, M., Fraser, N., & Coates, J. A. (2022). Tracking changes between preprint posting and journal publication during a pandemic. *PLOS Biology, 20*(2), Article e3001285. https://doi.org/10.1371/journal.pbio.3001285

Brown, S. J., Bakker, C. J., & Theis-Mahon, N. R. (2022). Retracted publications in pharmacy systematic reviews. *Journal of the Medical Library Association, 110*(1), 47–55. https://doi.org/10.5195/jmla.2022.1280

Burchett, H., Umoquit, M., & Dobrow, M. (2011). How do we know when research from one setting can be useful in another? A review of external validity, applicability and transferability frameworks. *Journal of Health Services Research & Policy, 16*(4), 238–244. https://doi.org/10.1258/jhsrp.2011.010124

Candal-Pedreira, C., Ruano-Ravina, A., Fernández, E., Ramos, J., Campos-Varela, I., & Pérez-Ríos, M. (2020). Does retraction after misconduct have an impact on citations? A pre–post study. *BMJ Global Health, 5*(11), Article e003719. https://doi.org/10.1136/bmjgh-2020-003719

Cardilini, A. P. A., Risely, A., & Richardson, M. F. (2022). Supervising the PhD: Identifying common mismatches in expectations between candidate and supervisor to improve research training outcomes. *Higher Education Research & Development, 41*(3), 613–627. https://doi.org/10.1080/07294360.2021.1874887

Cheng, L.-C., Chen, C.-J., Lin, S.-C., & Koo, M. (2024). Factors associated with evidence-based practice competencies among Taiwanese nurses: A cross-sectional study. *Healthcare, 12*(9), Article 906. https://doi.org/10.3390/healthcare12090906

Clark, J. M., Sanders, S., Carter, M., Honeyman, D., Cleo, G., Auld, Y., Booth, D., Condron, P., Dalais, C., Bateup, S., Linthwaite, B., May, N., Munn, J., Ramsay, L., Rickett, K., Rutter, C., Smith, A., Sondergeld, P., Wallin, M., … Beller, E. (2020). Improving the translation of search strategies using the Polyglot Search Translator: A randomized controlled trial. *Journal of the Medical Library Association, 108*(2), 195–207. https://doi.org/10.5195/jmla.2020.834

Cochrane Colloquium. (2020). *Current Cochrane acupuncture reviews might be biased without searching Chinese databases* [Abstract]. Cochrane Colloquium Abstracts. https://abstracts.cochrane.org/2020-abstracts/current-cochrane-acupuncture-reviews-might-be-biased-without-searching-chinese

Cochrane Library. (n.d.). *Problematic studies: Implementation guidance*. Retrieved October 29, 2026, from https://www.cochranelibrary.com/cdsr/editorial-policies/problematic-studies-implementation-guidance

Cohen, J. F., Korevaar, D. A., Wang, J., Spijker, R., & Bossuyt, P. M. (2015). Should we search Chinese biomedical databases when performing systematic reviews? *Systematic Reviews, 4*, Article 23. https://doi.org/10.1186/s13643-015-0017-3

DiCenso, A., Bayley, L., & Haynes, R. B. (2009). Accessing pre-appraised evidence: Fine-tuning the 5S model into a 6S model. *Evidence-Based Nursing, 12*(4), 99–101. https://doi.org/10.1136/ebn.12.4.99-b

Dobrescu, A. I., Nussbaumer-Streit, B., Klerings, I., Wagner, G., Persad, E., Sommer, I., Herkner, H., & Gartlehner, G. (2021). Restricting evidence syntheses of interventions to English-language publications is a viable methodological shortcut for most medical topics: A systematic review. *Journal of Clinical Epidemiology, 137*, 209–217. https://doi.org/10.1016/j.jclinepi.2021.04.012

Duncan, V., & Holtslander, L. (2012). Utilizing grounded theory to explore the information-seeking behavior of senior nursing students. *Journal of the Medical Library Association, 100*(1), 20–27. https://doi.org/10.3163/1536-5050.100.1.005

Evans, T. M., Bira, L., Gastelum, J. B., Weiss, L. T., & Vanderford, N. L. (2018). Evidence for a mental health crisis in graduate education. *Nature Biotechnology, 36*(3), 282–284. https://doi.org/10.1038/nbt.4089

Gray, R., Al-Ghareeb, A., Davis, J., McKenna, L., & Hillel, S. A. (2018). Inclusion of nursing trials in systematic reviews after they have been retracted: Does it happen and what should we do? *International Journal of Nursing Studies, 79*, 154.

Gross, M., & Latham, D. (2012). What's skill got to do with it?: Information literacy skills and self-views of ability among first-year college students. *Journal of the American Society for Information Science and Technology, 63*(3), 574–583. https://doi.org/10.1002/asi.21681

Gusenbauer, M., & Haddaway, N. R. (2020). Which academic search systems are suitable for systematic reviews or meta-analyses? Evaluating retrieval qualities of Google Scholar, PubMed, and 26 other resources. *Research Synthesis Methods, 11*(2), 181–217. https://doi.org/10.1002/jrsm.1378

Hanauer, D. I., Sheridan, C. L., & Englander, K. (2019). Linguistic injustice in the writing of research articles in English as a second language: Data from Taiwanese and Mexican researchers. *Written Communication, 36*(1), 136–154. https://doi.org/10.1177/0741088318804821

Hirt, J., Nordhausen, T., Appenzeller-Herzog, C., & Ewald, H. (2023). Citation tracking for systematic literature searching: A scoping review. *Research Synthesis Methods, 14*(3), 563–579. https://doi.org/10.1002/jrsm.1635

Hoffmann, F., Allers, K., Rombey, T., Helbach, J., Hoffmann, A., Mathes, T., & Pieper, D. (2021). Nearly 80 systematic reviews were published each day: Observational study on trends in epidemiology and reporting over the years 2000–2019. *Journal of Clinical Epidemiology, 138*, 1–11. https://doi.org/10.1016/j.jclinepi.2021.05.022

Holbrook, A., Bourke, S., Fairbairn, H., & Lovat, T. (2007). Examiner comment on the literature review in Ph.D. theses. *Studies in Higher Education, 32*(3), 337–356. https://doi.org/10.1080/03075070701346895

Huang, J. C. (2010). Publishing and learning writing for publication in English: Perspectives of NNES PhD students in science. *Journal of English for Academic Purposes, 9*(1), 33–44. https://doi.org/10.1016/j.jeap.2009.10.001

Hung, H.-Y., Lee, Y.-W., Chou, H.-L., Lin, C.-F., & Chang, Y.-J. (2026). [The current state of integrating evidence-based health care competence into Taiwan's nursing clinical ladder system]. *Hu Li Za Zhi, 73*(2), Article e26208. https://doi.org/10.6224/JN.26208

Jia, Y., Huang, D., Wen, J., Qureshi, R., Wang, Y., Rosman, L., Chen, Q., Robinson, K. A., Gagnier, J. J., Ehrhardt, S., & Celentano, D. D. (2020). Assessment of duplicate publication of Chinese-sponsored randomized clinical trials. *JAMA Network Open, 3*(12), Article e2027104. https://doi.org/10.1001/jamanetworkopen.2020.27104

Kastner, M., Straus, S. E., McKibbon, K. A., & Goldsmith, C. H. (2009). The capture–mark–recapture technique can be used as a stopping rule when searching in systematic reviews. *Journal of Clinical Epidemiology, 62*(2), 149–157. https://doi.org/10.1016/j.jclinepi.2008.06.001

Katrak, P., Bialocerkowski, A. E., Massy-Westropp, N., Kumar, S., & Grimmer, K. A. (2004). A systematic review of the content of critical appraisal tools. *BMC Medical Research Methodology, 4*, Article 22. https://doi.org/10.1186/1471-2288-4-22

Kim, J., Kim, J., & Kim, J. (2021). Effect of Chinese characters on machine learning for Chinese author name disambiguation: A counterfactual evaluation. *Journal of Information Science*. Advance online publication. https://par.nsf.gov/biblio/10292508

Koffel, J. B., & Rethlefsen, M. L. (2016). Reproducibility of search strategies is poor in systematic reviews published in high-impact pediatrics, cardiology and surgery journals: A cross-sectional study. *PLOS ONE, 11*(9), Article e0163309. https://doi.org/10.1371/journal.pone.0163309

Kuo, C.-C., Wu, C.-Y., Feng, I.-J., & Lee, W.-J. (2016). [Efficacy of ultrasound-guided peripheral intravenous access: A systematic review and meta-analysis]. *Hu Li Za Zhi, 63*(6), 89–101. https://doi.org/10.6224/JN.63.6.89

Lee, Y.-H., Yeh, S.-H., & Cheng, F.-Y. (2023). [The effects of the question prompt list on usefulness, satisfaction and anxiety in patients with terminal cancer: A meta-analysis]. *Hu Li Za Zhi, 70*(2), 67–77. https://doi.org/10.6224/JN.202304_70(2).09

Levecque, K., Anseel, F., De Beuckelaer, A., Van der Heyden, J., & Gisle, L. (2017). Work organization and mental health problems in PhD students. *Research Policy, 46*(4), 868–879. https://doi.org/10.1016/j.respol.2017.02.008

Lewin, S., Booth, A., Glenton, C., Munthe-Kaas, H., Rashidian, A., Wainwright, M., Bohren, M. A., Tunçalp, Ö., Colvin, C. J., Garside, R., Carlsen, B., Langlois, E. V., & Noyes, J. (2018). Applying GRADE-CERQual to qualitative evidence synthesis findings: Introduction to the series. *Implementation Science, 13*(Suppl 1), Article 2. https://doi.org/10.1186/s13012-017-0688-3

Lu, W.-H., Lin, R. S.-J., Chan, Y.-C., & Chen, K.-H. (2005). Semi-automatic construction of the Chinese-English MeSH using Web-based term translation method. *AMIA Annual Symposium Proceedings, 2005*, 475–479.

Lu, Y.-L. (2019). How do nurses acquire English medical discourse ability in nursing practice? Exploring nurses' medical discourse learning journeys and related identity construction. *Nurse Education Today, 85*, Article 104301. https://doi.org/10.1016/j.nedt.2019.104301

Mahmood, K. (2016). Do people overestimate their information literacy skills? A systematic review of empirical evidence on the Dunning-Kruger effect. *Communications in Information Literacy, 10*(2), 199–213. https://doi.org/10.15760/comminfolit.2016.10.2.24

Mahood, Q., Van Eerd, D., & Irvin, E. (2014). Searching for grey literature for systematic reviews: Challenges and benefits. *Research Synthesis Methods, 5*(3), 221–234. https://doi.org/10.1002/jrsm.1106

McKeown, S., & Mir, Z. M. (2021). Considerations for conducting systematic reviews: Evaluating the performance of different methods for de-duplicating references. *Systematic Reviews, 10*, Article 38. https://doi.org/10.1186/s13643-021-01583-y

McKnight, M. (2006). The information seeking of on-duty critical care nurses: Evidence from participant observation and in-context interviews. *Journal of the Medical Library Association, 94*(2), 145–151.

Melnyk, B. M., Gallagher-Ford, L., Zellefrow, C., Tucker, S., Thomas, B., Sinnott, L. T., & Tan, A. (2018). The first U.S. study on nurses' evidence-based practice competencies indicates major deficits that threaten healthcare quality, safety, and patient outcomes. *Worldviews on Evidence-Based Nursing, 15*(1), 16–25. https://doi.org/10.1111/wvn.12269

Methley, A. M., Campbell, S., Chew-Graham, C., McNally, R., & Cheraghi-Sohi, S. (2014). PICO, PICOS and SPIDER: A comparison study of specificity and sensitivity in three search tools for qualitative systematic reviews. *BMC Health Services Research, 14*, Article 579. https://doi.org/10.1186/s12913-014-0579-0

Murad, M. H., Asi, N., Alsawas, M., & Alahdab, F. (2016). New evidence pyramid. *Evidence-Based Medicine, 21*(4), 125–127. https://doi.org/10.1136/ebmed-2016-110401

National Library of Medicine. (n.d.). *Why are some article titles in PubMed enclosed in square brackets?* NLM Support Center. Retrieved October 29, 2026, from https://support.nlm.nih.gov/knowledgebase/article/KA-04936/en-us

Oermann, M. H., Nicoll, L. H., Ashton, K. S., Edie, A. H., Amarasekara, S., Chinn, P. L., Carter-Templeton, H., & Ledbetter, L. S. (2020). Analysis of citation patterns and impact of predatory sources in the nursing literature. *Journal of Nursing Scholarship, 52*(3), 311–319. https://doi.org/10.1111/jnu.12557

Oermann, M. H., Nicoll, L. H., Carter-Templeton, H., Woodward, A., Kidayi, P. L., Neal, L. B., Edie, A. H., Ashton, K. S., Chinn, P. L., & Amarasekara, S. (2019). Citations of articles in predatory nursing journals. *Nursing Outlook, 67*(6), 664–670. https://doi.org/10.1016/j.outlook.2019.05.001

Oermann, M. H., Wrigley, J., Nicoll, L. H., Ledbetter, L. S., Carter-Templeton, H., & Edie, A. H. (2021). Integrity of databases for literature searches in nursing: Avoiding predatory journals. *Advances in Nursing Science, 44*(2), 102–110. https://doi.org/10.1097/ANS.0000000000000349

Piper, S., & Stokes, P. (2020). The conceptual framework and the iterative elements of doctoral nursing research design. *Nurse Researcher, 28*(3), 10–15. https://doi.org/10.7748/nr.2020.e1683

Piwowar, H., Priem, J., Larivière, V., Alperin, J. P., Matthias, L., Norlander, B., Farley, A., West, J., & Haustein, S. (2018). The state of OA: A large-scale analysis of the prevalence and impact of Open Access articles. *PeerJ, 6*, Article e4375. https://doi.org/10.7717/peerj.4375

Prinsen, C. A. C., Mokkink, L. B., Bouter, L. M., Alonso, J., Patrick, D. L., de Vet, H. C. W., & Terwee, C. B. (2018). COSMIN guideline for systematic reviews of patient-reported outcome measures. *Quality of Life Research, 27*(5), 1147–1157. https://doi.org/10.1007/s11136-018-1798-3

Rethlefsen, M. L., Brigham, T. J., Price, C., Moher, D., Bouter, L. M., Kirkham, J. J., Schroter, S., & Zeegers, M. P. (2024). Systematic review search strategies are poorly reported and not reproducible: A cross-sectional metaresearch study. *Journal of Clinical Epidemiology, 166*, Article 111229. https://doi.org/10.1016/j.jclinepi.2023.111229

Rethlefsen, M. L., Kirtley, S., Waffenschmidt, S., Ayala, A. P., Moher, D., Page, M. J., Koffel, J. B., & PRISMA-S Group. (2021a). PRISMA-S: An extension to the PRISMA Statement for Reporting Literature Searches in Systematic Reviews. *Systematic Reviews, 10*, Article 39. https://doi.org/10.1186/s13643-020-01542-z

Rethlefsen, M. L., Kirtley, S., Waffenschmidt, S., Ayala, A. P., Moher, D., Page, M. J., Koffel, J. B., & PRISMA-S Group. (2021b). PRISMA-S: An extension to the PRISMA Statement for reporting literature searches in systematic reviews. *Journal of the Medical Library Association, 109*(2), 174–200. https://doi.org/10.5195/jmla.2021.962

Salvador-Oliván, J. A., Marco-Cuenca, G., & Arquero-Avilés, R. (2019). Errors in search strategies used in systematic reviews and their effects on information retrieval. *Journal of the Medical Library Association, 107*(2), 210–221. https://doi.org/10.5195/jmla.2019.567

Sandberg, J., & Alvesson, M. (2011). Ways of constructing research questions: Gap-spotting or problematization? *Organization, 18*(1), 23–44. https://doi.org/10.1177/1350508410372151

Terwee, C. B., Jansma, E. P., Riphagen, I. I., & de Vet, H. C. W. (2009). Development of a methodological PubMed search filter for finding studies on measurement properties of measurement instruments. *Quality of Life Research, 18*(8), 1115–1123. https://doi.org/10.1007/s11136-009-9528-5

University of Melbourne Library. (n.d.). *Non-English language and translated sources (APA 7)*. Re:cite. Retrieved October 29, 2026, from https://library.unimelb.edu.au/recite/referencing-styles/apa7/referencing-non-english-sources

Walters, W. H., & Wilder, E. I. (2023). Fabrication and errors in the bibliographic citations generated by ChatGPT. *Scientific Reports, 13*, Article 14045. https://doi.org/10.1038/s41598-023-41032-5

Wang, Y., & Li, W. (2023). The impostor phenomenon among doctoral students: A scoping review. *Frontiers in Psychology, 14*, Article 1233434. https://doi.org/10.3389/fpsyg.2023.1233434

Wineburg, S., & McGrew, S. (2019). Lateral reading and the nature of expertise: Reading less and learning more when evaluating digital information. *Teachers College Record, 121*(11), 1–40. https://doi.org/10.1177/016146811912101102

Wright, K., Golder, S., & Lewis-Light, K. (2015). What value is the CINAHL database when searching for systematic reviews of qualitative studies? *Systematic Reviews, 4*, Article 104. https://doi.org/10.1186/s13643-015-0069-4

Wu, T., Li, Y., Bian, Z., Liu, G., & Moher, D. (2009). Randomized trials published in some Chinese journals: How many are randomized? *Trials, 10*, Article 46. https://doi.org/10.1186/1745-6215-10-46

Xia, J., Wright, J., & Adams, C. E. (2008). Five large Chinese biomedical bibliographic databases: Accessibility and coverage. *Health Information and Libraries Journal, 25*(1), 55–61.

Yeh, M.-L., Chang, B.-Y., Dai, H.-D., & Chung, M.-H. (2025). Effect of training program on evidence-based practice competencies in hospital nurses in Taiwan: A quasi-experimental study. *The Journal of Nursing Research, 33*(5), Article e412. https://doi.org/10.1097/jnr.0000000000000701

Zotero. (2023, June 14). *Retracted item notifications with Retraction Watch integration* [Blog post]. https://www.zotero.org/blog/retracted-item-notifications/

中國醫藥大學. (2019). *論文寫作格式（碩士）* [Thesis formatting guidelines, master's]. https://www3.cmu.edu.tw/~aca64/sites/default/files/論文寫作格式201910-碩.pdf

國立臺灣大學圖書館. (n.d.). *學位論文授權常見問題* [Thesis authorization FAQ]. Retrieved October 29, 2026, from https://www.lib.ntu.edu.tw/doc/cl/authqa.pdf

國家教育研究院. (n.d.). *雙語詞彙、學術名詞暨辭書資訊網* [Bilingual and academic terms database]. Retrieved October 29, 2026, from https://terms.naer.edu.tw/

國家圖書館. (n.d.). *國家圖書館學位論文公開閱覽及延後公開處理原則* [National Central Library principles on public access and delayed release of theses]. Retrieved October 29, 2026, from https://vehicle.npust.edu.tw/wp-content/uploads/2021/03/國家圖書館學位論文公開閱覽及延後公開處理原則.pdf