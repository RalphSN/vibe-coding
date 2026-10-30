# 研究筆記（查證日期：2026-10-16）

| 項目 | 狀態 | 來源 |
|---|---|---|
| TypeScript 7.0 | 2026-07-08 正式發布；Go 原生編譯器；npm latest 7.0.2（2026-07 時）；沒有穩定的程式化 API，預計 7.1 | Microsoft、InfoQ 2026-08、Visual Studio Magazine |
| TypeScript 6.0 | 2026-03-23；strict 預設 true、module 預設 esnext、target 預設最新（es2025）、types 預設 []、rootDir 預設 tsconfig 所在資料夾；棄用 es5、node10、baseUrl、amd/umd/system、outFile 等 | devblogs.microsoft.com/typescript/announcing-typescript-6-0 |
| Node.js 型別擦除 | 22.18、23.6 起預設啟用；24.12、25.2 起穩定；不支援 enum、帶執行期程式碼的 namespace、參數屬性、import alias；--experimental-transform-types 已在 26.0 移除 | nodejs.org/api/typescript.html |
| erasableSyntaxOnly | TS 5.8 起 | TS 5.8 release notes |
| Zod | 範例使用 Zod 4 API（z.email()、z.prettifyError），版本號未逐項查證 ⚠️ | zod.dev |

## 編譯器訊息

課程中的 tsc 錯誤訊息依各錯誤代碼的標準格式撰寫，行欄位置為示意，未在本機執行 ⚠️。

## 2026-10-29 改版審查

不出測驗改版：27 課都補了「深入：」段落；深入思考題從 27 題留下 20 題（刪掉 0-1、2-1、2-4、3-1、3-3、4-3、5-1 這 7 題看課文就能答的）；本書沒有總複習課，不用改寫一頁地圖。查證日期 2026-10-30。

### 修正的錯誤

| 課 | 原本 | 修正後 | 出處 | 可信度 |
|---|---|---|---|---|
| 1-3 | `type Options = { timeout?: number }`，經過變數傳 `{ timout }`「通過」 | 全可選的型別是弱型別，沒有共同屬性時經過變數也會報 TS2559；範例加上必填的 `url` | TS 2.4 release notes（weak type detection） | ✅ |
| 1-4 | 錯誤位置 `6:27` | `6:29`（`String(x)` 的起點） | 依原始碼逐字計算 | ✅ |
| 2-1 | 比喻限制說「中間呼叫了可能改變它的函式，收斂可能被重置」 | 函式呼叫不會重置收斂（刻意取捨）；失效的是重新指定與 callback 裡的 let（TS 5.4 起最後一次指定後會保留） | TS 5.4 release notes；TypeScript issue #9998 | ✅ |
| 2-2 | 深入思考題以 C# 15 union／closed 類別為前提 | 改成 Kotlin sealed class、Rust enum 對照（C# 15 細節未查證，不寫） | — | — |
| 3-4 | 比喻限制說「satisfies 不會限制多出來的屬性」 | satisfies 對物件字面值會做多餘屬性檢查；限制改成「只檢查程式碼裡寫死的值」 | TS 4.9 release notes | ✅ |
| 4-4 | 表格列 `"16 px"` 不符合 `${number}px` | 是否接受空白取決於編譯器的數字字串判斷，無法確認；換成確定不符合的 `"16PX"` | — | ⚠️ 原說法未查證 |
| 5-4 | 範例 `gtag: Function` | `(...args: unknown[]) => void`（和 1-4「不要用 Function」一致） | — | ✅ |
| 6-4 | 「7.1 預計提供程式化 API」 | 7.1 Beta 已於 2026-10-20 發布，新 API 入口 `typescript/sync`、`typescript/async`、`typescript/ast` 等；RC 約一個月後 | devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/ | ✅ |
| 6-4 | csrun 標題「先預測，再看結果」 | 「比較 6.0 與 7.0 的建置時間」 | — | — |
| 0-1 | 版本表只到 7.0 | 加 7.1 Beta 列；npm latest 7.0.2 | npm registry（`npm view typescript dist-tags`） | ✅ |
| 4-4 等 | 雙反引號程式碼（含樣板字面型別）在頁面上顯示錯亂 | `md()` 支援 ``` `` … `` ``` | 頁面實測 | ✅ |

### 新查證的事實

| 事實 | 來源 | 查證日期 | 可信度 |
|---|---|---|---|
| typescript npm latest 7.0.2（2026-07-08）、beta 7.1.0-beta（2026-10-20） | npm registry | 2026-10-30 | ✅ |
| 7.0 VS Code 原始碼完整建置 125.7s → 10.6s；官方說 8–12 倍 | InfoQ 2026-08 引述官方公告 | 2026-10-30 | 🟡 |
| 7.1 Beta：es2026 target 穩定、content mappers（需 `--runExternalCode`）、分配式條件型別檢查更嚴格 | 7.1 Beta 公告 | 2026-10-30 | ✅ |
| typescript-eslint、Volar 等改用新 API 預計 2027 Q1 | 僅第三方（byteiota） | 2026-10-30 | ⚠️ 未確認 |
| TS 6.0：strict true、module esnext、target es2025、types []（`["*"]` 恢復舊行為）、noUncheckedSideEffectImports true、esModuleInterop 不能 false、有 tsconfig 時 `tsc file.ts` 報錯（`--ignoreConfig`） | TS 6.0 公告 | 2026-10-30 | ✅ |
| Node：22.18／23.6 預設型別擦除，24.12／25.2 穩定；不支援 enum、帶程式碼的 namespace、參數屬性、import alias、decorator、tsconfig paths、.tsx；`--experimental-transform-types` 26.0 移除；文件版本 26.13.0（26.x LTS） | nodejs.org/api/typescript.html | 2026-10-30 | ✅ |
| Zod npm latest 4.6.7；4.0.0 發布於 2025-07-09 | npm registry | 2026-10-30 | ✅ |

### 補上的子題（深入段落）

型別系統不完全可靠（0-1）、Node 擦除邊界與子路徑匯入（0-2）、錯誤代碼分區與 noErrorTruncation、@ts-expect-error（0-3）、寬化與 isolatedDeclarations（1-1）、MAX_SAFE_INTEGER 與 readonly 方向（1-2）、弱型別與交集衝突（1-3）、方法參數雙變（1-4）、收斂失效情況（2-1）、窮舉寫法比較（2-2）、`{}`／object／unknown（2-3）、exactOptionalPropertyTypes 與 PATCH 語意（2-4）、const 型別參數與 NoInfer（3-1）、Object.keys 與 keyof（3-2）、DistributiveOmit（3-3）、satisfies 取捨（3-4）、同名值與型別（4-1）、同態映射（4-2）、never 分配與遞迴上限（4-3）、infer 拆字串（4-4）、useDefineForClassFields 與 # 遇到 Proxy（5-1）、品牌型別（5-2）、moduleResolution 選擇與 require(esm)（5-3）、exports 的 types 條件（5-4）、TS 6.0 預設值（6-1）、Zod 4 與 Standard Schema（6-2）、錯誤沒有型別與 AbortSignal.any（6-3）、TS 7 現況（6-4）。

### 未查證

- 課程中 tsc 錯誤訊息的行欄位置仍是依原始碼推算，未在本機以 TypeScript 7 實際執行。
- 0-1 csrun 的 tsc 輸出排版（空行、縮排）為示意。
- 5-3「Node 22.12 起預設允許 require(esm)」、6-3「204 時 res.json() 拋 SyntaxError」依既有知識撰寫，這次未重新查證。
