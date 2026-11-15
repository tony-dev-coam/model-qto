// Quantities from a world-space triangle mesh (metres). pos = xyz triplets, idx = triangle vertex indices.

export interface MeshQuantities {
  volume: number; // m³
  area: number; // m², one side of the dominant face direction
  length: number; // m, longest principal extent
  valid: boolean; // closed and outward-facing; false → numbers are unreliable
}

/** Signed tetrahedron sum; exact for a closed, outward-wound mesh (inner cavities and openings subtract). */
export function meshVolume(pos: ArrayLike<number>, idx: ArrayLike<number>): number {
  let v = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2], pos[c], pos[c + 1], pos[c + 2]];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

/** Per-triangle area and unit normal. */
function triangles(pos: ArrayLike<number>, idx: ArrayLike<number>) {
  const out: { area: number; n: [number, number, number] }[] = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) out.push({ area: len / 2, n: [nx / len, ny / len, nz / len] });
  }
  return out;
}

/**
 * Net face area of a plate-like element (wall side, slab plan): find the normal direction carrying the most
 * area, sum triangles parallel to it (either side) and halve. Openings are already holes in the mesh, so they net out.
 */
export function dominantFaceArea(pos: ArrayLike<number>, idx: ArrayLike<number>): number {
  const tris = triangles(pos, idx);
  // Bucket by direction with sign folded, so both faces of a wall land in one bucket.
  const buckets = new Map<string, { area: number; n: [number, number, number] }>();
  for (const t of tris) {
    const [x, y, z] = t.n;
    const s = z < -1e-6 || (Math.abs(z) <= 1e-6 && (y < -1e-6 || (Math.abs(y) <= 1e-6 && x < 0))) ? -1 : 1;
    const key = [x, y, z].map((c) => Math.round((s * c) / 0.05)).join();
    const b = buckets.get(key) ?? { area: 0, n: [s * x, s * y, s * z] };
    b.area += t.area;
    buckets.set(key, b);
  }
  let best: { area: number; n: [number, number, number] } | undefined;
  for (const b of buckets.values()) if (!best || b.area > best.area) best = b;
  if (!best) return 0;
  const d = best.n;
  let area = 0;
  for (const t of tris) if (Math.abs(t.n[0] * d[0] + t.n[1] * d[1] + t.n[2] * d[2]) > 0.98) area += t.area;
  return area / 2;
}

/** Extent along the principal axis of the vertex cloud (PCA via power iteration on the covariance). */
export function obbLength(pos: ArrayLike<number>): number {
  const n = pos.length / 3;
  if (n === 0) return 0;
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < pos.length; i += 3) { mx += pos[i]; my += pos[i + 1]; mz += pos[i + 2]; }
  mx /= n; my /= n; mz /= n;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i] - mx, y = pos[i + 1] - my, z = pos[i + 2] - mz;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  }
  // Start off-axis so a symmetric cloud still converges to the largest-variance axis.
  let v = [0.577, 0.578, 0.579];
  for (let k = 0; k < 50; k++) {
    const w = [xx * v[0] + xy * v[1] + xz * v[2], xy * v[0] + yy * v[1] + yz * v[2], xz * v[0] + yz * v[1] + zz * v[2]];
    const len = Math.hypot(w[0], w[1], w[2]);
    if (len < 1e-18) break;
    v = w.map((c) => c / len);
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const p = pos[i] * v[0] + pos[i + 1] * v[1] + pos[i + 2] * v[2];
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  return hi - lo;
}

/**
 * Closed = every directed edge has a matching reverse edge once coincident vertices are welded
 * (IFC meshes duplicate vertices per face for flat shading).
 */
function isClosed(pos: ArrayLike<number>, idx: ArrayLike<number>): boolean {
  const weld = new Map<string, number>();
  const id = (i: number) => {
    const key = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
    let w = weld.get(key);
    if (w === undefined) weld.set(key, (w = weld.size));
    return w;
  };
  const edges = new Map<string, number>();
  const add = (a: number, b: number) => {
    if (a === b) return; // degenerate edge after welding
    const [k, d] = a < b ? [`${a},${b}`, 1] : [`${b},${a}`, -1];
    edges.set(k, (edges.get(k) ?? 0) + d);
  };
  for (let i = 0; i < idx.length; i += 3) {
    const a = id(idx[i]), b = id(idx[i + 1]), c = id(idx[i + 2]);
    add(a, b); add(b, c); add(c, a);
  }
  for (const d of edges.values()) if (d !== 0) return false;
  return edges.size > 0;
}

export function analyzeMesh(pos: ArrayLike<number>, idx: ArrayLike<number>): MeshQuantities {
  const volume = meshVolume(pos, idx);
  return {
    volume,
    area: dominantFaceArea(pos, idx),
    length: obbLength(pos),
    valid: volume > 0 && isClosed(pos, idx),
  };
}
