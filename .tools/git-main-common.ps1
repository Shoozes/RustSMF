function Read-FirstLine([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Missing $Path"
    }

    $line = Get-Content -LiteralPath $Path -TotalCount 1
    $line = $line -replace ([string][char]0xFEFF), ""
    $line = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($line)) {
        throw "$Path is empty"
    }
    return $line
}

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    try {
        $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($raw)) {
            return $null
        }
        return $raw | ConvertFrom-Json
    } catch {
        throw "Failed to read JSON: $Path"
    }
}

function Invoke-GitCapture {
    param([string[]]$Arguments)

    $output = @(& git @Arguments 2>$null)
    $exitCode = $LASTEXITCODE
    return [pscustomobject]@{
        Output   = $output
        ExitCode = $exitCode
    }
}

function Get-RelPathPosix {
    param(
        [string]$BaseDir,
        [string]$FullPath
    )

    $base = (Resolve-Path -LiteralPath $BaseDir).Path.TrimEnd('\')
    $full = (Resolve-Path -LiteralPath $FullPath).Path
    $isWithinBase = $full.Length -gt $base.Length -and
        $full.Substring(0, $base.Length).Equals($base, [System.StringComparison]::OrdinalIgnoreCase) -and
        $full[$base.Length] -eq '\'

    if ($isWithinBase) {
        return ($full.Substring($base.Length + 1) -replace '\\', '/')
    }

    throw "Path must stay inside the repository: $FullPath"
}

function Get-GitMainConfiguration {
    param(
        [string]$RepoRoot,
        [string]$Remote
    )

    $projectPath = Join-Path $RepoRoot '.tools\project.json'
    $project = Read-JsonFile $projectPath
    if ($null -eq $project -or $null -eq $project.git) {
        throw "Missing required git configuration in $projectPath"
    }

    $expectedRemote = ([string]$project.git.remote).Trim()
    $defaultBranch = ([string]$project.git.defaultBranch).Trim()
    if ([string]::IsNullOrWhiteSpace($expectedRemote) -or [string]::IsNullOrWhiteSpace($defaultBranch)) {
        throw "project.json must define git.remote and git.defaultBranch"
    }

    if (-not [string]::IsNullOrWhiteSpace($Remote) -and $Remote -cne $expectedRemote) {
        throw "Remote override does not match the configured origin. Expected '$expectedRemote'."
    }

    $secretsDir = '.tools/.secrets'
    $tokenFile = 'gt.txt'
    if ($null -ne $project.paths) {
        if (-not [string]::IsNullOrWhiteSpace([string]$project.paths.secretsDir)) {
            $secretsDir = [string]$project.paths.secretsDir
        }
        if (-not [string]::IsNullOrWhiteSpace([string]$project.paths.tokenFile)) {
            $tokenFile = [string]$project.paths.tokenFile
        }
    }

    return [pscustomobject]@{
        ExpectedRemote = $expectedRemote
        DefaultBranch  = $defaultBranch
        SecretsDir     = $secretsDir
        TokenFile      = $tokenFile
    }
}

function Confirm-OrExit {
    param(
        [string]$Prompt,
        [string]$Expected = 'YES',
        [switch]$Approved
    )

    if ($Approved) {
        return
    }

    $answer = Read-Host "$Prompt Type $Expected to continue"
    if ($answer -cne $Expected) {
        Write-Host 'Canceled.'
        exit 0
    }
}

function Assert-GitMainContext {
    param(
        [string]$RepoRoot,
        [string]$ExpectedRemote,
        [string]$DefaultBranch
    )

    $insideResult = Invoke-GitCapture @('rev-parse', '--is-inside-work-tree')
    $inside = (($insideResult.Output | Select-Object -First 1) | Out-String).Trim()
    if ($insideResult.ExitCode -ne 0 -or $inside -cne 'true') {
        throw 'This command must run inside an existing Git worktree. It will not initialize a repository.'
    }

    $rootResult = Invoke-GitCapture @('rev-parse', '--show-toplevel')
    if ($rootResult.ExitCode -ne 0) {
        throw 'Unable to determine the Git worktree root.'
    }
    $actualRoot = (($rootResult.Output | Select-Object -First 1) | Out-String).Trim()
    if (-not [string]::IsNullOrWhiteSpace($actualRoot)) {
        $actualRoot = (Resolve-Path -LiteralPath $actualRoot).Path
    }
    $expectedRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
    if (-not [string]::Equals($actualRoot, $expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Git worktree root mismatch. Expected '$expectedRoot', found '$actualRoot'."
    }

    $branchResult = Invoke-GitCapture @('branch', '--show-current')
    if ($branchResult.ExitCode -ne 0) {
        throw 'Unable to determine the current Git branch.'
    }
    $branch = (($branchResult.Output | Select-Object -First 1) | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($branch)) {
        throw 'Detached HEAD is not supported. Switch to the configured main branch first.'
    }
    if ($branch -cne $DefaultBranch) {
        throw "This command only operates on '$DefaultBranch'; current branch is '$branch'."
    }

    $originResult = Invoke-GitCapture @('remote', 'get-url', 'origin')
    $originUrl = (($originResult.Output | Select-Object -First 1) | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($originUrl)) {
        throw "Missing origin remote. Configure it explicitly as '$ExpectedRemote' before syncing."
    }
    if ($originUrl -cne $ExpectedRemote) {
        throw "Origin mismatch. Expected '$ExpectedRemote', found '$originUrl'. The script will not rewrite remotes."
    }

    foreach ($operation in @('rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD')) {
        $operationResult = Invoke-GitCapture @('rev-parse', '--git-path', $operation)
        if ($operationResult.ExitCode -ne 0) {
            throw "Unable to inspect Git operation state for $operation."
        }
        $operationPath = (($operationResult.Output | Select-Object -First 1) | Out-String).Trim()
        if (-not [string]::IsNullOrWhiteSpace($operationPath) -and (Test-Path -LiteralPath $operationPath)) {
            throw "An active Git $operation operation exists. Resolve or abort it manually before syncing."
        }
    }

    $conflictResult = Invoke-GitCapture @('diff', '--name-only', '--diff-filter=U')
    if ($conflictResult.ExitCode -ne 0) {
        throw 'Unable to inspect unresolved Git conflicts.'
    }
    $conflicts = @($conflictResult.Output | Where-Object { $_ })
    if ($conflicts.Count -gt 0) {
        throw "Unresolved Git conflicts exist: $($conflicts -join ', '). Resolve them manually before syncing."
    }

    return $branch
}

function Resolve-GitTokenInfo {
    param(
        [string]$RepoRoot,
        [string]$SecretsDir,
        [string]$TokenFile
    )

    $candidates = @(
        (Join-Path $RepoRoot (Join-Path $SecretsDir $TokenFile)),
        (Join-Path $RepoRoot (Join-Path '.tools/.secrets' $TokenFile)),
        (Join-Path $RepoRoot (Join-Path '.secrets' $TokenFile))
    ) | Select-Object -Unique

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return [pscustomobject]@{
                TokenPath = $candidate
                TokenRel  = Get-RelPathPosix -BaseDir $RepoRoot -FullPath $candidate
            }
        }
    }

    throw "Missing token file. Expected $TokenFile under $SecretsDir or a documented fallback secret directory."
}

function Read-SafeGitToken {
    param([pscustomobject]$TokenInfo)

    & git check-ignore -q -- $TokenInfo.TokenRel 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Token path '$($TokenInfo.TokenRel)' is not ignored. Add an explicit local ignore rule before syncing."
    }

    & git ls-files --error-unmatch -- $TokenInfo.TokenRel *> $null
    if ($LASTEXITCODE -eq 0) {
        throw "Token path '$($TokenInfo.TokenRel)' is tracked. Remove it from version control manually before syncing."
    }
    if ($LASTEXITCODE -ne 1) {
        throw "Unable to verify whether '$($TokenInfo.TokenRel)' is tracked."
    }

    return Read-FirstLine $TokenInfo.TokenPath
}

function Set-GitHubTokenAuthentication {
    param([string]$Token)

    $names = @(
        'GIT_CONFIG_COUNT',
        'GIT_CONFIG_KEY_0',
        'GIT_CONFIG_VALUE_0',
        'GIT_CONFIG_KEY_1',
        'GIT_CONFIG_VALUE_1'
    )
    $previous = @{}
    foreach ($name in $names) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, [EnvironmentVariableTarget]::Process)
    }

    $pair = "x-access-token:$Token"
    $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
    $pair = $null
    $Token = $null

    $env:GIT_CONFIG_COUNT = '2'
    $env:GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader'
    $env:GIT_CONFIG_VALUE_0 = "Authorization: Basic $basic"
    $env:GIT_CONFIG_KEY_1 = 'credential.helper'
    $env:GIT_CONFIG_VALUE_1 = ''
    $basic = $null

    return [pscustomobject]@{ Previous = $previous }
}

function Restore-GitHubTokenAuthentication {
    param([pscustomobject]$State)

    foreach ($name in $State.Previous.Keys) {
        $value = $State.Previous[$name]
        if ($null -eq $value) {
            Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
        } else {
            Set-Item -LiteralPath "Env:$name" -Value $value
        }
    }
}

function Assert-WorkingTreeClean([string]$Purpose) {
    $statusResult = Invoke-GitCapture @('status', '--porcelain=v1')
    if ($statusResult.ExitCode -ne 0) {
        throw 'Unable to read Git working-tree status.'
    }
    $status = ($statusResult.Output | Out-String).Trim()
    if (-not [string]::IsNullOrWhiteSpace($status)) {
        throw "$Purpose requires a clean working tree. Review, commit, stash, or discard these changes manually:`n$status"
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
        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
            continue
        }

        $item = Get-Item -LiteralPath $fullPath
        if ($item.Length -ge $LimitBytes) {
            [void]$oversized.Add([pscustomobject]@{
                Path   = $path
                SizeMB = [math]::Round($item.Length / 1MB, 2)
            })
        }
    }

    if ($oversized.Count -gt 0) {
        $details = ($oversized | ForEach-Object { " - $($_.Path) [$($_.SizeMB) MB]" }) -join [Environment]::NewLine
        throw "Tracked files exceed the 95 MiB publication threshold. Remove or ignore them before pushing:`n$details"
    }
}

function Get-GitRevision([string]$Revision) {
    $revisionResult = Invoke-GitCapture @('rev-parse', $Revision)
    $value = (($revisionResult.Output | Select-Object -First 1) | Out-String).Trim()
    if ($revisionResult.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($value)) {
        throw "Unable to resolve Git revision '$Revision'."
    }
    return $value
}
