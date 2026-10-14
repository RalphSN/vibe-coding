# 驗證

五步都做完才回報。任何一步沒做，回報時寫「未驗證」與原因。

## 1. 連結與錯誤

- 每本書的 `href` 用 `fetch(href, { method: 'HEAD' })` 確認回 200。
- console 沒有錯誤；`<script>` 內容用 `node --check` 做語法檢查（先把最後一個 `<script>` 抽成 .js 檔）。

## 2. 版面：10 種寬度

360、390、430、768、820、1024、1280、1366、1440、1920px，每種跑一次 [scripts/layout-audit.js](../scripts/layout-audit.js) 的 `bookshelfAudit()`。在內建瀏覽器用 `resize_window` 切寬度、`javascript_tool` 執行。

全部要回 `OK`。檢查項目：水平捲軸、溢出、書名截斷、頂部列擠壓、書與書擋站在層板上、書超出書櫃、主題按鈕至少 44×32。

另外各看一次：淺色、深色、說明欄展開、`prefers-reduced-motion`（點書應直接跳轉）。

## 3. 動畫：停格截圖

```bash
node <skill 資料夾>/scripts/shoot.mjs index.html
```

它會產生測試副本（拿掉跳轉），用無頭 Chrome / Edge 拍 8 張：書櫃淺色、深色＋游標停留、交接、飛行、翻封面、翻扉頁、攤開（淺、深），最後印出交接量測。

逐張檢查：
- 交接：3D 書脊和抽出後的書背重疊，量測的兩組 rect 差 ≤ 2px。
- 飛行：看得到書脊厚度、封面燙金、桌面影子；書脊上的字是燙金色。
- 翻扉頁：扉頁從右頁上方翻起，右頁內容在底下。
- 攤開：左右兩頁紙一樣大、上下對齊，四周布邊同寬，書溝沒有露出蝴蝶頁花紋。

`animate()` 呼叫序號（改動畫後要重新數）：

| 序號 | 動畫 |
|---|---|
| 1 | 抽出 |
| 2–4 | 背景、3D 書轉身、桌面影子 |
| 5–8 | 書右移、影子、封面翻、扉頁翻 |
| 9 | 讀取條 |

停格截圖只看得到「位置與角度對不對」。動畫播放中才出現的問題（合成圖層前後順序跳動造成的閃動）停格拍不到，要用第 5 節在 Safari 實際播放。

## 4. 環境限制（照實寫進回報）

| 現象 | 原因 | 做法 |
|---|---|---|
| 截圖逾時、`innerWidth` 是 0 | Claude 桌面版的預覽面板被隱藏時不繪製 | 版面用 `resize_window` 模擬寬度後量測；截圖改用無頭瀏覽器 |
| 動畫一直停在 0ms，截圖都一樣 | 無頭模式與隱藏面板裡，Web Animations 時間軸不前進 | 用 anim-harness.js 停格 |
| 持續播放的 rAF 讓截圖停在第一格 | 無頭模式的虛擬時間被 rAF 佔住 | 入口頁不要放常駐動畫 |
| 390px 截圖右邊被切掉 | 無頭視窗有最小寬度 | 手機寬度用 iframe 包一層（`<iframe style="width:360px">`）再截，或用裝置模擬量測 |
| focus 事件沒觸發 | 視窗沒有焦點（`document.hasFocus()` 是 false） | 手動 `dispatchEvent(new FocusEvent('focusin', { bubbles: true }))` |
| Playwright WebKit 量起來正常，Safari 卻跑版 | Playwright 的 WebKit 不是 Safari，直排內容的寬度算法不同 | Safari 相關結論一律用第 5 節的實機檢查 |
| 無頭 WebKit 的 3D 截圖被壓平、背面也看得到 | Playwright 的 WebKit 截圖走軟體繪製，不做 3D 合成 | 3D 動畫在 Safari 實機看；無頭 Chrome 的 3D 截圖是正確的 |
| safaridriver 建立工作階段逾時 | Safari 還開著開啟遠端自動化之前的程序 | 請使用者完全結束 Safari 再試 |
| Safari 自動化視窗回報 `document.visibilityState` 是 hidden，動畫不前進 | 視窗被擋住或在別的桌面空間 | 不要用自動化錄播放中的畫面；請使用者自己用 `?rate=0.25` 慢速看 |

實際播放的流暢度與節奏，只能在正常顯示的瀏覽器親眼看；沒看過就寫「未驗證」，並請使用者點一本書確認。

## 5. Safari 實機

Chrome 正常不代表 Safari 正常。這個書櫃在 Safari 出過兩個 Chrome 沒有的問題：直排書名整個消失、翻頁時左頁閃動。兩項都要在 Safari 確認。

1. 請使用者先做（各一次）：Safari →「設定」→「進階」勾選「顯示網頁開發者功能」，再到「開發」選單勾選「允許遠端自動化」；終端機執行 `safaridriver --enable`（要輸入管理者密碼，由使用者自己輸入）。
2. 用 HTTP 伺服器開入口（safaridriver 不能開 `file://`），跑：
   ```bash
   node <skill 資料夾>/scripts/safari-check.mjs http://127.0.0.1:8770/index.html
   ```
   每種寬度都要 `OK`：書名標籤放得下直排書名、沒有水平捲軸。截圖逐張看過。
3. 翻頁閃動：請使用者用 Safari 打開第 3 步產生的 `harness.html?rate=0.25`（4 倍慢實際播放），看翻封面、翻扉頁時有沒有閃黑或忽明忽暗。放慢後閃的長度不變，代表閃在某個靜止的瞬間，不是轉動途中。改動有疑慮時做對照版（網址參數各關掉一個可能原因）讓使用者比較。
4. 測完請使用者取消勾選「允許遠端自動化」。

使用者沒有開啟自動化時，第 2 步改成請使用者用 Safari 開入口頁截圖給你；不能用 Playwright WebKit 的結果代替。

## 6. 手機流程與外部跳轉（3D 版）

```bash
# 一般環境
node <skill 資料夾>/scripts/mobile-flow.mjs index.html papaya
# 沙箱或離線（CDN、Google Fonts 連不到）：先在暫存資料夾 npm i three@<頁面用的版本>
BLOCK_FONTS=1 THREE_DIR=<暫存>/node_modules/three node <skill 資料夾>/scripts/mobile-flow.mjs index.html papaya
```

腳本模擬 iPhone 13，依序檢查並截圖：
1. 載入畫面消失（`is-loading` 被移除）。字型連不到時也要在數秒內結束。
2. 點書出現羊皮紙介紹，裡面有「前往閱讀」按鈕。
3. 點外部連結的書：外部網址回 204，頁面不離開，等同跳去外部 app。
4. 6 秒後介紹卡收起、書櫃回到初始狀態，0 個 JS 錯誤。

腳本測不到的，要請使用者用手機實際點一次：從外部 app 切回瀏覽器那一下（真正的 `visibilitychange`）、iOS Safari 的 bfcache 返回。
