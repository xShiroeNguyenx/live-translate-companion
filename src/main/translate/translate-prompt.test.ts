import { describe, expect, it } from 'vitest'
import {
  buildTranslatePrompt,
  buildTypedSpeechPrompt,
  englishLanguageName
} from './translate-prompt'

describe('translate-prompt', () => {
  it('tên ngôn ngữ tiếng Anh từ mã BCP-47; mã lạ giữ nguyên', () => {
    expect(englishLanguageName('vi')).toBe('Vietnamese')
    expect(englishLanguageName('ja')).toBe('Japanese')
    expect(englishLanguageName('not a code!')).toBe('not a code!')
  })

  it('có câu cần dịch, ngôn ngữ đích, ngữ cảnh và các câu trước', () => {
    const p = buildTranslatePrompt({
      text: '  Could you send the estimate?  ',
      previous: ['Second, the budget.', '  '],
      context: 'Tanaka-san → anh Tanaka',
      targetLanguage: 'vi'
    })
    expect(p).toContain('into Vietnamese (vi)')
    expect(p).toContain('NEW segment:\nCould you send the estimate?')
    expect(p).toContain('Previous segments (context only, do not translate):\nSecond, the budget.')
    expect(p).toContain('Meeting context and glossary:\nTanaka-san → anh Tanaka')
    // câu hỏi trong cuộc họp phải được dịch, không được trả lời
    expect(p).toContain('Never answer')
    // câu NEW nằm cuối để model không nhầm với ngữ cảnh
    expect(p.trimEnd().endsWith('Could you send the estimate?')).toBe(true)
  })

  it('không có ngữ cảnh / câu trước → bỏ hẳn các khối đó', () => {
    const p = buildTranslatePrompt({ text: 'Hi', previous: [], context: '  ', targetLanguage: 'ja' })
    expect(p).not.toContain('Meeting context')
    expect(p).not.toContain('Previous segments')
    expect(p).toContain('into Japanese (ja)')
  })

  it('“Gõ để nói”: dịch để ĐỌC LÊN — lịch sự, câu trơn, không trả lời thay', () => {
    const p = buildTypedSpeechPrompt({
      text: '  Bên em gửi báo giá trước thứ 6 được không?  ',
      context: 'Sakura = tên dự án',
      targetLanguage: 'ja'
    })
    expect(p).toContain('into Japanese (ja)')
    expect(p).toContain('read aloud')
    expect(p).toContain('です/ます')
    expect(p).toContain('no markdown')
    expect(p).toContain('Never answer')
    expect(p).toContain('Meeting context and glossary:\nSakura = tên dự án')
    expect(p.trimEnd().endsWith('MESSAGE:\nBên em gửi báo giá trước thứ 6 được không?')).toBe(true)
    expect(buildTypedSpeechPrompt({ text: 'Hi', targetLanguage: 'en' })).not.toContain(
      'Meeting context'
    )
  })

  it('ngữ cảnh quá dài bị cắt', () => {
    const p = buildTranslatePrompt({
      text: 'Hi',
      previous: [],
      context: 'x'.repeat(5000),
      targetLanguage: 'vi'
    })
    expect(p.length).toBeLessThan(3000)
  })
})
