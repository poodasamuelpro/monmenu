import { defineConfig } from 'vite'
import build from '@hono/vite-build/cloudflare-workers'

export default defineConfig({
  plugins: [
    build({
      entry: 'src/index.tsx'
    })
  ],
  server: {
    port: 5173
  }
})