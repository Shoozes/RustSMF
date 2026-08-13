param(
    [string]$Remote = '',
    [switch]$Force,
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$env:GIT_TERMINAL_PROMPT = '0'

. (Join-Path $PSScriptRoot 'git-main-common.ps1')

if ($Force) {
    throw 'Force synchronization is intentionally unsupported. Review and resolve local state manually.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repoRoot

$config = Get-GitMainConfiguration -RepoRoot $repoRoot -Remote $Remote
$branch = Assert-GitMainContext -RepoRoot $repoRoot -ExpectedRemote $config.ExpectedRemote -DefaultBranch $config.DefaultBranch
Assert-WorkingTreeClean 'Safe pull'

Confirm-OrExit -Prompt "Fast-forward '$branch' from origin when possible?" -Approved:$Yes

$tokenInfo = Resolve-GitTokenInfo -RepoRoot $repoRoot -SecretsDir $config.SecretsDir -TokenFile $config.TokenFile
$token = Read-SafeGitToken $tokenInfo
$authState = Set-GitHubTokenAuthentication $token
$token = $null

try {
    $remoteProbeResult = Invoke-GitCapture @('ls-remote', '--exit-code', '--heads', 'origin', "refs/heads/$branch")
    if ($remoteProbeResult.ExitCode -ne 0) {
        throw "origin/$branch is not available to this configured remote."
    }

    & git fetch origin "refs/heads/${branch}:refs/remotes/origin/${branch}"
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to fetch origin/$branch."
    }

    $localHead = Get-GitRevision 'HEAD'
    $remoteHead = Get-GitRevision "origin/$branch"
    if ($localHead -ceq $remoteHead) {
        Write-Host "Local $branch already matches origin/$branch at $localHead."
        return
    }

    & git merge-base --is-ancestor HEAD "origin/$branch"
    $localIsAncestor = $LASTEXITCODE -eq 0
    if ($localIsAncestor) {
        & git merge --ff-only "origin/$branch"
        if ($LASTEXITCODE -ne 0) {
            throw "Fast-forward from origin/$branch failed. Resolve the reported Git state manually."
        }
        Assert-WorkingTreeClean 'Post-pull verification'
        $updatedHead = Get-GitRevision 'HEAD'
        if ($updatedHead -cne (Get-GitRevision "origin/$branch")) {
            throw "Post-pull alignment check failed for origin/$branch."
        }
        Write-Host "Fast-forwarded $branch to $updatedHead."
        return
    }

    & git merge-base --is-ancestor "origin/$branch" HEAD
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Local $branch is ahead of origin/$branch. Review it, then use the reviewed push command."
        return
    }

    throw "Local $branch and origin/$branch diverged. No merge, rebase, reset, stash, or conflict resolution was performed; review and resolve the divergence manually."
} finally {
    Restore-GitHubTokenAuthentication $authState
}
