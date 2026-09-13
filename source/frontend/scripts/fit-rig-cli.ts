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

export interface FitRigGameTransform {
  normalizationScale: number;
  visualScale: number;
  groundTranslationY: number;
  facing: -1 | 1;
  modelPitch: number | null;
  pitchJoint?: string;
}

export interface FitRigJob {
  schema: 'rustsmf-fit-rig-v1'; source: string; template: string; outputDirectory: string;
  mapping: Record<string, string>; clips: string[];
  comparison?: {
    playbackRate: number;
    displayHeight: number;
    gameTransforms?: Record<'source' | 'fitted' | 'template', FitRigGameTransform>;
  };
}

function parseGameTransform(value: unknown, label: string): FitRigGameTransform {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const transform = value as Record<string, unknown>;
  if (Object.keys(transform).some(key => !['normalizationScale', 'visualScale', 'groundTranslationY', 'facing', 'modelPitch', 'pitchJoint'].includes(key))
    || typeof transform.normalizationScale !== 'number' || !Number.isFinite(transform.normalizationScale) || transform.normalizationScale <= 0
    || typeof transform.visualScale !== 'number' || !Number.isFinite(transform.visualScale) || transform.visualScale <= 0
    || typeof transform.groundTranslationY !== 'number' || !Number.isFinite(transform.groundTranslationY)
    || (transform.facing !== -1 && transform.facing !== 1)
    || (transform.modelPitch !== null && (typeof transform.modelPitch !== 'number' || !Number.isFinite(transform.modelPitch)))
    || (transform.pitchJoint !== undefined && (typeof transform.pitchJoint !== 'string' || !transform.pitchJoint.trim()))
    || (transform.modelPitch !== null && transform.pitchJoint === undefined)) {
    throw new Error(`${label} contains an invalid game transform`);
  }
  return transform as unknown as FitRigGameTransform;
}

export function parseFitRigJob(value: unknown): FitRigJob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a fit-rig job object');
  const job = value as Record<string, unknown>;
  if (job.schema !== 'rustsmf-fit-rig-v1'
    || Object.keys(job).some(key => !['schema', 'source', 'template', 'outputDirectory', 'mapping', 'clips', 'comparison'].includes(key))) {
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
  const comparisonValue = job.comparison;
  let comparison: FitRigJob['comparison'];
  if (comparisonValue !== undefined) {
    if (!comparisonValue || typeof comparisonValue !== 'object' || Array.isArray(comparisonValue)) {
      throw new Error('comparison must be an object');
    }
    const source = comparisonValue as Record<string, unknown>;
    if (Object.keys(source).some(key => !['playbackRate', 'displayHeight', 'gameTransforms'].includes(key))) {
      throw new Error('Unknown comparison field');
    }
    const playbackRate = source.playbackRate === undefined ? 0.5 : source.playbackRate;
    const displayHeight = source.displayHeight === undefined ? 2 : source.displayHeight;
    if (typeof playbackRate !== 'number' || !Number.isFinite(playbackRate) || playbackRate <= 0 || playbackRate > 4
      || typeof displayHeight !== 'number' || !Number.isFinite(displayHeight) || displayHeight <= 0 || displayHeight > 100) {
      throw new Error('comparison playbackRate/displayHeight is outside the bounded contract');
    }
    let gameTransforms: NonNullable<FitRigJob['comparison']>['gameTransforms'];
    if (source.gameTransforms !== undefined) {
      if (!source.gameTransforms || typeof source.gameTransforms !== 'object' || Array.isArray(source.gameTransforms)) {
        throw new Error('comparison.gameTransforms must be an object');
      }
      const transforms = source.gameTransforms as Record<string, unknown>;
      if (Object.keys(transforms).length !== 3 || ['source', 'fitted', 'template'].some(role => !(role in transforms))) {
        throw new Error('comparison.gameTransforms requires source, fitted, and template');
      }
      gameTransforms = {
        source: parseGameTransform(transforms.source, 'comparison.gameTransforms.source'),
        fitted: parseGameTransform(transforms.fitted, 'comparison.gameTransforms.fitted'),
        template: parseGameTransform(transforms.template, 'comparison.gameTransforms.template'),
      };
    }
    comparison = { playbackRate, displayHeight, gameTransforms };
  }
  return (comparison ? { ...job, comparison } : job) as unknown as FitRigJob;
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
    if (comparison.maximumVertexError > 0.00001) {
      const worst = comparison.clips.reduce((left, right) => (
        right.maximumVertexError > left.maximumVertexError ? right : left
      ));
      throw new Error(`Fitted vertex equivalence failed: ${JSON.stringify({ worst, clips: comparison.clips })}`);
    }
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
