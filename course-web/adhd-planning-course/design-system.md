# 設計系統：先動起來（ADHD 規劃與啟動）

> 版本：v1（2026-10-19）・ 基底：`javascript-course` 的 token、版面與引擎（照 `course-web-neo-brutalism` 實作，已通過第 4 階段驗證）
> 視覺方向：沿用「工地告示牌 × 手作貼紙本」；本課的記憶點是「工作表」：每課都有一張讓你現在就填的卡片，填完收進「我的系統」

## 1. 與參考站不同的地方

| 項目 | 參考站（javascript-course） | 本課 |
|---|---|---|
| 品牌字 | `{ JS }`／`{ JavaScript } × 執行期`，閃爍游標 | `▶ 動起來`／`▶ 先動起來 × ADHD 規劃`，不閃爍（閃爍的東西對 ADHD 讀者是干擾） |
| 模組色 | `--m0`…`--m9` | 只用 `--m0`…`--m8`（9 個模組） |
| 儲存 key | `javascript-course.*` | `adhd-planning-course.v1`（進度）、`adhd-planning-course.prefs.v1`（偏好）、`adhd-planning-course.system.v1`（我的系統） |
| 首頁示範 | runner：`0.1 + 0.2` | `stuckcheck`：回答 2–3 題，找出卡在哪一段 |
| 新路由 | — | `#/system`：我的系統，可全部複製、清除 |
| 互動元件 | runner、refviz 等 11 個 | stuckcheck、levers、shrinker、ifthen、timebox、estimator、breakdown、promptkit、woop、classify、checklist（見 outline A-5） |

## 2. 對比度

沿用參考站已驗證的 token（最低一組：黑字 on `--danger` `#FF6B6B` 7.13；參考站第 4 階段實測全站最低 7.13）。本課沒有新增顏色。

| 新用法 | 前景 / 背景 | 對比 |
|---|---|---|
| 拉桿、倒數的填色長條 | `--m0`、`--m2` 色塊，非文字 | 對 `--bg` 都 ≥ 3:1（沿用參考站的模組色檢查） |
| ifthen 未通過的檢查 | `--ink-muted` on `--surface` | 沿用參考站次要文字 ≥ 4.5:1 |

## 3. 動畫（規則 9、13）

- 只有 `timebox` 是動畫：時間真的在流逝。長條用 `transform: scaleX` 縮小，每 250ms 更新一次；reduced-motion 時只在整分鐘跳一次。
- `levers` 的長條隨拉桿即時更新（參數改變的回饋），用 transform 過渡 240ms；reduced-motion 時無過渡。
- 其他元件都是靜態或「按了就更新」。概念流程（逃避循環、每週回顧）都是靜態 SVG。

## 4. 個人資料

- 讀者在元件裡寫的任務、計畫只存 localStorage（`adhd-planning-course.system.v1`），不送出任何網路請求。
- 「我的系統」頁提供「全部複製成文字」與「清除我的資料」（先 `confirm`，只清這個 key，不清課程進度）。
- `promptkit` 下方固定提醒：不要貼上公司機密、客戶個資或密碼。

## 5. 語氣

- 不用「你應該」「你又」；失敗寫成「系統哪裡漏接」。
- 元件的回饋寫「現在就做的一個動作」，不寫評價（不寫「很好」「太差」）。
