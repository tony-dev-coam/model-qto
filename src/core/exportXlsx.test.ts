import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildBoq, priceKeyOf } from './boq';
import type { Element } from './extract';
import { exportXlsx } from './exportXlsx';

const el = (id: number, p: Partial<Element>): Element => ({
  expressId: id, globalId: '', ifcClass: 'IfcWall', typeName: 'W200', material: 'Concrete', storey: 'L1',
  source: { volume: 'qto', area: 'qto', length: undefined }, warnings: [], volume: 1, area: 5, ...p,
});

describe('exportXlsx', async () => {
  const elements = [
    el(1, { volume: 2 }),
    el(2, { volume: 3, source: { volume: 'geometry', area: 'qto', length: undefined } }),
    el(3, { material: 'Plaster', volume: 0.5 }),
    el(4, { ifcClass: 'IfcDoor', typeName: 'D1', material: 'Wood', volume: undefined, area: 2 }),
  ];
  const prices = {
    [priceKeyOf(elements[0])]: { unit: 'm3' as const, unitPrice: 100 },
    [priceKeyOf(elements[3])]: { unit: 'count' as const, unitPrice: 250 },
  };
  const { rows, total } = buildBoq(elements, prices, ['ifcClass', 'typeName'], { storeys: [], hiddenClasses: [] });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await exportXlsx(rows, { fileName: 'demo.ifc', schema: 'IFC4', total }));
  const ws = wb.getWorksheet('BOQ')!;
  const byLabel = (label: string) => {
    let found: ExcelJS.Row | undefined;
    ws.eachRow((r) => { if (r.getCell(2).value === label) found = r; });
    if (!found) throw new Error(label);
    return found;
  };

  it('writes a header row', () => {
    expect(ws.getRow(1).values).toEqual([, 'No.', 'Item', 'Source', 'Count', 'Unit', 'Quantity', 'Unit price', 'Amount']);
  });

  it('keeps the grouping as outline levels with hierarchical numbering', () => {
    expect(byLabel('IfcWall').outlineLevel ?? 0).toBe(0);
    expect(byLabel('W200').outlineLevel).toBe(1);
    expect(byLabel('Concrete').outlineLevel).toBe(2);
    expect(byLabel('Concrete').getCell(1).value).toBe('2.1.1');
  });

  it('uses formulas for amounts, with cached results', () => {
    const concrete = byLabel('Concrete');
    expect(concrete.getCell(3).value).toBe('Qto + Computed');
    expect(concrete.getCell(6).value).toBe(5);
    expect(concrete.getCell(8).value).toMatchObject({ formula: `F${concrete.number}*G${concrete.number}`, result: 500 });
    const wall = byLabel('IfcWall');
    expect((wall.getCell(8).value as ExcelJS.CellFormulaValue).formula).toMatch(/^SUBTOTAL\(9,H\d+:H\d+\)$/);
    expect((wall.getCell(8).value as ExcelJS.CellFormulaValue).result).toBe(500);
  });

  it('ends with a grand total equal to the web total', () => {
    const last = ws.getRow(ws.rowCount);
    expect(last.getCell(2).value).toBe('Total');
    expect(last.getCell(8).value).toMatchObject({ formula: `SUBTOTAL(9,H2:H${ws.rowCount - 1})`, result: total });
    expect(total).toBe(750);
  });

  it('adds an info sheet with the disclaimer', () => {
    const info = wb.getWorksheet('Info')!;
    const text: string[] = [];
    info.eachRow((r) => text.push(String(r.getCell(2).value)));
    expect(text).toContain('demo.ifc');
    expect(text.join(' ')).toMatch(/indicative/);
  });
});
