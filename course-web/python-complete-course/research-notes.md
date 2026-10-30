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

## 2026-10-29 改版審查

查證日期：2026-10-30。改版內容：取消測驗後每課補「深入：」段落（28 課）、深入思考題由 28 題刪到 24 題（刪 0-2、5-1、5-2、5-5，答案在課文裡就找得到，內容併進深入段落）、0-1 新增 knobs 版本支援週期試算、csrun 拿掉預測改成「執行」。

### 修正的錯誤

| 課 | 原本 | 修正後 | 出處 |
|---|---|---|---|
| 0-2 | Windows 不用 uv 時「從 python.org 下載安裝程式，勾選 Add to PATH」 | 改成 Python 安裝管理員（`py install 3.15`）；傳統 .exe 安裝程式到 3.16 停止提供 | ✅ python.org/downloads/latest/pymanager |
| 0-1（深入思考答案） | 「3.13 起有實驗性 JIT 與無 GIL 版本」 | free-threaded 版本 3.14 起正式支援（PEP 779）；JIT 仍實驗性，3.15 平均快 7–12% | ✅ What's New 3.14、3.15 |
| 全書 | 首頁、meta 寫「每課先預測、再看輸出」 | 改成可執行範例與深入段落 | — |

### 確認正確（未改）

| 事實 | 來源 | 可信度 |
|---|---|---|
| 3.15.0 於 2026-10-09 發布；2026-10-25 最新為 3.15.2、3.14.10；3.10 於 2026-10 EOL；3.13 以下只修安全；3.16 預計 2027-10-06 | python.org/downloads | ✅ |
| 3.13 起 bugfix 2 年＋安全 3 年；3.9–3.12 是 1.5＋3.5 年；5 月 beta 1 功能凍結 | PEP 602 | ✅ |
| lazy import 限制、frozendict、PEP 798、PEP 686、Counter `^`、list.push 提示 | What's New 3.15 | ✅ |
| 19 段可執行範例的輸出（csrun） | 本機 CPython 3.14.6 實跑比對；差異只有 3.11 起的 `~~~^^^` 標記（刻意省略）。3.15 專屬語法、httpx、mypy、pytest、Windows 缺 tzdata 的範例未實跑 | 🟡 |

### 深入段落補的子題（新資訊）

- 3.15：`sentinel` 內建型別（PEP 661，1-4）、`re.prefixmatch` 與 re.match 軟性棄用（6-1）、argparse `suggest_on_error` 預設開啟（5-5）、`profiling.sampling` 取樣分析器（PEP 799，4-2）、`TaskGroup.cancel()` 與 asyncio policy 3.16 移除（4-4）、`__cached__` 移除與 PEP 829（3-3）、strptime 沒年份的 `%d` 改 ValueError（6-2）、csv.Sniffer 加速（6-4）、JIT 效能數字（0-1）。
- 3.14：t-string（PEP 750，1-2）、註記延遲求值（PEP 649／749，4-3）、except 免括號（PEP 758）與 finally 的 SyntaxWarning（PEP 765，3-4）、`python -m asyncio ps/pstree`（4-4）、argparse 彩色說明（5-5）、Path.copy／move（5-2）。
- 其他：小整數快取與參考計數（1-1）、match 擷取名字陷阱（1-3）、`/` 與 `*` 參數（1-4）、list 操作成本（2-1）、MappingProxyType（2-2）、`+=` 的 `__iadd__`（2-3）、PEP 709 推導式內聯（2-4）、MRO 與 `__repr__`／`__str__`（3-1）、dataclass 的 slots／kw_only／hash 規則（3-2）、`sys.path[0]` 與 `-m`（3-3）、EAFP（3-4）、產生器 close（4-1）、`lru_cache` 與方法快取（4-2）、TypeIs／assert_never（4-3）、`.python-version` 與函式庫 vs 應用程式鎖定（5-1）、utf-8-sig／cp950 與原子寫檔（5-2）、fixture scope（5-3）、Client 連線重用與冪等重試（5-4）、`[project.scripts]`（5-5）、災難性回溯與 `\d` 全形數字（6-1）、夏令時間 fold 與 utcnow 棄用（6-2）、deque／ChainMap／pairwise（6-3）、stdev vs pstdev 與全書地圖（6-4）。

### 未查證

- ⚠️ 4-3 對 mypy、pyright、ty 的定位描述是一般認知，未逐一查官方說明；ty 的穩定程度未查證。
- ⚠️ 1-2 PEP 709 「最多快一倍」依 PEP 709 本文記憶，未重新開啟確認。
- ⚠️ `py install 3.15` 的確切語法：PEP 773 討論的例子是 `py install 3.16`，3.15 版的寫法依同樣規則推得。
