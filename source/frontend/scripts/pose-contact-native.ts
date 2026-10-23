import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { ContactBatchRequest, ContactBatchResult } from '../src/utils/skeletalPlantedIdle';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const crate = path.join(root,'source/pose-contact');
const sources = ['Cargo.toml','Cargo.lock','src/lib.rs','src/v1.rs','examples/pose_contact_batch.rs'];
const sha = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const identity = async (): Promise<string> => sha(Buffer.concat(await Promise.all(sources.map(async p=>Buffer.concat([Buffer.from(p+'\0'),await readFile(path.join(crate,p))])))));

/** Freeze the Cargo-reported native artifact; release its owned copy after one batch. */
export async function solveNativePoseContacts(input: ContactBatchRequest, signal?: AbortSignal): Promise<ContactBatchResult> {
  signal?.throwIfAborted();
  const source = await identity(), payload = Buffer.from(JSON.stringify(input));
  if (payload.length > 8*1024*1024) throw new Error('Contact batch exceeds 8 MiB.');
  const build = spawnSync('cargo',['build','--locked','--offline','--example','pose_contact_batch','--message-format=json'],{
    cwd:crate,windowsHide:true,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,
    env:{...process.env,CARGO_INCREMENTAL:process.env.CARGO_INCREMENTAL??'0',CARGO_BUILD_JOBS:process.env.CARGO_BUILD_JOBS??'1',CARGO_PROFILE_DEV_DEBUG:process.env.CARGO_PROFILE_DEV_DEBUG??'0'},
  });
  if (build.error || build.status!==0) throw new Error(`Contact batch build failed: ${build.error?.message??build.stderr.slice(-2000)}`);
  signal?.throwIfAborted();
  const artifacts = build.stdout.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line) as {reason:string;target?:{name:string};executable?:string}).filter(m=>m.reason==='compiler-artifact'&&m.target?.name==='pose_contact_batch'&&m.executable);
  if (artifacts.length!==1 || source!==await identity()) throw new Error('Contact batch build source or artifact is ambiguous.');
  const bytes = await readFile(artifacts[0].executable!), hash = sha(bytes), directory = await mkdtemp(path.join(os.tmpdir(),'rustsmf-contact-'));
  const executable = path.join(directory,process.platform==='win32'?'contact.exe':'contact');
  try {
    await writeFile(executable,bytes,{flag:'wx',mode:0o700}); signal?.throwIfAborted();
    const result = await new Promise<string>((resolve,reject)=>{
      const child=spawn(executable,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      let output='',errors='',failure:Error|undefined;
      const stop=(error:Error):void=>{failure??=error;child.kill();};
      const abort=():void=>stop(new Error('Contact batch cancelled.'));
      const timer=setTimeout(()=>stop(new Error('Contact batch timed out.')),60000);
      signal?.addEventListener('abort',abort,{once:true});
      child.stdout.on('data',(b:Buffer)=>{output+=b.toString();if(Buffer.byteLength(output)>8*1024*1024)stop(new Error('Contact output exceeds 8 MiB.'));});
      child.stderr.on('data',(b:Buffer)=>{errors=(errors+b.toString()).slice(-3000);});
      child.on('error',error=>{failure??=error;}); child.stdin.on('error',error=>{failure??=error;});
      child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(failure)reject(failure);else if(code!==0)reject(new Error(errors||`Contact batch exited ${code}.`));else resolve(output);});
      if(signal?.aborted)abort();else child.stdin.end(payload);
    });
    signal?.throwIfAborted();
    if (hash!==sha(await readFile(executable)) || source!==await identity()) throw new Error('Contact batch source or executable changed.');
    const parsed = JSON.parse(result) as ContactBatchResult;
    if (parsed.schema!=='rustsmf.pose-contact-batch-result.v1' || !Array.isArray(parsed.frames)) throw new Error('Invalid contact result schema.');
    return {...parsed,runtime:{solverSourceSha256:source,executableSha256:hash}};
  } finally {
    await unlink(executable).catch((error:NodeJS.ErrnoException)=>{if(error.code!=='ENOENT')throw error;});
    await rmdir(directory);
  }
}
