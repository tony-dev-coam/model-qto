import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { polygonArea, triangulate } from './freeArea';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('free area math', () => {
  it('measures a planar square on any plane', () => {
    expect(polygonArea([v(0, 0, 0), v(2, 0, 0), v(2, 0, 2), v(0, 0, 2)])).toBeCloseTo(4);
    expect(polygonArea([v(0, 0, 0), v(0, 3, 0), v(0, 3, 1), v(0, 0, 1)])).toBeCloseTo(3);
    expect(triangulate([v(0, 0, 0), v(2, 0, 0), v(2, 0, 2), v(0, 0, 2)])).toHaveLength(6);
  });

  it('accepts points on different planes (roof + wall) and triangulates them', () => {
    // Three points on a roof (y=3), two down a wall (z=2): such polygons are accepted.
    const pts = [v(0, 3, 0), v(2, 3, 0), v(2, 3, 2), v(2, 1, 2), v(0, 1, 2)];
    expect(polygonArea(pts)).toBeGreaterThan(0);
    expect(triangulate(pts).length).toBe((pts.length - 2) * 3);
  });

  it('gives no area or triangles for collinear points', () => {
    expect(polygonArea([v(0, 0, 0), v(1, 0, 0), v(2, 0, 0)])).toBeCloseTo(0);
    expect(triangulate([v(0, 0, 0), v(1, 0, 0), v(2, 0, 0)])).toEqual([]);
  });
});
