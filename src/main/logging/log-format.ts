// Định dạng dòng log + che bí mật. Hàm thuần, dùng cho cả file log lẫn bản chẩn đoán.

export type LogLevel = 'info' | 'warn' | 'error'

const REDACTED = '[đã che]'

// Lỗi mạng của SDK hay kèm nguyên URL/headers → key có thể lọt vào message.
// Che theo hình dạng, không cần biết key thật là gì.
const SECRET_PATTERNS: [RegExp, string][] = [
  // Google API key
  [/AIza[0-9A-Za-z_-]{20,}/g, REDACTED],
  // ?key=… / &access_token=… trong URL
  [/([?&](?:key|api_key|apikey|access_token|token)=)[^&\s"'<>]+/gi, `$1${REDACTED}`],
  // header: x-goog-api-key: … / "authorization": "Bearer …"
  [/((?:x-goog-api-key|authorization|api[-_]?key)["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^\s"',}]+/gi, `$1${REDACTED}`],
  [/(Bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/g, `$1${REDACTED}`]
]

export function redactSecrets(text: string): string {
  let out = text
  for (const [re, to] of SECRET_PATTERNS) out = out.replace(re, to)
  return out
}

const MAX_ARG_CHARS = 2000

function clip(text: string): string {
  return text.length > MAX_ARG_CHARS ? `${text.slice(0, MAX_ARG_CHARS)}… (+${text.length - MAX_ARG_CHARS} ký tự)` : text
}

export function formatLogArg(arg: unknown): string {
  if (typeof arg === 'string') return clip(arg)
  if (arg instanceof Error) return clip(arg.stack || `${arg.name}: ${arg.message}`)
  if (arg === undefined) return 'undefined'
  try {
    return clip(JSON.stringify(arg) ?? String(arg))
  } catch {
    return clip(String(arg))
  }
}

// "2026-11-13T09:15:02.123Z [error] nội dung" — xuống dòng trong nội dung được thụt vào để
// mỗi mục log vẫn bắt đầu bằng mốc thời gian (dễ cắt N mục cuối)
export function formatLogLine(date: Date, level: LogLevel, args: unknown[]): string {
  const body = redactSecrets(args.map(formatLogArg).join(' ')).replace(/\r?\n/g, '\n    ')
  return `${date.toISOString()} [${level}] ${body}`
}
