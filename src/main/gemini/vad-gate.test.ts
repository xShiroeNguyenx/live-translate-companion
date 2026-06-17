import { describe, expect, it } from 'vitest'
import { VadGate } from './vad-gate'

function frame(rmsDb: number, id: number): { pcm: ArrayBuffer; rmsDb: number; ts: number } {
  const pcm = new ArrayBuffer(4)
  new Int16Array(pcm)[0] = id
  return { pcm, rmsDb, ts: id * 0.1 }
}

function makeGate(): VadGate {
  return new VadGate({
    thresholdDb: -50,
    openFrames: 2,
    hangoverMs: 300,
    preRollMs: 200,
    frameMs: 100
  })
}

describe('VadGate', () => {
  it('đóng khi im lặng — không gửi gì', () => {
    const gate = makeGate()
    for (let i = 0; i < 10; i++) {
      const r = gate.push(frame(-70, i))
      expect(r.send).toHaveLength(0)
      expect(r.open).toBe(false)
      expect(r.streamEnd).toBe(false)
    }
  })

  it('mở sau 2 khung to liên tiếp và flush pre-roll (không cụt đầu câu)', () => {
    const gate = makeGate()
    gate.push(frame(-70, 1))
    gate.push(frame(-70, 2))
    expect(gate.push(frame(-40, 3)).send).toHaveLength(0)
    const r = gate.push(frame(-40, 4))
    expect(r.open).toBe(true)
    // pre-roll 200ms (2 khung) + 2 khung to = 4 khung được flush
    expect(r.send.length).toBe(4)
    const ids = r.send.map((b) => new Int16Array(b)[0])
    expect(ids).toEqual([1, 2, 3, 4])
  })

  it('1 khung to đơn lẻ (tiếng động ngắn) không mở cổng', () => {
    const gate = makeGate()
    gate.push(frame(-70, 1))
    expect(gate.push(frame(-40, 2)).open).toBe(false)
    expect(gate.push(frame(-70, 3)).open).toBe(false)
    expect(gate.open).toBe(false)
  })

  it('đang mở thì gửi từng khung, im lặng ngắn không đóng', () => {
    const gate = makeGate()
    gate.push(frame(-40, 1))
    gate.push(frame(-40, 2))
    const r1 = gate.push(frame(-70, 3))
    expect(r1.send).toHaveLength(1)
    expect(r1.open).toBe(true)
    const r2 = gate.push(frame(-40, 4))
    expect(r2.open).toBe(true)
  })

  it('đóng sau hangover và phát streamEnd đúng 1 lần', () => {
    const gate = makeGate()
    gate.push(frame(-40, 1))
    gate.push(frame(-40, 2))
    gate.push(frame(-70, 3))
    gate.push(frame(-70, 4))
    const r = gate.push(frame(-70, 5))
    expect(r.streamEnd).toBe(true)
    expect(r.open).toBe(false)
    // sau khi đóng, im lặng tiếp không gửi gì nữa
    const r2 = gate.push(frame(-70, 6))
    expect(r2.send).toHaveLength(0)
    expect(r2.streamEnd).toBe(false)
  })

  it('mở lại được sau khi đóng', () => {
    const gate = makeGate()
    gate.push(frame(-40, 1))
    gate.push(frame(-40, 2))
    gate.push(frame(-70, 3))
    gate.push(frame(-70, 4))
    gate.push(frame(-70, 5))
    expect(gate.open).toBe(false)
    gate.push(frame(-40, 6))
    const r = gate.push(frame(-40, 7))
    expect(r.open).toBe(true)
    expect(r.send.length).toBeGreaterThan(0)
  })

  it('setThreshold thay đổi ngưỡng ngay lập tức', () => {
    const gate = makeGate()
    gate.setThreshold(-30)
    gate.push(frame(-40, 1))
    gate.push(frame(-40, 2))
    expect(gate.open).toBe(false)
  })
})
