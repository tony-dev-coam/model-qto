import { describe, expect, it } from 'vitest';
import { pickQuantities, unitFactor } from './qto';

describe('unitFactor', () => {
  it('is 1 for plain SI units', () => {
    expect(unitFactor({ kind: 'si', name: 'METRE' }, 1)).toBe(1);
    expect(unitFactor({ kind: 'si', name: 'CUBIC_METRE' }, 3)).toBe(1);
  });

  it('applies the SI prefix to the power of the dimension', () => {
    expect(unitFactor({ kind: 'si', name: 'METRE', prefix: 'MILLI' }, 1)).toBeCloseTo(1e-3);
    expect(unitFactor({ kind: 'si', name: 'SQUARE_METRE', prefix: 'CENTI' }, 2)).toBeCloseTo(1e-4);
    expect(unitFactor({ kind: 'si', name: 'CUBIC_METRE', prefix: 'MILLI' }, 3)).toBeCloseTo(1e-9);
  });

  it('multiplies a conversion-based unit by its SI base', () => {
    const foot = { kind: 'conversion', factor: 0.3048, base: { kind: 'si', name: 'METRE' } } as const;
    const sqft = { kind: 'conversion', factor: 0.09290304, base: { kind: 'si', name: 'SQUARE_METRE' } } as const;
    expect(unitFactor(foot, 1)).toBeCloseTo(0.3048);
    expect(unitFactor(sqft, 2)).toBeCloseTo(0.09290304);
    // A foot expressed via a millimetre base: 304.8 mm.
    expect(unitFactor({ kind: 'conversion', factor: 304.8, base: { kind: 'si', name: 'METRE', prefix: 'MILLI' } }, 1)).toBeCloseTo(0.3048);
  });
});

describe('pickQuantities', () => {
  const scale = { length: 0.001, area: 1, volume: 1 };

  it('prefers net over gross and converts per dimension', () => {
    const q = pickQuantities(
      [
        { name: 'GrossVolume', kind: 'volume', value: 1.07 },
        { name: 'NetVolume', kind: 'volume', value: 1.06 },
        { name: 'Length', kind: 'length', value: 5570 },
        { name: 'GrossArea', kind: 'area', value: 34.2 },
        { name: 'NetArea', kind: 'area', value: 34 },
      ],
      scale,
    );
    expect(q).toEqual({ volume: 1.06, length: 5.57, area: 34 });
  });

  it('follows the area preference order (side area before plan area)', () => {
    expect(
      pickQuantities(
        [
          { name: 'GrossSideArea', kind: 'area', value: 20 },
          { name: 'NetArea', kind: 'area', value: 15 },
          { name: 'NetSideArea', kind: 'area', value: 18 },
        ],
        scale,
      ).area,
    ).toBe(18);
  });

  it('falls back to gross when net is missing', () => {
    expect(pickQuantities([{ name: 'GrossVolume', kind: 'volume', value: 2 }], scale)).toEqual({ volume: 2 });
  });

  it('ignores unknown names, wrong kinds and non-positive values', () => {
    expect(
      pickQuantities(
        [
          { name: 'Width', kind: 'length', value: 300 },
          { name: 'NetVolume', kind: 'area', value: 9 },
          { name: 'NetArea', kind: 'area', value: 0 },
        ],
        scale,
      ),
    ).toEqual({});
  });
});
