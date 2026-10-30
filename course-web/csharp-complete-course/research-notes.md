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

## 第 2 段補充（2026-10-16）

| 項目 | 狀態 | 來源 |
|---|---|---|
| C# 15 union | `public union Pet(Cat, Dog, Bird);`，switch 需窮舉；部分規格尚未實作 | learn.microsoft.com What's new in C# 15（2026-09-11） |
| C# 15 closed | `public closed record class GateState;`，隱含 abstract，同組件內才能直接繼承 | 同上 |
| C# 15 集合運算式引數 | `[with(capacity: 10), ..values]` | 同上 |
| CountBy、AggregateBy | .NET 9 新增 | Microsoft Learn Grouping data |
| `ToDictionary()` 無參數（KeyValuePair 序列） | .NET 8 新增 | 未逐頁查證，依 .NET 8 API 變更記憶 ⚠️ |

## 第 3 段補充（2026-10-16）

| 項目 | 狀態 | 來源 |
|---|---|---|
| `dotnet new sln` | .NET 10 起預設產生 .slnx；`--format sln` 可產生舊格式；`dotnet sln migrate` 轉換 | Microsoft Learn .NET 10 破壞性變更頁 |
| xUnit v3 範本 | `dotnet new install xunit.v3.templates` 後 `dotnet new xunit3`；NuGet 穩定版 3.2.2 | nuget.org、xunit.net |
| Minimal API 驗證 | .NET 10 `builder.Services.AddValidation()`，DataAnnotations，失敗回 400 ProblemDetails；record 參數要 `[property: …]` | Microsoft Learn Validation、第三方部落格 |
| `ArgumentException.ThrowIfNullOrWhiteSpace`、`ArgumentOutOfRangeException.ThrowIfNegative／ThrowIfGreaterThan` | .NET 8 起 | 依 API 記憶，未逐頁查證 ⚠️ |
| EF Core 與 Native AOT | 支援仍有限制 | 未逐頁查證 ⚠️ |

9-2、9-3、9-4 的 csrun 輸出是「測試結果／HTTP 回應／產生的 SQL」示意，不是 Console 輸出；9-4 的 SQL 已標示為示意。

## 2026-10-29 改版審查

不出測驗改版：39 課都補了「深入：」段落，保留 28 題深入思考題（刪 11 題看課文就能答的），本書沒有「總複習」課，改在 9-4 加「深入：全書一頁地圖」（各模組最重要的行動、會過時的內容與查證處）。0-1、0-3、9-1 補上 `csrun` 範例；`csrun` 與首頁範例拿掉預測。

### 修正的錯誤

| 課 | 原本 | 修正後 | 出處 |
|---|---|---|---|
| 0-1 | .NET 11「目前是 RC」 | 2026-10-13 發布 RC2（可上線授權），正式版預計 2026-11-10 起的 .NET Conf | devblogs.microsoft.com/dotnet/dotnet-11-rc-2/（2026-10-29 查）✅ |
| 4-4 | 程式碼標題「.NET 11 RC1」 | 「.NET 11 RC2」 | 同上 ✅ |
| 3-1 | 建構子加 void「變成普通方法，new 時不會執行」 | 一般方法不能和類別同名，編譯錯誤 CS0542 | C# 語言規格（成員名稱不能與所在型別同名）🟡 依規格記憶 |
| 3-4 | 介面「不能有欄位」 | 不能有實例欄位，可以有靜態欄位（C# 8 起） | learn.microsoft.com Interfaces 🟡 |
| 2-2 | 深入思考題寫「承上題」，指向已刪除的題目 | 改成自成一題 | — |
| 9-2 | 深入思考題寫「9-1 把 OrderService 設計成依賴 INotifier」 | 改成 3-4 | — |
| 8-3 | 輸出區塊混入說明文字「（計時有誤差…）」 | 移到範例標題 | — |

### 新查證的項目

| 事實 | 來源 | 可信度 |
|---|---|---|
| .NET 11 RC2 2026-10-13 發布，附 go-live 授權；正式版在 .NET Conf 2026（11-10 起） | .NET Blog、InfoQ、Visual Studio Magazine（2026-10） | ✅ |
| 同日發布 .NET 10.0.13 等修補 | 僅第三方來源（NinjaOne KB5130036、warp2search） | ⚠️ 版號未在官方頁確認，9-4 地圖已標「僅第三方來源」 |
| `dotnet reference add`、`dotnet package add` 等名詞在前指令是 .NET 10 SDK 新增 | learn.microsoft.com dotnet-reference-add | ✅ |
| C# 15 union、closed 截至 2026-10 What's new 頁仍標預覽；closed 不會傳遞給未標 closed 的子類別 | learn.microsoft.com What's new in C# 15、ABP 社群文章 | 🟡 RC2 階段的狀態沒有官方逐條確認 |

### 深入段落補的子題（依記憶撰寫、未逐頁查證的標 ⚠️）

- 0-1 分層編譯、動態 PGO（.NET 8 預設）、ReadyToRun 與 Native AOT 比較
- 0-2 `#:` 指令表、shebang 執行、`#:include` 的版本限制
- 0-3 TreatWarningsAsErrors、.pdb 與內聯、堆疊追蹤裡的編譯器產生名稱
- 1-4 `.NET 9 起 x86/x64 浮點數轉整數改為飽和` ⚠️、Convert.ToInt32 用銀行家捨入、Parse 受文化影響
- 1-5 CS8524（enum 窮舉仍需 `_`）、C# 15 labeled break（來源：上一輪筆記）
- 2-4 Memory<T>、stackalloc、ArrayPool、`MemoryExtensions.Split`（.NET 9）
- 3-1 建構順序、主要建構子 CS9124
- 4-1 具體化泛型、共變反變、`allows ref struct`（C# 13）
- 5-1 FrozenDictionary（.NET 8）、PriorityQueue（.NET 6）
- 5-2 LINQ 向量化、Index()（.NET 9）、Chunk／DistinctBy／MaxBy（.NET 6）
- 6-1 lambda 自然型別（C# 10）、預設參數（C# 12）、參數修飾詞（C# 14）
- 7-1 .NET 9 新例外處理實作較快 ⚠️（只寫「明顯變快」，未寫倍數）
- 8-2 `Task.WhenEach`（.NET 9）
- 8-4 `System.Linq.AsyncEnumerable` 內建於 .NET 10 ⚠️ 依 .NET 10 預覽公告記憶，未逐頁查證
- 9-1 Directory.Build.props、中央套件管理、global.json、NuGetAudit（.NET 8 SDK）
- 9-2 xUnit v3 可直接 `dotnet run`、不支援 async void 測試 ⚠️
- 9-3 captive dependency、Minimal API 與 Native AOT、.NET 9 `AddOpenApi`
- 9-4 AsNoTracking、ExecuteUpdate／ExecuteDelete（EF Core 7）、idempotent migration 腳本

### 未查證

- 0-1、0-3、9-1 新增 `csrun` 的輸出（本機沒有 .NET SDK，依文件與規格推導，0-1 的修補版號只是示例）。
- 9-3 驗證功能在 record 參數上是否仍需要 `[property: …]`（沿用上一輪筆記，未重查）。
