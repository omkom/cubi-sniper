import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: parseInt(process.env.UI_PORT || '3000'),
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
  define: {
    'process.env.API_BASE': JSON.stringify(process.env.VITE_API_BASE || 'http://localhost:4000'),
    'process.env.WS_BASE': JSON.stringify(process.env.VITE_WS_BASE || 'ws://localhost:3010'),
  },
})