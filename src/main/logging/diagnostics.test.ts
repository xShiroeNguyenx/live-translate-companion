import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../settings'
import { buildDiagnostics, type DiagnosticsInput } from './diagnostics'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

const fakeKey = `AIza${'k'.repeat(35)}`

const input = (patch: Partial<DiagnosticsInput> = {}): DiagnosticsInput => ({
  now: new Date('2026-11-13T09:15:02.000Z'),
  appVersion: '0.5.7',
  os: 'Windows 10.0.26300 (x64)',
  versions: { electron: '41.7.1', chrome: '140', node: '22' },
  hasApiKey: true,
  settings: {
    ...DEFAULT_SETTINGS,
    micDeviceLabel: 'Microphone (USB Audio)',
    outgoingDeviceLabel: 'CABLE Input (VB-Audio Virtual Cable)',
    meetingContext: 'Dự án Sakura với khách hàng bí mật',
    highlightKeywords: 'Sakura, deadline'
  },
  incoming: { state: 'idle' },
  outgoing: { state: 'error', error: 'Không tìm thấy micro đã chọn.' },
  playbackSink: null,
  outgoingSink: { ok: true, deviceId: 'abc', label: 'CABLE Input (VB-Audio Virtual Cable)', isCaptured: false },
  directMic: false,
  typedSpeech: 'idle',
  outputDevices: ['Speakers (Realtek(R) Audio)', 'CABLE Input (VB-Audio Virtual Cable)'],
  inputDevices: ['Microphone (USB Audio)'],
  usage: { todayUsd: 0.1234, monthUsd: 2.5, budgetUsd: 10 },
  homeDir: 'C:\\Users\\deploy',
  logLines: ['2026-11-13T09:15:00.000Z [error] Mic lỗi từ engine: NotFoundError'],
  ...patch
})

describe('buildDiagnostics', () => {
  it('có phiên bản, trạng thái hai chiều, thiết bị và đoạn log cuối', () => {
    const text = buildDiagnostics(input())
    expect(text).toContain('Live Translate Companion 0.5.7')
    expect(text).toContain('Chiều đi: error (lỗi: Không tìm thấy micro đã chọn.)')
    expect(text).toContain('Phát vào: CABLE Input (VB-Audio Virtual Cable) — mic ảo: có — route được')
    expect(text).toContain('Thiết bị phát (2): Speakers (Realtek(R) Audio) | CABLE Input')
    expect(text).toContain('--- 1 dòng log cuối ---')
    expect(text).toContain('Mic lỗi từ engine: NotFoundError')
  })

  it('không chứa nội dung ngữ cảnh cuộc họp hay từ khoá, chỉ báo là có', () => {
    const text = buildDiagnostics(input())
    expect(text).not.toContain('Sakura')
    expect(text).not.toContain('khách hàng bí mật')
    expect(text).toContain('Ngữ cảnh cuộc họp: có (')
  })

  it('không chứa API key dù nó lọt vào log hay thông báo lỗi', () => {
    const text = buildDiagnostics(
      input({
        logLines: [`2026 [error] 403 wss://example.com/ws?key=${fakeKey}`],
        incoming: { state: 'error', error: `bad key ${fakeKey}` }
      })
    )
    expect(text).not.toContain(fakeKey)
    expect(text).toContain('API key: đã lưu')
  })

  it('thay thư mục home (có tên tài khoản Windows) bằng ~', () => {
    const text = buildDiagnostics(
      input({ logLines: ['[error] Không tự lưu được transcript: EPERM C:\\Users\\deploy\\Documents\\a.txt'] })
    )
    expect(text).not.toContain('deploy')
    expect(text).toContain('~\\Documents\\a.txt')
  })

  it('"Phát vào" là loa thật / sink lỗi được nêu rõ', () => {
    const text = buildDiagnostics(
      input({
        settings: { ...DEFAULT_SETTINGS, outgoingDeviceLabel: 'Speakers (Realtek(R) Audio)' },
        outgoingSink: { ok: false, deviceId: 'x', label: '', isCaptured: true, error: 'NotFoundError' }
      })
    )
    expect(text).toContain('mic ảo: KHÔNG — LỖI route: NotFoundError')
  })

  it('chưa có API key thì nói rõ', () => {
    expect(buildDiagnostics(input({ hasApiKey: false }))).toContain('API key: CHƯA CÓ')
  })
})
