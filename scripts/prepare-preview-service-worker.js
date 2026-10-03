import { copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

if (process.env.VITE_DEPLOY_ENV !== 'preview') {
  throw new Error('Refusing to replace the service worker outside a preview build')
}

const previewWorker = fileURLToPath(new URL('../public/service-worker-preview.js', import.meta.url))
const builtWorker = fileURLToPath(new URL('../dist/service-worker.js', import.meta.url))

await copyFile(previewWorker, builtWorker)

console.log('Installed preview service worker retirement script in dist/service-worker.js')
