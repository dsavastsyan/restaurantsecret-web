import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('./api-contract.manifest.json', import.meta.url), 'utf8'))
const sourceRoots = ['src', 'functions']

const helperMethods = {
  apiGet: 'GET',
  apiPost: 'POST',
  apiPut: 'PUT',
  apiDelete: 'DELETE',
  apiPostAuth: 'POST',
  publicGet: 'GET',
}

function normalizePath(rawPath) {
  let value = rawPath
    .replace(/\$\{(?:params\.size|download|readOnly)[\s\S]*$/g, '')
    .replace(/\$\{[^}]+\}/g, '{param}')
    .replace(/encodeURIComponent\([^)]*\)/g, '{param}')
    .replace(/\+\s*[^`'")]+/g, '')
    .replace(/\/+/g, '/')

  if (!value.startsWith('/')) value = `/${value}`
  value = value.split('?')[0]
  value = value.replace(/\/:?[a-zA-Z0-9_-]*Id\b/g, '/{param}')
  value = value.replace(/\/\{param\}(?=\/\{param\})/g, '/{param}')
  return value
}

function inferBackend(file, rawPath, baseName) {
  if (baseName === 'PD_API_BASE') return 'pd'
  if (baseName === 'PUBLIC_API_BASE' || baseName === 'API_BASE') {
    if (file.includes('/api/adminMenuRevisions.js')) return 'restaurantPortal'
    return 'catalog'
  }
  if (baseName === 'RESTAURANT_API_BASE') return 'restaurantPortal'
  if (rawPath.startsWith('/auth') || rawPath.startsWith('/api/') || rawPath === '/me' || rawPath === '/users/me' || rawPath === '/onboarding/complete') return 'pd'
  return 'catalog'
}

function inferFetchMethod(source, index) {
  const snippet = source.slice(index, index + 450)
  const method = snippet.match(/method:\s*['"`]([A-Z]+)['"`]/)
  return method?.[1] || 'GET'
}

function addContract(contracts, file, backend, method, rawPath) {
  if (!rawPath || rawPath.includes('${path}') || rawPath === 'path') return
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) return
  const normalized = normalizePath(rawPath)
  if (!normalized.startsWith('/')) return
  contracts.add(`${backend} ${method.toUpperCase()} ${normalized}`)
}

async function listFiles(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl)
    if (entry.isDirectory()) files.push(...await listFiles(child))
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) files.push(child)
  }
  return files
}

async function collectFrontendContracts() {
  const files = (await Promise.all(sourceRoots.map((dir) => listFiles(new URL(`${dir}/`, root))))).flat()
  const contracts = new Set()

  for (const fileUrl of files) {
    const source = await readFile(fileUrl, 'utf8')
    const file = fileUrl.pathname
    const constants = new Map()

    for (const match of source.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*['"`]([^'"`]+)['"`]/g)) {
      constants.set(match[1], match[2])
    }

    for (const match of source.matchAll(/\b(apiGet|apiPost|apiPut|apiDelete|apiPostAuth|publicGet)\s*(?:<[^>]+>)?\(\s*(['"`])([\s\S]*?)\2/g)) {
      const [, helper, , rawPath] = match
      addContract(contracts, file, inferBackend(file, rawPath), helperMethods[helper], rawPath)
    }

    for (const match of source.matchAll(/\b(apiGet|apiPost|apiPut|apiDelete|apiPostAuth)\s*(?:<[^>]+>)?\(\s*([A-Z0-9_]+)/g)) {
      const [, helper, constantName] = match
      if (constants.has(constantName)) {
        const rawPath = constants.get(constantName)
        addContract(contracts, file, inferBackend(file, rawPath), helperMethods[helper], rawPath)
      }
    }

    for (const match of source.matchAll(/fetch\(\s*`\$\{(PD_API_BASE|PUBLIC_API_BASE|API_BASE|RESTAURANT_API_BASE)\}([^`]*)`/g)) {
      const [, baseName, rawPath] = match
      addContract(contracts, file, inferBackend(file, rawPath, baseName), inferFetchMethod(source, match.index), rawPath)
    }

    if (file.endsWith('/src/api/adminMenuRevisions.js') || file.endsWith('/src/api/restaurantPortal.js')) {
      for (const match of source.matchAll(/\b(?:request|portalRequest)\(\s*(['"`])([\s\S]*?)\1\s*(?:,\s*\{([\s\S]*?)\})?/g)) {
        const [, , rawPath, options = ''] = match
        const method = options.match(/method:\s*['"`]([A-Z]+)['"`]/)?.[1] || 'GET'
        addContract(contracts, file, 'restaurantPortal', method, rawPath)
      }
    }

    if (file.endsWith('/src/api/client.js')) {
      for (const match of source.matchAll(/:\s*\([^)]*\)\s*=>\s*(get|post)\(\s*(['"`])([^'"`]+)\2/g)) {
        const [, helper, , rawPath] = match
        addContract(contracts, file, 'catalog', helper === 'post' ? 'POST' : 'GET', rawPath)
      }
    }
  }

  return contracts
}

function manifestContracts() {
  return new Set(manifest.map((entry) => `${entry.backend} ${entry.method} ${entry.path}`))
}

function formatSet(values) {
  return [...values].sort().join('\n')
}

test('frontend API calls are declared in the API contract manifest', async () => {
  const discovered = await collectFrontendContracts()
  const declared = manifestContracts()
  const undeclared = new Set([...discovered].filter((item) => !declared.has(item)))

  assert.equal(
    undeclared.size,
    0,
    `Add these frontend API calls to tests/api-contract.manifest.json:\n${formatSet(undeclared)}`,
  )
})

test('API contract manifest has no duplicate method/path declarations', () => {
  const declared = manifest.map((entry) => `${entry.backend} ${entry.method} ${entry.path}`)
  const duplicates = declared.filter((item, index) => declared.indexOf(item) !== index)

  assert.equal(
    duplicates.length,
    0,
    `Remove duplicate API contract manifest entries:\n${duplicates.sort().join('\n')}`,
  )
})

const liveBases = {
  pd: process.env.API_CONTRACT_PD_BASE || 'https://pd.restaurantsecret.ru',
  catalog: process.env.API_CONTRACT_CATALOG_BASE || '',
  restaurantPortal: process.env.API_CONTRACT_RESTAURANT_BASE || '',
}

function probePath(entry) {
  const pathWithParams = entry.path.replace(/\{param\}/g, '__contract_probe__')
  return entry.probeQuery ? `${pathWithParams}?${entry.probeQuery}` : pathWithParams
}

function probeBody() {
  return JSON.stringify({
    email: 'contract-probe@example.invalid',
    code: '000000',
    name: 'Contract Probe',
    message: 'contract probe',
    feedback_type: 'other',
    restaurant_slug: '__contract_probe__',
    dish_id: 0,
    to_user_id: 0,
    city: 'Москва',
    source: 'manual',
    visitor_id: '00000000-0000-4000-8000-000000000000',
    personal_data_advertising: true,
    marketing_communications: true,
    consent_version: 'contract-probe',
  })
}

test('live API routes from the manifest are mounted when live contract checks are enabled', { skip: process.env.API_CONTRACT_LIVE !== '1' }, async () => {
  const failures = []

  for (const entry of manifest.filter((item) => item.live)) {
    const base = liveBases[entry.backend]
    if (!base) continue
    const response = await fetch(`${base.replace(/\/+$/, '')}${probePath(entry)}`, {
      method: entry.method,
      headers: { 'Content-Type': 'application/json' },
      body: entry.method === 'GET' || entry.method === 'HEAD' ? undefined : probeBody(),
      redirect: 'manual',
    }).catch((error) => ({ status: 'NETWORK', statusText: error.message }))

    if (response.status === 404 || response.status === 405 || response.status === 'NETWORK') {
      failures.push(`${entry.backend} ${entry.method} ${entry.path} -> ${response.status} ${response.statusText || ''}`)
    }
  }

  assert.equal(
    failures.length,
    0,
    `Live API contract failures:\n${failures.join('\n')}`,
  )
})
