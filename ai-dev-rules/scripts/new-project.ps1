<#
.SYNOPSIS
  把 templates/project-starters/ 的範本與三個工具的專案層級設定放進指定專案。
.DESCRIPTION
  1. 複製範本的 AGENTS.md（把 {{PROJECT_NAME}} 換成資料夾名稱）與 files/ 底下的檔案。
     專案裡已經有同名檔案時略過；加 -Force 會先備份再覆寫。
  2. 呼叫 install.ps1 -Scope project，裝上 CLAUDE.md、hooks、權限設定、範本指定的領域規則。
  相容 Windows PowerShell 5.1 與 PowerShell 7（Windows、macOS）。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/new-project.ps1 -Starter vue3-vite-ts -Target D:\code\my-app
  （Windows）
.EXAMPLE
  pwsh scripts/new-project.ps1 -Starter vue3-vite-ts -Target ~/code/my-app
  （macOS）
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/new-project.ps1 -List
#>
[CmdletBinding()]
param(
    [string]$Starter,
    [string]$Target,
    [ValidateSet('claude', 'codex', 'antigravity', 'all')]
    [string]$Tool = 'all',
    # 覆寫專案裡已存在的範本檔（會先備份）
    [switch]$Force,
    # 只預覽，不寫入
    [switch]$DryRun,
    # 列出可用範本
    [switch]$List
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/common.ps1')

$Root = Get-RepoRoot
$StarterRoot = Join-Path $Root 'templates/project-starters'
$available = @(Get-ChildItem $StarterRoot -Directory | ForEach-Object Name)

if ($List -or -not $Starter) {
    Write-Host '可用範本：'
    foreach ($name in $available) {
        $cfg = (Read-TextFile (Join-Path $StarterRoot "$name/starter.json")) | ConvertFrom-Json
        Write-Host ("  {0,-16} {1}（領域：{2}）" -f $name, $cfg.description, (@($cfg.domains) -join ', '))
    }
    if (-not $List) { Write-Host ''; Write-Host '用法：new-project.ps1 -Starter <範本> -Target <專案路徑>' }
    exit 0
}
if ($available -notcontains $Starter) { throw "沒有這個範本：$Starter。可用：$($available -join ', ')" }
if (-not $Target) { throw '需要 -Target <專案路徑>。' }

if (-not (Test-Path -LiteralPath $Target)) {
    if ($DryRun) { Write-Host "[預覽] 會建立資料夾：$Target" }
    else { New-Item -ItemType Directory -Force -Path $Target | Out-Null }
}
$TargetFull = $Target
if (Test-Path -LiteralPath $Target) { $TargetFull = (Resolve-Path -LiteralPath $Target).Path }
$ProjectName = Split-Path -Leaf $TargetFull
$starterDir = Join-Path $StarterRoot $Starter
$cfg = (Read-TextFile (Join-Path $starterDir 'starter.json')) | ConvertFrom-Json
$domains = @($cfg.domains)
$BackupRoot = Join-Path $Root ("backups/" + (Get-Date -Format 'yyyyMMdd-HHmmss') + "/new-project")

# ---------- 1. 範本檔案 ----------
$files = New-Object System.Collections.Generic.List[object]
$files.Add([pscustomobject]@{ Source = (Join-Path $starterDir 'AGENTS.md'); Rel = 'AGENTS.md' })
$extra = Join-Path $starterDir 'files'
if (Test-Path -LiteralPath $extra) {
    foreach ($f in Get-ChildItem -LiteralPath $extra -Recurse -File -Force) {
        $files.Add([pscustomobject]@{ Source = $f.FullName; Rel = Get-RelativePath $extra $f.FullName })
    }
}

Write-Host "範本：$Starter → $TargetFull"
foreach ($f in $files) {
    $dest = Join-Path $TargetFull $f.Rel
    $text = (Read-TextFile $f.Source).Replace('{{PROJECT_NAME}}', $ProjectName)
    $exists = Test-Path -LiteralPath $dest
    if ($exists -and ((Read-TextFile $dest) -replace "`r`n", "`n") -eq ($text -replace "`r`n", "`n")) {
        Write-Host "  [不變] $($f.Rel)"; continue
    }
    if ($exists -and -not $Force) {
        Write-Host "  [略過] $($f.Rel) 已存在（加 -Force 會先備份再覆寫）" -ForegroundColor Yellow; continue
    }
    $status = '新增'
    if ($exists) { $status = '覆寫（先備份）' }
    if ($DryRun) { Write-Host "  [預覽：$status] $($f.Rel)"; continue }
    if ($exists) {
        $backup = Join-Path $BackupRoot $f.Rel
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
        Copy-Item -LiteralPath $dest -Destination $backup -Force
    }
    Write-TextFile $dest $text
    Write-Host "  [$status] $($f.Rel)"
}
Write-Host ''

# ---------- 2. 三個工具的專案層級設定 ----------
if ($DryRun -and -not (Test-Path -LiteralPath $Target)) {
    Write-Host "[預覽] 資料夾建立後會執行：install.ps1 -Scope project -Target $Target -Tool $Tool -Domains $($domains -join ',') -Apply"
    exit 0
}
$installArgs = @{ Scope = 'project'; Target = $TargetFull; Tool = $Tool; Domains = $domains }
if (-not $DryRun) { $installArgs['Apply'] = $true }
& (Join-Path $PSScriptRoot 'install.ps1') @installArgs

Write-Host ''
Write-Host "下一步：打開 $(Join-Path $TargetFull 'AGENTS.md')，把（填入…）的地方換成這個專案的實際資訊。"
