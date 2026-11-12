# Changelog

## [0.5.5] — 2026-11-12

### Thêm mới
- **Nói thẳng vào meeting (chiều đi)**: muốn tự nói trực tiếp, không qua dịch, thì không còn phải vào Meet/Zoom đổi micro nữa.
  - Trên thẻ Chiều đi (tab Dịch) có nút **🎙 Nói thẳng (không dịch)**. Bấm để bật, bấm lần nữa để tắt. Phím tắt toàn cục **Ctrl+Alt+M** dùng được ngay khi đang ở cửa sổ meeting; menu khay hệ thống cũng có mục này.
  - Khi bật, giọng thật của bạn đi vào thiết bị **📤 Phát vào** (CABLE Input). Meet/Zoom cứ để nguyên micro = `CABLE Output` cho cả lúc dịch lẫn lúc nói thẳng.
  - **Không tốn tiền**: không gọi Gemini. Lời nói thẳng không được ghi vào transcript.
  - Đang bật chiều đi thì app **tự tạm dừng dịch** trong lúc nói thẳng, và dịch tiếp khi bạn tắt. Nếu bạn bấm Tiếp tục hoặc Bật chiều đi giữa chừng thì nói thẳng tự tắt. Meeting không bao giờ nghe cùng lúc giọng thật và giọng dịch.
  - App **từ chối bật** nếu “Phát vào” chưa chọn, không mở được, hoặc không phải mic ảo (micro phát thẳng ra loa thật sẽ gây hú), và nói rõ lý do. Đang nói thẳng mà đổi “Phát vào” sang loa thật thì app tắt ngay.
  - Rút micro giữa chừng thì nói thẳng tự tắt, nút trở về trạng thái tắt.
  - Gõ để nói và Phát lại vẫn dùng được trong lúc đang nói thẳng.

### Thay đổi
- Thiết bị **CABLE In 16ch** của VB-Audio Virtual Cable giờ cũng được nhận là mic ảo (có dấu ✓ trong danh sách “Phát vào”, không còn cảnh báo “không phải mic ảo”).

## [0.5.4] — 2026-11-12

### Thêm mới
- **Phát lại câu đã nói (chiều đi)**: mỗi câu trong danh sách của thẻ Chiều đi có nút **🔁 Phát lại**, dùng khi người nghe hỏi lại hoặc chưa nghe rõ.
  - **Không tốn thêm tiền** và ra tiếng ngay: app giữ sẵn giọng của 30 câu gần nhất (ở bản 0.5.3 chỉ giữ 1 câu).
  - Lần phát lại phải tạo giọng mới, tốn như lần đầu và chờ vài giây, trong ba trường hợp: đã tắt rồi mở lại app, đã đổi **🗣 Giọng đọc**, hoặc câu cũ hơn 30 câu gần nhất.
  - Câu bạn nói qua micro cũng phát lại được. Lần đầu phát lại câu đó có tốn tiền, vì trước đó chưa có giọng đọc cho nó.
  - Phát lại không ghi thêm dòng vào transcript. Đang phát một câu thì các nút Phát lại tạm khoá.
- **Xoá câu khỏi transcript chiều đi**: nút **✕ Xoá** cạnh nút Phát lại, dùng cho câu gõ nhầm hoặc câu thử.
  - Câu bị xoá biến mất khỏi danh sách, file tự lưu và lịch sử, nên tóm tắt và trợ lý cuộc họp không tính tới nó nữa.
  - Xoá ngay, **không hỏi lại** và không khôi phục được. Chi phí đã tốn cho câu đó giữ nguyên.
  - Xoá câu cuối cùng còn lại thì app bỏ luôn file transcript và mục lịch sử của phiên chiều đi đó. Nói hoặc gõ câu mới thì phiên được ghi lại như thường.
  - Câu đang nói dở chưa có nút Xoá; nút hiện khi câu đã chốt.

## [0.5.3] — 2026-11-12

### Thêm mới
- **Gõ để nói (chiều đi)**: không tiện nói thì gõ chữ, app dịch rồi đọc thành giọng vào meeting thay bạn.
  - Trên thẻ Chiều đi (tab Dịch) có nút chuyển **🎤 Nói / ⌨ Gõ**. App nhớ lựa chọn này cho lần mở sau.
  - Gõ câu tiếng Việt rồi bấm **Dịch** (hoặc Enter). Bản dịch hiện ở ô bên dưới và **nằm đó chờ bạn**: đọc lại, sửa tay nếu cần, chưa có gì phát ra cả.
  - Bấm **▶ Phát** (hoặc Ctrl+Enter) khi tới lượt mình nói. Giọng đi vào thiết bị **📤 Phát vào** (CABLE Input), người trong meeting nghe như bạn đang nói. Bấm **■ Dừng** để cắt giữa chừng.
  - Ngay sau khi dịch, app **chuẩn bị giọng sẵn** (mất khoảng bằng độ dài câu), nên bấm Phát là ra tiếng ngay. Phát lại cùng một câu không tốn thêm tiền. Nếu bạn sửa bản dịch thì lần Phát đó phải chờ vài giây để tạo giọng mới.
  - **Không cần bật chiều đi** (micro). Hai cách dùng song song được: đang bật micro vẫn gõ để nói được.
  - Bản dịch dùng văn nói lịch sự (tiếng Nhật: thể です/ます) và theo **Ngữ cảnh cuộc họp** của bạn.
  - Câu đã phát được ghi vào transcript chiều đi, nên tự lưu, lịch sử, tóm tắt và trợ lý cuộc họp đều biết bạn đã nói gì.
  - Chọn giọng ở **Cài đặt → Chiều đi → 🗣 Giọng đọc** (3 giọng nữ, 3 giọng nam).
  - Chi phí khoảng **$0,03 cho mỗi phút giọng** (một câu 6 giây khoảng $0,003), tính vào chi phí ngày/tháng và giới hạn tháng. Câu đã dịch nhưng không phát vẫn tốn phần tạo giọng này.
  - App **không phát** nếu chưa chọn thiết bị "Phát vào" hoặc không mở được thiết bị đó, và nói rõ lý do, thay vì lặng lẽ phát ra loa máy bạn.
  - Cách hoạt động: dịch bằng `gemini-flash-lite-latest`, tạo giọng bằng `gemini-3.8-flash-tts`.

### Sửa lỗi
- **Bật chiều đi (hoặc Bắt đầu dịch) thất bại chỉ hiện `[object Object]`.** Giờ app nói rõ nguyên nhân và việc cần làm, ví dụ "Không tìm thấy micro đã chọn. Cắm lại micro hoặc chọn micro khác ở Cài đặt → Chiều đi", hoặc Windows đang chặn quyền micro, hoặc micro đang bị app khác giữ.

## [0.5.2] — 2026-11-09

### Thêm mới
- **Chế độ "Chỉ chữ" cho chiều về**, dành cho những cuộc họp chỉ cần đọc phụ đề. Rẻ hơn khoảng **3,5 lần** so với dịch có giọng.
  - Chọn ở ô **🎚 Cách dịch** trên thẻ Chiều về (tab Dịch), trước khi bấm Bắt đầu: `🔊 Giọng + chữ` hoặc `📝 Chỉ chữ`. Trong lúc đang dịch thì ô này bị khoá; đổi chế độ có hiệu lực từ lần Bắt đầu sau.
  - Chi phí khoảng **$0,01 cho mỗi phút có người nói**, so với khoảng $0,037 của chế độ có giọng.
  - Câu gốc hiện dần trong lúc người khác đang nói. Bản dịch hiện **theo từng câu**, khoảng 1–2 giây sau khi người nói ngừng. Nếu người nói liền một mạch không ngừng thì khoảng 15 giây sẽ có một đoạn.
  - Khi dịch từng câu, app dùng **Ngữ cảnh cuộc họp** (Cài đặt → Ngữ cảnh & từ khoá), nên tên riêng và thuật ngữ được dịch theo đúng bảng của bạn.
  - Phụ đề, overlay, tự lưu, lịch sử, tóm tắt, trợ lý cuộc họp và thông báo từ khoá vẫn chạy như ở chế độ có giọng. Nếu bấm Dừng giữa câu, câu đó vẫn được dịch nốt, rồi app mới tự tóm tắt.
  - Câu nào dịch lỗi thì hiện `⚠ Không dịch được câu này` thay vì để trống. Nếu lỗi nhiều câu liên tiếp (sai key, hết quota), thẻ Chiều về hiện cảnh báo kèm nguyên nhân.
  - Cách hoạt động: model dịch Live luôn tạo ra (và tính tiền) giọng dịch, kể cả khi đã tắt "Phát giọng dịch". Vì vậy chế độ chỉ chữ dùng model chép lời `gemini-3.5-transcribe-live`, rồi dịch từng câu bằng `gemini-flash-lite-latest`.
- **Hỏi về một cuộc họp đã lưu**, ngay trong tab Lịch sử: mở một phiên, gõ câu hỏi vào ô **🤖 Hỏi về cuộc họp này**, ví dụ "Ai phụ trách việc test, hạn khi nào?".
  - AI đọc lại **toàn bộ** transcript của phiên đó, gồm cả lời bạn nói qua chiều đi trong cùng khoảng thời gian, và dùng bản tóm tắt (nếu có) để định hướng. Câu trả lời kèm giờ để đối chiếu, ví dụ "(lúc 15:53)". Thông tin không có trong transcript thì AI nói là không thấy chứ không đoán.
  - Có sẵn 4 **câu hỏi nhanh**, bấm một lần là hỏi: 📋 Việc tôi cần làm · ✅ Đã chốt gì · 📅 Các mốc thời gian · ❓ Còn bỏ ngỏ.
  - Hỏi nối tiếp được ("còn việc đó thì hạn là ngày nào?"). Các lượt hỏi đáp được giữ riêng cho từng phiên cho tới khi tắt app.
  - Ô hỏi hiện chi phí ước tính cho mỗi câu hỏi, vì mỗi lần hỏi đều gửi lại cả transcript. Một cuộc họp khoảng 30 phút tốn khoảng $0,03 mỗi câu. Chi phí này được tính vào chi phí ngày/tháng và giới hạn tháng.
  - Dùng model của mục tóm tắt (mặc định `gemini-flash-latest`).

### Thay đổi
- **Câu trả lời của trợ lý gọn và dễ đọc hơn**, cả ở Trợ lý cuộc họp (tab Dịch) lẫn khung hỏi về phiên đã lưu (tab Lịch sử).
  - Mỗi lượt hỏi đáp **thu gọn được**: câu mới nhất tự mở, các câu cũ tự thu lại còn một dòng (câu hỏi kèm dòng đầu câu trả lời). Bấm vào đầu mục để mở hoặc thu, có thêm nút **Thu gọn tất cả / Mở tất cả**. Hỏi nhiều câu, danh sách vẫn ngắn.
  - Gạch đầu dòng hiện thành danh sách. Giờ được nhắc tới trong câu trả lời, ví dụ "(lúc 16:08)", hiện thành nhãn nhỏ để dò lại transcript.
  - Có nút **📋 Copy câu trả lời**. Khung hỏi đáp có viền màu riêng, nút **Hỏi** nổi bật hơn để dễ nhận ra.

### Sửa lỗi
- **Chi phí ước tính của chế độ dịch có giọng thấp hơn thực tế khoảng 37%.** App tính $0,023/phút, nhưng Google tính $0,0368/phút: $0,0053 cho audio gửi lên và $0,0315 cho giọng dịch trả về. Mức mới đã được đối chiếu với số token Google báo về và áp dụng cho cả 2 chiều. Số liệu của các ngày trước vẫn giữ nguyên.

### Lưu ý
- Ở chế độ có giọng, tắt "Phát giọng dịch" chỉ làm im loa chứ **không** giảm tiền. Muốn giảm tiền thì chọn "Chỉ chữ".
- Chiều đi vẫn chỉ có chế độ có giọng, vì cần phát giọng dịch vào meeting.

## [0.5.1] — 2026-11-06

### Thêm mới
- **Đặt tên cuộc họp**, để nhiều cuộc họp không còn lẫn vào nhau trong Lịch sử.
  - Đang họp: ô **📌 Tên cuộc họp** ở tab Dịch. Đặt lúc nào trong buổi cũng được, kể cả ngay sau khi bấm Dừng. Tên được gắn cho cả lời chiều đi trong lúc họp.
  - Phiên cũ: mở phiên trong tab Lịch sử rồi sửa ô tên.
  - Tên hiện đậm ở đầu mỗi mục trong danh sách Lịch sử, trong thông báo "Đã tóm tắt", và tìm kiếm được.
  - Bắt đầu phiên mới thì ô tên được xoá cho cuộc họp mới.
- **AI tự đặt tên** cho phiên chưa có tên, ngay trong lượt tóm tắt, không tốn thêm lượt gọi. Tên này hiện chữ nghiêng và tự nhường chỗ khi bạn đặt tên riêng.
  - Bản tóm tắt (`…_tom-tat.md`) nay mở đầu bằng dòng tiêu đề `# <tên cuộc họp>`.
  - Phiên đã tóm tắt từ trước chưa có tên này: bấm **Tóm tắt lại** để có.

### Lưu ý
- Tên file transcript và tóm tắt vẫn đặt theo giờ bắt đầu, không đổi theo tên cuộc họp.

## [0.5.0] — 2026-11-06

### Thêm mới
- **Trợ lý cuộc họp** trên tab Dịch, dựa trên phần đã dịch của chiều về. Dùng được khi đang dịch, khi tạm dừng, và cả sau khi bấm Dừng (cho tới lần Bắt đầu sau). Không cần bật Tự lưu.
  - **Hỏi về cuộc họp:** gõ câu hỏi, ví dụ "Họ vừa chốt hạn ngày nào?". Câu trả lời ngắn, kèm giờ để đối chiếu, ví dụ "(lúc 14:32)". Chuyện không có trong transcript thì trợ lý nói là không thấy chứ không đoán.
  - Hỏi nối tiếp được ("còn phương án 2 thì sao?"): 3 lượt hỏi đáp gần nhất được gửi kèm.
  - **💬 Gợi ý trả lời:** đọc khoảng 3 phút gần nhất, nêu điều người khác vừa hỏi, rồi soạn 3 câu trả lời theo 3 hướng khác nhau. Mỗi câu có bản theo ngôn ngữ của bạn và bản theo ngôn ngữ của chiều đi (mặc định tiếng Nhật, thể です/ます), kèm nút Copy để dán vào chat meeting.
  - Lời bạn nói qua chiều đi cũng được tính vào ngữ cảnh. Ngữ cảnh / thuật ngữ trong Cài đặt cũng được dùng.
  - Dùng model của mục tóm tắt (mặc định `gemini-flash-latest`).
  - Bắt đầu phiên dịch mới thì khung trợ lý được xoá.

### Thay đổi
- **Chi phí tóm tắt và trợ lý nay được tính vào chi phí ngày/tháng và giới hạn tháng.** Trước đây chỉ tính phần dịch Live.
  - Ước tính theo số token mà Gemini báo về, ở giá chuẩn của Gemini Flash ($1,50 / 1 triệu token vào, $7,50 / 1 triệu token ra), nên có thể cao hơn thực tế khi Google đang giảm giá.
  - Khi đã chạm giới hạn tháng, trợ lý từ chối hỏi. Tóm tắt cuối phiên vẫn chạy.

## [0.4.3] — 2026-11-06

### Sửa lỗi
- **Lỗi kiểm tra cập nhật hiện gọn và đúng mức.**
  - Trước đây, nếu app kiểm tra đúng lúc GitHub đang đăng bản mới, màn hình hiện một khối lỗi 404 dài, kèm stack trace và HTTP header.
  - Nay app báo nhẹ "Bản mới đang được đăng lên GitHub… App sẽ tự thử lại sau ít phút" và tự kiểm tra lại sau 5 phút, tối đa 6 lần.
  - Mất mạng hoặc GitHub lỗi 5xx cũng được xử lý như vậy.
  - Các lỗi khác chỉ hiện dòng đầu. Chi tiết đầy đủ vẫn có trong log.
- **Quy trình release không còn để lộ release thiếu file.** Release được tạo ở dạng nháp, kiểm đủ installer, blockmap và `latest.yml` rồi mới công khai.

### Thay đổi
- Tab Cài đặt ghi thêm phím tắt `Ctrl+Alt+P` (tạm dừng / tiếp tục chiều về).

## [0.4.2] — 2026-11-06

### Thêm mới
- **Nút Tạm dừng / Tiếp tục cho chiều về.** Có trên tab Dịch, trong menu khay hệ thống, và phím tắt toàn cục `Ctrl+Alt+P`.
  - Khi tạm dừng, app không gửi audio lên Gemini. Phụ đề, file transcript, mục Lịch sử và chi phí luỹ kế đều được giữ nguyên.
  - Bấm Tiếp tục thì phần dịch mới được nối vào cùng transcript và cùng mục Lịch sử. Gemini cũng giữ ngữ cảnh của phần trước.
  - Đồng hồ phiên đứng yên trong lúc tạm dừng.
  - Tạm dừng không kích hoạt tóm tắt. App chỉ tóm tắt khi bấm Dừng.
  - Nếu đang nói dở lúc bấm tạm dừng, câu đó vẫn được dịch nốt. Sau 15 giây, kết nối được đóng lại và sẽ tự nối lại khi bấm Tiếp tục.
  - Tiếp tục cũng phải qua giới hạn chi phí tháng, giống như lúc bắt đầu.
- **Biết rõ lúc nào đang tạm dừng.**
  - Overlay phụ đề hiện nhãn "⏸ Đang tạm dừng dịch", nên vẫn thấy được khi Meet/Zoom đang full-screen.
  - Tạm dừng hoặc tiếp tục bằng `Ctrl+Alt+P` hay từ khay hệ thống sẽ hiện thông báo Windows.
- **Mốc tạm dừng trong transcript.**
  - Mỗi lần tạm dừng để lại một dòng "⏸ Tạm dừng 14:30 → 14:45 (15 phút)".
  - Dòng này có ở phụ đề, overlay, tab Lịch sử và các file .txt/.md/.srt.
  - Bản tóm tắt được báo rằng đoạn đó không có transcript, nên không đoán nội dung đoạn đó.
  - Nếu bấm Dừng khi đang tạm dừng thì không để lại mốc.
- **Tạm dừng cho chiều đi.** Panel "Chiều đi" có nút Tạm dừng / Tiếp tục.
  - Khi tạm dừng, phím `Ctrl+Space` được nhả ra cho app khác dùng.
- **Tóm tắt đến giờ.** Nút "📝 Tóm tắt đến giờ" trên tab Dịch tóm tắt phần đã dịch mà không cần dừng phiên, hữu ích khi vào họp muộn hoặc lúc nghỉ giữa giờ.
  - Khi bấm Dừng, bản tóm tắt cuối vẫn chạy và ghi đè bản tạm.
  - Nếu bản tạm chưa xong, bản cuối được xếp hàng chạy tiếp chứ không bị bỏ qua.
  - Cần bật "Tự lưu transcript".

### Thay đổi
- Số "câu" trong tab Lịch sử không đếm mốc tạm dừng.

### Sửa lỗi
- Nếu kết nối Gemini bị ngắt quá lâu (khoảng 2 giờ, ví dụ khi tạm dừng hoặc im lặng lâu), app mở phiên Gemini mới thay vì dùng lại mã nối phiên đã hết hạn.
- Bấm Dừng đúng lúc app đang kết nối lại không còn để sót kết nối mở, và trạng thái không còn nhảy về "Chờ tiếng nói" sau khi đã dừng.

## [0.4.1] — 2026-10-29

### Thêm mới
- **Chọn API version và model dịch trong Cài đặt** (mục "Gemini API").
  - API version: `v1beta` (mặc định) hoặc `v1alpha`. Áp dụng cho dịch Live (cả SDK lẫn kết nối dự phòng) và tóm tắt.
  - Model dịch Live đổi được (mặc định `gemini-3.5-live-translate-preview`), nhập có hay không có tiền tố `models/` đều được.
  - Nút **Tải** lấy danh sách model mà API key của bạn dùng được (chỉ các model dịch chạy được Live; model Live đa năng như `gemini-3.8-live` không hỗ trợ dịch nên không hiện), rồi chọn từ dropdown thay vì phải gõ tên.
  - Thay đổi có hiệu lực từ lần kết nối sau.

### Thay đổi
- Nâng `@google/genai` từ 2.8.0 lên 2.31.0.

## [0.4.0] — 2026-10-13

### Thêm mới
- **Tóm tắt cuộc họp.**
  - Khi dừng dịch, app tự tóm tắt bằng Gemini Flash (mặc định `gemini-flash-latest`).
  - Bản tóm tắt gồm 4 mục: Tóm tắt, Quyết định, Việc cần làm (dạng checklist), Câu hỏi còn mở.
  - Lời bạn nói qua chiều đi được trộn vào với nhãn "Tôi".
  - Kết quả lưu thành `…_tom-tat.md` cạnh file transcript.
  - Phiên quá ngắn sẽ được bỏ qua.
- **Tab Lịch sử.**
  - Danh sách các phiên đã lưu, kèm thời lượng và chi phí.
  - Tìm kiếm trong transcript và tóm tắt, không phân biệt dấu.
  - Xem lại transcript song ngữ, tóm tắt hoặc tóm tắt lại, mở file, xoá phiên.
- **Chi phí theo ngày và tháng, có giới hạn tháng.**
  - Chi phí được cộng dồn cho cả 2 chiều và giữ lại qua các lần mở app.
  - Tới 80% giới hạn: app báo trước.
  - Tới 100%: app tự dừng cả 2 chiều và chặn bắt đầu lại.
- **Ngữ cảnh và thuật ngữ cuộc họp.**
  - App gửi kèm phiên dịch dưới dạng `systemInstruction`.
  - Nếu model không nhận, app tự kết nối lại không có ngữ cảnh và hiện cảnh báo.
  - Bản tóm tắt luôn dùng ngữ cảnh.
- **Từ khoá cần chú ý.**
  - Câu có tên bạn hoặc từ khoá được tô vàng trên phụ đề và overlay.
  - App hiện thông báo Windows khi bạn đang ở cửa sổ khác.
  - Không phân biệt hoa thường, có dấu hay không dấu.
- **Khay hệ thống.**
  - Đóng cửa sổ thì app thu nhỏ xuống khay và vẫn dịch tiếp.
  - Menu ở khay: bật/tắt 2 chiều, ẩn/hiện overlay, thoát.
- **Phím tắt toàn cục `Ctrl+Alt+T`** để bắt đầu/dừng dịch chiều về.
- **Chọn ngôn ngữ đích cho chiều về:** Việt, Anh, Nhật, Hàn, Trung, Thái, Indonesia, Pháp, Đức, Tây Ban Nha.
- Chiều đi cũng có thêm các ngôn ngữ đích mới.

### Thay đổi
- Cửa sổ có 3 tab: **Dịch / Lịch sử / Cài đặt**.
- Tab Cài đặt có thêm các mục "Ngữ cảnh & từ khoá", "Tự lưu & tóm tắt", "Chi phí".
- Lịch sử chỉ được ghi khi bật Tự lưu.

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
