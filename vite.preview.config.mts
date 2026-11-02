import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Renderer-only dev server for browser-pane testing (no Electron). window.api must be mocked.
export default defineConfig({ root: resolve('src/renderer'), plugins: [react()], optimizeDeps: { exclude: ['mupdf'] }, build: { target: 'esnext' }, server: { port: 5199, strictPort: true } })
