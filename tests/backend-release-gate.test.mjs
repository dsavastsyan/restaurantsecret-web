import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  SERVICE_CONFIG,
  validateManifest,
} from '../scripts/verify-backend-release.mjs'

const manifest = JSON.parse(await readFile(new URL('../release/backend-dependencies.json', import.meta.url)))

test('backend dependency manifest pins both backend pull requests', () => {
  assert.deepEqual(Object.keys(manifest.services).sort(), ['cloudflare', 'pd_api'])
  assert.equal(manifest.services.cloudflare.repository, SERVICE_CONFIG.cloudflare.repository)
  assert.equal(manifest.services.pd_api.repository, SERVICE_CONFIG.pd_api.repository)
  assert.equal(manifest.services.cloudflare.staging_pull_request, 502)
  assert.equal(manifest.services.pd_api.production_pull_request, 215)
  assert.doesNotThrow(() => validateManifest(manifest))
})

test('backend dependency manifest rejects an unapproved repository', () => {
  const invalid = structuredClone(manifest)
  invalid.services.cloudflare.repository = 'someone/else'
  assert.throws(() => validateManifest(invalid), /repository must be/)
})

test('backend dependency manifest requires a pin for both environments', () => {
  const invalid = structuredClone(manifest)
  delete invalid.services.cloudflare.production_pull_request
  assert.throws(() => validateManifest(invalid), /production_pull_request or pull_request is required/)
})

test('production gate requires the migration and backfill jobs before Worker deploy', () => {
  assert.deepEqual(SERVICE_CONFIG.cloudflare.production.requiredJobs, [
    'apply-production-migrations',
    'promote-staging-backfills',
    'deploy-worker',
  ])
})
