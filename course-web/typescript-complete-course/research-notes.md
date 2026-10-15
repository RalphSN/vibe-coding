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
