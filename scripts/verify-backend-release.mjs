#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const WEB_REPOSITORY = 'dsavastsyan/restaurantsecret-web'
const MANIFEST_DIRECTORY = 'release/backend-dependencies'
const DEFAULT_POLL_SECONDS = 15
const DEFAULT_TIMEOUT_SECONDS = 60 * 60

export const SERVICE_CONFIG = {
  cloudflare: {
    repository: 'dsavastsyan/RestaurantSecret',
    staging: {
      branch: 'develop',
      workflow: 'backend-pr.yml',
      requiredJobs: ['deploy-staging', 'smoke-staging'],
    },
    production: {
      branch: 'main',
      workflow: 'deploy.yml',
      requiredJobs: ['apply-production-migrations', 'promote-staging-backfills', 'deploy-worker'],
    },
  },
  pd_api: {
    repository: 'dsavastsyan/RestaurantSecret-pd-api',
    staging: {
      branch: 'develop',
      workflow: 'deploy-staging.yml',
      requiredJobs: ['deploy'],
    },
    production: {
      branch: 'main',
      workflow: 'deploy-prod.yml',
      requiredJobs: ['deploy'],
    },
  },
}

const TERMINAL_FAILURES = new Set([
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'startup_failure',
  'stale',
])

export class GitHubApi {
  constructor({ token, apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com', fetchImpl = fetch } = {}) {
    this.apiUrl = apiUrl.replace(/\/$/, '')
    this.fetchImpl = fetchImpl
    this.headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (token) this.headers.Authorization = `Bearer ${token}`
  }

  async get(endpoint) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.apiUrl}${endpoint}`
    const response = await this.fetchImpl(url, { headers: this.headers })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500)
      throw new Error(`GitHub API ${response.status} for ${endpoint}: ${detail}`)
    }
    return response.json()
  }
}

function encode(value) {
  return encodeURIComponent(value)
}

function repositoryPath(repository) {
  return repository.split('/').map(encode).join('/')
}

function assertManifestEntry(service, entry) {
  const config = SERVICE_CONFIG[service]
  if (!config) throw new Error(`Unsupported backend service: ${service}`)
  if (!entry || typeof entry !== 'object') throw new Error(`${service}: dependency must be an object`)
  if (entry.repository !== config.repository) {
    throw new Error(`${service}: repository must be ${config.repository}`)
  }
  const pullRequests = ['pull_request', 'staging_pull_request', 'production_pull_request']
    .filter((field) => entry[field] !== undefined)
  if (!pullRequests.length) {
    throw new Error(`${service}: a pull request number is required`)
  }
  for (const field of pullRequests) {
    if (!Number.isInteger(entry[field]) || entry[field] < 1) {
      throw new Error(`${service}: ${field} must be a positive integer`)
    }
  }
  for (const environment of ['staging', 'production']) {
    if (!entry.pull_request && !entry[`${environment}_pull_request`]) {
      throw new Error(`${service}: ${environment}_pull_request or pull_request is required`)
    }
  }
}

export function validateManifest(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('backend dependency manifest must be an object')
  }
  if (document.version !== 1) throw new Error('backend dependency manifest version must be 1')
  if (document.backend_dependencies !== undefined && typeof document.backend_dependencies !== 'boolean') {
    throw new Error('backend_dependencies must be boolean')
  }
  if (document.backend_dependencies === false) {
    if (document.services !== undefined) {
      throw new Error('services must be omitted when backend_dependencies is false')
    }
    return document
  }
  if (!document.services || typeof document.services !== 'object' || Array.isArray(document.services)) {
    throw new Error('backend dependency manifest must contain services')
  }
  const declared = Object.keys(document.services)
  if (document.partial_services !== true) {
    for (const service of Object.keys(SERVICE_CONFIG)) {
      assertManifestEntry(service, document.services[service])
    }
  } else {
    if (!declared.length) throw new Error('backend dependency manifest must contain services')
    for (const service of declared) assertManifestEntry(service, document.services[service])
  }
  const unexpected = Object.keys(document.services).filter((service) => !SERVICE_CONFIG[service])
  if (unexpected.length) throw new Error(`Unexpected backend services: ${unexpected.join(', ')}`)
  return document
}

export async function loadManifest(manifestPath) {
  if (!manifestPath) throw new Error('backend dependency manifest path is required')
  const document = JSON.parse(await readFile(manifestPath, 'utf8'))
  return validateManifest(document)
}

export function manifestPathForPullRequest(pullRequestNumber) {
  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber < 1) {
    throw new Error(`web pull request number must be a positive integer, got ${pullRequestNumber}`)
  }
  return path.join(MANIFEST_DIRECTORY, `${pullRequestNumber}.json`)
}

export async function resolveReleasePullRequest({ api, pullRequestNumber, commitSha }) {
  if (pullRequestNumber !== undefined && pullRequestNumber !== '') {
    const parsed = Number(pullRequestNumber)
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`web pull request number must be a positive integer, got ${pullRequestNumber}`)
    }
    return parsed
  }

  if (!commitSha) throw new Error('BACKEND_RELEASE_PR_NUMBER or BACKEND_RELEASE_COMMIT_SHA is required')
  const pullRequests = await api.get(
    `/repos/${repositoryPath(WEB_REPOSITORY)}/commits/${encode(commitSha)}/pulls`,
  )
  const matches = pullRequests.filter((pullRequest) =>
    pullRequest.base?.ref === 'main' &&
    pullRequest.merged_at &&
    pullRequest.merge_commit_sha === commitSha,
  )
  if (matches.length !== 1) {
    const numbers = matches.map((pullRequest) => `#${pullRequest.number}`).join(', ') || 'none'
    throw new Error(`cannot resolve exactly one merged web PR for ${commitSha}; matches: ${numbers}`)
  }
  return matches[0].number
}


// A develop -> main promotion PR gets its number only after it is opened, so
// nobody can commit "<its number>.json" in advance. Every PR merged into
// develop already carries its own manifest (the staging gate requires it), so
// the promotion simply inherits them: it must satisfy every manifest it
// brings into main, and has no extra backend dependencies if it brings none.
export function isPromotionMerge({ subject, headRef, baseRef }) {
  if (headRef || baseRef) return headRef === 'develop' && baseRef === 'main'
  return /^Merge pull request #\d+ from [^/\s]+\/develop$/.test(subject || '')
}

export function manifestsBroughtByMerge(git) {
  return git(['diff', '--name-only', '--diff-filter=AM', 'HEAD^1', 'HEAD', '--', MANIFEST_DIRECTORY])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.json'))
    .sort()
}


const BACKEND_REPOSITORIES = Object.fromEntries(
  Object.entries(SERVICE_CONFIG).map(([service, config]) => [config.repository.split('/')[1].toLowerCase(), service]),
)

export const BACKEND_LINE_HELP =
  'Add a line to the PR description, e.g. "Backend: RestaurantSecret#511, RestaurantSecret-pd-api#221" ' +
  'or "Backend: none" when the web change does not depend on a backend change.'

// "Backend: RestaurantSecret#511, dsavastsyan/RestaurantSecret-pd-api#221" or
// "Backend: none". Returns null when the description has no Backend line,
// otherwise a list of manifests (one per declared backend PR; [] for none).
export function parseBackendDeclaration(body) {
  const line = String(body || '').split(/\r?\n/).map((text) => /^\s*backend\s*:\s*(.+?)\s*$/i.exec(text)).find(Boolean)
  if (!line) return null
  const value = line[1]
  if (/^(none|no|нет|-|—)\.?$/i.test(value)) return []
  const manifests = []
  const pattern = /(?:github\.com\/[\w.-]+\/|[\w.-]+\/)?([\w.-]+?)(?:#|\/pull\/)(\d+)/g
  for (const [, repo, number] of value.matchAll(pattern)) {
    const service = BACKEND_REPOSITORIES[repo.toLowerCase()]
    if (!service) throw new Error(`Backend line names an unknown repository "${repo}"; expected one of ${Object.values(SERVICE_CONFIG).map((c) => c.repository.split('/')[1]).join(', ')}`)
    manifests.push({
      version: 1,
      partial_services: true,
      services: { [service]: { repository: SERVICE_CONFIG[service].repository, pull_request: Number(number) } },
    })
  }
  if (!manifests.length) throw new Error(`Cannot read the Backend line "${value}". ${BACKEND_LINE_HELP}`)
  return manifests
}

// Numbers of the PRs merged into develop that a develop -> main merge brings in.
export function pullRequestsBroughtByMerge(git, ownNumber) {
  return [...git(['log', '--format=%s', 'HEAD^1..HEAD^2']).matchAll(/^Merge pull request #(\d+) from /gm)]
    .map((match) => Number(match[1]))
    .filter((number) => number !== ownNumber)
}

const runGit = (args) => execFileSync('git', args, { encoding: 'utf8' })

async function compareContains(api, baseSha, headSha) {
  const comparison = await api.get(`/repos/${repositoryPath(api.repository)}/compare/${encode(baseSha)}...${encode(headSha)}`)
  return comparison.status === 'ahead' || comparison.status === 'identical'
    ? comparison.behind_by === 0
    : false
}

function result(service, state, message, extra = {}) {
  return { service, state, message, ...extra }
}

async function inspectService(api, service, dependency, environment) {
  const config = SERVICE_CONFIG[service]
  const target = config[environment]
  const repository = config.repository
  const pullRequestNumber = dependency[`${environment}_pull_request`] || dependency.pull_request
  const pr = await api.get(`/repos/${repositoryPath(repository)}/pulls/${pullRequestNumber}`)
  if (!pr.merged_at) {
    return result(service, 'waiting', `backend PR #${pullRequestNumber} is not merged yet`)
  }

  const expectedSha = pr.merge_commit_sha
  if (!expectedSha) {
    return result(service, 'waiting', `backend PR #${pullRequestNumber} has no merge commit yet`)
  }

  const ref = await api.get(`/repos/${repositoryPath(repository)}/git/ref/heads/${encode(target.branch)}`)
  const branchSha = ref.object?.sha
  if (!branchSha) throw new Error(`${service}: cannot resolve ${target.branch} branch tip`)

  const includesExpected = await compareContains(
    { get: (endpoint) => api.get(endpoint), repository },
    expectedSha,
    branchSha,
  )
  if (!includesExpected) {
    return result(service, 'waiting', `${target.branch} does not contain merge ${expectedSha.slice(0, 12)}`)
  }

  const runs = await api.get(
    `/repos/${repositoryPath(repository)}/actions/workflows/${encode(target.workflow)}/runs?branch=${encode(target.branch)}&per_page=50`,
  )
  const orderedRuns = [...(runs.workflow_runs || [])].sort(
    (left, right) => new Date(right.created_at) - new Date(left.created_at),
  )
  let matchingRun = null
  for (const run of orderedRuns) {
    if (run.event !== 'push') continue
    if (new Date(run.created_at) < new Date(pr.merged_at)) continue
    if (await compareContains({ get: (endpoint) => api.get(endpoint), repository }, expectedSha, run.head_sha)) {
      matchingRun = run
      break
    }
  }

  if (!matchingRun) {
    return result(service, 'waiting', `no ${target.workflow} run has deployed the required merge yet`)
  }
  if (matchingRun.status !== 'completed') {
    return result(service, 'waiting', `${target.workflow} is ${matchingRun.status}`, { url: matchingRun.html_url })
  }
  if (TERMINAL_FAILURES.has(matchingRun.conclusion)) {
    return result(service, 'failed', `${target.workflow} concluded ${matchingRun.conclusion}`, { url: matchingRun.html_url })
  }
  if (matchingRun.conclusion !== 'success') {
    return result(service, 'waiting', `${target.workflow} concluded ${matchingRun.conclusion || 'unknown'}`, { url: matchingRun.html_url })
  }

  const jobs = await api.get(`${matchingRun.jobs_url}?per_page=100`)
  const jobsByName = new Map((jobs.jobs || []).map((job) => [job.name, job]))
  for (const requiredJob of target.requiredJobs) {
    const job = jobsByName.get(requiredJob)
    if (!job) {
      return result(service, 'failed', `required job ${requiredJob} is missing`, { url: matchingRun.html_url })
    }
    if (job.status !== 'completed') {
      return result(service, 'waiting', `${requiredJob} is ${job.status}`, { url: job.html_url })
    }
    if (job.conclusion !== 'success') {
      return result(service, 'failed', `${requiredJob} concluded ${job.conclusion}`, { url: job.html_url })
    }
  }
  return result(service, 'ready', `${environment} deploy is green at ${matchingRun.head_sha.slice(0, 12)}`, { url: matchingRun.html_url })
}

export async function verifyBackendRelease({ api, manifest, environment }) {
  if (!['staging', 'production'].includes(environment)) {
    throw new Error(`environment must be staging or production, got ${environment}`)
  }
  if (manifest.backend_dependencies === false) return []
  const entries = await Promise.all(
    Object.keys(SERVICE_CONFIG)
      .filter((service) => manifest.services[service])
      .map((service) => inspectService(api, service, manifest.services[service], environment)),
  )
  return entries
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export async function waitForBackendRelease({
  api,
  manifest,
  environment,
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  pollSeconds = DEFAULT_POLL_SECONDS,
  now = () => Date.now(),
  sleepImpl = sleep,
  log = console.log,
}) {
  if (manifest.backend_dependencies === false) {
    log(`[backend-release] no backend dependencies declared; skipping ${environment} release gate`)
    return []
  }
  const deadline = now() + timeoutSeconds * 1000
  while (true) {
    const results = await verifyBackendRelease({ api, manifest, environment })
    for (const current of results) {
      log(`[backend-release] ${current.service}: ${current.state} — ${current.message}${current.url ? ` (${current.url})` : ''}`)
    }
    const failed = results.find((current) => current.state === 'failed')
    if (failed) throw new Error(`${failed.service}: ${failed.message}${failed.url ? ` (${failed.url})` : ''}`)
    if (results.every((current) => current.state === 'ready')) return results
    if (now() >= deadline) throw new Error(`Timed out waiting for ${environment} backend release`)
    await sleepImpl(Math.min(pollSeconds * 1000, Math.max(0, deadline - now())))
  }
}

async function main() {
  const args = new Map()
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index]
    if (value === '--environment' || value === '--manifest') args.set(value, process.argv[++index])
  }
  const environment = args.get('--environment') || process.env.BACKEND_RELEASE_ENV || 'production'
  const manifestPath = args.get('--manifest') || process.env.BACKEND_RELEASE_MANIFEST || ''
  const timeoutSeconds = Number(process.env.BACKEND_RELEASE_TIMEOUT_SECONDS || DEFAULT_TIMEOUT_SECONDS)
  const pollSeconds = Number(process.env.BACKEND_RELEASE_POLL_SECONDS || DEFAULT_POLL_SECONDS)
  const token = process.env.BACKEND_RELEASE_TOKEN || process.env.GITHUB_TOKEN
  if (!token) throw new Error('BACKEND_RELEASE_TOKEN or GITHUB_TOKEN is required for cross-repository checks')
  const api = new GitHubApi({ token })
  const releasePullRequest = await resolveReleasePullRequest({
    api,
    pullRequestNumber: process.env.BACKEND_RELEASE_PR_NUMBER,
    commitSha: process.env.BACKEND_RELEASE_COMMIT_SHA || process.env.GITHUB_SHA,
  })
  const resolvedManifestPath = manifestPath || manifestPathForPullRequest(releasePullRequest)
  const wait = (manifest) => waitForBackendRelease({ api, manifest, environment, timeoutSeconds, pollSeconds })
  const waitAll = async (manifests) => {
    for (const manifest of manifests) await wait(manifest)
  }
  if (manifestPath || existsSync(resolvedManifestPath)) {
    console.log(`[backend-release] using web PR #${releasePullRequest} manifest ${resolvedManifestPath}`)
    await wait(await loadManifest(resolvedManifestPath))
    return
  }

  const webPullRequest = (number) => api.get(`/repos/${repositoryPath(WEB_REPOSITORY)}/pulls/${number}`)
  const declared = parseBackendDeclaration((await webPullRequest(releasePullRequest)).body)
  if (declared) {
    console.log(`[backend-release] web PR #${releasePullRequest} declares ${declared.length} backend PR(s) in its description`)
    await waitAll(declared)
    return
  }

  const promotion = isPromotionMerge({
    subject: runGit(['log', '-1', '--format=%s', 'HEAD']).trim(),
    headRef: process.env.GITHUB_HEAD_REF,
    baseRef: process.env.GITHUB_BASE_REF,
  })
  if (!promotion) {
    throw new Error(`web PR #${releasePullRequest} does not declare its backend dependencies. ${BACKEND_LINE_HELP}`)
  }
  // A develop -> main promotion has no declaration of its own: it inherits
  // whatever the PRs it brings into main declared (description line or file).
  const inherited = []
  for (const file of manifestsBroughtByMerge(runGit)) inherited.push(await loadManifest(file))
  const brought = pullRequestsBroughtByMerge(runGit, releasePullRequest)
  for (const number of brought) {
    const declaredByPr = parseBackendDeclaration((await webPullRequest(number)).body)
    if (declaredByPr) inherited.push(...declaredByPr)
  }
  console.log(
    `[backend-release] promotion PR #${releasePullRequest} inherits ${inherited.length} backend manifest(s) from ${brought.length} PR(s) and files`,
  )
  await waitAll(inherited)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[backend-release] ERROR: ${error.message}`)
    process.exitCode = 1
  })
}
