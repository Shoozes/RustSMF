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
  const triangleCount = boundedVertexCount / 3;
  const gridWidth = Math.ceil(Math.sqrt(triangleCount));
  const triangleSize = 0.001;
  const gridStep = triangleSize * 2;
  const triangles = Array.from({ length: triangleCount }, (_, triangle) => [
    triangle * 3,
    triangle * 3 + 1,
    triangle * 3 + 2,
  ]);

  for (let vertex = 0; vertex < boundedVertexCount; vertex += 1) {
    const triangleVertex = vertex % 3;
    const triangle = Math.floor(vertex / 3);
    const originX = (triangle % gridWidth) * gridStep;
    const originY = Math.floor(triangle / gridWidth) * gridStep;
    positions[vertex * 3] = originX + (triangleVertex === 1 ? triangleSize : 0);
    positions[vertex * 3 + 1] = originY + (triangleVertex === 2 ? triangleSize : 0);
    positions[vertex * 3 + 2] = 0;
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
      triangles,
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
