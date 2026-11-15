import { App as AntApp } from 'antd';
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { analyzeIfc, buildBoq, filteredOutIds, locate, type BoqFilters, type BoqRow, type GroupField, type PriceEntry, type PriceKey } from '../core';
import { S, MAX_MB } from './strings';
import { initialState, reducer, type TakeoffState } from './takeoffState';
import { useViewer } from './viewer';

const SAMPLE = { url: import.meta.env.BASE_URL + 'samples/NBU_MedicalClinic_Arch-Optimized.ifc', name: 'NBU_MedicalClinic_Arch-Optimized.ifc' };

interface TakeoffContextValue {
  state: TakeoffState;
  boq: { rows: BoqRow[]; total: number };
  storeys: string[];
  classes: string[];
  openFile(file: File): Promise<void>;
  openSample(): Promise<void>;
  setPrice(key: PriceKey, entry: PriceEntry): void;
  setGroupBy(groupBy: GroupField[]): void;
  setFilters(filters: BoqFilters): void;
  setExpanded(keys: string[]): void;
  selectRow(row: BoqRow): void;
  clearSelection(): void;
  fitModel(): void;
  exportExcel(): Promise<void>;
}

const TakeoffContext = createContext<TakeoffContextValue | null>(null);

/** Session state for one takeoff; keeps the 3D viewer in sync with it (selection, filters, picks). */
export function TakeoffProvider({ children }: { children: ReactNode }) {
  const { viewer } = useViewer();
  const { message } = AntApp.useApp();
  const [state, dispatch] = useReducer(reducer, initialState);
  const { elements, prices, groupBy, filters, selection, file } = state;
  const boq = useMemo(() => buildBoq(elements, prices, groupBy, filters), [elements, prices, groupBy, filters]);
  const storeys = useMemo(() => [...new Set(elements.map((e) => e.storey))].sort(), [elements]);
  const classes = useMemo(() => [...new Set(elements.map((e) => e.ifcClass))].sort(), [elements]);
  const cancel = useRef<() => void>(() => {});

  // 3D pick → BOQ row (through a ref so the listener always sees the latest rows).
  const rowsRef = useRef(boq.rows);
  rowsRef.current = boq.rows;
  useEffect(
    () =>
      viewer?.onPick((id) => {
        const hit = id === null ? null : locate(rowsRef.current, id);
        if (id !== null && !hit) void message.info(S.messages.notInTakeoff);
        dispatch({ type: 'select', selection: hit ? { rowKey: hit.leaf.key, ids: [id!], zoom: false } : initialState.selection });
        if (hit) dispatch({ type: 'reveal', keys: hit.ancestors });
      }),
    [viewer, message],
  );

  useEffect(() => {
    if (!viewer) return;
    // 'select' measure = click → highlight applied (success criterion ≤ 200 ms), read by the e2e test.
    const start = performance.now();
    void viewer.select(selection.ids).then(() => {
      performance.measure('select', { start });
      if (selection.zoom) void viewer.fitTo(selection.ids);
    });
  }, [viewer, selection]);

  useEffect(() => void viewer?.setHidden(filteredOutIds(elements, filters)), [viewer, elements, filters]);

  function open(name: string, bytes: Uint8Array) {
    cancel.current();
    void viewer?.unload();
    dispatch({ type: 'open', name, size: bytes.byteLength });
    cancel.current = analyzeIfc(bytes, {
      onProgress: (stage, progress) => dispatch({ type: 'progress', stage, progress }),
      onFragments: (frag) => void viewer?.load(frag),
      onElements: (result) => {
        dispatch({ type: 'loaded', result });
        if (result.warnings.includes('no-qto')) void message.warning(S.messages.noQto, 6);
      },
      onError: (code, detail) => dispatch({ type: 'failed', text: `${S.errors[code]} (${detail})` }),
    });
  }

  const value: TakeoffContextValue = {
    state,
    boq,
    storeys,
    classes,
    async openFile(f) {
      if (f.size > MAX_MB * 1e6) void message.warning(S.messages.large(Math.round(f.size / 1e6)));
      open(f.name, new Uint8Array(await f.arrayBuffer()));
    },
    async openSample() {
      const res = await fetch(SAMPLE.url);
      open(SAMPLE.name, new Uint8Array(await res.arrayBuffer()));
    },
    setPrice: (key, entry) => dispatch({ type: 'setPrice', key, entry }),
    setGroupBy: (g) => dispatch({ type: 'setGroupBy', groupBy: g }),
    setFilters: (f) => dispatch({ type: 'setFilters', filters: f }),
    setExpanded: (keys) => dispatch({ type: 'setExpanded', keys }),
    clearSelection: () => dispatch({ type: 'select', selection: initialState.selection }),
    fitModel: () => void viewer?.fitAll(),
    selectRow: (row) => dispatch({ type: 'select', selection: { rowKey: row.key, ids: row.expressIds, zoom: true } }),
    async exportExcel() {
      if (!file) return;
      const { exportXlsx } = await import('../core/exportXlsx');
      const buffer = await exportXlsx(boq.rows, { fileName: file.name, schema: file.schema, total: boq.total });
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      Object.assign(document.createElement('a'), { href: url, download: file.name.replace(/\.ifc$/i, '') + '-boq.xlsx' }).click();
      URL.revokeObjectURL(url);
    },
  };

  return <TakeoffContext.Provider value={value}>{children}</TakeoffContext.Provider>;
}

export function useTakeoff(): TakeoffContextValue {
  const v = useContext(TakeoffContext);
  if (!v) throw new Error('useTakeoff outside TakeoffProvider');
  return v;
}
