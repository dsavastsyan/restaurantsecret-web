import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const distDir = resolve('dist')
const source = resolve(distDir, 'index.html')
const spaRoutes = [
  'legal/ios/privacy',
  'legal/ios/terms',
  'partners',
  'partners/login',
  'partners/dashboard',
  'partners/upload',
  'partners/photos',
  'admin',
  'admin/login',
  'admin/menu-revisions',
  'admin/restaurant-reviews',
  // City catalog pages (/catalog/:city) are NOT listed here — generate-sitemap.js
  // writes a fully prerendered entrypoint for each real city (title/H1/meta,
  // not just the bare SPA shell), and runs after this script in `npm run build`.
]

await Promise.all(
  spaRoutes.map(async (route) => {
    const routeDir = resolve(distDir, route)
    await mkdir(routeDir, { recursive: true })
    await copyFile(source, resolve(routeDir, 'index.html'))
  }),
)

console.log(`Generated ${spaRoutes.length} portal SPA entrypoints`)
