import type {
  AppSettings,
  PlaybackSinkState,
  SessionStateInfo,
  TypedSpeechState,
  UsageSummary
} from '../../shared/types'
import { isVirtualCable } from '../../shared/virtual-cable'
import { redactSecrets } from './log-format'

export const DIAGNOSTICS_LOG_LINES = 80

export interface DiagnosticsInput {
  now: Date
  appVersion: string
  // vd. "Windows 10.0.26300 (x64)"
  os: string
  // electron / chrome / node
  versions: { electron?: string; chrome?: string; node?: string }
  hasApiKey: boolean
  settings: AppSettings
  incoming: SessionStateInfo
  outgoing: SessionStateInfo
  playbackSink: PlaybackSinkState | null
  outgoingSink: PlaybackSinkState | null
  directMic: boolean
  typedSpeech: TypedSpeechState
  outputDevices: string[]
  inputDevices: string[]
  usage: UsageSummary
  // thư mục home của người dùng: tên tài khoản Windows nằm trong mọi đường dẫn → thay bằng ~
  homeDir: string
  logLines: string[]
}

const onOff = (v: boolean): string => (v ? 'bật' : 'tắt')
const named = (label: string): string => label || '(mặc định / chưa chọn)'

function sinkLine(sink: PlaybackSinkState | null): string {
  if (!sink) return 'chưa mở lần nào'
  if (!sink.ok) return `LỖI route: ${sink.error ?? 'không rõ'}`
  return `route được${sink.isCaptured ? ', BỊ THU NGƯỢC' : ''}`
}

function sessionLine(info: SessionStateInfo): string {
  const extra = [
    info.error ? `lỗi: ${info.error}` : '',
    info.usingFallbackClient ? 'raw-ws' : '',
    info.contextDisabled ? 'không nhận ngữ cảnh' : '',
    info.textOnly ? 'chỉ chữ' : '',
    info.translateError ? `lỗi dịch câu: ${info.translateError}` : ''
  ].filter(Boolean)
  return extra.length ? `${info.state} (${extra.join('; ')})` : info.state
}

// Bản tóm tắt để dán vào issue khi báo lỗi. KHÔNG chứa API key, nội dung cuộc họp, ngữ cảnh,
// từ khoá hay tên tài khoản Windows — chỉ cấu hình, trạng thái và đoạn log cuối (đã che bí mật).
export function buildDiagnostics(d: DiagnosticsInput): string {
  const s = d.settings
  const lines = [
    `Live Translate Companion ${d.appVersion}`,
    `Thời điểm: ${d.now.toISOString()}`,
    `Hệ điều hành: ${d.os}`,
    `Electron ${d.versions.electron ?? '?'} · Chrome ${d.versions.chrome ?? '?'} · Node ${d.versions.node ?? '?'}`,
    '',
    `API key: ${d.hasApiKey ? 'đã lưu' : 'CHƯA CÓ'}`,
    `API version: ${s.apiVersion} · model Live: ${s.liveModel || '(mặc định)'} · model tóm tắt: ${s.summaryModel}`,
    '',
    `Chiều về: ${sessionLine(d.incoming)}`,
    `  Cách dịch: ${s.incomingMode} · dịch sang: ${s.targetLanguage} · ngưỡng VAD: ${s.vadThresholdDb} dB`,
    `  Phát giọng dịch: ${onOff(s.playbackEnabled)} · nghe cả meeting: ${onOff(s.monitorEnabled)}`,
    `  Thiết bị giọng dịch: ${named(s.playbackDeviceLabel)} — ${sinkLine(d.playbackSink)}`,
    '',
    `Chiều đi: ${sessionLine(d.outgoing)}`,
    `  Chế độ: ${s.outgoingMode} · dịch sang: ${s.outgoingTargetLanguage} · ngưỡng VAD: ${s.outgoingVadThresholdDb} dB`,
    `  Micro: ${named(s.micDeviceLabel)}`,
    `  Phát vào: ${named(s.outgoingDeviceLabel)} — mic ảo: ${isVirtualCable(s.outgoingDeviceLabel) ? 'có' : 'KHÔNG'} — ${sinkLine(d.outgoingSink)}`,
    `  Nói thẳng: ${onOff(d.directMic)} · Gõ để nói: ${d.typedSpeech} (giọng ${s.typedSpeechVoice})`,
    '',
    `Thiết bị phát (${d.outputDevices.length}): ${d.outputDevices.join(' | ') || '(không có)'}`,
    `Thiết bị thu (${d.inputDevices.length}): ${d.inputDevices.join(' | ') || '(không có)'}`,
    '',
    `Tự lưu: ${onOff(s.autoSaveEnabled)} (${s.autoSaveFormat}, thư mục ${s.autoSaveDir ? 'tuỳ chỉnh' : 'mặc định'}) · tự tóm tắt: ${onOff(s.autoSummary)}`,
    `Ngữ cảnh cuộc họp: ${s.meetingContext.trim() ? `có (${s.meetingContext.trim().length} ký tự, không kèm nội dung)` : 'không'}`,
    `Chi phí: hôm nay $${d.usage.todayUsd.toFixed(3)} · tháng $${d.usage.monthUsd.toFixed(3)} · giới hạn ${d.usage.budgetUsd > 0 ? `$${d.usage.budgetUsd}` : 'không'}`,
    `Overlay: ${onOff(s.overlayVisible)} · click-xuyên: ${onOff(s.overlayClickThrough)} · thu xuống khay: ${onOff(s.minimizeToTray)}`,
    '',
    `--- ${d.logLines.length} dòng log cuối ---`,
    ...d.logLines
  ]
  let text = redactSecrets(lines.join('\n'))
  if (d.homeDir) text = text.split(d.homeDir).join('~')
  return text
}
