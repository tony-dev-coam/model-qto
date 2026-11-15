import type { ExtractResult } from './extract';
import type { WorkerResponse } from './ifc.worker';

export type AnalyzeErrorCode = 'not-ifc' | 'out-of-memory' | 'parse';

export interface AnalyzeHandlers {
  onProgress(stage: 'geometry' | 'quantities', progress: number): void;
  onFragments(bytes: Uint8Array): void;
  onElements(result: ExtractResult): void;
  onError(code: AnalyzeErrorCode, message: string): void;
}

/** FILE_SCHEMA of a STEP file ('IFC2X3', 'IFC4'…), or null when the bytes are not an IFC file. */
export function readIfcSchema(bytes: Uint8Array): string | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096)).replace(/^[﻿ï»¿\s]+/, '');
  if (!head.startsWith('ISO-10303-21')) return null;
  return /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(head)?.[1].toUpperCase() ?? null;
}

/**
 * Runs both passes in a short-lived worker (web-ifc memory is fully released when it terminates).
 * Returns a cancel function. Bytes are transferred: the caller must not reuse them.
 */
export function analyzeIfc(bytes: Uint8Array, h: AnalyzeHandlers): () => void {
  if (!readIfcSchema(bytes)) {
    h.onError('not-ifc', 'Not an IFC (STEP) file');
    return () => {};
  }
  const worker = new Worker(new URL('./ifc.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
    if (data.type === 'progress') h.onProgress(data.stage, data.progress);
    else if (data.type === 'fragments') h.onFragments(data.bytes);
    else if (data.type === 'elements') {
      const { type: _, ...result } = data;
      h.onElements(result);
      worker.terminate();
    } else {
      h.onError(data.code, data.message);
      worker.terminate();
    }
  };
  // A worker killed by the browser for memory reasons fires a bare error event without a message.
  worker.onerror = (e) => {
    h.onError(e.message ? 'parse' : 'out-of-memory', e.message || 'Worker crashed');
    worker.terminate();
  };
  worker.postMessage({ bytes }, [bytes.buffer as ArrayBuffer]);
  return () => worker.terminate();
}
