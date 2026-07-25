param (
    [Parameter(Position=0, Mandatory=$false, HelpMessage="Group name from summary_bank.json")]
    [string]$Group = "",
    [switch]$Verify
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCommand) {
    Write-Error "Node.js 22 or newer is required for context-bank tools."
    exit 1
}

Push-Location -LiteralPath $RepoRoot
try {
    if ($Verify) {
        & $NodeCommand.Source scripts/verify-context-bank.mjs
    } elseif ([string]::IsNullOrWhiteSpace($Group)) {
        & $NodeCommand.Source scripts/generate-context.mjs --out -
    } else {
        & $NodeCommand.Source scripts/generate-context.mjs --group $Group --out -
    }
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
