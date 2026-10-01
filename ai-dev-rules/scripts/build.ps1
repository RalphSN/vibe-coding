<#
.SYNOPSIS
  把 core/、skills/、workflows/、agents/、enforcement/ 轉成三個工具的 dist/。
.DESCRIPTION
  每次執行都會清空並重建 dist/。dist/ 不要手改，改來源再重跑。
  相容 Windows PowerShell 5.1 與 PowerShell 7。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/build.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\common.ps1')

$Root = Get-RepoRoot
$Dist = Join-Path $Root 'dist'
$HeaderText = '由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡'
$MdHeader = "<!-- $HeaderText -->"
$HashHeader = "# $HeaderText"

# ---------- 讀取來源 ----------

function Get-Sources {
    $core = foreach ($f in Get-ChildItem (Join-Path $Root 'core') -Filter '*.md' -File | Sort-Object Name) {
        $fm = ConvertFrom-Frontmatter (Read-TextFile $f.FullName)
        [pscustomobject]@{ Id = $fm.Meta.id; Title = $fm.Meta.title; Body = $fm.Body }
    }
    $domains = foreach ($f in Get-ChildItem (Join-Path $Root 'core\domains') -Filter '*.md' -File | Sort-Object Name) {
        $fm = ConvertFrom-Frontmatter (Read-TextFile $f.FullName)
        $globs = @()
        if ($fm.Meta.Contains('globs')) { $globs = @($fm.Meta.globs) }
        [pscustomobject]@{ Id = $fm.Meta.id; Title = $fm.Meta.title; Description = $fm.Meta.description; Globs = $globs; Body = $fm.Body }
    }
    $skills = foreach ($d in Get-ChildItem (Join-Path $Root 'skills') -Directory | Sort-Object Name) {
        $fm = ConvertFrom-Frontmatter (Read-TextFile (Join-Path $d.FullName 'SKILL.md'))
        [pscustomobject]@{ Name = $fm.Meta.name; Description = $fm.Meta.description; Body = $fm.Body; SourceDir = $d.FullName }
    }
    $workflows = foreach ($f in Get-ChildItem (Join-Path $Root 'workflows') -Filter '*.md' -File | Sort-Object Name) {
        $fm = ConvertFrom-Frontmatter (Read-TextFile $f.FullName)
        $hint = ''
        if ($fm.Meta.Contains('argument-hint')) { $hint = $fm.Meta['argument-hint'] }
        [pscustomobject]@{ Name = $fm.Meta.name; Description = $fm.Meta.description; ArgumentHint = $hint; Body = $fm.Body }
    }
    $agents = foreach ($f in Get-ChildItem (Join-Path $Root 'agents') -Filter '*.md' -File | Sort-Object Name) {
        $fm = ConvertFrom-Frontmatter (Read-TextFile $f.FullName)
        [pscustomobject]@{ Name = $fm.Meta.name; Description = $fm.Meta.description; Body = $fm.Body }
    }
    return [pscustomobject]@{ Core = @($core); Domains = @($domains); Skills = @($skills); Workflows = @($workflows); Agents = @($agents) }
}

# ---------- 共用轉換 ----------

function Step-Headings([string]$Body) {
    # 合併多份文件時，標題全部降一級
    return ($Body -split "`n" | ForEach-Object {
            if ($_ -match '^#{1,5} ') { '#' + $_ } else { $_ }
        }) -join "`n"
}

function Join-CoreBodies($Items) {
    return ($Items | ForEach-Object { (Step-Headings $_.Body).TrimEnd() }) -join "`n`n"
}

function New-GlobalEntry($Items, [string]$ToolName) {
    $projectFiles = @{ claude = 'CLAUDE.md 或 AGENTS.md'; codex = 'AGENTS.md'; antigravity = 'AGENTS.md 或 GEMINI.md' }[$ToolName]
    $lines = @(
        $MdHeader
        ''
        '# 個人開發規範'
        ''
        "這些規則適用於所有專案。專案自己的 $projectFiles 有不同規定時，以專案為準。"
        '領域規範（網頁前端、後端 API、遊戲、媒體、教材、原型、腳本）放在 `domain-*` skills，需要時才載入。'
        ''
    )
    return ($lines -join "`n") + (Join-CoreBodies $Items) + "`n"
}

function Copy-SkillExtras([string]$SourceDir, [string]$TargetDir) {
    foreach ($item in Get-ChildItem $SourceDir -Recurse -File) {
        if ($item.Name -eq 'SKILL.md' -and $item.DirectoryName -eq $SourceDir) { continue }
        $rel = $item.FullName.Substring($SourceDir.Length).TrimStart('\')
        $dest = Join-Path $TargetDir $rel
        $text = Read-TextFile $item.FullName
        if ($item.Extension -eq '.md') { $text = $MdHeader + "`n`n" + $text }
        Write-TextFile $dest $text
    }
}

function Write-Skill {
    param(
        [string]$TargetRoot,
        [ValidateSet('claude', 'codex', 'antigravity')][string]$Tool,
        [string]$Name,
        [string]$Description,
        [string]$Body,
        [switch]$Manual,
        [string]$ArgumentHint = '',
        [string]$SourceDir = ''
    )
    $dir = Join-Path $TargetRoot $Name
    $fm = @('---', "name: $Name", ('description: ' + (ConvertTo-YamlScalar $Description)))
    if ($Tool -eq 'claude' -and $Manual) {
        $fm += 'disable-model-invocation: true'
        if ($ArgumentHint) { $fm += ('argument-hint: ' + (ConvertTo-YamlScalar $ArgumentHint)) }
    }
    $fm += '---'
    $text = $Body
    if ($Tool -ne 'claude') {
        # Codex 與 Antigravity 不會替換 $ARGUMENTS，改寫成說明文字，保留 argument-hint 的預設行為
        $placeholder = '（呼叫時附帶的內容）'
        if ($ArgumentHint) { $placeholder = "（呼叫時附帶的內容，格式：$ArgumentHint）" }
        $text = $text.Replace('$ARGUMENTS', $placeholder)
    }
    $content = ($fm -join "`n") + "`n`n" + $MdHeader + "`n`n" + $text.TrimEnd() + "`n"
    Write-TextFile (Join-Path $dir 'SKILL.md') $content
    if ($SourceDir) { Copy-SkillExtras $SourceDir $dir }
    if ($Tool -eq 'codex' -and $Manual) {
        $yaml = @($HashHeader, 'policy:', '  allow_implicit_invocation: false') -join "`n"
        Write-TextFile (Join-Path $dir 'agents\openai.yaml') ($yaml + "`n")
    }
}

function Write-AllSkills([string]$TargetRoot, [string]$Tool, $Src) {
    foreach ($s in $Src.Skills) {
        Write-Skill -TargetRoot $TargetRoot -Tool $Tool -Name $s.Name -Description $s.Description -Body $s.Body -SourceDir $s.SourceDir
    }
    foreach ($d in $Src.Domains) {
        $body = "# $($d.Title)`n`n" + ($d.Body -replace '^# .*\n+', '')
        Write-Skill -TargetRoot $TargetRoot -Tool $Tool -Name ("domain-" + $d.Id) -Description $d.Description -Body $body
    }
    foreach ($w in $Src.Workflows) {
        Write-Skill -TargetRoot $TargetRoot -Tool $Tool -Name $w.Name -Description $w.Description -Body $w.Body -Manual -ArgumentHint $w.ArgumentHint
    }
}

function Write-Json([string]$Path, $Object) {
    Write-TextFile $Path ((ConvertTo-PrettyJson $Object) + "`n")
}

function Copy-Enforcement([string]$Name, [string]$Dest) {
    # .ps1 / .rules / .toml 開頭加上產生註解；JSON 不能有註解，改由 dist/README.md 說明
    $text = Read-TextFile (Join-Path $Root "enforcement\$Name")
    if ($Name -match '\.(ps1|rules|toml)$') { $text = $HashHeader + "`n" + $text }
    Write-TextFile $Dest $text
}

function New-PwshHookCommand([string]$ScriptPath, [string]$Tool) {
    return "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" -Tool $Tool"
}

# ---------- 開始 ----------

$src = Get-Sources
if (Test-Path -LiteralPath $Dist) { Remove-Item -LiteralPath $Dist -Recurse -Force }

$alwaysIds = @('00-communication', '01-workflow')
$claudeEntry = @($src.Core | Where-Object { $alwaysIds -contains $_.Id })
$claudeRules = @($src.Core | Where-Object { $alwaysIds -notcontains $_.Id })
$perm = Read-TextFile (Join-Path $Root 'enforcement\claude-permissions.json') | ConvertFrom-Json
$agPerm = Read-TextFile (Join-Path $Root 'enforcement\antigravity-permissions.json') | ConvertFrom-Json
$PreMatcherClaude = 'Bash|PowerShell|Read|Edit|Write|MultiEdit|NotebookEdit|Grep|Glob'
$PreMatcherAg = 'run_command|view_file|write_to_file|replace_file_content|multi_replace_file_content'

# ===== Claude Code：global（對應 ~/.claude/）=====
$cg = Join-Path $Dist 'claude-code\global'
Write-TextFile (Join-Path $cg 'CLAUDE.md') (New-GlobalEntry $claudeEntry 'claude')
foreach ($c in $claudeRules) {
    Write-TextFile (Join-Path $cg "rules\$($c.Id).md") ($MdHeader + "`n`n" + $c.Body.TrimEnd() + "`n")
}
Write-AllSkills (Join-Path $cg 'skills') 'claude' $src
foreach ($a in $src.Agents) {
    $text = @('---', "name: $($a.Name)", ('description: ' + (ConvertTo-YamlScalar $a.Description)), 'tools: Read, Grep, Glob, Bash', '---', '', $MdHeader, '', $a.Body.TrimEnd()) -join "`n"
    Write-TextFile (Join-Path $cg "agents\$($a.Name).md") ($text + "`n")
}
Copy-Enforcement 'block-dangerous.ps1' (Join-Path $cg 'hooks\block-dangerous.ps1')
Write-Json (Join-Path $cg 'settings.json') ([ordered]@{
        '$schema'   = 'https://json.schemastore.org/claude-code-settings.json'
        permissions = [ordered]@{ deny = @($perm.deny); ask = @($perm.ask) }
        hooks       = [ordered]@{
            PreToolUse = @([ordered]@{
                    matcher = $PreMatcherClaude
                    hooks   = @([ordered]@{
                            type    = 'command'
                            command = 'powershell.exe'
                            args    = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '{{HOME}}/.claude/hooks/block-dangerous.ps1', '-Tool', 'claude')
                            timeout = 30
                        })
                })
        }
    })

# ===== Claude Code：project（對應專案根目錄）=====
$cp = Join-Path $Dist 'claude-code\project'
Write-TextFile (Join-Path $cp 'CLAUDE.md') ("$MdHeader`n`n@AGENTS.md`n")
foreach ($d in $src.Domains) {
    $fm = ''
    if ($d.Globs.Count -gt 0) {
        $fm = "---`npaths:`n" + (($d.Globs | ForEach-Object { "  - `"$_`"" }) -join "`n") + "`n---`n`n"
    }
    Write-TextFile (Join-Path $cp ".claude\rules\$($d.Id).md") ($fm + $MdHeader + "`n`n" + $d.Body.TrimEnd() + "`n")
}
Copy-Enforcement 'block-dangerous.ps1' (Join-Path $cp '.claude\hooks\block-dangerous.ps1')
Copy-Enforcement 'format-on-edit.ps1' (Join-Path $cp '.claude\hooks\format-on-edit.ps1')
Write-Json (Join-Path $cp '.claude\settings.json') ([ordered]@{
        '$schema'   = 'https://json.schemastore.org/claude-code-settings.json'
        permissions = [ordered]@{ deny = @($perm.deny); ask = @($perm.ask) }
        hooks       = [ordered]@{
            PreToolUse  = @([ordered]@{
                    matcher = $PreMatcherClaude
                    hooks   = @([ordered]@{
                            type = 'command'; command = 'powershell.exe'; timeout = 30
                            args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '${CLAUDE_PROJECT_DIR}/.claude/hooks/block-dangerous.ps1', '-Tool', 'claude')
                        })
                })
            PostToolUse = @([ordered]@{
                    matcher = 'Edit|Write|MultiEdit'
                    hooks   = @([ordered]@{
                            type = 'command'; command = 'powershell.exe'; timeout = 60
                            args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '${CLAUDE_PROJECT_DIR}/.claude/hooks/format-on-edit.ps1', '-Tool', 'claude')
                        })
                })
        }
    })

# ===== Codex：global（對應 ~/.codex/）=====
$xg = Join-Path $Dist 'codex\global'
Write-TextFile (Join-Path $xg 'AGENTS.md') (New-GlobalEntry $src.Core 'codex')
Write-AllSkills (Join-Path $xg 'skills') 'codex' $src
Copy-Enforcement 'codex-default.rules' (Join-Path $xg 'rules\ai-dev-rules.rules')
Copy-Enforcement 'block-dangerous.ps1' (Join-Path $xg 'hooks\block-dangerous.ps1')
Copy-Enforcement 'codex-permissions.toml' (Join-Path $xg 'config.snippet.toml')
foreach ($a in $src.Agents) {
    $toml = @(
        $HashHeader
        "name = `"$($a.Name)`""
        "description = `"$($a.Description.Replace('"', '\"'))`""
        'sandbox_mode = "read-only"'
        'developer_instructions = """'
        $a.Body.TrimEnd()
        '"""'
    ) -join "`n"
    Write-TextFile (Join-Path $xg "agents\$($a.Name).toml") ($toml + "`n")
}
Write-Json (Join-Path $xg 'hooks.json') ([ordered]@{
        description = 'ai-dev-rules hooks'
        hooks       = [ordered]@{
            PreToolUse = @([ordered]@{
                    matcher = 'Bash|apply_patch'
                    hooks   = @([ordered]@{
                            type          = 'command'
                            command       = (New-PwshHookCommand '{{HOME}}/.codex/hooks/block-dangerous.ps1' 'codex')
                            timeout       = 30
                            statusMessage = 'ai-dev-rules: checking command'
                        })
                })
        }
    })

# ===== Codex：project =====
$xp = Join-Path $Dist 'codex\project'
Copy-Enforcement 'codex-default.rules' (Join-Path $xp '.codex\rules\ai-dev-rules.rules')
Copy-Enforcement 'block-dangerous.ps1' (Join-Path $xp '.codex\hooks\block-dangerous.ps1')
Copy-Enforcement 'format-on-edit.ps1' (Join-Path $xp '.codex\hooks\format-on-edit.ps1')
Write-Json (Join-Path $xp '.codex\hooks.json') ([ordered]@{
        description = 'ai-dev-rules hooks'
        hooks       = [ordered]@{
            PreToolUse  = @([ordered]@{
                    matcher = 'Bash|apply_patch'
                    hooks   = @([ordered]@{ type = 'command'; command = (New-PwshHookCommand '.codex/hooks/block-dangerous.ps1' 'codex'); timeout = 30; statusMessage = 'ai-dev-rules: checking command' })
                })
            PostToolUse = @([ordered]@{
                    matcher = 'apply_patch'
                    hooks   = @([ordered]@{ type = 'command'; command = (New-PwshHookCommand '.codex/hooks/format-on-edit.ps1' 'codex'); timeout = 60 })
                })
        }
    })

# ===== Antigravity：global（對應 ~/.gemini/）=====
$ag = Join-Path $Dist 'antigravity\global'
Write-TextFile (Join-Path $ag 'GEMINI.md') (New-GlobalEntry $src.Core 'antigravity')
Write-AllSkills (Join-Path $ag 'config\skills') 'antigravity' $src
Copy-Enforcement 'block-dangerous.ps1' (Join-Path $ag 'config\hooks\block-dangerous.ps1')
Write-Json (Join-Path $ag 'config\hooks.json') ([ordered]@{
        'ai-dev-rules' = [ordered]@{
            PreToolUse = @([ordered]@{
                    matcher = $PreMatcherAg
                    hooks   = @([ordered]@{ type = 'command'; command = (New-PwshHookCommand '{{HOME}}/.gemini/config/hooks/block-dangerous.ps1' 'antigravity'); timeout = 30 })
                })
        }
    })
Write-Json (Join-Path $ag 'antigravity-cli\settings.json') ([ordered]@{
        permissions = [ordered]@{ deny = @($agPerm.deny); ask = @($agPerm.ask) }
    })

# ===== Antigravity：project =====
$ap = Join-Path $Dist 'antigravity\project'
foreach ($d in $src.Domains) {
    if ($d.Globs.Count -gt 0) {
        $fm = "---`ntrigger: glob`ndescription: " + (ConvertTo-YamlScalar $d.Description) + "`nglobs: `"" + ($d.Globs -join ', ') + "`"`n---`n`n"
    } else {
        $fm = "---`ntrigger: model_decision`ndescription: " + (ConvertTo-YamlScalar $d.Description) + "`n---`n`n"
    }
    Write-TextFile (Join-Path $ap ".agents\rules\$($d.Id).md") ($fm + $MdHeader + "`n`n" + $d.Body.TrimEnd() + "`n")
}
Copy-Enforcement 'block-dangerous.ps1' (Join-Path $ap '.agents\hooks\block-dangerous.ps1')
Copy-Enforcement 'format-on-edit.ps1' (Join-Path $ap '.agents\hooks\format-on-edit.ps1')
Write-Json (Join-Path $ap '.agents\hooks.json') ([ordered]@{
        'ai-dev-rules' = [ordered]@{
            PreToolUse  = @([ordered]@{
                    matcher = $PreMatcherAg
                    hooks   = @([ordered]@{ type = 'command'; command = (New-PwshHookCommand '.agents/hooks/block-dangerous.ps1' 'antigravity'); timeout = 30 })
                })
            PostToolUse = @([ordered]@{
                    matcher = 'write_to_file|replace_file_content|multi_replace_file_content'
                    hooks   = @([ordered]@{ type = 'command'; command = (New-PwshHookCommand '.agents/hooks/format-on-edit.ps1' 'antigravity'); timeout = 60 })
                })
        }
    })

# ===== dist 說明 =====
$readme = @"
$MdHeader

# dist/

這個資料夾由 ``scripts/build.ps1`` 產生，每次 build 會整個重建。要改內容請改 ``core/``、``skills/``、``workflows/``、``agents/``、``enforcement/``。

| 資料夾 | 安裝到 | 由誰安裝 |
|---|---|---|
| ``claude-code/global/`` | ``~/.claude/`` | ``install.ps1 -Tool claude`` |
| ``claude-code/project/`` | 專案根目錄 | ``new-project.ps1`` 或 ``install.ps1 -Scope project`` |
| ``codex/global/`` | ``~/.codex/`` | ``install.ps1 -Tool codex`` |
| ``codex/project/`` | 專案根目錄 | 同上 |
| ``antigravity/global/`` | ``~/.gemini/`` | ``install.ps1 -Tool antigravity`` |
| ``antigravity/project/`` | 專案根目錄 | 同上 |

JSON 設定檔裡的 ``{{HOME}}`` 由 install.ps1 換成實際的家目錄路徑；``settings.json``、``hooks.json`` 是用合併的方式寫入，不會整個覆蓋。
"@
Write-TextFile (Join-Path $Dist 'README.md') $readme

$count = (Get-ChildItem $Dist -Recurse -File).Count
Write-Host "build 完成：dist/ 共 $count 個檔案。下一步：執行 scripts/verify.ps1"
