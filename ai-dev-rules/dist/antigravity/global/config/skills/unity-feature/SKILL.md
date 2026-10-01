---
name: unity-feature
description: 在 Unity 專案新增遊戲功能（C# 腳本、ScriptableObject 設定、Prefab 掛載說明）並附上在編輯器裡的測試步驟。使用者要做 Unity 機制（移動、跳躍、敵人、道具、UI、存檔）或改 .cs 腳本時使用。
---

<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# Unity 功能

## 步驟

1. 找專案結構：`Assets/` 下的腳本資料夾、命名空間、有沒有 Input System、有沒有 assembly definition。
2. 確認需求：功能行為、要調整的參數、和哪些現有腳本互動。
3. 設計：
   - 可調整的數值放進 `ScriptableObject`（例如 `JumpConfig`）。
   - 一個 MonoBehaviour 只處理一種行為：移動、跳躍、受傷各自一個腳本。
4. 寫腳本（骨架見下）。
5. 寫「編輯器測試步驟」；有 Unity Test Framework 就補 EditMode / PlayMode 測試。
6. 回報：新增或修改的檔案、Inspector 要設定的欄位、測試步驟。

## 骨架

```csharp
using UnityEngine;

[CreateAssetMenu(menuName = "Config/Jump")]
public class JumpConfig : ScriptableObject
{
    [Min(0f)] public float jumpHeight = 3f;
    [Min(0f)] public float coyoteTime = 0.1f;
    [Min(0f)] public float jumpBufferTime = 0.1f;
}

[RequireComponent(typeof(Rigidbody2D))]
public class PlayerJump : MonoBehaviour
{
    [SerializeField] private JumpConfig config;

    private Rigidbody2D body;
    private float coyoteTimer;
    private float bufferTimer;

    private void Awake()
    {
        body = GetComponent<Rigidbody2D>();
    }

    private void Update()
    {
        // 讀輸入放 Update，物理放 FixedUpdate
        bufferTimer -= Time.deltaTime;
        coyoteTimer -= Time.deltaTime;
    }

    private void FixedUpdate()
    {
        // 套用速度與力
    }
}
```

## 編輯器測試步驟範本

```
1. 開啟場景：Assets/Scenes/<Scene>.unity
2. 建立設定：Project 視窗右鍵 → Create → Config/Jump，命名 PlayerJumpConfig
3. 選取 Player → Add Component → PlayerJump，把 PlayerJumpConfig 拖到 Config 欄位
4. 按 Play，<操作>
5. 預期：<看到什麼>
6. 調整 Inspector 的 <欄位>，確認手感變化
```

## 檢查清單

- [ ] 欄位用 `[SerializeField] private`
- [ ] `Update` 裡沒有 `new`、LINQ、`GetComponent`、字串拼接
- [ ] 物理在 `FixedUpdate`
- [ ] 手感參數集中在 ScriptableObject
- [ ] 新檔案的 `.meta` 由 Unity 產生，提醒使用者一起 commit
