import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImportedSmf, SmfCodecProgress } from '../loaders';
import {
  runSmfExport,
  runSmfImport,
  type SmfCodecExecution,
  type SmfCodecRunResult,
} from '../workers/smfCodecClient';

export interface SmfCodecActivity {
  operation: 'import' | 'export';
  execution: SmfCodecExecution;
  phase: SmfCodecProgress['phase'];
  percent: number;
}

type StatusWriter = (message: string) => void;

export function useSmfCodecTask(setStatus: StatusWriter) {
  const setStatusRef = useRef(setStatus);
  const activeControllerRef = useRef<AbortController | null>(null);
  const [smfCodecActivity, setSmfCodecActivity] = useState<SmfCodecActivity | null>(null);

  useEffect(() => {
    setStatusRef.current = setStatus;
  }, [setStatus]);

  const cancelActiveSmfCodec = useCallback(() => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    setSmfCodecActivity(null);
  }, []);

  const runSmfCodecTask = useCallback(async <T,>(
    operation: SmfCodecActivity['operation'],
    isCurrent: () => boolean,
    run: (
      signal: AbortSignal,
      onProgress: (progress: SmfCodecProgress) => void,
      onFallback: (reason: string) => void,
    ) => Promise<SmfCodecRunResult<T>>,
  ): Promise<SmfCodecRunResult<T>> => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    let execution: SmfCodecExecution = 'worker';

    const ownsCurrentTask = (): boolean => (
      activeControllerRef.current === controller && isCurrent()
    );
    const updateProgress = (progress: SmfCodecProgress): void => {
      if (!ownsCurrentTask()) return;
      setSmfCodecActivity({
        operation,
        execution,
        phase: progress.phase,
        percent: progress.percent,
      });
      setStatusRef.current(
        `${operation === 'import' ? 'Loading' : 'Exporting'} SMF ${progress.phase}: ${progress.percent}%`,
      );
    };
    const useFallback = (reason: string): void => {
      if (!ownsCurrentTask()) return;
      execution = 'sync-fallback';
      setSmfCodecActivity({
        operation,
        execution,
        phase: 'header',
        percent: 0,
      });
      setStatusRef.current(
        `${operation === 'import' ? 'Loading' : 'Exporting'} SMF with synchronous fallback. ${reason}`,
      );
    };

    setSmfCodecActivity({
      operation,
      execution,
      phase: 'header',
      percent: 0,
    });

    try {
      return await run(controller.signal, updateProgress, useFallback);
    } finally {
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
        if (isCurrent()) setSmfCodecActivity(null);
      }
    }
  }, []);

  const importSmfInWorker = useCallback((
    buffer: ArrayBuffer,
    isCurrent: () => boolean,
  ) => runSmfCodecTask('import', isCurrent, (signal, onProgress, onFallback) => (
    runSmfImport(buffer, { signal, onProgress, onFallback })
  )), [runSmfCodecTask]);

  const exportSmfInWorker = useCallback((
    source: ImportedSmf,
    isCurrent: () => boolean,
  ) => runSmfCodecTask('export', isCurrent, (signal, onProgress, onFallback) => (
    runSmfExport(source, { signal, onProgress, onFallback })
  )), [runSmfCodecTask]);

  useEffect(() => () => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
  }, []);

  return {
    smfCodecActivity,
    cancelActiveSmfCodec,
    importSmfInWorker,
    exportSmfInWorker,
  };
}
