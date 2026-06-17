import { BrowserWindow, desktopCapturer, screen, session } from 'electron'
import { join } from 'node:path'
import appIcon from '../../resources/icon.png?asset'

const devUrl = process.env['ELECTRON_RENDERER_URL']

function load(win: BrowserWindow, page: 'control' | 'overlay' | 'engine'): void {
  if (devUrl) void win.loadURL(`${devUrl}/${page}/index.html`)
  else void win.loadFile(join(__dirname, `../renderer/${page}/index.html`))
}

function preloadPath(name: string): string {
  return join(__dirname, `../preload/${name}.js`)
}

export function installLoopbackHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then(
        (sources) => callback({ video: sources[0], audio: 'loopback' }),
        () => callback({} as Electron.Streams)
      )
    },
    { useSystemPicker: false }
  )

  // getUserMedia (mic chiều đi) bị chặn nếu không cấp quyền 'media' — tool cá nhân, grant thẳng
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media')
}

export function createControlWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 540,
    height: 800,
    minWidth: 460,
    minHeight: 620,
    title: 'Live Translate Companion',
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath('control'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  load(win, 'control')
  return win
}

export function createOverlayWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.min(960, Math.floor(workArea.width * 0.7))
  const height = 210
  const win = new BrowserWindow({
    width,
    height,
    x: workArea.x + Math.floor((workArea.width - width) / 2),
    y: workArea.y + workArea.height - height - 60,
    frame: false,
    transparent: true,
    resizable: true,
    hasShadow: false,
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: preloadPath('overlay'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  load(win, 'overlay')
  return win
}

export function createEngineWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 120,
    height: 120,
    skipTaskbar: true,
    webPreferences: {
      preload: preloadPath('engine'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  load(win, 'engine')
  return win
}

// executeJavaScript với userGesture=true để getDisplayMedia không bị chặn vì thiếu user activation
export async function startEngineCapture(win: BrowserWindow): Promise<void> {
  await win.webContents.executeJavaScript(
    'window.__startCapture ? window.__startCapture() : Promise.reject(new Error("Engine chưa sẵn sàng"))',
    true
  )
}

export async function stopEngineCapture(win: BrowserWindow): Promise<void> {
  await win.webContents.executeJavaScript('window.__stopCapture ? window.__stopCapture() : undefined', true)
}

export async function startEngineMic(win: BrowserWindow, deviceId: string): Promise<void> {
  const arg = JSON.stringify(deviceId)
  await win.webContents.executeJavaScript(
    `window.__startMic ? window.__startMic(${arg}) : Promise.reject(new Error("Engine chưa sẵn sàng"))`,
    true
  )
}

export async function stopEngineMic(win: BrowserWindow): Promise<void> {
  await win.webContents.executeJavaScript('window.__stopMic ? window.__stopMic() : undefined', true)
}
