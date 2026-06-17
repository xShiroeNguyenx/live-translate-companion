// Render resources/icon.svg -> resources/icon.png (512x512, nền trong suốt) bằng Chromium của Electron.
// Chạy: npx electron scripts/render-icon.mjs  (nhớ xoá ELECTRON_RUN_AS_NODE nếu có)
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const svg = readFileSync(join(root, 'resources', 'icon.svg'), 'utf-8')
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    svg{display:block}
  </style></head><body>${svg}</body></html>`

  const win = new BrowserWindow({
    show: false,
    width: 512,
    height: 512,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true }
  })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 800)) // chờ font render xong

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  const png = image.resize({ width: 512, height: 512 }).toPNG()
  writeFileSync(join(root, 'resources', 'icon.png'), png)
  console.log(`Đã ghi resources/icon.png (${png.length} bytes)`)
  app.quit()
})
