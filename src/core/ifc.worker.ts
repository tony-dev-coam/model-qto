// Two sequential passes over one IFC file, off the main thread:
// 1. FRAGS.IfcImporter → fragments bytes for the viewer (posted as soon as ready).
// 2. web-ifc → Element[] for the BOQ.
import * as FRAGS from '@thatopen/fragments';
import * as WebIFC from 'web-ifc';
import { extractElements, type ExtractResult } from './extract';

export type WorkerRequest = { bytes: Uint8Array };
export type WorkerResponse =
  | { type: 'progress'; stage: 'geometry' | 'quantities'; progress: number }
  | { type: 'fragments'; bytes: Uint8Array }
  | ({ type: 'elements' } & ExtractResult)
  | { type: 'error'; code: 'out-of-memory' | 'parse'; message: string };

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, { transfer });

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    const importer = new FRAGS.IfcImporter();
    importer.wasm = { path: import.meta.env.BASE_URL + 'vendor/', absolute: true };
    const frag = await importer.process({
      bytes: data.bytes,
      progressCallback: (progress) => post({ type: 'progress', stage: 'geometry', progress }),
    });
    post({ type: 'fragments', bytes: frag }, [frag.buffer as ArrayBuffer]);

    const api = new WebIFC.IfcAPI();
    api.SetWasmPath(import.meta.env.BASE_URL + 'vendor/', true);
    await api.Init();
    const modelID = api.OpenModel(data.bytes, { COORDINATE_TO_ORIGIN: true });
    try {
      const result = extractElements(api, modelID, {
        onProgress: (progress) => post({ type: 'progress', stage: 'quantities', progress }),
      });
      post({ type: 'elements', ...result });
    } finally {
      api.CloseModel(modelID);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    post({ type: 'error', code: /memory|allocation/i.test(message) ? 'out-of-memory' : 'parse', message });
  }
};
