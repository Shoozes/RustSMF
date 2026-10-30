import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifyInstalledQueue} from './installed-queue-proof.mjs';

function base(){return {status:'passed',scenario:'QueueWriteRetry',probe:{status:'passed',queue:{status:'passed',nativeWriteFailure:true,obstructionAcquired:true,obstructionReleased:true,completedOutputUnchanged:true,retrySucceeded:true,dirtyBeforeFailure:true,dirtyAfterFailure:true,pausedAtZero:true,failedUi:'Failed to install staged export B (os error 32)'}},cleanup:{activeJobProcesses:0,jobTerminated:true,jobHandleClosed:true,workerHandleClosed:true,desktopClosed:true,inputHandleClosed:true},inputDesktopChanged:false,inputDesktopOwnedPickers:0};}
function refuses(t,receipt,pattern){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rustsmf-queue-proof-')),file=path.join(dir,'receipt.json');t.after(()=>{assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});});fs.writeFileSync(file,JSON.stringify(receipt));assert.throws(()=>verifyInstalledQueue(file),pattern);}
test('cancellation and dialog refusal cannot establish a real native write failure',t=>{const r=base();r.probe.queue.nativeWriteFailure=false;refuses(t,r,/nativeWriteFailure/);});
test('a failed cleanup cannot qualify an otherwise successful queue execution',t=>{const r=base();r.cleanup.activeJobProcesses=1;refuses(t,r,/1 !== 0/);});
test('pending dirty state or a missing native publication witness cannot pass',t=>{const r=base();r.probe.queue.dirtyAfterFailure=false;refuses(t,r,/dirtyAfterFailure/);const s=base();s.probe.queue.failedUi='Destination canceled';refuses(t,s,/Failed to install staged export/);});
test('WebView isolation or sentinel-only protection cannot qualify native data isolation',t=>{
 const r=base();refuses(t,r,/Canonical native recovery guard required/);
 const s=base();s.protectedRecovery={kind:'test-sentinel',unchanged:true};refuses(t,s,/Canonical native recovery guard required/);
 const changed=base();changed.protectedRecovery={kind:'canonical-known-folder',unchanged:false};refuses(t,changed,/Default native recovery must remain unchanged/);
 const missing=base();missing.protectedRecovery={kind:'canonical-known-folder',unchanged:true,before:{},after:{}};refuses(t,missing,/Native profile attestation required/);
});
