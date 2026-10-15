import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';

// Independent ZIP writer; generated model/resource bytes retain their own provenance.
export function archiveInput(files: Record<string, Uint8Array>, name = 'model-bundle.zip', stored = false) {
  return { name, mimeType: 'application/zip', buffer: Buffer.from(zipSync(files, { level: stored ? 0 : 6 })) };
}
