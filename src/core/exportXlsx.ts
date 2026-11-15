// BOQ tree → .xlsx with outline groups and live formulas (amount = qty × price, SUBTOTAL for groups).
import ExcelJS from 'exceljs';
import type { BoqRow } from './boq';
import { DISCLAIMER, sourceLabel, UNIT_LABEL } from './labels';

export interface ExportMeta {
  fileName: string;
  schema: string;
  total: number;
}

const MONEY = '#,##0';
const QTY = '#,##0.00';

export async function exportXlsx(rows: BoqRow[], meta: ExportMeta): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('BOQ', { views: [{ state: 'frozen', ySplit: 1 }], properties: { outlineLevelRow: 0 } });
  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
  ws.columns = [
    { header: 'No.', width: 10 },
    { header: 'Item', width: 48 },
    { header: 'Source', width: 16 },
    { header: 'Count', width: 9 },
    { header: 'Unit', width: 8 },
    { header: 'Quantity', width: 14, style: { numFmt: QTY } },
    { header: 'Unit price', width: 14, style: { numFmt: MONEY } },
    { header: 'Amount', width: 16, style: { numFmt: MONEY } },
  ];
  ws.getRow(1).font = { bold: true };

  function write(list: BoqRow[], depth: number, prefix: string) {
    list.forEach((row, i) => {
      const stt = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      const r = ws.addRow([stt, row.label, sourceLabel(row), row.count]);
      r.outlineLevel = depth;
      const n = r.number;
      if (row.children) {
        r.font = { bold: true };
        write(row.children, depth + 1, stt);
        r.getCell(8).value = { formula: `SUBTOTAL(9,H${n + 1}:H${ws.rowCount})`, result: row.amount };
      } else {
        r.getCell(5).value = UNIT_LABEL[row.unit!];
        r.getCell(6).value = row.quantity!;
        r.getCell(7).value = row.unitPrice!;
        r.getCell(8).value = { formula: `F${n}*G${n}`, result: row.amount };
      }
    });
  }
  write(rows, 0, '');

  const last = ws.rowCount;
  const total = ws.addRow(['', 'Total']);
  total.font = { bold: true };
  total.getCell(8).value = { formula: `SUBTOTAL(9,H2:H${last})`, result: meta.total };

  const info = wb.addWorksheet('Info');
  info.columns = [{ width: 18 }, { width: 70 }];
  info.addRows([
    ['IFC file', meta.fileName],
    ['Schema', meta.schema],
    ['Exported', new Date().toISOString().slice(0, 10)],
    ['Note', DISCLAIMER],
    ['Source', 'Qto = base quantities stored in the IFC file; Computed = measured from 3D geometry'],
  ]);

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
