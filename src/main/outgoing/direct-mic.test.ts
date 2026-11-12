import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import type { AppSettings, PlaybackSinkState } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../settings'
import { DirectMicController, type DirectMicDeps } from './direct-mic'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  micDeviceId: 'mic-id',
  outgoingDeviceId: 'cable-id',
  outgoingDeviceLabel: 'CABLE Input (VB-Audio Virtual Cable)'
}

const SINK_OK: PlaybackSinkState = {
  ok: true,
  deviceId: 'cable-id',
  label: 'CABLE Input (VB-Audio Virtual Cable)',
  isCaptured: false
}

function setup(overrides: Partial<DirectMicDeps> = {}) {
  // phiên dịch giả: running + paused
  const translation = { running: false, paused: false }
  const deps: DirectMicDeps = {
    getSettings: () => settings,
    prepareSink: vi.fn(async () => SINK_OK),
    startMic: vi.fn(async () => undefined),
    stopMic: vi.fn(async () => undefined),
    release: vi.fn(),
    isTranslating: () => translation.running && !translation.paused,
    isTranslationPaused: () => translation.running && translation.paused,
    pauseTranslation: vi.fn(() => {
      translation.paused = true
    }),
    resumeTranslation: vi.fn(() => {
      translation.paused = false
      return { ok: true }
    }),
    ...overrides
  }
  const direct = new DirectMicController(deps)
  const states: boolean[] = []
  direct.on('state', (s: boolean) => states.push(s))
  return { direct, deps, translation, states }
}

describe('DirectMicController', () => {
  it('bật: route sink rồi mới mở micro đã chọn; tắt: ngắt micro và nhả player', async () => {
    const { direct, deps, states } = setup()
    expect(await direct.set(true)).toEqual({ ok: true, on: true })
    expect(deps.prepareSink).toHaveBeenCalledOnce()
    expect(deps.startMic).toHaveBeenCalledWith('mic-id')
    expect(direct.isOn()).toBe(true)

    expect(await direct.set(false)).toEqual({ ok: true, on: false })
    expect(deps.stopMic).toHaveBeenCalledOnce()
    expect(deps.release).toHaveBeenCalledOnce()
    expect(direct.isOn()).toBe(false)
    expect(states).toEqual([true, false])
  })

  it('chưa chọn "Phát vào" → từ chối, không đụng micro', async () => {
    const { direct, deps } = setup({ getSettings: () => ({ ...settings, outgoingDeviceId: '' }) })
    const r = await direct.set(true)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Phát vào')
    expect(deps.prepareSink).not.toHaveBeenCalled()
    expect(deps.startMic).not.toHaveBeenCalled()
  })

  it('"Phát vào" là loa thật → từ chối (tránh hú), nhả player', async () => {
    const { direct, deps, states } = setup({
      prepareSink: vi.fn(async () => ({ ...SINK_OK, label: 'Speakers (Realtek(R) Audio)' }))
    })
    const r = await direct.set(true)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Speakers')
    expect(deps.startMic).not.toHaveBeenCalled()
    expect(deps.release).toHaveBeenCalledOnce()
    expect(direct.isOn()).toBe(false)
    expect(states).toEqual([])
  })

  it('micro không mở được → báo đúng nguyên nhân, không ở trạng thái bật', async () => {
    const { direct } = setup({
      startMic: vi.fn(async () => {
        throw new Error('Không tìm thấy micro đã chọn.')
      })
    })
    expect(await direct.set(true)).toEqual({
      ok: false,
      on: false,
      error: 'Không tìm thấy micro đã chọn.'
    })
    expect(direct.isOn()).toBe(false)
  })

  it('đang dịch chiều đi → tạm dừng dịch khi bật, dịch tiếp khi tắt', async () => {
    const { direct, deps, translation } = setup()
    translation.running = true
    await direct.set(true)
    expect(deps.pauseTranslation).toHaveBeenCalledOnce()
    expect(translation.paused).toBe(true)

    await direct.set(false)
    expect(deps.resumeTranslation).toHaveBeenCalledOnce()
    expect(translation.paused).toBe(false)
  })

  it('bật thất bại thì trả phiên dịch về trạng thái đang chạy', async () => {
    const { direct, translation } = setup({
      prepareSink: vi.fn(async () => ({ ...SINK_OK, ok: false, error: 'NotFoundError' }))
    })
    translation.running = true
    expect((await direct.set(true)).ok).toBe(false)
    expect(translation.paused).toBe(false)
  })

  it('phiên dịch đã tạm dừng từ trước → tắt nói thẳng không tự dịch tiếp', async () => {
    const { direct, deps, translation } = setup()
    translation.running = true
    translation.paused = true
    await direct.set(true)
    await direct.set(false)
    expect(deps.pauseTranslation).not.toHaveBeenCalled()
    expect(deps.resumeTranslation).not.toHaveBeenCalled()
  })

  it('user cho dịch chạy lại trong lúc nói thẳng → tắt nói thẳng, không resume lần nữa', async () => {
    const { direct, deps, translation } = setup()
    translation.running = true
    await direct.set(true)
    translation.paused = false // user bấm Tiếp tục
    direct.onTranslationActive()
    await direct.set(false) // chờ hàng đợi chạy xong
    expect(direct.isOn()).toBe(false)
    expect(deps.stopMic).toHaveBeenCalledOnce()
    expect(deps.resumeTranslation).not.toHaveBeenCalled()
  })

  it('dịch tiếp bị chặn (giới hạn chi phí) → vẫn tắt, kèm lời giải thích', async () => {
    const { direct, translation } = setup({
      resumeTranslation: vi.fn(() => ({ ok: false, error: 'Đã chạm giới hạn tháng.' }))
    })
    translation.running = true
    await direct.set(true)
    const r = await direct.set(false)
    expect(r.on).toBe(false)
    expect(r.error).toContain('Đã chạm giới hạn tháng.')
  })

  it('bấm nhanh bật rồi tắt: chạy nối tiếp, kết thúc ở trạng thái tắt', async () => {
    const { direct, deps } = setup()
    const a = direct.set(true)
    const b = direct.set(false)
    await Promise.all([a, b])
    expect(direct.isOn()).toBe(false)
    expect(deps.startMic).toHaveBeenCalledOnce()
    expect(deps.stopMic).toHaveBeenCalledOnce()
  })

  it('mất micro giữa chừng → tự tắt', async () => {
    const { direct, states } = setup()
    await direct.set(true)
    direct.onMicLost()
    await direct.set(false)
    expect(states).toEqual([true, false])
  })
})
