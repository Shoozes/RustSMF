import { buildGlbContainer, parseGlbContainer } from '../../src/utils/glbContainer';
import { createSkinnedGlbFixtureInputWithOptions } from './skinned-glb-fixture';

/** First-party glTF Hermite curves, including nonzero tangents over a two-second interval. */
export async function createCubicRetargetFixtureInput(options: { linearRotation?: boolean } = {}) {
  const fixture = await createSkinnedGlbFixtureInputWithOptions({ clipName: 'Cubic Motion', clipDuration: 2 });
  const { json, binary } = parseGlbContainer(fixture.buffer);
  const animation = json.animations![0];
  const channels = animation.channels as { sampler: number; target: { node: number; path: string } }[];
  const buffers = [Buffer.from(binary)];
  let byteLength = binary.byteLength;
  const append = (values: number[], type: string): number => {
    const data = new Float32Array(values);
    const bufferView = json.bufferViews!.length;
    json.bufferViews!.push({ buffer: 0, byteOffset: byteLength, byteLength: data.byteLength });
    buffers.push(Buffer.from(data.buffer)); byteLength += data.byteLength;
    const accessor = json.accessors!.length;
    json.accessors!.push({ bufferView, componentType: 5126, count: 6, type });
    return accessor;
  };
  for (const channel of channels) {
    if (options.linearRotation && channel.target.path === 'rotation') continue;
    const sampler = animation.samplers[channel.sampler];
    sampler.interpolation = 'CUBICSPLINE';
    sampler.output = channel.target.path === 'rotation'
      ? append([0,0,0,0, 0,0,0,1, 0,0,.6,0, 0,0,0,0, 0,0,Math.SQRT1_2,Math.SQRT1_2, 0,0,0,0], 'VEC4')
      : append([0,0,0, 0,0,0, 1,0,0, 0,0,0, 2,0,0, 0,0,0], 'VEC3');
  }
  const rotation = channels.find(channel => channel.target.path === 'rotation')!;
  channels.push({ sampler: animation.samplers.length, target: { node: rotation.target.node, path: 'scale' } });
  animation.samplers.push({ input: animation.samplers[0].input, interpolation: 'CUBICSPLINE',
    output: append([0,0,0, 1,1,1, .25,0,0, 0,0,0, 1.5,1,1, 0,0,0], 'VEC3') });
  json.buffers = [{ byteLength }];
  return { name: 'generated-cubic-retarget.glb', mimeType: 'model/gltf-binary',
    buffer: Buffer.from(buildGlbContainer(json, Buffer.concat(buffers))) };
}
