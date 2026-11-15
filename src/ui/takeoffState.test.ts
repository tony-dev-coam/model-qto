import { describe, expect, it } from 'vitest';
import type { Element } from '../core';
import { initialState, reducer, type Action, type TakeoffState } from './takeoffState';

const wall: Element = {
  expressId: 1, globalId: 'g', ifcClass: 'IfcWall', typeName: 'W', material: 'C', storey: 'L1',
  source: { volume: 'qto', area: undefined, length: undefined }, warnings: [], volume: 1,
};

describe('takeoff reducer', () => {
  const loaded: TakeoffState = reducer(reducer(initialState, { type: 'open', name: 'a.ifc', size: 10 }), {
    type: 'loaded', result: { elements: [wall], schema: 'IFC4', warnings: [] },
  });

  it('goes idle → loading → ready', () => {
    const opened = reducer(initialState, { type: 'open', name: 'a.ifc', size: 10 });
    expect(opened.status).toEqual({ kind: 'loading', stage: 'geometry', progress: 0 });
    expect(opened.file).toEqual({ name: 'a.ifc', size: 10, schema: '' });
    expect(loaded.status).toEqual({ kind: 'ready' });
    expect(loaded.file).toEqual({ name: 'a.ifc', size: 10, schema: 'IFC4' });
    expect(loaded.elements).toEqual([wall]);
  });

  it('resets per-file state when another file is opened, but keeps the grouping', () => {
    const edited: Action[] = [
      { type: 'setPrice', key: 'k', entry: { unit: 'm3', unitPrice: 5 } },
      { type: 'setFilters', filters: { storeys: ['L1'], hiddenClasses: [] } },
      { type: 'setGroupBy', groupBy: ['storey'] },
      { type: 'select', selection: { rowKey: '/x', ids: [1], zoom: true } },
      { type: 'setExpanded', keys: ['/x'] },
    ];
    const s = edited.reduce(reducer, loaded);
    const reopened = reducer(s, { type: 'open', name: 'b.ifc', size: 10 });
    expect(reopened).toMatchObject({ prices: {}, filters: initialState.filters, selection: initialState.selection, expanded: [], elements: [], groupBy: ['storey'] });
  });

  it('ignores an empty grouping', () => {
    expect(reducer(loaded, { type: 'setGroupBy', groupBy: [] }).groupBy).toEqual(initialState.groupBy);
  });

  it('reveals ancestors without collapsing what is already open', () => {
    const s = reducer(reducer(loaded, { type: 'setExpanded', keys: ['/a'] }), { type: 'reveal', keys: ['/a', '/b'] });
    expect(s.expanded).toEqual(['/a', '/b']);
  });

  it('stores an error', () => {
    expect(reducer(loaded, { type: 'failed', text: 'boom' }).status).toEqual({ kind: 'error', text: 'boom' });
  });
});
