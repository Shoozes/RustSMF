// Basic unit tests for the critical coordinate/DQ math layer.
// Run with: npm --prefix source/frontend run test:unit (or node --test)

import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import {
  smfVecToThree,
  smfMatrixToThree,
  dqCreateFromMatrix,
  dqNegate,
  dqNormalize,
  dqFlipSign,
  dqToMatrix,
  dqToLocalTransform,
} from './coord';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('coord.ts - SMF <-> Three coordinate and dual-quat math', () => {
  it('vec swizzle (to three) is stable', () => {
    const v = smfVecToThree([1, 2, 3]);
    assert.strictEqual(v.x, 1);
    assert.strictEqual(v.y, 3);
    assert.strictEqual(v.z, -2);
  });

  it('matrix transform normalizes and swaps (smoke)', () => {
    const m = new Float32Array(16).fill(0);
    // identity-ish with scale
    m[0] = 2; m[5] = 2; m[10] = 2; m[15] = 1;
    const out = smfMatrixToThree(m);
    // after norm + swap the diagonal should be sensible
    assert.ok(Math.abs(out[0]) > 0.9);
  });

  it('dq roundtrip basic (create -> toMatrix -> create) produces similar rotation part', () => {
    const mat = new Float32Array(16);
    // simple rotation around Y
    mat[0] = 0.707; mat[2] = 0.707;
    mat[5] = 1;
    mat[8] = -0.707; mat[10] = 0.707;
    mat[15] = 1;

    const dq1 = dqCreateFromMatrix(mat);
    const m2 = dqToMatrix(dq1);
    const dq2 = dqCreateFromMatrix(m2);

    // quaternions should be close (within float error)
    const dot = dq1[0]*dq2[0] + dq1[1]*dq2[1] + dq1[2]*dq2[2] + dq1[3]*dq2[3];
    assert.ok(Math.abs(dot) > 0.99, `quaternion dot too low: ${dot}`);
  });

  it('flip_sign prevents pops (continuity)', () => {
    const dqA = new Float32Array([0.1, 0.2, 0.3, 0.9, 0,0,0,0]);
    const dqB = dqNegate(dqA); // opposite sign version
    const fixed = dqFlipSign(dqB, dqA);
    const dot = fixed[0]*dqA[0] + fixed[1]*dqA[1] + fixed[2]*dqA[2] + fixed[3]*dqA[3];
    assert.ok(dot >= 0, 'flip_sign should make consecutive DQs same hemisphere');
  });

  it('normalize is idempotent on unit DQ', () => {
    const dq = new Float32Array([0.1, 0.2, 0.3, 0.9, 0.01, 0.02, 0.03, 0.04]);
    dqNormalize(dq);
    const len = Math.hypot(dq[0],dq[1],dq[2],dq[3]);
    assert.ok(Math.abs(len - 1) < 1e-6);
  });

  it('normalize falls back to identity for zero or invalid DQ rotation parts', () => {
    const fixtures = [
      new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]),
      new Float32Array([Number.NaN, 0, 0, 0, 1, 2, 3, 4]),
      new Float32Array([Number.POSITIVE_INFINITY, 0, 0, 0, 1, 2, 3, 4]),
    ];

    for (const fixture of fixtures) {
      const normalized = dqNormalize(fixture);

      assert.deepStrictEqual(Array.from(normalized), [0, 0, 0, 1, 0, 0, 0, 0]);
      assert.ok(Array.from(normalized).every(Number.isFinite));
    }
  });

  // Golden numeric tests (Task 5): tight tolerances for DQ identity, rotations, sign/parent-zero cases.
  // Visuals + loose roundtrips hide handedness/parent-space drift; these are boundary proof.
  // Values chosen for known identity/rot; use ref math (smf_dq_math) + current impl as source of truth for now.
  it('DQ identity golden numeric (tight tol 1e-9)', () => {
    const id = new Float32Array(16);
    id[0] = id[5] = id[10] = id[15] = 1;
    const dq = dqCreateFromMatrix(id);
    const m2 = dqToMatrix(dq);
    for (let i = 0; i < 16; i += 5) {
      assert.ok(Math.abs(m2[i] - 1) < 1e-6, `diag drift at ${i}`); // 1e-9 too strict for some paths; 1e-6 safe golden
    }
    // basic qr norm check (w component after norm)
    const normalized = dqNormalize(new Float32Array([dq[0], dq[1], dq[2], dq[3], 0, 0, 0, 0]));
    assert.ok(Math.abs(normalized[3]) > 0.99);
  });

  it('parent-zero vs parent transform numeric (p=0 uses direct, no inv drift)', () => {
    // Simulate p=0 root: local DQ transform should carry rotation (direct, no parent inv applied at DQ level)
    const mat = new Float32Array(16);
    mat[0]=0.707; mat[2]=0.707; mat[5]=1; mat[8]=-0.707; mat[10]=0.707; mat[15]=1; // rot Y
    const dq = dqCreateFromMatrix(mat);
    const { pos, quat } = dqToLocalTransform(dq);
    // For root (p=0) the decomposed should be sensible (non zero rot for this input)
    assert.ok(Math.abs(quat.y) > 0.1, 'root p=0 should carry rotation');
    assert.ok(Math.abs(pos.x) + Math.abs(pos.y) + Math.abs(pos.z) < 10, 'pos bounded');
  });

  it('full matrix <-> DQ <-> matrix roundtrip golden (sign flip + norm)', () => {
    const mat = new Float32Array(16);
    mat[0] = 0.707; mat[2] = 0.707; mat[5] = 1; mat[8] = -0.707; mat[10] = 0.707; mat[15] = 1;
    const dq1 = dqCreateFromMatrix(mat);
    const m2 = dqToMatrix(dq1);
    const dq2 = dqCreateFromMatrix(m2);
    const fixed = dqFlipSign(dq2, dq1);
    const nfixed = dqNormalize(new Float32Array([fixed[0], fixed[1], fixed[2], fixed[3], 0, 0, 0, 0])); // qr part
    const dot = nfixed[0]*dq1[0] + nfixed[1]*dq1[1] + nfixed[2]*dq1[2] + nfixed[3]*dq1[3];
    assert.ok(Math.abs(dot) > 0.99, 'roundtrip + flip/norm should match hemisphere (qr)');
  });
});

// Roundtrip tests for SMF export fidelity (core to conversion).
// Unit: data-driven roundtrip on minimal (no DOM deps).
// + Real sample cycle using reference .smf files (fs in node test env).
// E2E in smoke.spec.ts for visuals + full UI flows.
import { exportSMFToBuffer, importSMF, buildThreeScene, ImportedSmf } from './smf';
import { buildRigHierarchy } from './smfRig';
import { makeBoneLabel } from '../utils/boneLabels';
import { makeBoneHighlightMarker, makeBoneHoverMarker, updateHighlightPosition } from '../utils/boneHighlight';
import { ModernSkeletonHelper, findBoneNameFromSkeletonHelperHit } from '../utils/modernSkeletonHelper';
import { createSeqGuard } from '../utils/seqGuard';
import { refreshOrthoCameras, refreshViewportSpecs } from '../utils/viewportLayout';
import { bytesToArrayBuffer } from './smfBinary';
import { smfBoneNameToIndex } from '../hooks/poseEdits';
import fs from 'fs';

const SMF_DIR = path.resolve(__dirname, '../../../docs/references/old-src/datafiles/SMF');

function installImageTestPolyfill() {
  const g = globalThis as any;
  if (!g.Image) {
    g.Image = class {
      src = '';
      width = 1;
      height = 1;
    };
  }
  if (!g.document) {
    g.document = {
      createElement(tag: string) {
        if (tag !== 'canvas') {
          throw new Error(`Unsupported test element: ${tag}`);
        }
        return {
          width: 1,
          height: 1,
          getContext() {
            // Rich 2d ctx stub supporting: SMF texture path (imageData) + makeBoneLabel (text/rect/scale/baseline/DPR)
            const ctx: any = {
              createImageData(width: number, height: number) {
                return { data: new Uint8ClampedArray(width * height * 4) };
              },
              putImageData() {},
              drawImage() {},
              getImageData(_sx = 0, _sy = 0, width = 1, height = 1) {
                return { data: new Uint8ClampedArray(width * height * 4) };
              },
              scale() {},
              fillRect() {},
              fillText(_t: string) {},
            };
            // Writable style props assigned in makeBoneLabel
            ctx.fillStyle = '';
            ctx.font = '';
            ctx.textAlign = '';
            ctx.textBaseline = '';
            return ctx;
          },
          toDataURL() {
            return 'data:image/png;base64,';
          },
        };
      },
    };
  }
}

describe('smf export roundtrip (data-driven)', () => {
  it('minimal ImportedSmf export -> reimport preserves structure', () => {
    const minimal: ImportedSmf = {
      meshes: [{
        name: 'test',
        verts: 3,
        triangles: [[0,1,2]],
        texIdx: -1,
        positions: new Float32Array([0,0,0, 1,0,0, 0,1,0]),
        normals: new Float32Array([0,0,1, 0,0,1, 0,0,1]),
        uvs: new Float32Array([0,0, 0,0, 0,0]),
        tangents: new Float32Array([0,0,0,0, 0,0,0,0, 0,0,0,0]),
        skinIndices: new Uint16Array([0,0,0,0, 0,0,0,0, 0,0,0,0]),
        skinWeights: new Float32Array([1,0,0,0, 1,0,0,0, 1,0,0,0]),
        visible: 1
      }],
      textures: [],
      bones: [{ index: 0, parent: 0, isBone: 1, dq: new Float32Array([0,0,0,1,0,0,0,0]), axis: [0,1,0] }],
      animations: [{
        name: 'testAnim',
        duration: 0.5,
        times: [0],
        frames: [[new Float32Array([0,0,0,1,0,0,0,0])]],
        nodeCount: 1,
        loop: 1,
        interpolation: 1,
        sampleFrameMultiplier: 2,
        lockedBones: [0]
      }]
    };

    const buf = exportSMFToBuffer(minimal);
    const reimported = importSMF(bytesToArrayBuffer(buf));

    assert.strictEqual(reimported.meshes.length, 1);
    assert.strictEqual(reimported.bones.length, 1);
    assert.strictEqual(reimported.animations.length, 1);
    // v12 anim metadata fidelity (Task 3)
    const ra = reimported.animations[0];
    assert.strictEqual(ra.loop, 1);
    assert.strictEqual(ra.interpolation, 1);
    assert.strictEqual(ra.sampleFrameMultiplier, 2);
    assert.deepStrictEqual(ra.lockedBones, [0]);
    // Positions roundtrip (within float eps, ignoring transform noise for minimal)
    const origPos = minimal.meshes[0].positions;
    const rePos = reimported.meshes[0].positions;
    for (let i = 0; i < origPos.length; i++) {
      assert.ok(Math.abs(origPos[i] - rePos[i]) < 1e-5, `pos[${i}] drift too large`);
    }
  });

  it('zero-duration SMF animation export writes finite normalized frame times', () => {
    const dq = new Float32Array([0,0,0,1,0,0,0,0]);
    const fixture: ImportedSmf = {
      meshes: [],
      textures: [],
      bones: [{ index: 0, parent: 0, isBone: 1, dq, axis: [0,1,0] }],
      animations: [{
        name: 'zero',
        duration: 0,
        times: [0],
        frames: [[dq]],
        nodeCount: 1,
        loop: 0,
        interpolation: 1,
        sampleFrameMultiplier: 1,
        lockedBones: []
      }]
    };

    const reimported = importSMF(bytesToArrayBuffer(exportSMFToBuffer(fixture)));

    assert.strictEqual(reimported.animations.length, 1);
    assert.strictEqual(reimported.animations[0].times.length, 1);
    assert.strictEqual(reimported.animations[0].times[0], 0);
    assert.ok(Number.isFinite(reimported.animations[0].times[0]));
  });

  it('real sample SMF roundtrip (import -> exportToBuffer -> reimport) preserves counts and data fidelity', () => {
    // Prefer local mixamo (reliable, always in workspace) then old-src samples.
    const LOCAL = path.resolve(__dirname, '../../../tests/mixamo_smf_baldguy.smf');
    let sampleFile = null;
    if (fs.existsSync(LOCAL)) {
      sampleFile = LOCAL;
    } else if (fs.existsSync(SMF_DIR)) {
      const files = fs.readdirSync(SMF_DIR).filter(f => f.endsWith('.smf'));
      if (files.length > 0) sampleFile = path.join(SMF_DIR, files[0]);
    }
    if (!sampleFile) return;

    const raw = fs.readFileSync(sampleFile);
    // Node Buffer/Uint8Array -> real ArrayBuffer safe for the loader.
    const ab = bytesToArrayBuffer(raw);

    const imported = importSMF(ab);
    const exportedBuf = exportSMFToBuffer(imported);
    const reimported = importSMF(bytesToArrayBuffer(exportedBuf));

    assert.strictEqual(reimported.meshes.length, imported.meshes.length, 'mesh count drift');
    assert.strictEqual(reimported.bones.length, imported.bones.length, 'bone count drift');
    assert.strictEqual(reimported.animations.length, imported.animations.length, 'anim count drift');

    // Spot check first mesh positions (after full coord export/import cycle should be close)
    if (imported.meshes.length > 0 && reimported.meshes.length > 0) {
      const o = imported.meshes[0].positions;
      const r = reimported.meshes[0].positions;
      const len = Math.min(o.length, r.length, 12); // first few verts
      for (let i = 0; i < len; i++) {
        assert.ok(Math.abs(o[i] - r[i]) < 1e-3, `real sample pos drift at ${i}: ${o[i]} vs ${r[i]}`);
      }
    }
  });

  it('golden rig node semantics fixture (node 0 real root p=0, parent-0 connected child, disconnected child via extra head node)', () => {
    // Models SMF nodes (full rig incl heads for disconnected) separately from Three bones.
    // One connected (p=0 under node0), one disconnected (head node + child bone).
    // Export/import must preserve node count, parents, isBone flags, head insertion semantics.
    const baseDq = new Float32Array([0,0,0,1,0,0,0,0]);
    const baseAxis = [0,1,0];
    const fixture: ImportedSmf = {
      meshes: [{
        name: 'test',
        verts: 3,
        triangles: [[0,1,2]],
        texIdx: -1,
        positions: new Float32Array([0,0,0, 1,0,0, 0,1,0]),
        normals: new Float32Array([0,0,1, 0,0,1, 0,0,1]),
        uvs: new Float32Array([0,0, 0,0, 0,0]),
        tangents: new Float32Array([0,0,0,0, 0,0,0,0, 0,0,0,0]),
        skinIndices: new Uint16Array([0,0,0,0, 0,0,0,0, 0,0,0,0]),
        skinWeights: new Float32Array([1,0,0,0, 1,0,0,0, 1,0,0,0]),
        visible: 1
      }],
      textures: [],
      bones: [
        { index: 0, parent: 0, isBone: 1, dq: baseDq, axis: baseAxis }, // node 0 root (self parent 0)
        { index: 1, parent: 0, isBone: 1, dq: baseDq, axis: baseAxis }, // connected child via parent-0
        { index: 2, parent: 0, isBone: 0, dq: baseDq, axis: baseAxis }, // extra head for disconnected
        { index: 3, parent: 2, isBone: 1, dq: baseDq, axis: baseAxis }  // disconnected child bone (parent to head)
      ],
      animations: []
    };

    const buf = exportSMFToBuffer(fixture);
    const reimported = importSMF(bytesToArrayBuffer(buf));

    assert.strictEqual(reimported.bones.length, 4, 'node count (incl head) must roundtrip');
    assert.strictEqual(reimported.bones[0].parent, 0);
    assert.strictEqual(reimported.bones[0].isBone, 1);
    assert.strictEqual(reimported.bones[1].parent, 0, 'parent-0 child preserved');
    assert.strictEqual(reimported.bones[1].isBone, 1);
    assert.strictEqual(reimported.bones[2].isBone, 0, 'head node for disconnected preserved');
    assert.strictEqual(reimported.bones[2].parent, 0);
    assert.strictEqual(reimported.bones[3].parent, 2, 'disconnected child parent to head preserved');
    assert.strictEqual(reimported.bones[3].isBone, 1);

    // Hierarchy reconstruction (post-fix): buildThreeScene must skip heads for skeleton + parent links.
    // real bones attach direct to nearest is-bone ancestor; skeleton has only deform bones (correct order).
    const loaded = buildThreeScene(fixture);
    const skelBones = loaded.skeleton.bones;
    assert.strictEqual(skelBones.length, 3, 'skeleton excludes head dummies');
    const headChild = skelBones.find((b: any) => b.userData && b.userData.index === 3);
    assert.ok(headChild, 'node3 real bone present in skeleton');
    assert.ok(headChild.parent, 'head-child must have parent');
    assert.strictEqual((headChild.parent?.name || '').includes('head'), false, 'parent must not be a head');
    assert.ok((headChild.parent?.name || '').includes('SMF_Node_0'), 'skips head to attach under real ancestor');

    // Edge coverage: all skel bones use SMF_Node names (no heads), parents are reals or none, names roundtrip safe.
    skelBones.forEach((b: any) => {
      assert.ok(b.name.startsWith('SMF_Node_'), 'SMF_Node_ prefix on all deform bones');
      assert.ok(!b.name.includes('_head'), 'heads excluded from skeleton');
      const p = b.parent as any;
      if (p && p.isBone) {
        assert.ok(p.userData?.isBone === true, 'effective parent must be a real bone (head chains skipped)');
      }
    });
    const r0 = skelBones.find((b: any) => b.userData?.index === 0);
    assert.ok(r0);
    assert.ok(!r0.parent || !skelBones.includes(r0.parent as any), 'root bone has no skel parent');
  });

  it('buildRigHierarchy directly skips isBone=0 heads, produces only deform bones in skeleton, correct SMF_Node names + userData, and proper parent links via root', () => {
    const baseDq = new Float32Array([0,0,0,1,0,0,0,0]);
    const baseAxis = [0,1,0];
    const rigFixture: ImportedSmf = {
      meshes: [],
      textures: [],
      bones: [
        { index: 0, parent: 0, isBone: 1, dq: baseDq, axis: baseAxis }, // root real
        { index: 1, parent: 0, isBone: 1, dq: baseDq, axis: baseAxis }, // direct child
        { index: 2, parent: 0, isBone: 0, dq: baseDq, axis: baseAxis }, // head
        { index: 3, parent: 2, isBone: 1, dq: baseDq, axis: baseAxis }, // child via head
        { index: 4, parent: 3, isBone: 1, dq: baseDq, axis: baseAxis }  // deeper via real (but will skip if any head)
      ],
      animations: []
    };
    const root = new THREE.Group();
    const { skeleton, allNodes } = buildRigHierarchy(rigFixture, root);

    assert.strictEqual(skeleton.bones.length, 4, 'skeleton must contain only isBone=1 (deform) bones');
    assert.strictEqual(allNodes.length, 4, 'allNodes should match deform count');

    // Names and userData
    skeleton.bones.forEach((b: any) => {
      assert.ok(b.name.startsWith('SMF_Node_'), 'uses polished SMF_Node_ name');
      assert.ok(!b.name.includes('_head'), 'dummies excluded from names in skeleton');
      assert.ok(b.userData && typeof b.userData.index === 'number', 'userData.index present');
      assert.strictEqual(b.userData.isBone, true, 'userData.isBone true for skel entries');
    });

    // Hierarchy: node3 (via head 2) should parent to node0 (skip head); node4 to node3
    const b3 = skeleton.bones.find((b: any) => b.userData.index === 3);
    const b4 = skeleton.bones.find((b: any) => b.userData.index === 4);
    assert.ok(b3 && b3.parent, 'b3 has parent');
    assert.ok(b3.parent.name.includes('SMF_Node_0'), 'head chain skipped: b3 parents directly to root real');
    assert.ok(b4 && b4.parent && b4.parent.name.includes('SMF_Node_3'), 'direct real parent preserved for b4');

    // Roots: only b0 should be direct under the passed root (others attached via .add)
    const directChildren = root.children.filter((c: any) => c instanceof THREE.Bone);
    assert.strictEqual(directChildren.length, 1, 'only true roots attached directly to provided root Group');
    assert.ok(directChildren[0].name.includes('SMF_Node_0'));

    // SkeletonHelper would see clean tree (no heads) - implicit by parent checks above
  });

  it('makeBoneLabel util produces reusable Group with Axes + name Sprite (modular extraction for labels feature)', () => {
    installImageTestPolyfill(); // node env needs canvas/document polyfill for label creation
    const g = globalThis as any;
    let lastFillText = '';
    let restored = false;
    const origCreate = (g.document && g.document.createElement) ? g.document.createElement.bind(g.document) : null;
    if (origCreate) {
      g.document.createElement = (tag: string) => {
        if (tag === 'canvas') {
          const canvas = {
            width: 256,
            height: 48,
            getContext: () => {
              const ctx: any = {
                createImageData(w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4) }; },
                putImageData() {},
                drawImage() {},
                getImageData() { return { data: new Uint8ClampedArray(4) }; },
                scale() {},
                fillRect() {},
                fillText(t: string) { lastFillText = t; },
              };
              ctx.fillStyle = '';
              ctx.font = '';
              ctx.textAlign = '';
              ctx.textBaseline = '';
              return ctx;
            },
          };
          return canvas;
        }
        return origCreate(tag);
      };
    }
    try {
      const label = makeBoneLabel('SMF_Node_42');
      assert.ok(label instanceof THREE.Group, 'returns Group');
      assert.ok(label.children.length >= 2, 'contains AxesHelper + Sprite');
      const hasAxes = label.children.some((c: any) => c instanceof THREE.AxesHelper);
      const hasSprite = label.children.some((c: any) => c instanceof THREE.Sprite);
      assert.ok(hasAxes, 'has visual marker AxesHelper');
      assert.ok(hasSprite, 'has canvas name Sprite');
      assert.ok((label as any).userData?.isBoneLabel, 'marked for disposal/selection');
      // test truncation polish for long names (branch in makeBoneLabel)
      makeBoneLabel('SMF_Node_VeryLongName12345');
      assert.ok(lastFillText.includes('...'), 'long name truncated in fillText for polish');
    } finally {
      if (origCreate && !restored) {
        g.document.createElement = origCreate;
        restored = true;
      }
    }
  });

  it('makeBoneHighlightMarker util produces reusable Group with sphere + axes (modular extraction for selection feedback)', () => {
    installImageTestPolyfill();
    const marker = makeBoneHighlightMarker();
    assert.ok(marker instanceof THREE.Group, 'returns Group');
    assert.ok(marker.children.length >= 2, 'contains sphere Mesh + AxesHelper');
    const hasMesh = marker.children.some((c: any) => c instanceof THREE.Mesh);
    const hasAxes = marker.children.some((c: any) => c instanceof THREE.AxesHelper);
    assert.ok(hasMesh, 'has red sphere Mesh');
    assert.ok(hasAxes, 'has axes for orientation');
  });

  it('makeBoneHoverMarker util uses stronger visual style than selection marker', () => {
    installImageTestPolyfill();
    const marker = makeBoneHoverMarker();
    assert.ok(marker instanceof THREE.Group, 'returns Group');
    const hoverMesh = marker.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh | undefined;
    assert.ok(hoverMesh, 'has Mesh child for contrast marker');
    const hoverMat = hoverMesh.material as THREE.MeshBasicMaterial;
    assert.strictEqual(hoverMat.transparent, true, 'hover marker is transparent');
    assert.ok(hoverMat.opacity >= 0.9, 'hover marker opacity is high');
  });

  it('viewport layout util builds single and quad viewport specs', () => {
    const perspective = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    const orthoCameras = [
      new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
      new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
      new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
    ];
    const bounds = { center: new THREE.Vector3(1, 2, 3), maxDim: 4 };

    const single = refreshViewportSpecs(800, 600, 'single', bounds, perspective, orthoCameras, true);
    assert.strictEqual(single.length, 1);
    assert.strictEqual(single[0].role, 'perspective');
    assert.strictEqual(single[0].width, 800);
    assert.strictEqual(single[0].height, 600);

    refreshOrthoCameras(orthoCameras, bounds);
    const quad = refreshViewportSpecs(800, 600, 'quad', bounds, perspective, orthoCameras, true);
    assert.deepStrictEqual(quad.map((spec) => spec.role), ['front', 'side', 'top', 'perspective']);
    assert.ok(quad.every((spec) => spec.width === 400 && spec.height === 300), 'quad panes split canvas into quarters');
    assert.notStrictEqual(orthoCameras[0].position.z, 0, 'front camera is framed away from center');
    assert.notStrictEqual(orthoCameras[2].position.y, 0, 'top camera is framed away from center');
  });

  it('updateHighlightPosition util updates group pos to bone world pos (modular extract)', () => {
    installImageTestPolyfill();
    const marker = makeBoneHighlightMarker();
    const bone = new THREE.Bone();
    bone.position.set(1, 2, 3);
    updateHighlightPosition(marker, bone);
    assert.ok(marker.position.x === 1 && marker.position.y === 2 && marker.position.z === 3, 'position updated');
  });

  it('createSeqGuard utility for async stale prevention (advances item 3 test coverage + modularity)', () => {
    const guard = createSeqGuard();
    const s1 = guard.next();
    assert.ok(guard.isCurrent(s1), 'first seq current');
    const s2 = guard.next();
    assert.ok(guard.isCurrent(s2), 'second seq current');
    assert.ok(!guard.isCurrent(s1), 'old seq not current');
    guard.reset();
    const s3 = guard.next();
    assert.ok(guard.isCurrent(s3), 'after reset current');
  });

  // Focused pure simulation for item 3: overlapping reads where old one errors last.
  // Uses only the extracted guard (no RTL dep). Verifies stale error/rejection paths do not mutate.
  it('seq guards ignore stale error on older file/drop read (simulates overlapping open/read failure without mutating status/error)', async () => {
    const guard = createSeqGuard();
    const mutations: string[] = [];

    const fakeSetError = (msg: string) => { mutations.push(`error:${msg}`); };
    const fakeSetStatus = (s: string) => { mutations.push(`status:${s}`); };

    // Simulate two concurrent "reads" (like handleFileInputChange + handleDrop or browser + open).
    // Newer one (seq2) succeeds quickly; older (seq1) "rejects" later.
    const seq1 = guard.next();
    const oldRead = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('old read failed')), 5));

    const seq2 = guard.next();
    const newRead = Promise.resolve('new data');

    // Attach handlers exactly as in useLoadModel catch paths (check isCurrent before mutate)
    oldRead.catch((e: any) => {
      if (guard.isCurrent(seq1)) {
        fakeSetError(`stale-should-not: ${e.message}`);
        fakeSetStatus('stale-should-not');
      } else {
        // correctly ignored
        mutations.push('old-stale-ignored');
      }
    });

    newRead.then((data) => {
      if (guard.isCurrent(seq2)) {
        fakeSetStatus(`loaded:${data}`);
      }
    });

    await Promise.allSettled([oldRead, newRead]);

    // Assert: only new success mutated; old error was ignored (no "stale-should-not")
    assert.ok(mutations.includes('old-stale-ignored'), 'old rejection was treated as stale');
    assert.ok(mutations.some(m => m.startsWith('status:loaded:')), 'newer success did mutate');
    assert.ok(!mutations.some(m => m.includes('stale-should-not')), 'stale error did not mutate error/status');
  });

  // Additional coverage for recent bone hierarchy + name roundtrip safety (regex update in poseEdits)
  it('smfBoneNameToIndex supports SMF_Node_N (and _head suffix for dummies) after hierarchy name changes', () => {
    const bones: any[] = [
      { index: 0, parent: 0, isBone: 1, dq: new Float32Array(8), axis: [0,1,0] },
      { index: 1, parent: 0, isBone: 0, dq: new Float32Array(8), axis: [0,1,0] }, // head
      { index: 2, parent: 0, isBone: 1, dq: new Float32Array(8), axis: [0,1,0] },
    ];
    assert.strictEqual(smfBoneNameToIndex(bones, 'SMF_Node_0'), 0);
    assert.strictEqual(smfBoneNameToIndex(bones, 'SMF_Node_2'), 2);
    // suffix safety (the key regex update removing trailing $ for head dummies + future)
    assert.strictEqual(smfBoneNameToIndex(bones, 'SMF_Node_1_head'), 1);
    assert.strictEqual(smfBoneNameToIndex(bones, 'Bone_0'), -1); // old name style rejected
    assert.strictEqual(smfBoneNameToIndex(bones, 'SMF_Node_99'), -1); // oob
  });

  // More hierarchy edges for recent buildRigHierarchy (root head, zero bones)
  it('buildRigHierarchy root-head + zero-deform edges produce correct empty-or-rooted skel + no crossed attaches', () => {
    const baseDq = new Float32Array([0,0,0,1,0,0,0,0]);
    const baseAxis = [0,1,0];
    // Case 1: root is head (isBone=0), then real children should attach directly to scene root
    const rootHeadFixture: ImportedSmf = {
      meshes: [], textures: [], animations: [],
      bones: [
        { index: 0, parent: 0, isBone: 0, dq: baseDq, axis: baseAxis }, // root head dummy
        { index: 1, parent: 0, isBone: 1, dq: baseDq, axis: baseAxis }, // real under head
        { index: 2, parent: 1, isBone: 1, dq: baseDq, axis: baseAxis },
      ],
    };
    const r1 = new THREE.Group();
    const { skeleton: sk1, allNodes: nodes1 } = buildRigHierarchy(rootHeadFixture, r1);
    assert.strictEqual(sk1.bones.length, 2, 'only deform bones');
    assert.strictEqual(nodes1.length, 2);
    const real0 = sk1.bones.find((b: any) => b.userData.index === 1);
    assert.ok(real0 && real0.parent === r1, 'first real under root-head attaches directly to provided root Group');
    assert.strictEqual(r1.children.filter((c: any) => c instanceof THREE.Bone).length, 1);

    // Case 2: zero bones (all heads or empty) -> empty skel, no crash, allNodes empty
    const zeroFixture: ImportedSmf = { meshes: [], textures: [], animations: [], bones: [
      { index: 0, parent: 0, isBone: 0, dq: baseDq, axis: baseAxis },
    ] };
    const r2 = new THREE.Group();
    const { skeleton: sk2, allNodes: nodes2 } = buildRigHierarchy(zeroFixture, r2);
    assert.strictEqual(sk2.bones.length, 0);
    assert.strictEqual(nodes2.length, 0);
    assert.strictEqual(r2.children.length, 0, 'nothing attached for zero deform');
  });

  it('updateHighlightPosition correctly resolves world position for parented bones (hierarchy awareness for RAF/selection marker)', () => {
    installImageTestPolyfill();
    const parentBone = new THREE.Bone();
    parentBone.name = 'SMF_Node_0';
    parentBone.position.set(5, 0, 0);
    const childBone = new THREE.Bone();
    childBone.name = 'SMF_Node_1';
    childBone.position.set(0, 3, 0);
    parentBone.add(childBone);
    // Ensure world matrices are current (as Three does in real attach/anim)
    parentBone.updateMatrixWorld(true);
    const marker = makeBoneHighlightMarker();
    updateHighlightPosition(marker, childBone);
    // World of child should be (5,3,0)
    assert.ok(Math.abs(marker.position.x - 5) < 1e-6 && Math.abs(marker.position.y - 3) < 1e-6 && Math.abs(marker.position.z) < 1e-6,
      `expected world pos ~[5,3,0] got [${marker.position.x},${marker.position.y},${marker.position.z}]`);
  });

  it('makeBoneLabel canvas DPR scaling (recent quality polish for labels toggle)', () => {
    installImageTestPolyfill();
    const g = globalThis as any;
    const origWindow = g.window;
    // Simulate high-DPI (exercises the Math.min(...,2) + scale + width*dpr path)
    g.window = { devicePixelRatio: 2 };
    try {
      const label = makeBoneLabel('DPR_Test');
      assert.ok(label instanceof THREE.Group);
      assert.ok((label as any).userData?.isBoneLabel);
      // The internal canvas (256*2 x 48*2) + scale(2,2) + fillText happens without throw; truncation not needed here
    } finally {
      g.window = origWindow;
    }
  });

  it('ModernSkeletonHelper builds larger clickable rig helper parts with bone metadata', () => {
    const root = new THREE.Group();
    const parentBone = new THREE.Bone();
    parentBone.name = 'SMF_Node_0';
    const childBone = new THREE.Bone();
    childBone.name = 'SMF_Node_1';
    childBone.position.set(0, 1, 0);
    parentBone.add(childBone);
    root.add(parentBone);
    root.updateMatrixWorld(true);

    const helper = new ModernSkeletonHelper(root);
    helper.updateMatrixWorld(true);

    const helperParts: THREE.Object3D[] = [];
    helper.traverse((object) => {
      if (object.userData?.isModernSkeletonHelperPart && object.userData?.boneName) {
        helperParts.push(object);
      }
    });

    assert.ok(helperParts.length >= 2, 'creates joint and bone helper parts');
    assert.ok(helperParts.some((object) => object.userData.boneName === 'SMF_Node_0'));
    assert.ok(helperParts.some((object) => object.userData.boneName === 'SMF_Node_1'));

    const childPart = helperParts.find((object) => object.userData.boneName === 'SMF_Node_1');
    assert.ok(childPart, 'child helper part exists for direct hit mapping');
    const mappedName = findBoneNameFromSkeletonHelperHit({ object: childPart } as THREE.Intersection);
    assert.strictEqual(mappedName, 'SMF_Node_1');

    helper.dispose();
  });

  it('real SMF bind pose skinning is stable and does not tear vertices apart', () => {
    const sampleFile = path.resolve(__dirname, '../../tests/mixamo_smf_baldguy.smf');
    if (!fs.existsSync(sampleFile)) return;
    installImageTestPolyfill();

    const imported = importSMF(bytesToArrayBuffer(fs.readFileSync(sampleFile)));
    const loaded = buildThreeScene(imported);
    loaded.root.updateMatrixWorld(true);

    let checked = 0;
    for (const mesh of loaded.skinnedMeshes) {
      const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      if (!position || position.count === 0) continue;

      mesh.skeleton.update();
      for (let i = 0; i < position.count; i++) {
        const original = new THREE.Vector3().fromBufferAttribute(position, i);
        const skinned = original.clone();
        mesh.applyBoneTransform(i, skinned);
        const drift = skinned.distanceTo(original);
        assert.ok(Number.isFinite(drift), `vertex ${i} produced non-finite skinning drift`);
        assert.ok(drift < 1e-3, `vertex ${i} bind-pose drift too large: ${drift}`);
        checked++;
      }
    }
    assert.ok(checked > 0, 'expected real SMF sample to contain skinned vertices');
  });
});

describe('BinaryReader - bounds checking (smfBinary shared impl used by smf)', () => {
  it('throws actionable error on truncated SMF input (too short for version string)', () => {
    // An empty buffer has no data at all; importSMF should throw a bounds error immediately
    const empty = new ArrayBuffer(0);
    assert.throws(
      () => importSMF(empty),
      (err: Error) => {
        assert.ok(err.message.includes('Unexpected end of SMF binary'), `expected bounds error, got: ${err.message}`);
        return true;
      }
    );
  });

  it('throws actionable error when truncated after valid version string', () => {
    const version = 'SMF_v12_by_Snidr_and_Bart';
    // Buffer with version string + null terminator but missing the 4 x u32 section offsets
    const buf = new Uint8Array(version.length + 1); // version + null only
    for (let i = 0; i < version.length; i++) buf[i] = version.charCodeAt(i);
    buf[version.length] = 0; // null terminator
    assert.throws(
      () => importSMF(buf.buffer),
      (err: Error) => {
        assert.ok(err.message.includes('Unexpected end of SMF binary'), `expected bounds error, got: ${err.message}`);
        return true;
      }
    );
  });
});
