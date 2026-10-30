import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..'),script=join(root,'scripts/installed-test-session.ps1');
const windows=process.platform==='win32';
const run=args=>spawnSync('pwsh',['-NoProfile','-File',script,...args],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60_000});
function fixture(t){const path=mkdtempSync(join(tmpdir(),'rustsmf-desktop-é space-'));t.after(()=>{assert.ok(resolve(path).startsWith(resolve(tmpdir())+'\\'));rmSync(path,{recursive:true,force:true});});return path;}
test('installed probe retains a dedicated MTA worker and refuses takeover APIs',()=>{
 const ps=readFileSync(script,'utf8'),native=readFileSync(join(root,'scripts/installed-test-native.cs'),'utf8'),uia=readFileSync(join(root,'scripts/installed-test-uia.cs'),'utf8');
 assert.match(uia,/SetApartmentState\(ApartmentState.MTA\)/);
 assert.match(native,/AssignProcessToJobObject/);assert.match(native,/0x2000/);
 assert.doesNotMatch(ps+native+uia,/SwitchDesktop\s*\(|SetCursorPos\s*\(|SendInput\s*\(|mouse_event\s*\(|ExecutionPolicy Bypass/);
 assert.match(uia,/Own\(cancelHandle,jobName,desktop\)/);
 assert.match(ps,/InputName\(\) -ne \$taskReceipt.inputDesktopBefore/);
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
 writeFileSync(source,'class Fixture { static void Main(){System.Threading.Thread.Sleep(120000);} }');
 const compiler=join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const build=spawnSync(compiler,['/nologo','/target:exe','/out:'+exe,source],{encoding:'utf8',windowsHide:true});
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
test('cancellation releases the exact isolated job without a picker',{skip:!windows},async t=>{
 const path=fixture(t),source=join(path,'fixture.cs'),exe=join(path,'fixture.exe'),output=join(path,'cancel-probe');
 writeFileSync(source,'class Fixture { static void Main(){System.Threading.Thread.Sleep(120000);} }');
 const build=spawnSync(join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/out:'+exe,source],{encoding:'utf8',windowsHide:true});
 assert.equal(build.status,0,build.stdout+build.stderr);
 const sha=createHash('sha256').update(readFileSync(exe)).digest('hex');
 const child=spawn('pwsh',['-NoProfile','-File',script,'-Executable',exe,'-ExpectedSha256',sha,'-OutputRoot',output,'-ProbeSeconds','15'],{cwd:root,windowsHide:true,stdio:'ignore'});
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
