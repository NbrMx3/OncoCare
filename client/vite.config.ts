import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/auth': {
        target: 'http://localhost:5101',
        changeOrigin: true,
      },
      '/api/login': {
        target: 'http://localhost:5101',
        changeOrigin: true,
        rewrite: () => '/api/auth/login',
      },
      '/api/register': {
        target: 'http://localhost:5101',
        changeOrigin: true,
        rewrite: () => '/api/auth/register',
      },
      '/api/patients': {
        target: 'http://localhost:5102',
        changeOrigin: true,
      },
      '/api/monitoring': {
        target: 'http://localhost:5104',
        changeOrigin: true,
      },
    },
  },
})
