import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as WebIFC from 'web-ifc';
import { extractElements, type Element } from './extract';

let api: WebIFC.IfcAPI;
beforeAll(async () => {
  api = new WebIFC.IfcAPI();
  await api.Init();
});

function extract(path: string, opts?: Parameters<typeof extractElements>[2]) {
  const id = api.OpenModel(new Uint8Array(readFileSync(path)), { COORDINATE_TO_ORIGIN: true });
  try {
    return extractElements(api, id, opts);
  } finally {
    api.CloseModel(id);
  }
}

describe('extractElements on the hand-written fixture', () => {
  let els: Element[];
  let result: ReturnType<typeof extractElements>;
  beforeAll(() => {
    result = extract('src/core/fixtures/mini.ifc');
    els = result.elements;
  });
  const byName = (globalId: string) => els.filter((e) => e.globalId === globalId);

  it('reports the schema', () => {
    expect(result.schema).toBe('IFC4');
  });

  it('splits a layered wall per material, volume by thickness', () => {
    const [concrete, plaster] = byName('0040');
    expect(concrete).toMatchObject({ ifcClass: 'IfcWall', typeName: 'Basic Wall 200', material: 'Concrete', storey: 'Level 1' });
    expect(plaster).toMatchObject({ material: 'Plaster' });
    expect(concrete.volume).toBeCloseTo(2.25);
    expect(plaster.volume).toBeCloseTo(0.75);
    expect(concrete.area).toBeCloseTo(15);
    expect(plaster.area).toBeCloseTo(15);
    expect(concrete.source).toEqual({ volume: 'geometry', area: 'geometry', length: undefined });
    expect(concrete.warnings).toContain('layer-split');
  });

  it('uses Qto with per-dimension unit conversion (length in mm, volume in m³)', () => {
    const [w2] = byName('0070');
    expect(w2).toMatchObject({ material: '(Unassigned)', typeName: 'Basic Wall 200', length: 4, area: 12, volume: 2.4 });
    expect(w2.source).toEqual({ volume: 'qto', area: 'qto', length: 'qto' });
  });

  it('counts only leaf elements of an aggregate and ignores the parent Qto', () => {
    expect(byName('0080')).toEqual([]);
    const flights = [...byName('0081'), ...byName('0082')];
    expect(flights).toHaveLength(2);
    for (const f of flights) expect(f).toMatchObject({ ifcClass: 'IfcStairFlight', parent: 'Stair 1', storey: 'Level 1', volume: 1 });
  });

  it('splits a Revit-style constituent set by the per-material Width complex quantities', () => {
    const [core, finish] = byName('0110');
    expect(core).toMatchObject({ material: 'Concrete' });
    expect(finish).toMatchObject({ material: 'Plaster' });
    expect(core.volume).toBeCloseTo(6);
    expect(finish.volume).toBeCloseTo(2);
  });

  it('joins constituent names when no widths are known (doors, windows)', () => {
    expect(byName('0130')).toEqual([expect.objectContaining({ material: 'Concrete + Plaster' })]);
  });

  it('keeps elements with nothing known under (Unassigned)', () => {
    const [slab] = byName('0100');
    expect(slab).toMatchObject({ typeName: '(Unassigned)', material: '(Unassigned)', storey: '(Unassigned)' });
    expect(slab.warnings).toContain('no-geometry');
  });
});

describe.skipIf(!existsSync('public/samples/office_str.ifc'))('extractElements on office_str.ifc (Tekla, IFC4)', () => {
  let els: Element[];
  let model: number;
  beforeAll(() => {
    model = api.OpenModel(new Uint8Array(readFileSync('public/samples/office_str.ifc')), { COORDINATE_TO_ORIGIN: true });
    els = extractElements(api, model).elements;
  });
  afterAll(() => api.CloseModel(model));

  it('counts exactly the IFC entities per class (walls, columns, beams are not aggregated here)', () => {
    const distinct = (cls: string) => new Set(els.filter((e) => e.ifcClass === cls).map((e) => e.expressId)).size;
    const entities = (...types: number[]) => types.reduce((n, t) => n + api.GetLineIDsWithType(model, t).size(), 0);
    expect(distinct('IfcWall')).toBe(entities(WebIFC.IFCWALL, WebIFC.IFCWALLSTANDARDCASE));
    expect(distinct('IfcColumn')).toBe(entities(WebIFC.IFCCOLUMN));
    expect(distinct('IfcBeam')).toBe(entities(WebIFC.IFCBEAM));
  });

  it('reads Qto volumes for every wall', () => {
    const walls = els.filter((e) => e.ifcClass === 'IfcWall');
    expect(walls.length).toBeGreaterThan(0);
    expect(walls.every((w) => w.source.volume === 'qto')).toBe(true);
  });
});

const ARC = `${homedir()}/bim-samples/office_arc.ifc`;
// Accuracy criterion: geometry totals per class within 5% of Qto, on files that have both sources.
describe.each([
  ['office_str', 'public/samples/office_str.ifc'],
  ['office_arc', ARC],
])('geometry vs Qto on %s', (_, path) => {
  it.skipIf(!existsSync(path))('geometry volume totals per class are within 5% of Qto (valid meshes)', () => {
    const qto = extract(path).elements;
    const geo = extract(path, { forceGeometry: true }).elements;
    const qtoVol = new Map(qto.filter((e) => e.source.volume === 'qto').map((e) => [`${e.expressId}|${e.material}`, e.volume!]));
    const totals = new Map<string, { q: number; g: number }>();
    for (const e of geo) {
      const q = qtoVol.get(`${e.expressId}|${e.material}`);
      if (q === undefined || e.volume === undefined || e.warnings.includes('mesh-invalid')) continue;
      const t = totals.get(e.ifcClass) ?? { q: 0, g: 0 };
      t.q += q;
      t.g += e.volume;
      totals.set(e.ifcClass, t);
    }
    expect(totals.size).toBeGreaterThan(0);
    for (const [cls, t] of totals) if (t.q > 1) expect(Math.abs(t.g - t.q) / t.q, cls).toBeLessThanOrEqual(0.05);
  });
});

afterAll(() => api?.Dispose?.());
