// Prints a summary of extractElements() for an IFC file: npx tsx scripts/extract-summary.ts file.ifc
import { readFileSync } from 'node:fs';
import * as WebIFC from 'web-ifc';
import { extractElements } from '../src/core/extract.ts';

const api = new WebIFC.IfcAPI();
await api.Init();
const id = api.OpenModel(new Uint8Array(readFileSync(process.argv[2])), { COORDINATE_TO_ORIGIN: true });
const t = performance.now();
const r = extractElements(api, id);
console.log(`schema ${r.schema}, ${r.elements.length} rows, ${((performance.now() - t) / 1000).toFixed(1)}s, file warnings ${r.warnings}`);
const groups = new Map<string, { ids: Set<number>; v: number; src: Set<string>; warn: number }>();
for (const e of r.elements) {
  const k = `${e.ifcClass} | ${e.typeName} | ${e.material}`;
  const g = groups.get(k) ?? { ids: new Set(), v: 0, src: new Set(), warn: 0 };
  g.ids.add(e.expressId); g.v += e.volume ?? 0; if (e.source.volume) g.src.add(e.source.volume); if (e.warnings.includes('mesh-invalid')) g.warn++;
  groups.set(k, g);
}
console.log(`${groups.size} BOQ leaf rows`);
for (const [k, g] of [...groups].sort((a, b) => b[1].v - a[1].v).slice(0, 15)) console.log(`${g.ids.size}\t${g.v.toFixed(2)} m3\t${[...g.src]}\t${g.warn ? '⚠' + g.warn : ''}\t${k}`);
