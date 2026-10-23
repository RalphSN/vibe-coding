# 交接：AI 系列・序章｜AI 全景地圖

> 狀態（2026-10-22）：4 個模組、14 課全部完成，已上書櫃（3D 與 2D 都排第一本，在第一部前面）。

## 檔案

| 要改的東西 | 改這裡 | 產生出來的（不要手改） |
|---|---|---|
| 課程內容 | `src/m0.html`～`src/m3.html` | `index.html` |
| 系列選單、旅程六站、課程清單 | `src/c-data.html`（`SERIES`、`JOURNEY`、`COURSES`） | 同上 |
| 互動元件 | `src/f-widgets.js` | 同上 |
| 來源 | `src/d-sources.html`；查證細節在 `research-notes.md` | 同上 |

重新產生：

```bash
sh ai-dev-rules/skills/course-web-neo-brutalism/scripts/build.sh course-web/ai-series-0-map-course/src course-web/ai-series-0-map-course/index.html
```

## 和第一部的差異

- 引擎與元件從第一部複製，`src/` 是獨立的一份；改共用元件時兩本都要改、都要 build。
- 新元件 `sampler`：下一個 token 的機率長條、temperature 與 top-p 拉桿、「抽一個／挑最高的」。用在 1-4、2-4。
- `ragtrace` 多了 `chip` 參數，2-1 用「逐站追蹤」。
- `JOURNEY` 改成六站（你的電腦 → 後端 → API → tokenizer → GPU 上的模型 → 回到螢幕），多了 `byLesson` 逐課標示；`journeyHtml(moduleId, lessonId)`。
- localStorage key：`ai-series-0-map-course.v1`、`.prefs.v1`。

## 驗證紀錄（2026-10-22，內建瀏覽器 Chromium）

| 項目 | 結果 |
|---|---|
| 缺術語、SVG 文字出界 | 14 課都是 0 |
| 每課 SVG／互動 | 每課 2 張圖、至少 1 個互動（3-3 是 checklist＋10 題總複習） |
| 選擇題 | 56 題，正確答案是最長選項 16 題（28.6%，上限 35%） |
| 閱讀時間 | 0-1 約 6 分，其他 7–9 分 |
| 寬度 360／768／1280 | 首頁＋14 課展開答案後都沒有水平捲軸 |
| 互動實測 | sampler、knobs、ragtrace、tokenmeter、costcalc、ssestream 都操作過 |
| 深色模式 | 看過 1-1 的套娃圖 |

未驗證：Safari、`prefers-reduced-motion`、字級 150%。

## 下次查證

**2027-01-22**：2-2、2-5 的模型價格（Opus 5.5 $4／$20），和第一部一起查。

## 下一卷

照使用者的順序：**第二部｜LLM 原理**。第一部 `research-notes` 與這本的模組 2 已經預告了要細講的點（tokenizer、KV cache、取樣、幻覺）。
