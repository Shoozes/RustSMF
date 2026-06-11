# File: .tools/gitpush.ps1
param(
    [string]$Remote = "",
    [string]$Message,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"
$env:GIT_TERMINAL_PROMPT = "0"

function Read-FirstLine([string]$path) {
    if (!(Test-Path -LiteralPath $path)) { throw "Missing $path" }
    $line = (Get-Content -LiteralPath $path -TotalCount 1)
    $line = $line -replace ([string][char]0xFEFF),""
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

function Assert-NoOversizedTrackedFiles {
    param(
        [string]$RepoRoot,
        [int64]$LimitBytes = 95MB
    )

    $tracked = & git ls-files -z 2>$null
    if (-not $tracked) {
        return
    }

    $oversized = New-Object System.Collections.Generic.List[object]

    foreach ($path in ($tracked -split "`0" | Where-Object { $_ })) {
        $fullPath = Join-Path $RepoRoot ($path -replace '/', '\')
        if (-not (Test-Path -LiteralPath $fullPath)) {
            continue
        }

        $item = Get-Item -LiteralPath $fullPath -ErrorAction SilentlyContinue
        if ($null -eq $item -or $item.PSIsContainer) {
            continue
        }

        if ($item.Length -ge $LimitBytes) {
            [void]$oversized.Add([pscustomobject]@{
                Path = $path
                SizeMB = [math]::Round($item.Length / 1MB, 2)
            })
        }
    }

    if ($oversized.Count -gt 0) {
        $details = ($oversized | ForEach-Object { " - $($_.Path) [$($_.SizeMB) MB]" }) -join [Environment]::NewLine
        throw "Tracked files exceed the GitHub-safe size threshold (${LimitBytes} bytes). Remove them from git or ignore them before pushing:`n$details"
    }
}

function Get-WebStatusCode {
    param($ErrorRecord)
    try {
        if ($ErrorRecord.Exception.Response -and $ErrorRecord.Exception.Response.StatusCode) {
            return [int]$ErrorRecord.Exception.Response.StatusCode
        }
    } catch {}
    return $null
}

function Format-WebFailure {
    param(
        [string]$Action,
        $ErrorRecord
    )
    $status = Get-WebStatusCode $ErrorRecord
    $statusText = if ($null -ne $status) { " [$status]" } else { "" }
    return "$Action failed$statusText`: $($ErrorRecord.Exception.Message)"
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

Confirm-OrExit -Prompt "Proceed with git commit/sync/push?" -Expected "YES"

$tokenInfo = Resolve-TokenInfo -RepoRoot $RepoRoot -SecretsDir $secretsDir -TokenFile $tokenFile
$tokenPath = $tokenInfo.TokenPath
$tokenRel = $tokenInfo.TokenRel
$secretsDirRel = $tokenInfo.SecretsDirRel

$token = Read-FirstLine $tokenPath

if (!(Test-Path ".git")) {
    try { & git init -b main | Out-Null } catch { & git init | Out-Null; & git checkout -b main | Out-Null }
}

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

& git add -A | Out-Null
Assert-NoOversizedTrackedFiles -RepoRoot $RepoRoot
$pending = (& git status --porcelain | Out-String).Trim()
$didCommit = $false

if ([string]::IsNullOrWhiteSpace($pending)) {
    Write-Host "Nothing to commit. Proceeding to sync with remote."
} else {
    if (-not $Message) { $Message = "chore: update $(Get-Date -Format s)" }
    & git commit -m $Message
    if ($LASTEXITCODE -ne 0) { throw "Commit failed. Fix errors above and retry." }
    $didCommit = $true
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
    "User-Agent"           = "gitpush.ps1"
}

$authUser = $null
try {
    $authUser = Invoke-RestMethod -Method GET -Headers $ghHeaders -Uri "https://api.github.com/user" -TimeoutSec 30
} catch {
    $status = Get-WebStatusCode $_
    if ($status -eq 401) {
        throw "GitHub auth failed (401). The token at $tokenPath is invalid, expired, revoked, or not accepted by GitHub. Replace it with a fresh token and retry."
    }
    if ($status -eq 403) {
        throw "GitHub auth failed (403). The token at $tokenPath is valid but lacks required access for this repository or organization."
    }
    throw "$(Format-WebFailure -Action 'GitHub auth check' -ErrorRecord $_). Check network access to api.github.com, then retry."
}

$repoExists = $false
try {
    Invoke-RestMethod -Method GET -Headers $ghHeaders -Uri "https://api.github.com/repos/$owner/$repo" -TimeoutSec 30 | Out-Null
    $repoExists = $true
} catch {
    $status = Get-WebStatusCode $_
    if ($status -eq 404) {
        $repoExists = $false
    } else {
        throw "$(Format-WebFailure -Action "GitHub repo lookup $owner/$repo" -ErrorRecord $_)."
    }
}

if (-not $repoExists) {
    $ownerMeta = Invoke-RestMethod -Method GET -Uri "https://api.github.com/users/$owner" -TimeoutSec 30
    $isOrg = ($ownerMeta.type -eq "Organization")

    if (-not $isOrg -and $authUser.login -ne $owner) {
        throw "Token user '$($authUser.login)' does not match remote owner '$owner'. Use a token from '$owner' or change Remote."
    }

    $body = @{ name = $repo; private = $true } | ConvertTo-Json
    if ($isOrg) {
        Invoke-RestMethod -Method POST -Headers $ghHeaders -ContentType 'application/json' -Uri "https://api.github.com/orgs/$owner/repos" -Body $body -TimeoutSec 30 | Out-Null
    } else {
        Invoke-RestMethod -Method POST -Headers $ghHeaders -ContentType 'application/json' -Uri "https://api.github.com/user/repos" -Body $body -TimeoutSec 30 | Out-Null
    }
    Write-Host "Created repo $owner/$repo"
}

if ((Test-Path ".git/rebase-merge") -or (Test-Path ".git/rebase-apply")) { & git rebase --abort *>$null }
if (Test-Path ".git/MERGE_HEAD") { & git merge --abort *>$null }
if (Test-Path ".git/.MERGE_MSG.swp") { Remove-Item ".git/.MERGE_MSG.swp" -Force *>$null }

& git @('-c', $authCfg, '-c', $noCredHelper, 'fetch', 'origin') | Out-Null

$remoteHasBranch = $false
& git -c $authCfg -c $noCredHelper ls-remote --exit-code --heads origin $branch *>$null
if ($LASTEXITCODE -eq 0) { $remoteHasBranch = $true }

$syncMsg = if ($didCommit -and $Message) { $Message } else { "no new commit" }

if (-not $remoteHasBranch) {
    & git @('-c', $authCfg, '-c', $noCredHelper, 'push', '-u', 'origin', $branch)
    if ($LASTEXITCODE -ne 0) { throw "Initial push failed. Check token/permissions/remote." }
    Write-Host "Pushed initial $branch to origin (message: $syncMsg)"
} else {
    & git @('-c', $authCfg, '-c', $noCredHelper, 'rebase', '--autostash', "origin/$branch")
    if ($LASTEXITCODE -ne 0) {
        if ((Test-Path ".git/rebase-merge") -or (Test-Path ".git/rebase-apply")) { & git rebase --abort *>$null }
        Write-Host "Rebase failed; falling back to merge."

        & git @('-c', $authCfg, '-c', $noCredHelper, 'merge', '-X', 'ours', '--allow-unrelated-histories', '-m', "Auto-merge from origin/$branch", "origin/$branch")
        if ($LASTEXITCODE -ne 0) {
            # -X ours can leave add/add conflicts unresolved in unrelated histories.
            # Resolve them by keeping local versions, then finish the merge.
            $conflicts = (& git status --porcelain | Where-Object { $_ -match '^(UU|AA|AU|UA)' } | ForEach-Object { $_.Substring(3).Trim() })
            if ($conflicts -and (Test-Path ".git/MERGE_HEAD")) {
                Write-Host "Resolving $($conflicts.Count) residual conflict(s) in favor of local."
                foreach ($cf in $conflicts) { & git checkout --ours -- $cf }
                & git add -A | Out-Null
                & git @('-c', "user.name=$($authUser.login)", '-c', "user.email=$($authUser.login)@users.noreply.github.com", 'commit', '--no-edit')
                if ($LASTEXITCODE -ne 0) { throw "Could not finalize merge commit after resolving conflicts." }
            } else {
                if (Test-Path ".git/MERGE_HEAD") { & git merge --abort *>$null }
                throw "Merge failed with unresolvable conflicts. Check git status and resolve manually."
            }
        }
    }

    & git @('-c', $authCfg, '-c', $noCredHelper, 'push', '-u', 'origin', $branch, '--force')
    if ($LASTEXITCODE -ne 0) { throw "Push failed after sync. Check branch protections or permissions." }
    Write-Host "Synced $branch with origin (message: $syncMsg)"
}
