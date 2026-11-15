import * as THREE from 'three';
import * as OBC from '@thatopen/components';

/** Snap radius on screen, like CAD apps: close enough to see you are on the corner/edge. */
export const SNAP_RADIUS_PX = 8;

/**
 * Upstream (components 3.4.x): SnapResolver snaps to any vertex, else any edge, within a fixed 1 m world distance
 * (`maxDistance`). Zoomed in, 1 m covers a large part of the screen, so a free length point near an object's edge
 * always jumps to the edge instead of staying under the cursor. Convert a pixel radius to world units at the picked
 * point before every resolve.
 */
export function patchSnapRadius(components: OBC.Components, world: OBC.World) {
  const resolver = components.get(OBC.SnapResolvers).get();
  const resolve = resolver.resolve.bind(resolver);
  resolver.resolve = (point, ...rest) => {
    const cam = world.camera.three;
    const px = world.renderer?.three.domElement.clientHeight || 1;
    const span =
      cam instanceof THREE.OrthographicCamera
        ? (cam.top - cam.bottom) / cam.zoom
        : 2 * point.distanceTo(cam.position) * Math.tan(THREE.MathUtils.degToRad((cam as THREE.PerspectiveCamera).fov) / 2);
    resolver.maxDistance = (span / px) * SNAP_RADIUS_PX;
    return resolve(point, ...rest);
  };
}
