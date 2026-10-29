import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { transferWalkSlowRootYToBody, WALK_ROOT_BODY_POLICY } from '../src/utils/skeletalRootBodyTransfer';

const [input, output] = process.argv.slice(2);
if (!input || !output || process.argv.length !== 4) {
  console.error('Usage: skeletal-walk-root-body-cli <source.glb> <new-model.glb>');
  process.exitCode = 2;
} else {
  try {
    const original = await readFile(input);
    const selected = ['walkSlow', ...[0, 25, 50, 75].flatMap(phase => ['start', 'stop', 'reversal'].map(kind => `${kind}-walkSlow-p${phase}`))];
    let bytes: Uint8Array = original;
    const reports = [];
    for (const clipId of selected) {
      const derived = transferWalkSlowRootYToBody(bytes, WALK_ROOT_BODY_POLICY, clipId);
      bytes = derived.bytes;
      reports.push(derived.report);
    }
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, bytes, { flag: 'wx' });
    const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    console.log(JSON.stringify({ input: path.resolve(input), inputSha256: sha256(original), output: path.resolve(output), outputSha256: sha256(bytes), policy: WALK_ROOT_BODY_POLICY, clips: reports.length,
      maximumTransferredMeters: Math.max(...reports.map(r => r.maximumTransferredMeters)), maximumStoredWorldYErrorMeters: Math.max(...reports.map(r => r.maximumStoredWorldYErrorMeters)), reports }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
