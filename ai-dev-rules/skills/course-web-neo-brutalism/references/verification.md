# 驗證清單

用本機伺服器開啟（`file://` 開啟時 localStorage 可能測不到），例如：

```bash
python -m http.server 8765 --bind 127.0.0.1
```

## 1. 自動檢查（瀏覽器 console 執行）

逐課切換，收集 console 錯誤、缺漏術語、水平溢出：

```js
const errors = [];
const originalError = console.error;
console.error = (...args) => { errors.push(args.join(' ')); originalError(...args); };
const report = {};
for (const lesson of LESSONS.filter((l) => l.content)) {
  location.hash = '#/l/' + lesson.id;
  await new Promise((resolve) => setTimeout(resolve, 450)); // 等換課轉場結束
  const doc = document.documentElement;
  const missing = [...document.querySelectorAll('#main .term-missing')].map((el) => el.textContent);
  const isOverflowing = doc.scrollWidth > doc.clientWidth;
  if (missing.length || isOverflowing) report[lesson.id] = { missing, isOverflowing };
}
({ done: LESSONS.filter((l) => l.content).length, total: LESSONS.length, report, errors });
```

選擇題的結構檢查：

```js
const quizIssues = [];
let mcCount = 0;
let correctIsLongest = 0;
for (const lesson of LESSONS.filter((l) => l.content)) {
  // 範本庫、總複習這類 reference 頁的題目放在 blocks 的 quiz 區塊裡，一起收進來
  const fromBlocks = (lesson.content.blocks || []).filter((b) => b.type === 'quiz').flatMap((b) => b.items);
  const items = [...(lesson.content.practice || []), ...(lesson.content.review || []), ...fromBlocks].filter((q) => q.type === 'mc');
  for (const q of items) {
    mcCount += 1;
    if (q.options.find((o) => o.correct)?.text.length === Math.max(...q.options.map((o) => o.text.length))) correctIsLongest += 1;
    const correct = q.options.filter((o) => o.correct);
    const lengths = q.options.map((o) => o.text.length);
    if (correct.length !== 1) quizIssues.push([lesson.id, q.q, '正確答案不是剛好 1 個']);
    if (q.options.some((o) => !o.why)) quizIssues.push([lesson.id, q.q, '有選項沒有解析']);
    if (correct[0] && correct[0].text.length === Math.max(...lengths) && Math.max(...lengths) > Math.min(...lengths) * 1.5) {
      quizIssues.push([lesson.id, q.q, '正確答案明顯最長']);
    }
    if (q.options.some((o) => /以上皆/.test(o.text))) quizIssues.push([lesson.id, q.q, '用了「以上皆…」']);
  }
}
// 正確答案是最長選項的比例：4 個選項隨機約 25%，超過 35% 代表看長度就猜得到
({ quizIssues, mcCount, correctIsLongestRatio: `${correctIsLongest} / ${mcCount}` });
```

## 1.1 幾何與對齊

依 [layout-geometry.md](layout-geometry.md) 第 6 節執行：10 種寬度的全頁溢出與頂部列檢查、頁面最上方與捲到最底的版面對齊、SVG 線段端點與文字檢查。視窗被隱藏時先停用動畫再量（6.2 節）。

## 2. 逐項檢查

### 視覺與對比
- [ ] 對比腳本（design-tokens.md 2.1）跑過，內文 ≥ 7:1、次要文字 ≥ 4.5:1、非文字 ≥ 3:1，最低一組寫進回報
- [ ] 每個 hover、選中、正確、錯誤狀態的文字對比也算過
- [ ] 深色模式與淺色模式各看一次全部元件（`#/styleguide`）
- [ ] 360、390、430、768、820、1024、1280、1366、1440、1920 都沒有水平捲軸（展開所有答案後也沒有）
- [ ] 圖示按鈕在每種寬度都是 44×44，頂部列元素不重疊、不被擠出畫面

### 幾何與對齊
- [ ] 頁面最上方：頂部列底線 = 側欄頂端 = 把手頂端
- [ ] 捲到最底：側欄底端 = 把手底端 = 頁尾上緣，沒有東西蓋過頁尾
- [ ] 側欄邊框和把手的線在同一個 x，畫面上只有一條線
- [ ] 首頁、模組頁沒有空的右側欄
- [ ] SVG 檢查腳本：0 個懸空端點、0 個文字壓框／壓線／重疊／單字成行
- [ ] 用眼睛看過每張圖一次（腳本抓不到「線段穿過方框」這類情況）

### 換行
- [ ] 每課跑 line-breaking.md 4.2 的腳本，0 個孤行、拆詞、行長不平衡
- [ ] console 沒有「縮到字級下限仍有孤行」的警告；有的話改寫那個標題
- [ ] 375、768、1280 × 字級 100%、150% 共 6 種組合，看過側欄、上一課／下一課、所有按鈕

### 側欄與字級
- [ ] 1280px 時用滑鼠拖曳把手，寬度跟手、停在最小與最大值
- [ ] 把手用 Tab 聚焦後 `←` `→` `Home` `End` 都有效；雙擊恢復預設
- [ ] 重新整理後寬度與字級都還原
- [ ] 字級 150% 時 375px 沒有水平捲軸，popup 與側欄沒被裁切

### Hover 與轉場
- [ ] 逐一 hover 第 3 節表格裡的元素：每個只有一種變化
- [ ] 第 4 節表格裡每個元件都看過進場和退場
- [ ] 開啟系統的「減少動態效果」：位移動畫關閉，狀態變化仍看得出來

### 術語 popup
- [ ] 滑鼠能從術語移進 popup，popup 不消失
- [ ] 鍵盤 focus 會出現、`Esc` 關閉、焦點回到術語
- [ ] 手機上點擊開啟、點外面關閉
- [ ] 視窗邊緣的術語，popup 會翻轉方向且不超出畫面

### 內容
- [ ] 自動檢查：0 個 console 錯誤、0 個缺漏術語、0 個溢出、0 個選擇題問題；正確答案是最長選項的比例 ≤ 35%
- [ ] 每課至少 2 張圖；抽 3 課檢查 SVG 在 375px 的字是否看得清楚
- [ ] 抽 3 課，逐題做 content-rules.md 2.4 的自我檢查
- [ ] 每個指令、版本、數據都對得到 `research-notes.md` 的來源；未確認的都有標註
- [ ] 頁尾有「內容更新至 YYYY 年 MM 月」

### 功能
- [ ] 所有單元都能切換，沒有死連結
- [ ] 測驗作答、重做、進度儲存正常
- [ ] 複製按鈕用真實點擊（不是腳本 `click()`）測過；腳本點擊沒有使用者手勢，會走到備援訊息
- [ ] `/` 搜尋、`←` `→` 換課、Tab 走過一個完整單元
