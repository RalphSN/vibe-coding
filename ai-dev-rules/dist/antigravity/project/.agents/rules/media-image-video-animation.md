---
trigger: model_decision
description: 媒體製作規範：圖片生成 prompt 結構、影片分鏡表、程式動畫工具選擇（CSS、GSAP、Lottie、Three.js、Remotion）、SVG 寫法、素材授權與輸出規格。寫圖片或影片生成 prompt、做動畫、畫 SVG、處理素材時使用。
---

<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# 圖片、影片、動畫

## 圖片生成 prompt

依序寫這 7 項，每項一行：
1. 主體：誰或什麼、在做什麼、外觀細節
2. 風格：攝影、插畫、3D、水彩等，加上媒材或參考年代
3. 構圖：景別（特寫、半身、全景）、視角、主體位置
4. 光線：光源方向、時間、氛圍（柔光、逆光、霓虹）
5. 色彩：主色調、配色方式
6. 比例與解析度：例如 16:9、1:1、4:5
7. 負面提示：不要出現的東西（文字、浮水印、多餘手指、變形）

不寫「高品質」「傑作」這類沒有資訊量的詞。

## 影片

生成或剪輯前先寫分鏡表，使用者確認後才開始：

| 鏡號 | 秒數 | 畫面 | 運鏡 | 音效 / 音樂 | 字幕 / 旁白 |
|---|---|---|---|---|---|

- 每個鏡頭 2–6 秒；總長寫在表格上方。
- 運鏡用標準名稱：固定、推、拉、搖、移、跟、升降、手持。

## 程式動畫工具選擇

| 需求 | 選擇 |
|---|---|
| hover、轉場、簡單進場 | CSS transition / animation |
| 時間軸、多元素編排、捲動觸發 | GSAP（含 ScrollTrigger） |
| 設計師在 After Effects 做好的向量動畫 | Lottie |
| 3D 場景或粒子 | Three.js |
| 用程式產生影片檔（MP4） | Remotion |

- 網頁動畫一律處理 `prefers-reduced-motion`。
- 只對 `transform` 和 `opacity` 做動畫。例外：3D 場景裡疊在某一面上的明暗遮罩改動 `background-color`，見 `domain-web-frontend` 的「動畫」。

## SVG

- 一定要有 `viewBox`；不寫死 `width` / `height`，讓外層控制大小。
- 顏色用 `currentColor` 或 CSS 變數，方便換主題與深色模式。
- 有意義的 SVG 加 `role="img"` 和 `<title>`；裝飾用的加 `aria-hidden="true"`。
- 座標取整數或一位小數，刪除編輯器殘留的 metadata。

## 授權與版權

- 只用有明確授權的素材（CC0、CC BY 註明出處、自己的、已購買的）；在 `CREDITS.md` 記錄來源與授權。
- 不重製受版權保護的角色、商標或作品；prompt 不寫在世藝術家的名字當風格。

## 檔名與輸出規格

- 檔名：小寫、kebab-case、含用途與尺寸，例如 `hero-banner-1920x1080.webp`。
- 網頁圖片：WebP（品質 75–85），需要透明用 WebP 或 PNG；照片長邊最大 2560px。
- 影片：MP4（H.264）、1080p、30fps；網頁背景影片控制在 5 MB 內並移除音軌。
- 圖示：SVG 優先；點陣圖示提供 1x 與 2x。
