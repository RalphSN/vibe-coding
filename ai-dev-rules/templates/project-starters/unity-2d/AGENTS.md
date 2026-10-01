# {{PROJECT_NAME}}

一句話說明：（填入遊戲類型與核心玩法）

## 技術棧

- Unity（填入版本，例如 6000.0 LTS）、C#
- 2D：Rigidbody2D、Tilemap、Cinemachine（有的話）
- 輸入：Input System（新版）

## 怎麼測試

- 沒有命令列建置流程；改動後由使用者在 Unity 編輯器按 Play 測試。
- 有 Unity Test Framework 時：Window → General → Test Runner 跑 EditMode / PlayMode 測試。
- 每次改動都要寫出「在編輯器裡怎麼測」的步驟（見 `unity-feature` skill）。

## 專案結構

- `Assets/Scripts/`：C# 腳本，依功能分資料夾（Player、Enemy、UI、Systems）
- `Assets/Config/`：ScriptableObject 設定檔（手感參數、關卡資料）
- `Assets/Prefabs/`、`Assets/Scenes/`、`Assets/Art/`、`Assets/Audio/`

## 專案慣例

- 欄位用 `[SerializeField] private`。
- 平台遊戲手感參數集中在 `Assets/Config/` 的 ScriptableObject。
- `.meta` 檔跟著資產一起 commit；要在編輯器外移動或改名資產時，先告訴使用者。
- 場景與 Prefab 用 Force Text 序列化。

## 適用的領域規範

- 遊戲開發：Claude Code 與 Antigravity 在讀到 `.cs` / `.unity` / `.prefab` 時自動載入；Codex 用 `$domain-game-dev`。
- 新增功能用 `unity-feature` skill。
