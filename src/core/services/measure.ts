import * as THREE from 'three';
import type * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as FRAGS from '@thatopen/fragments';
import { createStore } from '../store';
import type { Engine } from '../engine';
import type { Tool, ToolId, ToolManager } from '../tools/toolManager';
import { patchAreaPlane } from '../patches/areaPlane';
import { patchMeasureLabels, measureValues } from '../patches/measureLabels';
import { patchVolumeMesh } from '../patches/volumeMesh';
import { patchSnapRadius } from '../patches/snapRadius';
import { createFreeArea } from './freeArea';

patchAreaPlane();
patchMeasureLabels();

type Measurer = OBF.LengthMeasurement | OBF.AreaMeasurement | OBF.VolumeMeasurement;

const MODES: Partial<Record<ToolId, [kind: 'length' | 'area' | 'volume', mode: string]>> = {
  'length-free': ['length', 'free'],
  'length-edge': ['length', 'edge'],
  'area-free': ['area', 'free'],
  'area-rect': ['area', 'square'],
  'area-face': ['area', 'face'],
  volume: ['volume', 'free'],
};
export const MEASURE_TOOLS = Object.keys(MODES) as ToolId[];

/** ME-01…08: one tool per mode on top of That Open's Length/Area/Volume measurement components. */
export function createMeasureService(engine: Engine, tools: ToolManager) {
  const measurers = {
    length: engine.components.get(OBF.LengthMeasurement),
    area: engine.components.get(OBF.AreaMeasurement),
    volume: engine.components.get(OBF.VolumeMeasurement),
  };
  const all = Object.values(measurers) as Measurer[];
  patchSnapRadius(engine.components, engine.world);
  const store = createStore({ count: 0, visible: true });
  // Σ tag at the mean label position once there are 2+ areas / volumes (none for lengths).
  const tag = (l: { value: number; three: THREE.Object3D }) => ({ value: l.value, pos: l.three.getWorldPosition(new THREE.Vector3()) });
  const sums = [
    { items: () => [...[...measurers.area.fills].map((f) => tag(f.label)), ...free.items.map((i) => ({ value: i.value, pos: i.label.three.position }))], unit: 'm2' },
    { items: () => [...measurers.volume.volumes].map((v) => tag(v.label)), unit: 'm3' },
  ].map((s) => {
    const el = document.createElement('div');
    el.className = 'measure-label';
    return { ...s, el, mark: new OBF.Mark(engine.world, el) };
  });
  const updateSums = () => {
    for (const { items, unit, el, mark } of sums) {
      const tags = items();
      mark.visible = tags.length > 1 && store.getSnapshot().visible;
      if (tags.length < 2) continue;
      el.textContent = `Σ ${tags.reduce((n, t) => n + t.value, 0).toFixed(2)} ${unit}`;
      mark.three.position.set(0, 0, 0);
      for (const t of tags) mark.three.position.add(t.pos);
      mark.three.position.divideScalar(tags.length);
    }
  };
  const recount = () => {
    store.update({ count: all.reduce((n, m) => n + m.list.size, free.items.length) });
    updateSums();
  };
  // The snap resolver takes vertices before edges, so on small elements (windows, doors) a corner always wins and
  // Length edge never sees an edge. Edge mode asks for edges only; the other modes keep That Open's default.
  const defaultSnaps = measurers.length.snappings;
  const exitIfMeasuring = () => MEASURE_TOOLS.includes(tools.store.getSnapshot().active) && tools.exit();

  // Colors: black lengths, orange areas, light-blue volumes.
  measurers.length.color = new THREE.Color('#000000');
  measurers.area.color = new THREE.Color('#ff9966');
  measurers.volume.color = new THREE.Color('#aad5e3');
  for (const m of all) {
    m.world = engine.world;
    m.lineType = 'fat' as never; // WebGL ignores width on basic lines; we want ~2px
    m.linesMaterial.userData.hideEndpoints = m === measurers.area; // no corner dots on areas (patches/measureLabels.ts)
    m.units = (m === measurers.length ? 'm' : m === measurers.area ? 'm2' : 'm3') as never; // ME-08 metric
    m.rounding = 2;
    m.enabled = false;
    m.list.onItemAdded.add(recount);
    m.list.onItemDeleted.add(recount);
    m.list.onCleared.add(recount);
  }

  // ME-03 is ours: That Open's free area only takes points on one plane and shows no fill until finished.
  const free = createFreeArea(engine, measurers.area, recount);

  updateSums(); // hide the empty Σ tags
  measureValues.onChange = updateSums;

  // Area face and Volume preview the hovered face / element, value tag included, before the click.
  type Pick = { facePoints?: ArrayLike<number>; fragments?: { modelId: string }; localId?: number } | null;
  const area = measurers.area as unknown as { lastPick: Pick; createFillElement(a: OBF.Area): OBF.MeasureFill }; // protected upstream
  const vol = measurers.volume as unknown as {
    lastPick: Pick;
    _temp: { preview?: { volume: { items: OBC.ModelIdMap }; material: THREE.Material } };
    initPreview(): Promise<void>;
  };
  let hoverKey = '';
  let faceFill: OBF.MeasureFill | null = null;
  const clearPreview = () => {
    hoverKey = '';
    faceFill?.dispose();
    faceFill = null;
    measurers.volume.cancelCreation();
  };
  measurers.area.onPointerMove.add(() => {
    if (tools.store.getSnapshot().active !== 'area-face') return;
    const pts = area.lastPick?.facePoints;
    const key = pts?.length ? `${pts.length}:${pts[0]},${pts[1]},${pts[2]}:${pts[pts.length - 1]}` : '';
    if (key === hoverKey) return;
    clearPreview();
    hoverKey = key;
    if (!pts?.length) return;
    const face = new OBF.Area();
    const points: THREE.Vector3[] = [];
    for (let i = 0; i + 2 < pts.length; i += 3) points.push(new THREE.Vector3(pts[i], pts[i + 1], pts[i + 2]));
    face.points.add(...points);
    faceFill = area.createFillElement(face);
    faceFill.color = measurers.area.color;
  });
  // Look: the whole element, hidden parts included, as one even see-through tint (lighter on hover,
  // near-solid once measured). Upstream does draw through everything, but lit at 75 %, which washes out on light
  // facades; unlit keeps the tint flat.
  const volumeMat = (opacity: number) =>
    new THREE.MeshBasicMaterial({ color: measurers.volume.color, transparent: true, opacity, side: THREE.DoubleSide, depthTest: false });
  // A tint mesh comes from a fragments worker request that can get lost when hovering fast (the value tag, a
  // separate request, still arrives): rebuild empty ones on the next move.
  type VolumeEl = { meshes: unknown[]; updateMesh(): Promise<void> };
  const lastHeal = new WeakMap<VolumeEl, number>(); // ponytail: 1 s per element; off-screen items stay empty
  const heal = (v?: VolumeEl) => {
    if (!v || v.meshes.length || performance.now() - (lastHeal.get(v) ?? 0) < 1000) return;
    lastHeal.set(v, performance.now());
    void v.updateMesh();
  };
  // Checked on a timer, not on mouse moves: the cursor often rests on the element.
  let healTimer = 0;
  const healAll = () => {
    heal(vol._temp.preview as unknown as VolumeEl);
    for (const v of measurers.volume.volumes) heal(v as unknown as VolumeEl);
  };
  measurers.volume.volumes.onItemAdded.add((v) => {
    v.material = volumeMat(0.9) as never;
    lastHeal.set(v as unknown as VolumeEl, performance.now()); // its first build is still running
  });
  // A Hoverer hover that was already fetching attaches even after the Hoverer is disabled (it never re-checks),
  // leaving a stray tint drawn through everything. Drop any hover that starts while disabled.
  const hoverer = engine.components.get(OBF.Hoverer);
  hoverer.onHoverStarted.add(() => !hoverer.enabled && hoverer.clear());
  // Upstream VolumeMeasurement.delete() raycasts the fragment meshes, which throws (no CPU-side vertices).
  const deleteHoveredVolume = () => {
    const hit = vol.lastPick;
    if (!hit?.fragments) return;
    const target = [...measurers.volume.list].find((v) => v.items[hit.fragments!.modelId]?.has(hit.localId!));
    if (target) measurers.volume.list.delete(target);
  };
  measurers.volume.onPointerMove.add(async () => {
    if (tools.store.getSnapshot().active !== 'volume') return;
    const hit = vol.lastPick;
    const key = hit?.fragments ? `${hit.fragments.modelId}:${hit.localId}` : '';
    if (key === hoverKey) return;
    clearPreview();
    hoverKey = key;
    if (!key) return;
    await vol.initPreview();
    if (vol._temp.preview) {
      // Upstream doesn't export the volume element class; the preview is the first instance (clicks keep it).
      patchVolumeMesh(Object.getPrototypeOf(vol._temp.preview));
      vol._temp.preview.material = volumeMat(0.45);
      lastHeal.set(vol._temp.preview as unknown as VolumeEl, performance.now());
    }
    if (hoverKey === key && vol._temp.preview) vol._temp.preview.volume.items = { [hit!.fragments!.modelId]: new Set([hit!.localId!]) };
  });

  for (const id of MEASURE_TOOLS) {
    const [kind, mode] = MODES[id]!;
    const m = measurers[kind];
    const tool: Tool = {
      activate() {
        setVisible(true); // picking a measuring tool shows hidden measurements again
        if (kind === 'length') {
          measurers.length.snappings = id === 'length-edge' ? [FRAGS.SnappingClass.LINE] : defaultSnaps;
          // Upstream's mode setter starts an edge preview and enabling starts another, orphaning the first
          // (a stray length stays on screen). Set the mode quietly; enabling below starts the only preview.
          (m as unknown as { _mode: string })._mode = mode;
        } else m.mode = mode as never;
        m.enabled = true;
        // Upstream turns the Hoverer on for volumes and starts a hover of whatever is under the cursor; our preview
        // replaces it (see the onHoverStarted guard above for the hover still in flight).
        if (kind === 'volume') {
          healTimer = window.setInterval(healAll, 1000);
          hoverer.enabled = false;
          hoverer.clear();
        }
      },
      deactivate() {
        clearPreview();
        m.cancelCreation();
        m.enabled = false;
        if (id === 'area-free') free.tool.deactivate!();
        if (kind === 'volume') clearInterval(healTimer);
      },
      onMove: (e) => free.tool.onMove!(e), // free areas are deletable by hover from any measuring tool
      onClick(e) {
        if (id === 'area-free') return free.tool.onClick!(e);
        // One volume per clicked element (That Open would merge clicks into one until ENTER).
        if (kind === 'volume') m.endCreation();
        else void m.create();
        clearPreview();
      },
      onDblClick: (e) => (id === 'area-free' ? free.tool.onDblClick!(e) : m.endCreation()),
      onKey(e) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          clearPreview();
          if (kind === 'volume') deleteHoveredVolume();
          else if (!free.deleteHovered()) void m.delete(); // ME-07: delete hovered
          return true;
        }
        if (id === 'area-free') return free.tool.onKey!(e);
        if (e.key === 'Enter') return m.endCreation(), true;
        if (e.key === 'Escape') {
          // ME-07: first ESC cancels an unfinished measurement and keeps the tool; ESC with nothing pending exits it.
          // Read before That Open's own ESC handler (registered later on window) clears the flag.
          if (!(m as unknown as { _temp: { isDragging?: boolean } })._temp.isDragging) return false;
          m.cancelCreation();
          return true;
        }
        return false;
      },
    };
    tools.register(id, tool);
  }

  function setVisible(visible: boolean) {
    for (const m of all) m.visible = visible;
    free.setVisible(visible);
    store.update({ visible });
    updateSums();
  }

  return {
    store,
    /** Clears everything and drops back to Select. */
    deleteAll() {
      for (const m of all) m.list.clear();
      free.clear();
      exitIfMeasuring();
    },
    /** Hiding also leaves the measuring tool. */
    setVisible(visible: boolean) {
      setVisible(visible);
      if (!visible) exitIfMeasuring();
    },
  };
}

export type MeasureService = ReturnType<typeof createMeasureService>;
