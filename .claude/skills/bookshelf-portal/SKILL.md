---
name: bookshelf-portal
description: 建立或更新「擬真 2D 書櫃」風格的個人入口網站：每個子網站是一本書，厚度依內容量計算，書背燙金直排書名與閱讀進度線，滑鼠停留顯示說明欄，點選後書抽出、在空中轉成 3D 封面、翻開封面與扉頁再跳轉。Apple 用色與字體、單一 index.html、可直接放 GitHub Pages。使用者要做入口頁、首頁、網站目錄、課程書櫃、「像 Vibe-Coding 首頁那樣的入口」，或要把新網站加進書櫃時使用。
---

# 書櫃入口網站

一頁就是一個書櫃：子網站是書，點書就「抽出 → 翻開 → 進站」。給自己用的入口，不是行銷頁，所以沒有 hero、標語、卡片牆。

參考實作：`Vibe-Coding/index.html`（2026-10-05 版）。[assets/template.html](assets/template.html) 是它的完整副本，新入口從這份開始改，不要從零寫。

## 什麼時候用哪個流程

| 情況 | 做法 |
|---|---|
| 書櫃已存在，只是加一本書 | 只改 `SITES` 陣列，跳到「驗證」第 1、3、5 步 |
| 新的入口網站 | 走完下面四步 |
| 要改外觀或動畫 | 先讀 [visual-spec.md](references/visual-spec.md) 或 [book-animation.md](references/book-animation.md) 的「不要再犯」 |

## 流程

1. **盤點子網站**：找出每個子網站的入口 `index.html`，記下這些資料，填進 `SITES`（欄位說明見下一節）：
   - 標題、一句話簡介、模組數、單元數、已完成單元數、查證日期。
   - 進度 key：子網站自己存 localStorage 的 key（搜尋 `STORAGE_KEY`），格式要是 `{ done: { id: true } }` 才讀得到；不是這個格式就不填，書背進度線會是 0。
2. **複製範本**：把 [assets/template.html](assets/template.html) 複製成入口的 `index.html`，改 `<title>`、`description`、頂部列的 `.path` 文字，替換 `SITES`。
3. **GitHub Pages 準備**：入口放在 repo 根目錄；根目錄加空的 `.nojekyll`（避免 Jekyll 處理含 `{{ }}` 的檔案而建置失敗）；所有連結用相對路徑並寫到 `index.html`。子資料夾若有自己的 `.git`，push 後會變空資料夾，要先回報。
4. **驗證**：照 [verification.md](references/verification.md) 跑完再回報。

## SITES 欄位

```js
{
  id: 'secure',                       // 唯一識別，英數
  color: '#1d6338',                   // 書布顏色：深、飽和、燙金字要讀得到（見 visual-spec.md 色彩）
  icon: 'layers',                     // ICONS 裡的鍵；新增圖示用 24×24、stroke 1.4–1.6 的 SVG
  href: 'course-web/xxx/index.html',  // 相對路徑，寫到 index.html
  spineTitle: 'Claude Code 安全開發',  // 書背直排用，12 個全形字以內
  titlePhrases: ['Claude Code', '× 安全開發', '實戰課'], // 封面與說明欄，按詞組切，換行只發生在詞組之間
  desc: '一句話簡介。',
  modules: 9, lessons: 29, readyLessons: 29, // readyLessons < lessons 時書背顯示 25/50 並標「製作中」
  updated: '2026-10',
  height: 0.92,                       // 書高，相對書櫃高度 0.85–1；相鄰兩本不要一樣高
  progressKey: 'claude-secure-dev-course.v1',
}
```

書的厚度自動算：`40 + lessons × 0.7` px。內容越多書越厚，這是刻意的資訊設計，不要改成固定寬度。

## 硬性規則

1. **擬真，不是色塊**：書背要有圓弧明暗、布紋、壓條、燙金字；書櫃要有背板陰影與金屬層板；每本書要有接觸陰影。細節與數值在 [visual-spec.md](references/visual-spec.md)。
2. **視角一致**：書櫃是正視圖。不畫書頂紙頁、不畫任何需要俯視角才看得到的面（使用者看過，判定「透視完全錯誤」）。
3. **中文字距 ≥ 0**：內文 `0.01em`、行高 1.6；書背直排 `0.14em`。不准對中文用負字距。
4. **開書動畫是真的 3D 書**：有封面、封底、書脊、書口、上下書頂，厚度依書背寬度換算；交接瞬間 3D 書脊要和書櫃上的書背重疊到像素（誤差 ≤ 2px）。數學與時序在 [book-animation.md](references/book-animation.md)。
5. **攤開要對稱**：左頁（扉頁背面）與右頁的紙範圍完全一樣，四周露出同寬的布邊；扉頁翻到正好 -180° 並墊高到封面之上。
6. **可略過、可退回**：動畫中點一下直接跳轉；Ctrl／Cmd／中鍵點擊交給瀏覽器開新分頁；`prefers-reduced-motion` 時直接跳轉；從子網站按返回（bfcache）要收掉動畫並更新進度。
7. **書名不能被截斷**：`fitSpineTitles()` 依標籤高度等比縮小字級（下限 11px），3D 書脊沿用同一字級。書名標籤 `.spine-label` 一定寫 `width: max-content`：裡面的直排書名和標籤方向不同，Safari 自動算寬時不計直排內容，標籤只剩內距寬，書名被整個裁掉（2026-10 在 Safari 27 實際發生，Chrome 正常）。
8. **3D 舞台裡的明暗只動 `background-color`**：`.shade` 遮罩不准做 `opacity` 動畫。opacity 動畫會被拆成獨立合成圖層，和所在的頁面在同一平面，Safari 每一格的前後順序不固定，翻頁時左頁閃動（2026-10 實際發生）。有延遲的動畫用 `fill: 'both'`。
9. **Chrome 與 Safari 都要實測**：兩邊都看過才算完成；改一邊的寫法時要確認另一邊沒壞。Playwright 的 WebKit 不等於 Safari，書名消失這個問題它量不出來。流程見 [verification.md](references/verification.md) 第 5 節。
10. **風格基準**：Apple 系統字體與色票（淺色底 `#f5f5f7`、深色底 `#000`、焦點藍 `#0071e3`／`#2997ff`），遵守 impeccable 的 craft floor：不用漸層文字、不用 eyebrow 小標、不用 emoji 當圖示、對比 ≥ 4.5:1。等寬字只用在路徑、數字、統計這類真的是資料的地方。

## 回報

照個人回報範本，另外寫出：
- 書櫃上有幾本書、各自的連結 HTTP 狀態
- 10 種寬度的版面檢查結果、書名字級範圍
- 交接量測：書櫃書背 rect 與 3D 書脊 rect
- Safari 實機：書名標籤寬度、截圖是否看過；翻頁閃動是否由使用者或自己在 Safari 實際播放確認
- 動畫各階段截圖（抽出、飛行、翻封面、翻扉頁、攤開）是否都看過；實際播放沒親眼看過就寫「未驗證」
