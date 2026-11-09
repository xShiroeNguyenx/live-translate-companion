import { describe, expect, it } from 'vitest'
import { normalizeServerMessage } from './client'
import { buildTranscribeSetup } from './transcribe-client'

describe('transcribe-client', () => {
  it('setup đúng như bản đã kiểm chứng: chỉ TEXT, tự nhận ngôn ngữ, không translationConfig', () => {
    const setup = buildTranscribeSetup()
    expect(setup).toEqual({
      model: 'models/gemini-3.5-transcribe-live',
      generationConfig: { responseModalities: ['TEXT'] },
      inputAudioTranscription: { languageCodes: [] }
    })
  })

  it('normalizeServerMessage đọc interim + final của model chép lời, bỏ qua voiceActivity', () => {
    expect(
      normalizeServerMessage({
        serverContent: { interimInputTranscription: { text: 'Good morning' } }
      } as never)
    ).toEqual({ interimInputTranscription: 'Good morning' })
    expect(
      normalizeServerMessage({
        serverContent: { inputTranscription: { text: 'Good morning everyone.' } }
      } as never)
    ).toEqual({ inputTranscription: 'Good morning everyone.' })
    expect(normalizeServerMessage({ voiceActivity: { type: 'START' } } as never)).toEqual({})
  })
})
