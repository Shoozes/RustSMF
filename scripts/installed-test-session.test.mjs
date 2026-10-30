import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..'),script=join(root,'scripts/installed-test-session.ps1');
const windows=process.platform==='win32';
const run=args=>spawnSync('pwsh',['-NoProfile','-File',script,...args,'-ProtectedRecoveryRoot',join(pathParent(args),'sentinel-recovery')],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60_000});
function pathParent(args){return resolve(args[args.indexOf('-OutputRoot')+1],'..');}
const neutralApp=String.raw`class Fixture { static void Main(string[] args){var i=System.Array.IndexOf(args,"--profile-dir");var root=System.IO.Path.GetFullPath(args[i+1]);var native=System.IO.Path.Combine(root,"native","rustsmf-recovery");var web=System.IO.Path.Combine(root,"webview");System.IO.Directory.CreateDirectory(native);System.IO.Directory.CreateDirectory(web);var session=new {schema="rustsmf.profile-session.v1",pid=System.Diagnostics.Process.GetCurrentProcess().Id,root=root,nativeRecovery=native,webview=web};System.IO.File.WriteAllText(System.IO.Path.Combine(root,"rustsmf-profile-session.json"),new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(session));System.Threading.Thread.Sleep(120000);} }`;
function fixture(t){const path=mkdtempSync(join(tmpdir(),'rustsmf-desktop-é space-'));t.after(()=>{assert.ok(resolve(path).startsWith(resolve(tmpdir())+'\\'));rmSync(path,{recursive:true,force:true});});return path;}
test('installed probe retains a dedicated MTA worker and refuses takeover APIs',()=>{
 const ps=readFileSync(script,'utf8'),native=readFileSync(join(root,'scripts/installed-test-native.cs'),'utf8'),uia=readFileSync(join(root,'scripts/installed-test-uia.cs'),'utf8');
 assert.match(uia,/SetApartmentState\(ApartmentState.MTA\)/);
 assert.match(native,/AssignProcessToJobObject/);assert.match(native,/0x2000/);
 assert.doesNotMatch(ps+native+uia,/SwitchDesktop\s*\(|SetCursorPos\s*\(|SendInput\s*\(|mouse_event\s*\(|ExecutionPolicy Bypass/);
 assert.match(uia,/Own\(cancelHandle,jobName,desktop\)/);
 assert.match(ps,/InputName\(\) -ne \$taskReceipt.inputDesktopBefore/);
 assert.doesNotMatch(ps,/PostMessageW\(/,'Final shutdown must use the owned job, not a historical HWND.');
});
test('late UIA completion cannot turn a timeout verdict into success',{skip:!windows},t=>{
 const path=fixture(t),probe=join(path,'timeout.ps1');
 writeFileSync(probe,'\ufeff'+String.raw`
param([string]$Scripts,[string]$Output)
$ErrorActionPreference='Stop'
$native=Join-Path $Output 'native.dll';$uia=Join-Path $Output 'uia.dll'
Add-Type -Path (Join-Path $Scripts 'installed-test-native.cs') -OutputAssembly $native
Add-Type -Path $native
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -Path @((Join-Path $Scripts 'installed-test-uia.cs'),(Join-Path $Scripts 'installed-test-dialog.cs'),(Join-Path $Scripts 'installed-test-queue.cs')) -ReferencedAssemblies @('System.dll','UIAutomationClient','UIAutomationTypes','WindowsBase',$native) -OutputAssembly $uia
Add-Type -Path $uia
Add-Type -ReferencedAssemblies @($uia) -TypeDefinition @'
using System;using System.Threading;
public static class LateCompletionTest {
 public static bool Check(){var result=new InstalledPickerResult();var worker=new Thread(()=>{Thread.Sleep(100);result.status="passed";});worker.Start();var verdict=InstalledPickerProbe.Await(worker,result,1);worker.Join();if(Object.ReferenceEquals(verdict,result)||verdict.status!="failed"||verdict.stage!="uia-worker-timeout"||result.status!="passed")throw new Exception("Late result changed the timeout verdict.");return true;}
}
'@
if(-not [LateCompletionTest]::Check()){throw 'Timeout result failed.'}
Write-Output 'TIMEOUT-VERDICT-PRESERVED'
`);
 const ps=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const r=spawnSync(ps,['-NoProfile','-NonInteractive','-File',probe,'-Scripts',join(root,'scripts'),'-Output',path],{encoding:'utf8',windowsHide:true,timeout:30_000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/TIMEOUT-VERDICT-PRESERVED/);
});
test('wrong executable identity and reused output fail before launch',{skip:!windows},t=>{
 const path=fixture(t),output=join(path,'out'),exe=process.execPath;
 const bad=run(['-Executable',exe,'-ExpectedSha256','0'.repeat(64),'-OutputRoot',output]);
 assert.notEqual(bad.status,0);assert.match(bad.stderr,/hash mismatch/);assert.equal(existsSync(output),false);
 const sha=createHash('sha256').update(readFileSync(exe)).digest('hex');
 const reused=run(['-Executable',exe,'-ExpectedSha256',sha,'-OutputRoot',path]);
 assert.notEqual(reused.status,0);assert.match(reused.stderr,/must be fresh/);
});
test('real isolated worker refuses a rendererless app and releases its job and desktop',{skip:!windows},t=>{
 const path=fixture(t),source=join(path,'fixture.cs'),exe=join(path,'fixture.exe'),output=join(path,'probe');
 writeFileSync(source,neutralApp);
 const compiler=join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const build=spawnSync(compiler,['/nologo','/target:exe','/r:System.Web.Extensions.dll','/out:'+exe,source],{encoding:'utf8',windowsHide:true});
 assert.equal(build.status,0,build.stdout+build.stderr);
 const sha=createHash('sha256').update(readFileSync(exe)).digest('hex');
 const result=run(['-Executable',exe,'-ExpectedSha256',sha,'-OutputRoot',output,'-ProbeSeconds','2']);
 assert.equal(result.status,1,result.stdout+result.stderr);
 assert.ok(existsSync(join(output,'receipt.json')),result.stdout+result.stderr);
 const receipt=JSON.parse(readFileSync(join(output,'receipt.json'),'utf8').replace(/^\uFEFF/,''));
 assert.ok(receipt.probe,JSON.stringify(receipt));
 assert.equal(receipt.probe.stage,'renderer',JSON.stringify(receipt));assert.equal(receipt.probe.pickerInvoked,false);
 assert.equal(receipt.inputDesktopChanged,false);assert.equal(receipt.inputDesktopOwnedPickers,0);
 assert.equal(receipt.cleanup.activeJobProcesses,0);assert.equal(receipt.cleanup.desktopClosed,true);
 assert.equal(receipt.cleanup.workerHandleClosed,true);assert.equal(receipt.cleanup.jobTerminated,true);
});

test('an unsupported executable is stopped before UIA and preserves native recovery sentinel bytes',{skip:!windows},t=>{
 const path=fixture(t),source=join(path,'fixture.cs'),exe=join(path,'fixture.exe'),output=join(path,'probe'),sentinel=join(path,'sentinel-recovery');
 mkdirSync(sentinel);writeFileSync(join(sentinel,'rustsmf-autosave.rsproj'),'owned preservation sentinel');
 writeFileSync(source,'class Fixture {static void Main(){System.Threading.Thread.Sleep(120000);}}');
 const build=spawnSync(join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/out:'+exe,source],{encoding:'utf8',windowsHide:true});
 assert.equal(build.status,0,build.stdout+build.stderr);
 const sha=createHash('sha256').update(readFileSync(exe)).digest('hex');
 const result=run(['-Executable',exe,'-ExpectedSha256',sha,'-OutputRoot',output,'-ProbeSeconds','2']);
 assert.equal(result.status,1,result.stdout+result.stderr);
 const r=JSON.parse(readFileSync(join(output,'receipt.json'),'utf8'));
 assert.match(r.workerError.error,/Native profile attestation missing or foreign/);assert.equal(r.probe,undefined);
 assert.equal(r.protectedRecovery.unchanged,true);assert.equal(r.cleanup.activeJobProcesses,0);
 assert.equal(readFileSync(join(output,'protected-recovery-before','rustsmf-autosave.rsproj'),'utf8'),'owned preservation sentinel');
 assert.equal(readFileSync(join(sentinel,'rustsmf-autosave.rsproj'),'utf8'),'owned preservation sentinel');
});
test('cancellation releases the exact isolated job without a picker',{skip:!windows},async t=>{
 const path=fixture(t),source=join(path,'fixture.cs'),exe=join(path,'fixture.exe'),output=join(path,'cancel-probe');
 writeFileSync(source,neutralApp);
 const build=spawnSync(join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/r:System.Web.Extensions.dll','/out:'+exe,source],{encoding:'utf8',windowsHide:true});
 assert.equal(build.status,0,build.stdout+build.stderr);
 const sha=createHash('sha256').update(readFileSync(exe)).digest('hex');
 const child=spawn('pwsh',['-NoProfile','-File',script,'-Executable',exe,'-ExpectedSha256',sha,'-OutputRoot',output,'-ProbeSeconds','15','-ProtectedRecoveryRoot',join(path,'sentinel-recovery')],{cwd:root,windowsHide:true,stdio:'ignore'});
 let exit=null;const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{exit=code;resolve(code);});});
 const watchdog=setTimeout(()=>child.kill(),20_000);
 try {
  const started=Date.now();while(!existsSync(join(output,'app-owner.json')) && exit===null && Date.now()-started<10_000)await new Promise(r=>setTimeout(r,50));
  assert.ok(existsSync(join(output,'app-owner.json')),'Owned app must start before cancellation.');
  writeFileSync(join(output,'cancel'),'');
  assert.equal(await done,1);
  const r=JSON.parse(readFileSync(join(output,'receipt.json'),'utf8'));
  assert.match(r.error,/cancellation requested/);assert.equal(r.cleanup.activeJobProcesses,0);assert.equal(r.cleanup.desktopClosed,true);assert.equal(r.inputDesktopOwnedPickers,0);
 }finally{clearTimeout(watchdog);if(exit===null){child.kill();await done;}}
});
