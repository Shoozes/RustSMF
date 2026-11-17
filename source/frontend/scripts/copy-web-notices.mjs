import { copyFile, mkdir } from 'node:fs/promises';

const repo = new URL('../../../', import.meta.url);
const notices = new URL('../dist-pages/licenses/', import.meta.url);
await mkdir(notices, { recursive: true });

const files = [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'THIRD_PARTY_LICENSES.txt',
  'source/frontend/src/vendor/FBXExporter-threejs.LICENSE.txt',
  'source/retarget-core/THREE_LICENSE.txt',
];
await Promise.all(files.map(path => copyFile(
  new URL(path, repo),
  new URL(path.split('/').at(-1), notices),
)));
