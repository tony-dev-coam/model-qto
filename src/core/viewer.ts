// Thin facade over That Open for the one thing this app needs: show one model, highlight/hide by expressID, pick.
import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import { createEngine } from './engine';

const MODEL = 'model';
const SELECT = 'select';
const CLICK_MOVE_PX = 4;

export async function createViewer(container: HTMLElement) {
  const engine = await createEngine(container);
  const highlighter = engine.components.get(OBF.Highlighter);
  highlighter.setup({
    world: engine.world,
    selectName: SELECT,
    autoHighlightOnClick: false,
    selectMaterialDefinition: { color: new THREE.Color('#f59e0b'), opacity: 1, transparent: false, renderedFaces: 0 },
  });
  const hider = engine.components.get(OBC.Hider);
  const update = () => engine.fragments.core.update(true);
  const items = (ids: number[]): OBC.ModelIdMap => ({ [MODEL]: new Set(ids) });
  const loaded = () => engine.fragments.list.has(MODEL);

  // Click (not drag) → raycast → expressID (= fragments localId, spike S1).
  const pickListeners = new Set<(expressId: number | null) => void>();
  const dom = engine.world.renderer!.three.domElement;
  let down: { x: number; y: number } | null = null;
  dom.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  dom.addEventListener('pointerup', async (e) => {
    const isClick = down && e.button === 0 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < CLICK_MOVE_PX;
    down = null;
    if (!isClick || !loaded()) return;
    const hit = await engine.fragments.raycast({ camera: engine.world.camera.three, mouse: new THREE.Vector2(e.clientX, e.clientY), dom });
    for (const l of pickListeners) l(hit ? hit.localId : null);
  });

  async function fit(map?: OBC.ModelIdMap) {
    const box = new THREE.Box3();
    if (map) for (const b of await engine.fragments.getBBoxes(map)) box.union(b);
    else for (const [, model] of engine.fragments.list) box.union(model.box);
    if (!box.isEmpty()) await engine.world.camera.controls.fitToSphere(box.getBoundingSphere(new THREE.Sphere()), true);
  }

  return {
    async load(frag: Uint8Array) {
      if (loaded()) await engine.fragments.core.disposeModel(MODEL);
      await engine.fragments.core.load(frag, { modelId: MODEL, camera: engine.world.camera.three });
      await update();
      await fit();
    },
    async unload() {
      if (loaded()) await engine.fragments.core.disposeModel(MODEL);
    },
    async select(ids: number[]) {
      if (!loaded()) return;
      if (ids.length) await highlighter.highlightByID(SELECT, items(ids), true, false);
      else await highlighter.clear(SELECT);
      await update();
    },
    /** Zoom extents on the whole model. */
    fitAll: () => fit(),
    async fitTo(ids: number[]) {
      if (loaded() && ids.length) await fit(items(ids));
    },
    /** Shows everything, then hides `ids` (filtered-out BOQ elements). */
    async setHidden(ids: number[]) {
      if (!loaded()) return;
      await hider.set(true);
      if (ids.length) await hider.set(false, items(ids));
      await update();
    },
    /** Subscribes to clicks on the model; returns the unsubscribe function. */
    onPick(listener: (expressId: number | null) => void) {
      pickListeners.add(listener);
      return () => void pickListeners.delete(listener);
    },
    dispose: () => engine.dispose(),
  };
}

export type Viewer = Awaited<ReturnType<typeof createViewer>>;
