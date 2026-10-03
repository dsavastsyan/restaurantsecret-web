import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const builtWorker = fileURLToPath(new URL('../dist/service-worker.js', import.meta.url))
const buildId = (process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.VITE_APP_RELEASE || 'local')
  .replace(/[^a-zA-Z0-9_-]/g, '-')

const source = await readFile(builtWorker, 'utf8')
const token = '__SERVICE_WORKER_BUILD_ID__'

if (!source.includes(token)) {
  throw new Error(`Expected ${token} in ${builtWorker}`)
}

await writeFile(builtWorker, source.replaceAll(token, buildId))
console.log(`Stamped service worker cache with build ${buildId}`)
