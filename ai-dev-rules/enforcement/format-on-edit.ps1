# 由 ai-dev-rules 提供。PostToolUse hook：檔案被修改後，用專案自己安裝的 Prettier 格式化。
# 專案沒有安裝 Prettier（node_modules/.bin/prettier）時什麼都不做。
# 用 -Tool 指定輸入格式：claude / codex / antigravity。相容 PowerShell 5.1 與 7。
param(
    [ValidateSet('claude', 'codex', 'antigravity')]
    [string]$Tool = 'claude'
)

$ErrorActionPreference = 'SilentlyContinue'
$Extensions = @('.vue', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.html', '.json', '.md')

function Find-Prettier([string]$file) {
    $dir = Split-Path -Parent $file
    while ($dir) {
        foreach ($name in 'prettier.cmd', 'prettier') {
            $candidate = Join-Path $dir (Join-Path 'node_modules\.bin' $name)
            if (Test-Path -LiteralPath $candidate) { return $candidate }
        }
        $parent = Split-Path -Parent $dir
        if ($parent -eq $dir) { break }
        $dir = $parent
    }
    return $null
}

try { [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
$raw = [Console]::In.ReadToEnd()
$raw = $raw.Replace([string][char]0xFEFF, '')
if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

$files = New-Object System.Collections.Generic.List[string]
if ($Tool -eq 'antigravity') {
    $args0 = $data.toolCall.args
    if ($args0) {
        foreach ($p in $args0.PSObject.Properties) {
            if ($p.Value -is [string] -and $p.Name -match 'file|path') { $files.Add($p.Value) }
        }
    }
} elseif ($data.tool_name -eq 'apply_patch') {
    $patch = [string]$data.tool_input.command
    if (-not $patch) { $patch = [string]$data.tool_input.input }
    foreach ($m in [regex]::Matches($patch, '\*\*\* (Add|Update) File: (.+)')) { $files.Add($m.Groups[2].Value.Trim()) }
} elseif ($data.tool_input.file_path) {
    $files.Add([string]$data.tool_input.file_path)
}

$cwd = [string]$data.cwd
foreach ($f in $files) {
    $full = $f
    if (-not [System.IO.Path]::IsPathRooted($full) -and $cwd) { $full = Join-Path $cwd $full }
    if (-not (Test-Path -LiteralPath $full)) { continue }
    if ($Extensions -notcontains [System.IO.Path]::GetExtension($full).ToLowerInvariant()) { continue }
    $prettier = Find-Prettier $full
    if ($prettier) { & $prettier --write --log-level warn $full *> $null }
}
exit 0
