# 交接文件：AI 對話 × Prompt × Agent 實戰課

> 暫停時間：2026-10-02
> 一句話現況：**階段 1–2 完成；階段 3 進行到「第 3 步：逐一模組填內容」，50 個單元已完成 25 個（模組 0–5），模組 6–11 尚未撰寫；階段 4 驗證尚未開始。**
> 暫停前的驗證：重新載入 `index.html` 後逐一切換 25 個已完成的單元 → console 0 錯誤、0 個缺漏術語；agent loop 動畫逐步播放正常。

---

## 1. 接手的 3 個步驟

1. 讀這份文件的第 3 節（需求清單）與第 7 節（資料格式）。
2. 啟動預覽：在 Claude Code 桌面版用 `preview_start`，名稱 `ai-course`（設定在 `/Users/ralph/vibe-coding/.claude/launch.json`，port 8765）。也可以自己執行：

   ```bash
   python3 -m http.server 8765 --bind 127.0.0.1 --directory /Users/ralph/vibe-coding/ai-chat-prompt-agent-course
   ```

3. 從**模組 6** 開始寫內容。每個單元的大綱都在 `outline.md`，資料格式照第 7 節；寫完插在 `index.html` 的 `<!-- @@DATA@@ -->` 標記之前。

---

## 2. 檔案清單

| 檔案 | 用途 | 狀態 |
|------|------|------|
| `research-notes.md` | 階段 1 的研究筆記，所有指令與功能的來源 URL（查證於 2026-10-01／02） | 完成 |
| `outline.md` | 階段 2 的課程架構：49 個單元的大綱（實作時多了 11-4，共 50 個）、間隔複習排程、與 ai-dev-rules 的衝突取捨 | 完成（使用者已確認） |
| `design-system.md` | 階段 3-1 的設計規範：色彩 token 與對比度、字級、間距、元件與狀態、動畫 | 完成 |
| `index.html` | 課程網站，單一檔案（約 300KB），雙擊或用本機伺服器開啟 | 進行中 |
| `HANDOFF.md` | 本文件 | — |

課程資料夾以外，這次另外建立的檔案：
- `/Users/ralph/vibe-coding/.claude/launch.json`：預覽伺服器設定（`ai-course`）
- `~/.claude/projects/-Users-ralph-vibe-coding/memory/`：兩筆記憶（一律用繁中回覆、資料夾要取描述性名稱）

尚未 commit。使用者沒有要求 commit。

---

## 3. 需求清單與進度

原始需求是使用者貼在對話裡的一份長規格，沒有存成檔案。以下是完整的需求重點，以及目前的進度。

### 階段 0：工作方式
- [x] 先研究 → 規劃 → 實作，每個階段完成後等使用者確認
- [x] 內容反映 2026 年 10 月的狀態；工具、版本、指令都要查證，不憑記憶寫
- [x] 查不到的標註「⚠️ 截至 2026-10 查證狀態：未確認」（網站內用 `{ type: 'unverified' }` 區塊）
- [x] 繁體中文（台灣用語）；專有名詞第一次出現用「中文（English）」

### 階段 1：研究
- [x] `research-notes.md`，含來源 URL 與查證日期（使用者已確認）

### 階段 2：課程架構
- [x] `outline.md`，12 個模組（使用者已確認，並要求「範例可以延伸更多」）

### 階段 3：設計與實作

**3-1 設計系統**
- [x] `design-system.md`，並在 `index.html` 的 `:root` 實作成 CSS 變數

**3-2 動畫規範**（已實作在 CSS）
- [x] 時長：微互動 120ms、元件 240ms、頁面 360ms；過衝曲線與 `steps()`
- [x] 卡片落定、按鈕按壓、答案展開、進度條推進、完成蓋章
- [x] `prefers-reduced-motion`：位移動畫關閉，只保留狀態變化

**3-3 互動功能**
- [x] 1. 側邊導覽：樹狀選單、完成狀態；手機版是抽屜（焦點鎖定、`Esc` 關閉）
- [x] 2. 進度追蹤：localStorage（key：`ai-chat-prompt-agent-course.v1`），讀寫都包在 try/catch，失敗時退回記憶體
- [x] 3. Prompt 對照器：≥ 768px 左右並排，手機上下排列，差異編號標記
- [x] 4. Prompt 組裝器：6 個積木、即時組合、3 個範例、XML 開關、缺漏提示、複製
- [x] 5. 測驗元件：選擇題（附解析與錯誤選項說明）與「先思考再展開」兩種形式
- [~] 6. 程式碼區塊：highlight.js 11.11.2 語法高亮正常；複製按鈕**還沒用真實點擊測試**（腳本點擊會走到備援訊息，見第 9 節）
- [x] 7. 術語 tooltip：hover、focus、點擊固定、`Esc` 關閉
- [x] 8. 搜尋：課程標題＋術語，`/` 聚焦，`↑` `↓` `Enter` 操作
- [x] 9. 鍵盤：`←` `→` 換課、`/` 搜尋、全部可用 Tab 操作並有焦點樣式
- [x] 10. Agent loop 動畫：單元 5-1，觀察 → 思考 → 呼叫工具 → 取得結果，可播放／暫停／逐步；reduced motion 時停用自動播放

**3-4 技術限制**
- [x] 單一 `index.html`，CSS 與 JS 內嵌，不需要建置工具
- [x] 原生 JavaScript；外部只載入 Google Fonts 與 cdnjs 的 highlight.js（附 SRI）
- [~] 375／768／1280 三種寬度：模組 0–3 已在 375px 檢查過，沒有水平捲軸；模組 4、5 與 768px 尚未檢查
- [~] 無障礙：語意標籤、ARIA、對比 AA（已計算）已實作；尚未做完整的鍵盤走查
- [x] 課程內容用 JS 資料結構管理（`COURSES` ＋ `defineLessons()`）

**3-5 實作順序**
- [x] 1. 骨架：token、版面、導覽、路由、進度系統
- [x] 2. 共用元件與樣式確認（元件樣式表：`#/styleguide`）
- [~] 3. 逐一模組填內容，每 2–3 個模組自我檢查一次
  - [x] 模組 0–3（17 單元），已自我檢查（含 375px）
  - [x] 模組 4–5（8 單元），已檢查 console 與術語，**尚未檢查 375px**
  - [ ] 模組 6（3 單元）
  - [ ] 模組 7（7 單元）
  - [ ] 模組 8（4 單元）
  - [ ] 模組 9（3 單元）
  - [ ] 模組 10（4 單元）
  - [ ] 模組 11（4 單元：11-1 Prompt 範本、11-2 設定檔範本、11-3 指令速查、11-4 總複習測驗）
- [ ] 4. 速查表、搜尋與動畫細節的收尾

### 階段 4：驗證（全部尚未開始）
- [ ] 用瀏覽器在 375／768／1280 三種寬度截圖確認版面
- [ ] 所有課程都能切換，沒有死連結
- [ ] 測驗、複製按鈕、組裝器、深色模式切換都正常
- [ ] 開啟 reduced motion 時動畫正確關閉
- [ ] Console 沒有錯誤
- [ ] 每個 CLI 指令、功能名稱都能對應到 `research-notes.md` 的來源
- [ ] 頁尾有「內容更新至 2026 年 10 月」與參考資料列表（**已實作**，驗證時再確認一次）
- [ ] 最後給使用者簡短總結：產出了哪些檔案、哪些內容標註為「未確認」、建議下一步可以加強的地方

---

## 4. 使用者在過程中的決定

| 決定 | 內容 |
|------|------|
| 語言 | 一律繁體中文、台灣用語（規則在 `ai-dev-rules/core/00-communication.md`，但全域 CLAUDE.md 沒有安裝，所以要自己記得） |
| 資料夾 | 名稱要看得出內容 → `ai-chat-prompt-agent-course/` |
| Prefill | 單元 3-5 改成「舊做法 → 現在的替代做法」（新模型不支援 prefill） |
| 範例 | 「符合，可以延伸更多」→ 每課 1–3 組對照，情境盡量多樣（職場、程式、生活） |
| 標準 | 參考 `ai-dev-rules` 的 skills：`course-lesson`、`domain-education-content`、`domain-web-frontend`、`web-animation`、`verify-done`、`core/00-communication.md` |

與 ai-dev-rules 標準衝突時的取捨，寫在 `outline.md` 的 A-1b。重點如下：
- 每課 5–12 分鐘（不是標準的 20–30 分鐘）
- 回顧題放在課程開頭
- 用文字貼紙標籤，不用 emoji 當項目符號
- 陰影改用偽元素，以 transform 位移，不對 box-shadow 做動畫

---

## 5. 剩餘內容的寫作指引

### 5.1 每個單元的固定內容（照模組 1–5 的寫法）

| 欄位 | 數量與規則 |
|------|-----------|
| `goals` | 剛好 3 條，一句一條 |
| `review` | 1–2 題，題目來源依下面的排程；一題選擇題＋一題 reveal；加上 `from: '單元id'` |
| `analogy` | `text` ＋ `limit`（比喻的限制，一定要有） |
| `model` | 可放 `svg`（內嵌，套用主題 class）＋ `blocks` |
| `define` | 1–3 個術語，`{ term, en, def }`，會自動加入術語表 |
| `examples` | `compare` 1–3 組（壞 → 好，含 `why`）＋ `tryit`（換你補完） |
| `mistakes` | 剛好 3 個，`{ wrong, why, right }` |
| `practice` | 剛好 3 題：`回想` → `應用` → `遷移`；選擇題要有 `explain`，最好附 `whyWrong` |
| `keypoints` | 剛好 3 條 |
| `sources` | 來源 key 陣列（第 7.6 節） |

### 5.2 回顧題排程（outline.md A-3）

| 模組 | 回顧題來自 |
|------|-----------|
| 6 | 5、3 |
| 7 | 6、4、2 |
| 8 | 7、5 |
| 9 | 8、6、2 |
| 10 | 9、7、5 |
| 11 | 不放回顧題；11-4 是 20 題總複習測驗（混合全部模組） |

### 5.3 各模組的重點提醒

每個單元的大綱都在 `outline.md`，下面只列出實作時要特別注意的地方：

- **6-1**：harness 的 4 個職責（工具、權限、context 管理、迴圈控制）是本課程的整理，要標明。官方定義引用 `cc-how`。可畫一張「模型在中間，4 個職責圍在外面」的 SVG。
- **6-2**：比較表只能用 `research-notes.md` 第 5 節與第 10 節中有 ✅ 或 🟡 的資料。Codex 的項目要加註「依官方文件摘要」；**不要寫 Codex 的預設模型名稱**。可以用 `tabs` 區塊分別放三套工具的安裝與指令。
- **6-3**：Agent SDK 的程式碼照 `research-notes.md` 第 10 節（`@anthropic-ai/claude-agent-sdk`、`claude-agent-sdk`、`query()`、`allowedTools`、`permissionMode: "acceptEdits"`）。用 `tabs` 放 TypeScript 與 Python 兩版。另外要附上 Agent SDK、CLI、Client SDK、Managed Agents 的比較表（`sdk-overview`）。
- **模組 7**：只用 `research-notes.md` 第 3 節中的指令與快捷鍵：
  - 指令：`/init`、`/memory`、`/context`、`/clear`、`/compact`、`/rewind`、`/agents`、`/hooks`、`/permissions`、`/sandbox`、`/mcp`、`/plugin`、`/batch`、`/code-review`、`/goal`、`/subtask`
  - CLI flags：`-p`、`--output-format`、`--allowedTools`、`--permission-mode`、`--worktree`／`-w`、`--continue`、`--resume`、`--fork-session`
  - 快捷鍵：`Shift+Tab`、`Esc`、`Esc Esc`、`Ctrl+G`、`Ctrl+B`
  - 權限模式表（6 種）、hooks 事件、`settings.json` 範例都已查證。
- **模組 8**：素材來自 `cc-best`（驗證的 4 種強度：prompt、`/goal`、Stop hook、驗證 subagent），以及 `pe-best` 的長時程任務（`tests.json`、`progress.txt`、git）。
- **模組 9**：9-1 用 `checklist` widget（`props: { key, items }`）；9-2 的「先定成功標準」引用 `pe-overview`。
- **模組 10**：OWASP 2025 的十項已在 `owasp` 來源確認（LLM01 Prompt Injection、LLM06 Excessive Agency、LLM05 Improper Output Handling 等）；Claude Code 的防護引用 `cc-security`。
- **模組 11**：用 `layout: 'reference'` 加 `blocks`（以 `{ type: 'heading', id, text }` 分段，會自動出現在右側目錄）。11-1 用 `templates` widget，它可以把範本送進組裝器（`builder` 欄位放 6 個積木的值）。11-4 用 `{ type: 'quiz', key: '11-4:final', items: [...] }`。

### 5.4 寫作規範（ai-dev-rules `00-communication.md`）
- 段落最多 3 句；一段最多一處粗體、一個破折號。
- 不用：值得注意的是、深入探討、至關重要、全方位、無縫、賦能、打造。
- 不用 emoji 當項目符號（✓／✗ 用在對錯標示可以）。
- 不寫沒查證的參數或指令；需要時用 `{ type: 'unverified', body: [...] }`。

---

## 6. `index.html` 的結構

依照檔案中的順序（行號是暫停時的位置，之後會變）：

| 區段 | 大約行號 | 內容 |
|------|---------|------|
| `<style>` | 10–880 | token（`:root`）、深色模式、基礎、`.nb-press` 按壓元件、版面、首頁／單元頁、元件（第 7 節）、減少動態效果 |
| 第 1 個 `<script>` | 887–1000 | `SITE`、`COURSES`（模組與單元標題）、`LESSONS`、`defineLessons()`、`defineTerms()`、`defineSources()` |
| 資料區塊 | 1002–2819 | 參考資料 → 模組 0 → 1 → 2 → 3 → 4 → 5，每個模組一個 `<script>` |
| `<!-- @@DATA@@ -->` | 2821 | **新模組的資料插在這行之前** |
| App `<script>` | 2823–3384 | 進度儲存、`md()` 標記解析、閱讀時間、主題、側邊選單、路由（`#/`、`#/m/N`、`#/l/ID`、`#/styleguide`、`#/references`）、單元頁渲染、頁尾、鍵盤 |
| highlight.js | 3386–3387 | cdnjs，`defer`，附 SRI |
| 元件 `<script>` | 3388–4377 | 區塊渲染、對照器、分頁、測驗、複製、高亮、tooltip、搜尋、widgets（builder、assessment、checklist、templates、loop）、單元各段渲染、元件樣式表 |

---

## 7. 資料格式

### 7.1 新增一個模組的資料

```html
<script>
/* 模組 6：什麼是 Harness */
defineLessons({
  '6-1': {
    goals: ['…', '…', '…'],
    review: [
      { from: '5-1', type: 'mc', q: '…', options: ['…', '…', '…', '…'], answer: 1, explain: ['…'] },
      { from: '3-3', type: 'reveal', q: ['…'], answer: ['…'] },
    ],
    analogy: { text: ['…'], limit: ['…'] },
    model: { svg: `<svg …>…</svg>`, caption: '…', blocks: ['段落', { type: 'table', … }] },
    define: [{ term: 'harness', en: 'harness', def: '…' }],
    examples: {
      compare: [{ title: '…', bad: '…', good: '…{{1:標記的差異}}…', badResult: '…', why: ['對應 1 的說明'] }],
      tryit: { q: ['…'], draft: '…____…', answer: ['…'] },
    },
    mistakes: [{ wrong: '…', why: '…', right: '…' }, …],
    practice: [
      { level: '回想', type: 'mc', q: '…', options: […], answer: 0, explain: ['…'], whyWrong: { 2: '…' } },
      { level: '應用', type: 'mc', … },
      { level: '遷移', type: 'reveal', q: ['…'], answer: ['…'] },
    ],
    keypoints: ['…', '…', '…'],
    sources: ['cc-how', 'cc-features'],
  },
});
</script>
```

其他可用的欄位：
- `minutes: N`：手動指定閱讀時間（預設依字數自動估算：每分鐘 300 字，每題練習 0.75 分）
- `layout: 'reference'`：搭配 `blocks`，用在模組 11

### 7.2 內文標記（`md()`，所有文字會先跳脫再套用，所以不能寫 HTML）

| 寫法 | 結果 |
|------|------|
| `**粗體**` | 粗體 |
| `==螢光==` | 螢光標記 |
| `` `code` `` | 行內程式碼 |
| `{kbd:Esc}` | 鍵盤按鍵 |
| `[[術語]]` 或 `[[術語\|顯示文字]]` | 術語 tooltip（術語必須存在，否則會顯示為缺漏） |
| `[文字](https://…)` | 外部連結（只接受 https） |

### 7.3 對照器的差異標記
- 在 `bad`／`good` 字串中用 `{{編號:文字}}`，`why` 陣列的第 N 項對應編號 N。
- **標記內不能出現 `}}`**（例如 JSON 的大括號），否則會提早結束。
- 選填欄位：`badCtx`／`goodCtx`（情境說明，例如「（系統提示詞）」）、`badResult`／`goodResult`、`badLabel`／`goodLabel`。

### 7.4 區塊類型（`blocks` 陣列中的物件）

| `type` | 欄位 |
|--------|------|
| 字串 | 一個段落 |
| `list` | `items`、`ordered` |
| `code` | `lang`（bash、json、python、typescript、markdown、yaml、xml、powershell、text、toml）、`code`、`title` |
| `table` | `head`、`rows`、`caption`（每列的第一格會成為 `th`） |
| `callout` | `variant`（analogy／limit／define／mistake／keypoints／legacy／tip／danger）、`title`、`body` |
| `unverified` | `body`（自動加上「⚠️ 截至 2026-10 查證狀態：未確認」） |
| `legacy` | `title`、`rows: [[舊, 新], …]`、`note` |
| `svg` | `svg`、`caption` |
| `compare` | 同 7.3 |
| `tabs` | `label`、`tabs: [{ label, blocks }]` |
| `reveal` | `summary`、`body` |
| `quiz` | `key`、`items`（同 practice 格式） |
| `tryit` | `q`、`draft`、`answer` |
| `heading` | `id`、`text`（reference 版面用） |
| `widget` | `name`、`props`（builder、assessment、checklist、templates、loop） |

### 7.5 SVG 的主題相容寫法
- 用 class：`fill-ink`、`stroke-ink`、`fill-surface`、`fill-bg`；彩色底用 `style="fill:var(--m5)"`。
- 彩色底上的文字加 class `on-color`。
- `<svg>` 要有 `role="img"` 與完整的 `aria-label`。

### 7.6 可用的來源 key
`models`、`pe-overview`、`pe-best`、`pe-tutorial`、`ctx-eng`、`effective-agents`、`cc-index`、`cc-overview`、`cc-how`、`cc-best`、`cc-memory`、`cc-features`、`cc-skills`、`cc-subagents`、`cc-hooks`、`cc-hooks-guide`、`cc-permission-modes`、`cc-worktrees`、`cc-headless`、`cc-security`、`cc-whatsnew`、`sdk-overview`、`sdk-quickstart`、`mcp-spec`、`mcp-rc`、`codex-cli`、`codex-approvals`、`gemini-install`、`gemini-config`、`gemini-headless`、`owasp`

### 7.7 已有的術語（47 個，不要重複定義）
prompt、agent、harness、詞元、下一個詞元預測、取樣、上下文視窗、context 衰退、幻覺、知識截止日、自適應思考、effort、延伸思考、黃金法則、背景資訊、系統提示詞、角色提示、few-shot、反例、XML 標籤、分隔符、範例偏誤、思考鏈、prompt 串接、自我修正、長文件提示、引用為據、預填、結構化輸出、context engineering、注意力預算、適當的高度、auto memory、CLAUDE.md、skill、漸進式揭露、即時檢索、壓縮、prompt 快取、代理迴圈、完成的定義、工具使用、工具定義、MCP、MCP server、workflow、subagent

`harness`、`prompt`、`agent` 是用 `defineTerms` 先定義的；在 6-1 的 `define` 中再寫 `harness` 時，不會覆蓋原本的定義，但會把術語連到 6-1。如果想換成更完整的定義，直接改模組 0 資料區塊的 `defineTerms`。

預計在後面定義的術語：迴圈控制（6-1）、Agent SDK（6-3）、權限模式（7-3）、hook（7-5）、plugin（7-6）、headless 模式與 worktree（7-7）、TDD（8-2）、eval 與 LLM-as-judge（9-2）、提示注入（10-1）、最小權限與過度授權（10-2）、不當輸出處理（10-4）。

---

## 8. 驗證方法

### 8.1 預覽工具的兩個坑
- **直接用 `file://` 開啟**時，預覽面板會轉成 data: 快照，localStorage 測不到。請改用本機伺服器（第 1 節）。
- **每次重新載入後**，模擬的 viewport 會跑掉（截圖只剩左上角）。解法：先執行 `resize_window` 的 `preset: "desktop"`，再設定想要的尺寸，然後截圖。

### 8.2 一次檢查所有已完成的單元（在瀏覽器 console 或 javascript_tool 執行）

```js
const errors = [];
const origErr = console.error; console.error = (...a) => { errors.push(a.join(' ')); origErr(...a); };
const report = {};
for (const l of LESSONS.filter((l) => l.content)) {
  location.hash = '#/l/' + l.id;
  await new Promise((r) => setTimeout(r, 120));
  const d = document.documentElement;
  const missing = [...document.querySelectorAll('#main .term-missing')].map((e) => e.textContent);
  if (missing.length || d.scrollWidth > d.clientWidth) report[l.id] = { missing, overflow: d.scrollWidth > d.clientWidth };
}
({ done: LESSONS.filter((l) => l.content).length, total: LESSONS.length, report, errors });
```

檢查溢出時，每換一課要等 400ms 以上（換課轉場是 360ms）；或量測前先確認 `innerWidth` 符合模擬的寬度。

### 8.3 其他檢查頁面
- `#/styleguide`：所有元件與狀態
- `#/references`：參考資料列表

---

## 9. 已知問題與待辦

- [ ] **複製按鈕要用真實點擊測試**。用腳本 `click()` 時，Clipboard API 沒有使用者手勢，會顯示備援訊息「請按 Ctrl/Cmd + C」。這是預期中的行為，但還沒用 `computer` 的 `left_click` 確認真實點擊時能成功複製。
- [ ] 模組 4、5 還沒做 375px 檢查；768px 全部都還沒檢查。
- [ ] `outline.md` 寫的是 49 個單元，網站實際上是 50 個（11-4 總複習測驗獨立成一個單元）。B 節的時間統計也要依實際字數重算（目前已完成的單元每課 6–10 分鐘）。
- [ ] `design-system.md` 第 5.5 節已改成「< 768px 上下排列」；其他章節與實作是否一致，在階段 4 再核對一次。

補充說明（不是待辦）：
- 閱讀時間估算會排除 `svg` 與 `props` 的內容；0-2 與 2-6 手動指定了 `minutes`。
- 側邊選單會自動展開目前單元所在的模組；其他模組的展開狀態存在 `openModules`。
- 首頁的「你在這裡」，標示的是第一個「讀到一半」的單元所屬的模組。

---

## 10. 目前標註為「未確認」或需加註的項目

這些要放進最後的總結（階段 4 的要求）：

| 項目 | 狀態 | 課程中的處理 |
|------|------|-------------|
| Codex CLI 的預設模型（官方頁面摘要顯示「gpt-6.1-sol medium」） | 未交叉驗證 | 不寫模型名稱 |
| Codex 的 `auto_review` approval policy | 只出現在第三方文章 | 不寫 |
| Codex CLI 的指令細節 | 官方文件經摘要工具讀取（🟡） | 加註「依官方文件摘要，請以最新版為準」 |
| Claude Mythos 5.1／Mythos 5 | 出現在 prompting 文件，但不在模型總覽的比較表 | 不列入模型陣容 |
| Copilot CLI、Cursor、OpenCode、Aider、Cline | 只有第三方比較文章 | 只寫類別，不寫指令 |
| Gemini CLI 的版本號與預設模型 | 官方頁面沒寫 | 不寫 |
| OWASP 的 Agentic Top 10 | 官方頁面沒有列出條目 | 不引用 |
| Haiku 4.5 退役日「不早於 2026-10-15」 | 已確認 | 提到 Haiku 時加註 |

---

## 11. 下一步

寫模組 6 的資料區塊（6-1、6-2、6-3），插在 `<!-- @@DATA@@ -->` 之前，再用 8.2 的腳本檢查。
