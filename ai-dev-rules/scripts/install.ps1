<#
.SYNOPSIS
  把 dist/ 安裝到全域設定資料夾或指定專案。預設只列出會做什麼（DryRun），加 -Apply 才寫入。
.DESCRIPTION
  - 覆寫或合併前，舊檔會備份到 backups/<時間戳>/。
  - settings.json、hooks.json 用合併的方式寫入：保留你原本的設定，只加入或更新 ai-dev-rules 的項目。
  - Codex 的 config.toml 預設不動；加 -IncludeCodexPermissions 才會加入擋 .env 的 permissions profile。
  相容 Windows PowerShell 5.1 與 PowerShell 7。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/install.ps1
  （列出安裝到三個工具全域會做的事）
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Tool claude -Apply
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Scope project -Target D:\code\my-app -Domains web-frontend -Apply
#>
[CmdletBinding()]
param(
    [ValidateSet('claude', 'codex', 'antigravity', 'all')]
    [string]$Tool = 'all',

    [ValidateSet('global', 'project')]
    [string]$Scope = 'global',

    # -Scope project 時必填：專案根目錄
    [string]$Target,

    # -Scope project 時要安裝的領域規則；預設為有檔案類型對應的領域（web-frontend、game-dev）
    [string[]]$Domains,

    # 明確指定只預覽（預設行為）
    [switch]$DryRun,

    # 真的寫入
    [switch]$Apply,

    # 把 Codex permissions profile 加進 ~/.codex/config.toml
    [switch]$IncludeCodexPermissions,

    # 家目錄；測試時可指到暫存資料夾
    [string]$HomeDir = $HOME
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\common.ps1')

if ($DryRun -and $Apply) { throw '-DryRun 和 -Apply 不能同時使用。' }
$Root = Get-RepoRoot
$Dist = Join-Path $Root 'dist'
if (-not (Test-Path -LiteralPath (Join-Path $Dist 'README.md'))) { throw '找不到 dist/，先執行 scripts/build.ps1。' }
if ($Scope -eq 'project') {
    if (-not $Target) { throw '-Scope project 需要 -Target <專案路徑>。' }
    if (-not (Test-Path -LiteralPath $Target)) { throw "找不到專案資料夾：$Target" }
    $Target = (Resolve-Path -LiteralPath $Target).Path
}
if (-not $Domains -or $Domains.Count -eq 0) { $Domains = @('web-frontend', 'game-dev') }
$HomeDir = (Resolve-Path -LiteralPath $HomeDir).Path
$HomeSlash = $HomeDir.Replace('\', '/')
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $Root "backups\$Stamp"
$Tools = @('claude', 'codex', 'antigravity')
if ($Tool -ne 'all') { $Tools = @($Tool) }
$OurHookScripts = 'block-dangerous.ps1', 'format-on-edit.ps1'

$Actions = New-Object System.Collections.Generic.List[object]

function Add-Action([string]$Kind, [string]$Source, [string]$Dest, [string]$Label) {
    $Actions.Add([pscustomobject]@{ Kind = $Kind; Source = $Source; Dest = $Dest; Label = $Label; Status = ''; NewText = $null })
}

function Add-CopyTree([string]$SourceDir, [string]$DestDir, [string]$Label) {
    if (-not (Test-Path -LiteralPath $SourceDir)) { return }
    foreach ($f in Get-ChildItem -LiteralPath $SourceDir -Recurse -File) {
        $rel = $f.FullName.Substring($SourceDir.Length).TrimStart('\')
        Add-Action 'copy' $f.FullName (Join-Path $DestDir $rel) $Label
    }
}

# ---------- JSON 合併 ----------

function ConvertTo-Tree($Value) {
    # PSCustomObject 轉成 ordered hashtable，方便合併；陣列用 , 保留，避免被攤平
    if ($null -eq $Value) { return $null }
    if ($Value -is [string] -or $Value -is [bool] -or $Value -is [ValueType]) { return $Value }
    if ($Value -is [System.Collections.IDictionary]) {
        $h = [ordered]@{}
        foreach ($k in $Value.Keys) { $h[[string]$k] = ConvertTo-Tree $Value[$k] }
        return $h
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        $list = @(foreach ($i in $Value) { , (ConvertTo-Tree $i) })
        return , $list
    }
    $h = [ordered]@{}
    foreach ($p in $Value.PSObject.Properties) { $h[$p.Name] = ConvertTo-Tree $p.Value }
    return $h
}

function Read-JsonTree([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return [ordered]@{} }
    $t = Read-TextFile $Path
    if ([string]::IsNullOrWhiteSpace($t)) { return [ordered]@{} }
    try { return ConvertTo-Tree ($t | ConvertFrom-Json) } catch { throw "無法解析 JSON：$Path。請先修正這個檔案。" }
}

function Merge-UniqueList($Existing, $Incoming) {
    $out = New-Object System.Collections.ArrayList
    foreach ($x in @($Existing) + @($Incoming)) {
        if ($null -ne $x -and -not $out.Contains($x)) { [void]$out.Add($x) }
    }
    return , $out.ToArray()
}

function Test-OurHookGroup($Group) {
    $text = ConvertTo-PrettyJson $Group
    foreach ($s in $OurHookScripts) { if ($text -like "*$s*") { return $true } }
    return $false
}

function Merge-HookEvents($ExistingHooks, $IncomingHooks) {
    # 每個事件：移除舊的 ai-dev-rules 項目，再加上新的
    $result = [ordered]@{}
    if ($ExistingHooks) { foreach ($k in $ExistingHooks.Keys) { $result[$k] = $ExistingHooks[$k] } }
    foreach ($evt in $IncomingHooks.Keys) {
        $kept = @()
        if ($result.Contains($evt)) { $kept = @($result[$evt] | Where-Object { -not (Test-OurHookGroup $_) }) }
        $result[$evt] = @($kept) + @($IncomingHooks[$evt])
    }
    return $result
}

function Merge-Permissions($Existing, $Incoming) {
    $p = [ordered]@{}
    if ($Existing) { foreach ($k in $Existing.Keys) { $p[$k] = $Existing[$k] } }
    foreach ($k in $Incoming.Keys) { $p[$k] = Merge-UniqueList $p[$k] $Incoming[$k] }
    return $p
}

function Get-MergedJsonText([string]$Kind, [string]$Source, [string]$Dest) {
    $incomingText = (Read-TextFile $Source).Replace('{{HOME}}', $HomeSlash)
    $new = ConvertTo-Tree ($incomingText | ConvertFrom-Json)
    $old = Read-JsonTree $Dest
    switch ($Kind) {
        'merge-claude' {
            if (-not $old.Contains('$schema')) { $old.Insert(0, '$schema', $new['$schema']) }
            $old['permissions'] = Merge-Permissions $old['permissions'] $new['permissions']
            $old['hooks'] = Merge-HookEvents $old['hooks'] $new['hooks']
        }
        'merge-hooks' {
            if (-not $old.Contains('description')) { $old['description'] = $new['description'] }
            $old['hooks'] = Merge-HookEvents $old['hooks'] $new['hooks']
        }
        'merge-ag-hooks' {
            foreach ($k in $new.Keys) { $old[$k] = $new[$k] }
        }
        'merge-permissions' {
            $old['permissions'] = Merge-Permissions $old['permissions'] $new['permissions']
        }
    }
    return (ConvertTo-PrettyJson $old) + "`n"
}

# ---------- Codex config.toml ----------

function Get-CodexTomlText([string]$Source, [string]$Dest) {
    $snippet = (Read-TextFile $Source) -replace "`r`n", "`n"
    $tables = ($snippet -split "`n" | Where-Object { $_ -notmatch '^#' }) -join "`n"
    $old = ''
    if (Test-Path -LiteralPath $Dest) { $old = (Read-TextFile $Dest) -replace "`r`n", "`n" }
    # 移除先前安裝的區塊
    $old = [regex]::Replace($old, '(?s)# >>> ai-dev-rules.*?# <<< ai-dev-rules\n?\n?', '')
    if ($old -match '(?m)^\s*sandbox_mode\s*=' -or $old -match '(?m)^\s*\[sandbox_workspace_write\]') {
        throw "$Dest 已經設定 sandbox_mode 或 [sandbox_workspace_write]，和 permissions profile 互斥。請先移除那些設定，或不要加 -IncludeCodexPermissions。"
    }
    if ($old -match '(?m)^\s*default_permissions\s*=') {
        throw "$Dest 已經有 default_permissions。請手動合併 dist/codex/global/config.snippet.toml。"
    }
    $top = "# >>> ai-dev-rules（由 install.ps1 加入，請勿手改這個區塊）`ndefault_permissions = `"ai-dev-rules`"`n# <<< ai-dev-rules`n"
    $bottom = "`n# >>> ai-dev-rules（由 install.ps1 加入，請勿手改這個區塊）`n" + $tables.Trim() + "`n# <<< ai-dev-rules`n"
    # 連續空行收成一行，重複安裝時結果才會一樣
    $old = [regex]::Replace($old, "\n{3,}", "`n`n")
    # 頂層鍵必須在第一個 [table] 之前
    $m = [regex]::Match($old, '(?m)^\[')
    if ($m.Success) { $merged = $old.Substring(0, $m.Index) + $top + "`n" + $old.Substring($m.Index) }
    else { $merged = $old.TrimEnd("`n") + "`n" + $top }
    return $merged.TrimEnd("`n") + "`n" + $bottom
}

# ---------- 規劃 ----------

if ($Scope -eq 'global') {
    foreach ($t in $Tools) {
        switch ($t) {
            'claude' {
                $src = Join-Path $Dist 'claude-code\global'; $dst = Join-Path $HomeDir '.claude'
                Add-Action 'copy' (Join-Path $src 'CLAUDE.md') (Join-Path $dst 'CLAUDE.md') 'claude'
                foreach ($sub in 'rules', 'skills', 'agents', 'hooks') { Add-CopyTree (Join-Path $src $sub) (Join-Path $dst $sub) 'claude' }
                Add-Action 'merge-claude' (Join-Path $src 'settings.json') (Join-Path $dst 'settings.json') 'claude'
            }
            'codex' {
                $src = Join-Path $Dist 'codex\global'; $dst = Join-Path $HomeDir '.codex'
                Add-Action 'copy' (Join-Path $src 'AGENTS.md') (Join-Path $dst 'AGENTS.md') 'codex'
                foreach ($sub in 'skills', 'rules', 'agents', 'hooks') { Add-CopyTree (Join-Path $src $sub) (Join-Path $dst $sub) 'codex' }
                Add-Action 'merge-hooks' (Join-Path $src 'hooks.json') (Join-Path $dst 'hooks.json') 'codex'
                if ($IncludeCodexPermissions) { Add-Action 'codex-toml' (Join-Path $src 'config.snippet.toml') (Join-Path $dst 'config.toml') 'codex' }
            }
            'antigravity' {
                $src = Join-Path $Dist 'antigravity\global'; $dst = Join-Path $HomeDir '.gemini'
                Add-Action 'copy' (Join-Path $src 'GEMINI.md') (Join-Path $dst 'GEMINI.md') 'antigravity'
                foreach ($sub in 'config\skills', 'config\hooks') { Add-CopyTree (Join-Path $src $sub) (Join-Path $dst $sub) 'antigravity' }
                Add-Action 'merge-ag-hooks' (Join-Path $src 'config\hooks.json') (Join-Path $dst 'config\hooks.json') 'antigravity'
                Add-Action 'merge-permissions' (Join-Path $src 'antigravity-cli\settings.json') (Join-Path $dst 'antigravity-cli\settings.json') 'antigravity'
            }
        }
    }
} else {
    foreach ($t in $Tools) {
        switch ($t) {
            'claude' {
                $src = Join-Path $Dist 'claude-code\project'
                if (Test-Path -LiteralPath (Join-Path $Target 'AGENTS.md')) {
                    Add-Action 'copy' (Join-Path $src 'CLAUDE.md') (Join-Path $Target 'CLAUDE.md') 'claude'
                } else {
                    Write-Host '專案沒有 AGENTS.md，略過 CLAUDE.md（它只負責 @AGENTS.md）。' -ForegroundColor Yellow
                }
                Add-CopyTree (Join-Path $src '.claude\hooks') (Join-Path $Target '.claude\hooks') 'claude'
                foreach ($d in $Domains) { Add-Action 'copy' (Join-Path $src ".claude\rules\$d.md") (Join-Path $Target ".claude\rules\$d.md") 'claude' }
                Add-Action 'merge-claude' (Join-Path $src '.claude\settings.json') (Join-Path $Target '.claude\settings.json') 'claude'
            }
            'codex' {
                $src = Join-Path $Dist 'codex\project'
                Add-CopyTree (Join-Path $src '.codex\rules') (Join-Path $Target '.codex\rules') 'codex'
                Add-CopyTree (Join-Path $src '.codex\hooks') (Join-Path $Target '.codex\hooks') 'codex'
                Add-Action 'merge-hooks' (Join-Path $src '.codex\hooks.json') (Join-Path $Target '.codex\hooks.json') 'codex'
            }
            'antigravity' {
                $src = Join-Path $Dist 'antigravity\project'
                Add-CopyTree (Join-Path $src '.agents\hooks') (Join-Path $Target '.agents\hooks') 'antigravity'
                foreach ($d in $Domains) { Add-Action 'copy' (Join-Path $src ".agents\rules\$d.md") (Join-Path $Target ".agents\rules\$d.md") 'antigravity' }
                Add-Action 'merge-ag-hooks' (Join-Path $src '.agents\hooks.json') (Join-Path $Target '.agents\hooks.json') 'antigravity'
            }
        }
    }
}

# ---------- 計算每個動作的結果 ----------

foreach ($a in $Actions) {
    if (-not (Test-Path -LiteralPath $a.Source)) { throw "dist 裡找不到 $($a.Source)，先重跑 build.ps1。" }
    switch ($a.Kind) {
        'copy' { $a.NewText = Read-TextFile $a.Source }
        'codex-toml' { $a.NewText = Get-CodexTomlText $a.Source $a.Dest }
        default { $a.NewText = Get-MergedJsonText $a.Kind $a.Source $a.Dest }
    }
    if (-not (Test-Path -LiteralPath $a.Dest)) { $a.Status = '新增' }
    else {
        $old = (Read-TextFile $a.Dest) -replace "`r`n", "`n"
        $new = $a.NewText -replace "`r`n", "`n"
        if ($old -eq $new) { $a.Status = '不變' }
        elseif ($a.Kind -eq 'copy') { $a.Status = '覆寫（先備份）' }
        else { $a.Status = '合併（先備份）' }
    }
}

# ---------- 輸出 ----------

$baseDir = $HomeDir
if ($Scope -eq 'project') { $baseDir = $Target }
$mode = '預覽（沒有寫入任何檔案）'
if ($Apply) { $mode = '寫入' }
Write-Host "install：$Scope / $($Tools -join ', ') / $mode"
Write-Host "目標：$baseDir"
Write-Host ''

$changed = @($Actions | Where-Object { $_.Status -ne '不變' })
foreach ($group in ($Actions | Group-Object Status)) {
    Write-Host ("{0}：{1} 個檔案" -f $group.Name, $group.Count)
}
Write-Host ''
foreach ($a in $changed) {
    $shown = $a.Dest
    if ($shown.StartsWith($baseDir)) { $shown = '~' + $shown.Substring($baseDir.Length) }
    if ($Scope -eq 'project') { $shown = '.' + $shown.Substring(1) }
    Write-Host ("  [{0}] {1}" -f $a.Status, $shown)
}

if (-not $Apply) {
    Write-Host ''
    Write-Host '這是預覽。確認沒問題後，加上 -Apply 再執行一次才會寫入。' -ForegroundColor Yellow
    exit 0
}

foreach ($a in $changed) {
    if (Test-Path -LiteralPath $a.Dest) {
        $rel = $a.Dest.Substring($baseDir.Length).TrimStart('\')
        $backup = Join-Path (Join-Path $BackupRoot "$Scope-$($a.Label)") $rel
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
        Copy-Item -LiteralPath $a.Dest -Destination $backup -Force
    }
    Write-TextFile $a.Dest $a.NewText
}

Write-Host ''
Write-Host ("完成：寫入 {0} 個檔案。" -f $changed.Count) -ForegroundColor Green
if (Test-Path -LiteralPath $BackupRoot) { Write-Host "舊檔備份在：$BackupRoot" }
