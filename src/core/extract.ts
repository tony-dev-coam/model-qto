// Semantic pass: IFC model → flat Element[] (one per leaf element × material layer), quantities in metres.
import * as WebIFC from 'web-ifc';
import { analyzeMesh } from './geometry';
import { pickQuantities, readQuantity, readUnitScale, type Dimension, type Quantity } from './qto';

export type QtySource = 'qto' | 'geometry';
export const UNKNOWN = '(Unassigned)';

/** One row per leaf element × material layer; count by distinct expressId, never by rows. */
export interface Element {
  expressId: number; // = fragments localId (verified in spike S1)
  globalId: string;
  ifcClass: string; // StandardCase/ElementedCase folded into the base class
  typeName: string;
  material: string;
  storey: string;
  parent?: string; // name of the IfcRelAggregates parent, if any
  length?: number;
  area?: number;
  volume?: number;
  source: Record<Dimension, QtySource | undefined>;
  warnings: string[]; // 'layer-split' | 'mesh-invalid' | 'no-geometry'
}

export interface ExtractResult {
  elements: Element[];
  schema: string;
  warnings: string[]; // file level: 'no-qto'
}

export interface ExtractOptions {
  /** Ignore Qto and measure everything from geometry (accuracy validation only). */
  forceGeometry?: boolean;
  onProgress?: (progress: number) => void;
}

const W = WebIFC as unknown as Record<string, number>;

/** In-scope classes → the dimensions worth measuring for them. */
const CLASSES: [name: string, codes: string[], dims: Dimension[]][] = [
  ['IfcWall', ['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE'], ['volume', 'area']],
  ['IfcSlab', ['IFCSLAB', 'IFCSLABSTANDARDCASE', 'IFCSLABELEMENTEDCASE'], ['volume', 'area']],
  ['IfcRoof', ['IFCROOF'], ['volume', 'area']],
  ['IfcColumn', ['IFCCOLUMN', 'IFCCOLUMNSTANDARDCASE'], ['volume', 'length']],
  ['IfcBeam', ['IFCBEAM', 'IFCBEAMSTANDARDCASE'], ['volume', 'length']],
  ['IfcMember', ['IFCMEMBER', 'IFCMEMBERSTANDARDCASE'], ['volume', 'length']],
  ['IfcPlate', ['IFCPLATE', 'IFCPLATESTANDARDCASE'], ['volume', 'area']],
  ['IfcFooting', ['IFCFOOTING'], ['volume']],
  ['IfcPile', ['IFCPILE'], ['volume', 'length']],
  ['IfcDoor', ['IFCDOOR', 'IFCDOORSTANDARDCASE'], ['area']],
  ['IfcWindow', ['IFCWINDOW', 'IFCWINDOWSTANDARDCASE'], ['area']],
  ['IfcStair', ['IFCSTAIR'], ['volume']],
  ['IfcStairFlight', ['IFCSTAIRFLIGHT'], ['volume']],
  ['IfcRamp', ['IFCRAMP'], ['volume']],
  ['IfcRampFlight', ['IFCRAMPFLIGHT'], ['volume']],
  ['IfcRailing', ['IFCRAILING'], ['length']],
  ['IfcCovering', ['IFCCOVERING'], ['area', 'volume']],
  ['IfcCurtainWall', ['IFCCURTAINWALL'], ['area']],
  ['IfcBuildingElementProxy', ['IFCBUILDINGELEMENTPROXY'], ['volume']],
];

const ids = (api: WebIFC.IfcAPI, modelID: number, type: number): number[] => {
  const v = api.GetLineIDsWithType(modelID, type);
  const out: number[] = [];
  for (let i = 0; i < v.size(); i++) out.push(v.get(i));
  return out;
};
const refs = (x: unknown): number[] => (Array.isArray(x) ? x : x ? [x] : []).map((r: { value: number }) => r.value);

interface Layer { name: string; thickness: number }

/**
 * Material association → layers (with thickness) or a single joined name.
 * `widths`: per-material Width from IfcPhysicalComplexQuantity (how Revit records constituent thickness).
 */
function readMaterial(api: WebIFC.IfcAPI, modelID: number, id: number, widths?: Map<string, number>): Layer[] {
  const m = api.GetLine(modelID, id);
  const name = (ref?: { value: number } | null) => (ref ? api.GetLine(modelID, ref.value).Name?.value : undefined) ?? UNKNOWN;
  const joined = (names: string[]) => [{ name: [...new Set(names)].join(' + ') || UNKNOWN, thickness: 0 }];
  switch (m.type) {
    case WebIFC.IFCMATERIAL:
      return [{ name: m.Name?.value ?? UNKNOWN, thickness: 0 }];
    case WebIFC.IFCMATERIALLAYERSETUSAGE:
      return readMaterial(api, modelID, m.ForLayerSet.value, widths);
    case WebIFC.IFCMATERIALLAYERSET:
      return m.MaterialLayers.map((ref: { value: number }) => {
        const l = api.GetLine(modelID, ref.value);
        return { name: name(l.Material), thickness: Number(l.LayerThickness?.value ?? 0) };
      });
    case WebIFC.IFCMATERIALPROFILESETUSAGE:
      return readMaterial(api, modelID, m.ForProfileSet.value, widths);
    case WebIFC.IFCMATERIALPROFILESET:
      return joined(m.MaterialProfiles.map((ref: { value: number }) => name(api.GetLine(modelID, ref.value).Material)));
    case WebIFC.IFCMATERIALCONSTITUENTSET: {
      const layers = (m.MaterialConstituents ?? []).map((ref: { value: number }) => {
        const c = api.GetLine(modelID, ref.value);
        const mat = name(c.Material);
        const thickness = Number(c.Fraction?.value ?? widths?.get(mat) ?? widths?.get(c.Name?.value) ?? 0);
        return { name: mat, thickness };
      });
      // Split only when every constituent has a share; otherwise one row with the joined name.
      return layers.length > 0 && layers.every((l: Layer) => l.thickness > 0) ? layers : joined(layers.map((l: Layer) => l.name));
    }
    case WebIFC.IFCMATERIALLIST:
      return joined(m.Materials.map((ref: { value: number }) => name(ref)));
    default:
      return [{ name: UNKNOWN, thickness: 0 }];
  }
}

/** World-space mesh per element, merged across its placed geometries. */
function streamMeshes(api: WebIFC.IfcAPI, modelID: number, wanted: number[], onMesh: (id: number, pos: number[], idx: number[]) => void) {
  api.StreamMeshes(modelID, wanted, (mesh) => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let g = 0; g < mesh.geometries.size(); g++) {
      const pg = mesh.geometries.get(g);
      const geom = api.GetGeometry(modelID, pg.geometryExpressID);
      const vs = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const ix = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
      const m = pg.flatTransformation;
      const base = pos.length / 3;
      for (let k = 0; k < vs.length; k += 6) {
        const x = vs[k], y = vs[k + 1], z = vs[k + 2];
        pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      }
      for (let k = 0; k < ix.length; k++) idx.push(base + ix[k]);
      geom.delete();
    }
    onMesh(mesh.expressID, pos, idx);
  });
}

export function extractElements(api: WebIFC.IfcAPI, modelID: number, opts: ExtractOptions = {}): ExtractResult {
  const scale = readUnitScale(api, modelID);

  // In-scope elements.
  const classOf = new Map<number, { name: string; dims: Dimension[] }>();
  for (const [name, codes, dims] of CLASSES)
    for (const code of codes) if (W[code] !== undefined) for (const id of ids(api, modelID, W[code])) classOf.set(id, { name, dims });

  // Relationships, one pass per relation type.
  const parentOf = new Map<number, number>();
  for (const r of ids(api, modelID, WebIFC.IFCRELAGGREGATES)) {
    const rel = api.GetLine(modelID, r);
    for (const c of refs(rel.RelatedObjects)) parentOf.set(c, rel.RelatingObject.value);
  }
  const typeOf = new Map<number, number>();
  for (const r of ids(api, modelID, WebIFC.IFCRELDEFINESBYTYPE)) {
    const rel = api.GetLine(modelID, r);
    for (const o of refs(rel.RelatedObjects)) typeOf.set(o, rel.RelatingType.value);
  }
  const quantitiesOf = new Map<number, Quantity[]>();
  const widthsOf = new Map<number, Map<string, number>>();
  for (const r of ids(api, modelID, WebIFC.IFCRELDEFINESBYPROPERTIES)) {
    const rel = api.GetLine(modelID, r);
    for (const defId of refs(rel.RelatingPropertyDefinition)) {
      const def = api.GetLine(modelID, defId);
      const psetName: string = def.Name?.value ?? '';
      if (def.type !== WebIFC.IFCELEMENTQUANTITY || !(psetName.startsWith('Qto_') || psetName === 'BaseQuantities')) continue;
      const qs: Quantity[] = [];
      const widths = new Map<string, number>();
      for (const q of refs(def.Quantities)) {
        const line = api.GetLine(modelID, q);
        if (line.type !== WebIFC.IFCPHYSICALCOMPLEXQUANTITY) qs.push(readQuantity(api, modelID, q));
        else for (const sub of refs(line.HasQuantities).map((h) => readQuantity(api, modelID, h)))
          if (sub.name === 'Width' && sub.value > 0) widths.set(line.Name?.value ?? '', sub.value);
      }
      for (const o of refs(rel.RelatedObjects)) {
        quantitiesOf.set(o, [...(quantitiesOf.get(o) ?? []), ...qs]);
        if (widths.size) widthsOf.set(o, widths);
      }
    }
  }
  const materialOf = new Map<number, number>();
  for (const r of ids(api, modelID, WebIFC.IFCRELASSOCIATESMATERIAL)) {
    const rel = api.GetLine(modelID, r);
    for (const o of refs(rel.RelatedObjects)) materialOf.set(o, rel.RelatingMaterial.value);
  }
  const containerOf = new Map<number, number>();
  for (const r of ids(api, modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const rel = api.GetLine(modelID, r);
    for (const o of refs(rel.RelatedElements)) containerOf.set(o, rel.RelatingStructure.value);
  }

  // Leaf rule: an in-scope element with an in-scope aggregate child is represented by its children only.
  const hasLeafChildren = new Set<number>();
  for (const [child, parent] of parentOf) if (classOf.has(child)) hasLeafChildren.add(parent);

  const nameOf = (id: number) => api.GetLine(modelID, id).Name?.value as string | undefined;
  const storeyOf = (id: number): string => {
    // Walk containment/aggregation upward until a storey (children of a stair inherit the stair's storey).
    for (let cur: number | undefined = id, guard = 0; cur !== undefined && guard < 50; guard++) {
      const line = api.GetLine(modelID, cur);
      if (cur !== id && line.type === WebIFC.IFCBUILDINGSTOREY) return line.Name?.value ?? UNKNOWN;
      cur = containerOf.get(cur) ?? parentOf.get(cur);
    }
    return UNKNOWN;
  };

  interface Pending { id: number; cls: { name: string; dims: Dimension[] }; q: Partial<Record<Dimension, number>>; source: Element['source'] }
  const pending: Pending[] = [];
  let anyQto = false;
  for (const [id, cls] of classOf) {
    if (hasLeafChildren.has(id)) continue;
    const q = opts.forceGeometry ? {} : pickQuantities(quantitiesOf.get(id) ?? [], scale);
    if (Object.keys(q).length) anyQto = true;
    const source: Element['source'] = { volume: undefined, area: undefined, length: undefined };
    for (const d of Object.keys(q) as Dimension[]) source[d] = 'qto';
    pending.push({ id, cls, q, source });
  }

  // Geometry fallback only for elements missing a dimension that matters for their class.
  const missing = pending.filter((p) => p.cls.dims.some((d) => p.q[d] === undefined));
  const byId = new Map(pending.map((p) => [p.id, p]));
  const meshWarnings = new Map<number, string>(missing.map((p) => [p.id, 'no-geometry']));
  let done = 0;
  if (missing.length)
    streamMeshes(api, modelID, missing.map((p) => p.id), (id, pos, idx) => {
      const p = byId.get(id);
      opts.onProgress?.(++done / missing.length);
      if (!p || idx.length === 0) return;
      const g = analyzeMesh(pos, idx);
      meshWarnings.set(id, g.valid ? '' : 'mesh-invalid');
      for (const d of p.cls.dims)
        if (p.q[d] === undefined) {
          p.q[d] = g[d];
          p.source[d] = 'geometry';
        }
    });
  opts.onProgress?.(1);

  const elements: Element[] = [];
  for (const { id, cls, q, source } of pending) {
    const line = api.GetLine(modelID, id);
    const typeId = typeOf.get(id);
    const matId = materialOf.get(id) ?? (typeId !== undefined ? materialOf.get(typeId) : undefined);
    const layers = matId !== undefined ? readMaterial(api, modelID, matId, widthsOf.get(id)) : [{ name: UNKNOWN, thickness: 0 }];
    const total = layers.reduce((s, l) => s + l.thickness, 0);
    const split = layers.length > 1 && total > 0;
    const parentId = parentOf.get(id);
    const base = {
      expressId: id,
      globalId: line.GlobalId?.value ?? '',
      ifcClass: cls.name,
      typeName: (typeId !== undefined && nameOf(typeId)) || line.ObjectType?.value || UNKNOWN,
      storey: storeyOf(id),
      parent: parentId !== undefined ? nameOf(parentId) ?? UNKNOWN : undefined,
      length: q.length,
      area: q.area,
      source,
    };
    const warnings = [meshWarnings.get(id)].filter((w): w is string => !!w);
    if (!split) {
      elements.push({ ...base, material: layers.length > 1 ? [...new Set(layers.map((l) => l.name))].join(' + ') : layers[0].name, volume: q.volume, warnings });
      continue;
    }
    for (const l of layers)
      elements.push({
        ...base,
        material: l.name,
        volume: q.volume === undefined ? undefined : (q.volume * l.thickness) / total,
        warnings: [...warnings, 'layer-split'],
      });
  }

  return { elements, schema: api.GetModelSchema(modelID), warnings: anyQto || opts.forceGeometry ? [] : ['no-qto'] };
}
