import { Menu, nativeImage, Tray } from 'electron'
import appIcon from '../../resources/icon.png?asset'
import { INCOMING_TOGGLE_SHORTCUT, OUTGOING_PTT_SHORTCUT } from '../shared/constants'

export interface TrayState {
  incomingRunning: boolean
  outgoingRunning: boolean
  overlayVisible: boolean
}

export interface TrayActions {
  showWindow(): void
  toggleIncoming(): void
  toggleOutgoing(): void
  toggleOverlay(): void
  quit(): void
}

function accel(a: string): string {
  return a.replace('CommandOrControl', 'Ctrl')
}

export class AppTray {
  private tray: Tray

  constructor(
    private getState: () => TrayState,
    private actions: TrayActions
  ) {
    const icon = nativeImage.createFromPath(appIcon).resize({ width: 16, height: 16 })
    this.tray = new Tray(icon)
    this.tray.on('click', () => actions.showWindow())
    this.refresh()
  }

  refresh(): void {
    const s = this.getState()
    this.tray.setToolTip(
      `Live Translate — chiều về: ${s.incomingRunning ? 'đang chạy' : 'tắt'}, chiều đi: ${
        s.outgoingRunning ? 'đang chạy' : 'tắt'
      }`
    )
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Mở cửa sổ', click: () => this.actions.showWindow() },
        { type: 'separator' },
        {
          label: s.incomingRunning ? '■ Dừng dịch (chiều về)' : '▶ Bắt đầu dịch (chiều về)',
          accelerator: accel(INCOMING_TOGGLE_SHORTCUT),
          registerAccelerator: false,
          click: () => this.actions.toggleIncoming()
        },
        {
          label: s.outgoingRunning ? '■ Tắt chiều đi' : '▶ Bật chiều đi',
          click: () => this.actions.toggleOutgoing()
        },
        {
          label: `PTT chiều đi: ${accel(OUTGOING_PTT_SHORTCUT)}`,
          enabled: false
        },
        {
          label: 'Hiện overlay phụ đề',
          type: 'checkbox',
          checked: s.overlayVisible,
          click: () => this.actions.toggleOverlay()
        },
        { type: 'separator' },
        { label: 'Thoát', click: () => this.actions.quit() }
      ])
    )
  }

  balloon(title: string, content: string): void {
    this.tray.displayBalloon({ title, content, iconType: 'info' })
  }

  destroy(): void {
    this.tray.destroy()
  }
}
