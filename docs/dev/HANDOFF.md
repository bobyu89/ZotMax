# 交班事項（2026-10-29）

## 現在狀態

- **main = 0.39.0**（PR #47 已合併）。v0.39.0 release 已核對：asset sha256 `cdc82319…6b63` = updates.json 的 update_hash。
- **0.40.0 = 草稿 PR #48**（分支 `claude/nice-cerf-7tnr4g`）：https://github.com/bobyu89/ZotMax/pull/48
  - 程式、測試、xpi、updates.json 都已推上；本機 `npm test` 857/857 通過。
  - **CI 結果還沒看**：推上後還沒查過檢查狀態。
  - **README.md 和 DESIGN.md 還沒更新**（見下方「待辦 1」）。
- 計畫文件（Claude Docs）：https://claude.ai/artifact/FeCog2pWuFNeJHmiYWGHVM
- 痛點地圖儀表板：https://claude.ai/artifact/FoMxkWNYpeVZNewAHgeGs9

## 待辦（依序）

1. **補 0.40.0 文件**：依 `docs/dev/0.40.0-docs-notes.md`（各部分實作者寫的 README/DESIGN 需求、未解問題、審查修正）和 `docs/dev/0.40.0-design.md` 的「README/DESIGN changes」段，更新 README.md、DESIGN.md。**以程式碼為準**，筆記可能已被審查修正改掉。網頁版 site/search.html 的來源表要不要補 0.39.0 新增的三個來源（pubmed-sr、rnao、gin），一併決定。
2. **刪掉 `docs/dev/`**（或保留但不放進 release）：這個資料夾只是交班用，0.40.0 合併前移除，或改放到別處。
3. 查 PR #48 CI；全綠後等 BOB 說「合併」。
4. 合併流程（固定）：
   1. PR 標 ready → squash merge（帶 `expectedHeadSha`）。
   2. 等 release workflow 跑完，核對 v0.40.0 asset 的 sha256 = updates.json 的 update_hash。
   3. 重開分支：`git fetch -q origin main claude/nice-cerf-7tnr4g && git checkout -q -B claude/nice-cerf-7tnr4g origin/main && git merge -q -s ours --no-ff origin/claude/nice-cerf-7tnr4g -m "Restart … after #48"`（加 Co-Authored-By 與 Claude-Session trailer），push。
   4. 取消訂閱 PR。
5. **下一版 0.41.0**（計畫文件「0.41.0：證據完整性」）：
   - G 撤稿旗標第一階段（`Zotero.Retractions` 包 try、frontmatter、⛔、PRISMA `retractedIncluded`、增量同步要能改舊筆記的受管理 frontmatter）
   - H 基準文獻回收率與引文追蹤輪次（不做 capture–recapture）
   - I PICO 檢索詞表（Entry Terms 取自 esummary `ds_meshterms`）
   - J 機器人「臨床指引」層級與「可能影響 GRADE」標記
   - 規格與審查意見：`docs/dev/roadmap-research-report.md`（第 3 節）與 `docs/dev/proposals-and-verdicts.md`（#1、#9、#16、#4／#18 的保留部分）。
   - 做法沿用 0.39.0／0.40.0：一位 agent 先寫設計與檔案分工 → 分批實作 → 每部分兩位審查者（正確性、規格／教練原則）→ 修正 → 補文件 → 改版號、`npm run build`、刪舊 xpi、`npm test` → commit、push、草稿 PR、訂閱。

## 0.40.0 需要 BOB 確認的事

- 華藝的「護理雜誌」和 PubMed 的「Hu li za zhi」期刊名不同，「期刊＋年＋卷＋起始頁」比對不到，只能靠 DOI 或標題（0.39.0 遺留）。要不要加中英期刊對照表？
- 0.40.0 實作者的未解問題列在 `docs/dev/0.40.0-docs-notes.md` 各部分的 OPEN QUESTIONS。

## 固定規則（提醒接手的人）

- 回覆 BOB：繁體中文、結論先行、醫學術語保留英文；AI 是教練不是代筆；每個功能都有開關；學術內容附 APA 文獻。
- 只推到 `claude/nice-cerf-7tnr4g`；不 force-push；BOB 說「合併」才合併；不改已發布的 updates.json 條目。
- repo 已改名為 bobyu89/ZotMax，MCP 呼叫仍用 repo 名 `zotero-bridge`。
- Commit 結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 和 `Claude-Session:` trailer；repo 內不寫模型名稱。
- 範例圖與 artifact 只用虛構資料，不用 BOB 的真實資料。
