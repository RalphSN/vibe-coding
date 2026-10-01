<#
.SYNOPSIS
  檢查來源與 dist/：長度上限、frontmatter、引用路徑、殘留待辦標記、JSON 格式、hook 行為。
.DESCRIPTION
  失敗時列出「檔案：原因」並以 exit code 1 結束；只有警告時 exit code 0。
  相容 Windows PowerShell 5.1 與 PowerShell 7。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/verify.ps1
#>
[CmdletBinding()]
param(
    # 略過 hook 行為測試（每個案例要啟動一次 powershell，約 10–20 秒）
    [switch]$SkipHookTests
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\common.ps1')

$Root = Get-RepoRoot
$Dist = Join-Path $Root 'dist'
$HeaderText = '由 scripts/build.ps1 產生'
$Failures = New-Object System.Collections.Generic.List[string]
$Warnings = New-Object System.Collections.Generic.List[string]

function Rel([string]$Path) { return $Path.Substring($Root.Length + 1).Replace('\', '/') }
function Fail([string]$Path, [string]$Reason) { $Failures.Add("$(Rel $Path)：$Reason") }
function Warn([string]$Path, [string]$Reason) { $Warnings.Add("$(Rel $Path)：$Reason") }
function Get-Lines([string]$Text) { return @(($Text.TrimEnd("`n") -split "`n")).Count }
function Get-Bytes([string]$Text) { return [System.Text.Encoding]::UTF8.GetByteCount($Text) }

if (-not (Test-Path -LiteralPath $Dist)) {
    Write-Host '找不到 dist/，先執行 scripts/build.ps1。' -ForegroundColor Red
    exit 1
}

# ---------- 1. dist 是否比來源新 ----------
$distStamp = (Get-Item (Join-Path $Dist 'README.md')).LastWriteTimeUtc
$sourceDirs = 'core', 'skills', 'workflows', 'agents', 'enforcement'
foreach ($sd in $sourceDirs) {
    foreach ($f in Get-ChildItem (Join-Path $Root $sd) -Recurse -File) {
        if ($f.LastWriteTimeUtc -gt $distStamp) { Fail $f.FullName '比 dist/ 新，請重跑 scripts/build.ps1' }
    }
}

# ---------- 2. 產生註解 ----------
foreach ($f in Get-ChildItem $Dist -Recurse -File) {
    if ($f.Extension -eq '.json') { continue }
    $head = (Read-TextFile $f.FullName)
    if ($head.Length -gt 1500) { $head = $head.Substring(0, 1500) }
    if ($head -notlike "*$HeaderText*") { Fail $f.FullName '開頭缺少「由 build.ps1 產生」註解' }
}

# ---------- 3. Claude Code ----------
foreach ($f in Get-ChildItem (Join-Path $Dist 'claude-code') -Recurse -File -Include 'CLAUDE.md') {
    $n = Get-Lines (Read-TextFile $f.FullName)
    if ($n -gt 200) { Fail $f.FullName "CLAUDE.md 有 $n 行，超過 200 行建議上限" }
}
foreach ($f in Get-ChildItem (Join-Path $Dist 'claude-code') -Recurse -File -Filter '*.md' | Where-Object { $_.FullName -match '\\rules\\' }) {
    $t = Read-TextFile $f.FullName
    $n = Get-Lines $t
    if ($n -gt 200) { Fail $f.FullName "規則檔有 $n 行，超過 200 行" }
    $fm = ConvertFrom-Frontmatter $t
    foreach ($k in $fm.Meta.Keys) { if ($k -ne 'paths') { Fail $f.FullName "rules 只支援 paths，出現 $k" } }
}
foreach ($f in Get-ChildItem (Join-Path $Dist 'claude-code') -Recurse -File -Filter '*.md' | Where-Object { $_.FullName -match '\\agents\\' }) {
    $fm = ConvertFrom-Frontmatter (Read-TextFile $f.FullName)
    if (-not $fm.Meta.name -or -not $fm.Meta.description) { Fail $f.FullName 'subagent 缺少 name 或 description' }
}
$claudeTotal = 0
foreach ($f in @(Get-Item (Join-Path $Dist 'claude-code\global\CLAUDE.md')) + @(Get-ChildItem (Join-Path $Dist 'claude-code\global\rules') -File)) {
    $claudeTotal += Get-Lines (Read-TextFile $f.FullName)
}
if ($claudeTotal -gt 400) { Warn (Join-Path $Dist 'claude-code\global') "CLAUDE.md + rules 合計 $claudeTotal 行，每次都會載入，考慮精簡" }

# ---------- 4. Codex ----------
$codexGlobal = Join-Path $Dist 'codex\global\AGENTS.md'
$codexBytes = Get-Bytes (Read-TextFile $codexGlobal)
if ($codexBytes -gt 32768) { Fail $codexGlobal "$codexBytes bytes，超過 Codex project_doc_max_bytes 預設 32 KiB" }
foreach ($f in Get-ChildItem (Join-Path $Root 'templates\project-starters') -Recurse -File -Filter 'AGENTS.md') {
    $b = Get-Bytes (Read-TextFile $f.FullName)
    if ($b + $codexBytes -gt 32768) { Warn $f.FullName "加上全域 AGENTS.md 共 $($b + $codexBytes) bytes，可能超過 Codex 32 KiB 上限" }
}
foreach ($f in Get-ChildItem $Dist -Recurse -File -Filter '*.rules') {
    $t = Read-TextFile $f.FullName
    if (([regex]::Matches($t, '\(')).Count -ne ([regex]::Matches($t, '\)')).Count) { Fail $f.FullName '括號數量不對稱' }
    foreach ($m in [regex]::Matches($t, 'decision\s*=\s*"([^"]+)"')) {
        if (@('allow', 'prompt', 'forbidden') -notcontains $m.Groups[1].Value) { Fail $f.FullName "decision 只能是 allow / prompt / forbidden：$($m.Groups[1].Value)" }
    }
}

# ---------- 5. Antigravity ----------
$gem = Join-Path $Dist 'antigravity\global\GEMINI.md'
$gemText = Read-TextFile $gem
$gemBytes = Get-Bytes $gemText
if ($gemBytes -gt 24000) { Fail $gem "$gemBytes bytes，超過 Antigravity 每檔 24,000 bytes" }
$tokens = Get-FileTokenEstimate $gemText
if ($tokens -gt 20000) { Fail $gem "估算 $tokens tokens，超過 Antigravity 全域與 always_on 規則合計 20,000 tokens" }
foreach ($f in Get-ChildItem (Join-Path $Dist 'antigravity') -Recurse -File -Filter '*.md' | Where-Object { $_.FullName -match '\\\.agents\\rules\\' }) {
    $t = Read-TextFile $f.FullName
    if ((Get-Bytes $t) -gt 24000) { Fail $f.FullName '超過 24,000 bytes' }
    $fm = ConvertFrom-Frontmatter $t
    $trigger = $fm.Meta.trigger
    if (@('always_on', 'model_decision', 'glob', 'manual') -notcontains $trigger) { Fail $f.FullName "trigger 不合法：$trigger" }
    if ($trigger -eq 'glob' -and -not $fm.Meta.globs) { Fail $f.FullName 'trigger: glob 但沒有 globs' }
    if ($trigger -eq 'model_decision' -and -not $fm.Meta.description) { Fail $f.FullName 'trigger: model_decision 但沒有 description' }
}

# ---------- 6. Skills（來源與 dist）----------
$skillFiles = @(Get-ChildItem (Join-Path $Root 'skills') -Recurse -File -Filter 'SKILL.md') + @(Get-ChildItem $Dist -Recurse -File -Filter 'SKILL.md')
foreach ($f in $skillFiles) {
    $t = Read-TextFile $f.FullName
    $fm = ConvertFrom-Frontmatter $t
    if (-not $fm.HasFrontmatter) { Fail $f.FullName '缺少 YAML frontmatter'; continue }
    $name = [string]$fm.Meta.name
    $desc = [string]$fm.Meta.description
    $dirName = Split-Path -Leaf $f.DirectoryName
    if ($name -ne $dirName) { Fail $f.FullName "name「$name」和資料夾名稱「$dirName」不同" }
    if ($name -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$' -or $name.Length -gt 64) { Fail $f.FullName "name 不符合 Agent Skills 規格（小寫英數與單一連字號、最多 64 字元）：$name" }
    if ($desc.Length -lt 1 -or $desc.Length -gt 1024) { Fail $f.FullName "description 長度 $($desc.Length)，規格為 1–1024 字元" }
    $n = Get-Lines $t
    if ($n -ge 500) { Fail $f.FullName "SKILL.md 有 $n 行，規格建議 500 行內" }
    if ($f.FullName -like "$Dist*" -and $f.FullName -notlike '*\claude-code\*') {
        foreach ($k in 'disable-model-invocation', 'argument-hint') { if ($fm.Meta.Contains($k)) { Fail $f.FullName "非 Claude Code 版本不該有 $k" } }
    }
}

# ---------- 7. Domain 來源 ----------
foreach ($f in Get-ChildItem (Join-Path $Root 'core\domains') -File -Filter '*.md') {
    $fm = ConvertFrom-Frontmatter (Read-TextFile $f.FullName)
    foreach ($k in 'id', 'title', 'description') { if (-not $fm.Meta.Contains($k)) { Fail $f.FullName "frontmatter 缺少 $k" } }
    if ($fm.Meta.id -ne $f.BaseName) { Fail $f.FullName 'id 和檔名不同' }
}

# ---------- 8. @ 引用與 Markdown 連結 ----------
$mdFiles = @(Get-ChildItem $Root -Recurse -File -Filter '*.md' | Where-Object { $_.FullName -notmatch '\\(backups|node_modules|\.git)\\' })
foreach ($f in $mdFiles) {
    $t = Read-TextFile $f.FullName
    # 去掉 code block 與 code span 再檢查
    $plain = [regex]::Replace($t, '(?s)```.*?```', '')
    $plain = [regex]::Replace($plain, '`[^`\n]*`', '')
    if ($f.Name -eq 'CLAUDE.md') {
        foreach ($m in [regex]::Matches($plain, '(?m)(^|\s)@([\w~./\\-]+)')) {
            $target = $m.Groups[2].Value
            if ($target -eq 'AGENTS.md' -and $f.FullName -like '*\claude-code\project\*') {
                foreach ($s in Get-ChildItem (Join-Path $Root 'templates\project-starters') -Directory) {
                    if (-not (Test-Path (Join-Path $s.FullName 'AGENTS.md'))) { Fail $s.FullName '專案 CLAUDE.md 引用 @AGENTS.md，但這個範本沒有 AGENTS.md' }
                }
                continue
            }
            if (-not (Test-Path (Join-Path $f.DirectoryName $target))) { Fail $f.FullName "@ 引用的檔案不存在：$target" }
        }
    }
    foreach ($m in [regex]::Matches($plain, '\]\(([^)\s]+)\)')) {
        $link = $m.Groups[1].Value
        if ($link -match '^(https?:|mailto:|#)') { continue }
        $link = ($link -split '#')[0]
        if (-not $link) { continue }
        if (-not (Test-Path (Join-Path $f.DirectoryName $link))) { Fail $f.FullName "連結指向不存在的檔案：$link" }
    }
}

# ---------- 9. 殘留待辦標記 ----------
$todoPattern = '\b(TO' + 'DO|FIX' + 'ME|TB' + 'D|XX' + 'X)\b'
$scanDirs = 'core', 'skills', 'workflows', 'agents', 'templates', 'docs', 'dist', 'enforcement'
foreach ($sd in $scanDirs) {
    $p = Join-Path $Root $sd
    if (-not (Test-Path $p)) { continue }
    foreach ($f in Get-ChildItem $p -Recurse -File) {
        $lines = (Read-TextFile $f.FullName) -split "`n"
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -cmatch $todoPattern) { Fail $f.FullName "第 $($i + 1) 行有殘留的待辦標記" }
        }
    }
}
foreach ($f in 'README.md', 'CHANGELOG.md') {
    $p = Join-Path $Root $f
    if (Test-Path $p) {
        if ((Read-TextFile $p) -cmatch $todoPattern) { Fail $p '有殘留的待辦標記' }
    } else { Fail $p '檔案不存在' }
}

# ---------- 10. JSON 格式 ----------
foreach ($f in Get-ChildItem $Root -Recurse -File -Filter '*.json' | Where-Object { $_.FullName -notmatch '\\(backups|node_modules|\.git)\\' }) {
    try { $null = (Read-TextFile $f.FullName) | ConvertFrom-Json } catch { Fail $f.FullName "JSON 格式錯誤：$($_.Exception.Message)" }
}
foreach ($s in Get-ChildItem (Join-Path $Root 'templates\project-starters') -Directory) {
    $sj = Join-Path $s.FullName 'starter.json'
    if (-not (Test-Path $sj)) { Fail $s.FullName '缺少 starter.json'; continue }
    $cfg = (Read-TextFile $sj) | ConvertFrom-Json
    foreach ($d in @($cfg.domains)) {
        if (-not (Test-Path (Join-Path $Root "core\domains\$d.md"))) { Fail $sj "domains 裡的 $d 在 core/domains/ 不存在" }
    }
}

# ---------- 11. dist 三個版本內容一致 ----------
function Get-RulesPart([string]$Text) {
    # 去掉開頭說明（各工具檔名不同），只比對規範本文
    $i = $Text.IndexOf("`n## ")
    if ($i -lt 0) { return $Text }
    return $Text.Substring($i)
}
$codexText = Read-TextFile $codexGlobal
if ((Get-RulesPart $codexText) -ne (Get-RulesPart $gemText)) { Fail $gem '規範本文和 codex/global/AGENTS.md 不同，兩者應由同一份 core 產生' }
$claudeParts = @(Get-RulesPart (Read-TextFile (Join-Path $Dist 'claude-code\global\CLAUDE.md')))
foreach ($f in Get-ChildItem (Join-Path $Dist 'claude-code\global\rules') -File | Sort-Object Name) {
    $body = (Read-TextFile $f.FullName) -replace '(?s)^<!--.*?-->\s*', ''
    $claudeParts += "`n" + (($body -split "`n" | ForEach-Object { if ($_ -match '^#{1,5} ') { '#' + $_ } else { $_ } }) -join "`n")
}
$claudeJoined = (($claudeParts -join "`n") -replace '\s+', ' ').Trim()
$codexJoined = ((Get-RulesPart $codexText) -replace '\s+', ' ').Trim()
if ($claudeJoined -ne $codexJoined) { Fail (Join-Path $Dist 'claude-code\global') 'CLAUDE.md + rules 的規範本文和 codex/global/AGENTS.md 不同' }
$claudeSkills = @(Get-ChildItem (Join-Path $Dist 'claude-code\global\skills') -Directory | ForEach-Object Name)
$codexSkills = @(Get-ChildItem (Join-Path $Dist 'codex\global\skills') -Directory | ForEach-Object Name)
$agSkills = @(Get-ChildItem (Join-Path $Dist 'antigravity\global\config\skills') -Directory | ForEach-Object Name)
if (($claudeSkills -join ',') -ne ($codexSkills -join ',') -or ($claudeSkills -join ',') -ne ($agSkills -join ',')) {
    Fail $Dist '三個工具的 skills 清單不一致'
}

# ---------- 12. Hook 行為測試 ----------
if (-not $SkipHookTests) {
    $hook = Join-Path $Root 'enforcement\block-dangerous.ps1'
    $cases = (Read-TextFile (Join-Path $Root 'enforcement\tests\hook-cases.json')) | ConvertFrom-Json
    $i = 0
    foreach ($c in $cases) {
        $i++
        $json = ConvertTo-PrettyJson $c.input
        $r = Invoke-HookScript $hook $c.tool $json
        $got = 'none'
        if ($r.Stdout -match '"(permissionDecision|decision)"\s*:\s*"(\w+)"') { $got = $Matches[2] }
        if ($r.ExitCode -ne 0) { $got = "exit $($r.ExitCode)" }
        if ($got -ne $c.expect) {
            $desc = ($json -replace '\s+', ' ')
            if ($desc.Length -gt 120) { $desc = $desc.Substring(0, 120) + '…' }
            Fail $hook "測試案例 $i（$($c.tool)）預期 $($c.expect)，實際 $got：$desc"
        }
    }
    Write-Host "hook 測試：跑了 $i 個案例"
}

# ---------- 結果 ----------
Write-Host ''
Write-Host ("Claude 全域：CLAUDE.md + rules 共 {0} 行" -f $claudeTotal)
Write-Host ("Codex 全域 AGENTS.md：{0} bytes（上限 32,768）" -f $codexBytes)
Write-Host ("Antigravity GEMINI.md：{0} bytes（上限 24,000）、估算 {1} tokens（上限 20,000）" -f $gemBytes, $tokens)
Write-Host ''
if ($Warnings.Count -gt 0) {
    Write-Host "警告 $($Warnings.Count) 項：" -ForegroundColor Yellow
    $Warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}
if ($Failures.Count -gt 0) {
    Write-Host "失敗 $($Failures.Count) 項：" -ForegroundColor Red
    $Failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}
Write-Host 'verify 通過。' -ForegroundColor Green
exit 0
