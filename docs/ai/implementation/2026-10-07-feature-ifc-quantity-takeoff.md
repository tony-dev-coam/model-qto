---
phase: implementation
title: Implementation Guide
description: Ghi chú implement ifc-quantity-takeoff, kết quả spike và các sai khác so với design
---

# Implementation Guide

## Development Setup

**How do we get started?**

- Node 24, `npm install` (postinstall copy `web-ifc.wasm` và `fragments-worker.mjs` vào `public/vendor/`).
- `npm run dev`, `npm test` (vitest, chạy trong Node, có test đọc file IFC mẫu), `npm run e2e` (Playwright).
- Tên sản phẩm: **ModelQTO** (IFC quantity takeoff), đổi 2026-11-01. Ảnh portfolio: `docs/screenshots/` (tạo lại: `SHOT_DIR=docs/screenshots npx playwright test e2e/screenshots.spec.ts`).
- File mẫu demo (từ 2026-11-01): `public/samples/NBU_MedicalClinic_Arch-Optimized.ifc` (NBU Medical Clinic, kiến trúc, buildingSMART / NIBS Common BIM Files; IFC2x3, Revit 2011). File này không có Qto cho cấu kiện (chỉ IfcSpace có) nên mọi khối lượng tính từ hình học; ~520 dòng cấu kiện có thể tích âm (mesh Revit lật pháp tuyến/hở), nặng nhất là IfcCovering (tổng ≈ -6 700 m³) và IfcMember "stringer" (-62,65 m³). Chưa sửa trong core.
- `public/samples/office_str.ifc` (VTT BIM4LCA, CC BY-SA 4.0) vẫn giữ cho unit test. File lớn để đo: `~/bim-samples/office_arc.ifc` (78MB), `office_hvac.ifc` (167MB).

## Code Structure

**How is the code organized?**

Theo cấu trúc của clone-viewer (yêu cầu người dùng 2026-10-24):

```
src/
  core/                 không import React; index.ts là barrel
    geometry.ts qto.ts extract.ts boq.ts labels.ts exportXlsx.ts   hàm thuần, có *.test.ts
    engine.ts (copy clone-viewer) viewer.ts ifc.worker.ts workerClient.ts
    fixtures/mini.ifc
  ui/
    App.tsx             ConfigProvider + antd App + ViewerProvider + TakeoffProvider + AppLayout
    viewer.tsx          ViewerContext: boot engine khi viewport mount, useViewer()
    takeoff.tsx         TakeoffContext: useReducer + BOQ dẫn xuất + action, đồng bộ 3D; useTakeoff()
    takeoffState.ts     reducer thuần (có test)
    strings.ts theme.ts DropOverlay.tsx
    layout/             AppLayout (slot header/toolbar/viewer/boq/footer), Header, Toolbar, Footer
    panels/             ViewerPanel, BoqPanel
e2e/                    smoke.spec.ts, perf.spec.ts (PERF=1)
scripts/                spike-s1.mjs, extract-summary.ts (npx tsx), copy-assets.mjs
```

- State: React context (yêu cầu người dùng 2026-10-24) thay cho store `{getSnapshot, subscribe}` của design. Viewer báo pick qua `viewer.onPick(listener)`; `TakeoffProvider` đăng ký và đồng bộ selection/filters sang 3D bằng effect.
- `core/labels.ts`: nhãn domain dùng chung với Excel. `ui/strings.ts`: chuỗi UI (`S`). Ngôn ngữ: tiếng Anh (người dùng chọn 2026-10-24).

## Implementation Notes

**Key technical details to remember:**

### Spike S1 (2026-10-24, Node 24, M-series Mac)

| File | Lượt 1 IfcImporter | Lượt 2 OpenModel + StreamMeshes | RSS tối đa |
|---|---|---|---|
| office_str 3MB | 1.3–3.9s | 1–2.5s | 0.34GB |
| office_arc 78MB | 13.2s | 5s | 1.2GB |
| office_hvac 167MB | 72s | 5.2s | 1.2GB |

- **DA1 đúng:** fragments `localId` = expressID cho 100% tường/sàn/dầm/cột (1533 + 1005 cấu kiện).
- **DA2 đúng có điều kiện:** mesh web-ifc ở mét, đã trừ opening. Nhưng 8–10% mesh hỏng (hở hoặc thể tích âm do boolean lỗi): tường Revit có mesh −22m³, tấm sàn rỗng Tekla mesh gấp 6 lần Qto. Bỏ các mesh hỏng thì tổng thể tích theo loại lệch Qto ≤ 0.2% ở cả hai file. → `analyzeMesh().valid` là bắt buộc, mesh hỏng thì gắn cảnh báo `mesh-invalid` (đổi tên từ `mesh-open` trong design, vì bao cả trường hợp thể tích âm).
- **DA3 đúng trong Node:** 167MB xong, 1.2GB RAM. Chưa đo trên trình duyệt (task 11).
- **Đơn vị Qto theo từng loại:** Tekla ghi `Length=5570` (mm) nhưng `NetVolume=1.06` (m³) trong cùng một pset. Hệ số phải lấy riêng LENGTHUNIT / AREAUNIT / VOLUMEUNIT.

### Core Features

- `geometry.ts`: thể tích tứ diện có dấu; diện tích = gom tam giác theo hướng pháp tuyến (gộp hai chiều), lấy hướng có tổng diện tích lớn nhất, cộng các tam giác song song (|n·d|>0.98) rồi chia 2; chiều dài = biên độ theo trục PCA (power iteration). Mesh hợp lệ = thể tích > 0 và mọi cạnh có hướng đều có cạnh ngược sau khi hàn đỉnh trùng (làm tròn 0.01mm).

- `qto.ts`: `unitFactor` (SI prefix lũy thừa theo chiều, conversion-based nhân base), `pickQuantities` (Net > Gross; NetSideArea > NetArea > NetSurfaceArea > Gross…), `readUnitScale` từ IfcUnitAssignment.
- `extract.ts`: một lượt qua từng loại relation (Aggregates, DefinesByType, DefinesByProperties, AssociatesMaterial, ContainedInSpatialStructure) → map; quy tắc cấu kiện lá; vật liệu của type dùng khi occurrence không có; tầng tìm bằng cách đi ngược containment/aggregation; chỉ `StreamMeshes` cho cấu kiện thiếu đại lượng cần cho loại của nó. Tùy chọn `forceGeometry` chỉ dùng cho test độ chính xác. File arc 78MB: 4s.
- `typeName`: tên IfcTypeObject, nếu không có thì `ObjectType`, cuối cùng `(Không xác định)`. Tekla không xuất type nên `ObjectType` (ví dụ `HOLLOW_CORE_SLAB`) là tên nhóm hợp lý.

### Sai khác so với design

| Design | Thực tế | Lý do |
|---|---|---|
| `Element.count` (1 cho dòng đầu, 0 cho lớp phụ) | Bỏ trường `count`; BOQ đếm số expressId khác nhau | Dòng lớp phụ hiện "0 cái" gây hiểu nhầm. Đếm distinct đúng ở cả dòng lá lẫn nhóm |
| D3 chỉ tách `IfcMaterialLayerSet` | Tách cả `IfcMaterialConstituentSet` khi mọi constituent có `Fraction` hoặc `Width` (lấy từ `IfcPhysicalComplexQuantity` cùng tên trong Qto) | Revit/ODA IFC4 (office_arc) xuất tường nhiều lớp dưới dạng constituent set; tổng Width các lớp = Width tường (435 = 30+50+30+175+150). Thiếu bề dày → gộp tên bằng " + " (cửa đi, cửa sổ) |
| Cảnh báo `mesh-open` | `mesh-invalid` (hở hoặc thể tích ≤ 0), thêm `no-geometry` | Spike S1 |
| `takeoffStore.ts` + `useSyncExternalStore` | React context + `useReducer` (`ui/takeoff.tsx`) | Người dùng yêu cầu |
| `strings.ts` song ngữ, label tiếng Việt | Chỉ tiếng Anh (`ui/strings.ts`, `core/labels.ts`), `(Unassigned)` | Khách Upwork đọc tiếng Anh |
| Đổi thứ tự nhóm: preset + kéo thả | antd Select multiple, thứ tự chọn = thứ tự nhóm | Ít code hơn, đủ cho US6 |
| `viewer.select(ids, zoom)` | `select(ids)` + `fitTo(ids)` | Zoom từng gọi lại `highlightByID` lần 2 |

### Đo trên trình duyệt

- Click dòng → tô sáng: 142 ms với GPU; 826 ms với SwiftShader (headless mặc định) → `playwright.config.ts` bật GPU Metal.
- office_arc 78MB: 19–28 s đến lúc có BOQ (mục tiêu 30 s, sát ngưỡng). office_hvac 167MB: 65 s, không crash.
- Bundle: main 3.5MB (That Open), worker 3.9MB, ExcelJS 0.9MB tách chunk chỉ tải khi xuất.

### Quan sát trên dữ liệu thật

- office_str: 30 dòng BOQ lá; mọi tường/dầm/cột/sàn có Qto. `IfcRoof | ROOF | ZeroWeight` (2 cái, 667 m³ từ hình học) có vẻ là khối placeholder của Tekla; giữ nguyên, nhãn Nguồn "Tính toán" báo cho estimator.
- office_arc: 161 dòng BOQ lá sau khi tách lớp. Một số sàn (YP-1, YP-2) vẫn gộp tên vì có constituent không có Width.

### Patterns & Best Practices

- Store `{getSnapshot, subscribe}` + `useSyncExternalStore` như clone-viewer.
