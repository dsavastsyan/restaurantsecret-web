// Vite configuration that adds React plugin support and a convenient `@` alias
// for importing files from the src directory.
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const cloudflarePagesBranch = process.env.CF_PAGES_BRANCH
const isCloudflarePagesPreview = Boolean(
  cloudflarePagesBranch && !['main', 'master'].includes(cloudflarePagesBranch)
)

// PR previews must never inherit production endpoints from the Pages project.
if (isCloudflarePagesPreview) {
  const stagingApi = 'https://restaurantsecret-api-staging.dsavastyan.workers.dev'
  const stagingPdApi = 'https://staging-pd.restaurantsecret.ru'
  process.env.VITE_API_BASE_URL = stagingApi
  process.env.VITE_API_BASE = stagingApi
  process.env.VITE_API_URL = stagingApi
  process.env.VITE_PD_API_BASE = stagingPdApi
  process.env.VITE_DEPLOY_ENV = 'preview'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
}

export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
