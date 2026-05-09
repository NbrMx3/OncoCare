import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['oncocare_ai_logo.svg'],
      manifest: {
        name: 'OncoCare AI',
        short_name: 'OncoCare',
        description: 'OncoCare cancer patient management and risk monitoring platform',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#061f3f',
        theme_color: '#0b2c52',
        icons: [
          {
            src: '/oncocare_ai_logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: {
    proxy: {
      // Route all API calls through the local gateway.
      // The gateway then forwards requests to each module service.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
