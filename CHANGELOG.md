# Changelog

## [0.3.0] — 2026-10-13

### Thêm mới
- **Tự lưu transcript** cho cả chiều về lẫn chiều đi, **bật sẵn**, mặc định định dạng `.txt`.
  - Mỗi phiên lưu thành 1 file riêng trong `Documents\LiveTranslate\`, đặt tên theo giờ bắt đầu, ví dụ `2026-10-13_14-30-05_chieu-ve.txt` và `…_chieu-di.txt`.
  - Trong lúc dịch, file được ghi lại liên tục (khoảng 1,5 giây một lần). Khi bấm Dừng hoặc thoát app (kể cả lúc cài bản cập nhật), app ghi ngay phần còn lại. Nếu app bị tắt đột ngột thì chỉ mất vài giây cuối.
  - Vào **Cài đặt → Tự lưu transcript** để bật/tắt, chọn định dạng (`.txt` / `.md` / `.srt`), đổi thư mục lưu hoặc mở thư mục.

### Thay đổi
- Cửa sổ điều khiển được chia thành **2 tab**:
  - **Dịch**: bật/tắt 2 chiều, đồng hồ đo, phụ đề, nút giữ-để-nói.
  - **⚙ Cài đặt**: API key, thiết bị âm thanh, ngưỡng VAD, chiều đi, tự lưu transcript, overlay, kiểm tra cập nhật.
- Cảnh báo ngắn hơn, chỉ còn 1 dòng, kèm nút **"Sửa →"** để chuyển sang tab Cài đặt.
- Thông báo có nút ✕ để đóng.
- Nút xuất `.txt` / `.srt` / `.md` được thu nhỏ, nằm ngay dưới khung phụ đề.
- Thanh cuộn mảnh, cùng tông tối với giao diện.
- Nút "Kiểm tra cập nhật" và số phiên bản chuyển vào **Cài đặt → Khác**.

## [0.2.3]
- Sửa CI: tạo GitHub Release trước rồi mới upload, để không bị tạo release trùng tag.
- Giao diện hiện thông báo khi kiểm tra cập nhật bị lỗi.

## [0.2.2]
- Tự cập nhật qua `electron-updater`, tải bản mới từ GitHub Releases.

## [0.2.1]
- Bản phát hành đầu tiên:
  - Dịch 2 chiều.
  - Phụ đề song ngữ và overlay.
  - Phát giọng dịch.
  - Chiều đi qua VB-Audio Virtual Cable.
  - CI/CD.
