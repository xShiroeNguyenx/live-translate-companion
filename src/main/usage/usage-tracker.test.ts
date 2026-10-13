import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UsageTracker } from './usage-tracker'

describe('UsageTracker', () => {
  let dir: string
  let now: Date

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ltc-usage-'))
    now = new Date(2026, 9, 13, 10, 0, 0)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const make = (): UsageTracker => new UsageTracker(join(dir, 'usage.json'), () => now, 60_000)

  it('cộng phần tăng thêm từ chi phí luỹ kế, tách 2 chiều', () => {
    const u = make()
    u.record('incoming', 0.01)
    u.record('incoming', 0.03)
    u.record('outgoing', 0.02)
    expect(u.today()).toBeCloseTo(0.05)
    u.flush()
  })

  it('chi phí luỹ kế giảm = phiên mới → cộng toàn bộ giá trị mới', () => {
    const u = make()
    u.record('incoming', 0.05)
    u.record('incoming', 0.01)
    expect(u.today()).toBeCloseTo(0.06)
    u.flush()
  })

  it('tổng tháng gồm nhiều ngày, không lẫn tháng trước', () => {
    const u = make()
    now = new Date(2026, 8, 30)
    u.add(1)
    now = new Date(2026, 9, 1)
    u.add(0.5)
    now = new Date(2026, 9, 13)
    u.add(0.25)
    expect(u.month()).toBeCloseTo(0.75)
    expect(u.today()).toBeCloseTo(0.25)
    u.flush()
  })

  it('flush rồi mở lại vẫn giữ số liệu', () => {
    const u = make()
    u.add(0.4)
    u.flush()
    expect(make().today()).toBeCloseTo(0.4)
  })
})
