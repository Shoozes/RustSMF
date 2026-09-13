import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileBounded } from './bounded-file-read';
import { installNodeThreeRuntime } from './node-three-runtime';
import { parseGlbContainer } from '../src/utils/glbContainer';
import { buildFittedRig, type FittedRig } from '../src/utils/fittedRig';
import { bakeFittedClip } from '../src/utils/fittedRigAnimation';
import { exportFittedRigGlb } from '../src/utils/fittedRigGlb';
import { compareFittedMotion, skinnedMeshes } from '../src/utils/fittedRigVerification';
import { disposeThreeObject } from '../src/utils/threeDisposal';

interface FitRigJob {
  schema: 'rustsmf-fit-rig-v1'; source: string; template: string; outputDirectory: string;
  mapping: Record<string, string>; clips: string[];
}

export function parseFitRigJob(value: unknown): FitRigJob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a fit-rig job object');
  const job = value as Record<string, unknown>;
  if (job.schema !== 'rustsmf-fit-rig-v1'
    || Object.keys(job).some(key => !['schema', 'source', 'template', 'outputDirectory', 'mapping', 'clips'].includes(key))) {
    throw new Error('Unknown fit-rig schema or field');
  }
  for (const key of ['source', 'template', 'outputDirectory']) {
    if (typeof job[key] !== 'string' || !path.isAbsolute(job[key]) || job[key].includes('\0')) throw new Error(`${key} must be an absolute path`);
  }
  if (!job.mapping || typeof job.mapping !== 'object' || Array.isArray(job.mapping)
    || Object.keys(job.mapping).length < 1 || Object.keys(job.mapping).length > 256
    || Object.entries(job.mapping).some(([key, target]) => !key || typeof target !== 'string' || !target)) throw new Error('Explicit bounded mapping required');
  if (!Array.isArray(job.clips) || !job.clips.length || job.clips.length > 128
    || job.clips.some(clip => typeof clip !== 'string' || !clip)
    || new Set(job.clips).size !== job.clips.length) throw new Error('Explicit unique clip names required');
  return job as unknown as FitRigJob;
}

async function loadEmbedded(bytes: Uint8Array): Promise<GLTF> {
  const { json } = parseGlbContainer(bytes);
  const nodes = json.nodes;
  if (!Array.isArray(nodes) || nodes.length > 2048 || json.buffers?.length !== 1
    || json.buffers.some(buffer => buffer.uri) || json.images?.some(image => image.uri)
    || !Array.isArray(json.accessors) || json.accessors.reduce((sum, accessor) => sum + accessor.count, 0) > 5_000_000
    || json.accessors.some(accessor => !Number.isSafeInteger(accessor.count) || accessor.count < 0)) {
    throw new Error('Expected bounded embedded GLB resources');
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (!url.startsWith('blob:nodedata:')) throw new Error('External model resource refused');
    return url;
  });
  return new GLTFLoader(manager).parseAsync(Uint8Array.from(bytes).buffer, '');
}

/** Fresh output only. The manifest is written last, after sampled equivalence passes. */
export async function runFitRigJob(job: FitRigJob) {
  job = parseFitRigJob(job);
  installNodeThreeRuntime();
  const sourceBytes = await readFileBounded(job.source, 64 * 1024 * 1024);
  const templateBytes = await readFileBounded(job.template, 64 * 1024 * 1024);
  const loaded: GLTF[] = []; let fitted: FittedRig | undefined;
  try {
    const source = await loadEmbedded(sourceBytes); loaded.push(source);
    const template = await loadEmbedded(templateBytes); loaded.push(template);
    const sourceSkeleton = skinnedMeshes(source.scene)[0]?.skeleton, templateSkeleton = skinnedMeshes(template.scene)[0]?.skeleton;
    if (!sourceSkeleton || !templateSkeleton) throw new Error('Both inputs need a skinned skeleton');
    const clips = job.clips.map(name => {
      const matches = source.animations.filter(clip => clip.name === name);
      if (matches.length !== 1) throw new Error(`Missing or ambiguous source clip: ${name}`);
      return matches[0];
    });
    fitted = buildFittedRig(sourceSkeleton, templateSkeleton, job.mapping);
    const baked = clips.map(clip => bakeFittedClip(source.scene, clip, fitted!, 60));
    const output = exportFittedRigGlb(sourceBytes, fitted, baked);
    const received = await loadEmbedded(output); loaded.push(received);
    const comparison = compareFittedMotion(source.scene, received.scene, clips, received.animations);
    if (comparison.maximumVertexError > 0.00001) throw new Error(`Fitted vertex equivalence failed: ${comparison.maximumVertexError}`);
    const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    const report = { schema: 'rustsmf-fit-rig-report-v1', status: 'passed', sourceSha256: hash(sourceBytes),
      templateSha256: hash(templateBytes), outputSha256: hash(output), bones: fitted.skeleton.bones.length,
      mappedBones: fitted.sourceToTarget.size, maximumBindFrameError: fitted.maximumBindFrameError,
      comparison, limits: ['60 Hz sampled vertex equivalence; no visual acceptance', 'Image bytes preserved; image rendering not evaluated'] };
    // recursive:false refuses an existing directory, including an input directory.
    await mkdir(job.outputDirectory);
    await writeFile(path.join(job.outputDirectory, 'fitted.glb'), output, { flag: 'wx' });
    await writeFile(path.join(job.outputDirectory, 'job.json'), JSON.stringify(job, null, 2) + '\n', { flag: 'wx' });
    await writeFile(path.join(job.outputDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    return { ...report, outputDirectory: job.outputDirectory };
  } finally {
    fitted?.skeleton.dispose(); for (const asset of loaded) disposeThreeObject(asset.scene);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('RustSMF fit-rig: --job <absolute JSON path>\nSchema rustsmf-fit-rig-v1: source, template, outputDirectory (fresh), mapping, clips.\nFits a template topology, preserves original mesh/skin/material streams, bakes 60 Hz motion and verifies re-imported vertices.'); return;
  }
  if (args.length !== 2 || args[0] !== '--job' || !path.isAbsolute(args[1])) throw new Error('Usage: fit-rig --job <absolute JSON path>');
  const job = parseFitRigJob(JSON.parse(new TextDecoder().decode(await readFileBounded(args[1], 1024 * 1024))));
  console.log(JSON.stringify(await runFitRigJob(job)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
