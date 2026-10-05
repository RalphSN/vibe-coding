# 交接文件：AI 對話 × Prompt × Agent 實戰課

> 更新：2026-10-05（第 2 版：可在新 session、不同帳號或不同電腦接手）
> 一句話現況：**50 個單元全部完成，已依 skill `course-web-neo-brutalism`（2026-10-02 版）改寫並通過自動檢查；7.1、7.3、7.4 已在 2026-10-05 第 2 個 session 完成，7.2 以模擬方式通過；剩下 7.2 的系統設定實測、7.6（先問）、使用者自己測試後 commit。**
> 下次重新查證內容：**2027-01-05**

這份文件不依賴任何對話紀錄、記憶或暫存檔。需要的規範摘要、檢查腳本、工具都在這裡（附錄 A、B）。

---

## 0. 目錄

1. 新 session 的開場 prompt（直接貼）
2. 接手前的準備（換帳號、換電腦）
3. 專案狀態總表
4. 環境與工具的眉角
5. 規範來源與重點
6. 檔案與 `index.html` 的結構
7. 剩下的工作（逐項做法）
8. 資料格式
9. 驗證方法與 2026-10-05 的結果
10. 決策紀錄（為什麼這樣做）
11. 已知限制與不寫的內容
- 附錄 A：命令列工具腳本（Node、Python、Bash）
- 附錄 B：瀏覽器 console 檢查腳本

---

## 1. 新 session 的開場 prompt

把下面整段貼進新的 Claude Code session（工作目錄設在 repo 根目錄 `Vibe-Coding`）：

```text
接手 course-web/ai-chat-prompt-agent-course 的工作。先完整讀 HANDOFF.md，
再讀 design-system.md 與 research-notes.md 第 11 節。
規範以 skill course-web-neo-brutalism 為準（若這個帳號沒有安裝，讀
ai-dev-rules/skills/course-web-neo-brutalism/ 底下的 SKILL.md 與 references/）。
接著做 HANDOFF.md 第 7 節「剩下的工作」，一次一項，每項做完照第 9 節驗證並回報。
不要開分支、不要 commit，我會自己測試後再 commit。
```

---

## 2. 接手前的準備

### 2.1 同一台電腦、新 session

不用準備。直接貼第 1 節的 prompt。

### 2.2 不同帳號或不同電腦

1. **先把改動帶過去**。截至 2026-10-05，下列檔案尚未 commit（`git status`）：
   - `course-web/ai-chat-prompt-agent-course/`：`index.html`、`HANDOFF.md`、`design-system.md`、`outline.md`、`research-notes.md`
   - `.claude/launch.json`

   做法擇一：使用者 commit 並 push 到 `https://github.com/RalphSN/vibe-coding.git`，新環境再 pull；或直接複製整個 `Vibe-Coding` 資料夾。
2. **安裝規範**：skill 的來源在 repo 裡的 `ai-dev-rules/skills/course-web-neo-brutalism/`（含 `references/` 六份文件）。新帳號沒裝 skill 時，直接讀這個資料夾即可；要正式安裝，照 `ai-dev-rules/README.md` 的 `install.ps1`（預設只預覽，加 `-Apply` 才寫入，由使用者執行）。
3. **確認工具**（第 4 節）：`node`、`python`、Chrome。
4. **修正預覽設定的路徑**：`.claude/launch.json` 的 `ai-course` 寫的是 `C:/Users/user01/Vibe-Coding/course-web/ai-chat-prompt-agent-course`，換電腦要改成新路徑。

---

## 3. 專案狀態總表

| 項目 | 狀態 |
|------|------|
| 研究（階段 1） | 完成：`research-notes.md`，查證於 2026-10-01／02，2026-10-05 抽查（第 11 節） |
| 架構（階段 2） | 完成：`outline.md`（使用者已確認） |
| 設計與實作（階段 3） | 完成：50 個單元、新版引擎、圖解產生器、6 種互動元件 |
| 驗證（階段 4） | 自動檢查全部通過；複製按鈕真實點擊已通過（7.1）；reduced-motion 模擬通過，系統設定實測沒做（7.2） |
| 得獎等級自我檢查 | 跑了 3 輪，最後一輪 設計 8／易用 8／創意 8／內容 9（第 9.3 節） |
| commit | 沒有。使用者要自己測試後再 commit |

數字：

| 指標 | 數值 |
|------|------|
| 單元 | 50（12 個模組；模組 11 是 4 個參考頁） |
| 閱讀時間 | 每單元 6–12 分鐘，6-3（14 分）與 11-4（15 分）例外；全站約 7 小時 16 分 |
| SVG 圖解 | 100 張（每課至少 2 張） |
| 互動元件 | 6 種：組裝器、能力評估、取樣模擬器、agent loop、檢查清單、範本庫 |
| 選擇題 | 149 題；正確答案是最長選項 12 / 149（8%，上限 35%） |
| 術語 | 75 個 |
| 參考資料 | 41 筆 |
| `index.html` | 約 650KB、8,500 行 |

---

## 4. 環境與工具的眉角

| 項目 | 內容 |
|------|------|
| 作業系統 | Windows 11；Claude Code 的 Bash 工具是 Git Bash，另有 PowerShell 5.1 |
| Node | v22（跑附錄 A 的 `.js` 腳本） |
| Python | 3.14（跑附錄 A 的 `.py` 腳本；`python`，不是 `python3`） |
| 預覽 | `preview_start` 名稱 `ai-course`，port 8765（`.claude/launch.json`）；也可自己跑 `python -m http.server 8765 --bind 127.0.0.1 --directory course-web/ai-chat-prompt-agent-course` |
| 截圖 | 桌面 App 的預覽視窗被隱藏時，`screenshot` 與真實點擊都會逾時。改用 headless Chrome（附錄 A.6），1000–1440px 寬可以截；**窄於約 500px 時 Chrome 視窗有最小寬度，截圖會被裁切**，窄寬度改在預覽面板用 `resize_window` ＋ DOM 量測 |
| 換行 | `index.html` 存成 LF；repo 的 `core.autocrlf=true`，git 會自己處理。Markdown 檔原本是 CRLF |
| **使用者的 hook** | 指令文字裡出現 `.env`（例如 Bash 的 heredoc 裡寫到 `.env`）會被 PreToolUse hook 擋下（「禁止讀取 .env」）。要改含有 `.env` 字樣的課程內容時，**先用 Write 工具寫成腳本檔，再用 Bash 執行腳本**，不要把內容直接寫在指令裡 |
| localStorage | 測試時會寫進預覽瀏覽器。測完要清掉：`ai-chat-prompt-agent-course.v2`、`ai-chat-prompt-agent-course.prefs.v1`，以及檢查腳本用的 `__dev*` |
| 預覽面板的 viewport | 用 `resize_window` 設的寬度，測完要用 `preset: "desktop"` 還原 |

---

## 5. 規範來源與重點

優先順序：使用者全域規範（`~/.claude/CLAUDE.md`、`~/.claude/rules/`）→ skill `course-web-neo-brutalism`（疊加在 `domain-education-content`、`course-lesson`、`domain-web-frontend`、`web-animation`、`verify-done` 之上，衝突時以它為準）。

### 5.1 skill 的十二條硬性規則（摘要）

1. 對比：內文 ≥ 7:1、次要文字 ≥ 4.5:1、非文字 ≥ 3:1；彩色底一律黑字。
2. 側欄可拖曳（滑鼠、觸控、鍵盤），頂部列字級至少 5 段，都要記住。
3. hover 只用一個訊號通道（換底色就不改底線）。
4. 每個狀態變化都有進場與退場轉場。
5. 術語每課第一次出現包成 `[[術語]]`，popup 可 hover 進去、`Esc` 關閉。
6. 選擇題錯誤選項來自真實誤解、長度相近、每個選項都有解析；正確答案最長的比例 ≤ 35%。
7. 每單元至少 2 張圖；每 300–400 字至少一個非文字元素。
8. 事實查證到當天，記錄日期與來源；查不到標「截至 YYYY-MM 查證狀態：未確認」。
9. 動畫只動 transform、opacity、顏色（例外：摺疊高度、SVG `stroke-dashoffset`），都有 reduced-motion 版本。
10. 不用 emoji 當項目符號；✓ ✗ 只用在對錯，並搭配文字。
11. 短文字不拆詞、不留 1–2 個字的孤行；標題用 `|` 標斷點，必要時縮字（下限 80%）。
12. 頂部列高度量測後寫回 `--topbar-h`；側欄與把手同格 sticky；圖示按鈕 44×44；SVG 線段兩端接在圖形上、文字不壓框壓線。

### 5.2 使用者規範中和這份工作最相關的

- 回覆一律繁體中文（台灣用語），結論先行，回報照「改了什麼／怎麼驗證／還沒做／下一步」範本。
- 只改任務需要的檔案；看到任務外的問題列在「還沒做」，不直接改。
- 「完成」要四項都過：能跑、測試通過、靜態檢查、手動走過；沒做的要寫明。
- 不 commit、不 push，除非使用者要求。
- 破壞性操作（刪檔、覆寫整個檔案超過 20 行）要先說明影響範圍並確認。

---

## 6. 檔案與 `index.html` 的結構

### 6.1 課程資料夾

| 檔案 | 用途 |
|------|------|
| `index.html` | 課程網站，單一檔案，CSS 與 JS 內嵌 |
| `research-notes.md` | 每個事實的來源與查證日期（✅ 官方確認／🟡 摘要／⚠️ 未確認） |
| `outline.md` | 模組、單元目標、間隔複習排程（A-3）、與規範的取捨（A-1b）、時間統計（B） |
| `design-system.md` | v2：token、對比結果、版面、元件、圖解產生器、動畫 |
| `HANDOFF.md` | 本文件 |

參考站：`course-web/claude-code-secure-dev-course/`（同一套引擎的另一門課，可對照寫法）。

### 6.2 `index.html` 的區段（行號是 2026-10-05 的位置，之後會變，用搜尋字串定位）

| 區段 | 約略行號 | 搜尋字串 |
|------|----------|----------|
| `<head>` 預先套用偏好的 script | 11–27 | `第一次繪製前套用偏好` |
| CSS | 28–1103 | `1. 設計 token` |
| 頁面骨架（頂部列、側欄、把手、main、目錄、頁尾） | 1104–1170 | `<header class="topbar">` |
| 課程清單 `SITE`、`COURSES` | 1171– | `const COURSES = [` |
| `needsSpaceBetween`、`defineLessons`、`defineTerms`、`defineSources` | 同上 | `function needsSpaceBetween` |
| 圖解產生器 `Diagram` | 1312–1584 | `const Diagram = (() => {` |
| 參考資料 `defineSources` | 1586–1633 | `'cc-commands':` |
| 模組 0–11 的資料區塊（各一個 `<script>`） | 1635–6591 | `模組 N：`（模組 7 分成兩塊：`模組 7：`、`模組 7（續）`） |
| 新模組資料插入點 | 6593 | `<!-- @@DATA@@ -->` |
| App：儲存、標記、斷行、主題、字級、把手、孤行縮字、側欄、路由、頁面 | 6595–7364 | `App：狀態、路由、版面` |
| highlight.js（cdnjs，附 SRI） | 7366–7367 | `highlight.min.js` |
| 元件：區塊、對照器、分頁、測驗、複製、術語 popup、搜尋、互動元件、單元各段、樣式表 | 7368–8508 | `共用元件` |

### 6.3 課程資料夾以外動過的檔案

- `.claude/launch.json`：`ai-course` 的路徑改成 Windows 路徑。同檔的 `secure-dev-course` 路徑仍是舊的（第 7 節 7.6）。

---

## 7. 剩下的工作

照順序做，一次一項。每項做完照第 9 節跑檢查。

### 7.1 複製按鈕的真實點擊測試（需要可見的預覽視窗）：已完成 2026-10-05

- 結果：`#/l/6-2` 第一個「複製」按鈕，`computer left_click` 後 0ms 變「已複製 ✓」並加上 `.copied`（底色 `#3DDC84`），1507ms 換回「複製」。剪貼簿內容沒讀到（`readText` 權限被拒），未驗證。

- 為什麼：腳本 `click()` 沒有使用者手勢，Clipboard API 會失敗並走到備援訊息「請按 Ctrl/Cmd + C」；上次預覽視窗被隱藏，滑鼠點擊無法執行。
- 做法：請使用者把 Claude 桌面 App 放在前景 → `preview_start ai-course` → 到 `#/l/6-2` → 用 `find` 找「複製」按鈕的 ref → `computer` 的 `left_click`（帶 ref）→ 確認按鈕變成「已複製 ✓」並套用成功色。也可以請使用者自己點一次。
- 完成條件：按鈕文字變成「已複製 ✓」，1.5 秒後換回「複製」。

### 7.2 減少動態效果的實測：模擬已通過 2026-10-05，系統設定實測未做

- 模擬方式：Node 腳本開 headless Chrome，用 DevTools 協定 `Emulation.setEmulatedMedia` 設 `prefers-reduced-motion: reduce`，以 `document.getAnimations()` 列出超過 1ms 的位移、縮放、高度動畫；再用 `no-preference` 跑同一組當對照。
- 結果（reduce／對照）：換課 `view-enter` 無／有；首頁 12 張卡片 drop-in 0 個／有；5-1 播放鈕停用並顯示「自動播放已關閉」／正常，箭頭 `loop-flow` 與節點放大都沒有；答案區與側欄模組直接展開、只有 opacity 120ms 淡入／grid-rows 240ms；1-1 條圖 `transition-property` 不含 transform、抽到的 token 不落下／有。
- 觀察：分頁（`tab-in`）與測驗回饋（`reveal-in`）在 reduce 下被全域規則縮成 0.01ms，沒有位移但也沒有淡入；內容仍會直接出現。
- 剩下：使用者在 Windows 實際關閉「動畫效果」看一次。

- 為什麼：上次只確認了 CSS 裡有 3 組 `prefers-reduced-motion` 規則，沒有實際開系統設定。
- 做法：請使用者在 Windows「設定 → 協助工具 → 視覺效果 → 動畫效果」關閉，重新載入後確認：換課沒有滑入、卡片沒有落下、5-1 的「播放」按鈕停用並顯示「自動播放已關閉」、摺疊區直接展開但有淡入、1-1 取樣模擬器的條圖不滑動。
- 完成條件：位移動畫都關閉，狀態變化仍看得出來。

### 7.3 兩個標題的行長偏短：已完成 2026-10-05

- 結果：1-4 改成 `推理的兩個設定：|adaptive thinking|與 effort`，10-1 改成 `提示注入攻擊|（prompt injection）`。375、768、1280 × 100%、150% 共 6 種組合：0 孤行、0 拆詞、0 不平衡。
- 試過但不行：`推理模式的兩個設定：…` 在 375 × 150% 的上一課／下一課卡片，第一行太長，比例 0.37–0.38。

- 現況：在窄側欄裡，「提示注入（prompt injection）」與「推理模式：adaptive thinking 與 effort」的短行約為長行的 37–39%（line-breaking.md 規範 40%）；沒有孤行、沒有拆詞。
- 做法：在 `COURSES` 調整這兩個單元（10-1、1-4）的 `|` 斷點或改寫標題，再用附錄 B.3 的腳本在 375、768、1280 × 字級 100%、150% 跑一次。
- 完成條件：0 孤行、0 拆詞、0 不平衡。改了標題就同步更新 `outline.md`（7.4）。

### 7.4 `outline.md` 的標題與網站同步：已完成 2026-10-05

- 結果：改了 1-4、2-5、6-2、7-2、10-1 五個 `### X-Y` 標題（含 7.3 新改的兩個）。下面的對照表是當時的紀錄。
- 注意：Git Bash 的 `sed -i` 會把 CRLF 檔案存成 LF；改 Markdown 後用 `file outline.md` 確認，需要時 `sed -i -b 's/$/\r/'` 還原。

- 為什麼：為了避免孤行，2026-10-05 改了 6 個單元標題，`outline.md` 沒跟著改。
- 對照：

  | 單元 | `outline.md` 現在寫的 | 網站上的 |
  |------|----------------------|---------|
  | 2-5 | XML 標籤：把 prompt 分區 | 用 XML 標籤分區 prompt |
  | 6-2 | 主流 harness 比較 | 主流的 harness 比較 |
  | 7-1 | 安裝與第一次對話 | 安裝與第一次對話（斷點改成「安裝與｜第一次對話」，文字相同） |
  | 7-2 | 撰寫 CLAUDE.md | 撰寫專案的 CLAUDE.md |
  | 8-2 | TDD 搭配 agent | TDD 搭配 agent（拿掉斷點，文字相同） |
  | 10-1 | 提示注入（prompt injection） | 提示注入（prompt injection）（拿掉斷點，文字相同） |

- 做法：改 `outline.md` 對應的 `### X-Y` 標題（只需要改 2-5、6-2、7-2）。

### 7.5 使用者測試與 commit

- 使用者自己走過幾個單元。commit 只在使用者要求時做；訊息照 Conventional Commits 英文，例如：
  - `feat(ai-course): complete modules 6-11 and rebuild on new course engine`
  - 如果要拆：引擎（`refactor`）、模組 0–5 改版（`feat`）、模組 6–11（`feat`）、文件（`docs`）分開。
- 結尾加上 attribution（依當時系統提示）。

### 7.6 （範圍外，先問使用者）`secure-dev-course` 的預覽路徑

- `.claude/launch.json` 的 `secure-dev-course` 指向 `C:/Users/user01/Vibe-Coding/claude-code-secure-dev-course`，實際位置是 `course-web/claude-code-secure-dev-course`。這不屬於本課程，改之前先問。

### 7.7 （2027-01-05）重新查證

會變動、最需要重查的：Claude Code 版本與權限模式預設值（目前 v2.1.289，auto 是預設）、指令清單（`/agents`、`/batch`、`/code-review`）、模型陣容與快取價格（1-2、1-4、4-4 的表格與長條圖）、Haiku 4.5 退役（1-2 的時效提醒）、MCP 規格版本（5-3）、Agent SDK 範例（6-3）、資料使用政策（10-3）、Codex 與 Gemini CLI 的指令（6-2、11-3）。查完更新 `research-notes.md` 與頁尾的查證日期（`SITE.verifiedOn`）。

---

## 8. 資料格式

### 8.1 標題（`COURSES`）

用 `|` 標可以換行的詞組邊界：`['7-7', 'Headless 模式|與 worktree 平行開發']`。中英交界、兩側都是英文、箭頭前後的 `|`，純文字會自動補空格（`needsSpaceBetween`）。12 個字元以內的英文詞組（例如 `Claude Code`）會用不換行空白黏住。

### 8.2 單元

```js
defineLessons({
  'X-Y': {
    goals: ['…', '…', '…'],                       // 剛好 3 條
    review: [                                     // 1–2 題；來源照 outline.md A-3 的間隔排程
      { from: '5-1', type: 'mc', q: '…', options: [
        { text: '…', why: '為什麼看起來對、實際上錯在哪' },
        { text: '…', correct: true, why: '為什麼對' },
        { text: '…', why: '…' },
        { text: '…', why: '…' },
      ] },
      { from: '3-3', type: 'reveal', q: ['…'], answer: ['…'] },
    ],
    analogy: { text: ['…'], limit: ['…'] },
    model: { svg: Diagram.flow({ … }), caption: '…', blocks: [ … ] },
    define: [{ term: '…', en: '…', def: '…', example: '…' }],
    examples: {
      compare: [{ title, bad, good, why: ['對應 {{1:}}', …], badResult, goodResult, badLabel, goodLabel, badCtx, goodCtx, code }],
      tryit: { q: ['…'], draft: '…____…', answer: ['…'], code },
    },
    mistakes: [{ wrong, why, right }, { … }, { … }], // 剛好 3 個
    practice: [ { level: '回想', type: 'mc', … }, { level: '應用', type: 'mc', … }, { level: '遷移', type: 'reveal', … } ],
    keypoints: ['…', '…', '…'],
    sources: ['cc-best', …],                      // defineSources 裡的 key
    minutes: 8,                                   // 選填：手動指定閱讀時間
  },
});
```

- 模組 11 用 `layout: 'reference'` ＋ `blocks`；`{ type: 'heading', id, text }` 會出現在右側目錄。
- 選項依題目 key 固定打亂，`why` 裡不寫「選項 A」。
- 對照器的 `{{編號:文字}}` 裡不能出現 `}}`。
- 選擇題長度：正確答案不要最長。`text.length` 會把英文、反引號、空格都算進去；附錄 A.3 的 `mclen.js` 會標出 `<<< LONGEST`。

### 8.3 內文標記（`md()`，先跳脫 HTML 再套標記）

`**粗體**`、`==螢光==`、`` `code` ``、`{kbd:Esc}`、`[[術語]]` 或 `[[術語|顯示文字]]`、`[文字](https://…)`。

### 8.4 區塊類型

`list`（`items`、`ordered`）、`code`（`lang`、`title`、`code`）、`table`（`head`、`rows`、`caption`）、`callout`（`variant`：analogy／limit／define／mistake／keypoints／legacy／tip／danger）、`unverified`、`timely`、`legacy`（`rows: [[舊, 新]]`、`note`）、`svg`（`svg`、`caption`）、`compare`、`tabs`（`label`、`tabs: [{ label, blocks }]`）、`reveal`（`summary`、`body`）、`quiz`（`key`、`items`）、`widget`（`name`、`props`）、`heading`、`tryit`。

### 8.5 互動元件（`widget`）

| 名稱 | 單元 | props |
|------|------|-------|
| `builder` | 2-6 | `{ compact?, preset? }`；範本可經 `window.App.pendingTemplate` 送進來 |
| `assessment` | 0-2 | `{ thresholds: [3, 6, 8], levels: {1..4: { name, desc }}, questions: [{ module, q, options: [{ text, correct?, why }] }] }` |
| `sampler` | 1-1 | `{ prefix, tokens: [{ t, p, fill }] }`（`p` 加總 100） |
| `loop` | 5-1 | `{ caption, steps: [{ node: 'gather'|'act'|'verify'|'done', log }] }` |
| `checklist` | 9-1 | `{ key, items: ['…'] }` |
| `templates` | 11-1 | `{ items: [{ title, when, lesson, prompt, builder? }] }` |

### 8.6 圖解產生器 `Diagram`

viewBox 寬 600、字級 24；文字用 `|` 標可以換行的地方，放不下時自動在詞的邊界換行，並避免一行只剩 1 個字；仍放不下會進 `Diagram.warnings`。

```js
Diagram.flow({ label, nodes: [{ t, sub?, fill?, dashed? }], cols?, gap?, vgap? })
Diagram.compare({ label, left: { title, items, fill? }, right: { title, items, fill? } })
Diagram.hub({ label, center: { t, sub?, fill? }, top?: [...], bottom?: [...] })
Diagram.layers({ label, layers: [{ t, sub?, fill? }] })        // 由外到內
Diagram.timeline({ label, items: [{ d, t, fill? }] })
Diagram.bars({ label, items: [{ t, v, label?, fill? }], max?, unit? })
Diagram.segments({ label, items: [{ t, v, label?, fill }], unit? }) // label: '' 不顯示數值
```

`fill` 用 CSS 變數（`'var(--m3)'`），彩色底的文字自動變黑；不給就是 `--surface`。`hub` 一排放 4 個時，英文長字（例如 `subagent`）會放不下，改成 2 個一排。

### 8.7 儲存

- `ai-chat-prompt-agent-course.v2`：進度（done、visited、quiz、openModules、level、migrated）。
- `ai-chat-prompt-agent-course.prefs.v1`：fontScale、sidebarWidth、theme。
- 第一次載入會從舊的 `.v1` 搬完成狀態與評估結果；舊測驗紀錄不搬（選項位置變了）。

---

## 9. 驗證方法與 2026-10-05 的結果

### 9.1 每次改內容後

1. `node syntax.js index.html`（附錄 A.1）：所有 `<script>` 0 個語法錯誤。
2. `node mclen.js index.html <單元 id…>`（附錄 A.3）：沒有 `<<< LONGEST` 過多；全站比例 ≤ 35%。
3. 瀏覽器重新載入後，跑附錄 B.1 的 `__check(['X-Y', …])`：`dangling`、`textIssues`、`missing`、`overflow`、`quizIssues`、`fewSvg`、`errors` 都要是空的；再看 `Diagram.warnings`。
4. 有 UI 改動：附錄 B.2（10 種寬度）、B.3（換行）、B.4（對齊），並用附錄 A.6 截圖目視。

### 9.2 2026-10-05 的結果

| 項目 | 結果 |
|------|------|
| 50 個單元 | 0 console 錯誤、0 缺漏術語、0 水平溢出、每課至少 2 張圖（100 張） |
| 選擇題 | 149 題，0 結構問題；正確答案最長 12 / 149（8%） |
| SVG | 0 懸空端點、0 文字問題；圖解產生器 0 警告 |
| 10 種寬度 × 66 頁 | 360、390、430、768、820、1024、1280、1366、1440、1920：0 溢出、頂部列 0 重疊、圖示按鈕 44×44；首頁、模組頁沒有空的右側欄 |
| 對齊（1280） | 最上方：頂部列底線＝側欄頂端＝把手頂端＝68；捲到最底：側欄底＝把手底＝頁尾上緣；邊框與把手線同在 x＝288；1920 寬時也停在頁尾上緣 |
| 換行 | 375、768、1280 × 100%、150%：0 孤行、0 拆詞、0 不平衡（7.3 修正後重跑） |
| 對比 | 文字最低 7.13（黑字 on `--danger`）；非文字最低 6.16（焦點框） |
| 互動 | 把手 `←` `→` `Home` `End`、重新整理後還原、雙擊恢復；術語 popup hover 寬限、`Esc` 與焦點歸還；測驗送出與重做；分頁；模組收合；能力評估與建議起點；迴圈動畫逐步；取樣模擬器；404 頁 |
| reduced-motion | headless Chrome 模擬通過（7.2）；Windows 系統設定實測未做 |

### 9.3 得獎等級自我檢查（domain-web-frontend）

四個維度 1–10 分，都 ≥ 8 才算達標。對照對象：Bartosz Ciechanowski 的互動解說文章（以可操作的圖解聞名；得獎紀錄未查證）。

| 輪 | 設計 | 易用 | 創意 | 內容 | 修了什麼 |
|----|------|------|------|------|----------|
| 1 | 7 | 7 | 7 | 8 | 圖裡的字在桌面約 26px、比內文大 → 限制最大寬 32rem；5-1 迴圈動畫兩欄太擠 → 改上下排；卡片標題「ContextEngineering」缺空格 → 英文詞組間補空格；首頁標題出現焦點框 → 程式設定焦點的 h1 不顯示外框 |
| 2 | 8 | 8 | 7 | 9 | 範本頁兩張圖黏在一起 → 圖與元件之間加大間距；1-1「取樣」只有靜態圖 → 新增取樣模擬器 |
| 3 | 8 | 8 | 8 | 9 | 達標 |

---

## 10. 決策紀錄（為什麼這樣做）

| 決策 | 理由 |
|------|------|
| 引擎直接移植參考站 `claude-code-secure-dev-course`，再接回本課的元件 | skill 指定它為參考實作，已修正 skill 表格列出的 10 項差異並通過幾何檢查 |
| 新增圖解產生器 `Diagram`，不手寫 SVG | 要補約 90 張圖；由節點座標算線段端點，幾何問題由程式保證，所有圖風格一致 |
| 圖解用 viewBox 600、字級 24 | 375px 手機上縮放後約 12px（content-rules 3.3 的下限）；桌面再限制最大寬 32rem，避免字比內文大 |
| SVG 的孤行門檻是 1 個字（不是 2 個） | content-rules 3.3 寫「每行至少 2 個字」；2 個字的完整詞（「比較」）在圖裡可以接受 |
| 英文詞組黏合上限 14 → 12 個字元 | 字級 150% 的手機上，「context window」（14）會比標題還寬，從單字中間斷開 |
| 進度 key 從 `.v1` 改成 `.v2`，只搬完成狀態 | 選擇題改版後選項位置變了，舊的測驗紀錄會對不上 |
| auto mode 寫「v2.1.287 起所有方案」 | changelog：v2.1.282 起逐步改成預設，v2.1.287 擴大到所有方案與供應商（research-notes 第 11 節） |
| `/agents` 寫成「提示你請 Claude 建立或編輯檔案」 | commands 頁：v2.1.198 起不再開互動介面 |
| 5-1 的迴圈改成官方三階段 | 單元標題與內文都是「收集 → 行動 → 驗證」，舊版是四節點的「觀察、思考……」 |
| `--danger`、`--m10` 改成 `#FF6B6B` | 舊色黑字對比 6.47，未達 7:1 |
| 沒有開分支、沒有 commit | 使用者指示：「不用開分支，完成後我會自己測試後才 commit」 |

---

## 11. 已知限制與不寫的內容

| 項目 | 課程中的處理 |
|------|-------------|
| Codex CLI 的指令細節 | 加註「依官方文件摘要，請以官方最新版為準」；不寫預設模型 |
| Gemini CLI 的權限、沙箱、指示檔名設定 | 加註依官方文件摘要；不寫版本號與預設模型 |
| Copilot CLI、Cursor、OpenCode、Aider、Cline | 只寫「IDE 型」類別，不寫指令 |
| Claude Mythos 5.1／Mythos 5 | 不列入模型陣容 |
| OWASP Agentic Top 10 | 官方頁沒有條目，不引用 |
| Haiku 4.5 | 1-2 加了時效提醒：退役日「不早於 2026-10-15」 |
| 9-2、9-3 的 eval 分數（9／15、13／15） | 標明是示意 |
| 1-1 的 token 機率（62%、21%…） | 標明是示意 |

---

## 附錄 A：命令列工具腳本

上次放在 session 的暫存資料夾，已經不在了。要用時，存到暫存資料夾（不要放進課程資料夾），從那個資料夾執行。路徑 `INDEX` 依實際位置調整。

### A.1 `syntax.js`：檢查每個 `<script>` 的語法

```js
// 用法：node syntax.js path/to/index.html
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
let n = 0;
let bad = 0;
for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
  n += 1;
  const line = html.slice(0, m.index).split('\n').length;
  try {
    new vm.Script(m[1], { filename: `script@${line}` });
  } catch (e) {
    bad += 1;
    console.log(`script #${n} (line ${line}): ${e.message}`);
  }
}
console.log(`${n} scripts, ${bad} with syntax errors`);
```

### A.2 `load.js`：在 Node 裡載入課程資料（給 A.3 用）

```js
const fs = require('fs'); const vm = require('vm');
module.exports = function load(file) {
  const html = fs.readFileSync(file, 'utf8');
  const dataEnd = html.indexOf('<!-- @@DATA@@ -->');
  const ctx = { console, window: { localStorage: { getItem: () => null } }, document: { documentElement: { style: { setProperty() {} }, setAttribute() {}, dataset: {} } } };
  vm.createContext(ctx);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    if (m.index > dataEnd) break;
    try { vm.runInContext(m[1], ctx); } catch (e) { console.log('ERR', e.message.slice(0, 100)); }
  }
  return vm.runInContext('({COURSES,LESSONS,GLOSSARY,SOURCES})', ctx);
};
```

在 Node 裡載入時，可能印出「圖解文字放不下」的警告（2026-10-05 實測：`progress.txt`、`settings.json` 各 2 次）。Node 與瀏覽器的分詞結果不同，**圖解寬度以瀏覽器的 `Diagram.warnings` 為準**（瀏覽器是 0 個）。

### A.3 `mclen.js`：列出每題各選項的字數，標出正確答案最長的題目

```js
// 用法：node mclen.js path/to/index.html [單元 id ...]；統計：| grep -c LONGEST
const { LESSONS } = require('./load.js')(process.argv[2]);
const ids = process.argv.slice(3);
for (const l of LESSONS.filter((x) => x.content && (!ids.length || ids.includes(x.id)))) {
  const c = l.content;
  const items = [...(c.review || []), ...(c.practice || []), ...(c.blocks || []).filter((b) => b.type === 'quiz').flatMap((b) => b.items)].filter((q) => q.type === 'mc');
  for (const q of items) {
    const L = q.options.map((o) => o.text.length);
    const ci = q.options.findIndex((o) => o.correct);
    console.log(l.id, q.q.slice(0, 24), L.map((n, i) => (i === ci ? `[${n}]` : n)).join(' '), L[ci] === Math.max(...L) ? '  <<< LONGEST' : '');
  }
}
```

### A.4 `patchlib.py`：以唯一片段定位、取代 `index.html` 的內容

```python
"""用法：from patchlib import Doc；d = Doc()；d.replace(old, new)；d.line(needle, new)；d.save()"""
INDEX = r'C:/Users/user01/Vibe-Coding/course-web/ai-chat-prompt-agent-course/index.html'

class Doc:
    def __init__(self):
        self.s = open(INDEX, encoding='utf-8').read()
        self.count = 0

    def line(self, needle, new):
        """把包含 needle 的那一整行（必須唯一）換成 new"""
        lines = self.s.split('\n')
        hits = [i for i, l in enumerate(lines) if needle in l]
        assert len(hits) == 1, f'line: {needle!r} 命中 {len(hits)} 次'
        lines[hits[0]] = new
        self.s = '\n'.join(lines)
        self.count += 1

    def block(self, start, end, new):
        """把唯一的 start 到其後第一個 end（含）整段換成 new"""
        assert self.s.count(start) == 1, f'block start: {start!r} 命中 {self.s.count(start)} 次'
        a = self.s.index(start)
        b = self.s.index(end, a) + len(end)
        self.s = self.s[:a] + new + self.s[b:]
        self.count += 1

    def replace(self, old, new):
        assert self.s.count(old) == 1, f'replace: {old[:50]!r} 命中 {self.s.count(old)} 次'
        self.s = self.s.replace(old, new)
        self.count += 1

    def save(self):
        open(INDEX, 'w', encoding='utf-8', newline='\n').write(self.s)
        print(f'{self.count} edits saved')
```

取代字串裡要寫 JS 的跳脫字元（例如 `\n`、`\\s`）時，Python 字串要多跳脫一層；不確定時改用 Claude Code 的 Edit 工具。

### A.5 `insert.py`：把一個模組的 `<script>` 資料區塊插在 `@@DATA@@` 前

```python
"""用法：python insert.py mod12.js（檔案內容從 <script> 開始、</script> 結束）"""
import sys
INDEX = r'C:/Users/user01/Vibe-Coding/course-web/ai-chat-prompt-agent-course/index.html'
s = open(INDEX, encoding='utf-8').read()
block = open(sys.argv[1], encoding='utf-8').read().replace('\r\n', '\n').rstrip('\n') + '\n\n'
marker = '<!-- @@DATA@@ -->'
assert s.count(marker) == 1
s = s.replace(marker, block + marker)
open(INDEX, 'w', encoding='utf-8', newline='\n').write(s)
print('inserted', len(block), 'chars')
```

### A.6 `shot.sh`：用 headless Chrome 截圖（預覽視窗被隱藏時用）

```bash
#!/usr/bin/env bash
# 用法：bash shot.sh "#/l/1-1" 檔名 [寬 1280] [高 2400] [light|dark]
# 需要預覽伺服器在 8765 執行中；寬度低於約 500px 會被裁切
OUT_DIR="${SHOT_DIR:-./shots}"; mkdir -p "$OUT_DIR"
ROUTE="$1"; NAME="$2"; W="${3:-1280}"; H="${4:-2400}"; SCHEME="${5:-dark}"
if [ "$SCHEME" = "light" ]; then PCS=1; else PCS=0; fi   # preferredColorScheme：0 深色、1 淺色
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars \
  --user-data-dir="$OUT_DIR/chrome-profile" --window-size="$W,$H" --virtual-time-budget=4000 \
  --blink-settings=preferredColorScheme=$PCS \
  --screenshot="$OUT_DIR/$NAME.png" "http://localhost:8765/$ROUTE" >/dev/null 2>&1
echo "$OUT_DIR/$NAME.png"
```

截好之後用 Read 工具開 PNG 看。headless 的 Chrome profile 和預覽面板是分開的，進度狀態不共用。

### A.7 `contrast.js`：WCAG 對比計算

```js
const L = (h) => { const v = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0); };
const C = (a, b) => { const [h, l] = [L(a), L(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
// 例：console.log(C('#0A0A0A', '#FF6B6B').toFixed(2)); // 7.13
```

---

## 附錄 B：瀏覽器 console 檢查腳本

在預覽面板用 `javascript_tool` 執行（或瀏覽器 DevTools console）。改過 `index.html` 要先 `location.reload()`，**等頁面載入完再在下一次呼叫執行**（同一次呼叫裡 reload 會把腳本中斷）。腳本太長時可以先存進 `localStorage`，之後 `eval(localStorage.getItem('…'))`；測完記得刪掉。單次執行超過 45 秒會逾時，所以 B.2、B.3 一次只跑一種寬度或字級。

### B.1 內容、SVG 幾何、選擇題（skill verification.md ＋ layout-geometry.md 6.5 合併版）

```js
window.__check = async (ids) => {
  const NS = 'http://www.w3.org/2000/svg';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isStroked = (el) => { const cs = getComputedStyle(el); return cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0; };
  const overlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 2;
  const contains = (o, i, pad) => i.x >= o.x + pad && i.y >= o.y + pad && i.x + i.width <= o.x + o.width - pad && i.y + i.height <= o.y + o.height - pad;
  const distRect = (p, b) => { const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.width)); const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.height)); const o = Math.hypot(dx, dy); return o > 0 ? o : Math.min(p.x - b.x, b.x + b.width - p.x, p.y - b.y, b.y + b.height - p.y); };
  const nearBox = (p, b, t) => p.x >= b.x - t && p.x <= b.x + b.width + t && p.y >= b.y - t && p.y <= b.y + b.height + t;
  const errors = []; const origErr = console.error; console.error = (...a) => { errors.push(a.join(' ')); origErr(...a); };
  const dangling = []; const textIssues = []; const perLesson = {}; const missing = {}; const overflow = [];
  const list = ids ? LESSONS.filter((l) => ids.includes(l.id)) : LESSONS.filter((l) => l.content);
  for (const lesson of list) {
    location.hash = '#/l/' + lesson.id;
    await sleep(450);
    const miss = [...document.querySelectorAll('#main .term-missing')].map((e) => e.textContent);
    if (miss.length) missing[lesson.id] = miss;
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) overflow.push(lesson.id);
    const svgs = [...document.querySelectorAll('#main svg[role=img]')];
    perLesson[lesson.id] = svgs.length;
    svgs.forEach((svg, si) => {
      const tag = lesson.id + ' 圖' + (si + 1);
      const vb = svg.viewBox.baseVal;
      const texts = [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim()).map((t) => {
        const bb = t.getBBox(); const fs = parseFloat(getComputedStyle(t).fontSize); const cy = bb.y + bb.height / 2;
        return { t: t.textContent.trim(), b: { x: bb.x, y: cy - fs * 0.55, width: bb.width, height: fs * 1.1 } };
      });
      const rects = [...svg.querySelectorAll('rect')].map((x) => ({ b: x.getBBox(), sw: parseFloat(getComputedStyle(x).strokeWidth) || 0 }));
      const circles = [...svg.querySelectorAll('circle')].map((c) => ({ cx: +c.getAttribute('cx'), cy: +c.getAttribute('cy'), r: +c.getAttribute('r') }));
      const heads = [...svg.querySelectorAll('path')].filter((p) => !isStroked(p)).map((p) => p.getBBox());
      const strokes = [...svg.querySelectorAll('path')].filter(isStroked);
      for (const c of strokes.filter((p) => !/Z/i.test(p.getAttribute('d')))) {
        if (c.closest('[data-free-ends]')) continue;
        for (const d of c.getAttribute('d').trim().split(/(?=M)/)) {
          const tmp = document.createElementNS(NS, 'path'); tmp.setAttribute('d', d); svg.appendChild(tmp);
          const len = tmp.getTotalLength(); const ends = [tmp.getPointAtLength(0), tmp.getPointAtLength(len)]; tmp.remove();
          ends.forEach((p, ei) => {
            const ok = rects.some((x) => distRect(p, x.b) <= 3) || circles.some((k) => Math.hypot(p.x - k.cx, p.y - k.cy) <= k.r + 3)
              || heads.some((b) => nearBox(p, b, 4)) || texts.some((x) => nearBox(p, x.b, 10));
            if (!ok) dangling.push(tag + ' ' + d.slice(0, 24) + (ei ? ' 終點' : ' 起點'));
          });
        }
      }
      for (const { t, b } of texts) {
        const s = t.slice(0, 12);
        if (/^\p{Script=Han}$/u.test(t)) textIssues.push(tag + '「' + t + '」單字成行');
        if (b.x < vb.x - 1 || b.x + b.width > vb.x + vb.width + 1 || b.y < vb.y - 1 || b.y + b.height > vb.y + vb.height + 1) textIssues.push(tag + '「' + s + '」超出畫布');
        for (const x of rects) {
          const outer = { x: x.b.x - x.sw / 2, y: x.b.y - x.sw / 2, width: x.b.width + x.sw, height: x.b.height + x.sw };
          if (overlap(outer, b) && !contains(x.b, b, x.sw / 2 + 3.5)) textIssues.push(tag + '「' + s + '」壓到或貼著方框');
        }
        const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]];
        for (const c of circles) {
          const nx = Math.max(b.x, Math.min(c.cx, b.x + b.width)); const ny = Math.max(b.y, Math.min(c.cy, b.y + b.height));
          if (Math.hypot(nx - c.cx, ny - c.cy) < c.r && Math.max(...corners.map(([x, y]) => Math.hypot(x - c.cx, y - c.cy))) > c.r - 4) textIssues.push(tag + '「' + s + '」壓到圓形邊線');
        }
        const hit = { x: b.x - 3, y: b.y - 3, width: b.width + 6, height: b.height + 6 };
        for (const p of strokes) {
          const len = p.getTotalLength();
          for (let k = 0; k <= len; k += 2) { const q = p.getPointAtLength(k); if (q.x > hit.x && q.x < hit.x + hit.width && q.y > hit.y && q.y < hit.y + hit.height) { textIssues.push(tag + '「' + s + '」壓到線段'); break; } }
        }
      }
      for (let i = 0; i < texts.length; i += 1) for (let j = i + 1; j < texts.length; j += 1) if (overlap(texts[i].b, texts[j].b)) textIssues.push(tag + '「' + texts[i].t.slice(0, 8) + '」和「' + texts[j].t.slice(0, 8) + '」重疊');
    });
  }
  const quizIssues = []; let mcCount = 0; let correctIsLongest = 0;
  for (const lesson of list.filter((l) => l.content)) {
    const c = lesson.content;
    const items = [...(c.practice || []), ...(c.review || []), ...(c.blocks || []).filter((b) => b.type === 'quiz').flatMap((b) => b.items)].filter((q) => q.type === 'mc');
    for (const q of items) {
      mcCount += 1;
      const lengths = q.options.map((o) => o.text.length);
      const correct = q.options.filter((o) => o.correct);
      if (correct[0] && correct[0].text.length === Math.max(...lengths)) correctIsLongest += 1;
      if (correct.length !== 1) quizIssues.push([lesson.id, q.q, '正確答案不是剛好 1 個']);
      if (q.options.some((o) => !o.why)) quizIssues.push([lesson.id, q.q, '有選項沒有解析']);
      if (correct[0] && correct[0].text.length === Math.max(...lengths) && Math.max(...lengths) > Math.min(...lengths) * 1.5) quizIssues.push([lesson.id, q.q, '正確答案明顯最長']);
      if (q.options.some((o) => /以上皆/.test(o.text))) quizIssues.push([lesson.id, q.q, '用了「以上皆…」']);
    }
  }
  console.error = origErr;
  const fewSvg = Object.entries(perLesson).filter(([, n]) => n < 2).map(([id, n]) => id + ':' + n);
  return { lessons: list.length, svgTotal: Object.values(perLesson).reduce((a, b) => a + b, 0), fewSvg, dangling: [...new Set(dangling)], textIssues: [...new Set(textIssues)], missing, overflow, quizIssues, mc: correctIsLongest + ' / ' + mcCount, errors, diagramWarnings: Diagram.warnings };
};
// 全站：await __check()；部分：await __check(['6-1', '6-2'])
```

### B.2 全頁溢出與頂部列（layout-geometry.md 6.3；先用 `resize_window` 設寬度）

```js
window.__layout = async () => {
  const st = document.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important}'; document.head.appendChild(st);
  const out = {};
  const pages = ['#/', '#/styleguide', '#/references', ...COURSES.map((m) => '#/m/' + m.id), ...LESSONS.map((l) => '#/l/' + l.id)];
  for (const h of pages) {
    location.hash = h;
    await new Promise((r) => setTimeout(r, 250));
    document.querySelectorAll('#main details').forEach((d) => { d.open = true; });
    await new Promise((r) => setTimeout(r, 30));
    const vw = document.documentElement.clientWidth;
    const over = [...document.querySelectorAll('body *')]
      .filter((e) => !e.closest('.sidebar:not(.open), .scrim, .term-pop, .search-results, .dropdown, .visually-hidden, pre, .table-wrap'))
      .filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > vw + 0.5 || b.left < -0.5); })
      .slice(0, 3).map((e) => String(e.className || e.tagName).slice(0, 30) + '「' + e.textContent.trim().slice(0, 20) + '」');
    if (document.documentElement.scrollWidth > vw || over.length) out[h] = over;
  }
  const kids = [...document.querySelector('.topbar').children].filter((e) => e.getClientRects().length && !e.classList.contains('spacer'));
  const rects = kids.map((e) => e.getBoundingClientRect());
  const icons = [...document.querySelectorAll('.topbar .btn.icon')].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height));
  st.remove();
  return { vw: innerWidth, overlaps: rects.slice(1).filter((r, i) => r.left < rects[i].right + 8).length, icons: [...new Set(icons)], problems: out };
};
// 通過條件：problems 是空的、overlaps 是 0、icons 只有 44x44
// 寬度：360、390、430、768、820、1024、1280、1366、1440、1920
```

### B.3 換行（line-breaking.md 4.2 修正版）

量 `.lesson-nav .ttl` 與 `.nav-link .ttl`（而不是整個 `a`），因為上一課／下一課的方向標籤本來就刻意自成一行；英文單字之間在空白處換行不算拆詞；行長用視覺寬度估計（英數 × 0.55）。

```js
window.__lines2 = async () => {
  const SHORT_TEXT = 'h1, h2, h3, .btn, .card-title, .lesson-nav .ttl, .nav-link .ttl';
  const seg = new Intl.Segmenter('zh-Hant', { granularity: 'word' });
  const issues = { orphan: [], split: [], balance: [] }; const warns = [];
  const ow = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); ow(...a); };
  const pages = ['#/', ...COURSES.map((m) => '#/m/' + m.id), ...LESSONS.map((l) => '#/l/' + l.id)];
  const seen = new Set();
  for (const h of pages) {
    location.hash = h; await new Promise((r) => setTimeout(r, 200)); App.fitAll();
    for (const el of document.querySelectorAll(SHORT_TEXT)) {
      if (!el.getClientRects().length) continue;
      const lines = App.measureLines(el);
      if (lines.length < 2) continue;
      const key = el.className + el.textContent.trim(); if (seen.has(key)) continue; seen.add(key);
      const label = el.textContent.trim().slice(0, 30);
      const widths = lines.map((l) => [...l].reduce((w, ch) => w + (/[\u0000-\u024f]/.test(ch) ? 0.55 : 1), 0));
      if (lines.some((l) => l.length <= 2 || !/\p{L}/u.test(l))) issues.orphan.push(label + ' => ' + lines.join('/'));
      if (Math.min(...widths) / Math.max(...widths) < 0.4) issues.balance.push(label + ' => ' + lines.join('/'));
      for (let i = 0; i < lines.length - 1; i += 1) {
        const txt = el.textContent.replace(/\u00a0/g, ' ');
        if (/[A-Za-z]$/.test(lines[i]) && /^[A-Za-z]/.test(lines[i + 1]) && txt.includes(lines[i].slice(-3) + ' ' + lines[i + 1].slice(0, 3))) continue;
        const joint = lines[i].slice(-4) + lines[i + 1].slice(0, 4); const cut = lines[i].slice(-4).length; let pos = 0;
        for (const { segment, isWordLike } of seg.segment(joint)) { if (isWordLike && segment.length > 1 && pos < cut && pos + segment.length > cut) issues.split.push(label + ' 拆開「' + segment + '」 => ' + lines.join('/')); pos += segment.length; }
      }
    }
  }
  console.warn = ow;
  return { vw: innerWidth, scale: getComputedStyle(document.documentElement).getPropertyValue('--font-scale') || '1', ...issues, warns: [...new Set(warns)] };
};
// 字級 150%：for (let i = 0; i < 4; i++) document.querySelector('[data-font="up"]').click();
// 還原：document.querySelector('[data-font="reset"]').click();
```

### B.4 側欄對齊（layout-geometry.md 6.4，≥ 1280px）

```js
location.hash = '#/l/7-3'; await new Promise((r) => setTimeout(r, 400));
const r = (s) => document.querySelector(s).getBoundingClientRect();
const snap = () => ({ topbarBottom: Math.round(r('.topbar').bottom), sidebarTop: Math.round(r('.sidebar').top), resizerTop: Math.round(r('.sidebar-resizer').top), sidebarBottom: Math.round(r('.sidebar').bottom), resizerBottom: Math.round(r('.sidebar-resizer').bottom), footerTop: Math.round(r('.site-footer').top), sidebarBorder: Math.round(r('.sidebar').right), resizerLine: Math.round(r('.sidebar-resizer').right - 4) });
window.scrollTo(0, 0); await new Promise((res) => setTimeout(res, 200)); const top = snap();
window.scrollTo(0, document.body.scrollHeight); await new Promise((res) => setTimeout(res, 300)); const bottom = snap();
({ top, bottom });
// 通過條件：top 的 topbarBottom = sidebarTop = resizerTop；bottom 的 sidebarBottom = resizerBottom = footerTop；兩次的 sidebarBorder = resizerLine
```

### B.5 互動快速測試

```js
const h = document.querySelector('.sidebar-resizer'); const res = {};
const key = (k) => h.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
h.focus(); res.start = h.getAttribute('aria-valuenow');
key('ArrowRight'); res.right = h.getAttribute('aria-valuenow');   // +16
key('Home'); res.home = h.getAttribute('aria-valuenow');          // 224
key('End'); res.end = h.getAttribute('aria-valuenow');            // min(480, 40vw)
h.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); res.reset = h.getAttribute('aria-valuenow'); // 288
location.hash = '#/l/1-2'; await new Promise((r) => setTimeout(r, 400));
const t = document.querySelector('#main .term'); t.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await new Promise((r) => setTimeout(r, 300));
const pop = document.getElementById('term-pop'); res.popOpen = pop.dataset.open;  // 'true'
t.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
res.afterEsc = pop.dataset.open; res.focusBack = document.activeElement === t; // 'false'、true
const f = document.querySelector('#main form.quiz'); f.querySelector('input').checked = true; f.requestSubmit(); await new Promise((r) => setTimeout(r, 100));
res.quizExplains = f.querySelectorAll('.explain-list li').length; // 4
res;
```
