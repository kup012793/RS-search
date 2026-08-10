import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/usp': {
        target: 'https://store.usp.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/usp/, '/ccstore/v1'),
      },
      '/api/ep': {
        target: 'https://crs.edqm.eu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ep/, ''),
      },
      '/api/bp': {
        target: 'https://www.pharmacopoeia.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bp/, ''),
      },
      '/api/fx': {
        target: 'https://api.frankfurter.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fx/, ''),
      },
    },
  },
})
