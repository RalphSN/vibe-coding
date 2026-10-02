<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# 版面與圖解的幾何對齊

適用：頂部列、側欄與把手、內容欄、所有 SVG 圖解。
來源：2026-10-02 製作 `claude-code-secure-dev-course/` 時，使用者三輪回報的問題（見第 7 節），以及修正時實測過的做法。

核心原則：**「沒有溢出」不等於「有對齊」**。每個邊界都要有對齊的對象，而且要在頁面最上方與捲到最底兩個位置都量過。

## 1. 判斷基準

1. 線對線：頂部列底線、側欄頂端、把手頂端在同一個 y；側欄邊框和把手的線在同一個 x；捲到頁尾時，側欄與把手的底端都停在頁尾上緣。
2. 元件不被壓縮：圖示按鈕在任何寬度都是 44×44；相鄰按鈕之間的空隙大於硬陰影的位移（4px），看得出間隔。
3. 沒有空欄：一個欄位沒有內容時，版面不保留它的寬度。
4. 圖解的線有起點和終點：每段線的兩端都接在圖形上；刻意不接的線要標註原因。
5. 文字不碰線：文字要不在圖形外，要不完整在圖形內並留內距；不和線段、其他文字重疊。

## 2. 頂部列

- 子元素一律 `flex: none`，只有搜尋框可以伸縮（`flex: 0 1 18rem; min-width: 0`）；手機寬度拿掉 spacer，讓搜尋框吃掉剩下的寬度。
- 圖示按鈕固定 `width: 44px; height: 44px`。
- 右側與底部的 padding 多留硬陰影的位移：`padding: 8px calc(16px + var(--shadow-off-sm)) calc(8px + var(--shadow-off-sm)) 16px`，最外側按鈕的陰影才不會超出畫面。
- 間距至少 10px（陰影 4px ＋ 可見空隙 6px）。
- 搜尋框的 `<input>` 設 `display: block; height: 44px; line-height: 1.2`：inline 的輸入框會繼承內文 1.8 的行高，比旁邊的按鈕高。
- 平板寬度加上大字級放不下全部控制時，字級按鈕收進設定選單（本站在 1100px 以下收進「Aa」選單）。
- **高度不寫死**：`min-height` 用固定 px，實際高度用 JS 量出來寫回 `--topbar-h`。

```js
function syncTopbarHeight() {
  const height = Math.ceil(document.querySelector('.topbar').getBoundingClientRect().height);
  document.documentElement.style.setProperty('--topbar-h', `${height}px`);
}
// 啟動、視窗縮放、改字級時同步量一次；ResizeObserver 只在畫面繪製時回報，當備援
syncTopbarHeight();
window.addEventListener('resize', syncTopbarHeight);
new ResizeObserver(syncTopbarHeight).observe(document.querySelector('.topbar'), { box: 'border-box' });
```

- `box: 'border-box'` 不能省：padding 在不同斷點會變，只看內容盒時高度變了也不會觸發。
- 所有以頂部列為基準的 sticky／fixed 元素（側欄、把手、本課目錄、`scroll-padding-top`）只用 `--topbar-h`，不另外寫數字。

## 3. 側欄與拖曳把手

補充 components.md 第 1 節。

- **把手和側欄放在同一個 grid 格子，一起 sticky、同高**。不要用 `position: fixed` 搭配 `bottom: 0`：它不知道頁尾在哪，捲到底時會蓋過頁尾。

```css
@media (min-width: 1280px) {
  .layout { display: grid; grid-template-columns: var(--sidebar-w) minmax(0, 1fr) 14rem; align-items: start; }
  /* 明確指定格子，把手和側欄疊在同一格 */
  .sidebar, .sidebar-resizer { grid-column: 1; grid-row: 1; }
  main { grid-column: 2; grid-row: 1; }
  .toc { grid-column: 3; grid-row: 1; }
  .sidebar {
    position: sticky; top: var(--topbar-h);
    height: calc(100vh - var(--topbar-h));
    border-right: 4px solid var(--ink);
  }
  .sidebar-resizer {
    position: sticky; top: var(--topbar-h);
    height: calc(100vh - var(--topbar-h));
    justify-self: end;
    width: 12px; margin-right: -4px; /* 右緣多 4px 好抓，線剛好壓在側欄邊框上 */
  }
  /* 平常透明，看到的是側欄自己的邊框；hover／focus 才在同一個位置變色，畫面上永遠只有一條線 */
  .sidebar-resizer::after { content: ""; position: absolute; top: 0; bottom: 0; right: 4px; width: 4px; background: transparent; }
}
```

- 視窗 resize 時用「使用者的偏好值」重算寬度，不用目前的值：視窗暫時縮小時寬度會被夾到最小值，放大後要回得去。
- 使用者沒拖過把手時，預設寬度 = 288px × 字級（仍受最小、最大值限制）；`<head>` 的預先套用 script 也用同一個公式。
- 側欄用 `scrollbar-width: thin`：預設捲軸約佔 20px，窄側欄會更擠。
- 單元連結的縮排要克制：預設寬度下，單元標題可用寬度至少 140px（本站：模組下縮排 12px＋8px，連結間距 6px，編號欄 2.3em）。

## 4. 內容欄

- 沒有本課目錄的頁面（首頁、模組頁）不保留右側欄：渲染後依目錄是否有內容切換 `.layout.no-toc`，改成兩欄。
- 字級 ≥ 137.5% 時收起右側目錄（`:root[data-large-text]`），把寬度還給內容。
- 卡片網格的欄數依**容器**寬度決定，不依視窗寬度：在外層加 `container-type: inline-size`，用 `@container (min-width: 36rem)` 這類條件。容器查詢裡的 rem 會跟著字級變大，媒體查詢的不會。
- grid／flex 子項預設不會縮到比最長的英文字或 `code` 還窄，手機上會撐破版面。內容可能有長英文的子項一律 `min-width: 0`（定義、選項、對照、表單列、上一課／下一課）；定義的英文名稱加 `overflow-wrap: anywhere`。
- 內含文字的 flex 列（例如 `li { display: flex }` 加上編號）要把文字包進一個 `flex: 1; min-width: 0` 的 span，不要讓文字當匿名 flex 項目。
- 一組相關的小資訊（進度條＋「已完成 N / M」）包成 `white-space: nowrap` 的群組，手機上整組換行，不拆開。
- 按鈕 `white-space: nowrap`，文字控制在 8 個字內。

## 5. SVG 圖解的幾何

補充 content-rules.md 3.3 節。

### 5.1 線段

- 先定節點座標，再由節點的座標算出線段端點；不要另外估一個數字。
- 連接線的每個端點都要落在：方框邊緣（±3）、圓內、箭頭上，或指向文字時停在文字前 6–10px。
- 時間軸、流程主幹從第一個節點的中心畫到最後一個節點的中心，不凸出頭尾。
- 箭頭的線段終點要落在箭頭三角形裡，三角形的尖端碰到目標的邊緣。
- 刻意不接任何東西的線（座標軸、示意用的網、底線），在元素或外層 `<g>` 加 `data-free-ends="原因"`。驗證腳本會跳過，人看程式碼也知道是故意的。
- 純線段寫 `fill="none"` 或只用 stroke class，不要靠預設的黑色填色「剛好看不出來」。

### 5.2 文字

- 文字要不完全在圖形外，要不完整在圖形內並留至少 4px 內距；不能跨在框線或圓的邊線上。
- 文字和線段之間至少 3px；文字之間不重疊；兩行字的基線距離至少是字級的 1.4 倍。
- **SVG 的 `<text>` 不會自動換行**，網頁的詞組斷行與孤行縮字管不到它。手動分行時每行至少 2 個字，不能一行只剩 1 個字或只剩標點。
- 先算可用寬度再決定字數：中文字寬約等於字級，英文與數字約 0.55 倍字級。放不下時依序改用：分兩行 → 縮短文字 → 加大圖形；不要把字級縮到 22 以下（viewBox 寬 560 時）。

## 6. 驗證

### 6.1 要看的寬度與位置

- 寬度：360、390、430、768、820、1024、1280、1366、1440、1920。每種寬度走過所有頁面，並展開所有答案。
- 位置：每個有 sticky／fixed 元素的頁面，量**頁面最上方**與**捲到最底**兩次。
- 字級：100% 與 150%。

### 6.2 隱藏視窗時的量測

Claude 的視窗被隱藏或在其他視窗後面時，瀏覽器不繪製畫面：CSS 動畫停在第一格（transform 不會歸零）、`requestAnimationFrame` 與 ResizeObserver 不觸發、截圖逾時。量測前：

1. 注入 `*,*::before,*::after{animation:none!important}`，避免動畫的 transform 造成假溢出。
2. 需要重算的東西（孤行縮字、頂部列高度）改呼叫同步函式，不等 rAF。
3. 截圖逾時就重試一次；仍失敗，在回報裡寫明「未截圖」與改用的檢查方式。

### 6.3 全頁溢出與頂部列（瀏覽器 console）

```js
const out = {};
const pages = ['#/', '#/styleguide', '#/references', ...COURSES.map((m) => `#/m/${m.id}`), ...LESSONS.map((l) => `#/l/${l.id}`)];
for (const h of pages) {
  location.hash = h;
  await new Promise((r) => setTimeout(r, 300));
  document.querySelectorAll('#main details').forEach((d) => { d.open = true; });
  const vw = document.documentElement.clientWidth;
  const over = [...document.querySelectorAll('body *')]
    .filter((e) => !e.closest('.sidebar:not(.open), .scrim, .term-pop, .search-results, .dropdown, .visually-hidden, pre, .table-wrap'))
    .filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > vw + 0.5 || b.left < -0.5); })
    .slice(0, 3).map((e) => `${String(e.className || e.tagName).slice(0, 30)}「${e.textContent.trim().slice(0, 20)}」`);
  if (document.documentElement.scrollWidth > vw || over.length) out[h] = over;
}
const kids = [...document.querySelector('.topbar').children].filter((e) => e.getClientRects().length && !e.classList.contains('spacer'));
const rects = kids.map((e) => e.getBoundingClientRect());
const icons = [...document.querySelectorAll('.topbar .btn.icon')].filter((b) => b.offsetParent).map((b) => `${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`);
({ vw: innerWidth, overlaps: rects.slice(1).filter((r, i) => r.left < rects[i].right + 8).length, icons: [...new Set(icons)], problems: out });
```

通過條件：`problems` 是空的、`overlaps` 是 0、`icons` 只有 `44x44`。

### 6.4 版面對齊（≥ 1280px）

```js
const r = (s) => document.querySelector(s).getBoundingClientRect();
const snap = () => ({ topbarBottom: Math.round(r('.topbar').bottom), sidebarTop: Math.round(r('.sidebar').top), resizerTop: Math.round(r('.sidebar-resizer').top), sidebarBottom: Math.round(r('.sidebar').bottom), resizerBottom: Math.round(r('.sidebar-resizer').bottom), footerTop: Math.round(r('.site-footer').top), vh: innerHeight, sidebarBorder: Math.round(r('.sidebar').right), resizerLine: Math.round(r('.sidebar-resizer').right - 4) });
window.scrollTo(0, 0); await new Promise((res) => setTimeout(res, 200)); const top = snap();
window.scrollTo(0, document.body.scrollHeight); await new Promise((res) => setTimeout(res, 200)); const bottom = snap();
({ top, bottom });
```

通過條件：最上方時 `topbarBottom = sidebarTop = resizerTop`；捲到底時 `sidebarBottom = resizerBottom = footerTop`（頁尾在畫面內時）；兩個位置的 `sidebarBorder = resizerLine`。

### 6.5 SVG 線段端點與文字（逐課執行）

```js
const NS = 'http://www.w3.org/2000/svg';
const isStroked = (el) => { const cs = getComputedStyle(el); return cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0; };
const overlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 2;
const contains = (o, i, pad) => i.x >= o.x + pad && i.y >= o.y + pad && i.x + i.width <= o.x + o.width - pad && i.y + i.height <= o.y + o.height - pad;
const distRect = (p, b) => { const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.width)); const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.height)); const o = Math.hypot(dx, dy); return o > 0 ? o : Math.min(p.x - b.x, b.x + b.width - p.x, p.y - b.y, b.y + b.height - p.y); };
const nearBox = (p, b, t) => p.x >= b.x - t && p.x <= b.x + b.width + t && p.y >= b.y - t && p.y <= b.y + b.height + t;
const dangling = []; const textIssues = [];
for (const lesson of LESSONS) {
  location.hash = `#/l/${lesson.id}`;
  await new Promise((r) => setTimeout(r, 300));
  [...document.querySelectorAll('#main svg[role=img]')].forEach((svg, si) => {
    const tag = `${lesson.id} 圖${si + 1}`;
    const vb = svg.viewBox.baseVal;
    // 字框用字級高度：getBBox 含行距，上下兩行會被誤判重疊
    const texts = [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim()).map((t) => {
      const bb = t.getBBox(); const fs = parseFloat(getComputedStyle(t).fontSize); const cy = bb.y + bb.height / 2;
      return { t: t.textContent.trim(), b: { x: bb.x, y: cy - fs * 0.55, width: bb.width, height: fs * 1.1 } };
    });
    const rects = [...svg.querySelectorAll('rect')].map((x) => ({ b: x.getBBox(), sw: parseFloat(getComputedStyle(x).strokeWidth) || 0 }));
    const circles = [...svg.querySelectorAll('circle')].map((c) => ({ cx: +c.getAttribute('cx'), cy: +c.getAttribute('cy'), r: +c.getAttribute('r') }));
    const heads = [...svg.querySelectorAll('path')].filter((p) => !isStroked(p)).map((p) => p.getBBox());
    const strokes = [...svg.querySelectorAll('path')].filter(isStroked);
    // A. 線段端點
    for (const c of strokes.filter((p) => !/Z/i.test(p.getAttribute('d')))) {
      if (c.closest('[data-free-ends]')) continue;
      for (const d of c.getAttribute('d').trim().split(/(?=M)/)) {
        const tmp = document.createElementNS(NS, 'path'); tmp.setAttribute('d', d); svg.appendChild(tmp);
        const len = tmp.getTotalLength(); const ends = [tmp.getPointAtLength(0), tmp.getPointAtLength(len)]; tmp.remove();
        ends.forEach((p, ei) => {
          const ok = rects.some((x) => distRect(p, x.b) <= 3) || circles.some((k) => Math.hypot(p.x - k.cx, p.y - k.cy) <= k.r + 3)
            || heads.some((b) => nearBox(p, b, 4)) || texts.some((x) => nearBox(p, x.b, 10));
          if (!ok) dangling.push(`${tag} ${d.slice(0, 24)} ${ei ? '終點' : '起點'}`);
        });
      }
    }
    // B. 文字
    for (const { t, b } of texts) {
      const s = t.slice(0, 12);
      if (/^\p{Script=Han}$/u.test(t)) textIssues.push(`${tag}「${t}」單字成行`);
      if (b.x < vb.x - 1 || b.x + b.width > vb.x + vb.width + 1 || b.y < vb.y - 1 || b.y + b.height > vb.y + vb.height + 1) textIssues.push(`${tag}「${s}」超出畫布`);
      for (const x of rects) {
        const outer = { x: x.b.x - x.sw / 2, y: x.b.y - x.sw / 2, width: x.b.width + x.sw, height: x.b.height + x.sw };
        if (overlap(outer, b) && !contains(x.b, b, x.sw / 2 + 3.5)) textIssues.push(`${tag}「${s}」壓到或貼著方框`);
      }
      const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]];
      for (const c of circles) {
        const nx = Math.max(b.x, Math.min(c.cx, b.x + b.width)); const ny = Math.max(b.y, Math.min(c.cy, b.y + b.height));
        if (Math.hypot(nx - c.cx, ny - c.cy) < c.r && Math.max(...corners.map(([x, y]) => Math.hypot(x - c.cx, y - c.cy))) > c.r - 4) textIssues.push(`${tag}「${s}」壓到圓形邊線`);
      }
      const hit = { x: b.x - 3, y: b.y - 3, width: b.width + 6, height: b.height + 6 };
      for (const p of strokes) {
        const len = p.getTotalLength();
        for (let k = 0; k <= len; k += 2) { const q = p.getPointAtLength(k); if (q.x > hit.x && q.x < hit.x + hit.width && q.y > hit.y && q.y < hit.y + hit.height) { textIssues.push(`${tag}「${s}」壓到線段`); break; } }
      }
    }
    for (let i = 0; i < texts.length; i += 1) for (let j = i + 1; j < texts.length; j += 1) if (overlap(texts[i].b, texts[j].b)) textIssues.push(`${tag}「${texts[i].t.slice(0, 8)}」和「${texts[j].t.slice(0, 8)}」重疊`);
  });
}
({ dangling: [...new Set(dangling)], textIssues: [...new Set(textIssues)] });
```

- 2026-10-02 在 `claude-code-secure-dev-course/` 的 58 張圖上校正過：修正前抓到 6 處懸空端點、6 處文字問題；修正後兩項都是 0。
- 只處理 `<path>`；用 `<line>`、`<polyline>` 畫線時，先改成 path 或擴充腳本。
- 腳本靠幾何判斷，「線段剛好穿過方框」這類情況抓不到；0 筆之後仍要用眼睛看一次每張圖。

## 7. 這份規範從哪來

| 使用者回報（2026-10-02） | 根本原因 | 對應的規則 |
|---|---|---|
| 側欄邊界線突出、沒對齊頂部列底部 | 頂部列實際 68–75px，側欄與把手寫死 64px | 第 2 節「高度不寫死」 |
| 手機版漢堡選單、深色模式按鈕被擠壓 | flex 子項可被壓縮、陰影沒留空間 | 第 2 節 |
| PC 版 padding 沒設好、手機版被擠壓 | 空的右側欄、grid 子項不能縮、資訊列拆散 | 第 4 節 |
| 側欄完全突出到頁尾 | 把手用 `position: fixed; bottom: 0` | 第 3 節 |
| 圖解的線段沒有對齊 | 線段座標另外估，沒由節點算出 | 5.1 節 |
| 文字和框線壓在一起、SVG 單字成行 | SVG 文字不會自動換行，沒先算寬度 | 5.2 節 |
