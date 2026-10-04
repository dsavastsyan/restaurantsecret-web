import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'

import {
  SERVICE_CONFIG,
  manifestPathForPullRequest,
  resolveReleasePullRequest,
  validateManifest,
  verifyBackendRelease,
  waitForBackendRelease,
} from '../scripts/verify-backend-release.mjs'

const manifestDirectory = new URL('../release/backend-dependencies/', import.meta.url)
const manifestFiles = (await readdir(manifestDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  .map((entry) => entry.name)
const validManifest = {
  version: 1,
  services: {
    cloudflare: {
      repository: SERVICE_CONFIG.cloudflare.repository,
      staging_pull_request: 1,
      production_pull_request: 1,
    },
    pd_api: {
      repository: SERVICE_CONFIG.pd_api.repository,
      staging_pull_request: 1,
      production_pull_request: 1,
    },
  },
}

test('each web PR manifest declares a valid dependency mode', async () => {
  assert.ok(manifestFiles.length > 0)
  for (const filename of manifestFiles) {
    const manifest = JSON.parse(await readFile(new URL(filename, manifestDirectory), 'utf8'))
    if (manifest.backend_dependencies === false) {
      assert.deepEqual(manifest, { version: 1, backend_dependencies: false }, filename)
      assert.doesNotThrow(() => validateManifest(manifest), filename)
      continue
    }
    assert.deepEqual(Object.keys(manifest.services).sort(), ['cloudflare', 'pd_api'])
    assert.equal(manifest.services.cloudflare.repository, SERVICE_CONFIG.cloudflare.repository)
    assert.equal(manifest.services.pd_api.repository, SERVICE_CONFIG.pd_api.repository)
    assert.doesNotThrow(() => validateManifest(manifest), filename)
  }
})

test('web PR manifests are addressed by pull request number', () => {
  assert.equal(manifestPathForPullRequest(570), 'release/backend-dependencies/570.json')
  assert.throws(() => manifestPathForPullRequest(0), /positive integer/)
})

test('production gate resolves the exact web PR associated with the pushed merge commit', async () => {
  const api = {
    get: async (endpoint) => {
      assert.equal(endpoint, '/repos/dsavastsyan/restaurantsecret-web/commits/merge-sha/pulls')
      return [{
        number: 570,
        base: { ref: 'main' },
        merged_at: '2026-10-04T00:00:00Z',
        merge_commit_sha: 'merge-sha',
      }]
    },
  }
  assert.equal(await resolveReleasePullRequest({ api, commitSha: 'merge-sha' }), 570)
})

test('backend dependency manifest rejects an unapproved repository', () => {
  const invalid = structuredClone(validManifest)
  invalid.services.cloudflare.repository = 'someone/else'
  assert.throws(() => validateManifest(invalid), /repository must be/)
})

test('backend dependency manifest requires a pin for both environments', () => {
  const invalid = structuredClone(validManifest)
  delete invalid.services.cloudflare.production_pull_request
  assert.throws(() => validateManifest(invalid), /production_pull_request or pull_request is required/)
})

test('backend dependency manifest can explicitly declare no backend dependencies', () => {
  assert.doesNotThrow(() => validateManifest({ version: 1, backend_dependencies: false }))
  assert.throws(
    () => validateManifest({ version: 1, backend_dependencies: false, services: {} }),
    /services must be omitted/,
  )
})

test('backend release gate skips backend API checks when no dependencies are declared', async () => {
  const manifest = { version: 1, backend_dependencies: false }
  const api = { get: async () => assert.fail('backend API must not be called') }
  const logs = []

  assert.deepEqual(await verifyBackendRelease({ api, manifest, environment: 'staging' }), [])
  assert.deepEqual(
    await waitForBackendRelease({ api, manifest, environment: 'staging', log: (message) => logs.push(message) }),
    [],
  )
  assert.deepEqual(logs, ['[backend-release] no backend dependencies declared; skipping staging release gate'])
})

test('production gate requires the migration and backfill jobs before Worker deploy', () => {
  assert.deepEqual(SERVICE_CONFIG.cloudflare.production.requiredJobs, [
    'apply-production-migrations',
    'promote-staging-backfills',
    'deploy-worker',
  ])
})
