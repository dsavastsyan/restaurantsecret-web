import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('goals API helper uses the deployed api v1 route', async () => {
  const apiSource = await readSource('src/lib/api.ts')

  assert.match(apiSource, /const\s+USER_GOALS_PATH\s*=\s*["']\/api\/v1\/goals["']/)
  assert.doesNotMatch(apiSource, /api(?:Get|Put)<[^>]*>\(["']\/api\/goals["']/)
  assert.doesNotMatch(apiSource, /api(?:Get|Put)\(["']\/api\/goals["']/)
})

test('goals store writes through the shared API helper instead of hardcoding routes', async () => {
  const storeSource = await readSource('src/store/goals.ts')

  assert.match(storeSource, /import\s+\{[^}]*updateUserGoals[^}]*\}\s+from\s+['"]@\/lib\/api['"]/)
  assert.doesNotMatch(storeSource, /apiPut\s*\(/)
  assert.doesNotMatch(storeSource, /['"]\/api\/goals['"]/)
  assert.match(storeSource, /updateUserGoals\(next,\s*token\)/)
})
