# 設計系統：JavaScript 著作

> 版本：v1（2026-10-14）・ 基底：`terminal-commands-course` 的 token 與元件（照 `course-web-neo-brutalism` 實作，已通過 layout-geometry 檢查）
> 視覺方向：沿用「工地告示牌 × 手作貼紙本」；本課的記憶點是「程式碼框＋執行結果」並排的實驗台感

## 1. 與參考站不同的地方

| 項目 | 參考站 | 本課 |
|---|---|---|
| 品牌字 | `>_ 終端機` | `{ JS }`／`{ JavaScript } × 執行期` |
| 模組色 | `--m0`…`--m8` | 新增 `--m9: #FFB8F0`（模組 9） |
| 儲存 key | `terminal-course.*` | `javascript-course.v1`、`javascript-course.prefs.v1` |
| 首頁示範 | 終端機打字動畫 | `runner`：`0.1 + 0.2 === 0.3` 先預測再執行 |
| 互動元件 | term、anatomy、fstree、pipeflow、pathfinder、rosetta | runner、floatbits、refviz、coerce、mutator、thisfinder、protochain、loopsim、racer、bubble、classify（見 outline A-5） |

## 2. 對比度（黑字 `#0A0A0A` 在色塊上）

沿用參考站已驗證的 token（最低一組：黑字 on `--danger` `#FF6B6B` 7.13）。新增：

| Token | 色值 | 黑字對比 | 要求 |
|---|---|---|---|
| `--m9` | `#FFB8F0` | 12.60 | ≥ 7 ✓ |
| `--run-err`（深色程式框上的錯誤字） | `#FF8F8F` on `#111111` | 8.61 | ≥ 4.5 ✓ |
| `--run-dim`（深色程式框上的次要字） | `#A3A3A3` on `#111111` | 7.49 | ≥ 4.5 ✓ |

（`--m9` 與 `#A3A3A3` 的數值與 ai-chat-prompt-agent-course 的 design-system 相同；`#FF8F8F` 為 2026-10-14 用 WCAG 公式計算。）

## 3. 元件語意色

| Token | 指向 | 用在 |
|---|---|---|
| `--k-prim` | `--m3` | refviz 的原始值變數 |
| `--k-obj` | `--m5` | refviz 的物件 |
| `--k-stack` | `--m2` | loopsim 呼叫堆疊 |
| `--k-micro` | `--m1` | loopsim 微任務 |
| `--k-task` | `--m4` | loopsim 任務 |

## 4. 動畫（規則 9、13）

- 只動 transform、opacity、顏色；racer 的時間軸用 `transform: translateX` 移動指針，長條本身不做位移動畫。
- 有動畫的元件：loopsim（逐步／自動播放）、racer（時間流逝）、bubble（事件逐層亮起）、refviz（逐行）。全部支援 reduced-motion：自動播放停用、只能逐步，或直接一次顯示。
- 其他元件都是靜態或「按了就更新」。

## 5. runner 的安全設計

- 程式在 `sandbox="allow-scripts"` 的 iframe（不同來源）裡以 `type="module"` 執行：嚴格模式、可頂層 await。
- 只透過 `postMessage` 傳回輸出，每次執行用新的 token 過濾訊息；換頁時移除監聽器。
- 主頁不用 `eval`、`new Function`。
