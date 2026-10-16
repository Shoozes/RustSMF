import { PNG } from 'pngjs';

export const texturePixels = Buffer.from([255, 80, 0, 255, 0, 80, 255, 255, 0, 80, 255, 255, 255, 80, 0, 255]);
export function textureInput() {
  const image = new PNG({ width: 2, height: 2 }); image.data = Buffer.from(texturePixels);
  const buffer = PNG.sync.write(image);
  if (!PNG.sync.read(buffer).data.equals(texturePixels)) throw new Error('Generated PNG did not decode correctly.');
  return { name: 'texture.png', mimeType: 'image/png', buffer };
}

export function objResourceInputs() {
  return [
    { name: 'triangle.obj', mimeType: 'text/plain', buffer: Buffer.from('mtllib coat.mtl\nv -1 0 0\nv 1 0 0\nv 0 2 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl Coat\nf 1/1 2/2 3/3\n') },
    { name: 'coat.mtl', mimeType: 'text/plain', buffer: Buffer.from('newmtl Coat\nKd 1 1 1\nmap_Kd texture.png\n') }, textureInput(),
  ];
}

export function daeFixture(textured = false) {
  const matrix = (x: number) => `1 0 0 ${x} 0 1 0 0 0 0 1 0 0 0 0 1`;
  const image = textured ? '<library_images><image id="coat-image"><init_from>texture.png</init_from></image></library_images>' : '';
  const params = textured ? '<newparam sid="coat-surface"><surface type="2D"><init_from>coat-image</init_from></surface></newparam><newparam sid="coat-sampler"><sampler2D><source>coat-surface</source></sampler2D></newparam>' : '';
  const diffuse = textured ? '<texture texture="coat-sampler" texcoord="UVSET0"/>' : '<color>0.2 0.5 0.7 1</color>';
  const xml = `<?xml version="1.0"?><COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>${image}
<library_effects><effect id="coat-effect"><profile_COMMON>${params}<technique sid="common"><lambert><diffuse>${diffuse}</diffuse></lambert></technique></profile_COMMON></effect></library_effects>
<library_materials><material id="coat"><instance_effect url="#coat-effect"/></material></library_materials>
<library_geometries><geometry id="triangle"><mesh>
<source id="positions"><float_array id="positions-array" count="9">-1 0 0 1 0 0 0 2 0</float_array><technique_common><accessor source="#positions-array" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<source id="uv"><float_array id="uv-array" count="6">0 0 1 0 0 1</float_array><technique_common><accessor source="#uv-array" count="3" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>
<vertices id="vertices"><input semantic="POSITION" source="#positions"/></vertices><triangles count="1" material="coat"><input semantic="VERTEX" source="#vertices" offset="0"/><input semantic="TEXCOORD" source="#uv" offset="1" set="0"/><p>0 0 1 1 2 2</p></triangles></mesh></geometry></library_geometries>
<library_animations><animation id="travel"><source id="times"><float_array id="times-array" count="3">0 0.5 1</float_array><technique_common><accessor source="#times-array" count="3" stride="1"><param name="TIME" type="float"/></accessor></technique_common></source>
<source id="transforms"><float_array id="transforms-array" count="48">${[0, 1, 2].map(matrix).join(' ')}</float_array><technique_common><accessor source="#transforms-array" count="3" stride="16"><param name="TRANSFORM" type="float4x4"/></accessor></technique_common></source>
<sampler id="travel-sampler"><input semantic="INPUT" source="#times"/><input semantic="OUTPUT" source="#transforms"/></sampler><channel source="#travel-sampler" target="Motion/transform"/></animation></library_animations>
<library_animation_clips><animation_clip id="travel-clip" name="Travel" start="0" end="1"><instance_animation url="#travel"/></animation_clip></library_animation_clips>
<library_visual_scenes><visual_scene id="scene"><node id="Motion"><matrix sid="transform">${matrix(0)}</matrix><node id="Surface" name="Surface"><instance_geometry url="#triangle"><bind_material><technique_common><instance_material symbol="coat" target="#coat"><bind_vertex_input semantic="UVSET0" input_semantic="TEXCOORD" input_set="0"/></instance_material></technique_common></bind_material></instance_geometry></node></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#scene"/></scene></COLLADA>`;
  return { name: 'triangle.dae', mimeType: 'model/vnd.collada+xml', buffer: Buffer.from(xml) };
}

export function unnamedAnimatedGltf() {
  const data = Buffer.from(new Float32Array([-1, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, .5, 1, 0, 0, 0, 1, 0, 0, 2, 0, 0]).buffer);
  const document = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ children: [1] }, { name: 'Surface', mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 } }] }],
    buffers: [{ uri: `data:application/octet-stream;base64,${data.toString('base64')}`, byteLength: data.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 }, { buffer: 0, byteOffset: 72, byteLength: 12 }, { buffer: 0, byteOffset: 84, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 2, 0] }, { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: 3, type: 'SCALAR', min: [0], max: [1] }, { bufferView: 3, componentType: 5126, count: 3, type: 'VEC3' }],
    animations: [{ name: 'Travel', channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }], samplers: [{ input: 2, output: 3, interpolation: 'LINEAR' }] }] };
  return { name: 'unnamed.gltf', mimeType: 'model/gltf+json', buffer: Buffer.from(JSON.stringify(document)) };
}
