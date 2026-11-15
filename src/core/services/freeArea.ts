import * as THREE from 'three';
import * as OBF from '@thatopen/components-front';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { Engine } from '../engine';
import type { Tool } from '../tools/toolManager';

/** Vector area (Newell): exact for planar polygons, best-fit-plane area for points on different planes. */
export function polygonArea(pts: THREE.Vector3[]) {
  const n = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) n.add(c.crossVectors(pts[i], pts[(i + 1) % pts.length]));
  return n.length() / 2;
}

/** Triangle indices for a polygon whose points may lie on different planes, triangulated in its best-fit plane. */
export function triangulate(pts: THREE.Vector3[]): number[] {
  const n = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) n.add(c.crossVectors(pts[i], pts[(i + 1) % pts.length]));
  if (pts.length < 3 || n.lengthSq() < 1e-12) return [];
  n.normalize();
  const u = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  u.sub(n.clone().multiplyScalar(u.dot(n))).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  return THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p.dot(u), p.dot(v))), []).flat();
}

interface Item { points: THREE.Vector3[]; value: number; group: THREE.Group; fill: THREE.Mesh; outline: LineSegments2; label: OBF.Mark }

/**
 * ME-03 Area free: points may sit on any plane (That Open's AreaMeasurement drops points off
 * the first three's plane), and the fill + value preview follows the cursor. That Open's measurer still runs for its
 * snap marker and `lastPick`; it never creates anything itself.
 */
export function createFreeArea(engine: Engine, measurer: OBF.AreaMeasurement, onChange: () => void) {
  const scene = engine.world.scene.three;
  type Pick = { point?: THREE.Vector3 } | null;
  const picker = measurer as unknown as { lastPick: Pick; snappings: unknown; _vertexPicker: { get(o: object): Promise<Pick> } };
  // Clicks pick fresh (lastPick lags a frame) and run in order, so a double-click sees both of its clicks.
  let queue = Promise.resolve();
  const later = (f: () => unknown) => void (queue = queue.then(f, f) as Promise<void>);
  const fillMat = new THREE.MeshBasicMaterial({ color: measurer.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthTest: false });
  const items: Item[] = [];
  let draft: Item | null = null;
  let hover: THREE.Vector3 | null = null;
  let lastAdd = 0;
  let picking = 0; // clicks still waiting for their pick
  let pointer: PointerEvent | null = null;

  function make(): Item {
    const group = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.BufferGeometry(), fillMat);
    const outline = new LineSegments2(new LineSegmentsGeometry(), measurer.linesMaterial as never);
    fill.renderOrder = outline.renderOrder = 2;
    group.add(fill, outline);
    scene.add(group);
    const el = document.createElement('div');
    el.className = 'measure-label';
    return { points: [], value: 0, group, fill, outline, label: new OBF.Mark(engine.world, el) };
  }

  function draw(item: Item, pts: THREE.Vector3[]) {
    item.fill.geometry.dispose();
    item.fill.geometry = new THREE.BufferGeometry().setFromPoints(pts).setIndex(triangulate(pts));
    const seg: number[] = [];
    const closed = pts.length > 2 ? pts.length : pts.length - 1;
    for (let i = 0; i < closed; i++) seg.push(...pts[i].toArray(), ...pts[(i + 1) % pts.length].toArray());
    item.outline.visible = seg.length > 0;
    if (seg.length) item.outline.geometry.setPositions(seg);
    item.value = pts.length > 2 ? polygonArea(pts) : 0;
    item.label.visible = item.value > 0;
    item.label.three.element.textContent = `${item.value.toFixed(2)} m2`;
    item.label.three.position.copy(pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length || 1));
    engine.world.renderer?.update?.();
  }

  function dispose(item: Item) {
    item.group.removeFromParent();
    item.fill.geometry.dispose();
    item.outline.geometry.dispose();
    item.label.dispose();
  }

  const redrawDraft = () => draft && draw(draft, hover ? [...draft.points, hover] : draft.points);

  function cancel() {
    if (draft) dispose(draft);
    draft = null;
    hover = null;
  }

  function finish() {
    if (!draft) return;
    const item = draft;
    draft = null;
    hover = null;
    if (item.points.length < 3 || polygonArea(item.points) < 1e-6) return dispose(item);
    draw(item, item.points);
    items.push(item);
    onChange();
  }

  measurer.onPointerMove.add(() => {
    if (!draft) return;
    hover = picker.lastPick?.point?.clone() ?? null;
    redrawDraft();
  });

  const tool: Tool = {
    deactivate: cancel,
    onMove: (e) => void (pointer = e),
    onClick() {
      const at = performance.now();
      picking++;
      later(async () => {
        const p = (await picker._vertexPicker.get({ snappingClasses: picker.snappings }).finally(() => picking--))?.point;
        if (!p) return;
        draft ??= make();
        const last = draft.points.at(-1);
        if (last && last.distanceTo(p) < 1e-6) return; // second click of a double-click
        draft.points.push(p.clone());
        lastAdd = at;
        redrawDraft();
      });
    },
    onDblClick() {
      // A double-click finishes without keeping the point it placed.
      const at = performance.now();
      later(() => {
        if (draft && at - lastAdd < 600) draft.points.pop();
        finish();
      });
    },
    onKey(e) {
      if (e.key === 'Enter') return later(finish), true;
      if (e.key === 'Escape') {
        if (!draft && !picking) return false;
        later(cancel);
        return true;
      }
      return false;
    },
  };

  return {
    tool,
    items,
    /** Removes the free area under the last pointer position; false when none is there. */
    deleteHovered() {
      if (!pointer) return false;
      const dom = engine.world.renderer!.three.domElement, r = dom.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((pointer.clientX - r.left) / r.width) * 2 - 1, -((pointer.clientY - r.top) / r.height) * 2 + 1), engine.world.camera.three);
      const hit = ray.intersectObjects(items.map((i) => i.fill))[0];
      const i = hit ? items.findIndex((it) => it.fill === hit.object) : -1;
      if (i < 0) return false;
      dispose(items.splice(i, 1)[0]);
      onChange();
      return true;
    },
    clear() {
      cancel();
      items.splice(0).forEach(dispose);
      onChange();
    },
    setVisible(v: boolean) {
      for (const i of items) {
        i.group.visible = v;
        i.label.visible = v;
      }
    },
  };
}
