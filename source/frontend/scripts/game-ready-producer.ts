import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { GameReadyProducer } from '../src/utils/gameReadyGeneration';

const execFileAsync = promisify(execFile);
const REPOSITORY = 'Shoozes/RustSMF';
const SOURCE_FILES = [
  'source/frontend/package.json',
  'source/frontend/scripts/bounded-file-read.ts',
  'source/frontend/scripts/game-ready-cli.ts',
  'source/frontend/scripts/game-ready-producer.ts',
  'source/frontend/scripts/node-three-runtime.ts',
  'source/frontend/src/loaders/fbx.ts',
  'source/frontend/src/loaders/geometryAttributes.ts',
  'source/frontend/src/loaders/glb.ts',
  'source/frontend/src/loaders/smfBinary.ts',
  'source/frontend/src/test/installFileReaderTestPolyfill.ts',
  'source/frontend/src/utils/animationRetarget.ts',
  'source/frontend/src/utils/fittedRigTiming.ts',
  'source/frontend/src/utils/gameReadyGeneration.ts',
  'source/frontend/src/utils/gameReadyJob.ts',
  'source/frontend/src/utils/gameReadyValidation.ts',
  'source/frontend/src/utils/glbContainer.ts',
  'source/frontend/src/utils/materialRepair.ts',
  'source/frontend/src/utils/materialPreview.ts',
  'source/frontend/src/utils/modelFormat.ts',
  'source/frontend/src/utils/modelResourceBundle.ts',
  'source/frontend/src/utils/naturalRetarget.ts',
  'source/frontend/src/utils/poseRanges.ts',
  'source/frontend/src/utils/retargetProfile.ts',
  'source/frontend/src/utils/retargetReference.ts',
  'source/frontend/src/utils/retargetTiming.ts',
  'source/frontend/src/utils/rigCompatibility.ts',
  'source/frontend/src/utils/rigMapping.ts',
  'source/frontend/src/utils/skinnedVertexPosition.ts',
  'source/frontend/src/utils/threeDisposal.ts',
  'source/frontend/src/utils/threeTypeGuards.ts',
  'source/frontend/src/vendor/FBXExporter.js',
  'source/package-lock.json',
  'source/package.json',
].sort();

export async function readGameReadyProducer(tool: GameReadyProducer['tool']): Promise<GameReadyProducer> {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const [{ stdout: revisionOutput }, { stdout: statusOutput }] = await Promise.all([
    execFileAsync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }),
    execFileAsync('git', ['-C', repositoryRoot, 'status', '--porcelain=v1', '--untracked-files=normal'], { encoding: 'utf8' }),
  ]);
  const sourceHash = createHash('sha256');
  for (const relativePath of SOURCE_FILES) {
    const bytes = await readFile(path.join(repositoryRoot, relativePath));
    sourceHash.update(relativePath.normalize('NFC'));
    sourceHash.update('\0');
    sourceHash.update(String(bytes.byteLength));
    sourceHash.update('\0');
    sourceHash.update(bytes);
    sourceHash.update('\0');
  }
  return {
    repository: REPOSITORY,
    revision: revisionOutput.trim(),
    workingTree: statusOutput.trim() ? 'dirty' : 'clean',
    sourceIdentitySha256: sourceHash.digest('hex'),
    tool,
  };
}
