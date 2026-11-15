// Element[] + prices + grouping → BOQ tree. Pure: recomputed on every state change.
import type { Element, QtySource } from './extract';

export type GroupField = 'storey' | 'ifcClass' | 'typeName' | 'material';
export type Unit = 'count' | 'm' | 'm2' | 'm3';
/** `ifcClass|typeName|material`: independent of grouping and filters, so prices survive both. */
export type PriceKey = string;
export interface PriceEntry {
  unit: Unit;
  unitPrice: number; // >= 0
}
export interface BoqFilters {
  storeys: string[]; // empty = all
  hiddenClasses: string[];
}

export interface BoqRow {
  key: string; // group path, unique in the tree
  label: string;
  children?: BoqRow[];
  // Leaf only:
  priceKey?: PriceKey;
  unit?: Unit;
  unitPrice?: number;
  quantity?: number; // in `unit`
  sources: QtySource[]; // of the quantity in `unit` (empty for count)
  warnings: string[];
  // Every row:
  count: number; // distinct elements
  expressIds: number[];
  amount: number;
}

const PRICE_FIELDS: GroupField[] = ['ifcClass', 'typeName', 'material'];
const DIMENSION = { m: 'length', m2: 'area', m3: 'volume' } as const;
const COUNTED = new Set(['IfcDoor', 'IfcWindow']);

export const priceKeyOf = (e: Element): PriceKey => `${e.ifcClass}|${e.typeName}|${e.material}`;

/** Default unit per price key, decided over all elements (not the filtered view) so it stays stable. */
export function defaultUnits(elements: Element[]): Record<PriceKey, Unit> {
  const has = new Map<PriceKey, { cls: string; volume: boolean; area: boolean; length: boolean }>();
  for (const e of elements) {
    const k = priceKeyOf(e);
    const h = has.get(k) ?? { cls: e.ifcClass, volume: false, area: false, length: false };
    h.volume ||= !!e.volume;
    h.area ||= !!e.area;
    h.length ||= !!e.length;
    has.set(k, h);
  }
  const out: Record<PriceKey, Unit> = {};
  for (const [k, h] of has) out[k] = COUNTED.has(h.cls) ? 'count' : h.volume ? 'm3' : h.area ? 'm2' : h.length ? 'm' : 'count';
  return out;
}

const collator = new Intl.Collator('en', { numeric: true });

const isVisible = (e: Element, f: BoqFilters) => (f.storeys.length === 0 || f.storeys.includes(e.storey)) && !f.hiddenClasses.includes(e.ifcClass);

/** Elements the filters remove from the BOQ, to hide them in 3D too. */
export function filteredOutIds(elements: Element[], filters: BoqFilters): number[] {
  return [...new Set(elements.filter((e) => !isVisible(e, filters)).map((e) => e.expressId))];
}

/** First leaf containing the element (3D pick → BOQ row) plus its ancestor keys, to expand them. */
export function locate(rows: BoqRow[], expressId: number, ancestors: string[] = []): { leaf: BoqRow; ancestors: string[] } | null {
  for (const row of rows) {
    if (!row.expressIds.includes(expressId)) continue;
    if (!row.children) return { leaf: row, ancestors };
    return locate(row.children, expressId, [...ancestors, row.key]);
  }
  return null;
}

export function buildBoq(
  elements: Element[],
  prices: Record<PriceKey, PriceEntry>,
  groupBy: GroupField[],
  filters: BoqFilters,
): { rows: BoqRow[]; total: number } {
  const units = defaultUnits(elements);
  const visible = elements.filter((e) => isVisible(e, filters));
  // Leaves always split down to the price key; fields not in groupBy collapse into the leaf label.
  const rest = PRICE_FIELDS.filter((f) => !groupBy.includes(f));
  const levels: ((e: Element) => string)[] = rest.length
    ? [...groupBy.map((f) => (e: Element) => e[f]), (e: Element) => rest.map((f) => e[f]).join(' · ')]
    : groupBy.map((f) => (e: Element) => e[f]);

  function build(items: Element[], depth: number, path: string): BoqRow[] {
    const groups = new Map<string, Element[]>();
    for (const e of items) {
      const label = levels[depth](e);
      const g = groups.get(label);
      if (g) g.push(e);
      else groups.set(label, [e]);
    }
    return [...groups.keys()].sort(collator.compare).map((label) => {
      const group = groups.get(label)!;
      const key = `${path}/${label}`;
      const expressIds = [...new Set(group.map((e) => e.expressId))];
      if (depth < levels.length - 1) {
        const children = build(group, depth + 1, key);
        return { key, label, children, count: expressIds.length, expressIds, sources: [], warnings: [], amount: children.reduce((s, c) => s + c.amount, 0) };
      }
      return leaf(key, label, group, expressIds);
    });
  }

  function leaf(key: string, label: string, group: Element[], expressIds: number[]): BoqRow {
    const priceKey = priceKeyOf(group[0]);
    const unit = prices[priceKey]?.unit ?? units[priceKey];
    const unitPrice = prices[priceKey]?.unitPrice ?? 0;
    const warnings = new Set(group.flatMap((e) => e.warnings));
    let quantity = expressIds.length;
    const sources = new Set<QtySource>();
    if (unit !== 'count') {
      const dim = DIMENSION[unit];
      quantity = 0;
      for (const e of group) {
        if (e[dim] === undefined) warnings.add('missing-quantity');
        else quantity += e[dim]!;
        if (e.source[dim]) sources.add(e.source[dim]!);
      }
    }
    return { key, label, priceKey, unit, unitPrice, quantity, sources: [...sources], warnings: [...warnings], count: expressIds.length, expressIds, amount: quantity * unitPrice };
  }

  const rows = build(visible, 0, '');
  return { rows, total: rows.reduce((s, r) => s + r.amount, 0) };
}
