// Spike S1: verify DA1 (fragments localId == expressID) and DA2 (web-ifc mesh in metres, openings subtracted).
// Usage: node --max-old-space-size=8192 scripts/spike-s1.mjs file.ifc
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as FRAGS from '@thatopen/fragments';
import * as WebIFC from 'web-ifc';
import { analyzeMesh } from '../src/core/geometry.ts';

const file = process.argv[2];
const bytes = new Uint8Array(readFileSync(file));
let t = performance.now();
const lap = (label) => { const n = performance.now(); console.log(`${label}: ${((n - t) / 1000).toFixed(1)}s`); t = n; };

const importer = new FRAGS.IfcImporter();
importer.wasm = { path: resolve('node_modules/web-ifc') + '/', absolute: true };
const frag = await importer.process({ bytes: bytes.slice() });
lap('pass1 IfcImporter');

const api = new WebIFC.IfcAPI();
await api.Init();
const id = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
lap('pass2 OpenModel');

// DA1: compare GUID -> localId (fragments) against GUID -> expressID (web-ifc) for walls/slabs.
const model = new FRAGS.SingleThreadedFragmentsModel('m', frag);
await model.ready;
const ids = [];
for (const type of [WebIFC.IFCWALL, WebIFC.IFCSLAB, WebIFC.IFCBEAM, WebIFC.IFCCOLUMN]) {
  const v = api.GetLineIDsWithType(id, type); for (let i = 0; i < v.size(); i++) ids.push(v.get(i));
}
const guids = ids.map((e) => api.GetLine(id, e).GlobalId.value);
const local = model.getLocalIdsByGuids(guids);
const mismatch = ids.filter((e, i) => local[i] !== e).length;
console.log(`DA1: ${ids.length} elements, ${mismatch} localId != expressID`);

// DA2: mesh volume vs Qto NetVolume for the same elements.
const qto = new Map();
const rels = api.GetLineIDsWithType(id, WebIFC.IFCRELDEFINESBYPROPERTIES);
for (let i = 0; i < rels.size(); i++) {
  const r = api.GetLine(id, rels.get(i));
  const pset = api.GetLine(id, r.RelatingPropertyDefinition.value);
  if (pset.type !== WebIFC.IFCELEMENTQUANTITY) continue;
  for (const q of pset.Quantities) {
    const qq = api.GetLine(id, q.value);
    if (qq.Name.value === 'NetVolume') for (const o of r.RelatedObjects) qto.set(o.value, qq.VolumeValue.value);
  }
}
const vol = new Map();
const valid = new Map();
api.StreamMeshes(id, ids, (mesh) => {
  const pos = [], idx = [];
  for (let g = 0; g < mesh.geometries.size(); g++) {
    const pg = mesh.geometries.get(g);
    const geom = api.GetGeometry(id, pg.geometryExpressID);
    const vs = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
    const ix = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
    const m = pg.flatTransformation, base = pos.length / 3;
    for (let k = 0; k < vs.length; k += 6) {
      const x = vs[k], y = vs[k + 1], z = vs[k + 2];
      pos.push(m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]);
    }
    for (const i of ix) idx.push(base + i);
    geom.delete();
  }
  const q = analyzeMesh(pos, idx);
  vol.set(mesh.expressID, q.volume);
  valid.set(mesh.expressID, q.valid);
});
lap('pass2 StreamMeshes');
const diffs = [];
for (const [e, q] of qto) if (vol.has(e) && q > 0.001 && (process.env.ALL || valid.get(e))) diffs.push({ e, q, m: vol.get(e), err: Math.abs(vol.get(e) - q) / q });
diffs.sort((a, b) => b.err - a.err);
const within = diffs.filter((d) => d.err <= 0.05).length;
console.log(`invalid meshes: ${[...valid.values()].filter((v) => !v).length}/${valid.size}`);
console.log(`DA2: ${diffs.length} elements with NetVolume; ${within} within 5%`);
console.log('worst:', diffs.filter((d)=>api.GetLine(id,d.e).type===WebIFC.IFCWALL).slice(0, 8).map((d) => `${d.e} ${api.GetLine(id, d.e).constructor.name} qto=${d.q.toFixed(3)} mesh=${d.m.toFixed(3)}`));
const byClass = {};
for (const d of diffs) { const c = api.GetLine(id, d.e).constructor.name; (byClass[c] ??= [0, 0])[d.err <= 0.05 ? 0 : 1]++; }
console.log('per class [ok, >5%]:', JSON.stringify(byClass));
const tot = {};
for (const d of diffs) { const c = api.GetLine(id, d.e).constructor.name; const t = (tot[c] ??= { q: 0, m: 0, over: 0, under: 0 }); t.q += d.q; t.m += d.m; if (d.err > 0.05) t[d.m > d.q ? 'over' : 'under']++; }
for (const [c, t] of Object.entries(tot)) console.log(`total ${c}: qto=${t.q.toFixed(1)} mesh=${t.m.toFixed(1)} err=${(100 * (t.m - t.q) / t.q).toFixed(1)}% over=${t.over} under=${t.under}`);
console.log('units sample:', diffs.slice(-3).map((d) => `qto=${d.q.toFixed(3)} mesh=${d.m.toFixed(3)}`));
api.CloseModel(id);
