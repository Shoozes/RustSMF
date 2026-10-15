import { useCallback, useEffect, useRef, useState } from 'react';
import type { OpenResult } from '../backend-client/tauri';
import { detectModelFormat, isModelArchive } from '../utils/modelFormat';
import { createModelResourceBundle } from '../utils/modelResourceBundle';
import { ArchiveCancelledError, runModelArchive } from '../workers/modelArchiveClient';

export interface ArchiveActivity {
  name: string;
  completed: number;
  total: number;
  models: readonly string[] | null;
}

export function useModelArchive() {
  const [activity, setActivity] = useState<ArchiveActivity | null>(null);
  const active = useRef<AbortController | null>(null);
  const nativeRead = useRef<Promise<Uint8Array> | null>(null);
  const choice = useRef<((name: string) => void) | null>(null);
  const cancel = useCallback(() => {
    active.current?.abort();
    active.current = null;
    choice.current = null;
    setActivity(null);
  }, []);
  useEffect(() => () => { active.current?.abort(); choice.current = null; }, []);

  const prepare = useCallback(async (
    result: OpenResult,
    readNative: (path: string) => Promise<Uint8Array>,
  ): Promise<OpenResult> => {
    if (result.error || !isModelArchive(result.name || result.path)) return result;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const name = result.name || 'archive.zip';
    setActivity({ name, completed: 0, total: 0, models: null });
    try {
      const readSelectedPath = async (path: string) => {
        // Native reads have no abort IPC. Serialize them so repeated cancellation
        // cannot accumulate full-size reads; queued canceled jobs never issue one.
        while (nativeRead.current) await nativeRead.current.catch(() => {});
        controller.signal.throwIfAborted();
        const issued = readNative(path);
        nativeRead.current = issued;
        try { return await issued; }
        finally { if (nativeRead.current === issued) nativeRead.current = null; }
      };
      const input = result.archiveFile ?? result.data ?? (result.path ? readSelectedPath(result.path) : null);
      if (!input) throw new Error('ZIP has no readable data. Select the archive again.');
      const files = await runModelArchive(input, {
        signal: controller.signal,
        transferInput: !!result.path && !result.data && !result.archiveFile,
        onProgress: (completed, total) => {
          if (active.current === controller) setActivity({ name, completed, total, models: null });
        },
      });
      controller.signal.throwIfAborted();
      const models = files.filter(file => detectModelFormat(file.name));
      if (!models.length) throw new Error('ZIP contains no supported model. Choose an archive with SMF, GLB/GLTF, FBX, DAE or OBJ.');
      let selected = models[0].name;
      if (models.length > 1) {
        selected = await new Promise<string>((resolve, reject) => {
          const onCancel = () => reject(new ArchiveCancelledError());
          controller.signal.addEventListener('abort', onCancel, { once: true });
          choice.current = value => {
            controller.signal.removeEventListener('abort', onCancel);
            choice.current = null;
            resolve(value);
          };
          setActivity({ name, completed: files.length, total: files.length, models: models.map(file => file.name) });
        });
      }
      controller.signal.throwIfAborted();
      const primary = models.find(file => file.name === selected);
      if (!primary) throw new Error('Select a model from this ZIP.');
      // Keep resource paths rooted at the archive, but exclude alternate models.
      const bundle = createModelResourceBundle(primary, files.filter(file => !detectModelFormat(file.name)));
      return { name: primary.name, data: primary.data, files: bundle.files, archive: true };
    } catch (error) {
      if (controller.signal.aborted) throw new ArchiveCancelledError();
      throw error;
    } finally {
      // Timeout/worker failure must also retire reads still waiting to be issued.
      controller.abort();
      if (active.current === controller) {
        active.current = null;
        choice.current = null;
        setActivity(null);
      }
    }
  }, []);
  const choose = useCallback((name: string) => choice.current?.(name), []);
  return { activity, prepare, cancel, choose };
}
