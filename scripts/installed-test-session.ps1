#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$Executable,
    [ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedSha256,
    [string]$OutputRoot,
    [ValidateRange(2,60)][int]$ProbeSeconds=15,
    [switch]$Worker,
    [string]$Configuration
)
$ErrorActionPreference='Stop'
# The worker uses Windows PowerShell for the OS UIA assemblies; it never owns a UI window.
if ($Worker) {
    $taskConfig=Get-Content -LiteralPath $Configuration -Raw | ConvertFrom-Json
    try {
    Start-Transcript -LiteralPath (Join-Path $taskConfig.output 'worker.log') | Out-Null
    Add-Type -Path $taskConfig.nativeLibrary
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    Add-Type -Path (Join-Path $taskConfig.scriptsRoot 'installed-test-uia.cs') -ReferencedAssemblies @('System.dll','UIAutomationClient','UIAutomationTypes','WindowsBase',$taskConfig.nativeLibrary)
    if ($taskConfig.desktop -notmatch '^RustSMF-test-[a-f0-9]{32}$' -or [InstalledTestNative]::InputName() -eq $taskConfig.desktop) { throw 'Worker refuses an input or unowned desktop before app launch.' }
    if ([InstalledTestNative]::DesktopName([InstalledTestNative]::GetThreadDesktop([InstalledTestNative]::GetCurrentThreadId())) -ne $taskConfig.desktop) { throw 'Worker desktop mismatch before app launch.' }
    $taskHasher=[Security.Cryptography.SHA256]::Create()
    try {$taskHash=[BitConverter]::ToString($taskHasher.ComputeHash([IO.File]::ReadAllBytes($taskConfig.executable))).Replace('-','').ToLowerInvariant()} finally {$taskHasher.Dispose()}
    if ($taskHash -ne $taskConfig.expectedSha256) { throw 'Installed executable changed before launch.' }
    $env:WEBVIEW2_USER_DATA_FOLDER=$taskConfig.profile
    foreach($taskVariable in @('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS','WEBVIEW2_BROWSER_EXECUTABLE_FOLDER','WEBVIEW2_WAIT_FOR_SCRIPT_DEBUGGER','WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER')) { [Environment]::SetEnvironmentVariable($taskVariable,$null,'Process') }
    $taskApp=[InstalledTestNative]::Launch($taskConfig.executable,('"'+$taskConfig.executable+'"'),('WinSta0\'+$taskConfig.desktop),(Split-Path -Parent $taskConfig.executable),[IntPtr]::Zero)
    try {
        $taskProcess=[Diagnostics.Process]::GetProcessById($taskApp.pid)
        $taskOwner=[ordered]@{pid=$taskApp.pid;creationTimeUtc=$taskProcess.StartTime.ToUniversalTime().ToString('o');executable=$taskConfig.executable;desktop=$taskConfig.desktop;sessionId=$taskProcess.SessionId;profile=$taskConfig.profile;shutdown='Outer kill-on-close job, including descendants.'}
        $taskOwner | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $taskConfig.output 'app-owner.json')
        $taskResult=[InstalledPickerProbe]::Run($taskApp.pid,$taskConfig.executable,$taskOwner.creationTimeUtc,$taskConfig.desktop,$taskConfig.jobName,$taskConfig.probeSeconds)
        $taskResult | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $taskConfig.output 'probe.json')
        if ($taskResult.appHwnd) { [InstalledTestNative]::PostMessageW([IntPtr]::new($taskResult.appHwnd),0x10,[IntPtr]::Zero,[IntPtr]::Zero) | Out-Null }
        if ($taskResult.status -ne 'passed') { exit 2 }
    } finally { if($taskProcess){$taskProcess.Dispose()};[InstalledTestNative]::CloseHandle($taskApp.process) | Out-Null }
    } catch { [ordered]@{stage='worker-bootstrap';error=$_.Exception.ToString()} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $taskConfig.output 'worker-error.json');exit 3 }
    exit 0
}
if (-not $IsWindows) { throw 'Installed session requires Windows.' }
foreach($taskValue in @($Executable,$ExpectedSha256,$OutputRoot)) { if ([string]::IsNullOrWhiteSpace($taskValue)) { throw 'Executable, ExpectedSha256 and OutputRoot are required.' } }
if (-not [IO.Path]::IsPathFullyQualified($Executable) -or -not [IO.Path]::IsPathFullyQualified($OutputRoot)) { throw 'Executable and OutputRoot must be absolute paths.' }
$Executable=(Resolve-Path -LiteralPath $Executable).Path
if ((Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedSha256.ToLowerInvariant()) { throw 'Installed executable hash mismatch.' }
if (Test-Path -LiteralPath $OutputRoot) { throw 'OutputRoot must be fresh; never reuse an installed test profile.' }
if ($Executable.Contains('"') -or $OutputRoot.Contains('"')) { throw 'Quoted paths are refused.' }
New-Item -ItemType Directory -Path $OutputRoot | Out-Null
$taskProfile=Join-Path $OutputRoot 'profile';New-Item -ItemType Directory -Path $taskProfile | Out-Null
$taskLibrary=Join-Path $OutputRoot 'native.dll'
$taskCompiler=Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $taskCompiler /nologo /target:library (('/out:'+$taskLibrary)) (Join-Path $PSScriptRoot 'installed-test-native.cs')
if ($LASTEXITCODE -ne 0) { throw 'Native probe compilation failed before any desktop/app launch.' }
Add-Type -Path $taskLibrary
$taskDesktopName='RustSMF-test-'+[Guid]::NewGuid().ToString('N')
$taskReceipt=[ordered]@{schema='rustsmf.installed-picker-session.v1';status='failed';stage='preflight';executable=$Executable;executableSha256=$ExpectedSha256.ToLowerInvariant();desktop=$taskDesktopName;sessionId=(Get-Process -Id $PID).SessionId;profile=$taskProfile;startedUtc=[DateTime]::UtcNow.ToString('o');inputDesktopSamples=0;inputDesktopChanged=$false;inputDesktopOwnedPickers=0;cleanup=$null;error=$null}
$taskDesktop=[IntPtr]::Zero;$taskJob=[IntPtr]::Zero;$taskWorker=$null;$taskInput=[IntPtr]::Zero
try {
    $taskReceipt.inputDesktopBefore=[InstalledTestNative]::InputName()
    $taskInput=[InstalledTestNative]::OpenInputDesktop(0,$false,0x41)
    if ($taskInput -eq [IntPtr]::Zero) { throw [InstalledTestNative]::Error('OpenInputDesktop') }
    $taskReceipt.stage='create-desktop';$taskDesktop=[InstalledTestNative]::CreateDesktopW($taskDesktopName,[IntPtr]::Zero,[IntPtr]::Zero,0,0x1ff,[IntPtr]::Zero)
    if ($taskDesktop -eq [IntPtr]::Zero) { throw [InstalledTestNative]::Error('CreateDesktopW') }
    $taskJob=[InstalledTestNative]::Job($taskDesktopName)
    $taskConfig=[ordered]@{desktop=$taskDesktopName;jobName=$taskDesktopName;executable=$Executable;expectedSha256=$ExpectedSha256.ToLowerInvariant();profile=$taskProfile;output=$OutputRoot;probeSeconds=$ProbeSeconds;nativeLibrary=$taskLibrary;scriptsRoot=$PSScriptRoot}
    $taskConfigPath=Join-Path $OutputRoot 'configuration.json';$taskConfig | ConvertTo-Json | Set-Content -Encoding utf8BOM -LiteralPath $taskConfigPath
    $taskShell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    # Windows PowerShell must parse the worker branch without a PS7 requirement.
    $taskWorkerScript=Join-Path $OutputRoot 'worker.ps1'
    ([IO.File]::ReadAllText($PSCommandPath).Replace('#Requires -Version 7.0','#Requires -Version 5.1')) | Set-Content -Encoding utf8BOM -LiteralPath $taskWorkerScript
    $taskCommand='"'+$taskShell+'" -NoProfile -NonInteractive -Mta -File "'+$taskWorkerScript+'" -Worker -Configuration "'+$taskConfigPath+'"'
    $taskReceipt.stage='worker';$taskWorker=[InstalledTestNative]::Launch($taskShell,$taskCommand,('WinSta0\'+$taskDesktopName),$OutputRoot,$taskJob)
    $taskProcess=Get-Process -Id $taskWorker.pid;$taskReceipt.worker=@{pid=$taskWorker.pid;createdUtc=$taskProcess.StartTime.ToUniversalTime().ToString('o');executable=$taskShell}
    $taskTimer=[Diagnostics.Stopwatch]::StartNew()
    while (-not $taskProcess.WaitForExit(50)) {
        $taskReceipt.inputDesktopSamples++
        if (Test-Path -LiteralPath (Join-Path $OutputRoot 'cancel')) { throw 'Owned session cancellation requested.' }
        if ([InstalledTestNative]::InputName() -ne $taskReceipt.inputDesktopBefore) { $taskReceipt.inputDesktopChanged=$true;throw 'Input desktop changed; stopping owned job.' }
        $taskOwnerPath=Join-Path $OutputRoot 'app-owner.json'
        if (Test-Path -LiteralPath $taskOwnerPath) {
            try { $taskAppOwner=Get-Content -LiteralPath $taskOwnerPath -Raw | ConvertFrom-Json } catch { $taskAppOwner=$null }
            if ($taskAppOwner) {
                $taskFound=[Collections.Generic.List[long]]::new()
                $taskCallback=[InstalledTestNative+EnumProc]{param($h,$d);if([InstalledTestNative]::Class($h) -eq '#32770' -and [InstalledTestNative]::WindowInJob($h,$taskJob)){$taskFound.Add($h.ToInt64())};return $true}
                if (-not [InstalledTestNative]::EnumDesktopWindows($taskInput,$taskCallback,[IntPtr]::Zero)) { throw [InstalledTestNative]::Error('EnumDesktopWindows/input') }
                if ($taskFound.Count) {$taskReceipt.inputDesktopOwnedPickers+=$taskFound.Count;throw 'Owned picker appeared on input desktop.'}
            }
        }
        if ($taskTimer.Elapsed.TotalSeconds -gt ($ProbeSeconds*3+35)) { throw 'Isolated worker timeout.' }
    }
    $taskReceipt.workerExitCode=[InstalledTestNative]::ExitCode($taskWorker.process)
    $taskReceipt.inputDesktopAfter=[InstalledTestNative]::InputName()
    if ($taskReceipt.inputDesktopAfter -ne $taskReceipt.inputDesktopBefore) { $taskReceipt.inputDesktopChanged=$true;throw 'Input desktop changed before release.' }
    if (Test-Path -LiteralPath (Join-Path $OutputRoot 'worker-error.json')) { $taskReceipt.workerError=Get-Content -LiteralPath (Join-Path $OutputRoot 'worker-error.json') -Raw | ConvertFrom-Json }
    $taskProbePath=Join-Path $OutputRoot 'probe.json'
    if (Test-Path -LiteralPath $taskProbePath) { $taskReceipt.probe=Get-Content -LiteralPath $taskProbePath -Raw | ConvertFrom-Json }
    if ($taskReceipt.workerExitCode -ne 0 -or -not $taskReceipt.probe -or $taskReceipt.probe.status -ne 'passed') { throw 'Isolated probe failed; see worker exit/probe stage. No active-desktop fallback.' }
    $taskReceipt.stage='complete';$taskReceipt.status='passed'
} catch { $taskReceipt.error=$_.Exception.ToString() }
finally {
    $taskCleanup=[ordered]@{jobTerminated=$true;activeJobProcesses=0;jobHandleClosed=$true;workerHandleClosed=$true;desktopClosed=$true;inputHandleClosed=$true;error=$null}
    if ($taskJob -ne [IntPtr]::Zero) {
        try {
            $taskCleanup.jobTerminated=[InstalledTestNative]::TerminateJobObject($taskJob,0)
            $taskRelease=[Diagnostics.Stopwatch]::StartNew();while([InstalledTestNative]::Active($taskJob) -gt 0 -and $taskRelease.Elapsed.TotalSeconds -lt 10){Start-Sleep -Milliseconds 50}
            $taskCleanup.activeJobProcesses=[InstalledTestNative]::Active($taskJob)
        } catch { $taskCleanup.error=$_.Exception.ToString();$taskCleanup.activeJobProcesses=-1 }
        finally { $taskCleanup.jobHandleClosed=[InstalledTestNative]::CloseHandle($taskJob) }
    }
    if ($taskWorker) {$taskCleanup.workerHandleClosed=[InstalledTestNative]::CloseHandle($taskWorker.process)}
    if ($taskProcess) { $taskProcess.Dispose() }
    if ($taskDesktop -ne [IntPtr]::Zero) {$taskCleanup.desktopClosed=[InstalledTestNative]::CloseDesktop($taskDesktop)}
    if ($taskInput -ne [IntPtr]::Zero) {$taskCleanup.inputHandleClosed=[InstalledTestNative]::CloseDesktop($taskInput)}
    $taskReceipt.cleanup=$taskCleanup;$taskReceipt.finishedUtc=[DateTime]::UtcNow.ToString('o')
    if ($taskCleanup.activeJobProcesses -ne 0 -or @($taskCleanup.jobHandleClosed,$taskCleanup.workerHandleClosed,$taskCleanup.desktopClosed,$taskCleanup.inputHandleClosed,$taskCleanup.jobTerminated) -contains $false) {$taskReceipt.status='failed'}
    $taskReceipt | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $OutputRoot 'receipt.json')
}
[ordered]@{status=$taskReceipt.status;stage=$taskReceipt.stage;receipt=(Join-Path $OutputRoot 'receipt.json');workerExit=$taskReceipt.workerExitCode;probeStage=$taskReceipt.probe.stage;cleanup=$taskReceipt.cleanup} | ConvertTo-Json -Compress -Depth 5
if ($taskReceipt.status -ne 'passed') { exit 1 }
