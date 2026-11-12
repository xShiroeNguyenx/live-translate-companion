import type { PlaybackSinkState } from './types'

// Đầu phát của VB-Audio Virtual Cable: "CABLE Input" và biến thể 16 kênh "CABLE In 16ch".
// Âm thanh phát vào đây đi ra "CABLE Output" — micro mà Meet/Zoom đang chọn.
const VIRTUAL_MIC_RE = /CABLE In(put\b|\s*16ch)/i

export function isVirtualCable(label: string): boolean {
  return VIRTUAL_MIC_RE.test(label)
}

// "Nói thẳng" đưa micro thật vào thiết bị "Phát vào". Trả về lý do KHÔNG được bật, null = bật được.
// Chặn thiết bị không phải mic ảo: micro → loa thật là vòng hú, và cả phòng nghe thấy.
export function directMicBlocker(sink: PlaybackSinkState): string | null {
  if (!sink.ok) {
    return `Không mở được thiết bị “Phát vào”${sink.error ? ` (${sink.error})` : ''}. Chọn lại ở Cài đặt → Chiều đi.`
  }
  if (!isVirtualCable(sink.label)) {
    return `“Phát vào” đang là “${sink.label || 'thiết bị mặc định'}”, không phải mic ảo. Nói thẳng vào loa thật sẽ gây hú, nên app không bật. Chọn “CABLE Input” ở Cài đặt → Chiều đi.`
  }
  return null
}
