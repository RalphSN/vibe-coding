# 研究筆記（查證日期：2026-10-16）

## 版本

| 項目 | 狀態 | 來源 |
|---|---|---|
| .NET 10 | LTS，最新修補 10.0.12（2026-09-08），支援到 2028-11-14 | dotnet.microsoft.com 支援政策頁 |
| .NET 9 | STS，支援到 2026-11-10 | 同上 |
| .NET 8 | LTS，支援到 2026-11-10 | 同上 |
| .NET 11 | RC1（2026-09-08，go-live），正式版預計 2026-11（.NET Conf 2026-11-10～13） | 同上、InfoQ 2026-09 |
| C# 14 | 搭配 .NET 10；extension 成員、`field`、`?.=`、`nameof(List<>)`、Span 隱含轉換、lambda 參數修飾詞、partial 建構子／事件、自訂複合指定 | learn.microsoft.com What's new in C# 14 |
| C# 15 | 搭配 .NET 11；RC1 穩定：集合運算式引數、union 型別、closed 階層、labeled break/continue、extension 索引子；unsafe 新模型仍是預覽 | InfoQ 2026-09、learn.microsoft.com What's new in C# 15 |
| 檔案型應用程式 | .NET 10 SDK 起 `dotnet run app.cs`、`dotnet app.cs`；`#:package`、`#:sdk`、`#:property`、`#:project`；`#:include` 需 .NET 11 Preview 3 或 SDK 10.0.300；`dotnet project convert` | learn.microsoft.com File-based apps（2026-09-10） |

教學主線：.NET 10 + C# 14。C# 15 只放「預告」，不教成正式語法。

## 程式輸出

這台 Mac 沒有安裝 dotnet，課程中 `csrun` 的輸出**未實測**，依 C# 語言規格與 .NET 文件推導：
- 整數除法捨去、`int.MaxValue + 1` 在 unchecked 下繞回 `int.MinValue`
- `Math.Round` 預設 `MidpointRounding.ToEven`（2.5 → 2、3.5 → 4）
- `(int)-3.9` → -3（往 0 截斷）
- `bool` 插值印出 `True`／`False`
- `0.1 + 0.2 == 0.3` 為 False；decimal 版為 True

⚠️ 截至 2026-10 查證狀態：輸出未在本機執行確認。之後有 .NET 10 SDK 的機器，建議逐一 `dotnet run` 驗證。
