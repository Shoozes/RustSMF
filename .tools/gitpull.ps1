# File: .tools/gitpull.ps1
param(
    [string]$Remote = "",
    [switch]$Force,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"
$env:GIT_TERMINAL_PROMPT = "0"

function Read-FirstLine([string]$path) {
    if (!(Test-Path -LiteralPath $path)) { throw "Missing $path" }
    $line = (Get-Content -LiteralPath $path -TotalCount 1)
    $line = $line -replace "`uFEFF",""
    $line = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($line)) { throw "$path is empty" }
    return $line
}

function Read-JsonFile([string]$path) {
    if (!(Test-Path -LiteralPath $path)) { return $null }
    try {
        $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
        return ($raw | ConvertFrom-Json)
    } catch {
        throw "Failed to read JSON: $path"
    }
}

function Get-RelPathPosix([string]$BaseDir, [string]$FullPath) {
    $base = (Resolve-Path -LiteralPath $BaseDir).Path.TrimEnd('\')
    $full = (Resolve-Path -LiteralPath $FullPath).Path
    if ($full.Length -ge $base.Length -and $full.Substring(0, $base.Length).Equals($base, [System.StringComparison]::OrdinalIgnoreCase)) {
        $rel = $full.Substring($base.Length).TrimStart('\')
        return ($rel -replace '\\','/')
    }
    return ($FullPath -replace '\\','/')
}

function Resolve-TokenInfo {
    param(
        [string]$RepoRoot,
        [string]$SecretsDir,
        [string]$TokenFile
    )

    $candidates = @()

    if (-not [string]::IsNullOrWhiteSpace($SecretsDir)) {
        $candidates += (Join-Path $RepoRoot (Join-Path $SecretsDir $TokenFile))
    }

    $candidates += (Join-Path $RepoRoot (Join-Path (Join-Path ".tools" ".secrets") $TokenFile))
    $candidates += (Join-Path $RepoRoot (Join-Path ".secrets" $TokenFile))

    $candidates = $candidates | Select-Object -Unique

    foreach ($p in $candidates) {
        if (Test-Path -LiteralPath $p) {
            $rel = Get-RelPathPosix -BaseDir $RepoRoot -FullPath $p
            $dirRel = ($rel -replace '/[^/]+$','')
            return [pscustomobject]@{
                TokenPath     = $p
                TokenRel      = $rel
                SecretsDirRel = $dirRel
            }
        }
    }

    $msg = "Missing token file. Looked for:`n"
    foreach ($p in $candidates) { $msg += " - $p`n" }
    $msg += "Fix: put gt.txt under .tools/.secrets/ or set .tools/project.json paths.secretsDir to '.tools/.secrets'."
    throw $msg
}

function Confirm-OrExit {
    param([string]$Prompt, [string]$Expected = "YES")
    if ($Yes) { return }
    $ans = Read-Host "$Prompt Type $Expected to continue"
    if ($ans -ne $Expected) {
        Write-Host "Canceled."
        exit 0
    }
}

function Parse-OverwrittenFiles([string[]]$lines) {
    $files = @()
    $inList = $false
    foreach ($line in $lines) {
        if ($line -like "*untracked working tree files would be overwritten by*") {
            $inList = $true
            continue
        }
        if ($inList -and $line -like "*Please move or remove them before you*") { break }
        if ($inList -and $line.Trim() -ne "") { $files += $line.Trim() }
    }
    return $files
}

function Invoke-Git {
    param([scriptblock]$Command)
    $backup = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = & $Command 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $backup
    if ($null -eq $out) { $out = @() } else { $out = $out | ForEach-Object { "$_" } }
    if ($null -eq $code) { $code = 0 }
    [pscustomobject]@{ Output = $out; ExitCode = $code }
}

function Restore-RemoteMissingFiles {
    param([string]$Branch)

    $remoteFiles = (& git ls-tree -r --name-only "origin/$Branch" 2>$null) | Where-Object { $_ }
    if (-not $remoteFiles) { return }

    $repoRoot = (Get-Location).ProviderPath
    $missing = @()

    foreach ($rf in $remoteFiles) {
        $localRel = $rf -replace '/', '\'
        $fullPath = Join-Path $repoRoot $localRel
        if (-not (Test-Path -LiteralPath $fullPath)) {
            $missing += [pscustomobject]@{ Remote = $rf; LocalRel = $localRel; FullPath = $fullPath }
        }
    }

    if ($missing.Count -eq 0) { return }

    Write-Host "Restoring $($missing.Count) missing tracked file(s) from origin/$Branch"
    foreach ($m in $missing) {
        $dir = Split-Path -Parent $m.FullPath
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $res = Invoke-Git { git @('checkout', "origin/$Branch", '--', $m.Remote) }
        if ($res.ExitCode -ne 0) { Write-Warning ("Failed to restore {0}: {1}" -f $m.Remote, ($res.Output -join ' ')) }
    }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -Path $RepoRoot

$ProjectPath = Join-Path $RepoRoot ".tools\project.json"
$Project = Read-JsonFile $ProjectPath

if ([string]::IsNullOrWhiteSpace($Remote)) {
    $cfgRemote = $null
    if ($Project -and $Project.git -and $Project.git.remote) { $cfgRemote = [string]$Project.git.remote }
    if (-not [string]::IsNullOrWhiteSpace($cfgRemote)) {
        $Remote = $cfgRemote
    } else {
        throw "Remote not provided and .tools/project.json missing git.remote"
    }
}

$secretsDir = ".secrets"
$tokenFile = "gt.txt"
if ($Project -and $Project.paths) {
    if ($Project.paths.secretsDir) { $secretsDir = [string]$Project.paths.secretsDir }
    if ($Project.paths.tokenFile) { $tokenFile = [string]$Project.paths.tokenFile }
}

if ($Force) {
    Confirm-OrExit -Prompt "Force pull will discard local changes and untracked files." -Expected "FORCE"
} else {
    Confirm-OrExit -Prompt "Proceed with git pull/rebase/merge?" -Expected "YES"
}

$tokenInfo = Resolve-TokenInfo -RepoRoot $RepoRoot -SecretsDir $secretsDir -TokenFile $tokenFile
$tokenPath = $tokenInfo.TokenPath
$tokenRel = $tokenInfo.TokenRel
$secretsDirRel = $tokenInfo.SecretsDirRel

$token = Read-FirstLine $tokenPath

if (!(Test-Path ".git")) { throw "No local git repo found. Initialize or clone first." }

$branch = ""
try { $branch = (& git rev-parse --abbrev-ref HEAD).Trim() } catch {}
if ([string]::IsNullOrWhiteSpace($branch) -or $branch -eq "HEAD") {
    if ($Project -and $Project.git -and $Project.git.defaultBranch) { $branch = [string]$Project.git.defaultBranch } else { $branch = "main" }
}

$excludePath = ".git/info/exclude"
if (!(Test-Path $excludePath)) { New-Item -ItemType File -Path $excludePath | Out-Null }
$excludeLines = Get-Content $excludePath -ErrorAction SilentlyContinue
$need = @("$secretsDirRel/", "$secretsDirRel/$tokenFile", ".gtignore", "*.gtignore")
$toAppend = $need | Where-Object { $_ -notin $excludeLines }
if ($toAppend.Count -gt 0) { Add-Content -Path $excludePath -Value ($toAppend -join [Environment]::NewLine) }

$tracked = & git ls-files -z -- "$tokenRel" '.gtignore' '*.gtignore' 2>$null
if ($tracked) {
    ($tracked -split "`0" | Where-Object { $_ }) | ForEach-Object { & git rm --cached --force -- $_ | Out-Null }
}

$pair = "x-access-token:$token"
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$authCfg = "http.https://github.com/.extraheader=Authorization: Basic $basic"
$noCredHelper = "credential.helper="

$originUrl = ""
try { $originUrl = (& git remote get-url origin).Trim() } catch {}
if ([string]::IsNullOrWhiteSpace($originUrl)) { & git remote add origin $Remote | Out-Null }
elseif ($originUrl -ne $Remote) { & git remote set-url origin $Remote | Out-Null }

if ($Remote -notmatch "github\.com[:/](?<owner>[^/]+)/(?<repo>[^\.]+)(?:\.git)?$") {
    throw "Remote is not a valid GitHub HTTPS URL: $Remote"
}
$owner = $Matches.owner
$repo = $Matches.repo

$ghHeaders = @{
    "Authorization"        = "Bearer $token"
    "Accept"               = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent"           = "gitpull.ps1"
}

$apiOk = $true
try {
    Invoke-RestMethod -Method GET -Headers $ghHeaders -Uri "https://api.github.com/user" | Out-Null
    Invoke-RestMethod -Method GET -Headers $ghHeaders -Uri "https://api.github.com/repos/$owner/$repo" | Out-Null
} catch {
    Write-Warning "GitHub API check failed (likely 401). We will try pure git using the token header."
    $apiOk = $false
}

if ((Test-Path ".git/rebase-merge") -or (Test-Path ".git/rebase-apply")) { & git rebase --abort *>$null }
if (Test-Path ".git/MERGE_HEAD") { & git merge --abort *>$null }
if (Test-Path ".git/.MERGE_MSG.swp") { Remove-Item ".git/.MERGE_MSG.swp" -Force *>$null }

$fetch = Invoke-Git { git @('-c', $authCfg, '-c', $noCredHelper, 'fetch', 'origin') }
if ($fetch.ExitCode -ne 0) { throw "Fetch failed with exit code $($fetch.ExitCode): $($fetch.Output -join [Environment]::NewLine)" }

if ($Force) {
    $reset = Invoke-Git { git @('reset', '--hard', "origin/$branch") }
    if ($reset.ExitCode -ne 0) { throw "Force reset failed: $($reset.Output -join [Environment]::NewLine)" }
    $clean = Invoke-Git { git @('clean', '-fdx') }
    if ($clean.ExitCode -ne 0) { throw "Force clean failed: $($clean.Output -join [Environment]::NewLine)" }
    Restore-RemoteMissingFiles -Branch $branch
    Write-Host "Force-synced $branch from origin (reset --hard + clean -fdx)."
    return
}

$remoteBranch = Invoke-Git { git @('-c', $authCfg, '-c', $noCredHelper, 'ls-remote', '--exit-code', '--heads', 'origin', $branch) }
if ($remoteBranch.ExitCode -ne 0) {
    if ($apiOk) { throw "Remote branch $branch does not exist. Cannot pull." }
    throw "Remote branch $branch not visible to this token. Regenerate PAT with access to $owner/$repo."
}

$stashMsg = "auto-stash before pull $(Get-Date -Format o)"
$stash = Invoke-Git { git @('stash', 'push', '-m', $stashMsg) }
$stashed = $stash.ExitCode -eq 0 -and -not ($stash.Output -join ' ' -match 'No local changes to save')

$success = $false
$rebase = Invoke-Git { git @('-c', $authCfg, '-c', $noCredHelper, 'rebase', "origin/$branch") }
if ($rebase.ExitCode -eq 0) {
    $success = $true
} else {
    $files = Parse-OverwrittenFiles $rebase.Output
    if ($files.Count -gt 0) {
        Write-Host "Rebase blocked by untracked files:"
        $files | ForEach-Object { Write-Host " $_" }
    }
}

if (-not $success) {
    if ((Test-Path ".git/rebase-merge") -or (Test-Path ".git/rebase-apply")) { & git rebase --abort *>$null }
    Write-Host "Rebase failed; falling back to merge."
    $merge = Invoke-Git {
        git @('-c', $authCfg, '-c', $noCredHelper, 'merge', '-X', 'theirs', '--allow-unrelated-histories', '-m', "Auto-merge from origin/$branch", "origin/$branch")
    }
    if ($merge.ExitCode -ne 0) {
        if (Test-Path ".git/MERGE_HEAD") { & git merge --abort *>$null }
        $conflicts = (& git status --porcelain | Where-Object { $_ -match '^UU' } | ForEach-Object { $_.Substring(3) })
        $files = Parse-OverwrittenFiles $merge.Output
        $conflictMsg = if ($conflicts) { "Conflicted files: $($conflicts -join ', ')." } else { "Conflicts detected (see git status)." }
        $extraMsg = if ($files.Count -gt 0) { " Likely untracked local files would be overwritten. Run with -Force to discard them." } else { "" }
        throw "Merge failed due to conflicts.$extraMsg $conflictMsg Resolve, then retry."
    }
}

if ($stashed) {
    $pop = Invoke-Git { git @('stash', 'pop') }
    if ($pop.ExitCode -ne 0) {
        Write-Host "Stash pop conflicted; auto-resolving by preferring remote changes."
        $conflicts = (& git status --porcelain | Where-Object { $_ -match '^UU' } | ForEach-Object { $_.Substring(3) })
        foreach ($file in $conflicts) {
            $co = Invoke-Git { git @('checkout', '--ours', $file) }
            if ($co.ExitCode -ne 0) { Write-Warning "Failed to checkout --ours for ${file}: $($co.Output -join ' ')" }
            else { git add $file | Out-Null }
        }
        Invoke-Git { git @('stash', 'drop') } | Out-Null
    }
}

Restore-RemoteMissingFiles -Branch $branch
Write-Host "Pulled and synced $branch from origin"
