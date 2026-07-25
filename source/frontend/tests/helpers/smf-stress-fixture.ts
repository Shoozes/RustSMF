import { exportSMFToBuffer, type ImportedSmf } from '../../src/loaders';

const DEFAULT_VERTEX_COUNT = 300_000;

export function createSmfStressFixtureInput(vertexCount = DEFAULT_VERTEX_COUNT): {
  name: string;
  mimeType: string;
  buffer: Buffer;
} {
  const boundedVertexCount = Math.max(3, Math.floor(vertexCount / 3) * 3);
  const positions = new Float32Array(boundedVertexCount * 3);
  const normals = new Float32Array(boundedVertexCount * 3);
  const uvs = new Float32Array(boundedVertexCount * 2);
  const tangents = new Float32Array(boundedVertexCount * 4);
  const skinIndices = new Uint16Array(boundedVertexCount * 4);
  const skinWeights = new Float32Array(boundedVertexCount * 4);

  for (let vertex = 0; vertex < boundedVertexCount; vertex += 1) {
    const triangleVertex = vertex % 3;
    const triangle = Math.floor(vertex / 3);
    positions[vertex * 3] = triangleVertex === 1 ? 0.01 : 0;
    positions[vertex * 3 + 1] = triangleVertex === 2 ? 0.01 : 0;
    positions[vertex * 3 + 2] = (triangle % 100) * 0.0001;
    normals[vertex * 3 + 2] = 1;
    uvs[vertex * 2] = triangleVertex === 1 ? 1 : 0;
    uvs[vertex * 2 + 1] = triangleVertex === 2 ? 1 : 0;
    tangents[vertex * 4] = 1;
    tangents[vertex * 4 + 3] = 1;
    skinWeights[vertex * 4] = 1;
  }

  const fixture: ImportedSmf = {
    meshes: [{
      name: 'WorkerStressMesh',
      verts: boundedVertexCount,
      triangles: [],
      texIdx: -1,
      positions,
      normals,
      uvs,
      tangents,
      skinIndices,
      skinWeights,
      visible: 1,
    }],
    textures: [],
    bones: [{
      index: 0,
      parent: 0,
      isBone: 1,
      dq: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]),
      axis: [0, 1, 0],
    }],
    animations: [],
  };

  return {
    name: 'worker-stress.smf',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(exportSMFToBuffer(fixture)),
  };
}
