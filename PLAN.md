# PLAN — Live Translate Companion

> Desktop app (Windows) dịch trực tiếp audio các cuộc họp Google Meet / Zoom sang tiếng Việt bằng API **Gemini 3.5 Live Translate** của Google.

## 0. Trạng thái triển khai (cập nhật 11/06/2026)

**Toàn bộ M1–M7 đã code xong.** Typecheck (TS strict) sạch, **38/38 unit tests** pass (VAD gate, subtitle store, WAV, state machine SessionManager, + push-to-talk & 2-instance độc lập), build production OK, app boot ổn định, installer NSIS đóng gói bằng `npm run dist`. **M7 (chiều đi: nói tiếng Việt → giọng đích vào meeting) đã CODE XONG 12/06/2026 — chờ kiểm chứng thủ công với VB-Cable + Meet 2 tài khoản.**

**CI/CD (đã thiết lập):** GitHub Actions `ci.yml` (push main/PR → typecheck+test+build trên windows-latest) và `release.yml` (push tag `v*.*.*` → build + `electron-builder --publish always` tự tạo GitHub Release). `publish:` provider github cấu hình trong `electron-builder.yml`. Bản hiện tại **0.2.1** (đã thêm chống vọng, đổi thiết bị mặc định Windows, monitor, M7, fix auto-scroll khung phụ đề). Hướng dẫn release ở [README.md](README.md).

| Mốc | Code | Kiểm chứng tự động | Kiểm chứng thủ công (cần user) |
|---|---|---|---|
| M1 capture | ✅ | build + smoke test | Nút "Thu 10s WAV" → mở bằng Audacity |
| M2 Gemini client | ✅ | 10 test state machine | `npm run echo-test -- file.wav` (cần API key) |
| M3 end-to-end | ✅ | test VAD + store | Vào Meet thật, đo độ trễ phụ đề |
| M4 overlay + export | ✅ | test export srt/txt/md | Click-through trên Meet full-screen |
| M5 playback | ✅ | typecheck + build | Test chống feedback loa/tai nghe |
| M6 hardening + ship | ✅ | test reconnect/GoAway/stale-close | Soak test 60 phút + cài installer máy sạch |
| M7 chiều đi VI→JA | ✅ | 3 test PTT + 2-instance | Meet 2 tài khoản: bên kia chỉ nghe tiếng Nhật |
| v0.3 tự lưu + UI 2 tab | ✅ | 5 test autosave | Kill app giữa phiên → file vẫn còn nội dung |

**Khác biệt so với thiết kế ban đầu (quyết định lúc triển khai):**
- SDK `@google/genai` 2.8.0 **đã có sẵn** `translationConfig` trong `LiveConnectConfig` (mục 2 lo SDK chưa kịp hỗ trợ — không xảy ra). SDK vẫn là client chính, raw-ws là fallback runtime tự động.
- Audio chunk renderer→main dùng `ipcRenderer.send` thường thay vì `MessageChannelMain` (plan đã ghi chú port chỉ là "nicety" — 32KB/s không cần).
- Preload sandboxed phải bundle thành 1 file → tên IPC channel viết literal trong `src/preload/*.ts` (khớp `src/shared/ipc-contract.ts`), không import constants chung.
- Bật capture qua `webContents.executeJavaScript(..., userGesture=true)` thay vì IPC event — né yêu cầu user-activation của `getDisplayMedia`.
- Sửa race: close event đến muộn của kết nối cũ được nhận diện qua danh tính session (box) để không xoá session mới sau khi rotate.
- **Bổ sung ngoài plan:** tự ngắt segment phụ đề theo dấu câu của bản dịch (≥50 ký tự, trần 250) để tránh "tường chữ" khi người nói liên tục — lợi cho cả panel, overlay lẫn export `.srt`; icon app (SVG → PNG render bằng Electron, `scripts/render-icon.mjs`); overlay giữ 50 segment lịch sử, cuộn lại được khi không click-through.
- **v0.3.0:** cửa sổ Control tách 2 tab **Dịch** / **Cài đặt** (gom mọi setting, cảnh báo rút gọn kèm nút "Sửa →"); `TranscriptAutoSaver` (`main/subtitles/autosave.ts`) tự lưu mỗi phiên của cả 2 chiều — ghi lại toàn bộ phiên sau debounce 1,5s (tmp → rename), flush khi phiên về idle/error và `before-quit`; IPC mới `autosave:getDir/pickDir/openDir`.

## 1. Bối cảnh & Mục tiêu

**Vấn đề:** Tham gia họp bằng tiếng Nhật / tiếng Anh trên Google Meet và Zoom, cần hiểu nội dung theo thời gian thực bằng tiếng Việt.

**Giải pháp:** App desktop chạy song song với meeting, bắt **audio hệ thống** (loopback — hoạt động với mọi app họp, không cần plugin/bot tham gia meeting), stream lên Gemini 3.5 Live Translate, hiển thị **phụ đề song ngữ** (transcript gốc + bản dịch Việt) trong cửa sổ overlay luôn-nổi, kèm tùy chọn **phát giọng dịch tiếng Việt** qua tai nghe.

**Các quyết định đã chốt:**
- Tech stack: **Electron + TypeScript** (React cho UI)
- Output: **phụ đề song ngữ + audio dịch** (audio bật/tắt được)
- Chiều dịch: **1 chiều** — nghe meeting (Nhật/Anh, tự nhận diện) → tiếng Việt. *Cập nhật 11/06: mở rộng 2 chiều ở M7 (mục 10)*
- Nền tảng: **chỉ Windows 11**
- User tự cung cấp Gemini API key (tool cá nhân)

## 2. Thông tin API đã xác minh (docs Google, 11/06/2026)

API **có thật**, Google phát hành public preview ngày **09/06/2026**:

| Thuộc tính | Giá trị |
|---|---|
| Model ID | `gemini-3.5-live-translate-preview` (qua Gemini Live API, WebSocket `BidiGenerateContent`) |
| Audio vào | PCM 16-bit, **16kHz**, mono, little-endian, gửi chunk ~100ms (= 1.600 mẫu = 3.200 bytes) |
| Audio ra | PCM 16-bit, **24kHz**, mono (giọng dịch) + transcript text vào/ra |
| Cấu hình | `generationConfig.translationConfig { targetLanguageCode: "vi", echoTargetLanguage: false }` + `inputAudioTranscription {}` / `outputAudioTranscription {}` |
| Ngôn ngữ nguồn | **Tự nhận diện** 70+ ngôn ngữ (gồm `ja`, `en`, `vi`) — không cần chọn Nhật/Anh thủ công |
| Giá | ~**$0.023/phút** audio đầu vào |
| Giới hạn phiên | Session ~15 phút (nới bằng `contextWindowCompression`), kết nối WS ~10 phút, có `GoAway { timeLeft }` báo trước + `sessionResumption` (handle sống 2h) |
| `echoTargetLanguage: false` | Tiếng Việt trong meeting → model **im lặng** (không dịch lại) — đồng thời là chốt chặn vòng lặp tự dịch chính mình |
| SDK | `@google/genai` hỗ trợ Live API (`ai.live.connect`); API mới 3 ngày nên **cần verify SDK đã expose `translationConfig` chưa** — có fallback raw WebSocket |

Docs: [Live translation guide](https://ai.google.dev/gemini-api/docs/live-api/live-translate) · [Live API overview](https://ai.google.dev/gemini-api/docs/live-api) · [Model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-live-translate-preview)

## 3. Kiến trúc tổng thể

```
┌─ Meeting (Meet/Zoom) phát ra loa ─────────────────────────────┐
│                                                               │
│  Windows WASAPI loopback (Electron setDisplayMediaRequestHandler,
│  audio: 'loopback' — Electron ≥ 31, CHỈ Windows)              │
└──────────────┬────────────────────────────────────────────────┘
               ▼
  [Engine window — renderer ẩn, không UI]
  AudioContext 16kHz → AudioWorklet: downmix mono, Float32→Int16,
  đóng khung 100ms, tính RMS (VAD + level meter), pre-roll 500ms
               │ audio:chunk (MessagePort, ArrayBuffer transferable)
               ▼
  [Main process]
  SessionManager (state machine) ── VAD gate (RMS, chỉ gửi khi có tiếng nói)
        │ @google/genai Live session (API key ở main, không vào renderer)
        ▼
  Gemini 3.5 Live Translate ──► inputTranscription (ja/en)
                              ──► outputTranscription (vi)
                              ──► audio PCM 24kHz (giọng Việt)
        │                                  │
        ▼ subtitle:update                  ▼ playback:chunk
  [Overlay window]                   [Engine window]
  Phụ đề song ngữ, luôn-nổi,         AudioContext 24kHz, queue gapless,
  trong suốt, click-through          setSinkId → tai nghe (KHÔNG phải
                                     thiết bị mặc định → tránh feedback)
  [Control window]
  Start/Stop · API key (safeStorage) · chọn thiết bị phát ·
  VAD threshold + meter · đồng hồ chi phí · cài đặt overlay · export
```

**3 quyết định kiến trúc then chốt:**

1. **Bắt audio bằng `session.setDisplayMediaRequestHandler` + `audio: 'loopback'`** (không dùng `desktopCapturer` legacy). Main tự grant không cần picker; renderer gọi `getDisplayMedia({ video: true, audio: true })` rồi stop ngay video track, giữ audio. Dùng `'loopback'` chứ **không** dùng `'loopbackWithMute'` (mute loa thì user không nghe được meeting).
2. **Cửa sổ engine ẩn riêng** sở hữu cả capture lẫn playback — vì `getDisplayMedia`, AudioWorklet, `setSinkId` chỉ tồn tại trong renderer, và tách khỏi UI để đóng/reload overlay không giết pipeline audio.
3. **WebSocket Gemini đặt ở main process** — API key (giải mã safeStorage) không bao giờ vào renderer; state machine phiên (reconnect, resumption, cost meter, lịch sử phụ đề) sống độc lập với mọi cửa sổ.

## 4. Quản lý phiên Gemini (main process)

**Setup message:**
```json
{
  "setup": {
    "model": "models/gemini-3.5-live-translate-preview",
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "translationConfig": { "targetLanguageCode": "vi", "echoTargetLanguage": false },
      "inputAudioTranscription": {},
      "outputAudioTranscription": {}
    },
    "sessionResumption": {},
    "contextWindowCompression": { "slidingWindow": {} }
  }
}
```
Audio gửi qua `session.sendRealtimeInput({ audio: { data: <base64>, mimeType: "audio/pcm;rate=16000" } })`.

- **State machine** `SessionManager`: `idle → connecting → streaming ⇄ gated(im lặng) → draining(GoAway) → reconnecting → streaming`, cộng `stopping → idle` và `error`. Broadcast `session:state` cho mọi cửa sổ.
- **Client wrapper**: interface `GeminiLiveClient` với 2 impl — `@google/genai` (chính) và `raw-ws-client.ts` (fallback nếu SDK chưa nhận `translationConfig`; thử cast config trước, chỉ fallback khi server từ chối). Đây là **cổng quyết định ở Milestone 2**.
- **Reconnect không mất chữ**: nhận `GoAway` → mở kết nối mới ngay với `sessionResumption: { handle }`, chồng lấn 2 kết nối để rớt tối đa 1 chunk. **Lịch sử phụ đề lưu ở store phía main, không nằm trong session** → reconnect không bao giờ mất lịch sử.
- **VAD gate (kiểm soát chi phí)**: RMS theo khung 100ms tính trong AudioWorklet. Mở cổng khi RMS > ngưỡng (mặc định −50 dBFS, chỉnh được kèm meter) 2 khung liên tiếp → flush pre-roll 500ms trước (không cụt đầu câu); đóng sau 2s dưới ngưỡng → gửi `audioStreamEnd: true`, ngừng gửi (ngừng trả tiền). Im lặng 5 phút → đóng hẳn WS (handle còn hạn 2h), nói lại thì lazy-reconnect. Cost meter chỉ đếm giây **thực gửi** × $0.023/60.

## 5. Đường phát audio dịch + chống vòng lặp feedback

- `AudioContext({ sampleRate: 24000 })` thứ hai trong engine window; mỗi chunk → `AudioBufferSourceNode` xếp lịch gapless theo `nextStartTime` (pattern của Google live-api-web-console). Tất cả qua một `GainNode`; **tắt** = gain 0 + hủy mọi source đã xếp + reset `nextStartTime` (bật lại không phát backlog cũ).
- **Chọn thiết bị ra** bằng `AudioContext.setSinkId(deviceId)`, danh sách từ `enumerateDevices()`, đổi được giữa phiên.
- **Chống feedback (quan trọng — loopback bắt thiết bị phát mặc định, gồm cả âm app mình phát):**
  1. *Chính:* route giọng dịch qua `setSinkId` đến thiết bị **không phải mặc định** (tai nghe) → không lọt vào loopback. UI cảnh báo (và mặc định tắt playback) nếu user chọn đúng thiết bị mặc định.
  2. *Chốt chặn ngữ nghĩa:* `echoTargetLanguage: false` — tiếng Việt lọt vào capture thì model phát im lặng, không thành vòng lặp vô hạn.
  3. *Dự phòng:* cờ "đang tự phát" + VAD — tùy chọn ngừng gửi khi playback đang kêu trên thiết bị mặc định (xuống cấp thành chỉ-phụ-đề, không bao giờ feedback).
  4. Ở M5, thăm dò constraint loại trừ audio chính app (`suppressLocalAudioPlayback`/`restrictOwnAudio`) trong bản Chromium đi kèm Electron; nếu có thì bật.
- Ducking âm lượng meeting (per-app WASAPI) cần native module — **ngoài phạm vi v1**.

## 6. UI — 3 cửa sổ (1 codebase React, multi-entry)

| Cửa sổ | Vai trò |
|---|---|
| **Control** | Start/Stop + đèn trạng thái; ô nhập API key (write-only, `safeStorage.encryptString` → `userData/secrets.bin`, UI chỉ hiện "đã lưu ✓"); dropdown ngôn ngữ đích (mặc định `vi`); toggle playback + chọn thiết bị ra (+ cảnh báo thiết bị mặc định); slider ngưỡng VAD + RMS meter; đồng hồ phiên, số phút đã stream, chi phí ước tính; điều khiển overlay (cỡ chữ, độ mờ, click-through, ẩn/hiện); nút export transcript |
| **Overlay** | `frame: false, transparent: true, alwaysOnTop ('screen-saver'), skipTaskbar: true`; click-through = `setIgnoreMouseEvents(true, { forward: true })`, bật/tắt từ Control hoặc phím tắt toàn cục `Ctrl+Shift+O`; kéo thả bằng `-webkit-app-region: drag` trên thanh grip; hiển thị 2–4 segment cuối, neo đáy, chữ có shadow/backdrop; scroll-back khi không click-through |
| **Engine** (ẩn) | Capture + playback, không UI, không reload trong phiên |

**Data model phụ đề** (nguồn sự thật duy nhất ở main, broadcast patch qua `subtitle:update`):
```ts
interface SubtitleSegment {
  id: string;
  startedAt: number;
  source: { text: string; final: boolean };   // gộp từ inputTranscription (ja/en)
  target: { text: string; final: boolean };   // gộp từ outputTranscription (vi)
}
```
Hai luồng transcript vào/ra đến độc lập → ghép vào **segment đang mở** theo thời gian. Chốt segment khi `turnComplete`/`generationComplete`, khi VAD đóng cổng, hoặc khoảng trống >2s giữa các fragment — cái nào đến trước. Partial render đè tại chỗ (update, không append). Export khi dừng phiên → `.txt` / `.srt` / `.md` song ngữ kèm timestamp (main ghi file qua `dialog.showSaveDialog`).

**IPC contract** (typed channel map ở `src/shared/ipc-contract.ts`, enforce 2 đầu qua preload):
- `invoke` (renderer→main): `settings:get/set`, `secrets:setApiKey/hasApiKey`, `session:start/stop`, `playback:setEnabled/setDevice`, `transcript:export`, `overlay:setClickThrough`
- event (main→renderer): `session:state`, `subtitle:update`, `metrics:update` ({rms, secondsSent, cost, connState}), `playback:chunk` (chỉ engine)
- engine→main: `audio:chunk` (MessagePort), `capture:error`
- Bảo mật: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` mọi cửa sổ; 3 preload tối thiểu, mỗi cửa sổ chỉ thấy kênh của mình.

## 7. Cấu trúc thư mục & toolchain

**Toolchain: `electron-vite`** (multi-entry main/preload/nhiều renderer tốt nhất, HMR nhanh) + **`electron-builder`** (NSIS, target Windows).

```
live-translate-companion/
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ package.json / tsconfig.json (+ project refs theo layer)
└─ src/
   ├─ main/
   │  ├─ index.ts                 # app lifecycle, single-instance lock
   │  ├─ windows.ts               # factory 3 cửa sổ + setDisplayMediaRequestHandler loopback
   │  ├─ gemini/
   │  │  ├─ client.ts             # interface GeminiLiveClient + impl @google/genai
   │  │  ├─ raw-ws-client.ts      # impl fallback (cùng interface)
   │  │  └─ session-manager.ts    # state machine, reconnect, resumption, cost meter
   │  ├─ subtitles/store.ts       # segment store, ghép cặp, export
   │  ├─ secrets.ts               # wrapper safeStorage
   │  ├─ settings.ts              # settings JSON trong userData
   │  └─ ipc.ts                   # đăng ký toàn bộ handler 1 chỗ
   ├─ preload/{control,overlay,engine}.ts
   ├─ renderer/
   │  ├─ control/  overlay/       # entry React
   │  └─ engine/
   │     ├─ index.ts              # điều phối capture + playback (không UI)
   │     ├─ capture.ts  playback.ts
   │     └─ worklets/pcm-capture-processor.ts
   └─ shared/{ipc-contract.ts, types.ts, constants.ts}
```

**Packages:** `electron` (bản stable mới nhất, ≥31 bắt buộc cho loopback — pin major hiện hành), `@google/genai` (mới nhất — **verify types đã có `translationConfig`**), `electron-vite`, `electron-builder`, `vite`, `typescript` ~5.x, `react` + `react-dom`, `zustand`, `vitest` (unit test: VAD, ghép segment, state machine). **Không native module.**

## 8. Milestones (M1–M6 đã xong; M7 xem mục 10)

| # | Sản phẩm | Kiểm chứng |
|---|---|---|
| **M1** | Scaffold electron-vite, 3 cửa sổ, khung IPC typed + bắt loopback + worklet pipeline | Mở YouTube; nút debug thu 10s ra `capture-test.wav` (16kHz/mono/PCM16); mở bằng Audacity — đúng cao độ/tốc độ |
| **M2** | `GeminiLiveClient` + echo test (chưa cần capture): stream 1 file WAV tiếng Nhật đóng gói sẵn từ main | Console hiện `inputTranscription` (ja), `outputTranscription` (vi), nhận audio chunk; **cổng quyết định:** SDK nhận `translationConfig`? Không → kích hoạt `raw-ws-client.ts` |
| **M3** | End-to-end: loopback → VAD gate → Gemini → segment hiện live dạng list thường trong Control; cost meter | Vào Meet thật với video tiếng Nhật/Anh; phụ đề trễ < ~2s; phòng im lặng → metrics 0 byte gửi (VAD chuẩn); cost khớp `secondsSent` |
| **M4** | Overlay: trong suốt, luôn-nổi, partial update, kéo thả, click-through, cỡ chữ; logic chốt/ghép segment + export | Overlay nổi trên Meet full-screen; click xuyên vùng phụ đề trúng nút của Meet; export ra `.srt` song ngữ mạch lạc |
| **M5** | Playback: queue 24kHz, picker `setSinkId`, toggle giữa phiên, cảnh báo thiết bị mặc định; test feedback | Meeting ra loa (mặc định), bản dịch ra tai nghe: nói tiếng Nhật vào meeting → nghe tiếng Việt trong tai nghe, **transcript không dịch lại output của chính app**; cố tình route ra loa → xác nhận `echoTargetLanguage:false` chặn vòng lặp |
| **M6** | Hardening + ship: GoAway/reconnect kèm resumption (không mất phụ đề), idle-disconnect/lazy-reconnect, persist settings, luồng key safeStorage, phím tắt toàn cục, installer NSIS | Soak test 60 phút meeting thật: ≥6 lần reconnect trong suốt, zero mất lịch sử, memory ổn định; cài từ `.exe` trên máy Win11 sạch và lặp lại kiểm chứng M3 |

## 9. Rủi ro / ẩn số

| Rủi ro | Khả năng | Giảm thiểu |
|---|---|---|
| `@google/genai` chưa serialize `translationConfig` (API mới 3 ngày) | Trung bình | Interface + `raw-ws-client.ts` fallback; M2 là cổng quyết định |
| Tự-feedback: loopback bắt cả giọng Việt app phát | Cao nếu playback ra thiết bị mặc định | §5: sink không-mặc-định (chính), `echoTargetLanguage:false` (chốt chặn), cảnh báo UI; thăm dò constraint loại trừ own-audio ở M5 |
| Loopback bắt **mọi** âm hệ thống (notification, nhạc) → dịch rác | Trung bình | Hướng dẫn tắt app khác; ngưỡng VAD lọc tiếng nhỏ; per-process loopback Electron không expose — chấp nhận ở v1, ứng viên native-module sau |
| Chế độ dịch liên tục phản ứng lạ với gating phía client (`audioStreamEnd`) | Trung bình | Test ở M3; fallback: giữ stream mở, kéo dài hangover |
| Giới hạn 10 phút WS / 15 phút session gây đứt giữa câu | Chắc chắn (by design) | Reconnect chủ động theo `GoAway.timeLeft`, `sessionResumption`, sliding-window compression; lịch sử ở phía app; verify ở M6 |
| API preview: giá, quota, message shape có thể đổi | Trung bình | Cô lập toàn bộ wire-format trong `src/main/gemini/`; hiện lỗi server lên UI; cost meter ghi rõ là ước tính |
| Ghép transcript ja ↔ vi lệch segment | Trung bình | Ghép theo cửa sổ thời gian + chốt-khi-có-khoảng-trống, chỉnh được; lỗi chỉ ở mức thẩm mỹ |
| Chất lượng resample `AudioContext({sampleRate:16000})` / edge case `setSinkId` trên bản Electron pin | Thấp | M1/M5 verify thực nghiệm; fallback: decimation trong worklet; `<audio>`+MediaStreamDestination với `HTMLMediaElement.setSinkId` |

## 10. M7 — Chiều đi: nói tiếng Việt → giọng Nhật vào meeting (ĐÃ CODE XONG 12/06/2026)

> Trạng thái: **code xong 12/06/2026**, typecheck/build/test pass. Chờ kiểm chứng thủ công (mục 10.6).
>
> **Khác thiết kế khi triển khai:**
> - `SessionManager` KHÔNG cần refactor lớn — vốn đã direction-agnostic (nhận frame qua `handleFrame`, xuất audio qua dep `onPlaybackChunk`). Chỉ thêm: dep tuỳ chọn `getGateMode()` ('vad' | 'ptt') + method `setPushToTalk(active)`/`togglePushToTalk()`. Tái dùng 100% logic reconnect/resumption/GoAway/stale-close. Tạo instance #2 với deps riêng (target `ja`, nguồn mic, sink CABLE).
> - **PTT toàn cục là TOGGLE, không phải hold** — Electron `globalShortcut` không bắt được keyup, và plan cấm native module. `Ctrl+Space` (toàn cục) bật/tắt; thêm nút "Giữ để nói" trong panel (pointerdown/up = true-PTT khi cửa sổ Control hiện). Cả hai cùng gọi `setPushToTalk`.
> - File mới: `renderer/engine/mic-capture.ts` (getUserMedia + worklet tái dùng), `renderer/control/OutgoingPanel.tsx`, `renderer/control/ui-helpers.ts`. PcmPlayer tái dùng cho CABLE player (instance #2). Permission handler 'media' thêm trong `windows.ts` cho getUserMedia.
> - Settings mới: `micDeviceId/Label`, `outgoingTargetLanguage` (mặc định `ja`, chọn ja/en/ko/zh), `outgoingMode` (mặc định `ptt`), `outgoingVadThresholdDb`, `outgoingDeviceId/Label`. Không có `outgoingEnabled` — trạng thái chạy lấy từ outgoing SessionManager (giống nút Bắt đầu chiều về).

### 10.1 Mục tiêu & điều kiện tiên quyết

User nói tiếng Việt → app dịch thành **giọng tiếng Nhật** phát vào meeting như thể đó là micro của user. Người bên kia **chỉ nghe tiếng Nhật**, không nghe tiếng Việt gốc (mic thật không vào meeting).

**Điều kiện user phải tự làm (app không làm thay được):**
1. Cài **VB-Audio Virtual Cable** (driver micro ảo miễn phí, cài 1 lần, cần restart) — Windows không có virtual mic sẵn.
2. Trong Meet/Zoom chọn **Microphone = "CABLE Output (VB-Audio Virtual Cable)"**.

### 10.2 Kiến trúc — ảnh gương của chiều về, tái dùng tối đa

```
Mic thật ──getUserMedia (engine window)──► AudioWorklet (TÁI DÙNG pcm-capture-processor)
   │ mic:chunk (IPC mới)                       16kHz PCM16 + RMS
   ▼
[Main] SessionManager instance #2 ("outgoing") ── VAD gate / push-to-talk
   │ phiên Gemini riêng: translationConfig { targetLanguageCode: "ja", echoTargetLanguage: false }
   ▼
Gemini ──► audio 24kHz giọng Nhật ──► PcmPlayer instance #2 (engine window)
                                          setSinkId("CABLE Input") ──► Meet/Zoom (mic ảo)
       ──► transcript VI gốc + JA dịch ──► panel "Chiều đi" trong Control
```

**Nguyên tắc generalize (việc refactor chính):**
- `SessionManager` hiện gắn cứng 1 phiên → tách thành **2 instance độc lập** `incoming` (target `vi`, nguồn loopback) và `outgoing` (target `ja`, nguồn mic). Dùng chung class: `GeminiLiveClient`, `VadGate`, logic reconnect/resumption/GoAway/stale-close giữ nguyên.
- `SubtitleStore` thứ 2 cho chiều đi (transcript VI nói + JA dịch), broadcast kênh riêng `subtitle:outgoing`.
- Engine window thêm: `getUserMedia({ audio: { deviceId: micId } })` + worklet tái dùng; `PcmPlayer` thứ 2 trỏ sink vào CABLE Input. Start/stop qua `executeJavaScript` như capture hiện tại.
- IPC mới: `mic:chunk`, `outgoing:state`, `subtitle:outgoing`, `playback:outgoing-chunk` (+ settings mới).
- Settings mới: `micDeviceId`, `outgoingEnabled`, `outgoingMode: 'vad' | 'ptt'`, `outgoingDeviceId` (mặc định tự tìm thiết bị tên chứa "CABLE Input"), `outgoingTargetLanguage` (mặc định `ja`, chọn được `en`).

### 10.3 UI (Control window — panel "Nói vào meeting" mới)

- Toggle bật/tắt chiều đi + chọn micro + chọn thiết bị ra (cảnh báo đỏ nếu không phải CABLE Input — chọn nhầm loa thật là phát tiếng Nhật ra phòng).
- Chế độ: **VAD** (mic mở, gate theo ngưỡng riêng) hoặc **Push-to-talk** (giữ phím tắt toàn cục, mặc định `Ctrl+Space`, nhả ra → `audioStreamEnd`) — PTT khuyến nghị để không dịch nhầm chuyện ngoài lề.
- Transcript chiều đi hiện song ngữ VI → JA (tái dùng component segment); cost meter cộng **cả 2 phiên**, hiện tách "nghe" / "nói".
- Hướng dẫn cài VB-Cable inline khi app không tìm thấy thiết bị CABLE (link + 3 bước).

### 10.4 Chống lỗi vòng & an toàn

- Giọng Nhật ra **CABLE Input** (không phải default output) → **không lọt vào loopback** chiều về — cùng nguyên tắc sink-không-mặc-định của §5.
- Mic thật có thể nghe lỏm loa (meeting phát ra loa) → giọng Nhật/Anh từ loa lọt vào phiên outgoing: phiên này target `ja` nên tiếng Nhật bị `echoTargetLanguage:false` làm im lặng ✓; tiếng Anh thì BỊ dịch sang Nhật → rủi ro thật. Giảm thiểu: khuyến nghị đeo tai nghe khi bật chiều đi + PTT là chốt chặn chính; ghi rõ trong UI.
- Tắt chiều đi giữa phiên = flush PcmPlayer #2 + đóng phiên outgoing (handle resumption giữ 2h như cũ).

### 10.5 Việc cần làm (checklist code 12/06)

1. Refactor `SessionManager` nhận tham số direction (nguồn frame, targetLanguage, store, kênh sự kiện) — giữ nguyên test cũ, thêm test instance kép.
2. Engine: mic capture + player #2; main: wiring instance outgoing + IPC/settings/preload mới.
3. UI panel "Nói vào meeting" + PTT global shortcut + auto-detect CABLE.
4. Tests: VAD/PTT chuyển `audioStreamEnd` đúng lúc nhả phím; 2 instance độc lập (đóng 1 không ảnh hưởng 2); settings mới persist.
5. README: mục cài VB-Cable + chọn mic trong Meet/Zoom.

### 10.6 Kiểm chứng M7

| Bước | Cách kiểm |
|---|---|
| Echo đơn lẻ | Chưa cần VB-Cable: trỏ player #2 ra tai nghe, nói "xin chào, hôm nay họp về tiến độ dự án" → nghe giọng Nhật, transcript VI/JA khớp |
| Vào meeting thật | Meet 2 tài khoản (2 máy/2 profile): máy A nói tiếng Việt qua PTT → máy B **chỉ nghe tiếng Nhật**, không nghe tiếng Việt gốc |
| Chống lọt | Máy A bật cả 2 chiều, meeting ra tai nghe: nói chuyện 5 phút, transcript chiều về không chứa bản dịch lại giọng Nhật của chính mình |
| Cost | Cost meter tách 2 phiên; im lặng cả 2 chiều → 0 byte gửi |

### 10.7 Rủi ro riêng của M7

| Rủi ro | Khả năng | Giảm thiểu |
|---|---|---|
| User ngại cài driver VB-Cable | Trung bình | Hướng dẫn inline + app vẫn chạy đầy đủ chiều về khi không có cable |
| Trễ 2–5s → hội thoại kiểu "phiên dịch đuổi" | Chắc chắn (bản chất streaming) | Đặt kỳ vọng trong UI; PTT giúp người nói chủ động nhịp; nói thành câu ngắn |
| Mic BT chuyển profile HFP → audio vào kém | Trung bình | Khuyến nghị mic có dây/webcam mic; hiện sample rate mic trong UI |
| Mic nghe lỏm loa → dịch nhầm tiếng Anh từ meeting | Trung bình | Tai nghe + PTT (chính); ngưỡng VAD riêng cho mic |
| Chi phí ×2 khi cả 2 chiều cùng nói | Chắc chắn | VAD/PTT gate cả 2 đầu; meter tách 2 phiên cho minh bạch |
