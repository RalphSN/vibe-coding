# 研究筆記（查證日期：2026-10-16）

| 項目 | 狀態 | 來源 |
|---|---|---|
| Python 3.15.0 | 2026-10-09 發布（原定 10-01，因 lazy import 的阻擋問題延後，rc3 於 10-02） | python.org/downloads、Real Python 2026-10 |
| 支援中的版本 | 3.15、3.14 修補中；3.13、3.12、3.11 只修安全；3.10 於 2026-10 結束 | python.org/downloads |
| PEP 810 lazy import | `lazy import x`、`lazy from x import y`；只能在模組頂層；不能在函式、類別、try 中；不支援 `*` | docs.python.org What's New 3.15 |
| PEP 814 frozendict | 內建、可雜湊、非 dict 子類別 | 同上 |
| PEP 686 UTF-8 預設 | open() 未指定 encoding 時用 UTF-8；`encoding="locale"` 取回舊行為 | 同上 |
| PEP 798 推導式解包 | `[*L for L in lists]`、`{**d for d in ds}` | 同上 |
| Counter `^` | 3.15 新增 | 同上 |
| itertools.batched | 3.12 起 | Python docs |
| uv | Astral 的專案管理工具；指令 init／add／run／sync 依官方文件，版本未逐項查證 ⚠️ | docs.astral.sh/uv |

## 程式輸出

本機沒有執行每段程式；輸出依語言規格推導（集合輸出已改成 sorted 避免順序不定）。⚠️ 建議在 3.15 環境逐一 `python app.py` 驗證。
