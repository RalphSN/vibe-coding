# 由 ai-dev-rules 提供。PreToolUse hook：擋下破壞性指令與讀取秘密檔案。
# 同一支腳本給三個工具用，用 -Tool 指定輸入輸出格式：
#   claude       stdin: tool_name / tool_input   stdout: hookSpecificOutput.permissionDecision
#   codex        stdin: tool_name / tool_input   stdout: 同 claude（只輸出 deny，ask 交給 .rules 的 prompt）
#   antigravity  stdin: toolCall.name / args     stdout: { decision, reason }
# 相容 Windows PowerShell 5.1 與 PowerShell 7。檔案需存成 UTF-8 with BOM。
param(
    [ValidateSet('claude', 'codex', 'antigravity')]
    [string]$Tool = 'claude'
)

$ErrorActionPreference = 'Stop'

function Write-Utf8Out([string]$text) {
    # 非 ASCII 字元轉成 \uXXXX，避免主控台編碼問題
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $text.ToCharArray()) {
        if ([int]$ch -gt 127) { [void]$sb.AppendFormat('\u{0:x4}', [int]$ch) } else { [void]$sb.Append($ch) }
    }
    [Console]::Out.Write($sb.ToString())
}

function Get-StringValues($obj) {
    # 遞迴收集物件裡所有字串值
    $out = New-Object System.Collections.Generic.List[string]
    if ($null -eq $obj) { return $out }
    if ($obj -is [string]) { $out.Add($obj); return $out }
    if ($obj -is [System.Collections.IEnumerable]) {
        foreach ($item in $obj) { foreach ($s in (Get-StringValues $item)) { $out.Add($s) } }
        return $out
    }
    if ($obj -is [psobject]) {
        foreach ($p in $obj.PSObject.Properties) {
            foreach ($s in (Get-StringValues $p.Value)) { $out.Add($s) }
        }
    }
    return $out
}

# 秘密檔案：.env 與 .env.*（.env.example / .sample / .template 除外）、私鑰、憑證
$SecretPathPattern = '(^|[\\/])(\.env(\.(?!example$|sample$|template$|dist$)[\w.-]+)?|id_rsa|id_ed25519|id_ecdsa|[\w.-]+\.(pem|p12|pfx))$'
$SecretTokenPattern = '(^|[\s''"=/\\(])(\.env(\.(?!example\b|sample\b|template\b|dist\b)[\w.-]+)?|id_rsa|id_ed25519)(?=$|[\s''";|&)>])'
$ReadVerbPattern = '(^|[\s;|&(])(cat|type|more|less|head|tail|gc|get-content|select-string|sls|findstr|grep|rg|bat|strings|notepad|code|import-csv|source)(\s|$)'
# git 子指令前可能有全域選項，例如 git -C path push、git -c k=v push
$Git = '\bgit\s+((-c|-C)\s+\S+\s+|--?[\w-]+(=\S+)?\s+)*'

function Test-Command([string]$cmd) {
    $c = $cmd.ToLowerInvariant()

    # 一律擋下
    if ($c -match ($Git + 'push\b[^;|&]*(\s--force(-with-lease)?\b|\s-[a-z]*f\b|\s\+[\w/.-]+)')) {
        return @('deny', '禁止 force push（ai-dev-rules 03-git）。請改用一般 push，或由使用者自己執行。')
    }
    $rmShortFlags = ($c -match '\s-[a-z]*r[a-z]*') -and ($c -match '\s-[a-z]*f[a-z]*')
    $rmLongFlags = ($c -match '--recursive') -and ($c -match '--force')
    if (($c -match '\brm\s') -and ($rmShortFlags -or $rmLongFlags)) {
        return @('deny', '禁止 rm -rf（ai-dev-rules 05-security）。請列出要刪的檔案，由使用者確認後自己執行。')
    }
    if ($c -match '\b(remove-item|ri|rm|rmdir|rd|del|erase)\b' -and $c -match '\s-r(e(c(u(r(s(e)?)?)?)?)?)?\b' -and $c -match '\s-fo(r(c(e)?)?)?\b') {
        return @('deny', '禁止 Remove-Item -Recurse -Force（ai-dev-rules 05-security）。請列出要刪的檔案，由使用者確認後自己執行。')
    }
    if ($c -match '\b(rd|rmdir)\s+/s\b' -or ($c -match '\bdel\s' -and $c -match '\s/s\b' -and $c -match '\s/q\b')) {
        return @('deny', '禁止 rd /s、del /s /q（ai-dev-rules 05-security）。')
    }
    if ($c -match '\b(mkfs|diskpart)\b' -or $c -match '\bformat\s+[a-z]:' -or $c -match '\bdd\s+if=') {
        return @('deny', '禁止磁碟格式化類指令。')
    }
    if ($c -match $SecretTokenPattern -and $c -match $ReadVerbPattern) {
        return @('deny', '禁止讀取 .env 或金鑰檔（ai-dev-rules 05-security）。需要變數名稱請讀 .env.example。')
    }

    # 需要使用者確認
    if ($c -match $SecretTokenPattern) {
        return @('ask', '指令提到 .env 或金鑰檔，需要使用者確認。')
    }
    if ($c -match ($Git + 'reset\b[^;|&]*--hard')) { return @('ask', 'git reset --hard 會丟掉未提交的改動，需要使用者確認。') }
    if ($c -match ($Git + 'clean\b[^;|&]*\s-[a-z]*f')) { return @('ask', 'git clean -f 會刪除未追蹤的檔案，需要使用者確認。') }
    if ($c -match ($Git + '(checkout|restore)\s+(--\s+)?\.(\s|$)')) { return @('ask', '這個指令會丟掉工作區的改動，需要使用者確認。') }
    if (($c -match ($Git + 'branch\b')) -and ($cmd -cmatch '\s-D\b')) { return @('ask', 'git branch -D 會強制刪除分支，需要使用者確認。') }
    if ($c -match ($Git + 'push\b')) { return @('ask', 'push 需要使用者確認（ai-dev-rules 03-git）。') }
    if ($c -match '\b(drop\s+(table|database|schema)|truncate\s+table)\b') { return @('ask', '資料庫破壞性操作，需要使用者確認。') }
    if ($c -match '\b(migrate\s+reset|db\s+push\s+--force-reset|migrate:fresh)\b') { return @('ask', '會清空資料庫的 migration 指令，需要使用者確認。') }
    if ($c -match '\b(npm|pnpm|yarn)\s+publish\b') { return @('ask', '發布套件需要使用者確認。') }
    return $null
}

function Test-Path-Secret([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return $null }
    if ($p.Trim() -match $SecretPathPattern) {
        return @('deny', '禁止讀寫 .env 或金鑰檔（ai-dev-rules 05-security）。需要變數名稱請讀 .env.example。')
    }
    return $null
}

# ---- 讀取輸入 ----
try {
    [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch { }
$raw = [Console]::In.ReadToEnd()
# 呼叫端可能送出 UTF-8 BOM（.NET 的 stdin writer 會這樣做），不移除的話 JSON 解析會失敗而放行
$raw = $raw.Replace([string][char]0xFEFF, '')
if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

$commands = New-Object System.Collections.Generic.List[string]
$paths = New-Object System.Collections.Generic.List[string]

if ($Tool -eq 'antigravity') {
    $name = [string]$data.toolCall.name
    $values = Get-StringValues $data.toolCall.args
    if ($name -match 'command|terminal|shell') {
        foreach ($v in $values) { $commands.Add($v) }
    } else {
        foreach ($v in $values) { $paths.Add($v) }
    }
} else {
    $name = [string]$data.tool_name
    $ti = $data.tool_input
    if ($null -ne $ti) {
        if ($name -match '^(Bash|PowerShell|shell|local_shell|exec_command)$') {
            $cmd = $ti.command
            if ($cmd -is [System.Array]) { $cmd = ($cmd -join ' ') }
            if ($cmd) { $commands.Add([string]$cmd) }
        } elseif ($name -eq 'apply_patch') {
            # Codex apply_patch：從 patch 標頭取出檔案路徑
            $patch = [string]$ti.command
            if (-not $patch) { $patch = [string]$ti.input }
            foreach ($m in [regex]::Matches($patch, '\*\*\* (Add|Update|Delete) File: (.+)')) { $paths.Add($m.Groups[2].Value) }
        } else {
            foreach ($key in 'file_path', 'path', 'notebook_path') {
                $v = $ti.$key
                if ($v) { $paths.Add([string]$v) }
            }
        }
    }
}

$result = $null
foreach ($c in $commands) {
    $r = Test-Command $c
    if ($r) { $result = $r; if ($r[0] -eq 'deny') { break } }
}
if (-not $result -or $result[0] -ne 'deny') {
    foreach ($p in $paths) {
        $r = Test-Path-Secret $p
        if ($r) { $result = $r; break }
    }
}

if (-not $result) {
    if ($Tool -eq 'antigravity') { Write-Utf8Out '{}' }
    exit 0
}

$decision = $result[0]
$reason = $result[1]

if ($Tool -eq 'codex' -and $decision -eq 'ask') {
    # Codex 的確認交給 rules/*.rules 的 prompt 決策，hook 只負責 deny
    exit 0
}

if ($Tool -eq 'antigravity') {
    $json = @{ decision = $decision; reason = $reason } | ConvertTo-Json -Compress
} else {
    $json = @{
        hookSpecificOutput = @{
            hookEventName            = 'PreToolUse'
            permissionDecision       = $decision
            permissionDecisionReason = $reason
        }
    } | ConvertTo-Json -Compress -Depth 5
}
Write-Utf8Out $json
exit 0
