# 設計系統：新野獸派（Neo-Brutalism）課程站

> 版本：v1（2026-10-02）・ 實作位置：`index.html` 開頭的 `:root` CSS 變數
> 視覺方向：**「工地告示牌 × 手作貼紙本」**——純黑粗框、零模糊的硬陰影、高飽和的平塗色塊、刻意的不對稱，資訊像貼紙一樣一張張貼上去。

---

## 1. 色彩 Token

全部定義在 `:root`；深色模式在 `@media (prefers-color-scheme: dark)` 搭配 `:root:not([data-theme="light"])` 時覆寫，也會在 `:root[data-theme="dark"]` 時覆寫（手動切換）。

### 1.1 中性色

| Token | 淺色 | 深色 | 用途 |
|-------|------|------|------|
| `--bg` | `#FFFDF5` 米白 | `#151515` | 頁面背景 |
| `--surface` | `#FFFFFF` | `#202020` | 卡片、面板 |
| `--ink` | `#0A0A0A` | `#FFFDF5` | 內文、邊框、陰影 |
| `--ink-muted` | `#454545` | `#C9C5B8` | 次要文字 |
| `--on-color` | `#0A0A0A` | `#0A0A0A` | **彩色底上的文字，兩種模式都用黑色** |
| `--link` | `#1747C9` | `#8FB4FF` | 連結 |
| `--focus` | `#0047FF` | `#FFD60A` | 焦點框 |
| `--code-bg` | `#111111` | `#0A0A0A` | 程式碼區塊（兩種模式都是深色） |

### 1.2 語意色（平塗，不用漸層）

| Token | 色值 | 黑字在其上的對比 | 用途 |
|-------|------|------------------|------|
| `--primary` | `#FFD60A` 黃 | 14.02 | 主要按鈕、目前位置 |
| `--accent` | `#FF7AB6` 粉 | 8.21 | 強調、貼紙 |
| `--success` | `#3DDC84` 綠 | 11.10 | 完成、正確、✅ 好 prompt |
| `--warning` | `#FFA62B` 橘 | 10.13 | 比喻的限制、注意 |
| `--danger` | `#FF5A5A` 紅 | 6.47 | 錯誤、❌ 壞 prompt |
| `--info` | `#5AA9FF` 藍 | 8.06 | 定義、提示 |
| `--highlight` | `#FFF08A` | 17.05 | 螢光筆標記 |

### 1.3 模組代表色

每個模組有一個代表色，用在：側邊選單的色塊、單元標題的貼紙、模組首頁的大色塊。

| 模組 | Token | 色值 | 黑字對比 |
|------|-------|------|----------|
| 0 課程導覽 | `--m0` | `#FFD60A` | 14.02 |
| 1 LLM 心智模型 | `--m1` | `#FF8FAB` | 9.21 |
| 2 Prompt 基本功 | `--m2` | `#5AA9FF` | 8.06 |
| 3 進階技巧 | `--m3` | `#7CE577` | 12.57 |
| 4 Context Engineering | `--m4` | `#FFA94D` | 10.40 |
| 5 Agent 原理 | `--m5` | `#B9A3FF` | 9.19 |
| 6 Harness | `--m6` | `#4FE0E0` | 12.32 |
| 7 Claude Code 實戰 | `--m7` | `#FF7A6B` | 7.78 |
| 8 實戰工作流 | `--m8` | `#B5F04A` | 14.64 |
| 9 除錯與評估 | `--m9` | `#FFB8F0` | 12.60 |
| 10 安全與界線 | `--m10` | `#FF5A5A` | 6.47 |
| 11 速查表 | `--m11` | `#D9D2BC` | 13.10 |

### 1.4 對比度驗證

以 WCAG 2.x 公式計算（腳本：`scratchpad/contrast.py`），**全部達到 AA（≥ 4.5:1）**：

| 組合 | 對比 |
|------|------|
| `--ink` / `--bg`（淺） | 19.44 |
| `--ink-muted` / `--bg`（淺） | 9.41 |
| `--link` / `--bg`（淺） | 7.41 |
| `--focus` / `--bg`（淺） | 6.16（非文字元素需 ≥ 3） |
| `--ink` / `--bg`（深） | 17.93 |
| `--ink-muted` / `--surface`（深） | 9.44 |
| `--link` / `--bg`（深） | 8.82 |
| 所有語意色與模組色 × 黑字 | 最低 6.47（`--danger`） |
| 程式碼：文字／關鍵字／字串／數字／註解／函式／屬性 on `#111` | 16.53 / 8.78 / 13.96 / 13.38 / 7.49 / 11.75 / 9.92 |

**規則**：彩色色塊上一律用 `--on-color`（黑字）；彩色**不**拿來當深色背景上的文字顏色。

---

## 2. 字體

從 Google Fonts 載入（`display=swap`）：

| 角色 | 字體 | 字重 | 用途 |
|------|------|------|------|
| `--font-display` | Archivo Black → Noto Sans TC 900 | 400（Archivo Black 只有一種字重） | 大標題（英數用 Archivo Black，中文落到 Noto Sans TC 900） |
| `--font-ui` | Space Grotesk → Noto Sans TC | 500、700 | 貼紙標籤、按鈕、數字、進度 |
| `--font-body` | Noto Sans TC | 400、500、700、900 | 內文 |
| `--font-mono` | JetBrains Mono | 400、700 | 程式碼、指令、kbd |

### 2.1 字級階層（行動優先，用 `clamp()` 往上放大）

| Token | 尺寸 | 行高 | 用途 |
|-------|------|------|------|
| `--fs-display` | `clamp(2.25rem, 5vw + 1rem, 4.5rem)` | 1.05 | 模組首頁大標 |
| `--fs-h1` | `clamp(1.875rem, 3vw + 1rem, 3rem)` | 1.15 | 單元標題 |
| `--fs-h2` | `clamp(1.375rem, 1.5vw + 1rem, 2rem)` | 1.25 | 段落標題 |
| `--fs-h3` | `1.25rem` | 1.35 | 卡片標題 |
| `--fs-body` | `1.0625rem`（17px） | 1.8 | 內文（中文需要較大的行高） |
| `--fs-small` | `0.9375rem` | 1.6 | 說明、表格 |
| `--fs-label` | `0.8125rem` | 1.2 | 貼紙標籤（Space Grotesk 700、字距 0.06em） |
| `--fs-code` | `0.9375rem` | 1.65 | 程式碼 |

閱讀欄寬上限 `--measure: 42rem`（約 38–42 個中文字）。

---

## 3. 間距、邊框、陰影、圓角

| Token | 值 |
|-------|-----|
| `--sp-1` … `--sp-9` | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 px（4 的倍數） |
| `--bw-sm` | `3px`：按鈕、徽章、輸入框、tab |
| `--bw-lg` | `4px`：卡片、區塊、對照器、程式碼區塊 |
| `--shadow-off` | `6px`：預設硬陰影位移 |
| `--shadow-off-hover` | `8px` |
| `--shadow-off-sm` | `4px`：小元件 |
| `--radius` | `0`：全站一致，不使用圓角 |

**陰影實作（符合「只對 transform、opacity 做動畫」）**
可互動的元件（`.nb-press`）不使用 `box-shadow` 動畫，而是：
- `::before` 是黑色的陰影層：`inset: 0; transform: translate(6px, 6px)`
- `::after` 是元件的底色加邊框
- 兩層都是 `z-index: -1`，元件本身設 `isolation: isolate`
- hover：元件 `translate(-2px, -2px)`，陰影層 `translate(8px, 8px)` → 看起來陰影從 6px 變成 8px
- active：元件 `translate(6px, 6px)`，陰影層 `translate(0, 0)` → 陰影歸零，模擬實體按壓
- 不互動的卡片就直接使用 `box-shadow: 6px 6px 0 var(--ink)`，不做動畫

---

## 4. 版面

- **斷點**（行動優先，`min-width`）：預設 = 375px 起；`--bp-md` 768px；`--bp-lg` 1280px
- **網格**：
  - < 768：單欄，側邊選單收進抽屜（`<dialog>` 樣式的抽屜，焦點鎖定、按 `Esc` 關閉）
  - ≥ 768：抽屜仍收合，內容區兩側留白加大，對照器維持上下排列
  - ≥ 1280：固定左側選單 `18rem` ＋ 內容欄（最多 `--measure` 寬）＋ 右側留白放「本課目錄」
- **刻意的不對稱**：
  - 單元標題貼紙旋轉 `-2deg`
  - 比喻卡與限制卡錯開 `--sp-4`
  - 模組首頁大色塊向左溢出內容欄
- **不得出現水平捲軸**：
  - 長程式碼在區塊內部捲動（`overflow-x: auto`）
  - 表格包在可捲動的容器裡
  - 旋轉元素預留外距

---

## 5. 元件規格

各元件的狀態一律依照下面這個格式寫：**預設（default）／ hover ／ 按下（active）／ 焦點（focus）／ 停用（disabled）**。

### 5.1 按鈕 `.btn`
- 變體：`primary`（黃底）、`secondary`（`--surface` 底）、`danger`、`icon`（44×44 最小點擊區）
- 預設：3px 黑框、4px 硬陰影、Space Grotesk 700
- hover：向左上浮起 2px，陰影變成 6px
- active：`translate(4px, 4px)`，陰影歸零
- focus：`outline: 3px solid var(--focus); outline-offset: 3px`（只在 `:focus-visible` 顯示）
- disabled：斜線網底（`repeating-linear-gradient` 只做紋理，不是漸層色）、`--ink-muted` 文字、無陰影、`cursor: not-allowed`

### 5.2 卡片 `.card`
- 4px 黑框、6px 硬陰影、`--surface` 底
- 可在左上角加模組色的「膠帶」貼紙（旋轉 `-3deg`）
- 可點擊的卡片套用 `.nb-press`，狀態同按鈕

### 5.3 提示框 `.callout`
- 左側 12px 的色帶 ＋ 4px 框；標題是一張貼紙標籤
- 變體：
  - `analogy`（比喻，`--info`）
  - `limit`（比喻的限制，`--warning`）
  - `define`（正式定義，`--surface` 搭配 `--info` 標籤）
  - `mistake`（常見錯誤，`--danger`）
  - `keypoints`（三個重點，`--primary`）
  - `legacy`（舊做法 → 新做法，`--m11`）
  - `unverified`（⚠️ 未確認，`--warning`）

### 5.4 程式碼區塊 `.code`
- 4px 框、`--code-bg` 底、上方標題列（語言名稱 ＋ 複製按鈕）
- 複製：點擊後按鈕文字換成「已複製 ✓」並套用 `--success` 底，1.5 秒後還原；同時用 `aria-live="polite"` 宣告「已複製到剪貼簿」
- 剪貼簿 API 失敗時，改為選取文字並顯示「請按 Ctrl/Cmd + C」
- 行內程式碼 `code`：2px 框、`--highlight` 底

### 5.5 Prompt 對照器 `.compare`
- 左 ✗ 壞（`--danger` 標籤）、右 ✓ 好（`--success` 標籤）；< 768px（手機）改為上下排列
- 差異以 `<mark data-n="1">` 標記編號，下方「為什麼有效」清單用相同編號對應
- 每個區塊各有一顆複製按鈕

### 5.6 分頁 `.tabs`
- 依 ARIA tabs pattern：`role="tablist"`，`←` `→` 切換、`Home` / `End` 跳到頭尾
- 選中的分頁：`--primary` 底，並與面板的框線相連；未選中：`--surface` 底

### 5.7 摺疊區 `details.reveal`
- `<summary>` 是一顆按鈕樣式的列：「我想好了，看答案 ▸」
- 展開：箭頭旋轉 90°，內容以 `translateY(-6px)` 和 `opacity: 0 → 1` 進場

### 5.8 測驗 `.quiz`
- 選擇題：`fieldset` ＋ `radio`，選項是一張張卡片
- 送出後：
  - 正確選項加 `--success` 底與 ✓
  - 選錯的選項加 `--danger` 底與 ✗
  - 顯示解析（為什麼對，以及常見的錯誤選項錯在哪）
- 「先思考再展開」題：`details.reveal`
- 分數存進進度紀錄；可以重做

### 5.9 進度條 `.progress`
- 3px 框的軌道，填充色為 `--primary`；用 `transform: scaleX()` 推進，搭配 `steps()` 或過衝曲線
- 附文字「12 / 49」，並設定 `role="progressbar"` 與 `aria-valuenow`

### 5.10 徽章／貼紙 `.badge`
- 3px 框、模組色或語意色底、Space Grotesk 700 大寫、旋轉 `-2deg` 到 `2deg`
- 狀態徽章：未讀（空心）、讀到一半（半格填色）、完成（`--success` ＋ ✓）

### 5.11 術語提示 `.term` ＋ `.tooltip`
- 術語加 2px 虛線底線，本身是一個 `<button>`
- hover、focus 或點擊時顯示 tooltip，按 `Esc` 關閉
- tooltip：3px 框、4px 陰影、最大寬度 `20rem`，畫面邊緣時自動翻轉方向
- 用 `aria-describedby` 連到 tooltip

### 5.12 搜尋 `.search`
- 頂部列的輸入框，按 `/` 聚焦
- 結果清單是 `role="listbox"`，用 `↑` `↓` 選擇、`Enter` 前往
- 結果分兩組：「課程」與「術語」

### 5.13 側邊導覽 `.nav`
- 樹狀選單：模組可以收合，用 `<button aria-expanded>`
- 單元連結旁顯示狀態徽章；目前所在的單元加 `--primary` 底，並設 `aria-current="page"`

### 5.14 鍵盤提示 `kbd`
- 2px 框、2px 陰影、JetBrains Mono

### 5.15 Agent loop 動畫 `.loop`
- SVG 環狀圖，5 個節點：觀察 → 思考 → 呼叫工具 → 取得結果 → 繼續（或結束）
- 控制鈕：上一步、播放／暫停、下一步、重設
- 目前節點填入 `--primary`；旁邊同步顯示一段模擬的對話紀錄

---

## 6. 動畫規範

**風格**：俐落、有彈性、帶點機械感；不使用柔和的淡入。

| Token | 值 | 用途 |
|-------|-----|------|
| `--dur-micro` | `120ms` | hover、按壓、勾選（範圍 100–150ms） |
| `--dur-comp` | `240ms` | 摺疊展開、tooltip、tab 切換（範圍 200–300ms） |
| `--dur-page` | `360ms` | 換課轉場（上限 400ms） |
| `--ease-snap` | `cubic-bezier(.34, 1.56, .64, 1)` | 輕微過衝的「啪」 |
| `--ease-mech` | `cubic-bezier(.2, .9, .3, 1)` | 機械式快進慢停 |
| `--ease-step` | `steps(4, end)` | 逐格效果（蓋章、進度格） |

**效果清單**
1. **卡片落定**：從 `translate(-10px, -14px) rotate(-1.5deg)`、`opacity: 0` 以 `--ease-snap` 落到原位；同一批卡片之間依序延遲 40ms，最多延遲 5 張
2. **按鈕按壓**：見 5.1
3. **答案展開**：見 5.7
4. **進度條推進**：`scaleX` 以 `--ease-snap` 推進
5. **完成蓋章**：徽章從 `scale(2.2) rotate(-18deg)`、`opacity: 0` 以 `--ease-step` 縮到 `scale(1) rotate(-6deg)`；同時頁面輕微震動一次，位移最多 2px
6. **換課轉場**：舊內容 `opacity: 0`，新內容從 `translateX(16px)` 滑入
7. **Agent loop**：節點高亮以 `steps(3)` 切換，箭頭用 `stroke-dashoffset` 流動

**限制**
- 只對 `transform` 和 `opacity` 做動畫（`stroke-dashoffset` 只用在 SVG 箭頭，屬於例外）
- 閃爍頻率不超過每秒 3 次

**`prefers-reduced-motion: reduce`**
- 所有 `animation` 與 `transition` 的位移效果一律關閉（時長設為 `0.01ms`）
- 保留狀態變化：展開／收合、選中的顏色、進度數字
- 蓋章直接顯示最終狀態
- Agent loop 不自動播放，只能逐步按「下一步」

---

## 7. 無障礙清單

- [ ] 語意標籤：`header`、`nav`、`main`、`article`、`aside`、`footer`；按鈕都用 `button`，連結都用 `a`
- [ ] 頁首有「跳到主要內容」連結
- [ ] 所有互動元素都能用 Tab 操作，並有可見的 `:focus-visible` 焦點框
- [ ] 換課後，焦點移到單元的 `h1`（設 `tabindex="-1"`）
- [ ] 進度與複製等狀態變化，用 `aria-live` 宣告
- [ ] 色彩不是唯一的訊號：正確／錯誤同時有 ✓／✗ 符號與文字
- [ ] 對比全部 ≥ 4.5:1（見 1.4）
- [ ] 375px 寬度下，最小點擊區為 44×44
