param (
    [Parameter(Position=0, Mandatory=$false, HelpMessage="Group name from summary_bank.json")]
    [string]$Group = ""
)

if ([string]::IsNullOrWhiteSpace($Group)) {
    python .tools\_gen_struct.py --out -
} else {
    python .tools\_gen_struct.py --group $Group --out -
}
