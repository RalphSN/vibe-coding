# 研究筆記：JavaScript 著作（互動課程網站）

> 查證日期：2026-10-14・下次重新查證：2027-01-14
> 標記：✅ 官方或一手資料確認／🟡 二手資料摘要／⚠️ 未確認

## 0. 對課程設計影響最大的發現

1. **ES2026 已定案，但大部分新功能還不能假設讀者的環境都有。** 課程主線只用「各大瀏覽器與 Node.js 22 都支援」的功能，新功能另外放「新功能」貼紙並附支援表。
2. **Temporal 已在 Chrome 144、Firefox 139、Node.js 26 上線，但 Safari 只有預覽版。** 日期時間單元以 `Date` 為主，Temporal 作為「下一代」對照，不當主線。
3. **Node.js 24 是目前的 Active LTS，Node.js 26 預定 2026-10-28 成為 LTS。** 課程以「Node.js LTS」稱呼，安裝指引寫 24，並說明 26 的時程。
4. **本機只有 Node.js 22.13.1。** 範例都在 22.13 實測；只有 Node 24／26 才有的功能（`Error.isError`、`Iterator.concat`、Temporal）不能在本機驗證，課程裡標「未在本機實測」。
5. **使用者會寫 TypeScript。** 課程定位是「型別檢查管不到的執行期行為」，和 Notion 的知識卷軸（`JavaScript｜從語言核心到實戰完整教材`）互補，不重複搬內容：網站版的重點是可以操作的模擬器。

## 1. ECMAScript 版本 ✅

| 項目 | 內容 | 來源 |
|---|---|---|
| ES2026 | ECMA-262 第 17 版，2026-06-30 通過 | Ecma 規格 PDF、InfoWorld 報導 |
| ES2026 新增（TC39 finished proposals，Expected Publication Year 2026） | JSON.parse source text access、Iterator Sequencing（`Iterator.concat`）、Uint8Array 與 Base64 互轉、`Math.sumPrecise`、`Error.isError`、`Array.fromAsync`、`RegExp.escape` | TC39 finished-proposals.md |
| ES2027 預定 | Temporal、Explicit Resource Management（`using`）、Upsert（`Map.prototype.getOrInsert`）、Iterator chunking／includes／join、Joint Iteration、`Atomics.pause` | 同上 |
| 二手資料的錯誤 | 部分部落格把 Temporal、`using` 寫成 ES2026 的功能，與 TC39 表格不符；課程以 TC39 表格為準 | 對照 TC39 表格 |

## 2. Node.js ✅（日期有二手資料，已對照多篇一致）

| 版本 | 狀態（2026-10-14） | 重要日期 |
|---|---|---|
| 26 | Current（2026-05-05 起） | 2026-10-28 成為 Active LTS，支援到 2029-04-30 |
| 24 | Active LTS | 2026-10-20 轉 Maintenance，2028-04-30 EOL |
| 22 | Maintenance LTS | 2027-04-30 EOL |

來源：Node.js 官方 previous-releases 頁（課程連結這頁）；InMotion Hosting、HeroDevs、DEV Community 文章（日期一致）。

## 3. 瀏覽器與 Node.js 支援表 ✅（MDN browser-compat-data，2026-10-14 擷取）

| 功能 | 規格版本 | Chrome | Firefox | Safari | Node.js | 課程處理 |
|---|---|---|---|---|---|---|
| `toSorted`、`with` | ES2023 | 110 | 115 | 16 | 20 | 主線 |
| `Object.groupBy` | ES2024 | 117 | — ⚠️ 未擷取 | 17.4 | 21 ⚠️ 本機 22 實測可用 | 主線 |
| `Promise.withResolvers` | ES2024 | 119 | 121 | 17.4 | 22 | 主線 |
| Set 方法（`union`、`intersection`） | ES2025 | 122 | 127 | 17 | 22 | 主線 |
| Iterator helpers（`.map` 等） | ES2025 | 122 | 131 | 18.4 | 22 | 主線（標「較新」） |
| `Promise.try` | ES2025 | 128 | 134 | 18.2 | 23 | 新功能貼紙；本機 22 不能跑 |
| `Array.fromAsync` | ES2026 | 121 | 115 | 16.4 | 22 | 主線 |
| `Error.isError` | ES2026 | 134 | 138 | 18.4（部分：`DOMException` 回傳 false） | 24.3 | 新功能貼紙 |
| `Math.sumPrecise` | ES2026 | 147 | 137 | 26.2 | 尚未支援 | 新功能貼紙 |
| `Iterator.concat` | ES2026 | 146 | 147 | 26.4 | 26 | 新功能貼紙 |
| Temporal | ES2027 預定 | 144 | 139 | 僅預覽版 | 26 | 只做對照，不當主線 |
| `using` 宣告 | ES2027 預定 | ⚠️ 截至 2026-10 查證狀態：未確認（BCD 檔案路徑查不到） | ⚠️ | ⚠️ | ⚠️ | 只在延伸提到 |

## 4. 已在本機實測的執行期行為 ✅（Node.js 22.13.1、Chrome headless）

2026-10-14 為 Notion 知識卷軸撰寫範例時實際執行過，網站可直接沿用為「預測再驗證」題的標準答案：

- `0.1 + 0.2` → `0.30000000000000004`；`2 ** 53 + 1` → `9007199254740992`；`0.29 * 100` → `28.999999999999996`
- 模組（嚴格模式）改字串字元：`TypeError: Cannot assign to read only property '0' of string 'java'`
- TDZ：`ReferenceError: Cannot access 'b' before initialization`；改 const：`TypeError: Assignment to constant variable.`
- `[10, 9, 1, 100].sort()` → `[1, 10, 100, 9]`；reduce 沒給起始值加物件 → `[object Object]9213`
- `var` 迴圈 + `setTimeout` → `3 3 3`；`let` → `0 1 2`
- 方法脫鉤：`TypeError: Cannot read properties of undefined (reading 'name')`；Node 的 `setTimeout` 回呼裡 `this` 是計時器物件（不是 undefined）
- 事件迴圈順序：同步 → `Promise.then` → `queueMicrotask` → `setTimeout`；巢狀題 `A G D F B C E`
- `fetch` 404 不會 reject；逾時錯誤 `TimeoutError: The operation was aborted due to timeout`；拿掉 `res.ok` 會變 `SyntaxError: Unexpected token 'o', "not found" is not valid JSON`
- ESM：匯入名稱不符 `SyntaxError: The requested module './format.mjs' does not provide an export named 'formatScore'`；JSON import（`with { type: 'json' }`）在 Node 22.13 可用、無警告
- 未 await 的 rejection 會讓 Node 22 以 exit code 1 結束
- `node --test`（spec reporter）輸出格式：`✔ 名稱 (毫秒)`、`ℹ pass N`

## 5. 網站互動元件的技術查證

| 需求 | 做法 | 狀態 |
|---|---|---|
| 讓讀者在網頁裡執行 JS 範例 | 用沙盒 `iframe`（`sandbox="allow-scripts"`、`srcdoc`）執行，攔截 `console.log` 用 `postMessage` 傳回 | 🟡 標準做法，實作時要驗證；不用 `eval` 在主頁執行 |
| 事件迴圈模擬器 | 不真的執行，用預先寫好的步驟資料播放（堆疊、微任務、任務三欄） | 依規則 13：屬於「真的在變化的機制」，可做動畫，要有 reduced-motion 版 |
| 浮點數視覺化 | 用 `DataView` 把 number 拆成 64 位元顯示 | ✅ `DataView.setFloat64` 為 ES2015 標準 |
| highlight.js | 沿用參考站的 cdnjs 版本與 SRI | 實作時從參考站複製 |

## 6. 參考資料（課程頁尾列出）

- [ECMA-262 第 17 版（ECMAScript 2026）](https://ecma-international.org/wp-content/uploads/ECMA-262_17th_edition_june_2026.pdf)
- [TC39 finished proposals](https://github.com/tc39/proposals/blob/main/finished-proposals.md)
- [MDN JavaScript](https://developer.mozilla.org/zh-TW/docs/Web/JavaScript)
- [MDN browser-compat-data](https://github.com/mdn/browser-compat-data)
- [Node.js 版本與支援時程](https://nodejs.org/en/about/previous-releases)

## 7. 未確認清單

- ⚠️ `using` 宣告的各瀏覽器支援版本（BCD 路徑查不到，實作前再查）。
- ⚠️ `Object.groupBy` 的 Firefox 與 Node.js 起始版本（只擷取到 Chrome、Safari）。
- ⚠️ 2026-10 各瀏覽器的穩定版版本號；課程不寫「目前最新版是幾版」，只寫各功能從哪一版起支援。
- ⚠️ 沙盒 iframe 在 Safari 的 `postMessage` 行為未實測（使用者規範要求 Chrome 與 Safari 都看過，這台是 Windows，Safari 需要使用者在 Mac 驗證）。

## 2026-10-29 改版審查

不出測驗改版：35 課補「深入：」段落，深入思考題 35 → 30 題，9-4「總複習測驗」改寫成「一頁地圖」。

### 修正的錯誤

| 課 | 原本 | 修正後 | 出處 |
|---|---|---|---|
| 0-2（含術語 LTS、版本圖） | 「Active LTS 是 Node.js 24；26 預定 10-28 成為 LTS」 | Node.js 26 自 2026-10-28 起是 Active LTS，24 自 2026-10-20 起是 Maintenance LTS | [Node.js 版本頁](https://nodejs.org/en/about/previous-releases) ✅ 2026-10-29 |
| 4-1 深入思考題、4-4 常見錯誤 3 | 「Vue 或 React 直接 push，框架可能偵測不到」 | React 用 Object.is 比參考，偵測不到；Vue 3 的 reactive 陣列由 Proxy 攔截 push，偵測得到 | [React 文件](https://react.dev/learn/updating-arrays-in-state)、[Vue 文件](https://vuejs.org/guide/essentials/reactivity-fundamentals.html) ✅ |
| 7-3 深入思考題 | 「3 件 33.33 元總額顯示 99.99000000000001」 | Node.js 22.13 實測 `33.33 * 3` 與三次相加都是 99.99；改成 3 件 10.1 元 → 30.299999999999997 | 本機實測 ✅ |
| 7-4 sources | 只列 mdn-js | 加上 chrome-devtools | — |
| 9-2 支援表 | `Object.groupBy` Firefox「未查證」、Node.js「本機 22 可用」 | Firefox 119、Node.js 21 | [BCD Object.json](https://github.com/mdn/browser-compat-data) ✅ |
| 9-2 支援表 | `using` 全部「未查證」 | Chrome 134、Firefox 141、Safari 僅預覽版、Node.js 24 | BCD statements.json ✅ |
| 9-2 版本表 | ES2026 漏列 JSON.parse source text access | 補上（`JSON.rawJSON` Chrome 114、Firefox 135、Safari 18.4、Node.js 21） | TC39 finished proposals ✅、BCD ✅ |
| 9-2 三類對照 | 目標環境 Node.js 22，`Promise.try` 列「要查表」 | 目標改為目前的 LTS（24／26），`Promise.try` 改列「現在就能用」，並註明 22 不行 | Node.js 版本頁 ✅ |
| 9-2 | 標題「分類練習」 | 改成「能不能用：三類對照」，加入功能偵測的可執行範例 | — |
| 9-3 速查表 | `==` 的出處寫 3-3 | 改成 3-1 | — |

### 這次查證的事實

- Node.js 26 內建 V8 14.6（對應 Chromium 146），Temporal 預設開啟、有 `Iterator.concat` 與 `Map.prototype.getOrInsert`；`Math.sumPrecise`（Chrome 147）在 Node.js 26 仍不支援（BCD nodejs: false）。🟡 V8 版本為第三方新聞來源；✅ sumPrecise 來自 BCD。
- Node.js 27 起改為一年一版：6 個月 Current、6 個月 Alpha，之後進 LTS。✅ Node.js 版本頁。
- TC39 finished proposals：ES2027 預定 Temporal、Explicit Resource Management、Upsert、Iterator chunking 等；ES2026 含 JSON.parse source text access。✅
- WinterCG 於 2025 年改為 Ecma TC55（WinterTC），2025-12 發布 ECMA-429 Minimum Common Web API。✅ Ecma／W3C 公告。
- `Intl.Segmenter`：Chrome 87、Firefox 125、Safari 14.1、Node.js 16。✅ BCD
- `AbortSignal.any`：Chrome 116、Firefox 124、Safari 17.4、Node.js 20.3。✅ BCD
- 本機 Node.js 22.13 實測：家庭 emoji length 8／碼位 5／字素 1；`🇹🇼` 4／2／1；`["1","2","3"].map(parseInt)` 是 `[1, NaN, NaN]`；`JSON.stringify(new Map([[1,2]]))` 是 `"{}"`；`Object.keys({b:1,2:'x',a:2,1:'y'})` 是 `['1','2','b','a']`。✅

### 補進深入段落的子題

伺服器端執行環境與 WinterTC（0-1）、Node.js 發布節奏與版本管理（0-2）、堆疊追蹤限制與 source map（0-3）、包裝物件與跨 realm 型別判斷（1-1）、2⁵³ 與 EPSILON 的相對誤差、Math.sumPrecise（1-2）、碼位與字素、normalize（1-3）、JSON 裡「沒有值」的四種寫法與 JSON Merge Patch（1-4）、freeze／seal（2-1）、class 與循環匯入的死區（2-2）、script 與模組的全域差異（2-3）、規格的四種相等演算法（3-1）、邏輯指定運算子與 `?.` 邊界（3-2）、Number 的邊界輸入與 valueAsNumber（3-3）、傳共享、WeakMap、React／Vue 偵測差異（4-1）、不可變更新與 structuredClone 限制（4-2）、Iterator helpers 與 reduce 的平方成本（4-3）、比較函式一致性、穩定排序、Intl.Collator（4-4）、Map 與物件的鍵順序與 JSON（4-5）、預設參數求值時機與 `.map(parseInt)`（5-1）、閉包記憶體與三種私有狀態（5-2）、各處的 this 與 bind 移除監聽的陷阱（5-3）、原型污染與 class 進階語法（5-4）、畫面更新、計時器最短延遲、Node.js 的 nextTick（6-1）、Promise 建構函式同步執行、withResolvers、unhandledrejection（6-2）、限制同時數量與 Promise.all 後的半成品（6-3）、CORS、重試策略、AbortSignal.any、body 只能讀一次（6-4）、模組載入順序與 JSON 模組（7-1）、可預期錯誤與 bug、Error.isError、AggregateError（7-2）、node:test 的 mock 與假時鐘（7-3）、logpoint 與 Node.js 除錯（7-4）、強制同步排版（8-1）、捕獲階段與監聽選項（8-2）、`javascript:` 網址與 CSP（8-3）、localStorage 容量與替代方案（8-4）、計時器漂移與 Wake Lock（9-1）。

### 未查證

- ⚠️ Chrome「隱藏 5 分鐘後連鎖計時器一分鐘才跑一次」（9-1 深入）：依記憶的 Chrome 節流政策，未在本次重新查證。
- ⚠️ Safari 對一段時間沒互動的網站清除程式寫入的儲存（8-4 深入）：WebKit 追蹤防護政策，本次未重新查證天數，課文不寫天數。
- ⚠️ Screen Wake Lock 各瀏覽器版本（9-1 深入）：課文不寫版本號。
- ⚠️ `Error.isError` 在 Safari 的支援程度沿用 2026-10-14 的「18.4（部分）」，本次未重查。
- ⚠️ `node:test` 的 `t.mock.timers` 在 Node.js 26 的狀態沿用 Node.js 文件既有說明，本次未逐版查證。

### 下次重新查證

2027-01（9-2 支援表、Node.js 版本狀態）。
