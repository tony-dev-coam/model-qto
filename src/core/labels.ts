// Domain labels shared by the BOQ table and the Excel export (core must not import ui/).
import type { BoqRow, Unit } from './boq';

export const UNIT_LABEL: Record<Unit, string> = { count: 'pcs', m: 'm', m2: 'm²', m3: 'm³' };

export const DISCLAIMER = 'Quantities are indicative only and must be checked by an estimator before use.';

export const WARNING_LABEL: Record<string, string> = {
  'mesh-invalid': 'Broken geometry (open mesh or negative volume): computed values are unreliable',
  'no-geometry': 'No geometry to measure',
  'layer-split': 'Layer volume split by thickness ratio',
  'missing-quantity': 'Some elements have no value in this unit',
};

/** 'Qto' | 'Computed' | 'Qto + Computed' | 'Counted' for a leaf; '' for a group. */
export function sourceLabel(row: BoqRow): string {
  if (row.children) return '';
  if (row.unit === 'count') return 'Counted';
  return row.sources.map((s) => (s === 'qto' ? 'Qto' : 'Computed')).join(' + ');
}
