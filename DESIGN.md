---
name: ZotMax
description: Zotero 10 外掛的設定頁、項目窗格的 ZotMax 面板與工具列按鈕：在 Zotero 自己的視窗裡，像學長姐的提點一樣安靜、清楚。
colors:
  # The plugin defines no colors of its own: every value is one of Zotero's theme variables, so light
  # and dark themes come for free. Hex values are Zotero's light theme, for reference only.
  text: "var(--fill-primary)"
  text-muted: "var(--fill-secondary)"
  line: "var(--fill-quinary)"
  tint: "var(--fill-senary)"
  surface: "var(--material-background)"
  accent: "var(--color-accent)"
  marker-ai: "var(--accent-orange)"
  marker-network: "var(--accent-blue)"
typography:
  body:
    fontFamily: "inherit (Zotero's UI font)"
    fontSize: "1em (follows Zotero's font size setting)"
    fontWeight: 400
    lineHeight: 1.4
  section-title:
    fontSize: "Zotero's h2"
    fontWeight: 600
  group-title:
    fontSize: "1em"
    fontWeight: 600
  label:
    fontSize: "1em"
    fontWeight: 600
  hint:
    fontSize: "0.92em"
    fontWeight: 400
    lineHeight: 1.4
  marker:
    fontSize: "0.85em"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "6px"
spacing:
  "1": "0.25em"
  "2": "0.5em"
  "3": "0.75em"
  "4": "1em"
  "5": "1.5em"
components:
  preset-option:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0.5em 0.75em"
  preset-option-selected:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  feature-row:
    textColor: "{colors.text}"
    padding: "0.5em 0"
  marker-tag:
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    padding: "0 0.45em"
  more-summary:
    textColor: "{colors.text-muted}"
  settings-tab:
    textColor: "{colors.text-muted}"
    rounded: "4px 4px 0 0"
    padding: "0.5em 0.75em"
  settings-tab-selected:
    textColor: "{colors.text}"
    # plus a 2px {colors.accent} rule under the label
  search-match:
    # the system find colours, the one exception to the borrowed palette (no hex, theme-aware)
    backgroundColor: "Mark"
    textColor: "MarkText"
  toolbar-button:
    # Zotero's own `.zotero-tb-button` rules in #zotero-items-toolbar (a menu button); the plugin sets only the 20px icon
    textColor: "{colors.text-muted}"
    rounded: "5px"
    width: "40px"
    height: "28px"
  toolbar-menu-caption:
    textColor: "{colors.text-muted}"
    fontWeight: 600
  palette-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0.5em 0.75em"
  palette-result:
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0.5em 0.75em"
  palette-result-active:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  panel-part-summary:
    # a native <details> summary in the ZotMax panel; the peek next to it is {typography.hint} in text-muted
    textColor: "{colors.text}"
    fontWeight: 600
  panel-annotation:
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0.125em 0.25em"
  panel-annotation-hover:
    backgroundColor: "{colors.tint}"
    rounded: "{rounded.sm}"
  panel-chip:
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    padding: "0 0.45em"
  coach-difference:
    # one item where the AI answered differently, inside the open 文獻評讀表; a Hairline above, no box
    textColor: "{colors.text}"
    padding: "6px 0"
  setup-step:
    # one name in the 設定精靈's step list; the current one Ink with a 2px {colors.accent} rule, like settings-tab-selected
    textColor: "{colors.text-muted}"
    padding: "0.25em 0 0.5em"
  export-option:
    # a choice in the 匯出給 Gemini Notebook window: native checkbox, label, Pencil hint indented under it
    textColor: "{colors.text}"
    padding: "0.5em 0 0"
  setup-option:
    # a choice in the 設定精靈 (mode, where notes go): the preset-option component
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0.5em 0.75em"
---

# Design System: ZotMax

## Overview

**Creative North Star: "The Senior's Margin Note"（學長姐的邊註）**

The plugin lives inside someone else's house: Zotero's settings window, item pane and main toolbar. It never brings its own world. It borrows Zotero's typeface, colors, controls and spacing, and spends its one signature move on honesty: every feature says in one line what it does, and small markers say plainly when something calls an AI that costs money or goes online. The tone is a senior classmate leaning over to point at the right switch: direct, warm, never a sales pitch.

The surface is **Operate** mode. A nursing graduate student opens settings to get one thing done (connect the vault, add an API key, turn a feature on) and leaves. The page is a working settings pane first; density is moderate, scanning beats reading, and nothing moves unless state changes.

**Key Characteristics:**
- Zotero's own CSS variables for every color, so light and dark themes and high contrast follow automatically.
- Sizes in `em`, so Zotero's font-size setting scales the whole pane.
- Settings by workflow: a search box, then six tabs in research order (功能 · 同步 · 整理 · 找文獻 · 篩選與評讀 · AI); every section has a stable ID other code can open.
- Progressive disclosure twice over: sections of a switched-off feature disappear, and expert options sit behind a closed `<details>`.
- Standard controls only: native checkboxes, radios, buttons, XUL menulists. No custom switches, no modals; the plugin's own windows are the 文獻自動分類 and 中文文獻補強 reviews, the 匯出給 Gemini Notebook window, 快速指令 and the 設定精靈 (opened by itself once on a fresh install, otherwise on request), all non-modal.
- One command catalog: the toolbar menu, the right-click menus and 快速指令 show the same commands, in the same groups, with the same words; the ZotMax panel's 動作 runs a few of the same commands for one item.
- Traditional Chinese copy; method terms (PICO, MeSH, CASP, JBI, PRISMA) stay in English.

## Colors

A restrained, borrowed palette: neutral fills from Zotero, its accent for selection and focus, and two hues used only as small dots on markers.

### Primary
- **Zotero Accent** (`--color-accent`): the selected preset's border, focus rings. Never decoration.

### Neutral
- **Ink** (`--fill-primary`): labels, feature names, body text.
- **Pencil** (`--fill-secondary`): descriptions, hints, the preset status line, folded summaries. Meets 4.5:1 on Zotero's backgrounds.
- **Hairline** (`--fill-quinary`): dividers between feature rows and around preset options, marker borders, the item pane's tools divider.
- **Wash** (`--fill-senary`): hover and the selected preset's background.
- **Page** (`--material-background`): preset option background.

### Marker hues
- **Cost Orange** (`--accent-orange`): the dot on 「AI・要付費」.
- **Network Blue** (`--accent-blue`): the dot on 「連網」.

### Search match
- **Find Mark** (system `Mark` / `MarkText`): matches of the settings search, the same colours Gecko uses for find-in-page. System colours, not hex, so they follow forced-colours modes; the only colour the plugin doesn't take from Zotero.

### Named Rules
**The Words-First Rule.** A marker's meaning is in its words; the colored dot only helps scanning. Never color text with the marker hues (they fail contrast), and never rely on the dot alone.

**The Borrowed Palette Rule.** No hex values in the plugin's CSS except as `var()` fallbacks. If Zotero has a variable for it, use it.

## Typography

**Body Font:** Zotero's UI font (inherited; no web fonts, no CDNs).

**Character:** one family, weight does the work. 600 for names and titles, 400 for everything else, a slightly smaller size for help text.

### Hierarchy
- **Section title** (Zotero's `h2`, inside `<label>`): one per settings section, as in Zotero's own panes.
- **Group title** (600, 1em, hairline below): 整理與同步／找文獻／篩選與評讀／AI 輔助與寫作, and subsections inside 「AI 服務」. The tab names shown as dividers during a search use the same style in Pencil.
- **Tab** (400, 1em): Pencil; the selected tab Ink with a 2px Accent rule. Weight never changes with selection, so the row doesn't shift.
- **Label** (600, 1em): feature names, preset names.
- **Body** (400, 1em): control labels and Zotero's own `description`.
- **Hint** (400, 0.92em, line-height 1.4, Pencil): feature descriptions, preset descriptions, requirement notes. Measure capped at 46em.
- **Marker** (400, 0.85em): the cost and network tags.

### Named Rules
**The One-Line Rule.** Each feature gets exactly one sentence of description. If it needs two, the second belongs in the README.

## Layout

Single column, the width of Zotero's settings content area. The 功能 block, the search box and its status lines cap their text and rows at 46em so lines stay readable on wide windows. Spacing runs on a 0.25em step scale (0.25, 0.5, 0.75, 1, 1.5em): tight inside a row (0.25–0.5em), 0.5em between rows with a hairline, 1.5em above each feature group. Preset options sit side by side on wide panes and stack when narrower than about 32em (CSS grid `auto-fit, minmax(16em, 1fr)`).

In the item pane, the ZotMax panel has its own stylesheet (`sidepanel.css`, added to every main window and removed at shutdown) on the same 0.25em scale: 0.5em between the parts with a hairline, 0.5em inside a part, 0.25em inside a group. The rows other modules draw into it (status, screening, 文獻評讀表, search links) keep their small inline 2px/6px rhythm.

### Settings pane structure

Zotero's settings window already has a left sidebar of panes, so the plugin's own navigation runs horizontally inside its pane instead of adding a second sidebar: a search box, a row of tabs, then one panel at a time. Tabs follow the research workflow and the toolbar menu's groups; 功能 is always first.

| Tab (`data-zb-tab`) | Sections, in order (`data-zb-section`) |
|---|---|
| 功能 `features` | 功能 `features` |
| 同步 `sync` | Obsidian `obsidian` · Notion `notion` · 分流規則 `routing` · 自動同步 `autosync` · 閱讀狀態 `status` · 中文 APA `apaZh` · 參考文獻檔 `bibliography` |
| 整理 `organize` | 全文筆記 `fulltext` · 劃線顏色與意義 `colors` · 概念卡片 `concepts` · 文獻自動分類 `classify` |
| 找文獻 `search` | 醫學文獻快速搜尋 `searchLinks` · NCBI `ncbi` · PubMed 追蹤 `pubmedWatch` · 引文追蹤 `citationChase` |
| 篩選與評讀 `appraise` | 篩選 `screening` · PICO `pico` |
| AI `ai` | AI 服務 `ai` · 本月 AI 用量 `usage` · Gemini Notebook `geminiNotebook` |

- **Section IDs are an API.** Other code (the toolbar's command palette) links to them; `sync` names the 同步 tab itself (no single section is "sync"). Rename one only together with every caller.
- **Opening a section:** `ZoteroBridgePrefs.showSection(id)` selects the tab, scrolls the section to the top, gives it a 2-second Accent outline on a Wash background and moves focus to its heading. A section hidden because its feature is off opens 功能 instead, at the switch to turn on (or the switch it needs first), with one line under it: where the settings will appear, and 「前往設定」 once the switch is on. A tab ID opens that tab.
- **From outside the pane:** set the pref `extensions.zotero-bridge.prefs.pendingSection` to a section ID, then `Zotero.Utilities.Internal.openPreferences("zotero-bridge-prefs")`. The pane opens the section once it is on screen (also when it is already open) and clears the pref.
- **Remembered tab:** `extensions.zotero-bridge.prefs.lastTab`; a fresh profile opens on 功能.
- **Keyboard:** the tabs are an ARIA tablist with one tab in the Tab order; ← → move and select (wrapping), Home and End jump to the ends. Focus rings are 2px Accent (inset on tabs).
- **An empty tab** (every section switched off) keeps its place in the row and says which features would fill it, with 「前往「功能」」. Tabs never disappear, so positions stay stable.

### Search
- 「找設定」 (a visible label, a language-neutral placeholder of examples) filters all tabs at once: section titles, labels, descriptions, the labels XUL keeps in attributes (checkboxes, menus) and per-section keywords in English and Chinese (`data-search-strings-raw` on the heading). Matching ignores case, full/half width and accents; several words must all match.
- While searching the tabs step aside; matching sections show in pane order under their tab's name as a divider, matches are highlighted with Gecko's CSS highlights (labels kept in attributes: the whole control), folded `<details>` holding a match open for the search. One `role="status"` line counts the sections or says nothing matched and suggests other words.
- Sections of switched-off features that match are named in one line, each a button that goes to its switch.
- Esc (or clearing the box) brings the tabs back exactly as they were, folding again what the search opened.
- **Zotero's own settings search** (top of the window) walks every pane's text but skips `[hidden]` and `[no-highlight]`. So inactive panels are hidden with a class, never the `hidden` attribute; the search box, tabs and tab dividers carry `no-highlight`; and while Zotero's search has text the pane shows every tab's sections (our search and tabs step aside), returning to tabs when it is cleared or another pane is chosen. The keywords on each heading also work in Zotero's search.

## Elevation & Depth

Flat. Depth comes from hairlines and the wash tint, never shadows; Zotero's own panes are flat and the plugin matches them.

### Named Rules
**The Flat-By-Default Rule.** No `box-shadow` anywhere. A selected or hovered thing changes border color or background tint.

## Shapes

Gently rounded: 6px on preset options, 4px on markers, the PubMed watch boxes and focus outlines of summaries. Feature rows have no box at all, only hairlines between them; cards are not the container here.

## Components

### Preset options (研究生引導／進階)
- **Shape:** 6px radius, 1px Hairline border, Page background, 0.5em × 0.75em padding.
- **Content:** a native radio, the preset name (Label), one Hint sentence. The whole option is the radio's `<label>`.
- **Selected:** border turns Zotero Accent, background Wash (`:has(input:checked)`).
- **Hover:** Wash background, 150ms ease-out (none with reduced motion).
- **Focus:** a 2px Accent outline around the whole option (the radio's own outline is suppressed).
- **自訂:** not a choice: when the switches match neither preset, no radio is checked and the status line says 「目前：自訂」.
- **After choosing:** the status line says 「已切換到「…」。」 with a 「復原」 button that restores the previous switches; focus returns to the preset group.

### Feature row
- **Layout:** native checkbox, then the name (a `<label for>`), markers, one-line description, and a requirement note when blocked.
- **Separators:** a Hairline between rows; none inside a row.
- **Blocked (a required feature is off):** the checkbox is disabled but keeps its own value; the name turns Pencil; the note says 「要先打開「…」才會生效。」 and is wired with `aria-describedby`.

### Marker tags
- **Style:** 0.85em text in Pencil, 1px Hairline border, 4px radius, a 0.5em dot (Cost Orange or Network Blue).
- **Vocabulary:** 「AI・要付費」 for anything that calls an AI API, 「連網」 for anything that goes online on its own.

### Folded options (`.zb-more`)
- **Style:** a native `<details>`; the `<summary>` names what is inside (「更多搜尋設定：資料庫順序、隱藏、自訂資料庫」), Pencil until hovered or open.
- **Focus:** 2px Accent outline, 4px radius.

### Colour meaning rows (劃線顏色與意義)
- **Layout:** an ordered list, one row per Zotero colour: a 0.9em swatch (the annotation colour itself, set inline as data, with a Hairline ring so light colours stay visible on any theme), the colour name in Pencil, the meaning as a text input (labelled by the name), then 「上移」「下移」 buttons. Rows share the feature-row rhythm: hairline between rows, no boxes.
- **Order is meaning:** the list order is the order of the note's highlight groups and of the picks in 「重點」, so reordering is a first-class action, not a drag handle. Buttons at the ends are disabled; focus stays on the moved row.
- **Words-first:** the swatch never carries the meaning alone; the colour name and the meaning are always text.

### Full-text options (全文筆記)
- One lead sentence (what the note is and that it is rebuilt), the subfolder field, two checkboxes (trim before the AI; the Notion child page with its cost in API calls), and markitdown folded in a `.zb-more` with an honest hint: what it helps with (tables, forms) and what it doesn't do (headings, OCR).

### Section disclosure
- Every settings section (and sub-block) carries `data-zb-feature="<feature IDs>"`; it shows while any of those features is on and comes back the moment one is turned on. Sections that serve several features list them all (the NCBI block serves PubMed watch and search links).
- Every top-level section also carries `data-zb-section="<id>"` and sits in exactly one tab panel (see Settings pane structure).

### Live validation (`.zb-validate`)
- Under a textarea the plugin parses (文獻自動分類's rules and topics): what the parser makes of it, in Pencil at 0.92em, announced with `role="status"` and wired to the textarea with `aria-describedby`.
- **Error:** the words carry it (「第 3 行：少了右括號 )」), set in Ink at 600; the textarea gets `aria-invalid="true"` and an Ink border. No red text (it fails contrast on the dark theme), no icons.

### Review window (文獻自動分類, `classify-review.xhtml`)
The one place the plugin opens a window of its own: a non-modal Zotero dialog, because the user has to look over many items before anything is written. It uses the same borrowed palette and spacing as the settings pane (`classify-review.css`).
- **Head** (Zotero's sidepane material, Hairline below): a 600 title, one Pencil sentence that says the judgement is the user's and that nothing is removed, the target (「放在：我的文獻庫 › 自動分類」), notes about skipped dimensions as a plain list, then one row per dimension with its name (600), a count and 「全選」「全不選」 buttons.
- **List** (scrolls): one block per item, Hairline between blocks, the title in 600 and year · journal in Pencil. Suggestions sit in a two-column grid per dimension: the dimension name in Pencil on the left, native checkboxes on the right, each with the value (600 when ticked, Pencil 400 when not) and its source and confidence in Pencil (「規則推測・高｜標題有「randomized」」). Items without suggestions fold into one `<details>`.
- **Foot** (sidepane material, Hairline above): the live count as a `role="status"` line (「已勾選 12 項：會建立 4 個子分類，加入 10 筆」), then 「取消」 and 「套用」 (600). Esc cancels; a decision disables both buttons.
- **Focus:** the first checkbox gets focus; 2px Accent outlines on checkboxes, buttons and the folded list's summary.

### Review window (中文文獻補強, `zh-meta-review.xhtml`)
The second window of the same kind, for the same reason: many fields of many items are looked over before anything is written. It loads `classify-review.css` (tokens, head, list, foot, focus) and adds only the finding rows (`zh-meta-review.css`); the root carries both classes.
- **Head:** 「中文文獻補強：先看建議，再決定」 (600), one Pencil sentence (sure fixes are ticked, the rest is the user's call, nothing is looked up online, where to undo), then two native buttons, 「只勾有把握的」 and 「全部取消勾選」.
- **List:** one block per item with something to check (title 600; year · journal · item type in Pencil). Each finding is a row in a three-column grid: a native checkbox (an empty cell of the same width for missing data, which has nothing to apply), the field (600) and the problem as its label, and a marker-tag chip with the confidence in words: 「有把握」 (Ink), 「請確認」 or 「要你補上」 (Pencil). Under it, indented past the checkbox: 「current → suggested」 (the current value in Pencil, the suggestion 600 while ticked, 400 when not; 「（空白）」 for an empty value) and the why as a Pencil Hint. Chinese items with nothing to fix fold into one `<details>`; items that are not Chinese are only counted.
- **Foot:** the live count (`role="status"`: 「已勾選 6 項修正，會改動 1 篇文獻。另有 1 項資料要你自己補（不會自動填入）。」), 「取消」 and 「套用勾選的修正」 (600, disabled while nothing is ticked). Esc cancels; a decision disables both.
- **Words:** say what is wrong and what will be written, never 「錯誤」 about the user; uncertain fixes say what to check in the original (「請看原文」).

### Export window (匯出給 Gemini Notebook, `gemini-export.xhtml`, `gemini-export.css`)
The third window of the review kind, because a folder is about to be written and the user decides where and what goes in. It loads `classify-review.css` (tokens, head, list, foot, focus) and adds only its rows (`gemini-export.css`); the root carries both classes (`.zb-classify .zb-gemini`), about 620 × 600.
- **Head:** 「匯出給 Gemini Notebook」 (600), then one Pencil sentence that carries the promise: only a folder on this computer, nothing is uploaded, the user adds the files to Gemini Notebook themselves.
- **List:** three blocks with a Hairline between them, each with a 600 title. What: 「<collection or 選取的文獻>：12 篇文獻」, a Pencil line on what each file holds, the titles folded in a `<details>`. Where: the destination path in a Hairline-bordered box (it wraps, never cut) beside a native 「選擇資料夾…」 (Zotero's FilePicker), then 「會在這裡建立「Gemini Notebook - … - date」資料夾。」 in Pencil. When the path is inside the user's synced Google Drive: a marker-tag badge (Hairline border, Wash tint, Ink) 「這個資料夾會同步到 Google 雲端硬碟」, a Pencil hint that Drive needs a moment to sync before the files show in Gemini Notebook's 新增來源 → Google 雲端硬碟, and with several Drive accounts a native select 「偵測到 n 個 Google 雲端硬碟帳號，用這個：」. Under it one native quick switch: 「改存到下載」 in Drive, 「改存到 Google 雲端硬碟」 when Drive was found but the folder is elsewhere; it changes this export only. Also: two native checkboxes in a two-column grid, each with its label and a Pencil hint (`aria-describedby`): 「也複製 PDF（n 篇有 PDF 檔）」 (off by default; disabled when there is no PDF) and 「加入「我的劃線與評讀」」 (off by default).
- **Source count:** one `role="status"` line under the options, recounted on every tick: 「會產生 n 個來源檔案；Gemini Notebook 每本筆記本約 50 個來源（依方案而異）。」 Over the cap (設定 → AI → Gemini Notebook) the words say so and what to do, set in Ink at 600; no red, no icon.
- **Foot:** 「只寫入你電腦上的檔案。」, then 「取消」 and 「匯出」 (600, disabled without a folder). Esc cancels; a decision disables the buttons. Focus starts on 「匯出」.
- **Destination:** a folder the user picked (選擇資料夾… or 設定) > `My Drive/ZotMax/Gemini Notebook` when Google Drive for desktop is found and 「偵測到 Google 雲端硬碟時，預設匯出到雲端硬碟」 is on (created on export) > Downloads. Only picked folders are remembered. Detection only checks that Drive's own folders exist; nothing inside Drive is read.
- **After:** a native `confirmEx`: where the folder is, how many files to upload (in Drive: where to find it under 新增來源 → Google 雲端硬碟, and that Markdown and PDF are snapshots that don't auto-update), the notes (scans with only an abstract, PDFs that couldn't be copied, over the cap), 「沒有上傳任何東西」, and 「打開資料夾」 (default) / 「關閉」.
- **Files:** `Author Year - Short title.md` per item (the bibliographic head, then the full text from the 全文筆記 pipeline, or the abstract with the reason), `00 參考文獻（APA 7）.md`, `01 我的劃線與評讀.md` (only when ticked and the user has highlights or a form of their own; labelled as the user's notes), the PDFs when ticked, `README - 如何加入 Gemini Notebook.txt`. The README and the dialog say plainly that uploading hands the papers to Google and that AI answers must be checked against the papers; in Drive the README's steps add the files from Google Drive (with 上傳檔案 as the fallback) and say that only Google Docs, Sheets and Slides auto-update.

### PICO windows (PICO 問題卡 `pico-card.xhtml`, 匯出 PICO 表 `pico-table.xhtml`, `pico.css`)
Two more windows of the review kind. The card is a form the user fills, so it is a window and not a prompt; the table export decides a destination and what goes in, like the Gemini export. Both load `classify-review.css` (tokens, head, list, foot, focus) and `gemini-export.css` (the folder row, the options), and add only their own rows (`pico.css`); the root carries the three classes (`.zb-classify .zb-gemini .zb-pico`), about 640 × 720 and 620 × 640.
- **Card head:** 「PICO 問題卡：<collection or 我的文獻庫>」 (600), one Pencil sentence: the question is the user's, the hints are coaching, nothing calls an AI or goes online.
- **Card list:** 問題類型 (a native select; the labels and hints follow it: 治療／預防, 診斷, 預後, 病因／危害, 意義／經驗 with PICo wording). 要素: one field per element (a 600 `<label for>`, a native textarea or input in a Hairline box with the Accent focus ring, one coaching question under it in Pencil, wired with `aria-describedby`), then 時間（T） and 我的情境, both optional. 完整的問題句: a textarea, a native 「用欄位組一句」 button (fills the sentence from the elements; the user edits it) and, while the sentence is empty, 「建議起點：…」 in Pencil. 聚焦檢查: a plain list with `role="status"`, warnings in Ink at 600 (a missing element, the same intervention and comparison, no sentence), hints in Pencil (a few-character population, two interventions on one card, more than three outcomes, no English words, no setting); one Ink line when nothing is left. 帶到資料庫搜尋: the search strings (English words; the fields as written) in Hairline monospace boxes that wrap, the skipped elements in Pencil, then native buttons: 複製英文檢索式／複製原文檢索式 and one per database (search-links.js targets; 「（複製）」 when the site has no search URL); with 醫學資料庫搜尋連結 off, one Pencil line says where to turn it on.
- **Card foot:** a `role="status"` line (how many items still to fill, or that it can be saved), 「刪除這張卡」 on the left (hidden for a new card), 「取消」, 「儲存」 (600, disabled while the card is empty). Esc cancels; a decision disables the buttons. Focus starts on P.
- **Table head:** 「匯出 PICO 表」 (600), one Pencil sentence: the values are the AI note's prefills, marked as such; checking is the user's; no AI call.
- **Table list:** What: 「<scope>：n 篇文獻」, a Pencil line (screening started → only the full-text-included studies; how many rows have no AI data), the titles folded. 本題 PICO: the question (600) and the elements as a definition list, with the word-match caveat in Pencil; without a card, one Pencil line says there is none and where to make one. Where: the path box and 「選擇資料夾…」 as in the export window, then where it goes and that the note's managed block is rewritten with 「✍️ 我的筆記」 kept. 也產生: native checkboxes with Pencil hints: CSV (on), Word 版 HTML (on), 也更新 Notion 頁面 (on; shown only with a PRISMA parent page).
- **Table foot:** 「只寫入你電腦上的檔案。」 (or that Notion is written only when ticked), 「取消」 and 「匯出」 (600, disabled without a folder). Esc cancels. Focus starts on 「匯出」.
- **Destination:** the vault's Reviews folder (next to the PRISMA note, with wikilinks) > the folder from 設定 › PICO > Downloads. Only a picked folder is remembered, and only outside the vault.
- **After:** a native `confirmEx` with three buttons: 「打開資料夾」 (default), 「複製成表格」 (the card and the table as HTML on the clipboard, with a tab-separated text fallback, so Word pastes a table), 「關閉」. The text lists the files, the rows without data, that the values are the AI's prefills, and that there is no 對照本題 column without a card.
- **Files:** `<scope> PICO 表.md` (frontmatter `type: pico-table`, the card's elements, the counts; a managed block with the info callout, 本題 PICO, the table, the word-match legend, the studies without data; 「✍️ 我的筆記」), `.csv` (UTF-8 BOM, every column), `.html` (a plain document Word opens as a table). The PRISMA note of a collection with a card gets a 「本題 PICO」 section ahead of the counts.
- **Words:** 對照本題 is always called a word match (✓ shared words, ？ none, — no data), never a verdict; every table says the values are the AI's prefill and that the user checks them against the paper.

### GRADE window (`grade.xhtml`, `grade.css`, `content/grade.js`)
- **Root:** `.zb-classify .zb-pico .zb-grade` — the review window's head, list and foot, the PICO fields, checks and chips; grade.css adds the outcome card.
- **Head:** 「GRADE 證據確定性：<scope>」, one Pencil sentence: start by design, every step the user's with a reason, hints are reminders, no AI.
- **研究問題:** a textarea prefilled from the PICO card, and the count of studies by design.
- **結果指標:** an input + 加入, then chips (the card's O first, then the AI notes' common outcomes, with paper counts); at most 7.
- **Outcome card** (Hairline border, `--zb-radius-sm`): title row `n. name` · the live rating in 600 (「⊕⊕◯◯ 低（從「高」開始；偏誤風險 −1…）」) · 刪除; a label · field grid (名稱, 重要性, 起始); the studies as checkboxes in a scrolling Hairline box with design, N, appraisal and direction in Pencil; 相對效果, 絕對效果, 參與人數; five domain rows (label · level select · reason input, then the GRADE question and 「提示：…」 in Pencil); 升級 rows only while the start is observational; 備註; the checks list (warn in 600, info in Pencil).
- **Foot:** the summary line; 取消 · 儲存 · 儲存並匯出證據摘要表 (primary; disabled without a named outcome). Esc cancels.
- **Files:** `<scope> GRADE 證據摘要.md` (`type: grade`, the outcomes' certainty in the frontmatter; a managed block with the info callout, 研究問題, the Summary of Findings table with footnote letters and the legend, the evidence profile, the included studies' appraisals, notes; 「✍️ 我的筆記」), `.csv` (every domain and reason), `.html` (SoF and profile for Word). Where the PICO 表 goes.

### Toolbar button (`content/toolbar.js`, `toolbar.css`)
The mouse way into every command, next to the items it acts on. It is a guest in Zotero's own toolbar, so it borrows everything and adds only its icon.
- **Place:** the items toolbar (`#zotero-items-toolbar`, above the item list), right after Zotero's 「新增筆記」: that row holds the buttons that act on the selected items, before the search box. Not the tab bar (window-level: tabs, sync) and not the collections toolbar.
- **Shape and states:** a XUL `toolbarbutton` with Zotero's `zotero-tb-button` class, `type="menu"` and a dropmarker, so size (40 × 28px), 5px radius, hover (Hairline fill), active and open (`--fill-quarternary`), disabled and the focus ring are Zotero's own rules. `toolbar.css` sets only the icon: `bridge.svg` as `list-style-image`, filled with `currentColor` through `-moz-context-properties`, drawn at Zotero's 20px. No colors of its own, so light, dark and high-contrast themes follow the neighbouring buttons.
- **Name:** tooltip and `aria-label` 「ZotMax」 (the product name, the same in every language); no visible text, like its neighbours.
- **Keyboard:** Zotero's toolbar is one arrow-key row (`tabindex="-1"` on every button); the button joins it: ArrowRight from 「新增筆記」 reaches it, ArrowLeft goes back, Tab goes on to the search box. Enter, Space and ArrowDown open the menu.
- **Menu:** 「快速指令…」 first (with its shortcut as accelerator text) and a separator, then the catalog's groups in the order of the research workflow, each under a caption (Label weight 600, Pencil; a XUL `menucaption`, never clickable): 同步 → 整理 → 找文獻 → 篩選與評讀 → AI 輔助與寫作, separated by native separators, then 「回報問題…」「試用回饋…」 under a separator, 「設定精靈…」 and 「設定…」 always last. Commands with variants (篩選所選文獻, 在醫學資料庫搜尋) are a submenu, filled each time it opens; nothing goes deeper than that. No icons in the menu: the button carries the only one.
- **Live:** checked each time the menu opens: entries of switched-off features hide, conditional entries (繼續／停止／放棄同步, 復原上次分類, 檢查／取消 AI 批次) appear only when there is something to do, and a group with nothing left hides with its caption. The switch 「工具列按鈕」 hides the button itself without a restart; 快速指令 stays available.
- **Selection:** commands act on the items selected in the list; collection commands (找重複, PRISMA, 評讀總表, 引文追蹤納入研究, 匯出此分類的參考文獻) on the collection selected on the left; with nothing suitable selected they say so in the same words as everywhere else (「請先選取文獻。」).

### Command catalog (`content/commands.js`)
The single list of everything the plugin can be asked to do; every surface is generated from it, so a command reads and acts the same wherever it is found.
- **Entry:** id, l10n ID and its zh-TW label (identical to the FTL), workflow group, the feature switches that show it (any of them), what it acts on (selected items, the selected collection, either, or nothing), the right-click surfaces it belongs to, an extra live condition (a batch to resume, a run to undo), Chinese and English search keywords, and the function it runs, or variants (decisions, databases, exclusion reasons).
- **Surfaces:** the toolbar menu and 快速指令 offer every command, plus 「設定精靈…」 (outside the groups, never switched off: next to 設定… in the menu, first in 快速指令's 設定 group) and 「回報問題…」「試用回饋…」 (the same, right before 設定精靈…); the ZotMax panel's 動作 a fixed few item commands (with short labels of their own); the item menu the ones that act on items; the collection menu the ones that act on a collection; the Tools menu only 「ZotMax 設定…」, 「ZotMax 快速指令…」 and the batch entries while they apply.
- **Settings destinations:** the sections of the settings pane by their stable IDs (`features, sync, obsidian, notion, routing, autosync, status, apaZh, bibliography, concepts, fulltext, colors, classify, searchLinks, ncbi, pubmedWatch, citationChase, screening, pico, ai, usage, geminiNotebook`), opened through `prefs.pendingSection`, which the pane reads.

### Right-click menus (`content/menus.js`)
- **One entry each:** the item menu and the collection menu hold exactly one 「ZotMax ▸」 submenu (the plugin's icon), never a row of separate plugin entries.
- **Inside:** the same groups as the toolbar menu: a caption per group (a disabled item with the caption's class, so `toolbar.css` gives it the Label weight in Pencil), a native separator between groups, none above the first. Variants are one submenu deep, so nothing is more than two levels below 「ZotMax」.
- **Live:** decided in each entry's `onShowing`: switched-off commands, empty groups and an empty submenu hide; the collection submenu needs a real collection (not My Library, a saved search or the trash).

### Command palette (快速指令, `palette.xhtml`, `palette.css`, `content/palette.js`)
The keyboard way to everything, and the way to find a feature by name. A non-modal Zotero window (about 560 × 460) with the same borrowed palette, spacing and flat surfaces as the review window. Always available: it is core navigation, not a feature with a switch.
- **Open:** the toolbar menu's first entry, Tools → 「ZotMax 快速指令…」, and Ctrl+Shift+P (⇧⌘P on macOS) in the main window. Neither Zotero 10 nor Firefox 140 binds it (Firefox's private-window key is a browser shortcut Zotero doesn't load); the plugin leaves the key alone when one of Zotero's configurable Ctrl/Cmd+Shift shortcuts or a `<key>` in the window uses P. A second open brings the open palette to the front.
- **Head** (sidepane material, Hairline below): the label 「快速指令」 (600) above the search field (Page background, Hairline border, 6px radius, 1.1em text; the Accent border and 2px outline when focused). The field is a `combobox` controlling the result `listbox`, with `aria-activedescendant` on the active result.
- **Results:** with an empty query, every command under its group title (600, Pencil, 0.92em; more space above than below), 「設定」 destinations last; while typing, one ranked list with each result's group on its right (Pencil, 0.85em). The active result has the Wash background and a 2px Accent outline inset; no shadows. Hover moves the active result; a click chooses it.
- **Can't run now:** the name turns Pencil and a Hint line says why: switched off → 「到 設定 → 功能 打開『X』」 with a 「打開設定」 button (Enter does the same; the settings open at that switch), nothing selected → 「先選取文獻」／「先選取分類」／「先選取文獻或分類」 (Enter repeats it in the status line). Switched-off commands are listed so they can be found, never run.
- **Search:** label and keywords in Chinese and English; case-, width- (full-width letters) and space-insensitive; every word must match; substring first, then letters in order (prsma → PRISMA); a label the query covers more of ranks higher; settings destinations a little below commands.
- **Bottom** (sidepane material, Hairline above): a `role="status"` line (result count, 「沒有符合「…」的指令。…」, why a choice can't run) and the keys in Pencil: 「上下鍵選擇 · Enter 執行 · Esc 關閉」 and the shortcut.
- **Keys:** ArrowUp/ArrowDown move (wrapping), PageUp/PageDown by five, Enter chooses, Esc closes. Choosing closes the palette first; the command then runs on the main window's selection at that moment.

### Setup wizard (設定精靈, `setup.xhtml`, `setup.css`, `content/setup.js`)
From "just installed" to "first literature note synced" without the settings pane. A non-modal Zotero window (about 640 × 620) with the same borrowed palette, spacing and flat surfaces as 快速指令; the plugin's code draws everything into `#zb-setup`.
- **Opens:** by itself once, 1.5 s after the main window is ready (`uiReadyPromise`), on a profile that has never finished it (`extensions.zotero-bridge.setup.done` false) and has nothing configured (no vault, Notion database, stored key or other earlier use from features.js `PRIOR_USE`); a configured profile (an upgrade, a reinstall) is marked done silently and never sees it. On request from 「設定精靈…」 (toolbar menu, 快速指令) and 「開啟設定精靈」 at the top of 設定 → 功能. A second open brings the open one to the front; each opening gets a fresh window name.
- **Head** (sidepane material, Hairline below): 「ZotMax 設定精靈」 (600) with 「第 2 步，共 6 步」 (Pencil, 0.92em) on the same line, then the six step names as an ordered list (歡迎 · 選模式 · 筆記放哪裡 · AI（選填） · 試一次 · 完成), Pencil, the current one Ink with a 2px Accent rule under it and `aria-current="step"`, like the settings tabs. Not clickable: the order is the flow.
- **Body** (scrolls, measure 40em): the step's heading (1.3em, 600; focus moves to it on every step change), a lead sentence, then the step's controls. Choices (mode, where notes go) are preset options (the whole option is the radio's label; Accent border and Wash when checked; a 2px Accent outline around the option on focus); 「建議新手」 is a marker-tag chip. The fields of a choice sit under a Hairline with a 600 legend and appear only for that choice (Obsidian: folder field + 「選擇資料夾…」 (Zotero's FilePicker) and a live check line; Notion: three how-to steps, a text link to the site's illustrated steps, token (password field) and database link, 「測試連線」 with main.testNotion's lines under it). While there is a token and the link is empty, a Hairline-bordered Wash panel offers 「還沒有資料庫？讓 ZotMax 幫你建立」: 「找可以放資料庫的頁面」 lists the pages the integration can see as native radios (last edited first; one page is preselected only when it is the only one), 「在這個頁面建立資料庫」 (600) creates one database per click under the picked page, fills the link, saves it and runs 測試連線; then the panel goes away. No page shared: the three how-to-share steps and 「重新整理」. The settings pane has the same action as 「建立新的資料庫…」 next to the default database link (a native select prompt of the pages).
- **Words carry the state:** checks and errors are Pencil 0.92em lines (`role="status"`); an error is Ink at 600 with `aria-invalid` on its field, never red. Secrets are never shown back: a stored token or key reads 「已經存了一組…；留空就沿用。」.
- **AI step:** says it costs money and is optional before any field; 「先不用 AI」 is the prominent button (600), 「儲存並繼續」 stays disabled until a key is typed. The key is checked for its format only (no API call that costs money), stored with secrets.js, never logged.
- **試一次:** names the item (selected, else first in the list), 「同步這一篇」 runs the catalog's `sync-no-ai` (no AI, no cost), then one line where the note went and 「在 Obsidian 開啟」／「在 Notion 開啟」. Without a destination it says so and the button stays disabled.
- **完成:** where things are, as a list (toolbar button, ZotMax panel, 快速指令 with its shortcut, 設定 → ZotMax, how to reopen the wizard), then 「目前的設定」 (mode, notes, AI) and 「打開 ZotMax 設定」.
- **Bottom** (sidepane material, Hairline above): a `role="status"` line (what the step saved, or why it can't go on), then 上一步 on the left, 略過 and the primary 下一步 (600; 開始設定 on step 1, 完成 on the last) on the right, then one Pencil line: Esc closes and nothing is lost.
- **Writes:** only 下一步 (and 測試連線, 找可以放資料庫的頁面 (the token) and 在這個頁面建立資料庫 (the new database and its link)) write, and only that step's settings; 略過 and 上一步 write nothing. 完成, Esc and the window's close button set `setup.done`; Zotero quitting or the plugin shutting down closes the window without it.
- **Keys:** Tab through native controls (radios move with the arrow keys inside their group), Enter in a text field confirms the step, Esc closes. Focus rings are 2px Accent.

### 回報問題／試用回饋 (`content/report.js`, `.github/ISSUE_TEMPLATE/`)
A way to report a problem or answer the one-week trial questionnaire without knowing GitHub, and without sending anything of the user's research. No window of its own: a native confirm, then the browser.
- **Entry:** 「回報問題…」 and 「試用回饋…」, catalog commands outside the groups and never switched off, like 設定精靈…: in the toolbar menu between the groups and 設定精靈… (a native separator on each side), in 快速指令's 設定 group right after 設定精靈…, and as two buttons with one Hint line at the foot of 設定 → 功能 (the 「開啟設定精靈」 row's style).
- **回報問題:** a native `confirmEx` titled 「回報問題」: what will happen (the GitHub form opens, the environment is filled in, what happened is for the user to write), the privacy line (GitHub account needed; public; no literature, notes, API keys or paths), then the exact environment text that goes into the URL. Buttons: 「在瀏覽器開啟 GitHub」 (default), 取消, 「複製」 (copies the text and shows the dialog again with 「已複製…」 on top). Opens `issues/new?template=bug.yml&env=…` (an issue form prefills a field from the query parameter named after its `id`).
- **試用回饋:** the same confirm without 「複製」: about 5 minutes, only usefulness required, don't write unpublished data or patient information, and the version and mode it fills in (`template=feedback.yml&version=…&preset=…`, both `input` fields so they can be prefilled).
- **Environment text** (fixed zh-TW labels, read by the maintainer): versions, OS, locale, mode and the switches that differ from it, Obsidian／Notion／AI configured as 有設定／沒有, setup.done, the library as <100／100–1000／>1000, the last five ZotMax errors as `[file.js:line] message`. Every message goes through `scrub()`: the profile's own names, URLs (a known API host keeps its name), emails, tokens, Windows／UNC／macOS／Linux paths (also with spaces), relative paths and document names, Notion IDs and long keys, quoted text that isn't an identifier. The URL stays under 6000 characters (older errors go first, said in one line).
- **Issue forms:** `bug.yml` (你做了什麼, 發生了什麼事 (required), 你原本預期會怎樣, 截圖, 環境 with `render: text` so it shows as a code block, never as Markdown), `feedback.yml` (version, mode, the wizard's steps, features used, what confused, what to remove, usefulness 1–5 (the one required answer), keep using, free text), both opening with a bold line that the page is public; `config.yml` keeps blank issues and links the site's install wizard.

### ZotMax panel (`content/sidepanel.js`, `sidepanel.css`)
The paper at a glance, next to it: one section of Zotero's item pane, so it sits beside the selected item in the library and beside the PDF in the reader's side pane (ItemPaneManager sections appear in both; for an attachment or a note it shows the parent item, a standalone PDF has none). It is the literature note's 「重點」 brought back into Zotero, plus the item's state and its commands. Always available, not a feature switch: Zotero's own header collapses it and remembers that (`extensions.zotero.panes.<pane>.open`; the pane ID `zotero-bridge-ai-note` is kept from the earlier 「AI 文獻筆記」 section so that state survives).
- **Entry:** Zotero's side navigation gets the plugin's icon (`bridge.svg`, `context-fill`; zero-specificity `:where()` rules give it Pencil only where Zotero doesn't colour it), the header says 「ZotMax」 (the product name in every language) and carries one section button, 「⋯」 (`more.svg`): a native menu with 「快速指令…」 and 「ZotMax 設定…」, the catalog's own entries.
- **Parts, in order:** five native `<details>` (summary: the name in Label weight, the native disclosure marker in Pencil; while closed a Pencil 0.92em peek on the same line, cut with an ellipsis). 重點 and 動作 start open; what the user opens or closes is remembered for all items (`extensions.zotero-bridge.pane.open`, JSON). A part with nothing to show is left out (延伸搜尋) or hidden (狀態).
  1. **重點** — the note's 「重點」 as data (`core.keyPoints`, the same function `buildNoteSections` uses, so the panel never says something the note doesn't): the one-sentence take-away (Body), the facts line `design · N = … · CEBM … · JBI … · 評讀：…（已核對／待核對／AI 初評）` (600), 「主要發現」 (Label) with 2–3 bullets. Then the links line (as in the note's 重點): 「在 Obsidian 開啟筆記」「開啟全文筆記」「在 Notion 開啟」, each only when it exists, read from the literature note's frontmatter. Last, the whole AI note folded in a `.zb-sp-more` `<details>` named 「完整 AI 筆記（model · date）」: headings 600 with space above, bullets, quotes with a 2px Hairline at the inline start; the take-away is not repeated. Peek: the take-away.
  2. **我的劃線** — one group per colour meaning, in the meanings' order (`core.annotationGroups`): a 0.75em swatch of the colour itself (ringed in Hairline, `forced-color-adjust: none`), the meaning (600), the count (Pencil); then the first three annotations as quiet full-width rows (quote shortened to 120 characters, or the kind in Pencil — 圖片註記, 手繪註記, 便利貼 — with its comment; the page in Pencil at the end). A row opens the PDF at that annotation (`Zotero.Reader.open(id, { annotationID })`); Wash on hover, Accent focus ring. 「全部顯示（n 則）」/「只顯示前幾則」 as a text button under a longer group. Peek: 「n 則」.
  3. **狀態** — the modules' rows as they are (reading status picker, screening with its title/abstract buttons, 文獻評讀表 with 開啟評讀表 and, with 評讀陪練 on, 對照 AI), each only when its feature is on; the 自動分類 sub-collections the item is in as read-only chips (marker-tag style, 「研究設計：RCT」); 「上次同步：2026-10-01 16:00」 (or 「還沒有同步到 Obsidian。」) in Pencil. Peek: 「已讀 · 標題摘要：納入 · 已核對 · 納入」. A Chinese item whose data needs a look (中文文獻補強) adds one line, 「中文資料：3 個地方要檢查」 (Label) with a native 「檢查並修正…」 button that opens the review window for this item, and the same words in the peek; nothing when there is nothing to check.
  4. **動作** — native buttons in a wrapping row (0.5em gap), generated from the command catalog: 同步, 同步，不呼叫 AI, 重新產生 AI 筆記 (only once there is a note), 自動分類…, 搜尋資料庫… (its variants as a native menu under the button), 引文追蹤, 對照 AI (評讀陪練), then 快速指令…. A command that can't run on this item yet (the catalog's `blocked()`: 對照 AI before the user answered every item) stays in place, disabled, its reason as the tooltip (a Fluent message whose `.title` is the reason). Short labels with the catalog's full wording as the tooltip. They run with [this item] as the selection, like the item's right-click menu. Switched-off commands are hidden, as in the toolbar menu and the right-click menus (the palette is the one place that lists them, because it is where features are found by name); a running command disables its button (`aria-busy`) until it finishes, then the panel refreshes.
  5. **延伸搜尋** — the search links row and the PICO row of search-links.js.
- **Empty states:** no AI note — 「這篇還沒有 AI 文獻筆記。」 + a Hint on cost + 「產生 AI 筆記」 (the catalog's 同步, which generates a missing note); AI notes switched off — one Hint 「…要打開：設定 → 功能。」 with 「打開設定」; no highlights — one Hint on what will appear, 「顏色的意義」 (to the colour settings) and 「開啟 PDF」.
- **Live:** one Notifier observer (items, item tags, collection membership, collections) refreshes the panels whose item, notes, attachments or annotations changed, debounced 250 ms; pref observers on every feature switch and the settings it shows; every sync run refreshes all panels. A refresh waits while focus is in a field of the panel (the 文獻評讀表), and happens when focus leaves it.
- **Multi-select:** Zotero shows its own multi-item view without item pane sections; the panel has nothing to do there.
- **Keyboard:** summaries, rows and buttons are native and in the Tab order; focus rings are 2px Accent. The swatch is decoration (`aria-hidden`); meanings and counts are words.

### 評讀陪練 in the 文獻評讀表 (`content/appraisal-coach.js`)
「先自己做，再看 AI」: an AI's answers to the same checklist, from the paper alone, shown only where they differ from the user's. It lives inside the open form (in the panel's 狀態), never in a dialog: the decision belongs next to the items it changes. It reuses the panel's classes, so it adds no CSS of its own.
- **Entry:** 「對照 AI」, a native button in the form's action row (and next to 「開啟評讀表」 while the form is closed). Disabled until every closed item is the user's own answer (an AI 初評 answer counts once clicked or after 我已核對); the reason is its tooltip and, inside the form, a Pencil hint under the actions that names the items still missing. While running: 「對照中…」, disabled, `aria-busy`, and a `role="status"` Hint on the wait.
- **Before the call:** the native confirm says what goes out (the full text or, said plainly, only the abstract; the tool's items), that the user's answers and notes don't, the estimated cost, and that the form is saved first.
- **Results** (`<section data-zb-coach>`, Hairline above, `aria-live="polite"`): a Label line 「評讀陪練（date · model）」, the summary 「13 題中 11 題一致，2 題不同（一致 85%）」 (Body), one Pencil Hint that the AI read only the paper and its answer is another view, not the standard answer; Hints for an abstract-only run and for dropped quotes (「原文核對不到，已略過 1 句 AI 引文。」).
- **A difference** (`coach-difference`, Hairline above, no box): the item (Label), 「你的答案：否　AI 的答案：是」 (the answers in 600), 「低可信（無原文佐證）」 as a marker-tag chip when no quote survived verification, 「AI 的理由：…」 (Hint), the verified quotes as `.zb-sp-ann` rows with the PDF page in Pencil (a click opens the reader at that page; a quote found only outside the PDF shows the AI's page as 「p. 3（AI 標示）」, not clickable). Then 「為什麼（選填）」 with a text field and two native buttons, 「保留我的判斷」 and 「改成 AI 的答案」. Once decided, the buttons give way to one Pencil line 「你保留了自己的判斷（date）：reason」 or 「已改成 AI 的答案（date）」.
- **Agreements:** folded in a `.zb-sp-more` `<details>` 「一致的題目（n 題）」 with the AI's reason and quotes, for transparency.
- **Words:** never 「正確」 or 「錯誤」 for the AI's answer; the user decides. The synced appraisal gets one line (「評讀陪練：一致 11/13，修改 1 題」), never the AI's answers.

### 統計解釋 (`content/stats-explainer.js`, switch 讀懂統計)
A part of the ZotMax panel, right after 重點, that exists only while the switch is on and the item has an explanation (or one is running); open by default, remembered like the others. Peek: the start of the latest selection.
- **Entry point:** the PDF reader's text-selection popup gets one button, 「ZotMax：解釋統計」, through `Zotero.Reader.registerEventListener("renderTextSelectionPopup", …)`. It wears the reader's own `toolbar-button wide-button` (the style of 「Add to Note」), so it looks like part of Zotero; no icon. 快速指令 has the same as 「解釋所選統計」 (the last selection in the reader tab on screen).
- **An explanation:** the selection as a `.zb-sp-quote` (2px Hairline at the inline start, Pencil, italic), 「回到 PDF 第 n 頁」 as a text link under it; then four sections, each a Label (600) and its content: **這是什麼** (a `<dl>`: the term 600, its meaning, 「在這段裡：」 in Pencil before the value), **這段在說什麼**, **臨床上代表什麼**, **要注意的地方** (bullets). A Hint line says the numbers were checked and the text has the last word, with model · date. Then native buttons in the 動作 row style: 「存到筆記」 (「已存到筆記」 and disabled once done) and 「再解釋得簡單一點」 (gone once there is a 簡單版, which follows the four parts after a Hairline, under the Label 「簡單版」).
- **Removed numbers:** a number the check took out reads 「［數字已移除］」 in Pencil, and the section it was in ends with one Pencil 0.92em line 「⚠ 這個數字不在原文裡，已移除」 (「⚠ 有 n 個數字…」). Words carry it; no colour.
- **History:** the latest explanation open, the four before it each folded in a `.zb-sp-more` `<details>` named 「date · start of the selection」.
- **States:** running — the quote and a `role="status"` Hint 「AI 解釋中…（預估約 US$0.01）」 with `aria-busy` (the estimate inline instead of a dialog; a dialog only above the threshold in 設定 → AI → 讀懂統計); 簡單一點 running — the button disabled with `aria-busy` and a Hint 「換個簡單的說法中…」; failed or no API key — one Ink 600 line (`role="alert"`, like live validation: no red) with 「打開設定」 when it helps and 「知道了」 to clear it; after 存到筆記 — a `role="status"` line under the buttons (saved, not synced yet, no vault).
- **Tone:** explain, don't judge: the copy says what a number means and what to watch for, never whether the paper is good.

## Literature note (Obsidian and Notion)

The synced literature note is a **Read** surface: the reader came back to a paper to find its point. The column is the user's vault theme; the plugin only decides structure, order and what is said once.

**North star: the ten-second glance.** Everything needed to remember a paper sits open at the top (a board of cards by default, one callout in the classic layout); everything long is folded below in a fixed, predictable order, so the eye learns where things are.

### 看板 (the default, `obsidian.layout` = `board`)
`> [!zm-board] 重點` (open) holds, in this order, each only when it has data:
- **Chips**: one line of inline code — design, `N = …`, setting, country, `CEBM …`, `JBI …`. Inline code reads as a pill even without the snippet.
- **Cards** as nested callouts with ZotMax's own types (unknown to Obsidian, so they fall back to the default callout look): `[!zm-summary|wide] 一句話`, `[!zm-pico] PICO` (bold P/I/C/O letters, not-reported values dropped), `[!zm-findings] 主要發現` (≤3), `[!zm-appraisal] 評讀` (the tool's Chinese name and state 已核對／評讀中／AI 初評，待核對; one light per scored item ✅❌❓➖⬜ in groups of five; a ▰▱ bar of 是 over the applicable answers; **整體**), `[!zm-highlights|wide] 我的劃線（n）` (one ▰▱ bar per colour meaning, then two shortened quotes with page links), `[!zm-next|wide] 下一步` (always: what this paper still lacks — PDF, OCR, AI note, highlights, appraisal, verification — or 「這篇的資料都齊了」).
- **Links line**: full-text note, Zotero, Notion, DOI.
- Bars are text (`▰▱`), so they read the same in Obsidian, Notion, plain Markdown and any theme. Lines inside a card end with two spaces (hard breaks), so Obsidian's 「Strict line breaks」 setting doesn't change them.

**The snippet** (`.obsidian/snippets/zotmax.css`, `content/obsidian-style.js`): the board on `--background-secondary` with a Hairline border and a 14px radius; its content a CSS grid (`auto-fit, minmax(min(100%, 230px), 1fr)`, 10px gap; one column on a phone); non-card content (chips, links) spans the row; cards flat on `--background-primary`, Hairline border, 10px radius, a 3px top rule in the card's colour; `|wide` cards span the row; chips as pills; `[!zm-kpi]` bold numbers at 1.9em with tabular figures; `[!zm-chart]` Mermaid SVGs shrink to the card, bars use tabular figures, and the sparkline (inline code) is set at 1.6em in the card colour without the code background. Each card type has its own `--callout-color` and Lucide `--callout-icon` (summary blue/quote, PICO green/target, findings amber/sparkles, appraisal violet/clipboard-check, highlights gold/highlighter, next rose/list-todo, KPI indigo/activity, chart teal/chart-column; the board slate/layout-dashboard). Only Obsidian's variables and these callout colours; no shadows. Installed and enabled once (`obsidian.styleInstalled`), refreshed while the file still starts with ZotMax's header; a copy the user edited or turned off is left alone.

**研究儀表板** (dashboard.js), same layout switch: a `[!zm-board] 總覽` right under the info callout with six `[!zm-kpi]` cards — 文獻 (n 篇, this week's additions), 已讀完成率 (%, bar, read／total), AI 筆記 (with／total, bar), 評讀已核對 (verified／total, bar, how many have any verdict), 待讀 (n 篇, data issues), 回顧專案 (n 個, included). Each card: the number in bold, then at most two short lines. The tables' 比例 column carries a ▰▱ bar before the percentage.

Then `[!zm-board] 圖表` with `[!zm-chart]` cards, each only when it has data: 研究設計 (a Mermaid `pie showData`), 證據等級（CEBM，1 最強） (bars, L1 on top like the pyramid), 出版年份 (bars, at most 12 rows, older years folded into 「≤ year」), 每月新增（近 12 個月） (the total, a one-line `▁▂▃▄▅▆▇█` sparkline in inline code, the range and the busiest month). Bars are scaled to the largest row and labelled with the count.

**🗺️ 證據缺口地圖** (both layouts, after 證據概況): a plain table, interventions (rows, ≤8) × outcomes (columns, ≤6) from the notes' `intervention`／`outcomes` frontmatter, split at 、，,;； and merged by the concept-card aliases. A cell is a heat square (⬜ 0, 🟨 1, 🟧 2–3, 🟥 ≥4), the count and the best CEBM level (`🟧 3・L1`); ⬜ marks a possible gap. Below: the legend, 「證據最多的組合」 (top 5 pairs with links), and a `[!warning]` that this is word-level grouping, not a systematic review. Fewer than two notes with I and O: one sentence on what is missing instead of a table.

**PICO 表 → 🔎 檢索詞建議** (pico.js): after the word-match legend, a table 詞 | 篇數 (▰▱ bar over the papers) | 已在問題卡 (✓) of the subject terms the papers carry as Zotero tags (MeSH qualifiers and `*` dropped; workflow tags `狀態/`, `篩選/`…, `_…` and MeSH check tags skipped), at most 15, terms on one paper only with fewer than four papers. The card window lists up to 8 terms the card lacks as copy buttons under the search links.

**首頁 and 主題頁** (topics.js, with the dashboard; pref `dashboard.topicPages`). Notes never move: a topic is a Zotero collection path from the notes' `collections` frontmatter, so a note in two collections is on two pages.
- `首頁.md` (`type: home`): info callout (Bookmarks／Homepage hint), the dashboard's `[!zm-board] 總覽`, `[!zm-board] 主題（n）` with one `[!zm-topic]` card per topic (title = wikilink to the page; rows: **n 篇** · 已讀 %, bar, 🧭 verdict (top／judged) · CEBM best, 📈 近 5 年 n 篇 ↑→↓, ➡️ the first next step, 📁 parent path), at most 12 cards then one line of links; the unfiled count; `## 🚀 快速入口`. Classic: `## 🗂️ 主題` as a table with the same columns.
- `主題/<path with ／>.md` (`type: topic`, `zotero_collection`, `studies`): info with ← 首頁 · 研究儀表板, `[!zm-board] 主題總覽` (文獻, 已讀, 最強證據, 證據說什麼; classic: one line), `## 🧭 證據說什麼` (verdict sentence, a 結論方向 table with bars, `### 依介入` table, `[!warning]` AI 初判 ≠ GRADE), `## 📈 趨勢` (last five years vs the five before, a bar per year with the year in inline code, common interventions and outcomes), `## 🕳️ 研究缺口與下一步` (≤6 rule-based steps in a fixed priority, then `### 🗺️ 證據缺口地圖`), `## 📚 文獻` (strongest level, then newest). A page whose collection lost its notes gets a `[!warning]` block instead; the user's part stays.
- The verdict: none judged → 尚無判斷; one → 僅 1 篇：<direction>; ≥⅔ one direction → 多數<direction>; else 結論分歧. Directions come from the AI note's `effect_direction` (有效／無差異／有害／不一致; null without a comparison group).
- `[!zm-topic]`: cyan, Lucide folder-open.

### Classic layout (`obsidian.layout` = `classic`)
1. **`> [!abstract] 重點`** (open). In this order, each part only when it exists:
   - **一句話**：the AI note's one-sentence summary.
   - One facts line: `design · N = … · CEBM … · JBI … · 評讀：… （已核對／待核對／AI 初評）` (a verified appraisal form wins over the AI's verdict).
   - **主要發現**：the first 2–3 top-level bullets of the AI note's 「主要結果」 (or its first two sentences).
   - **我的劃線**：up to three of the user's highlights, one per colour meaning first, in the meanings' order, each shortened to 140 characters with its meaning and page link.
   - A links line: full-text note, Zotero, Notion, DOI.
   - Empty state: one sentence saying what will appear here and how (highlight in Zotero, or generate the AI note).
2. **Folded callouts** (`> [!type]- title`, the same in both layouts), fixed order, own words before the AI's, reference material last:
   1. one `[!quote]-` per colour meaning with annotations, titled `🟡 重要發現（n）` (list items: highlight, page link; comment, image and tags indented under it)
   2. `[!note]- 我的 Zotero 筆記（n）`
   3. `[!example]- 文獻評讀表`
   4. `[!tip]- AI 標的重點（僅供參考）`: verified AI quotes, marked 🤖
   5. `[!note]- AI 文獻筆記（model · date）`: the full AI note without its summary, headings one level down
   6. `[!info]- 摘要（Abstract）`
   7. `[!search]- 🔎 延伸搜尋`
   8. `[!info]- 書目資訊` (authors, year, publication, DOI, APA 7)
3. Outside the markers, in the user's part: `> [!note]- 統計筆記`, created by the first 「存到筆記」 of 讀懂統計 at the end of the note and only appended to afterwards (each explanation: date · page with a link back to the PDF, the selection quoted, the four parts, a closing italic line on the number check). Because it is outside the markers, every re-sync keeps it as the user left it.
4. Sections without content are left out; nothing is said twice (the summary and the Zotero/Notion links live only in 重點; the full text is linked, never embedded).

### Word citation style (`content/styles/*.csl`, word-style.js)
Two CSL-M styles built by `scripts/csl.mjs` from Zotero's official APA 7 (CC BY-SA 3.0): `default-locale="en-US"` (English items stay English whatever the document language), `default-locale-sort="zh-TW"` (Chinese names by stroke count), a first sort key `zh-first` (`<if locale="zh">`), and `layout locale="zh"` for citation and bibliography that writes what apa-zh.js writes (test/word-style.test.cjs compares them through citeproc-js). Italic text variables sit inside an italic `<group>` (citeproc-js drops italics on a bare `<text variable="title">` in these layouts). Variants differ only in the delimiter between parts (「。」 or 「．」). Installed silently by the button or 快速指令; refreshed on startup only when already installed and the bundled `<updated>` is newer. The same files are served from the site (`site/styles/`).

### Notion
The managed container keeps the same order: 重點 as open blocks at its top, each folded section a **toggle**; highlight-group toggles take their colour's background (`yellow_background`…), the others stay default. Toggles go in their own requests (Notion nests two levels per request); 文獻評讀表's real table is inserted inside its toggle.

### Full-text note
`<note folder>/全文/<same name>.md`: frontmatter `fulltext_of` (never `zotero_key`, so indexes and Bases skip it), a two-line `[!info]` callout saying it is rebuilt on every sync and linking back, then the paper as Markdown. The user's highlights are `==🟡…==` in place (same colour mapping as the note); verified AI quotes are `🤖<u>…</u>` (underline, visibly secondary to colour, and it survives the Notion conversion as an underline). Highlights that can't be placed are listed at the end, never dropped.

### Named Rules
**The Ten-Second Rule.** If a reader needs to unfold anything to learn what the paper found and whether it is any good, 重點 is missing something.

**The Plain-Markdown Rule.** The board is built from callouts, inline code, bold and text bars only; the snippet arranges and colours it but never carries meaning, so a vault without the snippet, Obsidian Publish or a Markdown viewer still shows every fact in order.

**The Own-Words-First Rule.** The user's highlights, notes and appraisal come before anything the AI wrote; AI content is labelled as such and folded.

**The Preserve Rule.** Layout changes happen only between the markers; the user's text, 「✍️ 我的筆記」 and their frontmatter keys survive every re-sync, including the first re-sync into a new layout.

## Do's and Don'ts

### Do:
- **Do** take every color from Zotero's variables (`--fill-*`, `--material-*`, `--color-accent`, `--accent-*`), with a fallback in `var()`.
- **Do** write each feature as name + one sentence, and add 「AI・要付費」 or 「連網」 whenever it applies.
- **Do** give every control a visible label and a 2px Accent focus outline.
- **Do** keep l10n IDs in both `locale/zh-TW` and `locale/en-US`, with the zh-TW fallback text identical to the catalog in `content/features.js`.
- **Do** hide a switched-off feature's settings instead of disabling them in place.

### Don't:
- **Don't** load fonts, images or scripts from outside the plugin.
- **Don't** use shadows, gradients, or colored side stripes.
- **Don't** invent controls: no custom toggle switches, no modals for settings, no restyled toolbar buttons (the toolbar button uses Zotero's own class and states).
- **Don't** use emoji as icons in new UI; existing item-pane rows keep theirs (the search row's 🔎).
- **Don't** describe AI features as finding literature or writing for the user without saying the draft must be checked.
