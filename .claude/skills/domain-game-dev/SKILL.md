---
name: domain-game-dev
description: 遊戲開發規範（Unity C#、2D 平台遊戲、遊戲手感參數、網頁遊戲 Canvas / Phaser / Three.js、遊戲迴圈）。寫 .cs 腳本、Unity 場景與 Prefab、遊戲機制或網頁遊戲時使用。
---

<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# 遊戲開發

## Unity C#

- 要在 Inspector 調整的欄位用 `[SerializeField] private`，不用 `public` 欄位。
- 取自己身上的元件放在 `Awake`；取其他物件的參考放在 `Start`。（執行順序：`Awake` → `OnEnable` → `Start` → `FixedUpdate` → `Update` → `LateUpdate`）
- 一個 MonoBehaviour 只處理一種行為：移動、跳躍、受傷各自一個腳本。
- 物理相關（`Rigidbody2D` 的速度、力）放在 `FixedUpdate`；讀取輸入放在 `Update`。
- `Update` 裡不配置記憶體：不 `new` 物件、不用 LINQ、不拼接字串、不呼叫 `GetComponent`。
- `GetComponent` 的結果在 `Awake` 快取到欄位。
- 遊戲資料（角色數值、關卡設定、道具表）用 `ScriptableObject` 存。
- 會重複出現的物件做成 Prefab；大量生成與銷毀的物件用物件池。
- 不用 `GameObject.Find`；用序列化參考或事件。
- 不用字串比對 tag，改用 `CompareTag("Player")`。

## Unity 專案與 Git

- `.meta` 檔一定要跟著對應檔案一起 commit、一起移動、一起刪除。
- 用 Unity 官方 `.gitignore`（忽略 `Library/`、`Temp/`、`Obj/`、`Build/`、`Logs/`、`UserSettings/`）。
- 在 Unity 編輯器外移動或改名資產前先告訴使用者，否則參考會斷掉。
- 設定 Asset Serialization 為 Force Text，場景和 Prefab 才能 diff。

## 遊戲手感參數

平台遊戲的手感參數集中在一個 `ScriptableObject`（例如 `PlayerMovementConfig`），不散落在程式碼：
- 移動：最高速度、加速度、減速度、空中控制係數
- 跳躍：跳躍高度、到頂時間、放開按鍵提早落下的倍率
- coyote time：離開平台後仍可跳的時間（常見 0.1 秒）
- jump buffer：落地前按跳躍仍會觸發的時間（常見 0.1 秒）
- 重力：上升與下落用不同倍率，下落較快
- 最大落下速度

## 網頁遊戲

| 需求 | 選擇 |
|---|---|
| 簡單 2D、少量物件、想完全掌控 | Canvas 2D API |
| 2D 遊戲需要物理、場景、素材管理 | Phaser |
| 3D 或 2.5D | Three.js |

- 遊戲迴圈用 `requestAnimationFrame`，所有移動乘上 delta time。
- delta time 設上限（例如 0.1 秒），避免分頁切回來時角色瞬移。
- 物理用固定時間步長（fixed timestep）累加器，渲染與更新分開。

## 每次改動的回報

除了一般回報，還要寫「在編輯器裡怎麼測」：
1. 開哪個場景
2. 要調哪些 Inspector 欄位或掛哪個元件
3. 按 Play 後做什麼操作
4. 預期看到什麼
