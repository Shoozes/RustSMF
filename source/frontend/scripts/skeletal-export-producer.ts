import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { SkeletalExportProducer } from '../src/utils/skeletalExportGeneration';

const execFileAsync = promisify(execFile);
const REPOSITORY = 'Shoozes/RustSMF';
const EXPORTER_FILES = [
  'source/frontend/scripts/skeletal-export-cli.ts',
  'source/frontend/scripts/skeletal-export-producer.ts',
  'source/frontend/src/utils/skeletalExport.ts',
  'source/frontend/src/utils/skeletalExportGeneration.ts',
  'source/frontend/src/utils/skeletalExportJob.ts',
  'source/frontend/src/utils/skeletalConditioning.ts',
  'source/frontend/src/utils/skeletalChordRotation.ts',
  'source/frontend/src/utils/skeletalTransitionFloor.ts',
  'source/frontend/src/utils/skeletalPlantedIdle.ts',
  'source/frontend/scripts/pose-contact-native.ts',
  'source/pose-contact/Cargo.toml',
  'source/pose-contact/Cargo.lock',
  'source/pose-contact/src/lib.rs',
  'source/pose-contact/src/v1.rs',
  'source/pose-contact/examples/pose_contact_batch.rs',
].sort();
const SOURCE_FILES = [
  ...EXPORTER_FILES,
  'source/frontend/package.json',
  'source/frontend/scripts/bounded-file-read.ts',
  'source/frontend/scripts/node-three-runtime.ts',
  'source/frontend/src/loaders/geometryAttributes.ts',
  'source/frontend/src/loaders/glb.ts',
  'source/frontend/src/loaders/smfBinary.ts',
  'source/frontend/src/test/installFileReaderTestPolyfill.ts',
  'source/frontend/src/utils/imagePayload.ts',
  'source/frontend/src/utils/materialPreview.ts',
  'source/frontend/src/utils/modelFormat.ts',
  'source/frontend/src/utils/modelResourceBundle.ts',
  'source/frontend/src/utils/textureImageReadiness.ts',
  'source/frontend/src/utils/threeDisposal.ts',
  'source/frontend/src/utils/threeTypeGuards.ts',
  'source/frontend/src/utils/animationTrackInterpolation.ts',
  'source/package-lock.json',
  'source/package.json',
].sort();

function hashSources(root: string, relativePaths: readonly string[]): Promise<string> {
  return (async () => {
    const hash = createHash('sha256');
    for (const relativePath of relativePaths) {
      const bytes = await readFile(path.join(root, relativePath));
      hash.update(relativePath.normalize('NFC'));
      hash.update('\0');
      hash.update(String(bytes.byteLength));
      hash.update('\0');
      hash.update(bytes);
      hash.update('\0');
    }
    return hash.digest('hex');
  })();
}

export async function readSkeletalExportProducer(): Promise<SkeletalExportProducer> {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const [{ stdout: revisionOutput }, { stdout: statusOutput }] = await Promise.all([
    execFileAsync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }),
    execFileAsync('git', ['-C', repositoryRoot, 'status', '--porcelain=v1', '--untracked-files=normal'], { encoding: 'utf8' }),
  ]);
  const [sourceIdentitySha256, exporterIdentitySha256] = await Promise.all([
    hashSources(repositoryRoot, SOURCE_FILES),
    hashSources(repositoryRoot, EXPORTER_FILES),
  ]);
  return {
    repository: REPOSITORY,
    revision: revisionOutput.trim(),
    workingTree: statusOutput.trim() ? 'dirty' : 'clean',
    sourceIdentitySha256,
    exporterIdentitySha256,
  };
}
