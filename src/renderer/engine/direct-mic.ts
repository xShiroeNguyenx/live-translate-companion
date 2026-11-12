import type { PcmPlayer } from './playback'

// "Nói thẳng": micro thật → player CABLE (không qua main, không dịch) để meeting nghe giọng bạn
// trong khi micro của Meet/Zoom vẫn là CABLE Output. Dùng luồng getUserMedia riêng, không đụng
// tới luồng thu của phiên dịch chiều đi.
export class DirectMic {
  private stream: MediaStream | null = null
  private detach: (() => void) | null = null

  get running(): boolean {
    return this.stream !== null
  }

  async start(deviceId: string, player: PcmPlayer, onLost: (reason: string) => void): Promise<void> {
    if (this.running) return
    // lọc tiếng vọng/ồn như một app họp: loa ngoài đang phát tiếng meeting không dội ngược vào
    const audio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
    if (deviceId) audio.deviceId = { exact: deviceId }

    const stream = await navigator.mediaDevices.getUserMedia({ audio })
    const track = stream.getAudioTracks()[0]
    if (!track) {
      stream.getTracks().forEach((t) => t.stop())
      throw new Error('Không lấy được tín hiệu từ micro')
    }
    // rút micro / Windows thu hồi: track kết thúc mà không có lỗi nào ném ra → phải tự báo
    track.addEventListener('ended', () => {
      if (this.stream !== stream) return
      this.stop()
      onLost('Micro đã ngắt kết nối')
    })

    this.stream = stream
    this.detach = player.attachStream(stream)
  }

  stop(): void {
    this.detach?.()
    this.detach = null
    const stream = this.stream
    this.stream = null
    stream?.getTracks().forEach((t) => t.stop())
  }
}
