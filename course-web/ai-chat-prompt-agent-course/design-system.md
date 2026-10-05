# 設計系統：新野獸派（Neo-Brutalism）課程站

> 版本：v2（2026-10-05）・實作位置：`index.html` 開頭的 `:root` CSS 變數
> 依據：skill `course-web-neo-brutalism`（含 references 的 design-tokens、components、layout-geometry、line-breaking）
> 視覺方向：「工地告示牌 × 手作貼紙本」：純黑粗框、零模糊的硬陰影、高飽和的平塗色塊、刻意的不對稱。

v1 → v2 的主要變更：

| 項目 | v1 | v2 |
|------|----|----|
| `--danger`、`--m10` | `#FF5A5A`（黑字 6.47） | `#FF6B6B`（黑字 7.13，達 7:1） |
| 側欄 | 固定 `18rem` | 可拖曳 224–480px，鍵盤可調，記住寬度 |
| 字級 | 不能調 | 頂部列 6 段（87.5%–150%），記住設定 |
| 術語提示 | tooltip，`pointer-events: none` | popup，可 hover 進去、`Esc` 關閉（WCAG 1.4.13） |
| 摺疊與浮層 | `hidden` 直接切換 | 進場與退場都有轉場（grid-rows、`data-open`） |
| 頂部列高度 | 寫死 64px | 量測後寫回 `--topbar-h` |
| 標題換行 | 瀏覽器預設 | 資料用 `|` 標詞組斷點，孤行時縮字（下限 80%） |
| 選擇題 | `explain` ＋ 選填 `whyWrong` | 每個選項都有 `why` |
| 圖解 | 手寫 SVG，字級 13–20 | 圖解產生器 `Diagram`，viewBox 600、字級 24 |

---

## 1. 色彩 Token

深色模式寫兩次：`@media (prefers-color-scheme: dark)` 搭配 `:root:not([data-theme="light"])`，以及 `:root[data-theme="dark"]`（手動切換）。

### 1.1 中性色

| Token | 淺色 | 深色 | 用途 |
|-------|------|------|------|
| `--bg` | `#FFFDF5` | `#151515` | 頁面背景 |
| `--surface` | `#FFFFFF` | `#202020` | 卡片、面板、popup |
| `--ink` | `#0A0A0A` | `#FFFDF5` | 內文、邊框、陰影 |
| `--ink-muted` | `#454545` | `#C9C5B8` | 次要文字 |
| `--on-color` | `#0A0A0A` | `#0A0A0A` | 彩色色塊上的文字，兩種模式都是黑色 |
| `--link` | `#1747C9` | `#8FB4FF` | 連結 |
| `--focus` | `#0047FF` | `#FFD60A` | 焦點框 |
| `--code-bg` | `#111111` | `#0A0A0A` | 程式碼區塊 |

### 1.2 語意色與模組色

| Token | 色值 | 黑字對比 |
|-------|------|----------|
| `--primary`、`--m0` | `#FFD60A` | 14.02 |
| `--accent` | `#FF7AB6` | 8.21 |
| `--success` | `#3DDC84` | 11.10 |
| `--warning` | `#FFA62B` | 10.13 |
| `--danger`、`--m10` | `#FF6B6B` | 7.13 |
| `--info`、`--m2` | `#5AA9FF` | 8.06 |
| `--highlight` | `#FFF08A` | 17.05 |
| `--neutral`、`--m11` | `#D9D2BC` | 13.10 |
| `--m1` | `#FF8FAB` | 9.21 |
| `--m3` | `#7CE577` | 12.57 |
| `--m4` | `#FFA94D` | 10.40 |
| `--m5` | `#B9A3FF` | 9.19 |
| `--m6` | `#4FE0E0` | 12.32 |
| `--m7` | `#FF7A6B` | 7.78 |
| `--m8` | `#B5F04A` | 14.64 |
| `--m9` | `#FFB8F0` | 12.60 |

### 1.3 對比度驗證（2026-10-05）

以 WCAG 2.x 公式計算（design-tokens.md 2.1 的腳本）：

| 組合 | 對比 | 要求 |
|------|------|------|
| 內文 `--ink`／`--bg`（淺／深） | 19.44／17.93 | 7 |
| 內文 `--ink`／`--surface`（淺／深） | 19.80／16.00 | 7 |
| 次要文字 `--ink-muted`／`--bg`（淺／深） | 9.41／10.58 | 4.5 |
| 次要文字 `--ink-muted`／`--surface`（淺／深） | 9.59／9.44 | 4.5 |
| 連結 `--link`／`--bg`（淺／深） | 7.41／8.82 | 7 |
| 連結 `--link`／`--surface`（淺／深） | 7.55／7.87 | 7 |
| 黑字在所有語意色與模組色上 | 最低 7.13（`--danger`、`--m10`） | 7 |
| 程式碼文字 `#F2F0E6`／`#111111` | 16.53 | 7 |
| 程式碼註解 `#A3A3A3`／`#111111` | 7.49 | 4.5 |
| 焦點框 `--focus`／`--bg`（淺／深） | 6.16／12.94 | 3（非文字） |

**最低的文字組合：黑字在 `--danger` 上，7.13。** 彩色色塊上一律用 `--on-color`；彩色不拿來當深色背景上的文字。

---

## 2. 字體與字級

| 角色 | 字體 | 用途 |
|------|------|------|
| `--font-display` | Archivo Black → Noto Sans TC 900 | 大標題 |
| `--font-ui` | Space Grotesk → Noto Sans TC | 貼紙標籤、按鈕、數字 |
| `--font-body` | Noto Sans TC 400／500／700／900 | 內文 |
| `--font-mono` | JetBrains Mono | 程式碼、kbd |

| Token | 尺寸 | 行高 |
|-------|------|------|
| `--fs-display` | `clamp(2.25rem, 5vw + 1rem, 4.5rem)` | 1.1 |
| `--fs-h1` | `clamp(1.875rem, 3vw + 1rem, 3rem)` | 1.2 |
| `--fs-h2` | `clamp(1.375rem, 1.5vw + 1rem, 2rem)` | 1.25 |
| `--fs-h3` | `1.25rem` | 1.35 |
| `--fs-body` | `1.0625rem` | 1.8 |
| `--fs-small` | `0.9375rem` | 1.6 |
| `--fs-label` | `0.8125rem` | 1.2 |
| `--fs-code` | `0.9375rem` | 1.65 |

- 字級調整：`html { font-size: calc(var(--font-scale, 1) * 100%) }`，6 段 87.5%–150%；`<head>` 的小 script 在第一次繪製前套用。
- 字級 ≥ 137.5% 時收起右側本課目錄（`:root[data-large-text]`）。
- 閱讀欄寬 `--measure: 42rem`。

---

## 3. 間距、邊框、陰影

| Token | 值 |
|-------|-----|
| `--sp-1` … `--sp-9` | 4／8／12／16／24／32／48／64／96 px |
| `--bw-sm`／`--bw-lg` | 3px／4px |
| `--shadow-off`／`-hover`／`-sm` | 6／8／4 px，零模糊 |
| `--radius` | 0 |

可互動元件（`.nb-press`）的陰影用偽元素，只動 `transform`：`::before` 陰影層、`::after` 底色加框；hover 元件 `translate(-2px, -2px)`，active `translate(var(--off), var(--off))`。

連續的圖解或互動元件之間多留 `--sp-6`：硬陰影會吃掉 16px 的間距。

---

## 4. 版面

- 斷點：預設 375px 起、768px、1100px（字級按鈕從「Aa」選單移到頂部列）、1280px（固定側欄）。
- ≥ 1280：`grid-template-columns: var(--sidebar-w) minmax(0, 1fr) 14rem`；首頁、模組頁沒有本課目錄時改成兩欄（`.layout.no-toc`）。
- 側欄與把手放在同一個 grid 格子，一起 `position: sticky; top: var(--topbar-h)`，捲到底時停在頁尾上緣。
- 頂部列子元素 `flex: none`，只有搜尋框伸縮；圖示按鈕固定 44×44。
- 量測結果（2026-10-05，1280px）：頁面最上方 頂部列底線＝側欄頂端＝把手頂端＝68px；捲到最底 側欄底＝把手底＝頁尾上緣；側欄邊框與把手線同在 x＝288。

---

## 5. 元件

每個元件都有預設、hover、按下、焦點、停用五種狀態；焦點一律 `outline: 3px solid var(--focus); outline-offset: 3px`。完整的樣子看 `#/styleguide`。

| 元件 | 重點 |
|------|------|
| 按鈕 `.btn` | primary、secondary、success、danger、small、big、icon（44×44）；`white-space: nowrap` |
| 提示框 `.callout` | 左側 12px 色帶＋貼紙標題；analogy、limit、define、mistake、keypoints、legacy、tip、danger、unverified、timely |
| 對照器 `.compare` | 左 ✗ 右 ✓（< 768px 上下排）；差異用編號 `<mark>`；`code: true` 時用等寬字 |
| 程式碼 `.code` | 深色底、語言標籤、複製按鈕；失敗時選取文字並提示快捷鍵 |
| 分頁 `.tabs` | ARIA tabs；舊面板淡出、新面板淡入並滑入 8px |
| 答案區 `details.reveal` | `::details-content` 高度動畫＋內容淡入 |
| 測驗 `.quiz` | 選項依題目 key 固定打亂；送出後每個選項都有解析，選中的排最上面 |
| 術語 `.term`＋`.term-pop` | hover 150ms 後出現、可移進 popup、點擊固定、`Esc` 關閉並把焦點還給術語、空間不夠時翻到上方 |
| 側欄 `.nav` | 模組用 `<button aria-expanded>`＋grid-rows 摺疊；目前單元 `aria-current="page"`；能力評估後顯示「建議起點」 |
| 側欄把手 `.sidebar-resizer` | `role="separator"`，`←` `→` 每次 16px、`Home`／`End`、雙擊恢復預設 |
| 搜尋 `.search` | `/` 聚焦、`role="listbox"`、分「課程」「術語」兩組 |

本課程特有的互動元件：

| 元件 | 單元 | 說明 |
|------|------|------|
| `builder` | 2-6 | 6 個積木即時組合 prompt，可切換 XML 分區，範本可以送進來 |
| `assessment` | 0-2 | 10 題能力評估，送出後每題都有解析，結果決定建議起點 |
| `sampler` | 1-1 | 依機率抽下一個 token，連抽 20 次看比例 |
| `loop` | 5-1 | 官方三階段（收集情境 → 採取行動 → 驗證結果）逐步播放；reduced-motion 時不自動播放 |
| `checklist` | 9-1 | 10 項檢查清單，勾選狀態會保存 |
| `templates` | 11-1 | 10 個 prompt 範本，可複製或送進組裝器 |

---

## 6. 圖解產生器 `Diagram`

位置：第一個 `<script>` 的最後。座標由節點算出線段端點（layout-geometry.md 5.1），文字依 `|` 分行，`|` 不夠時用 `Intl.Segmenter` 在詞的邊界換行，並避免一行只剩 1 個字。

| 函式 | 用途 |
|------|------|
| `Diagram.flow` | 流程圖，超過 `cols` 個時蛇形換行 |
| `Diagram.compare` | 左右對照（✗／✓ 或兩種做法） |
| `Diagram.hub` | 架構圖：中心元件＋上下兩排職責 |
| `Diagram.layers` | 巢狀方框（外層包住內層） |
| `Diagram.timeline` | 時間軸；主線從第一個節點中心畫到最後一個 |
| `Diagram.bars` | 橫條圖 |
| `Diagram.segments` | 堆疊條＋圖例 |

規格：viewBox 寬 600、字級 24（375px 手機縮放後約 12px）；桌面最大寬 32rem，圖裡的字約 20px，和內文同一層級。放不下的文字會進 `Diagram.warnings` 並 `console.warn`。

---

## 7. 動畫

| Token | 值 | 用途 |
|-------|-----|------|
| `--dur-micro` | 120ms | hover、按壓、顏色 |
| `--dur-comp` | 240ms | 下拉、摺疊、popup、分頁 |
| `--dur-page` | 360ms | 換課 |
| `--ease-snap` | `cubic-bezier(.34, 1.56, .64, 1)` | 位移與縮放 |
| `--ease-mech` | `cubic-bezier(.2, .9, .3, 1)` | 高度與滑動 |
| `--ease-step` | `steps(4, end)` | 蓋章 |

- 只動 `transform`、`opacity`、顏色；例外是摺疊區的高度（grid-rows、`::details-content`）與 SVG 的 `stroke-dashoffset`。
- `prefers-reduced-motion: reduce`：位移、縮放、高度動畫關閉，保留 120ms 內的淡入淡出與顏色；迴圈動畫改成手動逐步。

---

## 8. 無障礙

- [x] 語意標籤、「跳到主要內容」連結、換課後焦點移到 `h1`
- [x] 所有互動元素可用 Tab 操作並有焦點樣式；把手、分頁、搜尋有完整的鍵盤操作
- [x] 狀態變化（複製、字級、評估結果、取樣）用 `aria-live` 宣告
- [x] 顏色不是唯一的訊號：✓／✗ 都搭配文字
- [x] 文字對比 ≥ 7:1，非文字 ≥ 3:1（1.3 節）
- [x] 10 種寬度都沒有水平捲軸，圖示按鈕都是 44×44
