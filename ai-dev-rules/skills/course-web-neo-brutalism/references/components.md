# 元件與互動規範

每個元件都要寫齊五種狀態：預設、hover、按下、焦點、停用。焦點一律 `:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }`，最小點擊區 44×44。

## 1. 可拖曳寬度的側欄

只在 ≥ 1280px（固定側欄）時出現；手機與平板的抽屜不做拖曳。

需求：
- 側欄右緣放一條把手 `.sidebar-resizer`，寬 8px、可點擊範圍至少 12px，游標 `col-resize`。
- 範圍：最小 224px、最大 `min(480px, 40vw)`、預設 288px；雙擊把手恢復預設。
- 鍵盤：把手可 Tab 聚焦，`←` `→` 每次 16px，`Home` / `End` 跳到最小與最大。
- 無障礙：`role="separator"`、`aria-orientation="vertical"`、`aria-controls="sidebar"`、`aria-valuemin`／`max`／`now`、`aria-label="調整目錄寬度"`。
- 拖曳期間根元素加 `.is-resizing`：關閉版面轉場、`user-select: none`、全頁 `cursor: col-resize`。
- 寬度存在 `--sidebar-w`，寫進 localStorage，下次載入還原。
- 把手平常透明，看到的是側欄自己的 4px 邊框；hover 與焦點時在同一個位置換成 `--primary` 色並加寬（只換顏色與寬度，不加其他效果）。畫面上永遠只有一條線。
- 定位：把手和側欄放在同一個 grid 格子、一起 `position: sticky`、同高，不用 `position: fixed; bottom: 0`（捲到底會蓋過頁尾）。`top` 一律用量測出來的 `--topbar-h`。完整 CSS 見 [layout-geometry.md](layout-geometry.md) 第 3 節。
- 視窗 resize 時用偏好值重算，不用目前被夾住的值；沒拖過把手時，預設寬度隨字級放大（288px × 字級）。

```html
<div class="sidebar-resizer" role="separator" tabindex="0"
     aria-orientation="vertical" aria-controls="sidebar" aria-label="調整目錄寬度"
     aria-valuemin="224" aria-valuemax="480" aria-valuenow="288"></div>
```

```js
const SIDEBAR_WIDTH = { min: 224, max: 480, step: 16, fallback: 288 };
const root = document.documentElement;
const resizer = document.querySelector('.sidebar-resizer');

const maxSidebarWidth = () => Math.min(SIDEBAR_WIDTH.max, Math.round(window.innerWidth * 0.4));

function applySidebarWidth(px) {
  const width = Math.round(Math.min(maxSidebarWidth(), Math.max(SIDEBAR_WIDTH.min, px)));
  root.style.setProperty('--sidebar-w', `${width}px`);
  resizer.setAttribute('aria-valuenow', String(width));
  resizer.setAttribute('aria-valuemax', String(maxSidebarWidth()));
  return width;
}

resizer.addEventListener('pointerdown', (event) => {
  resizer.setPointerCapture(event.pointerId);
  root.classList.add('is-resizing');
});
resizer.addEventListener('pointermove', (event) => {
  if (!resizer.hasPointerCapture(event.pointerId)) return;
  // 側欄貼齊視窗左緣，所以指標的 x 座標就是新寬度
  applySidebarWidth(event.clientX);
});
resizer.addEventListener('lostpointercapture', () => {
  root.classList.remove('is-resizing');
  prefs.set('sidebarWidth', parseInt(resizer.getAttribute('aria-valuenow'), 10));
});
resizer.addEventListener('dblclick', () => prefs.set('sidebarWidth', applySidebarWidth(SIDEBAR_WIDTH.fallback)));
resizer.addEventListener('keydown', (event) => {
  const current = parseInt(resizer.getAttribute('aria-valuenow'), 10);
  const next = {
    ArrowLeft: current - SIDEBAR_WIDTH.step,
    ArrowRight: current + SIDEBAR_WIDTH.step,
    Home: SIDEBAR_WIDTH.min,
    End: maxSidebarWidth(),
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  prefs.set('sidebarWidth', applySidebarWidth(next));
});
applySidebarWidth(prefs.get('sidebarWidth') ?? SIDEBAR_WIDTH.fallback);
```

`prefs` 是包了 try/catch 的 localStorage 讀寫；失敗時退回記憶體並 `console.warn` 寫出哪個 key 失敗。

## 2. 字級調整

- 放在頂部列：`A−`、目前百分比、`A+` 三個按鈕，加一個「重設」。手機版收進設定選單；平板寬度加上大字級放不下時也收進去（本站 1100px 以下）。頂部列的排版規則見 [layout-geometry.md](layout-geometry.md) 第 2 節。
- 字級 ≥ 137.5% 時收起右側本課目錄，把寬度還給內容欄。
- 段數：87.5%、100%、112.5%、125%、137.5%、150%；到頭時按鈕停用。
- 實作：設定 `--font-scale`，`html { font-size: calc(var(--font-scale, 1) * 100%); }`。全站字級、間距用 rem，所以整頁一起縮放。
- 按鈕 `aria-label="縮小字級"`／`"放大字級"`；改變後用 `aria-live="polite"` 宣告「字級 112%」。
- 寫進 localStorage，頁面載入時在第一次繪製前套用（放在 `<head>` 的小 script），避免閃爍。
- 驗證：150% 時 375px 寬度不能有水平捲軸，側欄與 popup 不能被裁切。

## 3. Hover：只用一個訊號通道

| 元素 | 預設 | hover | 不要做 |
|---|---|---|---|
| 內文連結 | `--link` 色 ＋ 2px 底線 | 底色換 `--highlight`、文字換 `--on-color`，底線不變 | 同時改底線粗細 |
| 側欄單元連結 | 無底線 | 底色換 `--surface` 或 `--highlight` | 再加底線 |
| 本課目錄連結 | 無底線 | 左側 4px 色條或底色擇一 | 底色 ＋ 底線 |
| 術語 | 2px 虛線底線 | 底色換 `--highlight`，虛線不變 | 改成實線 |
| 按鈕、卡片 | 硬陰影 | 浮起（transform） | 再改底色或加底線 |
| 選擇題選項 | `--bg` 底 | 底色換 `--highlight` | 加底線或改框線粗細 |

規則：
- 一個元素在 hover 時只選一種變化：底色／文字色，或底線，或位移。
- 內文連結的底線是「辨識用」，一直都在；不是 hover 效果。
- hover 樣式寫在 `@media (hover: hover) and (pointer: fine)` 裡，避免觸控裝置點完後卡在 hover 狀態。
- 每個 hover 狀態都要有對應的 `:focus-visible` 樣式，鍵盤使用者看得到同樣的回饋。
- hover 後的「文字 × 底色」對比要重算（見 design-tokens.md 第 2 節）。
- 顏色變化用 `transition: background-color var(--dur-micro), color var(--dur-micro)`。

## 4. 轉場要完整

每個「出現／消失」都要有進場和退場。清單：

| 元件 | 進場 | 退場 |
|---|---|---|
| 下拉選單、設定選單 | 從觸發按鈕往下滑 8px ＋ 淡入 | 反向 |
| 側欄模組展開 | 高度 0 → 內容高度 ＋ 內容淡入 | 反向，結束後才設 `visibility: hidden` |
| `details` 答案區 | 高度展開 ＋ 內容下滑淡入 | 高度收合（支援時） |
| tooltip / popup | 往上 4px ＋ 淡入 | 淡出 |
| 手機抽屜 | 從左滑入，背景遮罩淡入 | 反向 |
| 分頁切換 | 新面板淡入 ＋ 水平滑入 8px | 舊面板淡出 |
| 測驗回饋 | 解析區滑入；正確選項換色 | 重做時反向 |
| 換課 | 舊內容淡出、新內容從右 16px 滑入 | — |
| 深淺色切換 | 背景與文字色 240ms 漸變 | — |
| 複製成功提示 | 按鈕文字與底色換成成功狀態 | 1.5 秒後換回 |

拖曳側欄時不做轉場（直接跟手）。

### 4.1 摺疊與下拉的高度動畫

用 grid 列高 `0fr ↔ 1fr`，所有現代瀏覽器都能動畫，不需要量高度。這是「只動 transform、opacity」的唯一例外，只用在摺疊區。

```css
.collapse {
  display: grid;
  grid-template-rows: 0fr;
  visibility: hidden;
  transition: grid-template-rows var(--dur-comp) var(--ease-mech),
              visibility 0s linear var(--dur-comp);
}
.collapse[data-open="true"] {
  grid-template-rows: 1fr;
  visibility: visible;
  transition: grid-template-rows var(--dur-comp) var(--ease-mech);
}
.collapse > .collapse-inner { min-height: 0; overflow: hidden; }
.collapse > .collapse-inner > * {
  opacity: 0; transform: translateY(-6px);
  transition: opacity var(--dur-comp), transform var(--dur-comp) var(--ease-mech);
}
.collapse[data-open="true"] > .collapse-inner > * { opacity: 1; transform: none; }
```

- 收合時延後 `visibility: hidden`，退場動畫跑完才把內容移出 Tab 順序。
- 觸發按鈕用 `aria-expanded` 與 `aria-controls`；不要用 `hidden` 屬性，它會讓退場動畫消失。

### 4.2 `<details>` 的高度動畫

```css
:root { interpolate-size: allow-keywords; }
details.reveal::details-content {
  block-size: 0; overflow: clip;
  transition: block-size var(--dur-comp) var(--ease-mech),
              content-visibility var(--dur-comp) allow-discrete;
}
details.reveal[open]::details-content { block-size: auto; }
```

未查證：截至 2026-10 搜到的資料對 Firefox、Safari 是否支援 `interpolate-size` 說法不一。使用前到 caniuse 確認；不支援的瀏覽器會直接展開，內容淡入動畫仍要保留，所以不會壞。

### 4.3 浮層的退場

`hidden` 屬性與 `display: none` 會直接切斷動畫。做法擇一：
- 用 `data-state="open|closing|closed"`：關閉時先設 `closing` 跑淡出，`transitionend` 後再設 `hidden`。
- 或用 `transition-behavior: allow-discrete` ＋ `@starting-style`，讓 `display` 也能參與轉場（使用前查 caniuse）。

### 4.4 reduced-motion

`@media (prefers-reduced-motion: reduce)`：位移、縮放、高度動畫一律關閉；保留 120ms 以內的淡入淡出與顏色變化，讓狀態改變仍看得出來。自動播放的動畫改成手動逐步。

## 5. 術語 popup

這是課程站的必備元件：讀者不用離開段落就能查懂術語。

### 5.1 資料

- 術語集中在 `defineTerms({ 術語: { en, def, example?, lesson? } })`，一個術語只定義一次。
- `def` 1–2 句，用讀者已經學過的詞解釋；`example` 一句具體例子；`lesson` 指向正式教這個術語的單元。
- 內文寫 `[[術語]]` 或 `[[術語|顯示文字]]`；找不到的術語渲染成醒目的 `.term-missing`，驗證時要是 0 個。
- 每課只把第一次出現的術語包起來，後面重複出現不包，避免滿頁虛線。

### 5.2 外觀

- 觸發元素是 `<button class="term">`，2px 虛線底線，`cursor: help`；hover 只換底色（第 3 節）。
- popup：`--surface` 底、3px 黑框、4px 硬陰影、最大寬 `min(20rem, 100vw - 32px)`。
- 內容順序：術語（粗體）→ 英文（`--font-ui`、`--ink-muted`）→ 解釋 → 例子 →「在第 N 課學到」連結。

### 5.3 行為（符合 WCAG 1.4.13）

- 出現：hover 停留 150ms、鍵盤 focus、點擊或觸控。點擊後固定，直到點外面或按 `Esc`。
- 可 hover：滑鼠從術語移到 popup 上時不能消失（popup 不設 `pointer-events: none`；術語與 popup 之間的空隙用 100ms 延遲關閉補上）。
- 可關閉：`Esc` 關閉且焦點回到術語。
- 持續：不自動消失。
- 位置：預設在術語下方；空間不夠就翻到上方；左右貼齊視窗 16px 內。
- 無障礙：沒有連結時用 `role="tooltip"` ＋ `aria-describedby`；有「在第 N 課學到」這類連結時改成非模態 popover（`aria-expanded` ＋ `aria-controls`），讓連結能被 Tab 到。
- 有進場與退場動畫（第 4 節）。

## 6. 其他元件

沿用參考站的規格：

| 元件 | 重點 |
|---|---|
| 按鈕 `.btn` | primary（黃）、secondary、danger、icon；按壓見 design-tokens.md 第 4 節 |
| 提示框 `.callout` | 左側 12px 色帶 ＋ 貼紙標題；變體：analogy、limit、define、mistake、keypoints、legacy、unverified |
| 程式碼 `.code` | 深色底、語言標籤、複製按鈕；成功時換成功色並 `aria-live` 宣告；Clipboard 失敗時選取文字並提示快捷鍵 |
| Prompt 對照器 `.compare` | 左壞右好（手機上下排）；差異用編號 `<mark>`，下方「為什麼」清單同編號 |
| 分頁 `.tabs` | ARIA tabs pattern；`←` `→` `Home` `End` |
| 答案區 `details.reveal` | summary 寫「我想好了，看答案」；高度動畫見 4.2 |
| 進度條 `.progress` | `transform: scaleX()`；`role="progressbar"` ＋ 文字「12 / 50」 |
| 徽章 `.badge` | 未讀、讀到一半、完成三態；完成時蓋章動畫 |
| 搜尋 `.search` | `/` 聚焦；`role="listbox"`；分「課程」「術語」兩組 |
| 側欄 `.nav` | 模組用 `<button aria-expanded>` 收合（動畫見 4.1）；目前單元 `aria-current="page"` |
| 鍵盤 | `←` `→` 換課、`/` 搜尋、全部可 Tab |
| 元件樣式表 | `#/styleguide` 列出所有元件與狀態，改樣式後先看這頁 |
