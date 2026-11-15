---
phase: testing
title: Testing Strategy
description: Test cho ifc-quantity-takeoff — unit trên fixture tự viết, tích hợp trên file IFC thật, e2e Playwright
---

# Testing Strategy

## Test Coverage Goals

**What level of testing do we aim for?**

- Logic thuần (`geometry`, `qto`, `extract`, `boq`, `exportXlsx`, `labels`, `takeoffState`): unit test, mục tiêu 100% dòng.
- Tầng 3D/worker (`engine`, `viewer`, `ifc.worker`, `workerClient.analyzeIfc`): kiểm qua Playwright vì cần WebGL + Worker thật.
- Tiêu chí requirements (độ chính xác, hiệu năng, riêng tư, Excel) đều có test tự động tương ứng (bảng cuối).

## Unit Tests

**What individual components need testing?**

### geometry.ts

- [x] Thể tích hộp kín, không phụ thuộc vị trí, trừ hốc trong
- [x] Diện tích một mặt tường, mặt bằng sàn, tường có lỗ cửa (trừ lỗ), mesh rỗng
- [x] Chiều dài OBB: dầm thẳng trục, dầm xoay, không có đỉnh
- [x] `analyzeMesh`: hộp kín hợp lệ; thiếu mặt → không hợp lệ; lật pháp tuyến → không hợp lệ; đỉnh tách theo mặt (kiểu web-ifc) vẫn hợp lệ

### qto.ts

- [x] `unitFactor`: SI, prefix lũy thừa theo chiều, conversion-based (foot, ft², foot qua base mm)
- [x] `pickQuantities`: Net > Gross, thứ tự ưu tiên diện tích, quy đổi theo từng chiều (mm/m³ lẫn lộn), bỏ tên lạ / sai loại / giá trị ≤ 0

### extract.ts (fixture `src/core/fixtures/mini.ifc`, IFC4 tự viết, đơn vị mm)

- [x] Tách layer set theo bề dày (hình học, 3 m³ → 2.25 + 0.75)
- [x] Tách constituent set theo `Width` của complex quantity kiểu Revit (8 m³ → 6 + 2)
- [x] Constituent không có bề dày → gộp tên (cửa)
- [x] Qto có Length tính bằng mm, Volume bằng m³
- [x] Cầu thang: chỉ đếm 2 flight, bỏ Qto của cha, flight kế thừa tầng của cha
- [x] Cấu kiện không có gì → `(Unassigned)` + `no-geometry`
- [x] office_str: số cái IfcWall/IfcColumn/IfcBeam = số entity IFC; mọi tường lấy thể tích từ Qto
- [x] Độ chính xác: tổng thể tích hình học theo loại (mesh hợp lệ) lệch Qto ≤ 5% trên office_str và office_arc

### boq.ts

- [x] Nhóm mặc định, đếm cấu kiện distinct (tường nhiều lớp đếm 1)
- [x] Thành tiền ở lá = khối lượng theo đơn vị × đơn giá, cộng dồn lên nhóm và tổng
- [x] Nhóm theo tầng trước: cùng `priceKey` ở nhiều tầng dùng chung giá
- [x] Lọc tầng / ẩn loại
- [x] Nguồn của đại lượng theo đơn vị đang chọn; cảnh báo `missing-quantity`
- [x] Đơn vị mặc định (m³ > m² > m > cái; cửa đi/cửa sổ = cái)
- [x] `locate` (3D pick → dòng + tổ tiên), `filteredOutIds`

### exportXlsx.ts (ghi rồi đọc lại bằng ExcelJS)

- [x] Header, outline level theo nhóm, STT phân cấp
- [x] Thành tiền là công thức `F*G` có cached result; nhóm `SUBTOTAL(9,…)`; tổng = tổng web
- [x] Sheet Info có tên file và câu miễn trừ

### workerClient.ts / takeoffState.ts

- [x] `readIfcSchema`: IFC4 thật, IFC2X3 có BOM + khoảng trắng, từ chối PDF / thiếu FILE_SCHEMA / rỗng
- [x] Reducer: idle → loading → ready; mở file mới reset giá/lọc/chọn nhưng giữ cách nhóm; bỏ groupBy rỗng; reveal không đóng nhóm đang mở; lỗi

## Integration Tests

**How do we test component interactions?**

- [x] web-ifc thật + `extractElements` trên office_str (3MB) và office_arc (78MB, bỏ qua nếu không có file) — `src/core/extract.test.ts`
- [x] Spike S1 (`scripts/spike-s1.mjs`): fragments localId = expressID; mesh hợp lệ khớp Qto

## End-to-End Tests

**What user flows need validation?**

`npm run e2e` (Playwright, Chromium với GPU Metal):

- [x] File mẫu → 3D + BOQ → nhập đơn giá → tổng thay đổi → xuất Excel, tổng Excel = tổng web
- [x] Click dòng BOQ → tô sáng 3D ≤ 200 ms (đo bằng `performance.measure('select')`: 142 ms)
- [x] Click vào model → dòng BOQ tương ứng được chọn và hiện ra
- [x] Không có request nào ra ngoài localhost trong suốt luồng (riêng tư)
- [x] Không có lỗi JS trên trang
- [x] File không phải IFC → thông báo lỗi dễ hiểu
- [ ] Kéo thả file (chỉ test qua input file; drop dùng cùng `openFile`)

## Test Data

**What data do we use for testing?**

- `src/core/fixtures/mini.ifc`: IFC4 tự viết, đủ các trường hợp biên của extract.
- `public/samples/office_str.ifc`: VTT, CC BY-SA 4.0, commit cùng repo (cũng là file mẫu demo).
- `~/bim-samples/office_arc.ifc` (78MB), `office_hvac.ifc` (167MB): không commit; test tự bỏ qua khi thiếu.
- Chưa có file IFC2x3 thật (chỉ có test header IFC2X3).

## Test Reporting & Coverage

**How do we verify and communicate test results?**

`npx vitest run --coverage --coverage.include='src/core/**' --coverage.include='src/ui/takeoffState.ts'` (2026-10-24, 54 test pass):

| File | Dòng | Ghi chú |
|---|---|---|
| boq.ts, exportXlsx.ts, labels.ts | 100% | |
| geometry.ts | 100% | |
| extract.ts | 98.5% | 105–107: `IfcMaterialProfileSetUsage` → profile set (Tekla có, chưa có trong fixture) |
| qto.ts | 84.8% | 67–72: `IfcConversionBasedUnit` đọc từ file (đã test hàm thuần `unitFactor`, chưa có file feet) |
| takeoffState.ts | 91.7% | nhánh `progress` |
| engine.ts, viewer.ts, ifc.worker.ts, workerClient.analyzeIfc | 0% unit | phủ bằng e2e |

## Manual Testing

**What requires human validation?**

- [x] Ảnh chụp e2e: model hiện, dòng chọn tô vàng, cấu kiện sáng cam.
- [ ] Edge, Google Sheets mở file Excel (requirements yêu cầu; chưa kiểm).
- [ ] Mobile không vỡ giao diện (CSS có breakpoint 900px, chưa kiểm trên máy thật).

## Performance Testing

**How do we validate performance?**

`PERF=1 npx playwright test e2e/perf.spec.ts` (M1 Pro, Chromium GPU):

| File | Thời gian đến BOQ | Mục tiêu | Kết quả |
|---|---|---|---|
| office_arc 78MB | 19.2 s / 27.5 s (2 lần) | ≤ 30 s cho 50MB | Đạt, nhưng sát ngưỡng với file 78MB; laptop yếu hơn có thể vượt |
| office_hvac 167MB | 64.6 s | hoàn tất, không crash | Đạt |

## Bug Tracking

**How do we manage issues?**

- 8–10% mesh web-ifc hỏng (boolean lỗi) → cảnh báo `mesh-invalid` thay vì sửa hình học.
