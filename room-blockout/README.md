# 房間 Blockout

用方塊快速擺出房間與家具配置的 3D 工具，可以切到第一人稱／第三人稱走進去看（Vite + TypeScript + three.js）。

## 快速開始

需要 Node.js 20.19 以上或 22.12 以上（Vite 8 的要求，`node -v` 確認）。在 `room-blockout/` 資料夾裡執行：

1. 安裝套件（第一次或 `package.json` 有變動時）：

   ```bash
   npm install
   ```

2. 啟動開發伺服器：

   ```bash
   npm run dev
   ```

3. 用瀏覽器打開終端機顯示的網址（預設 `http://localhost:5173/`）。

Windows（PowerShell）和 macOS（zsh）指令相同。直接雙擊 `index.html` 打不開，一定要透過開發伺服器或打包後的 `dist/`。

## 常用指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器，存檔後畫面自動更新 |
| `npm run build` | 先跑 `tsc` 型別檢查，再打包到 `dist/` |
| `npm run preview` | 在本機開啟打包好的 `dist/`，確認正式版能跑 |
| `npx tsc --noEmit` | 只跑型別檢查 |

## 專案結構

- `index.html`：頁面骨架（說明文字、浮動選單、尺寸面板）
- `src/main.ts`：全部程式（建模、擺放規則、視角模式、角色、編輯器、Inspector）
- `src/config/scene.config.json`：所有可調數值（房間、門窗、家具、角色、鏡頭）
- `src/config/scene.config.ts`：設定檔的型別、欄位說明與格式檢查
- `vite.config.ts`：含「儲存」用的 dev 外掛
- `src/style.css`：樣式
- `assets/raw/`：原始素材（例如動畫包 zip），只放本機、不進 git
- `assets/models/`：整理好、要給程式載入的模型
  - `ual1-standard.glb`：角色模型與 43 段動畫（Quaternius Universal Animation Library Standard，CC0，授權見 `ual1-standard-LICENSE.txt`）。用的是沒有根運動的版本
- `dist/`：`npm run build` 的輸出，不進 git

## 環境變數

目前沒有。

## 操作

| 模式 | 按鍵 |
|---|---|
| 環繞檢視（可編輯） | 點家具選取、拖曳移動、拖角落鈕旋轉、`S` 尺寸、`Esc` 完成、`Tab` 切到第一人稱 |
| 第一人稱／第三人稱 | `W`／`S` 前進後退、`A`／`D` 轉身、`Q`／`E` 平移、空白鍵跳、按住 `Shift` 跑、滾輪切第三人稱、`Tab` 回環繞檢視 |

## Inspector（參數面板）

右上角的面板仿 Unity Inspector，分成四組，改了立刻生效：

| 分組 | 內容 |
|---|---|
| 場景 | 房間尺寸、北窗／東窗／房門、門外地板、編輯吸附 |
| 家具 | 每件家具的位置、旋轉、尺寸；在畫面上點家具會自動展開它的分組 |
| 角色 | 縮放、碰撞半徑、走路／跑步／轉身速度、跳躍高度、重力；「動畫」裡有過渡秒數、動畫原速、落地硬直、顯示骨架、各動作用的動畫片段 |
| 鏡頭 | 第三人稱預設距離／俯仰／高度、第一人稱視角、靈敏度、縮放範圍、各種平滑時間 |

最上方兩個按鈕：

| 按鈕 | 做什麼 | 什麼時候有 |
|---|---|---|
| 儲存 | 把目前數值寫回 `src/config/scene.config.json`，舊檔先備份成 `scene.config.backup.json` | 只有 `npm run dev`；打包後沒有這顆按鈕 |
| 還原預設 | 放棄還沒儲存的修改，回到上次儲存的內容（還沒存過就是開頁面時的檔案） | 一直都有 |

- 在畫面上拖曳、旋轉、改尺寸的家具，按「儲存」也會一起寫回。
- 儲存不會重新載入頁面，第一人稱的位置不會跑掉。
- 也可以直接手改 JSON；格式錯了，頁面會在 console 列出是哪個欄位。欄位說明在 `scene.config.ts`。
- 走路和跑步用混合空間（blend space）：速度介於「走路動畫原速」和「跑步動畫原速」之間時，兩段按比例混合，並對齊步伐（左腳同時落地）。所以 3.5 m/s 的跑步跨步介於走和跑之間，腳不會滑。
- 平移（`Q`／`E`）沒有專用動畫，用方向扭轉（orientation warping）代替：骨盆和腿轉向移動方向、脊椎轉回來讓上半身朝前（上限「下半身轉向上限」，預設 60°），超過的部分才轉整個身體。轉向速度和兩個上限在「角色」裡調。
- 動畫片段的下拉選單要等模型載入後才出現。模型載入失敗時，角色退回方塊人，錯誤寫在 console。
