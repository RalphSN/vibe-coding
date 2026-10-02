# 設計 Token 與對比規範

所有 token 定義在 `:root`。深色模式寫兩次：`@media (prefers-color-scheme: dark)` 搭配 `:root:not([data-theme="light"])`，以及 `:root[data-theme="dark"]`（手動切換）。

## 1. 色彩

### 1.1 中性色

| Token | 淺色 | 深色 | 用途 |
|---|---|---|---|
| `--bg` | `#FFFDF5` 米白 | `#151515` | 頁面背景 |
| `--surface` | `#FFFFFF` | `#202020` | 卡片、面板、popup |
| `--ink` | `#0A0A0A` | `#FFFDF5` | 內文、邊框、陰影 |
| `--ink-muted` | `#454545` | `#C9C5B8` | 次要文字 |
| `--on-color` | `#0A0A0A` | `#0A0A0A` | 彩色色塊上的文字，兩種模式都是黑色 |
| `--link` | `#1747C9` | `#8FB4FF` | 連結 |
| `--focus` | `#0047FF` | `#FFD60A` | 焦點框 |
| `--code-bg` | `#111111` | `#0A0A0A` | 程式碼區塊，兩種模式都是深色 |

### 1.2 語意色（平塗，不用漸層）

| Token | 色值 | 黑字對比 | 用途 |
|---|---|---|---|
| `--primary` | `#FFD60A` | 14.02 | 主要按鈕、目前位置 |
| `--accent` | `#FF7AB6` | 8.21 | 強調、貼紙 |
| `--success` | `#3DDC84` | 11.10 | 正確、完成 |
| `--warning` | `#FFA62B` | 10.13 | 比喻的限制、注意 |
| `--danger` | `#FF6B6B` | 7.13 | 錯誤（參考站用 `#FF5A5A` 只有 6.47，不到 7:1，改用這個） |
| `--info` | `#5AA9FF` | 8.06 | 定義、提示 |
| `--highlight` | `#FFF08A` | 17.05 | 螢光筆、hover 底色 |

### 1.3 模組代表色

每個模組一個色，用在側欄色塊、單元標題貼紙、模組首頁大色塊。挑色時黑字對比要 ≥ 7:1。參考站驗證過的一組：

`#FFD60A` `#FF8FAB` `#5AA9FF` `#7CE577` `#FFA94D` `#B9A3FF` `#4FE0E0` `#FF7A6B` `#B5F04A` `#FFB8F0` `#FF6B6B` `#D9D2BC`（黑字對比 7.13–14.64）

## 2. 對比規範

依據：WCAG 2.2 是目前的合規標準。WCAG 3 仍是草案，對比演算法截至 2026-04 尚未決定，APCA 已在 2023 年移出草案（[Adrian Roselli, 2026-04](https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html)）。課程站以長時間閱讀為主，所以內文目標拉到 AAA。

| 對象 | 最低對比 | 說明 |
|---|---|---|
| 內文、標題、表格文字 | 7:1 | WCAG AAA；淺色模式黑字對米白是 19.44 |
| 次要文字、說明、標籤、placeholder | 4.5:1 | 目標仍是 7:1 |
| 連結文字 | 7:1 | 對 `--bg` 與 `--surface` 都要算 |
| 非文字 UI（邊框、焦點框、圖示、圖表線） | 3:1 | 對相鄰顏色計算 |
| hover、選中、正確／錯誤等狀態 | 同上 | 每個狀態的「文字色 × 底色」都要重算 |

規則：
- 淺色背景只配深色文字；深色背景只配淺色文字。不做「中灰配中灰」。
- 彩色色塊上的文字一律 `--on-color`（黑），深色模式也一樣。
- 彩色不拿來當文字顏色（連結除外）；尤其不在深色背景上用彩色字。
- 文字不直接壓在圖片、漸層、半透明底上。需要時先墊一塊實色底，再對實色底計算。
- 停用狀態不靠降低對比表達；用斜線網底 ＋ 文字說明「已停用」。
- 可以用 APCA 當輔助檢查（Chrome DevTools 有內建）：內文 Lc ≥ 75、偏好 Lc ≥ 90；但合規以 WCAG 2.2 的比值為準。

### 2.1 對比計算腳本

改色之後跑一次，把結果寫進 `design-system.md`：

```js
// WCAG 2.x 相對亮度與對比比值
const luminance = (hex) => {
  const v = hex.replace('#', '');
  return [0, 2, 4]
    .map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
```

驗證時列出每一組「文字 × 底色」，標出最低的一組。

## 3. 字體

從 Google Fonts 載入，`display=swap`：

| 角色 | 字體 | 用途 |
|---|---|---|
| `--font-display` | Archivo Black → Noto Sans TC 900 | 大標題 |
| `--font-ui` | Space Grotesk → Noto Sans TC | 貼紙標籤、按鈕、數字 |
| `--font-body` | Noto Sans TC 400／500／700／900 | 內文 |
| `--font-mono` | JetBrains Mono | 程式碼、kbd |

### 3.1 字級（一律用 rem，字級調整才會生效）

| Token | 尺寸 | 行高 |
|---|---|---|
| `--fs-display` | `clamp(2.25rem, 5vw + 1rem, 4.5rem)` | 1.05 |
| `--fs-h1` | `clamp(1.875rem, 3vw + 1rem, 3rem)` | 1.15 |
| `--fs-h2` | `clamp(1.375rem, 1.5vw + 1rem, 2rem)` | 1.25 |
| `--fs-h3` | `1.25rem` | 1.35 |
| `--fs-body` | `1.0625rem` | 1.8（中文需要較大行高） |
| `--fs-small` | `0.9375rem` | 1.6 |
| `--fs-label` | `0.8125rem` | 1.2 |
| `--fs-code` | `0.9375rem` | 1.65 |

- 閱讀欄寬 `--measure: 42rem`（約 38–42 個中文字）。
- 不在 `html` 設 px 字級；`html { font-size: calc(var(--font-scale, 1) * 100%); }`，尊重瀏覽器預設字級。
- 邊框、陰影位移用 px（字放大時框線不該變粗）；其他尺寸用 rem。

## 4. 間距、邊框、陰影

| Token | 值 |
|---|---|
| `--sp-1` … `--sp-9` | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 px |
| `--bw-sm` / `--bw-lg` | 3px（按鈕、輸入框）／ 4px（卡片、區塊） |
| `--shadow-off` / `-hover` / `-sm` | 6px / 8px / 4px，零模糊 |
| `--radius` | 0，全站不用圓角 |

可互動元件的陰影用偽元素做，hover 時只動 `transform`：
- `::before` 是陰影層 `translate(6px, 6px)`；`::after` 是底色加框；元件 `isolation: isolate`。
- hover：元件 `translate(-2px, -2px)`、陰影層 `translate(8px, 8px)`。
- active：元件 `translate(6px, 6px)`、陰影層歸零，模擬按壓。

## 5. 動畫 Token

| Token | 值 | 用途 |
|---|---|---|
| `--dur-micro` | 120ms | hover、按壓、顏色變化 |
| `--dur-comp` | 240ms | 下拉、摺疊、tooltip、分頁 |
| `--dur-page` | 360ms | 換課、抽屜（上限 400ms） |
| `--ease-snap` | `cubic-bezier(.34, 1.56, .64, 1)` | 輕微過衝，用在位移與縮放 |
| `--ease-mech` | `cubic-bezier(.2, .9, .3, 1)` | 快進慢停，用在高度與滑動 |
| `--ease-step` | `steps(4, end)` | 蓋章、進度格 |

高度變化不用 `--ease-snap`：過衝會讓內容上下彈跳。

## 6. 版面

- 斷點（行動優先，`min-width`）：預設 375px 起、768px、1280px。
- < 1280：側欄是抽屜（焦點鎖定、`Esc` 關閉）。
- ≥ 1280：固定側欄 `var(--sidebar-w)` ＋ 內容欄（最多 `--measure`）＋ 右側本課目錄。
- 刻意的不對稱：標題貼紙旋轉 `-2deg`、比喻卡與限制卡錯開、模組首頁色塊向左溢出。
- 不能出現水平捲軸：長程式碼與表格在容器內捲動，旋轉元素預留外距。
- 頂部列高度不寫死，量測後寫回 `--topbar-h`；頂部列子元素 `flex: none`，只有搜尋框伸縮；右側與底部 padding 多留硬陰影的位移。
- 沒有內容的欄位不留空（例如非單元頁的右側目錄）；卡片網格的欄數用 container query 依容器寬度決定。
- grid／flex 子項內容可能有長英文或 `code` 時，加 `min-width: 0`。
- 細節與檢查腳本見 [layout-geometry.md](layout-geometry.md)。
