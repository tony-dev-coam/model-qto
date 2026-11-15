---
phase: requirements
title: Requirements & Problem Understanding
description: Bóc khối lượng tự động từ model IFC trên trình duyệt, xuất BOQ Excel
---

# Requirements & Problem Understanding

Feature: `ifc-quantity-takeoff`. Ngày tạo: 2026-10-07.

## Problem Statement

**What problem are we solving?**

- **Vấn đề cốt lõi:** Estimator/QS vẫn bóc khối lượng thủ công từ bản vẽ PDF/DWG, hoặc mở phần mềm BIM nặng (Revit, Navisworks) chỉ để lấy số lượng. Kể cả khi kiến trúc sư/kỹ sư đã giao model IFC, estimator thường không có công cụ nhẹ để biến model thành BOQ.
- **Ai bị ảnh hưởng:** Estimator, QS ở nhà thầu chính (GC) làm dự toán sơ bộ và đấu thầu.
- **Cách làm hiện tại:**
  - Thuê freelancer bóc khối lượng: trong đợt khảo sát Upwork ngày 2026-10-06, 55 trên 336 job AEC có "estimat/takeoff/quantity" ngay trong tiêu đề.
  - Tự làm tool nội bộ: có job "Fire Services Construction Estimating Platform", job tính vật tư vách thạch cao (Trockenbau), và một công ty tự làm tool bóc cửa đi/cửa sổ rồi phải thuê người kiểm tra độ chính xác.
  - Dùng Revit schedule rồi export Excel, nhưng cách này cần có license Revit và file gốc .rvt.

## Goals & Objectives

**What do we want to achieve?**

- **Mục tiêu chính**
  - Có một demo công khai, không cần đăng nhập: upload file IFC → xem 3D → có ngay bảng khối lượng theo nhóm → nhập đơn giá → xuất Excel.
  - Dùng demo này làm bằng chứng năng lực trong proposal Upwork và tin nhắn chào hàng, đồng thời đo xem có ai quan tâm hay không.
- **Mục tiêu phụ**
  - Viết case study cho blog career (chủ đề `ifc`, `three-js`, `performance`).
  - Kiểm chứng kỹ thuật: web-ifc có đủ nhanh và đủ chính xác cho file thực tế không, để quyết định có làm tiếp thành SaaS hay không.
- **Non-goals (ngoài phạm vi MVP)**
  - Tài khoản, đăng nhập, lưu dự án trên server, thanh toán, làm việc nhóm.
  - Backend hoặc upload file lên server. File không rời khỏi máy người dùng.
  - Đọc bản vẽ PDF/DWG. Chỉ hỗ trợ IFC.
  - Đọc file .rvt hoặc kết nối APS/ACC (để sau MVP).
  - Cơ sở dữ liệu đơn giá, tự gán mã CSI/Uniclass.
  - Phần MEP chi tiết (ống, ống gió, dây cáp) và cốt thép.
  - Sửa model.

## User Stories & Use Cases

**How will users interact with the solution?**

- **US1. Mở model:** Là estimator, tôi muốn kéo thả file `.ifc` vào trang web để xem model 3D mà không phải cài phần mềm.
- **US2. Khối lượng tự động:** Là estimator, tôi muốn thấy ngay bảng khối lượng nhóm theo loại cấu kiện → type → vật liệu, gồm số lượng (cái), chiều dài (m), diện tích (m²), thể tích (m³).
- **US3. Biết số liệu đáng tin đến đâu:** Là estimator, tôi muốn mỗi dòng ghi rõ nguồn số liệu: `Qto` (lấy từ BaseQuantities trong file) hay `Tính toán` (tính từ hình học). Nhờ vậy tôi biết dòng nào cần kiểm tra lại.
- **US4. Đối chiếu 3D:** Là estimator, tôi muốn click vào một dòng trong BOQ để các cấu kiện thuộc dòng đó sáng lên trong 3D, và click vào một cấu kiện trong 3D để thấy nó thuộc dòng nào.
- **US5. Lọc:** Là estimator, tôi muốn lọc theo tầng (IfcBuildingStorey) và ẩn/hiện theo loại cấu kiện để bóc khối lượng theo từng phần.
- **US6. Đổi cách nhóm:** Là estimator, tôi muốn đổi thứ tự nhóm (ví dụ tầng → loại cấu kiện, hoặc vật liệu → loại cấu kiện).
- **US7. Thành tiền:** Là estimator, tôi muốn nhập đơn giá cho từng dòng và chọn đơn vị tính cho dòng đó (cái/m/m²/m³), để có ngay thành tiền và tổng cộng.
- **US8. Xuất Excel:** Là estimator, tôi muốn xuất BOQ ra file `.xlsx`, giữ nguyên cách nhóm, đơn giá, thành tiền và cột nguồn số liệu, để đưa vào quy trình dự toán đang dùng.
- **US9. Thử ngay:** Là khách tiềm năng xem demo, tôi muốn bấm "Dùng file mẫu" để thử luôn mà không cần có sẵn file IFC.

**Luồng chính:** mở trang → kéo thả file IFC (hoặc chọn file mẫu) → thanh tiến trình → model 3D cùng bảng BOQ → lọc, nhóm, nhập đơn giá → xuất Excel.

**Edge cases**

- File không có BaseQuantities nào: tính toàn bộ từ hình học và hiện cảnh báo chung.
- Cấu kiện không có vật liệu hoặc type: gom vào nhóm "(Không xác định)", không bỏ qua.
- IFC2x3 và IFC4 khác nhau về tên Qto và cách gán vật liệu (IfcMaterialLayerSetUsage, IfcMaterialConstituentSet).
- Đơn vị trong file là mm, cm hoặc feet: phải quy đổi theo IfcUnitAssignment sang hệ mét.
- Cấu kiện có lỗ mở (tường có cửa): thể tích tự tính phải trừ lỗ mở, nếu không trừ được thì phải ghi chú rõ.
- Cấu kiện ghép (IfcElementAssembly, tường nhiều lớp): không được đếm trùng giữa cấu kiện cha và cấu kiện con.
- File hỏng hoặc không phải IFC: báo lỗi dễ hiểu, không treo trang.
- File lớn: hiện tiến trình, giao diện không bị đứng (xử lý trong Web Worker).
- Đơn giá nhập vào không phải số hoặc là số âm: không cho nhập.

## Success Criteria

**How will we know when we're done?**

- **Chức năng:** US1–US9 chạy được trên Chrome và Edge bản mới nhất, chạy được với tối thiểu 3 file IFC mẫu công khai (kiến trúc, kết cấu, IFC2x3 và IFC4).
- **Độ chính xác**
  - Với file có Qto: khối lượng hiển thị khớp 100% với Qto trong file, sai lệch chỉ do làm tròn.
  - Với dòng tính từ hình học (tường, sàn, cột, dầm không có Qto): sai lệch ≤ 5% so với Qto hoặc Revit schedule của cùng model. Chạy kiểm chứng trên ít nhất 1 file có cả hai nguồn để so.
  - Số lượng (cái) theo loại cấu kiện khớp 100% với số entity IFC tương ứng.
- **Hiệu năng** (máy laptop tầm trung)
  - File 50MB: hiện model và BOQ trong ≤ 30 giây.
  - File 150MB: vẫn hoàn tất, không làm tab trình duyệt bị crash.
  - Click một dòng BOQ thì 3D sáng lên trong ≤ 200ms.
- **Excel:** file xuất ra mở được bằng Excel và Google Sheets. Tổng tiền trong Excel bằng tổng tiền trên web, và cột thành tiền dùng công thức Excel chứ không ghi số cứng.
- **Riêng tư:** không có request mạng nào gửi nội dung file IFC đi đâu (kiểm tra trong DevTools).
- **Thị trường** (đo trong 4 tuần sau khi ra mắt)
  - Gắn link demo vào ≥ 15 proposal hoặc tin nhắn chào hàng.
  - Có ≥ 3 phản hồi nhắc đến demo, hoặc ≥ 1 cuộc gọi hay đơn hàng có liên quan.
  - Nếu không đạt thì xem lại hướng #1 (kết nối Procore/ACC với MCP).

## Constraints & Assumptions

**What limitations do we need to work within?**

- **Kỹ thuật**
  - Chạy hoàn toàn phía client: React + TypeScript, Three.js, web-ifc (WASM), Web Worker. Host tĩnh, chi phí khoảng 0.
  - Giới hạn bộ nhớ của trình duyệt khiến file lớn hơn khoảng 200MB có thể không mở được. MVP chấp nhận giới hạn này và ghi rõ trên giao diện.
  - Hỗ trợ IFC2x3 và IFC4. IFC4.3 (hạ tầng) chỉ là best-effort.
- **Kinh doanh:** đây là demo, chưa có SLA. Ghi rõ trên trang "Số liệu mang tính tham khảo, cần estimator kiểm tra".
- **Thời gian:** khoảng 3–4 tuần, một người làm part-time.
- **Giả định**
  - A1: Estimator mục tiêu nhận được file IFC từ thiết kế, hoặc có thể xin được.
  - A2: Phần lớn file IFC xuất từ Revit/ArchiCAD có Qto cho các cấu kiện chính khi người xuất bật tùy chọn này. Nếu không có thì tính từ hình học là đủ cho dự toán sơ bộ.
  - A3: Nhóm theo loại cấu kiện → type → vật liệu phù hợp với cách estimator lập BOQ sơ bộ.
  - A4: Người xem demo chấp nhận dùng desktop. Mobile chỉ cần không vỡ giao diện, không cần tối ưu.
  - A5: Có đủ file IFC mẫu công khai, có license cho phép dùng làm demo, ví dụ buildingSMART sample files hoặc IfcOpenShell test files.

## Questions & Open Items

**What do we still need to clarify?**

- **Đã quyết (2026-10-07):** mục tiêu là portfolio và thử thị trường; người dùng là estimator/QS ở GC; xử lý trên trình duyệt; dùng Qto trước, thiếu thì tự tính; BOQ có đơn giá nhập tay; đặt trong repo riêng `ifc-takeoff`.
- **Đã quyết ở design (2026-10-24, chi tiết trong design doc D1–D8):** That Open v3 cho viewer; lượt web-ifc riêng trong worker để lấy khối lượng; tính từ hình học bằng mesh (thể tích tứ diện, diện tích theo mặt chính, chiều dài theo OBB); dùng ExcelJS; chỉ đếm cấu kiện lá; tách lớp vật liệu; đơn giá gắn theo loại + type + vật liệu; file mẫu `office_str.ifc`.
- **Cần nghiên cứu**
  - File mẫu: đã có `office_arc`, `office_str`, `office_hvac` (VTT, CC BY-SA 4.0, IFC4) trong `~/bim-samples`. Còn thiếu 1 file IFC2x3.
  - Đo nhanh hiệu năng của web-ifc với file 50MB và 150MB trước khi chốt mục tiêu hiệu năng.
- **Để sau MVP:** lưu và mở lại phiên làm việc trên trình duyệt (localStorage/IndexedDB), nhập file .rvt qua APS Model Derivative, so sánh khối lượng giữa hai phiên bản model.
