import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          control: resolve(__dirname, 'src/preload/control.ts'),
          overlay: resolve(__dirname, 'src/preload/overlay.ts'),
          engine: resolve(__dirname, 'src/preload/engine.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          control: resolve(__dirname, 'src/renderer/control/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay/index.html'),
          engine: resolve(__dirname, 'src/renderer/engine/index.html')
        }
      }
    }
  }
})
