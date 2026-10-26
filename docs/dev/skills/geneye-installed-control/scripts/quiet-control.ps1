param(
    [Parameter(Mandatory)][ValidateSet('Invoke', 'Expand', 'Collapse', 'Toggle', 'Select', 'Names', 'DialogPath', 'DialogSave', 'DialogCancel')][string]$Action,
    [Parameter(Mandatory)][string]$OwnerReceipt,
    [long]$AppHwnd,
    [long]$DialogHwnd,
    [string]$Name,
    [string]$Path,
    [switch]$AllowExistingSave,
    [string]$Match = '.+'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class QuietInstalledWin32 {
    public delegate bool EnumProc(IntPtr handle, IntPtr data);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr handle, StringBuilder value, int length);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr handle, uint message, IntPtr wparam, string value);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr handle, uint message, IntPtr wparam, IntPtr lparam);
}
'@

$owner = Get-Content -LiteralPath $OwnerReceipt -Raw | ConvertFrom-Json -DateKind String
$process = Get-Process -Id $owner.pid -ErrorAction Stop
if (-not [string]::Equals([IO.Path]::GetFullPath($process.Path), [IO.Path]::GetFullPath($owner.executable), [StringComparison]::OrdinalIgnoreCase) -or
    $process.StartTime.ToUniversalTime().ToString('o') -ne $owner.creationTimeUtc) {
    throw 'Installed process identity changed.'
}

function Assert-WindowOwner([IntPtr]$handle) {
    if ($handle -eq [IntPtr]::Zero) { throw 'Missing window handle.' }
    [uint32]$windowPid = 0
    [QuietInstalledWin32]::GetWindowThreadProcessId($handle, [ref]$windowPid) | Out-Null
    if ($windowPid -ne $owner.pid) { throw 'Window PID does not match the owned app.' }
}

function Find-DialogControl([System.Windows.Automation.AutomationElement]$root, [string]$className, [string]$automationId) {
    $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $matches = @(
        for ($i = 0; $i -lt $all.Count; $i++) {
            $element = $all.Item($i)
            if ($element.Current.ClassName -eq $className -and $element.Current.AutomationId -eq $automationId) { $element }
        }
    )
    if ($matches.Count -ne 1) { throw "Expected one $className/$automationId dialog control; found $($matches.Count)." }
    $handle = [IntPtr]::new($matches[0].Current.NativeWindowHandle)
    Assert-WindowOwner $handle
    return $handle
}

if ($Action -eq 'DialogPath' -or $Action -eq 'DialogSave' -or $Action -eq 'DialogCancel') {
    $dialog = [IntPtr]::new($DialogHwnd)
    Assert-WindowOwner $dialog
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($dialog)
    if ($root.Current.ClassName -ne '#32770') { throw 'Target is not a Windows common dialog.' }
    if ($Action -eq 'DialogPath' -or $Action -eq 'DialogSave') {
        if ($Action -eq 'DialogPath' -and -not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'Selected input file is absent.' }
        if ($Action -eq 'DialogSave' -and (((Test-Path -LiteralPath $Path) -and -not $AllowExistingSave) -or -not (Test-Path -LiteralPath (Split-Path -Parent $Path) -PathType Container))) { throw 'Save output exists or parent is absent.' }
        $edit = Find-DialogControl $root 'Edit' $(if ($Action -eq 'DialogSave') { '1001' } else { '1148' })
        $button = Find-DialogControl $root 'Button' '1'
        [QuietInstalledWin32]::SendMessage($edit, 12, [IntPtr]::Zero, [IO.Path]::GetFullPath($Path)) | Out-Null
        [QuietInstalledWin32]::SendMessage($button, 245, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    } else {
        $button = Find-DialogControl $root 'Button' '2'
        [QuietInstalledWin32]::SendMessage($button, 245, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    }
    [pscustomobject]@{ action = $Action; dialogHwnd = $DialogHwnd; pid = $owner.pid; sent = $true } | ConvertTo-Json -Compress
    return
}

$app = [IntPtr]::new($AppHwnd)
Assert-WindowOwner $app
$renderers = [Collections.Generic.List[IntPtr]]::new()
$callback = [QuietInstalledWin32+EnumProc]{
    param($handle, $data)
    $class = [Text.StringBuilder]::new(128)
    [QuietInstalledWin32]::GetClassName($handle, $class, 128) | Out-Null
    if ($class.ToString() -eq 'Chrome_RenderWidgetHostHWND') { $renderers.Add($handle) }
    return $true
}
[QuietInstalledWin32]::EnumChildWindows($app, $callback, [IntPtr]::Zero) | Out-Null
if ($renderers.Count -ne 1) { throw "Expected one WebView renderer; found $($renderers.Count)." }
$root = [System.Windows.Automation.AutomationElement]::FromHandle($renderers[0])
if ($Action -eq 'Names') {
    $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $names = @(
        for ($i = 0; $i -lt $all.Count; $i++) {
            $element = $all.Item($i)
            if ($element.Current.Name -match $Match) { $element.Current.Name }
        }
    )
    [pscustomobject]@{ action = $Action; appHwnd = $AppHwnd; rendererHwnd = $renderers[0].ToInt64(); names = @($names | Select-Object -Unique) } | ConvertTo-Json -Compress
    return
}

if (-not $Name) { throw 'The control action requires a name.' }
$control = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Name))
if (-not $control -or -not $control.Current.IsEnabled) { throw "Control $Name is absent or disabled." }
if ($Action -eq 'Select') {
    $pattern = [System.Windows.Automation.SelectionItemPattern]$control.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
    $pattern.Select()
} elseif ($Action -eq 'Toggle') {
    $pattern = [System.Windows.Automation.TogglePattern]$control.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
    $pattern.Toggle()
} elseif ($Action -eq 'Expand' -or $Action -eq 'Collapse') {
    $pattern = [System.Windows.Automation.ExpandCollapsePattern]$control.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)
    if ($Action -eq 'Expand') { $pattern.Expand() } else { $pattern.Collapse() }
} else {
    $pattern = [System.Windows.Automation.InvokePattern]$control.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $pattern.Invoke()
}
[pscustomobject]@{ action = $Action; name = $Name; appHwnd = $AppHwnd; rendererHwnd = $renderers[0].ToInt64(); pid = $owner.pid; executed = $true } | ConvertTo-Json -Compress
