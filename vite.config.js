// Vite configuration that adds React plugin support and a convenient `@` alias
// for importing files from the src directory.
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

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

// Uploading source maps needs an org-scoped auth token (SENTRY_AUTH_TOKEN,
// kept as a GitHub Actions secret, never committed). Local/dev builds and any
// CI run without that secret (e.g. a fork PR) just skip the upload — the
// build itself must never fail because this token happens to be missing.
const canUploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN)

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    canUploadSourceMaps && sentryVitePlugin({
      org: 'restaurantsecret',
      project: 'javascript-react',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        filesToDeleteAfterUpload: ['dist/**/*.js.map'],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    // 'hidden' emits .map files for Sentry to upload without referencing them
    // from the shipped JS, so the public bundle never exposes original source.
    sourcemap: canUploadSourceMaps ? 'hidden' : false
  }
})
