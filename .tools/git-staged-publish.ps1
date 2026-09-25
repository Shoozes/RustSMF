function Assert-StagedPublishCandidate {
    param([string]$ExpectedBase, [string]$ExpectedTree, [string[]]$AllowedPaths)

    if ($ExpectedBase -cnotmatch '^[0-9a-f]{40}$' -or $ExpectedTree -cnotmatch '^[0-9a-f]{40}$' -or -not $AllowedPaths) {
        throw 'Staged publication requires full ExpectedBase/ExpectedTree IDs and explicit AllowedPaths.'
    }
    $allowed = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($path in $AllowedPaths) {
        if ([string]::IsNullOrWhiteSpace($path) -or $path.StartsWith('/') -or $path -match '[:\\*?\[\]]|(^|/)\.\.?(/|$)') {
            throw "AllowedPaths must contain literal repository-relative file paths: $path"
        }
        [void]$allowed.Add($path)
    }
    $baseType = Invoke-GitCapture @('cat-file', '-t', $ExpectedBase)
    $treeType = Invoke-GitCapture @('cat-file', '-t', $ExpectedTree)
    if ($baseType.ExitCode -ne 0 -or $baseType.Output -cne 'commit' -or $treeType.ExitCode -ne 0 -or $treeType.Output -cne 'tree') {
        throw 'ExpectedBase must identify a commit and ExpectedTree must identify a tree.'
    }
    $index = Invoke-GitCapture @('write-tree')
    if ($index.ExitCode -ne 0 -or $index.Output -cne $ExpectedTree) {
        throw 'Staged candidate tree changed or has unresolved entries. Review it again.'
    }
    $paths = Invoke-GitCapture @('diff-tree', '--no-commit-id', '--no-renames', '--name-only', '-r', '-z', $ExpectedBase, $ExpectedTree)
    if ($paths.ExitCode -ne 0) { throw 'Unable to inspect candidate paths.' }
    $changed = @(($paths.Output -join "`n") -split "`0" | Where-Object { $_ })
    if (-not $changed.Count) { throw 'The reviewed candidate is empty.' }
    foreach ($path in $changed) {
        if (-not $allowed.Contains($path)) { throw "Staged path is outside AllowedPaths: $path" }
    }
    $head = Get-GitRevision 'HEAD'
    if ($head -cne $ExpectedBase) {
        $parents = Invoke-GitCapture @('rev-list', '--parents', '-n', '1', 'HEAD')
        if ($parents.ExitCode -ne 0 -or ($parents.Output -join '') -cne "$head $ExpectedBase" -or (Get-GitRevision 'HEAD^{tree}') -cne $ExpectedTree) {
            throw 'HEAD is neither the reviewed base nor its exact single candidate commit. Review outgoing commits.'
        }
    }
    $check = Invoke-GitCapture @('diff', '--check', $ExpectedBase, $ExpectedTree)
    if ($check.ExitCode -ne 0) { throw 'Reviewed candidate fails git diff --check.' }
    $entries = Invoke-GitCapture @('ls-tree', '-r', '-l', $ExpectedTree)
    if ($entries.ExitCode -ne 0) { throw 'Unable to inspect staged blob sizes.' }
    foreach ($entry in $entries.Output) {
        if ($entry -match '^\d+ blob [0-9a-f]+\s+(\d+)\t' -and [int64]$Matches[1] -ge 95MB) {
            throw 'Staged blob exceeds the 95 MiB publication threshold.'
        }
    }
}

function Invoke-StagedMainPublish {
    param(
        [string]$RepoRoot, [string]$ExpectedRemote, [string]$Branch,
        [string]$ExpectedBase, [string]$ExpectedTree, [string[]]$AllowedPaths,
        [string]$Message
    )

    $null = Assert-GitMainContext -RepoRoot $RepoRoot -ExpectedRemote $ExpectedRemote -DefaultBranch $Branch
    Assert-StagedPublishCandidate -ExpectedBase $ExpectedBase -ExpectedTree $ExpectedTree -AllowedPaths $AllowedPaths
    & git fetch origin "refs/heads/${Branch}:refs/remotes/origin/${Branch}"
    if ($LASTEXITCODE -ne 0) { throw 'Unable to fetch the reviewed remote base.' }
    $head = Get-GitRevision 'HEAD'
    $remoteHead = Get-GitRevision "origin/$Branch"
    if ($remoteHead -cne $ExpectedBase -and -not ($head -cne $ExpectedBase -and $remoteHead -ceq $head)) {
        throw 'Remote advanced from the reviewed base. No commit or rebase was attempted; review the new base.'
    }
    Assert-StagedPublishCandidate -ExpectedBase $ExpectedBase -ExpectedTree $ExpectedTree -AllowedPaths $AllowedPaths
    if ($head -ceq $ExpectedBase) {
        if ([string]::IsNullOrWhiteSpace($Message)) { throw 'Staged publication requires a reviewed commit message.' }
        & git commit -m $Message
        if ($LASTEXITCODE -ne 0) { throw 'Candidate commit failed. Inspect HEAD and index before retrying.' }
        $head = Get-GitRevision 'HEAD'
    }
    Assert-StagedPublishCandidate -ExpectedBase $ExpectedBase -ExpectedTree $ExpectedTree -AllowedPaths $AllowedPaths
    if ((Get-GitRevision 'HEAD^{tree}') -cne $ExpectedTree) { throw 'Committed tree differs from the reviewed candidate; nothing was pushed.' }
    & git push -u origin $Branch
    if ($LASTEXITCODE -ne 0) {
        throw "Candidate commit $head exists locally, but push failed. Preserve it and retry with the same base/tree/paths after checking the remote; do not create another commit."
    }
    & git fetch origin "refs/heads/${Branch}:refs/remotes/origin/${Branch}"
    if ($LASTEXITCODE -ne 0) { throw "Push of $head completed, but remote verification failed. Check the remote before retrying." }
    if ((Get-GitRevision "origin/$Branch") -cne $head -or (Get-GitRevision 'HEAD') -cne $head) {
        throw "Post-push alignment check failed for candidate $head."
    }
    Assert-StagedPublishCandidate -ExpectedBase $ExpectedBase -ExpectedTree $ExpectedTree -AllowedPaths $AllowedPaths
    Write-Host "Pushed and verified selected main commit $head (tree $ExpectedTree). Unstaged owner work remains local."
}
