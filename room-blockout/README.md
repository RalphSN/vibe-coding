# 房間 Blockout

用方塊快速擺出整間房屋（目前是參照美式豪宅平面圖 66388WE 的方正版：兩層樓、約 49 × 37 m，功能與大小大致照原圖，牆一律東西向或南北向，一、二樓的走廊、樓梯塔、電梯上下對齊）與家具配置的 3D 方塊稿，可以切到第一人稱／第三人稱走進去看（Vite + TypeScript + three.js）。

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

## 房屋與實體

- 房屋寫在 `scene.config.json` 的 `scene.house.levels`，每層有：
  - `elevation`（地板面高度）、`wallHeight`（牆高）
  - `floors`：地板多邊形，`kind` 是 `room` 室內、`deck` 露台／陽台、`garage` 車庫
  - `walls`：牆的中心線，任意角度，`openings` 是門、拉門、窗（`offset` 從牆起點量到開口中心）
  - `railings`：欄杆；`steps`：台階與樓梯（高度從這層地板算，`isVisualOnly` 的只有外觀）
  - `ramps`：看不見的碰撞斜面，樓梯走起來連續爬升、不會一階一階彈
  - `voids`：樓板挖空的地方（樓梯塔）
  - 地板的 `ceiling`：要不要加天花板（沒寫時室內和車庫有、露台沒有）
- 格局以 1 m 為格：一條東西向的主走廊（2.2 m）串起所有房間；原圖的八角形、圓形房間改成長方形（主浴是 L 型），斜向的廚房側翼與車庫改成正向。
- 每層會自動鋪一塊「結構樓板」：外觀是每塊地板往外推 0.25 m 的平滑多邊形（斜邊還是直線），補起量測造成的縫；碰撞用看不見的條狀方塊。往挖空區（樓梯塔）的邊不往外推。二樓以上的結構樓板是實心的（可以站、會擋頭），二樓的牆也往下延伸一個樓板厚，接上一樓的牆頂。
- 一樓的牆只到二樓樓板底（3.75 m），牆頂才不會和二樓地板重疊閃爍。
- 樓梯塔是 U 型梯（每階 0.2 m），碰撞用兩段斜面，可以直接走上二樓。
- 房間與有頂露台都有天花板（實心），頂面比牆頂低 6 cm，從上面看牆頂才不會和天花板互相閃爍。環繞檢視編輯某層時，那層的天花板會藏起來；第一人稱時全部顯示。
- 所有方塊都有實體：家具拆成組成它的方塊各自碰撞；斜牆、斜放的家具在碰撞時切成 0.25 m 的小段，不會擋到旁邊的空地；比腳高「自動跨上高度」以內直接走上去，更高要跳。
- 編輯器一次編輯一層（Inspector 最上面的「編輯樓層」）：上面的樓層會藏起來，只點得到這層的家具。第一人稱時全部顯示。
- 黃色活動空間只在環繞編輯、有選取家具時出現（選取中那件，加上被它擋住的家具），全部提醒列在配置檢查的文字裡。
- 家具約 120 件，依每個空間的用途與上面的準則擺放；有頂露台只留一組休息座位，烤肉露台放長桌與烤爐。
- 走廊與門比原圖加寬：一樓主走廊與二樓走廊約 2.2 m、門至少 1.0 m，第三人稱鏡頭才不會太擠。
- 還沒做：屋頂、電梯（只有井）、車庫上方儲藏室其實比二樓低（目前和二樓同高）、泳池與庭院。

## 室內設計準則（配置與家具參考）

格局以套房為主（每間臥室都有自己的衛浴），一樓門廳旁另有客用衛浴。尺寸參考以下準則（多數是設計網站或廠商整理，NKBA 數字為二手轉述，正式設計請以當地法規為準）：

| 項目 | 準則 | 本專案 |
|---|---|---|
| 餐桌 | 每人約 60 cm；桌邊到牆至少 75–90 cm，背後要走人 105–120 cm | 十人桌 3.0 × 1.2 m，餐廳 6 × 7 m |
| 衛浴 | 馬桶、洗手台、淋浴間前方約 76 cm 淨空；淋浴間至少 76 × 76 cm，建議 91 × 91 cm | 淋浴間 0.9–1.0 m 見方，設備前方保留淨空 |
| 臥室 | 床兩側與床尾 76–91 cm | 床頭靠牆，兩側與床尾至少 0.9 m |
| 走廊 | 法規最低 91.5 cm，建議 107 cm 以上 | 主走廊 2.2 m |
| 客用化妝室 | 靠近入口或走廊、保有隱私 | 門廳旁，從主走廊進出 |
| 烤肉區 | 餐桌四周 0.9–1.2 m，主要動線 1.2 m 以上；烤爐放在活動區邊緣，離建築約 3 m | 烤肉露台東北角放烤爐，長桌離烤爐 2 m 以上 |

出處：[Arcedior 餐椅後方淨空](https://arcedior.com/blog/chair-clearance-behind-dining-tables)、[Room & Board 餐廳尺寸](https://www.roomandboard.com/ideas-advice/design-your-space/dining-kitchen/how-to-measure-your-dining-space)、[Hunker：NKBA 衛浴準則](https://www.hunker.com/13725105/what-are-the-nkba-guidelines-for-bathrooms/)、[Bob Vila 衛浴尺寸](https://bobvila.com/articles/15445-the-basics-of-bathroom-design)、[dimensions.com 雙人床配置](https://www.dimensions.com/element/queen-bedroom-layouts)、[learnarchitecture.net 走廊寬度](https://learnarchitecture.net/?p=35632)、[Homestyler 化妝室設計](https://www.homestyler.com/article/essential-powder-room-design-tips)、[Liveouter 戶外用餐配置](https://liveouter.com/blogs/outdoor-living-tips/outdoor-kitchen-dining-layout-guide)、[Nexgrill 烤爐與建築距離](https://knowledgehub.nexgrill.com/safe-grilling-distance-from-structures)（查證日期 2026-10-30）。

## Inspector（參數面板）

右上角的面板仿 Unity Inspector，分成四組，改了立刻生效：

| 分組 | 內容 |
|---|---|
| 場景 | 牆厚、樓板厚、草地範圍、每層的地板高度與牆高、每個門窗的位置與尺寸、編輯吸附 |
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
