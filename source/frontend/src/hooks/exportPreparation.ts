import { exportGLB, validateExportedGLB, exportFBX, validateExportedFBX, exportDAE, validateExportedDAE } from '../loaders';
import { runSmfExport } from '../workers/smfCodecClient';
import type { ExportPreset } from '../utils/exportQueue';
import type { ExportSnapshot } from './exportSnapshot';

export async function prepareQueuedExport(snapshot: ExportSnapshot, preset: Readonly<ExportPreset>, signal: AbortSignal, isCurrent: () => boolean): Promise<Uint8Array> {
  const check = () => { if (signal.aborted || !isCurrent()) throw new Error('Export preparation canceled.'); };
  check();
  if (preset.format === 'smf') return (await runSmfExport(snapshot.smf!, { signal })).value;
  const root = snapshot.root!, clips = snapshot.clips;
  const bytes = preset.format === 'glb' ? await exportGLB(root, clips)
    : preset.format === 'fbx' ? await exportFBX(root, clips) : await exportDAE(root, clips);
  check();
  if (preset.format === 'glb') await validateExportedGLB(bytes, root, clips);
  else if (preset.format === 'fbx') await validateExportedFBX(bytes, root, clips);
  else await validateExportedDAE(bytes, root, clips);
  check();
  return bytes;
}
