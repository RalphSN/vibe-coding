---
id: web-frontend
title: 網頁前端
description: 網頁前端規範（Vue 3、TypeScript、Pinia、Vite、uni-app、CSS）。寫或修改 .vue、.ts、.css 檔，做 UI、版面、RWD、無障礙、網頁效能或視覺設計時使用。
globs: ["**/*.vue", "**/*.ts", "**/*.tsx", "**/*.css", "**/*.scss", "**/*.html"]
---

# 網頁前端

## Vue 3

- 元件一律用 `<script setup lang="ts">` 與 Composition API。
- props 用 `defineProps<{...}>()` 型別宣告；有預設值用 `withDefaults`。
- emits 用 `defineEmits<{...}>()` 型別宣告。
- 元件檔名 PascalCase（`UserCard.vue`）；composable 用 `useXxx.ts`。
- 可重用的狀態邏輯抽成 composable，不要複製貼上。
- `v-for` 一定加穩定的 `:key`，不用 index 當 key（除非清單不會變動）。
- template 表達式有超過一個運算子，或要呼叫函式時，改用 `computed`。

## Pinia

- 用 setup store 寫法：`defineStore('id', () => {...})`。
- 解構 store 時用 `storeToRefs`，避免失去響應性。
- 只把跨元件共用的狀態放進 store；單一元件的狀態留在元件內。

## Vite

- 環境變數用 `import.meta.env.VITE_*`；不以 `VITE_` 開頭的不會暴露給前端，秘密不能用 `VITE_` 開頭。
- 路徑別名在 `vite.config.ts` 和 `tsconfig.json` 兩邊同步設定。

## uni-app 跨端

- 用 `uni.*` API 取代瀏覽器 API（`uni.request`、`uni.setStorageSync`），否則小程式端會壞。
- 平台差異用條件編譯 `// #ifdef H5` / `// #ifdef MP-WEIXIN`，不用執行期判斷平台。
- 尺寸用 `rpx`；不用 `window`、`document`。
- 改動後至少在 H5 和一個小程式模擬器各跑一次。

## RWD 與無障礙

- 行動優先：先寫手機版樣式，再用 `min-width` media query 往上加。
- 用語意標籤：`button` 做按鈕、`a` 做連結、`nav`、`main`、`header`。
- 所有互動元素能用鍵盤操作，focus 狀態看得到。
- 文字對比至少 4.5:1（大字 3:1）。
- 有意義的圖片寫 `alt`；裝飾圖片 `alt=""`。
- 表單欄位都有對應的 `<label>`。

## 效能

- 圖片用 WebP / AVIF，寫明 `width` / `height` 避免版面跳動。
- 首屏以外的圖片加 `loading="lazy"`。
- 路由與大型元件用動態 `import()` 拆分。
- 新增套件前看 bundle 大小；`vite build` 後檢查有沒有超過 500 KB 的 chunk。

## 設計品質

- 動手前先定一個視覺方向（例如「報紙編排」「工業風儀表板」），寫在計畫裡。
- 避免 AI 模板感：預設紫色漸層、所有內容塞進置中大卡片、每個區塊都加陰影、到處都是圓角膠囊按鈕。
- 色彩、間距、字級用 CSS 變數（design tokens）集中管理。
- 間距用固定級距（例如 4 / 8 / 12 / 16 / 24 / 32 / 48）。
- 長文閱讀（書籍、文章）裡的詩詞、引文、名句不加左縮排，用比段落大的上下間距和正文區隔（例如上下各半行）；窄螢幕上縮排會擠掉每行字數。

## 品質目標：得獎等級

製作網頁（landing page、作品集、課程站、產品頁）時，品質標準以 Awwwards、Webby Awards、FWA 得獎的程度為目標，透過自我檢查反覆提升，直到達標為止。只改元件或修 bug 時不套用整套迴圈，但不能讓既有頁面的品質下降。

評分維度沿用 Awwwards 評審權重（Design 40%、Usability 30%、Creativity 20%、Content 10%；依第三方整理，官方頁未直接查證）：

| 維度 | 檢查什麼 |
|---|---|
| 設計 Design | 版面、字體、色彩、層級、一致性、藝術指導（art direction）有明確方向 |
| 易用 Usability | 導覽、清楚度、效能（Core Web Vitals）、RWD、無障礙 |
| 創意 Creativity | 概念、互動、執行有沒有記憶點，不是模板 |
| 內容 Content | 文案、圖片、影片的品質，以及和設計的整合 |

自我檢查迴圈，每一輪：
1. 在瀏覽器實際看過並截圖（桌面與手機寬度各一張；有動畫就操作一次）。
2. 四個維度各打 1–10 分，每個分數寫一句理由，對照至少一個同類得獎網站說出差距。
3. 列出拉低分數最多的 3 個問題，修正後進下一輪。
4. 四個維度都達 8 分以上，且易用維度沒有任何無障礙或效能問題，才算達標。

至少跑 2 輪。跑到第 5 輪還沒達標，停下來回報各維度分數、剩下的差距與推測原因，問使用者要不要繼續。回報時附上每一輪的分數變化。

## 跨瀏覽器（Chrome 與 Safari）

- 交付前在 Chrome 與 Safari 都實際看過；只修一邊的問題時，確認另一邊沒有壞。
- Playwright 的 WebKit 不能代替 Safari 驗收：排版結果會不同，3D 截圖也不做合成。Safari 結論要用 Safari 本身（`safaridriver` 或請使用者截圖）。
- 直排文字（`writing-mode: vertical-*`）放在橫排容器裡、容器寬度又是自動算（置中、`fit-content`）時，容器寫 `width: max-content`。否則 Safari 把容器算成只有內距寬，直排文字被 `overflow: hidden` 整個裁掉。

## 手機與跳轉

- 觸控裝置沒有 hover：hover 才出現的資訊，在觸控時改成「點一下顯示，再點入口按鈕前往」。用 `matchMedia('(hover: none)')` 之類的能力判斷，不要只看螢幕寬度。
- 手機版頂部列只留必要按鈕；字級、深色模式這類不常用的設定移到側欄或選單。
- 按下狀態用 `box-shadow` 或顏色表現，不用會改變佔位的位移，避免窄螢幕出現水平捲動。
- 所有頁面跳轉集中到一個函式（例如 `goTo(href)`）。頁面有離場動畫時，在 `pageshow`（bfcache 返回）與 `visibilitychange`（從外部 app 切回）都把畫面重置回初始狀態；外部連結另外加數秒的保險重置。
- 等待字型或外部資源的 loading 畫面要有逾時，資源失敗時退回簡易版，不能永遠卡住。

## 動畫

- 所有動畫都要處理 `@media (prefers-reduced-motion: reduce)`：關閉或改成淡入淡出。
- 只對 `transform` 和 `opacity` 做動畫。
- 3D 翻面（`backface-visibility: hidden` 的面）上不疊明暗遮罩子元素，也不對遮罩做動畫。Safari 只藏住朝後的那一面本身，上面的遮罩照樣畫出來，翻到背面時會閃黑一下；要明暗就不做，或實測 Safari 不閃再用。
- Web Animations 有 `delay` 時用 `fill: 'both'`，延遲期間就停在第一格，開始播放那一刻不會跳。
- 先問「這裡有東西真的在動嗎」：概念流程、層級、比較用靜態圖；動畫留給真實的機制或狀態轉換。
- 動畫的問題要在播放中檢查（可把 `playbackRate` 設 0.25 慢速看）；暫停後截圖看不到合成圖層造成的閃動。
