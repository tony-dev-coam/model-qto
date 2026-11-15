// Picks quantities out of IfcElementQuantity and converts them to metres via IfcUnitAssignment.
import * as WebIFC from 'web-ifc';

export type Dimension = 'length' | 'area' | 'volume';
export type UnitScale = Record<Dimension, number>;

export type UnitDesc =
  | { kind: 'si'; name: string; prefix?: string }
  | { kind: 'conversion'; factor: number; base: UnitDesc };

const PREFIX: Record<string, number> = {
  EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1,
  DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18,
};

/** Factor from the unit to m / m² / m³. `power` = 1, 2, 3 for length, area, volume (an SI prefix scales the base length). */
export function unitFactor(unit: UnitDesc, power: number): number {
  if (unit.kind === 'conversion') return unit.factor * unitFactor(unit.base, power);
  return (unit.prefix ? PREFIX[unit.prefix] ?? 1 : 1) ** power;
}

export interface Quantity {
  name: string;
  kind: Dimension | 'count' | 'other';
  value: number;
}

// Net before gross; side area (walls) before plan area (slabs) before surface area (beams/columns).
const PREFERENCE: Record<Dimension, string[]> = {
  volume: ['NetVolume', 'GrossVolume'],
  area: ['NetSideArea', 'NetArea', 'NetSurfaceArea', 'GrossSideArea', 'GrossArea', 'GrossSurfaceArea'],
  length: ['Length'],
};

/** Best quantity per dimension, already in metres. Missing dimensions are left out (→ geometry fallback). */
export function pickQuantities(quantities: Quantity[], scale: UnitScale): Partial<Record<Dimension, number>> {
  const out: Partial<Record<Dimension, number>> = {};
  for (const dim of ['volume', 'area', 'length'] as const) {
    for (const name of PREFERENCE[dim]) {
      const q = quantities.find((x) => x.name === name && x.kind === dim && x.value > 0);
      if (q) {
        out[dim] = q.value * scale[dim];
        break;
      }
    }
  }
  return out;
}

const KIND: Record<number, Quantity['kind']> = {
  [WebIFC.IFCQUANTITYLENGTH]: 'length',
  [WebIFC.IFCQUANTITYAREA]: 'area',
  [WebIFC.IFCQUANTITYVOLUME]: 'volume',
  [WebIFC.IFCQUANTITYCOUNT]: 'count',
};

/** Reads one IfcPhysicalSimpleQuantity line. */
export function readQuantity(api: WebIFC.IfcAPI, modelID: number, expressID: number): Quantity {
  const q = api.GetLine(modelID, expressID);
  const value = q.LengthValue ?? q.AreaValue ?? q.VolumeValue ?? q.CountValue;
  return { name: q.Name?.value ?? '', kind: KIND[q.type] ?? 'other', value: Number(value?.value ?? 0) };
}

function readUnit(api: WebIFC.IfcAPI, modelID: number, expressID: number): UnitDesc | undefined {
  const u = api.GetLine(modelID, expressID);
  if (u.type === WebIFC.IFCSIUNIT) return { kind: 'si', name: u.Name.value, prefix: u.Prefix?.value };
  if (u.type === WebIFC.IFCCONVERSIONBASEDUNIT) {
    const m = api.GetLine(modelID, u.ConversionFactor.value);
    const base = readUnit(api, modelID, m.UnitComponent.value);
    return base && { kind: 'conversion', factor: Number(m.ValueComponent.value), base };
  }
  return undefined;
}

/** Project length/area/volume units → metre factors. Missing units default to SI (factor 1). */
export function readUnitScale(api: WebIFC.IfcAPI, modelID: number): UnitScale {
  const scale: UnitScale = { length: 1, area: 1, volume: 1 };
  const assignments = api.GetLineIDsWithType(modelID, WebIFC.IFCUNITASSIGNMENT);
  if (assignments.size() === 0) return scale;
  const POWER = { LENGTHUNIT: ['length', 1], AREAUNIT: ['area', 2], VOLUMEUNIT: ['volume', 3] } as const;
  for (const ref of api.GetLine(modelID, assignments.get(0)).Units) {
    const line = api.GetLine(modelID, ref.value);
    const target = POWER[line.UnitType?.value as keyof typeof POWER];
    const unit = target && readUnit(api, modelID, ref.value);
    if (target && unit) scale[target[0]] = unitFactor(unit, target[1]);
  }
  return scale;
}
