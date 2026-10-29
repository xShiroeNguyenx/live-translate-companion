import { describe, expect, it } from 'vitest'
import {
  DEFAULT_API_VERSION,
  liveWsUrl,
  normalizeApiVersion,
  normalizeLiveModel,
  pickLiveModels
} from './gemini-api'

describe('normalizeApiVersion', () => {
  it('giữ version hợp lệ', () => {
    expect(normalizeApiVersion('v1alpha')).toBe('v1alpha')
    expect(normalizeApiVersion('v1beta')).toBe('v1beta')
  })

  it('giá trị lạ hoặc thiếu → mặc định', () => {
    expect(normalizeApiVersion('v1')).toBe(DEFAULT_API_VERSION)
    expect(normalizeApiVersion(undefined)).toBe(DEFAULT_API_VERSION)
    expect(normalizeApiVersion(42)).toBe(DEFAULT_API_VERSION)
  })
})

describe('normalizeLiveModel', () => {
  it('thêm tiền tố models/ khi thiếu', () => {
    expect(normalizeLiveModel('gemini-x-preview')).toBe('models/gemini-x-preview')
  })

  it('không nhân đôi tiền tố, cắt khoảng trắng', () => {
    expect(normalizeLiveModel('  models/gemini-x  ')).toBe('models/gemini-x')
  })

  it('rỗng → model mặc định', () => {
    expect(normalizeLiveModel('')).toBe('models/gemini-3.5-live-translate-preview')
    expect(normalizeLiveModel('models/')).toBe('models/gemini-3.5-live-translate-preview')
    expect(normalizeLiveModel(undefined)).toBe('models/gemini-3.5-live-translate-preview')
  })
})

describe('pickLiveModels', () => {
  it('chỉ giữ model dịch hỗ trợ Live, bỏ tiền tố, sắp theo tên', () => {
    const result = pickLiveModels([
      { name: 'models/gemini-flash-latest', supportedActions: ['generateContent'] },
      { name: 'models/gemini-3.8-live', supportedActions: ['bidiGenerateContent'] },
      { name: 'models/gemini-3.5-transcribe-live', supportedActions: ['bidiGenerateContent'] },
      {
        name: 'models/gemini-y-live-translate',
        displayName: 'Translate Y',
        supportedActions: ['bidiGenerateContent', 'countTokens']
      },
      { name: 'models/gemini-x-live-translate', supportedActions: ['bidiGenerateContent'] },
      // có chữ translate nhưng không chạy được Live
      { name: 'models/gemini-text-translate', supportedActions: ['generateContent'] },
      { displayName: 'không tên', supportedActions: ['bidiGenerateContent'] }
    ])
    expect(result).toEqual([
      { id: 'gemini-x-live-translate', displayName: 'gemini-x-live-translate' },
      { id: 'gemini-y-live-translate', displayName: 'Translate Y' }
    ])
  })

  it('bỏ trùng lặp, danh sách rỗng khi không có model dịch', () => {
    const dup = { name: 'models/m-translate', supportedActions: ['bidiGenerateContent'] }
    expect(pickLiveModels([dup, dup])).toHaveLength(1)
    expect(pickLiveModels([{ name: 'models/gemini-3.8-live', supportedActions: ['bidiGenerateContent'] }])).toEqual([])
  })
})

describe('liveWsUrl', () => {
  it('ghép version vào đường dẫn BidiGenerateContent', () => {
    expect(liveWsUrl('v1alpha')).toBe(
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'
    )
  })
})
