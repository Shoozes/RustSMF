function ConvertTo-NormalizedProcessPath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    if (-not [IO.Path]::IsPathFullyQualified($Path)) { return $null }
    try {
        return [IO.Path]::GetFullPath($Path).TrimEnd('\', '/').ToLowerInvariant()
    } catch { return $null }
}

function Test-RepoOwnedProcessCommandLine([string]$CommandLine, [string[]]$OwnedPaths) {
    if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $false }
    # Match Node's script argument, never an arbitrary argument or substring.
    $tokens = [regex]::Matches($CommandLine, '"[^"]*"|''[^'']*''|\S+')
    if ($tokens.Count -lt 2) { return $false }
    $executable = $tokens[0].Value.Trim('"', "'")
    if ([IO.Path]::GetFileName($executable) -notin @('node', 'node.exe')) { return $false }
    $scriptPath = ConvertTo-NormalizedProcessPath $tokens[1].Value.Trim('"', "'")
    if (-not $scriptPath) { return $false }
    foreach ($path in $OwnedPaths) {
        $candidate = ConvertTo-NormalizedProcessPath $path
        if ($candidate -and $scriptPath -eq $candidate) { return $true }
    }
    return $false
}
