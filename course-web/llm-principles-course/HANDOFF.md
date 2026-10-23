# 交接：AI 系列・第二部｜大型語言模型原理

> 狀態（2026-10-22）：8 個模組、28 課全部完成，已上書櫃（排在第一部後面）。

## 檔案

| 要改的東西 | 改這裡 | 產生出來的（不要手改） |
|---|---|---|
| 課程內容 | `src/m0.html`～`src/m7.html` | `index.html` |
| 系列選單、主軸六站、課程清單 | `src/c-data.html`（`SERIES`、`JOURNEY`、`COURSES`） | 同上 |
| 互動元件 | `src/f-widgets.js`（這卷新增 `bpe`、`attnmap`） | 同上 |
| 來源 | `src/d-sources.html`；查證細節在 `research-notes.md` | 同上 |

重新產生：

```bash
sh ai-dev-rules/skills/course-web-neo-brutalism/scripts/build.sh course-web/llm-principles-course/src course-web/llm-principles-course/index.html
```

## 這卷新增的元件

- `bpe`：真的跑 BPE（數配對、合併最多的那一對、同分依字母順序），可逐步播放。
- `attnmap`：每列真的做 softmax；可切換因果遮罩、除以 √d、多個頭。分數是依規則產生的示意資料。
- `knobs` 的 compute 都是實際公式（向量表大小、正弦位置編碼、layer norm、參數量、KV cache、6ND、−log p）。5-3 的 Chinchilla 擬合常數是記憶值，畫面已註明只看趨勢。

## 驗證紀錄（2026-10-22，內建瀏覽器 Chromium）

| 項目 | 結果 |
|---|---|
| 缺術語、SVG 文字出界、每課圖數與互動 | 28 課全部通過（每課至少 2 張圖、1 個互動） |
| 選擇題 | 119 題，正確答案是最長選項 32 題（26.9%） |
| 閱讀時間 | 0-1 約 5 分，其他 6–9 分 |
| 寬度 360px | 首頁＋28 課展開答案後沒有水平捲軸 |
| 互動實測 | bpe 走完 8 次合併、attnmap 切換縮放與遮罩、knobs 數值核對過 |

未驗證：Safari、`prefers-reduced-motion`、深色模式逐課檢查（共用第一部的樣式）。

## 下次查證

**2027-01-22**：7-1 的 API 取樣參數、7-2 的 context window 數字。
