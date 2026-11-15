// Takeoff session state as a pure reducer; TakeoffProvider (takeoff.tsx) wires it to React context.
import type { BoqFilters, GroupField, PriceEntry, PriceKey } from '../core';
import type { ExtractResult } from '../core/extract';

export type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; stage: 'geometry' | 'quantities'; progress: number }
  | { kind: 'ready' }
  | { kind: 'error'; text: string };

export interface Selection {
  rowKey?: string; // BOQ row to mark
  ids: number[]; // expressIDs to highlight
  zoom: boolean; // fit the camera to them
}

export interface TakeoffState {
  status: Status;
  file: { name: string; size: number; schema: string } | null; // size in bytes
  elements: ExtractResult['elements'];
  prices: Record<PriceKey, PriceEntry>;
  groupBy: GroupField[];
  filters: BoqFilters;
  selection: Selection;
  expanded: string[]; // expanded BOQ group keys
}

export type Action =
  | { type: 'open'; name: string; size: number }
  | { type: 'progress'; stage: 'geometry' | 'quantities'; progress: number }
  | { type: 'loaded'; result: ExtractResult }
  | { type: 'failed'; text: string }
  | { type: 'setPrice'; key: PriceKey; entry: PriceEntry }
  | { type: 'setGroupBy'; groupBy: GroupField[] }
  | { type: 'setFilters'; filters: BoqFilters }
  | { type: 'select'; selection: Selection }
  | { type: 'setExpanded'; keys: string[] }
  | { type: 'reveal'; keys: string[] };

export const initialState: TakeoffState = {
  status: { kind: 'idle' },
  file: null,
  elements: [],
  prices: {},
  groupBy: ['ifcClass', 'typeName', 'material'],
  filters: { storeys: [], hiddenClasses: [] },
  selection: { ids: [], zoom: false },
  expanded: [],
};

export function reducer(s: TakeoffState, a: Action): TakeoffState {
  switch (a.type) {
    case 'open': // grouping is a user preference; everything else belongs to the previous file
      return { ...initialState, groupBy: s.groupBy, file: { name: a.name, size: a.size, schema: '' }, status: { kind: 'loading', stage: 'geometry', progress: 0 } };
    case 'progress':
      return { ...s, status: { kind: 'loading', stage: a.stage, progress: a.progress } };
    case 'loaded':
      return { ...s, elements: a.result.elements, file: { name: s.file?.name ?? '', size: s.file?.size ?? 0, schema: a.result.schema }, status: { kind: 'ready' } };
    case 'failed':
      return { ...s, status: { kind: 'error', text: a.text } };
    case 'setPrice':
      return { ...s, prices: { ...s.prices, [a.key]: a.entry } };
    case 'setGroupBy':
      return a.groupBy.length ? { ...s, groupBy: a.groupBy } : s;
    case 'setFilters':
      return { ...s, filters: a.filters };
    case 'select':
      return { ...s, selection: a.selection };
    case 'setExpanded':
      return { ...s, expanded: a.keys };
    case 'reveal':
      return { ...s, expanded: [...new Set([...s.expanded, ...a.keys])] };
  }
}
