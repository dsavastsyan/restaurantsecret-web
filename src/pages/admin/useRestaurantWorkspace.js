import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'
import { adminMenuHealthApi } from '@/api/adminMenuHealth'
import { buildRestaurantRecords } from './adminRestaurants'

const HEALTH_PAGE = 200
const HEALTH_MAX_PAGES = 10
const CACHE_TTL_MS = 60000

async function allHealthRecords(tab) {
  const records = []
  for (let page = 0; page < HEALTH_MAX_PAGES; page += 1) {
    const data = await adminMenuHealthApi.list({ tab, limit: HEALTH_PAGE, offset: page * HEALTH_PAGE })
    const items = data.items || []
    records.push(...items)
    if (items.length < HEALTH_PAGE) break
  }
  return records
}

const SOURCES = {
  restaurants: { label: 'список меню', load: () => adminMenuRevisionsApi.restaurants().then((data) => data.restaurants || []) },
  manualMenus: { label: 'ручные меню', load: () => adminMenuRevisionsApi.manualMenus().then((data) => data.restaurants || []) },
  menuSources: { label: 'источники меню', load: () => adminMenuRevisionsApi.menuSources().then((data) => data.sources || []) },
  catalogAudits: { label: 'сверка меню с каталогом', load: () => adminMenuRevisionsApi.menuCatalogAudits().then((data) => data.audits || []) },
  parsers: { label: 'парсеры', load: () => adminMenuRevisionsApi.parserRuns().then((data) => data.parsers || []) },
  healthRecords: { label: 'хелс-чек', load: () => allHealthRecords('production') },
  leads: { label: 'лиды', load: () => adminMenuRevisionsApi.kbjuLeads().then((data) => data.leads || []) },
  kbjuFlags: { label: 'странные КБЖУ', load: () => adminMenuRevisionsApi.kbjuFlaggedRestaurantItems().then((data) => data.items || []) },
  attributeReviews: { label: 'ревью и правки', load: () => adminMenuRevisionsApi.restaurantAttributeReviews('pending').then((data) => data.reviews || []) },
}

let cache = null

async function loadWorkspace() {
  const keys = Object.keys(SOURCES)
  const results = await Promise.allSettled(keys.map((key) => SOURCES[key].load()))
  const data = {}
  const failed = []
  results.forEach((result, index) => {
    const key = keys[index]
    if (result.status === 'fulfilled') data[key] = result.value
    else {
      data[key] = []
      failed.push(SOURCES[key].label)
    }
  })
  if (failed.length === keys.length) throw new Error('Не удалось загрузить данные ресторанов')
  return { data, failed }
}

function cachedWorkspace(force) {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.promise
  const promise = loadWorkspace()
  cache = { at: Date.now(), promise }
  promise.catch(() => { if (cache?.promise === promise) cache = null })
  return promise
}

export function invalidateRestaurantWorkspace() {
  cache = null
}

// Shared by «Все рестораны», the restaurant page and «Полнота»: one load, joined by slug
export function useRestaurantWorkspace() {
  const [state, setState] = useState({ data: null, failed: [], loading: true, error: '' })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    setState((current) => ({ ...current, loading: true, error: '' }))
    cachedWorkspace(version > 0)
      .then(({ data, failed }) => active && setState({ data, failed, loading: false, error: '' }))
      .catch((error) => active && setState({ data: null, failed: [], loading: false, error: error.message || 'Не удалось загрузить данные ресторанов' }))
    return () => { active = false }
  }, [version])

  const records = useMemo(() => (state.data ? buildRestaurantRecords(state.data) : []), [state.data])
  const reload = useCallback(() => setVersion((value) => value + 1), [])

  return { ...state, records, reload }
}
