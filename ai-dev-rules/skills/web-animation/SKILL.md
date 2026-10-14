---
name: web-animation
description: 建立網頁動畫（CSS、GSAP、Lottie、Three.js），依需求選工具，一定處理 prefers-reduced-motion 與效能。使用者要加動畫、轉場、捲動效果、hover 效果、載入動畫、3D 效果時使用。
---

# 網頁動畫

## 步驟

1. 確認效果：觸發時機（載入、hover、捲動、點擊）、持續時間、要不要重複。
2. 選工具：

| 需求 | 工具 |
|---|---|
| hover、轉場、簡單進場 | CSS |
| 時間軸、多元素編排、捲動觸發 | GSAP + ScrollTrigger |
| 設計師給的 AE 動畫 | Lottie |
| 3D、粒子 | Three.js |

3. 看專案有沒有已安裝的動畫套件；有就優先用，沒有且需要新套件時先問。
4. 實作，同時寫 reduced-motion 版本。
5. 在瀏覽器確認：一般模式、開啟「減少動態效果」模式、手機寬度。3D 或多段編排的動畫要在 Chrome 與 Safari 各實際播放一次，可把 `playbackRate` 設 0.25 慢速看；暫停後截圖看不到播放中才出現的閃動。
6. 回報：用了什麼工具、檔案位置、怎麼看到效果。

## CSS 範例

```css
.fade-in {
  animation: fade-in 400ms ease-out both;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .fade-in { animation: none; }
}
```

## GSAP 範例

```ts
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

if (!reduce) {
  gsap.from('.card', { y: 24, opacity: 0, stagger: 0.08, duration: 0.5 })
}
```

## 規則

- 只對 `transform` 和 `opacity` 做動畫；不動 `width`、`height`、`top`、`left`。
- 3D 翻面（`backface-visibility: hidden` 的面）上不疊明暗遮罩子元素。Safari 只藏住朝後的那一面本身，上面的遮罩照樣畫出來，翻到背面時閃黑一下；改用 `background-color`、`opacity` 或對遮罩切換 `visibility` 都不穩定。
- Web Animations 有 `delay` 時用 `fill: 'both'`，避免開始播放那一刻從 CSS 值跳到第一格。
- 一般 UI 動畫 150–400ms；超過 600ms 要有理由。
- Vue 元件卸載時清掉 GSAP / Three.js 實例（`onBeforeUnmount`），避免記憶體洩漏。
- Three.js：限制 `devicePixelRatio` 最多 2；不在畫面上時暫停渲染。
- 閃爍頻率不超過每秒 3 次。
- 動畫屬於整頁製作時，品質以 Awwwards、Webby Awards、FWA 得獎程度為目標，照 `domain-web-frontend` 的「品質目標：得獎等級」自我檢查迴圈反覆提升到達標；動畫要服務內容與敘事，不為了炫技犧牲效能或易用。
