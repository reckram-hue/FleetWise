import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    host: '0.0.0.0',  // Bind to all network interfaces
    port: 5173,        // Explicit stable port
    proxy: {
      // Proxy all /api requests to backend
      '/api': {
        target: 'http://localhost:5174',
        changeOrigin: true,
      },
      // Health check proxy
      '/health': {
        target: 'http://localhost:5174',
        changeOrigin: true,
      }
    }
  }
})
