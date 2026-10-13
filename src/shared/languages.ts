export interface LanguageOption {
  code: string
  label: string
}

// Ngôn ngữ đích cho translationConfig (BCP-47). Ngôn ngữ nguồn model tự nhận diện.
export const LANGUAGES: LanguageOption[] = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'Tiếng Anh' },
  { code: 'ja', label: 'Tiếng Nhật' },
  { code: 'ko', label: 'Tiếng Hàn' },
  { code: 'zh', label: 'Tiếng Trung' },
  { code: 'th', label: 'Tiếng Thái' },
  { code: 'id', label: 'Tiếng Indonesia' },
  { code: 'fr', label: 'Tiếng Pháp' },
  { code: 'de', label: 'Tiếng Đức' },
  { code: 'es', label: 'Tiếng Tây Ban Nha' }
]

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code
}

// "Tiếng Việt" → "Việt" cho nhãn ngắn
export function languageShort(code: string): string {
  return languageLabel(code).replace(/^Tiếng\s+/, '')
}
