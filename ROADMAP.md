# Lộ trình

Tài liệu này cho biết Live Translate Companion sẽ đi tiếp theo hướng nào, từ bản hiện tại (**0.5.6**) tới **1.0**.
Thứ tự có thể đổi theo phản hồi của người dùng. Bạn có ý tưởng hoặc gặp lỗi thì mở
[issue trên GitHub](https://github.com/xShiroeNguyenx/live-translate-companion/issues).

Thay đổi đã phát hành xem ở [CHANGELOG.md](CHANGELOG.md), kiến trúc ở [PLAN.md](PLAN.md).

## Mục tiêu của bản 1.0

Một người chưa từng dùng app có thể:
- tải về và **tự thiết lập xong trong khoảng 5 phút**, không cần ai hướng dẫn;
- họp liên tục **1 giờ** mà không mất phụ đề hay transcript;
- đọc phụ đề **đúng tên người, tên sản phẩm và thuật ngữ** của cuộc họp;
- **trả lời được ngay** khi bị hỏi, không phải rời cửa sổ Meet/Zoom.

## Nguyên tắc ưu tiên

1. **Chạy ổn trong cuộc họp thật** quan trọng hơn tính năng mới.
2. **Đang họp thì không phải rời Meet/Zoom**: việc gì cần làm giữa buổi họp phải làm được bằng phím tắt hoặc overlay.
3. **Minh bạch về chi phí và dữ liệu**: người dùng luôn biết mình tốn bao nhiêu và audio đi đâu.
4. **Giữ app gọn**: chỉ Windows, không dùng native module, cài là chạy.

Công sức ước lượng: **S** = nhỏ (vài giờ), **M** = vừa (1–2 ngày), **L** = lớn (nhiều ngày).

---

## 0.5.x — Kiểm chứng thực tế và chẩn đoán

Trước khi thêm tính năng, cần chắc những gì đã có chạy đúng trong cuộc họp thật, và khi có lỗi thì truy được nguyên nhân.

- **Kiểm chứng tồn đọng** (làm bằng tay, với API key và cuộc họp thật):
  - dịch liên tục 60 phút, qua nhiều lần tự kết nối lại;
  - chiều đi trong một cuộc họp 2 tài khoản: bên kia chỉ nghe giọng đã dịch;
  - model dịch Live có nhận phần "Ngữ cảnh cuộc họp" không;
  - Trợ lý cuộc họp với Gemini thật: tốc độ trả lời, gợi ý trả lời đọc được;
  - các cảnh báo định tuyến âm thanh có đúng và dễ hiểu không;
  - chế độ **Chỉ chữ** trong cuộc họp tiếng Nhật thật, chạy quá 10 phút (phiên chép lời tự xoay);
  - **Gõ để nói** trong một cuộc họp 2 tài khoản: bên kia nghe rõ giọng đọc, không bị cắt đầu/cuối câu.
  - **Nói thẳng** trong một cuộc họp 2 tài khoản: bên kia nghe rõ giọng thật, không vọng, và không nghe lẫn giọng dịch.
- ✅ **Chế độ "Chỉ chữ"** cho chiều về (0.5.2): chép lời + dịch từng câu, rẻ hơn khoảng 3,5 lần khi không cần nghe giọng dịch.
- ✅ **Hỏi đáp trên một phiên đã lưu** trong tab Lịch sử (0.5.2), làm sớm hơn dự kiến theo yêu cầu.
- ✅ **Gõ để nói** cho chiều đi (0.5.3): gõ tiếng Việt, app dịch rồi đọc thành giọng vào meeting khi bạn bấm Phát. Từ 0.5.4 phát lại và xoá được từng câu.
- ✅ **Nói thẳng** (0.5.5): một nút hoặc `Ctrl+Alt+M` đưa giọng thật vào meeting, không phải đổi micro trong Meet/Zoom mỗi lần muốn nói trực tiếp.
- ✅ **Ghi log ra file** (0.5.6), kèm nút "Mở thư mục log" trong Cài đặt → Khác.
- ✅ **Nút "Copy thông tin chẩn đoán"** (0.5.6): phiên bản, model, thiết bị đã chọn, trạng thái âm thanh và đoạn log cuối, để dán vào issue khi báo lỗi. Không bao giờ chứa API key.

## 0.6 — Thiết lập âm thanh dễ hơn

Chọn thiết bị, cài VB-Audio Virtual Cable và hiểu các cảnh báo là phần khó nhất với người mới.

- **Hướng dẫn lần đầu mở app** **(M)**, theo từng bước:
  1. nhập API key, có link lấy key và kiểm tra key dùng được;
  2. chọn cách nghe: qua loa, hoặc chỉ qua tai nghe (im lặng với người xung quanh);
  3. thử 10 giây và thấy phụ đề hiện ra;
  4. thiết lập chiều đi (tuỳ chọn).
- **Nút "Kiểm tra thiết lập"**, chạy lại được bất cứ lúc nào **(M)**:
  - liệt kê từng mục kèm ✓ hoặc ⚠;
  - mỗi mục ⚠ có cách sửa và nút mở đúng chỗ cần sửa;
  - app không tự sửa thay người dùng.
- **Cảnh báo âm thanh dễ hiểu hơn**: mỗi cảnh báo nói rõ nguyên nhân và một việc cụ thể cần làm. **(S)**
- **Phát hiện chưa cài VB-Audio Virtual Cable** và hướng dẫn 3 bước ngay trong app. **(S)**

## 0.7 — Không phải rời cuộc họp

Khi Meet/Zoom đang toàn màn hình, mọi thao tác giữa buổi phải làm được ngay tại chỗ.

- **Gợi ý trả lời trên overlay**: bấm `Ctrl+Alt+R` (hoặc chọn từ menu khay), 3 câu trả lời hiện ngay dưới phụ đề. **(M)**
- **Hỏi nhanh từ overlay**: phím tắt mở một ô hỏi nhỏ, câu trả lời hiện trên overlay. **(M)**
- **Tuỳ chỉnh overlay tại chỗ**: chế độ chỉ hiện bản dịch, chỉnh cỡ chữ và độ mờ ngay trên overlay. **(S)**
- **Đánh dấu khoảnh khắc quan trọng** bằng `Ctrl+Alt+B`: để lại mốc ⭐ trong transcript, và bản tóm tắt ưu tiên những đoạn được đánh dấu. **(S–M)**

## 0.8 — Dịch đúng tên và thuật ngữ

- **Bảng sửa thuật ngữ**: ví dụ "Tanaka-san → anh Tanaka", hoặc tên sản phẩm hay bị dịch sai. **(M)**
  - Áp dụng cho phụ đề, overlay, file transcript, tóm tắt và trợ lý.
  - Sửa bảng thì áp lại được cho cả phần đã dịch.
- **Hồ sơ cuộc họp**: lưu sẵn từng bộ ngữ cảnh, từ khoá, thuật ngữ và ngôn ngữ 2 chiều, đặt tên như "Họp khách hàng Nhật" hay "Daily nội bộ". **(M)**
  - Chọn nhanh một hồ sơ trước khi bắt đầu.
  - Lịch sử ghi lại phiên nào đã dùng hồ sơ nào.

## 0.9 — Sẵn sàng phát hành rộng

- **Giao diện tiếng Anh** (song song với tiếng Việt). **(L)**
- **Ký số bộ cài** để Windows SmartScreen bớt cảnh báo khi tải về. **(M)**
- **Quyền riêng tư** **(S)**:
  - nói rõ audio cuộc họp được gửi lên Google Gemini để dịch;
  - nói rõ transcript và lịch sử được lưu ở đâu trên máy;
  - nhắc người dùng báo cho người tham gia họp biết.
  - Trang giới thiệu và README cập nhật theo.
- **Trang "Sự cố thường gặp"** đầy đủ hơn, mở được từ nút "Kiểm tra thiết lập". **(S)**

## 1.0 — Điều kiện phát hành

- Mọi mục kiểm chứng ở 0.5.x đã qua.
- Cài trên một máy Windows sạch và thiết lập được chỉ nhờ hướng dẫn trong app.
- Dịch liên tục 60 phút không mất transcript.
- Bộ cài đã được ký số.
- Có giao diện tiếng Anh.

---

## Sau 1.0 (đang cân nhắc, chưa hứa)

- **Sau cuộc họp:**
  - xuất tóm tắt dạng email hoặc tin nhắn, có cả bản tiếng Nhật để gửi lại đối tác;
  - gom "Việc cần làm" từ nhiều cuộc họp vào một danh sách.
- **Nhắc khi có cuộc họp**: thấy Zoom, Teams hoặc Google Meet đang mở thì hỏi "Bắt đầu dịch?".
- **Nhãn người nói**: API dịch Live hiện chưa cho biết ai đang nói.
- **Chỉ thu âm của app họp**, không thu âm thanh khác của máy. Việc này cần native module.
- **macOS**: cách thu âm thanh hệ thống khác hẳn Windows.

## Nợ kỹ thuật (làm song song)

- Tách `src/main/index.ts` (khoảng 570 dòng) thành các module nhỏ.
- Tách bớt `src/renderer/control/App.tsx`.
- Thêm test cho giao diện.
- Thêm test chạy thử app Electron trong CI. Đây là điều kiện cho bản 1.0.
