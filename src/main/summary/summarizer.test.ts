import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, HistoryRecord, SubtitleSegment } from '../../shared/types'
import type { FlashResult } from '../gemini/flash'
import { HistoryStore } from '../history/history-store'
import { DEFAULT_SETTINGS } from '../settings'
import { buildSummaryPrompt, mergeTranscript, transcriptLines } from './summarizer'
import { SummaryService } from './summary-service'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

function seg(at: number, source: string, target: string): SubtitleSegment {
  return {
    id: `s${at}`,
    startedAt: at,
    source: { text: source, final: true },
    target: { text: target, final: true }
  }
}

function rec(
  id: string,
  direction: HistoryRecord['direction'],
  start: number,
  end: number,
  segments: SubtitleSegment[]
): HistoryRecord {
  return {
    id,
    direction,
    startedAt: start,
    endedAt: end,
    targetLanguage: 'vi',
    secondsSent: 0,
    costUsd: 0,
    transcriptFile: null,
    segments
  }
}

describe('summarizer', () => {
  const incoming = rec('in', 'incoming', 0, 100_000, [
    seg(1000, 'こんにちは', 'Xin chào'),
    seg(60_000, '納期は金曜日', 'Hạn là thứ 6')
  ])
  const outgoing = rec('out', 'outgoing', 0, 200_000, [
    seg(30_000, 'Tôi đồng ý', '賛成です'),
    seg(150_000, 'ngoài khoảng', '範囲外')
  ])

  it('trộn 2 chiều theo thời gian, bỏ lời chiều đi ngoài khoảng phiên', () => {
    const text = mergeTranscript({ incoming, outgoing: [outgoing] })
    expect(text.split('\n')).toEqual([
      '[00:00:01] Meeting: こんにちは (dịch: Xin chào)',
      '[00:00:30] Tôi: Tôi đồng ý (dịch: 賛成です)',
      '[00:01:00] Meeting: 納期は金曜日 (dịch: Hạn là thứ 6)'
    ])
  })

  it('mốc tạm dừng chiều về vào transcript; mốc chiều đi bị bỏ; prompt chỉ giải thích khi có mốc', () => {
    const withPause = rec('in2', 'incoming', 0, 100_000, [
      seg(1000, 'こんにちは', 'Xin chào'),
      { ...seg(20_000, '', ''), pauseEndedAt: 20_000 + 15 * 60_000 }
    ])
    const outPause = rec('out2', 'outgoing', 0, 100_000, [
      { ...seg(25_000, '', ''), pauseEndedAt: 40_000 }
    ])
    const input = { incoming: withPause, outgoing: [outPause], meetingContext: '', language: 'vi' }
    expect(mergeTranscript(input).split('\n')).toEqual([
      '[00:00:01] Meeting: こんにちは (dịch: Xin chào)',
      '[00:00:20] (TẠM DỪNG DỊCH 15 phút — đoạn này không có transcript)'
    ])
    expect(buildSummaryPrompt(input)).toContain('đừng suy đoán')
    expect(
      buildSummaryPrompt({ incoming, outgoing: [], meetingContext: '', language: 'vi' })
    ).not.toContain('TẠM DỪNG DỊCH')
  })

  it('clock wall: giờ máy HH:MM, đánh dấu dòng tạm dừng', () => {
    const t0 = new Date(2026, 10, 6, 14, 30, 0).getTime()
    const lines = transcriptLines(
      {
        incoming: {
          startedAt: t0,
          endedAt: t0 + 3_600_000,
          segments: [
            seg(t0 + 60_000, 'はい', 'Vâng'),
            { ...seg(t0 + 120_000, '', ''), pauseEndedAt: t0 + 180_000 }
          ]
        },
        outgoing: []
      },
      { clock: 'wall' }
    )
    expect(lines.map((l) => [l.text, l.pause])).toEqual([
      ['[14:31] Meeting: はい (dịch: Vâng)', false],
      ['[14:32] (TẠM DỪNG DỊCH 1 phút — đoạn này không có transcript)', true]
    ])
  })

  it('prompt chứa ngữ cảnh + ngôn ngữ đầu ra', () => {
    const p = buildSummaryPrompt({
      incoming,
      outgoing: [],
      meetingContext: 'Dự án ABC',
      language: 'en'
    })
    expect(p).toContain('Dự án ABC')
    expect(p).toContain('Tiếng Anh')
    expect(p).toContain('## Việc cần làm')
  })
})

describe('SummaryService', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ltc-summary-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('ghi file _tom-tat.md cạnh transcript và lưu vào lịch sử', async () => {
    const id = '2026-10-13_10-00-00_chieu-ve'
    const history = new HistoryStore(join(dir, 'history'))
    const transcriptFile = join(dir, `${id}.txt`)
    history.upsert({ ...rec(id, 'incoming', 0, 1, [seg(0, 'a', 'b')]), transcriptFile })
    const generate = vi.fn(async () => ({
      text: '## Tóm tắt\n- ok',
      usage: { inputTokens: 1_000_000, outputTokens: 100_000 }
    }))
    const onCost = vi.fn()
    const settings: AppSettings = { ...DEFAULT_SETTINGS, summaryModel: 'm-test' }
    const svc = new SummaryService({
      history,
      getApiKey: () => 'k',
      getSettings: () => settings,
      fallbackDir: () => dir,
      onCost,
      generate
    })
    const statuses: string[] = []
    svc.on('status', (s: { state: string }) => statuses.push(s.state))
    const result = await svc.summarize(id)
    expect(result.ok).toBe(true)
    expect(generate).toHaveBeenCalledWith('k', 'm-test', expect.any(String), 'v1beta')
    expect(statuses).toEqual(['running', 'done'])
    // 1M input × $1.5 + 0.1M output × $7.5
    expect(onCost).toHaveBeenCalledWith(expect.closeTo(2.25, 6))
    const saved = history.get(id)
    expect(saved?.summary).toContain('ok')
    expect(saved?.summaryFile).toBe(join(dir, `${id}_tom-tat.md`))
    expect(readFileSync(saved!.summaryFile!, 'utf-8')).toContain('## Tóm tắt')
  })

  it('model trả về rỗng → lỗi, nhưng vẫn ghi chi phí', async () => {
    const history = new HistoryStore(join(dir, 'history'))
    history.upsert(rec('e', 'incoming', 0, 1, [seg(0, 'a', 'b')]))
    const onCost = vi.fn()
    const svc = new SummaryService({
      history,
      getApiKey: () => 'k',
      getSettings: () => DEFAULT_SETTINGS,
      fallbackDir: () => dir,
      onCost,
      generate: async () => ({ text: '', usage: { inputTokens: 2000, outputTokens: 0 } })
    })
    const result = await svc.summarize('e')
    expect(result).toEqual({ ok: false, error: 'Model không trả về nội dung tóm tắt' })
    expect(onCost).toHaveBeenCalledWith(expect.closeTo(0.003, 9))
    expect(history.get('e')?.summary).toBeUndefined()
  })

  it('lỗi model → status error, không ghi summary', async () => {
    const history = new HistoryStore(join(dir, 'history'))
    history.upsert(rec('x', 'incoming', 0, 1, [seg(0, 'a', 'b')]))
    const svc = new SummaryService({
      history,
      getApiKey: () => 'k',
      getSettings: () => DEFAULT_SETTINGS,
      fallbackDir: () => dir,
      generate: async () => {
        throw new Error('quota')
      }
    })
    const result = await svc.summarize('x')
    expect(result).toEqual({ ok: false, error: 'quota' })
    expect(history.get('x')?.summary).toBeUndefined()
  })

  it('đang chạy: gọi thường bị từ chối; queueIfRunning → chạy thêm 1 lượt sau khi xong', async () => {
    const history = new HistoryStore(join(dir, 'history'))
    history.upsert(rec('q', 'incoming', 0, 1, [seg(0, 'a', 'b')]))
    let release: () => void = () => {}
    const generate = vi.fn(
      () =>
        new Promise<FlashResult>((resolve) => {
          release = () => resolve({ text: 'ok', usage: { inputTokens: 0, outputTokens: 0 } })
        })
    )
    const svc = new SummaryService({
      history,
      getApiKey: () => 'k',
      getSettings: () => DEFAULT_SETTINGS,
      fallbackDir: () => dir,
      generate
    })
    const statuses: string[] = []
    svc.on('status', (s: { state: string }) => statuses.push(s.state))

    const first = svc.summarize('q')
    expect(await svc.summarize('q')).toEqual({ ok: false, error: 'Đang tóm tắt phiên này' })
    expect(await svc.summarize('q', { queueIfRunning: true })).toEqual({ ok: true })
    expect(await svc.summarize('q', { queueIfRunning: true })).toEqual({ ok: true }) // gộp 1 lượt

    release()
    await first
    expect(generate).toHaveBeenCalledTimes(2) // lượt xếp hàng đã bắt đầu
    release()
    await vi.waitFor(() => expect(statuses).toEqual(['running', 'done', 'running', 'done']))
    expect(generate).toHaveBeenCalledTimes(2)
  })
})
