import { describe, expect, it } from 'vitest';
import { analyzeMesh, dominantFaceArea, meshVolume, obbLength } from './geometry';

/** Axis-aligned box as an outward-facing closed triangle mesh. */
function box(sx: number, sy: number, sz: number, ox = 0, oy = 0, oz = 0) {
  const pos: number[] = [];
  for (let i = 0; i < 8; i++) pos.push(ox + (i & 1 ? sx : 0), oy + (i & 2 ? sy : 0), oz + (i & 4 ? sz : 0));
  // prettier-ignore
  const idx = [0,2,1, 1,2,3, 4,5,6, 5,7,6, 0,1,4, 1,5,4, 2,6,3, 3,6,7, 0,4,2, 2,4,6, 1,3,5, 3,7,5];
  return { pos: new Float64Array(pos), idx: new Uint32Array(idx) };
}

/** Merges meshes; `flip` reverses winding (an inner cavity faces inward). */
function merge(...parts: { pos: Float64Array; idx: Uint32Array; flip?: boolean }[]) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const p of parts) {
    const base = pos.length / 3;
    pos.push(...p.pos);
    for (let i = 0; i < p.idx.length; i += 3) {
      const [a, b, c] = [p.idx[i], p.idx[i + 1], p.idx[i + 2]];
      idx.push(base + a, base + (p.flip ? c : b), base + (p.flip ? b : c));
    }
  }
  return { pos: new Float64Array(pos), idx: new Uint32Array(idx) };
}

describe('meshVolume', () => {
  it('is the volume of a closed box', () => {
    const b = box(5, 0.2, 3);
    expect(meshVolume(b.pos, b.idx)).toBeCloseTo(3);
  });

  it('is independent of position', () => {
    const b = box(5, 0.2, 3, 100, -50, 7);
    expect(meshVolume(b.pos, b.idx)).toBeCloseTo(3);
  });

  it('subtracts an inner cavity', () => {
    const m = merge(box(2, 2, 2), { ...box(1, 1, 1, 0.5, 0.5, 0.5), flip: true });
    expect(meshVolume(m.pos, m.idx)).toBeCloseTo(7);
  });
});

describe('dominantFaceArea', () => {
  it('is one side of a wall', () => {
    const b = box(5, 0.2, 3);
    expect(dominantFaceArea(b.pos, b.idx)).toBeCloseTo(15);
  });

  it('is the plan area of a slab', () => {
    const b = box(4, 6, 0.25);
    expect(dominantFaceArea(b.pos, b.idx)).toBeCloseTo(24);
  });

  it('nets out a door opening (wall as three boxes around a 1x2 hole)', () => {
    // 5m x 3m wall, 1m wide x 2m high door at x=2..3: left, right, lintel pieces.
    const m = merge(box(2, 0.2, 3), box(2, 0.2, 3, 3), box(1, 0.2, 1, 2, 0, 2));
    expect(dominantFaceArea(m.pos, m.idx)).toBeCloseTo(13);
  });

  it('is 0 for an empty mesh', () => {
    expect(dominantFaceArea(new Float64Array(), new Uint32Array())).toBe(0);
  });
});

describe('obbLength', () => {
  it('is the long side of an axis-aligned beam', () => {
    expect(obbLength(box(0.3, 6, 0.5).pos)).toBeCloseTo(6);
  });

  it('is the long side of a rotated beam', () => {
    const b = box(8, 0.3, 0.4);
    const c = Math.cos(Math.PI / 5);
    const s = Math.sin(Math.PI / 5);
    const rot = new Float64Array(b.pos.length);
    for (let i = 0; i < b.pos.length; i += 3) {
      rot[i] = c * b.pos[i] - s * b.pos[i + 1];
      rot[i + 1] = s * b.pos[i] + c * b.pos[i + 1];
      rot[i + 2] = b.pos[i + 2];
    }
    expect(obbLength(rot)).toBeCloseTo(8);
  });

  it('is 0 for no vertices', () => {
    expect(obbLength(new Float64Array())).toBe(0);
  });
});

describe('analyzeMesh', () => {
  it('reports a closed box as valid', () => {
    const b = box(3, 1, 1);
    expect(analyzeMesh(b.pos, b.idx)).toEqual({ volume: expect.closeTo(3), area: expect.closeTo(3), length: expect.closeTo(3), valid: true });
  });

  it('flags an open mesh (one face missing)', () => {
    const b = box(1, 1, 1);
    expect(analyzeMesh(b.pos, b.idx.slice(0, -6)).valid).toBe(false);
  });

  it('flags an inverted mesh (negative volume)', () => {
    const m = merge({ ...box(1, 1, 1), flip: true });
    expect(analyzeMesh(m.pos, m.idx).valid).toBe(false);
  });

  it('treats split vertices at the same position as one (web-ifc duplicates vertices per face)', () => {
    // Every triangle gets its own three vertices, like flat-shaded IFC meshes.
    const b = box(2, 1, 1);
    const pos: number[] = [];
    for (const i of b.idx) pos.push(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]);
    const idx = new Uint32Array(pos.length / 3).map((_, i) => i);
    expect(analyzeMesh(new Float64Array(pos), idx).valid).toBe(true);
  });
});
