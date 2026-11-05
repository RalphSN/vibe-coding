# OZ Space

一片空白的 3D 虛擬空間，只有人物（走、跑、跳、飛、推牆）和鏡頭，之後要在這裡做一個類似電影《夏日大作戰》OZ 那樣的原創虛擬世界（Vite + TypeScript + three.js）。人物、碰撞、鏡頭的程式從 `room-blockout/` 複製過來，房屋、家具、編輯器都拿掉了。

## 快速開始

需要 Node.js 20.19 以上或 22.12 以上（Vite 8 的要求，`node -v` 確認）。在 `oz-space/` 資料夾裡執行：

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

- `index.html`：頁面骨架（操作說明、第一人稱提示）
- `src/main.ts`：全部程式（空白地面、碰撞、視角模式、角色、Inspector）
- `src/config/scene.config.json`：所有可調數值（地面大小、出生點、角色、鏡頭）
- `src/config/scene.config.ts`：設定檔的型別、欄位說明與格式檢查
- `vite.config.ts`：含「儲存」用的 dev 外掛
- `src/style.css`：樣式
- `assets/raw/`：原始素材，只放本機、不進 git
- `assets/models/ual1-standard.glb`：角色模型與 43 段動畫（Quaternius Universal Animation Library Standard，CC0，授權見 `ual1-standard-LICENSE.txt`），用的是沒有根運動的版本
- `dist/`：`npm run build` 的輸出，不進 git

## 環境變數

目前沒有。

## 操作

開頁面時是第三人稱，站在出生點（`scene.spawn`）；`Tab` 切到環繞檢視，再按一次回到角色。

| 模式 | 按鍵 |
|---|---|
| 環繞檢視 | 拖曳環繞、滾輪縮放、右鍵平移、`Tab` 回到角色視角 |
| 第一人稱／第三人稱 | `W`／`S` 前進後退、`A`／`D` 轉身、`Q`／`E` 平移、空白鍵跳、連按兩下空白鍵飛行（空白鍵上升、`X` 下降，滑鼠雙鍵往前飛時順著鏡頭俯仰升降，碰到地面自動降落）、`Shift` 切換走路／跑步（預設跑步）、滾輪切第三人稱、`Tab` 回環繞檢視 |

## 空間

- 地面是以原點為中心的正方形，邊長是 `scene.groundSize`（預設 200 m），上面有 1 m 格線；四邊有隱形圍欄，走到邊緣會被擋住（也會播推牆動作）。
- 出生點是 `scene.spawn`（預設原點、面向北）。
- 之後要加平台、建築或物件時，放進 `world.room` 並把碰撞加進 `world.colliders`（站上去、撞頭）與 `world.solids`（水平移動），寫在 `rebuildScene()`。坡道用 `world.ramps`，目前是空的。

## 人物與碰撞（從 room-blockout 沿用）

- 水平移動用膠囊體＋collide-and-slide：腳印是圓形，碰撞體是可以旋轉的方塊；撞到牆時貼著牆面滑。
- 比腳高「自動跨上高度」以內直接走上去，更高要跳。
- 按著方向鍵被牆擋住時切成推牆動作；手部 IK（兩骨反向動力學）讓兩隻手各自貼在牆面上。
- 側移時起跳，空中身體轉回正面。
- 飛行模式：沒有重力，漂浮姿勢是兩腳併攏垂下、膝蓋微彎、腳尖下垂，雙手微張；水平飛行時身體往行進方向傾，往下降到腳碰到地面就解除飛行，播落地動作。
- 走路和跑步用混合空間（blend space）：速度介於兩段動畫原速之間時按比例混合並對齊步伐，腳不會滑。
- 平移（`Q`／`E`）用方向扭轉（orientation warping）代替專用動畫：骨盆和腿轉向移動方向、上半身朝前。
- 模型載入失敗時，角色退回方塊人，錯誤寫在 console。

## Inspector（參數面板）

右上角的面板仿 Unity Inspector，分成三組，改了立刻生效：

| 分組 | 內容 |
|---|---|
| 場景 | 地面邊長 |
| 角色 | 縮放、碰撞半徑、走路／跑步／轉身速度、跳躍高度、重力；「動畫」裡有過渡秒數、動畫原速、落地硬直、顯示骨架、各動作用的動畫片段 |
| 鏡頭 | 第三人稱預設距離／俯仰／高度、第一人稱視角、靈敏度、縮放範圍、各種平滑時間 |

| 按鈕 | 做什麼 | 什麼時候有 |
|---|---|---|
| 儲存 | 把目前數值寫回 `src/config/scene.config.json`，舊檔先備份成 `scene.config.backup.json` | 只有 `npm run dev` |
| 還原預設 | 放棄還沒儲存的修改，回到上次儲存的內容 | 一直都有 |

## 還沒做

- OZ 風格的原創視覺（天空、地面材質、漂浮的區域與建築）。
- 其他角色、多人、聊天等虛擬世界功能。
