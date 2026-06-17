import { useEffect, useRef } from 'react'
import type { SessionState } from '../../shared/types'

export const STATE_LABELS: Record<SessionState, string> = {
  idle: 'Chưa chạy',
  connecting: 'Đang kết nối…',
  streaming: 'Đang dịch',
  gated: 'Chờ tiếng nói',
  draining: 'Sắp đổi kết nối',
  reconnecting: 'Đang kết nối lại…',
  stopping: 'Đang dừng…',
  error: 'Lỗi'
}

export const STATE_COLORS: Record<SessionState, string> = {
  idle: '#6b7280',
  connecting: '#f59e0b',
  streaming: '#22c55e',
  gated: '#3b82f6',
  draining: '#f59e0b',
  reconnecting: '#f59e0b',
  stopping: '#6b7280',
  error: '#ef4444'
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function isDefaultDevice(deviceId: string): boolean {
  return deviceId === '' || deviceId === 'default' || deviceId === 'communications'
}

const VIRTUAL_MIC_RE = /CABLE Input/i

export function isVirtualCable(label: string): boolean {
  return VIRTUAL_MIC_RE.test(label)
}

// RMS dBFS → % cho thanh đo (−80..−20 dB ≈ 0..100%)
export function dbToMeterPercent(db: number): number {
  return Math.max(0, Math.min(100, ((db + 80) / 60) * 100))
}

// Ghim đáy CHỈ trong khung cuộn của chính nó (không kéo cả cửa sổ như scrollIntoView).
// Khi user cuộn lên đọc lại thì ngừng tự cuộn; cuộn về đáy thì tiếp tục bám.
export function useStickToBottom<T>(dep: T): {
  ref: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
} {
  const ref = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const onScroll = (): void => {
    const el = ref.current
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }
  useEffect(() => {
    const el = ref.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [dep])
  return { ref, onScroll }
}
