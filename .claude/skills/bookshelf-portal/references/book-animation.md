<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# 開書動畫

全部用 Web Animations API（`element.animate()`），每段 `await animation.finished` 串接。總長約 2.7 秒，任何時候點舞台都直接跳轉。

## 1. 時序

| 段 | 長度 | 動作 |
|---|---|---|
| 抽出 | 380ms | 書櫃上的書 `translateY(-12 → -36px)`＋`scale(1 → 1.06)`，像往前、往上拉出來 |
| 交接 | 0ms | 量抽出後的 `.spine` rect，建立 3D 書並疊在同一位置，隱藏原書（`visibility: hidden`） |
| 空中轉身 | 1000ms | 3D 書從 `rotateY(90deg)`（書脊朝你）轉到 `rotateY(0)`（封面朝你），移到畫面中央；中途 `rotateY(48deg) rotateX(10deg) rotateZ(-4deg)` 並往上抬 40px。背景模糊淡入 500ms；桌面影子從 0.3 倍寬長出來 |
| 翻封面 | 900ms | 封面以左緣為軸 `rotateY(0 → -180deg)`；整本書同時右移半本寬，讓攤開的兩頁置中；影子跟著右移、放寬到 1.9 倍 |
| 翻扉頁 | 800ms，延遲 260ms，`fill: 'both'` | 扉頁 `translateZ(D/2 − 1.5 → D/2 + 1.5px) rotateY(0 → -180deg)` |
| 讀取條 | 450ms | 右頁「正在打開…」下方的條從 0 填滿，結束後 `location.href = href` |

緩動：抽出與讀取條用 `cubic-bezier(0.16, 1, 0.3, 1)`；轉身與翻頁用 `cubic-bezier(0.45, 0, 0.2, 1)`。

每個面都有 `<i class="shade">` 黑色遮罩，跟著角度改黑色濃度，讓轉動時有明暗。遮罩本身 `opacity` 固定為 1，動畫只改 `background-color`（用 `shadeFrames(from, to)` 產生 `rgba(0, 0, 0, x)` 的關鍵影格）：
- 轉身：書脊 0 → 0.6，封面 0.6 → 0。
- 翻封面：封面正面 0 → 0.5，封面內側 0.5 → 0。
- 翻扉頁：正面 0 → 0.35，背面 0.35 → 0。

## 2. 3D 書的結構

`.book3d` 寬 W、高 H、厚 D，`transform-style: preserve-3d`，舞台 `perspective: 2000px`。

| 面 | 尺寸 | transform |
|---|---|---|
| 封面組 `.b3-cover`（正面＋內側） | W×H | `translateZ(D/2)`，以左緣為軸翻 |
| 扉頁組 `.b3-leaf`（正面＋背面） | 紙範圍 | `translateZ(D/2 − 1.5px)` |
| 右頁 `.b3-page`（布底＋紙） | W×H | `translateZ(D/2 − 3px)` |
| 封底 | W×H | `rotateY(180deg) translateZ(D/2)` |
| 書脊 | D×H | `rotateY(-90deg) translateZ(W/2)` |
| 書口 | D×H | `rotateY(90deg) translateZ(W/2 − 4px)` |
| 上、下書頂 | W×D | `rotateX(±90deg) translateZ(H/2 − 4px)` |

所有面 `backface-visibility: hidden`；兩面都要看得到的（封面、扉頁）用兩個元素，背面那個再 `rotateY(180deg)`。

**紙範圍（--rim = 5px）**：右頁的紙、扉頁、蝴蝶頁都內縮成 `top: rim; bottom: rim; 外緣: rim; 書脊側: 0`。翻開後左右兩頁的紙一樣大，四周露出同寬的布邊。

## 3. 交接的數學

目標：3D 書在 `rotateY(90deg)` 時，透視投影後的書脊剛好疊在書櫃那本書上。

設書櫃書背的 rect 為 `(left, top, w, h)`，透視距離 P = 2000，舞台中心 O。

1. 書轉 90° 後，書脊中心在 `z = s·W/2`（s 是縮放）。透視放大倍率 `m = P / (P − s·W/2)`。
2. 要讓 `s·H·m = h`，解出 `s = h·P / (H·P + h·W/2)`。
3. 書的中心點要反推透視位移：`C = O + (書背中心 − O) / m`，`translate = C − (W/2, H/2)`。
4. 厚度 `D = w·H / h`，這樣書脊投影寬度剛好等於書背寬。
5. 書脊內容用書櫃上的尺寸排版（`--sw`、`--sh`），再 `scale(H / h)` 放大，交接時圖案一致。

縮放一定要用 `scale3d(s, s, s)`。`scale(s)` 不會縮放 z，書脊的 z 就不是 `s·W/2`，交接會偏 10–20px。

## 4. 不要再犯

| 問題 | 原因 | 規則 |
|---|---|---|
| 交接時書脊偏左上 | 用了 `scale()` | 一律 `scale3d` |
| 3D 書脊的字變成深色 | 舞台不在 `.book` 裡，沒有繼承燙金色 | `.spine` 自己設 `color: var(--foil)` |
| 攤開後左頁比右頁大、偏高 | 扉頁停在 -176°，外緣翹起 | 翻到正好 -180° |
| 書溝露出一條點點、內頁像和內容分開 | 扉頁在封面下方，翻過去被封面蓋住 | 翻轉時同時把 z 墊到 `D/2 + 1.5px` |
| 右頁四周沒有書板邊、左右不對稱 | 右頁只有紙沒有底板 | 右頁＝布底＋內縮紙；封面內側＝布底＋內縮蝴蝶頁 |
| 封面標題詞組被拆開 | `.phrase` 沒有 inline-block | 封面、扉頁、右頁的 `.phrase` 都要 `display: inline-block` |
| 書名字級在 3D 書脊不同 | 3D 書脊是重新產生的標記 | 建立舞台後複製書櫃書名的 `style.fontSize` |
| Safari 翻頁時左頁閃動，Chrome 正常 | 遮罩做 `opacity` 動畫，被拆成獨立合成圖層，和所在頁面同一平面，Safari 每格前後順序不定。補 `backface-visibility` 沒用 | 遮罩只動 `background-color`；不要在 preserve-3d 的頁面上疊會做 opacity／transform 動畫的子元素 |
| 扉頁開始翻的瞬間遮罩跳一下 | 延遲 260ms 又只有 `fill: 'forwards'`，延遲期間用 CSS 值，開始時跳到第一格 | 有 `delay` 的動畫用 `fill: 'both'` |
