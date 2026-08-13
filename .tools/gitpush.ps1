param(
    [string]$Remote = '',
    [string]$Message,
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$env:GIT_TERMINAL_PROMPT = '0'

. (Join-Path $PSScriptRoot 'git-main-common.ps1')

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repoRoot

$config = Get-GitMainConfiguration -RepoRoot $repoRoot -Remote $Remote
$branch = Assert-GitMainContext -RepoRoot $repoRoot -ExpectedRemote $config.ExpectedRemote -DefaultBranch $config.DefaultBranch

Confirm-OrExit -Prompt "Commit reviewed changes and push '$branch' to origin?" -Approved:$Yes

$tokenInfo = Resolve-GitTokenInfo -RepoRoot $repoRoot -SecretsDir $config.SecretsDir -TokenFile $config.TokenFile
$token = Read-SafeGitToken $tokenInfo
$authState = Set-GitHubTokenAuthentication $token
$token = $null

try {
    $remoteProbeResult = Invoke-GitCapture @('ls-remote', '--exit-code', '--heads', 'origin', "refs/heads/$branch")
    $remoteProbe = $remoteProbeResult.Output | Out-String
    $remoteProbeExit = $remoteProbeResult.ExitCode
    $remoteHasBranch = $remoteProbeExit -eq 0
    if (-not $remoteHasBranch -and $remoteProbeExit -ne 2) {
        throw "Unable to query origin/$branch (git exit code $remoteProbeExit): $($remoteProbe.Trim())"
    }

    if ($remoteHasBranch) {
        & git fetch origin "refs/heads/${branch}:refs/remotes/origin/${branch}"
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to fetch origin/$branch."
        }
    }

    & git add -A
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to stage reviewed changes.'
    }
    Assert-NoOversizedTrackedFiles -RepoRoot $repoRoot

    & git diff --cached --check
    if ($LASTEXITCODE -ne 0) {
        throw 'Staged changes fail git diff --check. Fix whitespace errors before pushing.'
    }

    & git diff --cached --quiet
    $stagedChanges = $LASTEXITCODE -eq 1
    if (-not $stagedChanges -and $LASTEXITCODE -ne 0) {
        throw 'Unable to inspect staged changes.'
    }

    if ($stagedChanges) {
        if ([string]::IsNullOrWhiteSpace($Message)) {
            $Message = "chore: reviewed main update $(Get-Date -Format s)"
        }
        & git commit -m $Message
        if ($LASTEXITCODE -ne 0) {
            throw 'Commit failed. Fix the reported issue and retry.'
        }
    } else {
        Write-Host 'No reviewed changes to commit. Checking main synchronization only.'
    }

    Assert-WorkingTreeClean 'Safe main synchronization'

    if ($remoteHasBranch) {
        & git merge-base --is-ancestor "origin/$branch" HEAD
        $remoteIsAncestor = $LASTEXITCODE -eq 0
        if (-not $remoteIsAncestor -and $LASTEXITCODE -ne 1) {
            throw "Unable to compare local main with origin/$branch."
        }

        if (-not $remoteIsAncestor) {
            Write-Host "Rebasing reviewed local commits onto origin/$branch."
            & git rebase "origin/$branch"
            if ($LASTEXITCODE -ne 0) {
                & git rebase --abort 2>$null | Out-Null
                throw "Rebase onto origin/$branch conflicted and was aborted. Resolve the conflict manually, review the result, then retry."
            }
            Assert-WorkingTreeClean 'Post-rebase verification'
        }
    }

    & git push -u origin $branch
    if ($LASTEXITCODE -ne 0) {
        throw "Normal push to origin/$branch failed. The script never force-pushes; fetch, review, and resolve the divergence manually."
    }

    & git fetch origin "refs/heads/${branch}:refs/remotes/origin/${branch}"
    if ($LASTEXITCODE -ne 0) {
        throw "Push completed but post-push fetch of origin/$branch failed. Verify the remote before further work."
    }

    $localHead = Get-GitRevision 'HEAD'
    $remoteHead = Get-GitRevision "origin/$branch"
    if ($localHead -cne $remoteHead) {
        throw "Post-push alignment check failed: local HEAD $localHead differs from origin/$branch $remoteHead."
    }
    Assert-WorkingTreeClean 'Post-push verification'
    Write-Host "Pushed and verified main alignment at $localHead."
} finally {
    Restore-GitHubTokenAuthentication $authState
}
