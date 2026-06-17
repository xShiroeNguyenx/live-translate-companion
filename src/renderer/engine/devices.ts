import type { AudioInputDeviceInfo, AudioOutputDeviceInfo } from '../../shared/types'

export const DEFAULT_ALIAS_IDS = ['', 'default', 'communications']

// Loopback của Electron trên Windows thu thiết bị render MẶC ĐỊNH. Mọi sink trỏ về đúng
// thiết bị vật lý đó (kể cả qua alias default/communications) đều bị thu ngược → vọng vô tận.
export function isCapturedDevice(
  device: MediaDeviceInfo,
  defaultDevice: MediaDeviceInfo | undefined
): boolean {
  if (DEFAULT_ALIAS_IDS.includes(device.deviceId)) return true
  if (!defaultDevice) return true // không xác định được thiết bị mặc định → coi như rủi ro
  if (defaultDevice.groupId && device.groupId && defaultDevice.groupId === device.groupId) {
    return true
  }
  // Chromium đặt label alias dạng "Default - <label thiết bị thật>"
  return Boolean(device.label) && defaultDevice.label.endsWith(device.label)
}

// Phải enumerate ngay trong engine window: deviceId bị salt theo từng document,
// id lấy từ cửa sổ khác sẽ không setSinkId được ở đây.
export async function listOutputDevices(): Promise<AudioOutputDeviceInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices()
  const outputs = all.filter((d) => d.kind === 'audiooutput')
  const defaultDevice = outputs.find((d) => d.deviceId === 'default')
  return outputs.map((d, i) => ({
    deviceId: d.deviceId,
    label: d.label || `Thiết bị phát ${i + 1}`,
    isCaptured: isCapturedDevice(d, defaultDevice)
  }))
}

// Mic cho chiều đi. Bỏ alias default/communications để dropdown không trùng lặp;
// label trống khi chưa được cấp quyền micro (Chromium giấu cho tới lần getUserMedia đầu).
export async function listInputDevices(): Promise<AudioInputDeviceInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices()
  return all
    .filter((d) => d.kind === 'audioinput' && !DEFAULT_ALIAS_IDS.includes(d.deviceId))
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Micro ${i + 1}` }))
}
