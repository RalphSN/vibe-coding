# 研究筆記（查證日期：2026-10-16）

| 項目 | 狀態 | 來源 |
|---|---|---|
| React 19.3 | 2026-09-09；ViewTransition 與 Fragment Refs 轉為穩定；browser()、Trusted Types、Server Components 可直接渲染 <Context> | react.dev/blog/2026/09/09/react-19-3 |
| React 19.2 | 2025-10-01；Activity、useEffectEvent、Performance Tracks | react.dev/blog |
| React Compiler 1.0 | 2025-10-07 | react.dev/blog/2025/10/07/react-compiler-1 |
| React Foundation | 2026-02-24 宣布由 Linux Foundation 託管 | react.dev/blog |
| RSC 安全公告 | 2025-12 有兩則 Server Components 漏洞公告（已修補版本 19.0.1、19.1.2、19.2.1 起） | react.dev/blog |
| create-react-app | 2025 年官方宣布棄用 | react.dev（未在本次重新逐頁查證 ⚠️） |

## 畫面輸出

課程中的畫面結果與主控台輸出依 React 文件描述推導，未在本機逐一執行 ⚠️。

## 2026-10-29 改版審查

（查證日期：2026-10-30；改版：不出測驗、每課加「深入」段落）

### 修正的錯誤

| 課 | 原本 | 修正後 | 出處 |
|---|---|---|---|
| 4-4 | `vite.config.ts` 用 `react({ babel: { plugins: ["babel-plugin-react-compiler"] } })` 啟用 Compiler | Vite 8 ＋ `@vitejs/plugin-react` 6 已移除 babel 選項；改用 `@rolldown/plugin-babel` ＋ `reactCompilerPreset()`，舊寫法列為「舊做法」 | https://react.dev/learn/react-compiler/installation ✅ |
| 4-4 | 安裝指令 `npm i -D babel-plugin-react-compiler` | `npm install -D babel-plugin-react-compiler@latest`（官方寫法） | 同上 ✅ |
| 0-1 | 版本表查證日期 2026-10-16，React Foundation「2026-02 起」 | 2026-10-30；Foundation 2026-02-24 正式成立；加 Vite 8 列 | react.dev/blog ✅、https://vite.dev/blog/announcing-vite8 ✅ |
| 本筆記上方 | RSC 安全公告「已修補版本 19.0.1、19.1.2、19.2.1 起」 | 後續公告指出前幾次修補不完整，至少要 19.0.4、19.1.5、19.2.4（寫進 5-4 深入） | https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components ✅ |
| 3-4、5-4 | 範例輸出開頭是被刪掉預測題的答案（「不會。」「能。」） | 改成可獨立閱讀的輸出與標題 | — |
| 5-2 | useOptimistic 範例寫「伺服器回傳失敗」後退回 | 改成「onLike 正常結束但 likes 沒變」；註明 Action 拋錯會交給 Error Boundary | react.dev useOptimistic／useActionState 文件 🟡（未逐字重讀） |

### 新查證的事實

| 事實 | 來源 | 可信度 |
|---|---|---|
| Vite 8 於 2026-03-12 發布，改用 Rolldown；需要 Node.js 20.19+／22.12+ | https://vite.dev/blog/announcing-vite8 | ✅ |
| React 19.3（2026-09-09）：ViewTransition、Fragment Refs 穩定；`use(browser())`、Trusted Types、Server Component 直接渲染 `<Context>`、addTransitionType | https://react.dev/blog/2026/09/09/react-19-3 | ✅ |
| RSC 漏洞：CVE-2025-55182（RCE，2025-12-03）；CVE-2025-55184、CVE-2025-67779、CVE-2026-23864（DoS）、CVE-2025-55183（原始碼外洩）；修補版 19.0.4、19.1.5、19.2.4 | react.dev/blog 兩篇安全公告 | ✅ |
| React Router 的 RSC 支援仍為實驗性（`unstable_reactRouterRSC`，依賴實驗性的 `@vitejs/plugin-rsc`） | https://reactrouter.com/how-to/react-server-components | 🟡（從搜尋摘要與文件版本頁判斷） |
| Vitest 4（2025-10-22）Browser Mode 不再是實驗性 | https://vitest.dev/blog/vitest-4 | 🟡（官方公告經搜尋摘要） |
| React 19：ref callback 可回傳清理函式；`useRef` 需要參數；全域 JSX 命名空間移除 | https://react.dev/blog/2024/12/05/react-19 | 🟡（依記憶，未在本次重新開頁） |

### 補進「深入」段落的子題

渲染／提交與協調、宣告式不適用的情境（0-1）；Vite 開發與正式版差異、Node 版本（0-2）；新 JSX 轉換、大括號各種值的結果（0-3）；props 凍結只有一層（1-1）；key 與元件身分（1-2）；事件委派、onScroll 不冒泡、Capture 事件（1-3）；compound components、render prop（1-4）；惰性初始化、URL 狀態（2-1）；flushSync（2-2）；結構共享、Immer、structuredClone（2-3）；state colocation（2-4）；Effect 連鎖、App 初始化（3-1）；useLayoutEffect、useInsertionEffect（3-2）；ref callback 清理、useImperativeHandle（3-3）；useEffectEvent 的歷史（3-4）；Context 拆分與外部 store selector（4-1）；reducer 取捨與初始化函式（4-2）；useSyncExternalStore 的 getServerSnapshot（4-3）；Compiler annotation 模式（4-4）；requestFormReset、受控輸入游標問題（5-1）；Action 即 Transition、錯誤處理分工（5-2）；Suspense 與 startTransition、`cache()`、`use(browser())`（5-3）；RSC 安全事件與可序列化 props（5-4）；React 19 型別變化（6-1）；jsdom 限制、act 警告、Browser Mode（6-2）；Activity 細節與 19.3 其他新功能（6-3）；全書一頁地圖與會過時的項目（6-4）。

### 未查證

- 1-3「React 17 起 onScroll 不再冒泡、事件委派綁在根容器」：依記憶（React 17 發布文），本次未重新開頁 ⚠️
- 1-1「開發模式 Object.freeze 凍結 props」：依 React 原始碼記憶 ⚠️
- 3-4「useEvent RFC 2022 年提出」：依記憶 ⚠️
- 6-3「Activity 隱藏時 `<video>` 不會自動暫停」：依記憶 ⚠️
- 畫面輸出仍未在本機實際執行（同上方說明）⚠️
