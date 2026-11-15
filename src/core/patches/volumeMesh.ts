import * as THREE from 'three';
import * as OBC from '@thatopen/components';

/**
 * Upstream bug (components-front 3.4.x): a volume's tint is a proxy over the tile's GPU index buffer, cut to the
 * offsets from `getItemDrawChunks`. Those offsets follow the worker's sample order, but the main-thread tile index
 * gets reordered, so on merged tiles (windows, doors) the tint lands on another element. Build the tint from the
 * item's own geometry instead, plus thin outline edges. Remove when fixed upstream.
 */
type VolumeEl = {
  _components: OBC.Components;
  world: OBC.World;
  volume: { items: OBC.ModelIdMap };
  meshes: THREE.Mesh[];
  materialArray: THREE.Material[];
  color: THREE.Color;
  cleanMeshes(): void;
  updateMesh(): Promise<void>;
};

export function patchVolumeMesh(proto: VolumeEl) {
  if ((proto as { patched?: boolean }).patched) return;
  (proto as { patched?: boolean }).patched = true;

  const cleanMeshes = proto.cleanMeshes;
  proto.cleanMeshes = function (this: VolumeEl) {
    // Unlike upstream's proxies, these meshes own their buffers.
    for (const m of this.meshes) m.traverse((o) => {
      (o as THREE.Mesh).geometry?.dispose();
      if (o instanceof THREE.LineSegments) o.material.dispose();
    });
    cleanMeshes.call(this);
  };

  const builds = new WeakMap<VolumeEl, number>();
  proto.updateMesh = async function (this: VolumeEl) {
    this.cleanMeshes();
    const build = (builds.get(this) ?? 0) + 1; // a newer call (items changed again) wins
    builds.set(this, build);
    const fragments = this._components.get(OBC.FragmentsManager);
    if (!fragments.initialized) return;
    for (const [modelId, ids] of Object.entries(this.volume.items)) {
      const model = fragments.list.get(modelId);
      if (!model || !ids?.size) continue;
      let geoms;
      try {
        geoms = await model.getItemsGeometry([...ids]);
      } catch {
        continue;
      }
      if (builds.get(this) !== build) return;
      const edgeMat = new THREE.LineBasicMaterial({ color: this.color, depthTest: false, transparent: true });
      for (const s of geoms.flat()) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(s.positions!, 3));
        geo.setIndex(new THREE.BufferAttribute(s.indices!, 1));
        geo.addGroup(0, Infinity, 0); // upstream's material setter assigns `[material]`, which needs a group
        const mesh = new THREE.Mesh(geo, this.materialArray);
        mesh.applyMatrix4(s.transform!);
        mesh.applyMatrix4(model.object.matrixWorld);
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat));
        this.world.scene.three.add(mesh);
        this.meshes.push(mesh);
      }
    }
  };
}
