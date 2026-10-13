import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, HistoryRecord, SubtitleSegment } from '../../shared/types'
import { HistoryStore } from '../history/history-store'
import { DEFAULT_SETTINGS } from '../settings'
import { buildSummaryPrompt, mergeTranscript } from './summarizer'
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
    const text = mergeTranscript({ incoming, outgoing: [outgoing], meetingContext: '', language: 'vi' })
    expect(text.split('\n')).toEqual([
      '[00:00:01] Meeting: こんにちは (dịch: Xin chào)',
      '[00:00:30] Tôi: Tôi đồng ý (dịch: 賛成です)',
      '[00:01:00] Meeting: 納期は金曜日 (dịch: Hạn là thứ 6)'
    ])
  })

  it('prompt chứa ngữ cảnh + ngôn ngữ đầu ra', () => {
    const p = buildSummaryPrompt({
      incoming,
      outgoing: [],
      meetingContext: 'Dự án Webike',
      language: 'en'
    })
    expect(p).toContain('Dự án Webike')
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
    const generate = vi.fn(async () => '## Tóm tắt\n- ok')
    const settings: AppSettings = { ...DEFAULT_SETTINGS, summaryModel: 'm-test' }
    const svc = new SummaryService({
      history,
      getApiKey: () => 'k',
      getSettings: () => settings,
      fallbackDir: () => dir,
      generate
    })
    const statuses: string[] = []
    svc.on('status', (s: { state: string }) => statuses.push(s.state))
    const result = await svc.summarize(id)
    expect(result.ok).toBe(true)
    expect(generate).toHaveBeenCalledWith('k', 'm-test', expect.any(String))
    expect(statuses).toEqual(['running', 'done'])
    const saved = history.get(id)
    expect(saved?.summary).toContain('ok')
    expect(saved?.summaryFile).toBe(join(dir, `${id}_tom-tat.md`))
    expect(readFileSync(saved!.summaryFile!, 'utf-8')).toContain('## Tóm tắt')
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
})
