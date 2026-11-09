// Định dạng câu trả lời của trợ lý để hiển thị: gạch đầu dòng → danh sách, "(lúc 16:08, 16:09)"
// → nhãn giờ. Model được dặn viết văn bản thuần nhưng đôi khi vẫn chèn **đậm** → bỏ dấu.

export type AnswerPart = { kind: 'text'; text: string } | { kind: 'time'; time: string }

export interface AnswerListItem {
  // 1 = gạch đầu dòng con (thụt lề)
  level: 0 | 1
  parts: AnswerPart[]
}

export type AnswerBlock =
  | { kind: 'para'; parts: AnswerPart[] }
  | { kind: 'list'; items: AnswerListItem[] }

const BULLET = /^([ \t]*)(?:[-*•]|\d+[.)])\s+/
// "(lúc 14:32)", "(lúc 16:08, 16:09)", "(lúc 16:05–16:07)"
const TIME_REF = /\s*\((?:lúc|at)\s+([^()]*?\d{1,2}:\d{2}[^()]*)\)/gi
const CLOCK = /\d{1,2}:\d{2}/g

function clean(line: string): string {
  return line.replace(/\*\*/g, '')
}

export function splitTimeRefs(line: string): AnswerPart[] {
  const parts: AnswerPart[] = []
  let last = 0
  for (const m of line.matchAll(TIME_REF)) {
    const before = line.slice(last, m.index)
    if (before) parts.push({ kind: 'text', text: before })
    for (const time of m[1].match(CLOCK) ?? []) parts.push({ kind: 'time', time })
    last = (m.index ?? 0) + m[0].length
  }
  const rest = line.slice(last)
  if (rest) parts.push({ kind: 'text', text: rest })
  return parts
}

export function parseAnswer(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = []
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = clean(raw)
    // dòng trống không cắt danh sách (model hay để trống giữa các gạch đầu dòng)
    if (!line.trim()) continue
    const bullet = BULLET.exec(line)
    if (bullet) {
      const indent = bullet[1].replace(/\t/g, '  ').length
      const item: AnswerListItem = {
        level: indent >= 2 ? 1 : 0,
        parts: splitTimeRefs(line.slice(bullet[0].length).trim())
      }
      const prev = blocks[blocks.length - 1]
      if (prev?.kind === 'list') prev.items.push(item)
      else blocks.push({ kind: 'list', items: [item] })
    } else {
      blocks.push({ kind: 'para', parts: splitTimeRefs(line.trim()) })
    }
  }
  return blocks
}

// 1 dòng tóm lược khi lượt hỏi đáp đang thu gọn: dòng có chữ đầu tiên, bỏ gạch đầu dòng + giờ
export function answerPreview(text: string, maxChars = 160): string {
  const first = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => clean(l).replace(BULLET, '').replace(TIME_REF, '').replace(/\s+/g, ' ').trim())
    .find(Boolean)
  if (!first) return ''
  return first.length > maxChars ? `${first.slice(0, maxChars)}…` : first
}
