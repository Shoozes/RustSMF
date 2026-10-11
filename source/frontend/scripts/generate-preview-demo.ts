import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { installNodeThreeRuntime } from './node-three-runtime';
import { createPreviewDemo } from '../src/utils/previewDemo';

installNodeThreeRuntime();
const { scene, clips } = createPreviewDemo();
const output = fileURLToPath(new URL('../../../examples/rustsmf-demo.glb', import.meta.url));
const result = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips });
if (!(result instanceof ArrayBuffer)) throw new Error('Demo export did not produce a GLB');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, new Uint8Array(result));
console.log(`Generated ${path.basename(output)} (${result.byteLength} bytes); 5 bones, 2 clips, 240 vertices.`);
