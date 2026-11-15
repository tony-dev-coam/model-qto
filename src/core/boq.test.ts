import { describe, expect, it } from 'vitest';
import { buildBoq, defaultUnits, filteredOutIds, locate, priceKeyOf, type BoqRow } from './boq';
import type { Element } from './extract';

let nextId = 1;
function el(p: Partial<Element>): Element {
  return {
    expressId: nextId++,
    globalId: '',
    ifcClass: 'IfcWall',
    typeName: 'W200',
    material: 'Concrete',
    storey: 'L1',
    source: { volume: 'qto', area: 'qto', length: undefined },
    warnings: [],
    volume: 1,
    area: 5,
    ...p,
  };
}

const NO_FILTER = { storeys: [], hiddenClasses: [] };
const find = (rows: BoqRow[], ...labels: string[]): BoqRow => {
  let row: BoqRow | undefined;
  let list = rows;
  for (const l of labels) {
    row = list.find((r) => r.label === l);
    if (!row) throw new Error(`no row ${labels.join(' > ')}`);
    list = row.children ?? [];
  }
  return row!;
};

describe('buildBoq', () => {
  const layered = [el({ expressId: 100, material: 'Concrete', volume: 0.75 }), el({ expressId: 100, material: 'Plaster', volume: 0.25 })];
  const elements = [
    ...layered,
    el({ volume: 2 }),
    el({ storey: 'L2', volume: 3 }),
    el({ ifcClass: 'IfcDoor', typeName: 'D1', material: 'Wood', volume: undefined, area: 2, source: { volume: undefined, area: 'qto', length: undefined } }),
  ];
  const prices = { [priceKeyOf(elements[0])]: { unit: 'm3' as const, unitPrice: 100 } };

  it('groups class → type → material by default and counts distinct elements', () => {
    const { rows } = buildBoq(elements, prices, ['ifcClass', 'typeName', 'material'], NO_FILTER);
    expect(rows.map((r) => r.label)).toEqual(['IfcDoor', 'IfcWall']);
    const wall = find(rows, 'IfcWall');
    expect(wall.count).toBe(3); // the layered wall counts once
    expect(find(rows, 'IfcWall', 'W200', 'Concrete').count).toBe(3);
    expect(find(rows, 'IfcWall', 'W200', 'Plaster').count).toBe(1);
  });

  it('prices leaves in their unit and sums amounts upward', () => {
    const { rows, total } = buildBoq(elements, prices, ['ifcClass', 'typeName', 'material'], NO_FILTER);
    const concrete = find(rows, 'IfcWall', 'W200', 'Concrete');
    expect(concrete).toMatchObject({ unit: 'm3', unitPrice: 100, quantity: 5.75, amount: 575 });
    expect(find(rows, 'IfcWall').amount).toBe(575);
    expect(total).toBe(575);
  });

  it('keeps the price key at the leaf when grouping by storey first', () => {
    const { rows, total } = buildBoq(elements, prices, ['storey', 'ifcClass'], NO_FILTER);
    const l1 = find(rows, 'L1', 'IfcWall', 'W200 · Concrete');
    const l2 = find(rows, 'L2', 'IfcWall', 'W200 · Concrete');
    expect(l1.priceKey).toBe(l2.priceKey);
    expect(l1.quantity).toBe(2.75);
    expect(l2.quantity).toBe(3);
    expect(total).toBe(575);
  });

  it('applies storey and class filters', () => {
    const { rows } = buildBoq(elements, prices, ['ifcClass'], { storeys: ['L2'], hiddenClasses: [] });
    expect(find(rows, 'IfcWall').count).toBe(1);
    expect(buildBoq(elements, prices, ['ifcClass'], { storeys: [], hiddenClasses: ['IfcWall'] }).rows.map((r) => r.label)).toEqual(['IfcDoor']);
  });

  it('reports the source of the quantity in the chosen unit and flags missing values', () => {
    const mixed = [el({ volume: 1, source: { volume: 'qto', area: 'qto', length: undefined } }), el({ volume: 2, source: { volume: 'geometry', area: 'qto', length: undefined }, warnings: ['mesh-invalid'] }), el({ volume: undefined, source: { volume: undefined, area: 'qto', length: undefined } })];
    const { rows } = buildBoq(mixed, {}, ['ifcClass', 'typeName', 'material'], NO_FILTER);
    const leaf = find(rows, 'IfcWall', 'W200', 'Concrete');
    expect(leaf.unit).toBe('m3');
    expect(leaf.sources).toEqual(['qto', 'geometry']);
    expect(leaf.warnings).toEqual(['mesh-invalid', 'missing-quantity']);
    expect(leaf.expressIds).toHaveLength(3);
  });

  it('counts pieces when the unit is count', () => {
    const { rows } = buildBoq(elements, {}, ['ifcClass', 'typeName', 'material'], NO_FILTER);
    expect(find(rows, 'IfcDoor', 'D1', 'Wood')).toMatchObject({ unit: 'count', quantity: 1, sources: [] });
  });
});

describe('defaultUnits', () => {
  it('prefers volume, then area, then length, and counts doors and windows', () => {
    const units = defaultUnits([
      el({ ifcClass: 'IfcWall' }),
      el({ ifcClass: 'IfcCurtainWall', volume: undefined, area: 30 }),
      el({ ifcClass: 'IfcRailing', volume: undefined, area: undefined, length: 12 }),
      el({ ifcClass: 'IfcWindow', volume: 0.1, area: 2 }),
      el({ ifcClass: 'IfcBuildingElementProxy', volume: undefined, area: undefined }),
    ]);
    expect(Object.values(units)).toEqual(['m3', 'm2', 'm', 'count', 'count']);
  });
});

describe('locate', () => {
  it('finds the first leaf containing an element and the keys of its ancestors', () => {
    const els = [el({ expressId: 7, material: 'Concrete' }), el({ expressId: 7, material: 'Plaster' }), el({ expressId: 8, ifcClass: 'IfcSlab' })];
    const { rows } = buildBoq(els, {}, ['ifcClass', 'typeName', 'material'], NO_FILTER);
    expect(locate(rows, 7)).toEqual({ leaf: find(rows, 'IfcWall', 'W200', 'Concrete'), ancestors: ['/IfcWall', '/IfcWall/W200'] });
    expect(locate(rows, 999)).toBeNull();
  });
});

describe('filteredOutIds', () => {
  it('lists elements hidden by the storey or class filter, once each', () => {
    const els = [el({ expressId: 1, storey: 'L1' }), el({ expressId: 1, storey: 'L1', material: 'Plaster' }), el({ expressId: 2, storey: 'L2' }), el({ expressId: 3, ifcClass: 'IfcSlab', storey: 'L2' })];
    expect(filteredOutIds(els, { storeys: ['L2'], hiddenClasses: ['IfcSlab'] })).toEqual([1, 3]);
    expect(filteredOutIds(els, NO_FILTER)).toEqual([]);
  });
});
