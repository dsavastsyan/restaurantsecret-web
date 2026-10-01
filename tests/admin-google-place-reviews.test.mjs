import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const router = await readFile(new URL('../src/routes/Router.jsx', import.meta.url), 'utf8')
const shell = await readFile(new URL('../src/pages/admin/AdminShell.jsx', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/api/adminMenuRevisions.js', import.meta.url), 'utf8')
const page = await readFile(
  new URL('../src/pages/admin/AdminGooglePlaceReviews.jsx', import.meta.url),
  'utf8',
)

test('admin exposes a dedicated Google Places review route', () => {
  assert.match(router, /path="google-place-reviews"/)
  assert.match(shell, /to="\/admin\/google-place-reviews"/)
})

test('review UI keeps network confirmation and branch attachment separate', () => {
  assert.match(page, /Сети и алиасы/)
  assert.match(page, /Привязка филиалов/)
  assert.match(page, /set_alias_and_retry/)
  assert.match(page, /keep_network/)
})

test('API client covers network and branch review decisions', () => {
  assert.match(api, /googlePlaceNetworkReviews/)
  assert.match(api, /google-place-network-reviews/)
  assert.match(api, /googlePlaceBranchReviews/)
  assert.match(api, /google-place-branch-reviews/)
})
