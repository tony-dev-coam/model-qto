---
phase: planning
title: Project Planning & Task Breakdown
description: Chia việc cho MVP ifc-quantity-takeoff theo design D1–D8
---

# Project Planning & Task Breakdown

Design: `docs/ai/design/2026-10-07-feature-ifc-quantity-takeoff.md`. Làm thẳng trên `main`, không commit (người dùng chọn 2026-10-24).

## Milestones

**What are the major checkpoints?**

- [x] M1: Lõi khối lượng (geometry, qto, extract) đã có test trên file mẫu, và spike S1 đã kiểm chứng xong
- [x] M2: Luồng đầy đủ trên trình duyệt: file → 3D + BOQ → lọc/nhóm/giá → Excel
- [ ] M3: Smoke test Playwright, đo hiệu năng (xong), deploy Cloudflare Pages (chưa)

## Task Breakdown

**What specific work needs to be done?**

### Phase 1: Foundation

- [x] 1. Scaffold: Vite + React 19 + TS, antd, That Open 3.4, web-ifc 0.0.77, vitest; copy `engine.ts`, `store.ts`, `copy-assets.mjs` từ clone-viewer
- [x] 2. Spike S1: kiểm chứng DA1 (fragments localId = expressID), DA2 (mesh web-ifc ở mét, đã trừ opening), đo thời gian

### Phase 2: Core Features

- [x] 3. `geometry.ts`: thể tích mesh, diện tích theo mặt chính, chiều dài OBB, phát hiện mesh hở
- [x] 4. `qto.ts`: hệ số đơn vị, chọn giá trị Qto theo thứ tự ưu tiên
- [x] 5. `extract.ts`: cấu kiện lá, type/vật liệu/tầng, tách lớp, tính từ hình học khi thiếu; test sai lệch ≤5% so với Qto
- [x] 6. Worker hai lượt + `workerClient`: tiến trình, kiểm tra header, mã lỗi
- [x] 7. `boq.ts`: lọc → nhóm → định giá, đơn vị mặc định
- [x] 8. UI: DropZone, Viewer, Toolbar, BoqTable, tô sáng hai chiều
- [x] 9. `exportXlsx.ts`: outline, công thức, sheet Thông tin

### Phase 3: Integration & Polish

- [x] 10. Playwright smoke: file mẫu → BOQ → Excel; không có request ra ngoài origin
- [x] 11. Đo hiệu năng file 78MB và 167MB (DA3)

### Việc mới phát sinh (2026-10-24)

- [ ] 12. Tìm và test 1 file IFC2x3 công khai
- [ ] 13. Kiểm tra file Excel trên Google Sheets và Edge
- [ ] 14. Deploy Cloudflare Pages
- [ ] 15. Giảm thời gian file 78MB (lượt 1 IfcImporter chiếm phần lớn) nếu laptop mục tiêu vượt 30 s

## Dependencies

**What needs to happen in what order?**

- 2 chặn 3, 5, 8: nếu DA1/DA2 sai thì phải sửa design trước.
- 3, 4 → 5 → 6. 7 độc lập với 3–6 (chỉ cần kiểu `Element`). 8 cần 6 và 7. 9 cần 7.
- Thiếu file IFC2x3 công khai: không chặn, chỉ hạn chế test.

## Timeline & Estimates

**When will things be done?**

- Phase 1: 1–2 ngày. Phase 2: khoảng 2 tuần. Phase 3: 2–3 ngày. Tổng khớp mục tiêu 3–4 tuần part-time.

## Risks & Mitigation

**What could go wrong?**

- DA3 (file 150MB hết bộ nhớ khi parse hai lượt): giải pháp dự phòng có trong design.
- Sai lệch hình học > 5% với một số loại cấu kiện: hiện cảnh báo trên dòng, ghi nhận trong testing doc.

## Resources Needed

**What do we need to succeed?**

- File mẫu `~/bim-samples/office_*.ifc` (VTT, CC BY-SA 4.0). Cần thêm 1 file IFC2x3.
