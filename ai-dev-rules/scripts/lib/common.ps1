# ai-dev-rules 腳本共用函式。相容 Windows PowerShell 5.1 與 PowerShell 7（Windows、macOS）。
# 路徑一律用 / 組合：Windows 也接受 /，macOS 不接受 \。

$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$script:Utf8Bom = New-Object System.Text.UTF8Encoding($true)

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
}

function Test-IsWindows {
    # 5.1 只有 Windows 版，沒有 $IsWindows 變數
    return ($PSVersionTable.PSEdition -eq 'Desktop') -or [bool]$IsWindows
}

function Get-PowerShellExe {
    # 執行 hook 用的 PowerShell：Windows 用內建的 5.1，macOS 用 PowerShell 7
    if (Test-IsWindows) { return 'powershell.exe' }
    return 'pwsh'
}

function Get-RelativePath([string]$Base, [string]$Full) {
    # 回傳以 / 分隔的相對路徑，兩個平台結果相同
    return $Full.Substring($Base.Length).Replace('\', '/').TrimStart('/')
}

function Read-TextFile([string]$Path) {
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-TextFile([string]$Path, [string]$Text) {
    # .ps1 存成 UTF-8 with BOM（5.1 才讀得懂中文），其他存成 UTF-8 無 BOM，行尾統一 LF
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $normalized = $Text -replace "`r`n", "`n"
    $enc = $script:Utf8NoBom
    if ($Path -like '*.ps1') {
        $enc = $script:Utf8Bom
        $normalized = $normalized -replace "`n", "`r`n"
    }
    [System.IO.File]::WriteAllText($Path, $normalized, $enc)
}

function ConvertFrom-Frontmatter([string]$Text) {
    # 解析簡單的 YAML frontmatter：每個鍵一行；globs 的值是 JSON 陣列，其他都是字串
    $result = [ordered]@{ Meta = [ordered]@{}; Body = $Text; HasFrontmatter = $false }
    $t = $Text -replace "`r`n", "`n"
    if (-not $t.StartsWith("---`n")) { return $result }
    $end = $t.IndexOf("`n---`n", 4)
    if ($end -lt 0) { return $result }
    $head = $t.Substring(4, $end - 4)
    $result.Body = $t.Substring($end + 5).TrimStart("`n")
    $result.HasFrontmatter = $true
    $listKey = $null
    foreach ($line in $head -split "`n") {
        if ($line -match '^\s*#' -or $line.Trim() -eq '') { continue }
        if ($listKey -and $line -match '^\s+-\s+(.*)$') {
            # YAML 清單項目，例如 paths: 底下的 - "src/**"
            $item = $Matches[1].Trim()
            if ($item -match '^"(.*)"$' -or $item -match "^'(.*)'$") { $item = $Matches[1] }
            $result.Meta[$listKey] = [string[]](@($result.Meta[$listKey]) + $item)
            continue
        }
        $listKey = $null
        if ($line -match '^([A-Za-z0-9_-]+):\s*$') {
            $listKey = $Matches[1]
            $result.Meta[$listKey] = [string[]]@()
            continue
        }
        if ($line -match '^([A-Za-z0-9_-]+):\s*(.*)$') {
            $key = $Matches[1]
            $val = $Matches[2].Trim()
            if ($key -eq 'globs' -and $val.StartsWith('[')) {
                # 5.1 的 ConvertFrom-Json 會把陣列包成單一物件，用 ForEach-Object 攤平
                $parsed = ConvertFrom-Json -InputObject $val
                $val = [string[]]@($parsed | ForEach-Object { $_ })
            } elseif ($val -match '^"(.*)"$' -or $val -match "^'(.*)'$") {
                $val = $Matches[1]
            }
            $result.Meta[$key] = $val
        } else {
            throw "無法解析的 frontmatter 行：$line"
        }
    }
    return $result
}

function ConvertTo-YamlScalar([string]$Value) {
    # 需要時加引號，避免冒號、井號等字元破壞 YAML
    if ($Value -match '^[\w一-鿿]' -and $Value -notmatch ':\s|\s#|^[-?!&*|>%@`]') { return $Value }
    return '"' + ($Value -replace '\\', '\\' -replace '"', '\"') + '"'
}

function ConvertTo-PrettyJson($Value, [int]$Indent = 0) {
    # 2 空格縮排的 JSON；PS 5.1 內建的 ConvertTo-Json 縮排難讀，也會把 < > 跳脫成 <
    $pad = '  ' * $Indent
    $pad1 = '  ' * ($Indent + 1)
    if ($null -eq $Value) { return 'null' }
    if ($Value -is [bool]) { if ($Value) { return 'true' } else { return 'false' } }
    if ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal]) { return [string]$Value }
    if ($Value -is [string]) {
        $s = $Value.Replace('\', '\\').Replace('"', '\"').Replace("`n", '\n').Replace("`r", '\r').Replace("`t", '\t')
        return '"' + $s + '"'
    }
    if ($Value -is [System.Collections.IDictionary]) {
        if ($Value.Count -eq 0) { return '{}' }
        $parts = foreach ($k in $Value.Keys) { $pad1 + (ConvertTo-PrettyJson ([string]$k)) + ': ' + (ConvertTo-PrettyJson $Value[$k] ($Indent + 1)) }
        return "{`n" + ($parts -join ",`n") + "`n$pad}"
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        $items = @($Value)
        if ($items.Count -eq 0) { return '[]' }
        $parts = foreach ($i in $items) { $pad1 + (ConvertTo-PrettyJson $i ($Indent + 1)) }
        return "[`n" + ($parts -join ",`n") + "`n$pad]"
    }
    if ($Value -is [psobject]) {
        $props = @($Value.PSObject.Properties)
        if ($props.Count -eq 0) { return '{}' }
        $parts = foreach ($p in $props) { $pad1 + (ConvertTo-PrettyJson $p.Name) + ': ' + (ConvertTo-PrettyJson $p.Value ($Indent + 1)) }
        return "{`n" + ($parts -join ",`n") + "`n$pad}"
    }
    return (ConvertTo-PrettyJson ([string]$Value) $Indent)
}

function Get-FileTokenEstimate([string]$Text) {
    # 粗估 token 數：CJK 字元每字 1 token，其他字元每 4 字 1 token
    $cjk = ([regex]::Matches($Text, '[　-ヿ㐀-鿿＀-￯]')).Count
    $other = $Text.Length - $cjk
    return [int]($cjk + [math]::Ceiling($other / 4))
}

function Invoke-HookScript([string]$ScriptPath, [string]$Tool, [string]$StdinJson) {
    # 用真正的 stdin 呼叫 hook（PowerShell 管線傳給原生程式時編碼不可靠）
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = Get-PowerShellExe
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" -Tool $Tool"
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.StandardOutputEncoding = $script:Utf8NoBom
    $p = [System.Diagnostics.Process]::Start($psi)
    $bytes = $script:Utf8NoBom.GetBytes($StdinJson)
    $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $p.StandardInput.Close()
    $out = $p.StandardOutput.ReadToEnd()
    $err = $p.StandardError.ReadToEnd()
    $p.WaitForExit()
    return [pscustomobject]@{ ExitCode = $p.ExitCode; Stdout = $out; Stderr = $err }
}
