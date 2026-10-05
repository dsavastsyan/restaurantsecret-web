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

test('develop -> main promotions are recognised without a manifest of their own', async () => {
  const { isPromotionMerge } = await import('../scripts/verify-backend-release.mjs')
  assert.equal(isPromotionMerge({ subject: 'Merge pull request #576 from dsavastsyan/develop' }), true)
  assert.equal(isPromotionMerge({ subject: 'Merge pull request #574 from dsavastsyan/codex/anyeat-success-copy' }), false)
  assert.equal(isPromotionMerge({ headRef: 'develop', baseRef: 'main' }), true)
  assert.equal(isPromotionMerge({ headRef: 'codex/x', baseRef: 'main' }), false)
})

test('a promotion inherits exactly the manifests it brings into main', async () => {
  const { manifestsBroughtByMerge } = await import('../scripts/verify-backend-release.mjs')
  const calls = []
  const git = (args) => {
    calls.push(args)
    return 'release/backend-dependencies/574.json\nrelease/backend-dependencies/570.json\n\n'
  }
  assert.deepEqual(manifestsBroughtByMerge(git), [
    'release/backend-dependencies/570.json',
    'release/backend-dependencies/574.json',
  ])
  assert.deepEqual(calls[0].slice(0, 4), ['diff', '--name-only', '--diff-filter=AM', 'HEAD^1'])
  assert.equal(manifestsBroughtByMerge(() => ''). length, 0)
})

test('the Backend line in a PR description declares its backend PRs', async () => {
  const { parseBackendDeclaration } = await import('../scripts/verify-backend-release.mjs')
  const body = 'Fixes things\n\nBackend: RestaurantSecret#511, dsavastsyan/RestaurantSecret-pd-api#221\n'
  const manifests = parseBackendDeclaration(body)
  assert.equal(manifests.length, 2)
  for (const manifest of manifests) assert.doesNotThrow(() => validateManifest(manifest))
  assert.deepEqual(manifests[0].services.cloudflare, { repository: SERVICE_CONFIG.cloudflare.repository, pull_request: 511 })
  assert.deepEqual(manifests[1].services.pd_api, { repository: SERVICE_CONFIG.pd_api.repository, pull_request: 221 })
})

test('Backend: none and a missing line are different things', async () => {
  const { parseBackendDeclaration } = await import('../scripts/verify-backend-release.mjs')
  assert.deepEqual(parseBackendDeclaration('x\nBackend: none'), [])
  assert.deepEqual(parseBackendDeclaration('backend: Нет'), [])
  assert.equal(parseBackendDeclaration('no declaration here'), null)
  assert.equal(parseBackendDeclaration(null), null)
})

test('a Backend line naming an unknown repository or no PR is rejected', async () => {
  const { parseBackendDeclaration } = await import('../scripts/verify-backend-release.mjs')
  assert.throws(() => parseBackendDeclaration('Backend: someone/else#5'), /unknown repository/)
  assert.throws(() => parseBackendDeclaration('Backend: soon'), /Cannot read the Backend line/)
})

test('a promotion collects the PR numbers it brings into main, minus its own', async () => {
  const { pullRequestsBroughtByMerge } = await import('../scripts/verify-backend-release.mjs')
  const git = (args) => {
    assert.deepEqual(args, ['log', '--format=%s', 'HEAD^1..HEAD^2'])
    return 'Merge pull request #577 from a/b\nfix: something\nMerge pull request #580 from a/c\nMerge pull request #576 from a/develop\n'
  }
  assert.deepEqual(pullRequestsBroughtByMerge(git, 576), [577, 580])
})
