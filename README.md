# Live Translate Companion

> Desktop app (Windows 11) dịch trực tiếp audio cuộc họp Google Meet / Zoom sang tiếng Việt theo thời gian thực bằng **Gemini 3.5 Live Translate** (`gemini-3.5-live-translate-preview`) — có **phụ đề song ngữ**, **phát giọng dịch**, và **chiều đi** (nói tiếng Việt → giọng Nhật/Anh… phát vào meeting).

![CI](https://github.com/xShiroeNguyenx/live-translate-companion/actions/workflows/ci.yml/badge.svg)

Chạy song song với mọi app họp bằng cách bắt **audio hệ thống** (WASAPI loopback) — không cần bot/plugin tham gia meeting. Kiến trúc chi tiết: [PLAN.md](PLAN.md).

---

## Tính năng

**Chiều về — nghe meeting → tiếng Việt** *(hoặc Anh/Nhật/Hàn/Trung… — chọn trong Cài đặt)*
- **Ngôn ngữ nguồn tự nhận diện** (Nhật/Anh/70+ ngôn ngữ) — chỉ cấu hình ngôn ngữ đích.
- **Phụ đề song ngữ** trực tiếp trong cửa sổ điều khiển + **overlay** luôn-nổi, trong suốt, click-through (`Ctrl+Shift+O`); tự ngắt theo câu, cuộn xem lại được.
- **Phát giọng dịch** tiếng Việt qua thiết bị tự chọn (`setSinkId`).
- **Tự lưu transcript** mỗi phiên (cả 2 chiều) ra `Documents/LiveTranslate` — mặc định `.txt`, ghi liên tục nên không mất nội dung khi app tắt đột ngột.
- **Tóm tắt cuộc họp** tự động khi dừng dịch: tóm tắt, quyết định, việc cần làm, câu hỏi còn mở → `…_tom-tat.md`.
- **Lịch sử phiên** ngay trong app: xem lại song ngữ, tìm kiếm không dấu, tóm tắt lại, mở/xoá file.
- **Ngữ cảnh & thuật ngữ cuộc họp** giúp dịch đúng tên riêng; **tô sáng + thông báo** khi có người nhắc tên bạn / từ khoá.
- Xuất transcript thủ công `.txt` / `.srt` / `.md`.
- VAD gate (chỉ stream khi có tiếng nói → ~$0.023/phút audio gửi) + đồng hồ chi phí theo phiên / ngày / tháng, **giới hạn chi phí tháng** tự dừng khi chạm trần.
- Thu nhỏ xuống **khay hệ thống**, phím tắt toàn cục `Ctrl+Alt+T` bật/tắt dịch.
- Tự reconnect kèm `sessionResumption` khi server `GoAway` — không mất lịch sử phụ đề.

**Chiều đi — nói tiếng Việt → giọng đích vào meeting** *(cần VB-Audio Virtual Cable)*
- Nói tiếng Việt → dịch thành giọng **Nhật/Anh/Hàn/Trung** rồi phát vào meeting như mic của bạn.
- Chế độ **Giữ để nói (PTT)** hoặc **tự động (VAD)**; phím tắt toàn cục `Ctrl+Space`.

**Chống vọng & định tuyến âm thanh**
- Đổi thiết bị "Nghe meeting" (mặc định Windows) ngay trong app.
- Cảnh báo thiết bị bị thu ngược + half-duplex guard chống vòng lặp tự dịch chính mình.
- Chế độ **im lặng tuyệt đối** qua virtual cable: meeting không phát ra ngoài, tai nghe nhận cả meeting lẫn giọng dịch.

---

## Yêu cầu

- **Windows 11** (app dùng WASAPI loopback + Core Audio `IPolicyConfig`, chỉ chạy Windows).
- **Gemini API key** — miễn phí ở [Google AI Studio](https://aistudio.google.com/apikey). Key được mã hoá bằng `safeStorage`, lưu cục bộ, chỉ gửi tới Google.
- **(Tuỳ chọn)** [VB-Audio Virtual Cable](https://vb-audio.com/Cable/) — driver mic ảo miễn phí, cần cho chiều đi và chế độ im lặng tuyệt đối (cài 1 lần, restart máy).

---

## Cài đặt

Tải installer ở trang [**Releases**](https://github.com/xShiroeNguyenx/live-translate-companion/releases): `LiveTranslateCompanion-Setup-<version>.exe`.

> App chưa ký số (self-signed) nên Windows SmartScreen có thể cảnh báo → **More info → Run anyway**.

Mở app → tab **⚙ Cài đặt** → dán **Gemini API key** → **Lưu** → quay lại tab **Dịch** → **Bắt đầu dịch**. Overlay phụ đề nổi ở cạnh dưới màn hình (kéo để di chuyển, `Ctrl+Shift+O` bật/tắt click-xuyên).

Cửa sổ chia 3 tab:
- **Dịch** — chỉ những gì cần trong lúc họp: chi phí hôm nay/tháng, bật/tắt 2 chiều, đồng hồ đo, phụ đề, nút giữ-để-nói. Cảnh báo hiển thị ngắn gọn kèm nút **"Sửa →"** nhảy sang Cài đặt.
- **Lịch sử** — các phiên đã lưu, tìm kiếm, xem tóm tắt.
- **⚙ Cài đặt** — API key, ngôn ngữ, thiết bị âm thanh, ngưỡng VAD, chiều đi, ngữ cảnh & từ khoá, tự lưu & tóm tắt, giới hạn chi phí, overlay, khay hệ thống, kiểm tra cập nhật.

Đóng cửa sổ thì app **thu nhỏ xuống khay hệ thống** và vẫn dịch tiếp. Chuột phải icon ở khay để bật/tắt 2 chiều, ẩn/hiện overlay hoặc **Thoát**. Muốn đóng là thoát hẳn thì tắt tuỳ chọn ở **Cài đặt → Khác**.

> **Tự cập nhật:** từ **0.2.2** trở đi app tự kiểm tra & tải bản mới từ GitHub Releases (electron-updater) rồi hiện banner *"Cài & khởi động lại"*. Bản cũ hơn 0.2.2 phải tải tay một lần cuối lên 0.2.2. Cũng có nút **"Kiểm tra cập nhật"** ở mục **Cài đặt → Khác**.

---

## Hướng dẫn dùng nhanh

### 1. Chiều về cơ bản (nghe loa)
Bắt đầu dịch là có phụ đề. Muốn nghe giọng Việt thì vào **Cài đặt → Chiều về**, bật **"Phát giọng dịch"** và chọn thiết bị **không có dấu ⚠** (tránh thu ngược).

### 2. Nghe cả meeting + giọng dịch qua tai nghe, im lặng tuyệt đối với người xung quanh
Cần VB-Cable. **Cài đặt → Chiều về**:
- 🎧 **Nghe meeting** → `CABLE Input (VB-Audio Virtual Cable)`
- 🔊 **Giọng dịch** → tai nghe của bạn
- Bật **"Phát giọng dịch"** + **"Nghe cả meeting qua thiết bị giọng dịch"**

→ Meeting đi vào cable im lặng; app thu cable để dịch và phát lại CẢ meeting lẫn giọng Việt vào tai nghe.

### 3. Chiều đi — nói vào meeting
Cần VB-Cable. Trong **Meet/Zoom** chọn **Microphone = `CABLE Output (VB-Audio Virtual Cable)`**. Trong app, **Cài đặt → Chiều đi**:
- 🎙 **Micro** → micro thật · 📤 **Phát vào** → `CABLE Input` (✓ mic ảo)
- Chọn ngôn ngữ đích + chế độ PTT

Quay lại tab **Dịch** → **Bật chiều đi** → giữ nút **🎤 Giữ để nói** (hoặc `Ctrl+Space`).

> Khuyến nghị đeo tai nghe khi bật chiều đi để mic không hút tiếng từ loa (tránh dịch nhầm tiếng meeting bơm ngược).

### 4. Tự lưu transcript
Bật sẵn mặc định. Mỗi lần **Bắt đầu dịch** / **Bật chiều đi** tạo 1 file mới đặt tên theo giờ bắt đầu:

```
Documents\LiveTranslate\2026-10-13_14-30-05_chieu-ve.txt
Documents\LiveTranslate\2026-10-13_14-31-12_chieu-di.txt
```

File được ghi lại liên tục (~1,5 giây/lần, ghi file tạm rồi đổi tên nên không bao giờ hỏng) và chốt ngay khi Dừng / thoát app. Đổi định dạng (`.txt` / `.md` / `.srt`), thư mục lưu, hoặc mở thư mục ở **Cài đặt → Tự lưu & tóm tắt**. Đổi định dạng giữa phiên chỉ áp dụng từ phiên sau.

### 5. Tóm tắt cuộc họp & lịch sử
Khi bấm **Dừng** (chiều về), app gửi transcript cho Gemini (`gemini-flash-latest`, đổi được trong Cài đặt) và lưu `…_chieu-ve_tom-tat.md` cạnh file transcript. Lời bạn nói qua chiều đi trong cùng khoảng thời gian được trộn vào với nhãn **"Tôi"**. Bản tóm tắt gồm các mục:
- **Tóm tắt**
- **Quyết định**
- **Việc cần làm** (dạng checklist: ai, việc gì, hạn)
- **Câu hỏi còn mở**

Phiên quá ngắn (dưới ~200 ký tự bản dịch) sẽ được bỏ qua. Tab **Lịch sử** liệt kê mọi phiên đã lưu: bấm vào để xem tóm tắt và transcript song ngữ, nút **Tóm tắt / Tóm tắt lại**, mở file hoặc xoá. Ô tìm kiếm tìm trong cả transcript lẫn tóm tắt, không phân biệt dấu.

> Lịch sử được lưu ở `%APPDATA%\live-translate-companion\history` và chỉ ghi khi bật **Tự lưu**. Xoá một phiên sẽ xoá luôn file transcript và file tóm tắt của phiên đó.

### 6. Ngữ cảnh, thuật ngữ & từ khoá
**Cài đặt → Ngữ cảnh & từ khoá**:
- **Ngữ cảnh cuộc họp / thuật ngữ**: ví dụ `Họp dự án Webike với team Nhật. 見積 → báo giá`. App gửi kèm phiên dịch dưới dạng `systemInstruction`. Nếu model Live không nhận, app tự kết nối lại không có ngữ cảnh và hiện cảnh báo; bản tóm tắt thì luôn dùng ngữ cảnh.
- **Từ khoá cần chú ý**: ví dụ `Khánh, Khanh, カーン, deadline`. Câu có từ khoá được tô vàng trên phụ đề/overlay, và app hiện thông báo Windows nếu bạn đang ở cửa sổ khác. Không phân biệt hoa thường hay có dấu.

### 7. Chi phí & giới hạn
Tab **Dịch** hiện chi phí ước tính **hôm nay / tháng này** (cộng cả 2 chiều, lưu qua các lần mở app). Đặt **Giới hạn/tháng** ở **Cài đặt → Chi phí**:
- Tới 80%: app báo trước.
- Tới 100%: app tự dừng cả 2 chiều và không cho bắt đầu lại trong tháng (tăng giới hạn để tiếp tục).

Chi phí tóm tắt (rất nhỏ) chưa được tính vào số này.

### Phím tắt toàn cục
| Phím | Tác dụng |
|---|---|
| `Ctrl+Alt+T` | Bắt đầu / dừng dịch chiều về |
| `Ctrl+Space` | Bật/tắt nói (chiều đi, chế độ PTT) |
| `Ctrl+Shift+O` | Khoá / mở khoá click overlay |

---

## Build từ source

```powershell
npm install
npm run dev          # chạy dev (HMR)
npm run typecheck    # kiểm tra TypeScript (strict)
npm test             # unit tests (VAD, subtitle store, autosave, lịch sử, tóm tắt, chi phí, từ khoá, state machine, PTT)
npm run build        # build production vào out/
npm run dist         # đóng gói installer NSIS vào release/
npm run echo-test -- <file.wav> [vi]   # test Gemini không cần UI (cần GEMINI_API_KEY)
npx electron scripts/render-icon.mjs   # render lại icon sau khi sửa resources/icon.svg
```

Node ≥ 22 khuyến nghị (build tooling yêu cầu). Stack: Electron + electron-vite + React + TypeScript + zustand.

---

## Phát hành (CI/CD)

GitHub Actions ([.github/workflows](.github/workflows)):

- **CI** (`ci.yml`) — mỗi push lên `main` / mở PR: typecheck + test + build trên `windows-latest`.
- **Release** (`release.yml`) — khi push tag `v*.*.*`: typecheck + test + build + `electron-builder --publish always` → tự tạo GitHub Release và upload installer. Không cần thêm secret (dùng `GITHUB_TOKEN` sẵn có).

**Ra bản mới (copy-paste, chạy local):**

```powershell
# 1. Nâng version (sửa package.json + package-lock.json, không tự commit/tag)
npm version 0.4.0 --no-git-tag-version
# 2. Ghi thay đổi vào CHANGELOG.md
# 3. Commit + tag + push — tag PHẢI khớp version
git add -A
git commit -m "release: v0.4.0"
git tag v0.4.0
git push origin main
git push origin v0.4.0
```

Vài phút sau, installer xuất hiện ở trang Releases. Lịch sử thay đổi: [CHANGELOG.md](CHANGELOG.md).

---

## Sự cố thường gặp

- **App thoát ngay với lỗi `Cannot read properties of undefined (reading 'requestSingleInstanceLock')`**: terminal có biến `ELECTRON_RUN_AS_NODE=1` (hay gặp khi spawn từ extension host VSCode) khiến Electron chạy như Node thuần. Xoá rồi chạy lại: `Remove-Item Env:\ELECTRON_RUN_AS_NODE`.
- **Phụ đề dịch nội dung lạ**: loopback thu *mọi* âm thanh hệ thống (notification, nhạc) — tắt app khác khi họp, hoặc tăng ngưỡng VAD.
- **Chọn thiết bị giọng dịch nhưng vẫn bị vọng**: chọn lại thiết bị một lần để app lưu đúng id mới (sau khi nâng cấp từ bản cũ).

---

## Cấu trúc

```
src/
├─ main/             # Electron main: session manager, Gemini client, VAD, settings
│  ├─ audio/         #   windows-default-device.ts — đổi thiết bị mặc định qua IPolicyConfig
│  ├─ gemini/        #   client.ts (SDK) + raw-ws-client.ts (fallback) + session-manager.ts
│  ├─ subtitles/     #   store.ts — ghép cặp transcript, export txt/srt/md · autosave.ts — tự lưu mỗi phiên
│  ├─ history/       #   history-store.ts — lịch sử phiên (JSON trong userData)
│  ├─ summary/       #   summarizer.ts (prompt + Gemini Flash) · summary-service.ts
│  ├─ usage/         #   usage-tracker.ts — chi phí theo ngày/tháng
│  ├─ tray.ts · keyword-notifier.ts
├─ preload/          # 3 preload tối thiểu (control / overlay / engine)
├─ renderer/
│  ├─ control/       # cửa sổ điều khiển 3 tab Dịch / Lịch sử / Cài đặt (React) + widgets dùng chung
│  ├─ overlay/       # phụ đề luôn-nổi trong suốt
│  └─ engine/        # cửa sổ ẩn: loopback + mic capture (AudioWorklet) + phát 24kHz / CABLE
└─ shared/           # types + IPC contract + constants + languages + keywords
```

## License

[MIT](LICENSE) © 2026 NguyenKhanh
