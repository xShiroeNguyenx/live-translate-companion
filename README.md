# Live Translate Companion

> Desktop app (Windows 11) dịch trực tiếp audio cuộc họp Google Meet / Zoom sang tiếng Việt theo thời gian thực bằng **Gemini 3.5 Live Translate** (`gemini-3.5-live-translate-preview`) — có **phụ đề song ngữ**, **phát giọng dịch**, và **chiều đi** (nói tiếng Việt → giọng Nhật/Anh… phát vào meeting).

![CI](https://github.com/xShiroeNguyenx/live-translate-companion/actions/workflows/ci.yml/badge.svg)

Chạy song song với mọi app họp bằng cách bắt **audio hệ thống** (WASAPI loopback) — không cần bot/plugin tham gia meeting. Kiến trúc chi tiết: [PLAN.md](PLAN.md).

---

## Tính năng

**Chiều về — nghe meeting → tiếng Việt**
- **Ngôn ngữ nguồn tự nhận diện** (Nhật/Anh/70+ ngôn ngữ) — chỉ cấu hình ngôn ngữ đích.
- **Phụ đề song ngữ** trực tiếp trong cửa sổ điều khiển + **overlay** luôn-nổi, trong suốt, click-through (`Ctrl+Shift+O`); tự ngắt theo câu, cuộn xem lại được.
- **Phát giọng dịch** tiếng Việt qua thiết bị tự chọn (`setSinkId`).
- Xuất transcript `.txt` / `.srt` / `.md`.
- VAD gate (chỉ stream khi có tiếng nói → ~$0.023/phút audio gửi) + đồng hồ chi phí.
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

Mở app → dán **Gemini API key** → **Lưu** → **Bắt đầu dịch**. Overlay phụ đề nổi ở cạnh dưới màn hình (kéo để di chuyển, `Ctrl+Shift+O` bật/tắt click-xuyên).

> **Tự cập nhật:** từ **0.2.2** trở đi app tự kiểm tra & tải bản mới từ GitHub Releases (electron-updater) rồi hiện banner *"Cài & khởi động lại"*. Bản cũ hơn 0.2.2 phải tải tay một lần cuối lên 0.2.2. Cũng có nút **"Kiểm tra cập nhật"** ở chân cửa sổ.

---

## Hướng dẫn dùng nhanh

### 1. Chiều về cơ bản (nghe loa)
Bắt đầu dịch là có phụ đề. Muốn nghe giọng Việt thì bật **"Phát audio dịch"** và chọn thiết bị **không có dấu ⚠** (tránh thu ngược).

### 2. Nghe cả meeting + giọng dịch qua tai nghe, im lặng tuyệt đối với người xung quanh
Cần VB-Cable. Card **Âm thanh**:
- 🎧 **Nghe meeting** → `CABLE Input (VB-Audio Virtual Cable)`
- 🔊 **Giọng dịch** → tai nghe của bạn
- Bật **"Phát audio dịch"** + **"Nghe cả meeting qua thiết bị giọng dịch"**

→ Meeting đi vào cable im lặng; app thu cable để dịch và phát lại CẢ meeting lẫn giọng Việt vào tai nghe.

### 3. Chiều đi — nói vào meeting (panel "Nói vào meeting")
Cần VB-Cable. Trong **Meet/Zoom** chọn **Microphone = `CABLE Output (VB-Audio Virtual Cable)`**. Trong app:
- 🎙 **Micro** → micro thật · 📤 **Phát vào** → `CABLE Input` (✓ mic ảo)
- Chọn ngôn ngữ đích + chế độ PTT → **Bật chiều đi** → giữ nút **🎤 Giữ để nói** (hoặc `Ctrl+Space`).

> Khuyến nghị đeo tai nghe khi bật chiều đi để mic không hút tiếng từ loa (tránh dịch nhầm tiếng meeting bơm ngược).

---

## Build từ source

```powershell
npm install
npm run dev          # chạy dev (HMR)
npm run typecheck    # kiểm tra TypeScript (strict)
npm test             # unit tests (VAD gate, subtitle store, WAV, state machine, PTT)
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
# 1. Sửa "version" trong package.json (vd 0.2.2) — tag PHẢI khớp version
# 2. Commit + tag + push
git add -A
git commit -m "release: v0.2.2"
git tag v0.2.2
git push origin main
git push origin v0.2.2
```

Vài phút sau, installer xuất hiện ở trang Releases.

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
│  └─ subtitles/     #   store.ts — ghép cặp transcript, export txt/srt/md
├─ preload/          # 3 preload tối thiểu (control / overlay / engine)
├─ renderer/
│  ├─ control/       # cửa sổ điều khiển + panel "Nói vào meeting" (React)
│  ├─ overlay/       # phụ đề luôn-nổi trong suốt
│  └─ engine/        # cửa sổ ẩn: loopback + mic capture (AudioWorklet) + phát 24kHz / CABLE
└─ shared/           # types + IPC contract + constants
```

## License

[MIT](LICENSE) © 2026 NguyenKhanh
