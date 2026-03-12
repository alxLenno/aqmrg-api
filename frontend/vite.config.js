import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    hmr: {
      host: 'goshawk-possible-humpback.ngrok-free.app',
      clientPort: 443,
      protocol: 'wss',
    },
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'https://aqmrg.pythonanywhere.com',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/health': {
        target: process.env.VITE_PROXY_TARGET || 'https://aqmrg.pythonanywhere.com',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
})