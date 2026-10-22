import { buildHealthIndex, findHealthRecord } from './adminMenuHealth.js'

// One slug = one menu. Every restaurants tab joins its data by slug through this module

export function restaurantPath(slug) {
  return `/admin/restaurants/all/${encodeURIComponent(slug)}`
}

export const KBJU_SOURCE_LABELS = {
  instagram_highlights: 'Instagram Highlights',
  website_cards: 'Сайт',
  document: 'Документ',
  direct_reply: 'Ответ в директ',
}

export const DM_STATE_LABELS = {
  none: 'Не писали',
  requested: 'Запрос отправлен',
  nudged: 'Напомнили',
  waiting_restaurant: 'Ждём остальное',
  received: 'Ответ получен',
}

export const FRESHNESS = {
  kbju_stale: { label: 'КБЖУ отстало', tone: 'needs_check', priority: 0 },
  menu_changed: { label: 'Меню изменилось', tone: 'needs_check', priority: 1 },
  parser_error: { label: 'Ошибка парсера', tone: 'needs_check', priority: 2 },
  needs_check: { label: 'Нужно проверить', tone: 'source_missing', priority: 3 },
  source_missing: { label: 'Источник не указан', tone: 'source_missing', priority: 4 },
  parser_waiting: { label: 'Ждёт прогона', tone: 'source_missing', priority: 5 },
  unknown: { label: 'Нет данных', tone: 'unknown', priority: 6 },
  parser_disabled: { label: 'Парсер отключён', tone: 'unknown', priority: 7 },
  current: { label: 'Актуально', tone: 'current', priority: 8 },
}

export const MANUAL_FRESHNESS_FILTERS = ['kbju_stale', 'menu_changed', 'needs_check', 'source_missing', 'current']

export const COMPLETENESS = {
  kbju_source_missing: 'Нет источника КБЖУ',
  menu_source_missing: 'Нет источника меню',
  catalog_missing: 'На сайте есть блюда без КБЖУ',
  few_dishes: 'Мало блюд',
  no_location: 'Нет активной точки',
  no_cuisine: 'Не указана кухня',
}

export function toTime(value) {
  if (!value) return Number.NaN
  const text = String(value)
  // D1 datetime('now') has no zone marker but is UTC
  return Date.parse(/Z$|[+-]\d\d:\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`)
}

export function normalizeName(value) {
  return String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
}

// "Меню изменилось": the menu source changed after the KBJU was last checked
export function menuChangedSinceCheck(manual, menuSource) {
  const changedAt = toTime(menuSource?.last_changed_at)
  if (Number.isNaN(changedAt)) return false
  const checkedAt = toTime(manual?.last_checked_at)
  return Number.isNaN(checkedAt) || changedAt > checkedAt
}

export function manualFreshness(manual, menuSource) {
  if (!manual) return 'unknown'
  if (manual.kbju_stale) return 'kbju_stale'
  if (menuChangedSinceCheck(manual, menuSource)) return 'menu_changed'
  if (manual.status === 'source_missing') return 'source_missing'
  if (manual.status === 'needs_check') return 'needs_check'
  return 'current'
}

const PARSER_FRESHNESS = { error: 'parser_error', waiting: 'parser_waiting', disabled: 'parser_disabled', current: 'current' }

export function parserFreshness(parsers) {
  if (!parsers?.length) return 'unknown'
  const codes = parsers.map((parser) => PARSER_FRESHNESS[parser.freshness?.status] || 'parser_waiting')
  return codes.sort((left, right) => FRESHNESS[left].priority - FRESHNESS[right].priority)[0]
}

// An agent crawl (RestaurantSecret parsers/agent_crawl_sources.json) is collected by
// the agent in a browser every interval_days instead of the daily parser batch.
export function parserSourceLabel(parser) {
  if (parser?.kind !== 'agent_crawl') return null
  return parser.interval_days ? `агентский обход · раз в ${parser.interval_days} дн.` : 'агентский обход'
}

function healthCodes(health) {
  return new Set([...(health?.reasons || []), ...(health?.warnings || [])])
}

export function completenessIssues({ manual, menuSource, health, isParser }) {
  const issues = []
  if (manual && (!manual.source_type || !manual.source_url)) {
    issues.push({ code: 'kbju_source_missing', label: COMPLETENESS.kbju_source_missing, note: manual.notes || null })
  }
  if (manual && !isParser && !menuSource) {
    issues.push({ code: 'menu_source_missing', label: COMPLETENESS.menu_source_missing, note: manual.notes || null })
  }
  const missing = menuSource?.catalog_missing_count
  if (missing > 0) {
    issues.push({ code: 'catalog_missing', label: `На сайте ${missing} ${pluralDishes(missing)} без КБЖУ`, count: missing })
  }
  const codes = healthCodes(health)
  if (codes.has('few_dishes')) issues.push({ code: 'few_dishes', label: COMPLETENESS.few_dishes })
  if (codes.has('wait_location')) issues.push({ code: 'no_location', label: COMPLETENESS.no_location })
  if (codes.has('no_cuisine')) issues.push({ code: 'no_cuisine', label: COMPLETENESS.no_cuisine })
  return issues
}

export function pluralDishes(count) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return 'блюдо'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'блюда'
  return 'блюд'
}

export function accuracyIssues({ health, kbjuFlags = 0, attributeReviews = 0 }) {
  const issues = []
  if (kbjuFlags > 0) issues.push({ code: 'kbju_flags', label: `Странные КБЖУ: ${kbjuFlags}`, count: kbjuFlags, to: '/admin/restaurants/quality/accuracy/kbju' })
  if (attributeReviews > 0) issues.push({ code: 'attribute_reviews', label: `Ревью и правки: ${attributeReviews}`, count: attributeReviews, to: '/admin/restaurants/quality/accuracy/attributes' })
  if (health?.status === 'needs_decision') issues.push({ code: 'health_decision', label: 'Хелс-чек: нужно решение' })
  return issues
}

function countBy(items, keyOf) {
  const counts = new Map()
  for (const item of items || []) {
    const key = keyOf(item)
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

// Joins every admin source into one record per menu slug
export function buildRestaurantRecords({
  restaurants = [],
  manualMenus = [],
  menuSources = [],
  parsers = [],
  healthRecords = [],
  leads = [],
  kbjuFlags = [],
  attributeReviews = [],
} = {}) {
  const manualBySlug = new Map(manualMenus.map((item) => [item.slug, item]))
  const sourceBySlug = new Map(menuSources.map((item) => [item.slug, item]))
  const leadById = new Map(leads.map((lead) => [Number(lead.id), lead]))
  const healthIndex = buildHealthIndex(healthRecords)
  const parsersBySlug = new Map()
  for (const parser of parsers) {
    if (!parser.restaurant_slug) continue
    parsersBySlug.set(parser.restaurant_slug, [...(parsersBySlug.get(parser.restaurant_slug) || []), parser])
  }
  const flagsByName = countBy(kbjuFlags, (item) => normalizeName(item.restaurant_name))
  const reviewsBySlug = countBy(attributeReviews, (item) => item.restaurant_slug || item.slug)

  const bases = new Map()
  for (const restaurant of restaurants) {
    bases.set(restaurant.slug, {
      slug: restaurant.slug,
      name: restaurant.name,
      cities: restaurant.cities || [],
      public_menu_url: restaurant.public_menu_url || null,
      menu_updated_at: restaurant.menu_updated_at || null,
      parser_ids: restaurant.parsers || [],
    })
  }
  for (const manual of manualMenus) {
    if (!bases.has(manual.slug)) {
      bases.set(manual.slug, {
        slug: manual.slug,
        name: manual.name,
        cities: manual.cities || [],
        public_menu_url: `/restaurants/${encodeURIComponent(manual.slug)}/menu`,
        menu_updated_at: null,
        parser_ids: [],
      })
    }
  }

  return [...bases.values()].map((base) => {
    const manual = manualBySlug.get(base.slug) || null
    const menuSource = sourceBySlug.get(base.slug) || null
    const slugParsers = parsersBySlug.get(base.slug) || []
    const isParser = !manual && (slugParsers.length > 0 || base.parser_ids.length > 0)
    const health = findHealthRecord(base, healthIndex)
    const lead = manual?.lead_id == null ? null : leadById.get(Number(manual.lead_id)) || null
    const freshness = isParser ? parserFreshness(slugParsers) : manualFreshness(manual, menuSource)
    return {
      ...base,
      kind: isParser ? 'parser' : manual ? 'manual' : 'unknown',
      manual,
      menu_source: menuSource,
      parsers: slugParsers,
      health,
      lead,
      freshness,
      completeness: completenessIssues({ manual, menuSource, health, isParser }),
      accuracy: accuracyIssues({
        health,
        kbjuFlags: flagsByName.get(normalizeName(base.name)) || 0,
        attributeReviews: reviewsBySlug.get(base.slug) || 0,
      }),
    }
  })
}

// Branch menus of one chain share a lead (one conversation). Rows of one lead stay
// together, the group takes the position of its most urgent menu
export function orderWithLeadGroups(items, compare) {
  const sorted = [...items].sort(compare)
  const groups = new Map()
  const order = []
  for (const item of sorted) {
    const key = item.lead_id == null ? `slug:${item.slug}` : `lead:${item.lead_id}`
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key).push(item)
  }
  return order.map((key) => ({ key, lead_id: groups.get(key)[0].lead_id ?? null, items: groups.get(key) }))
}

export function matchesQuery(record, query) {
  const needle = normalizeName(query)
  if (!needle) return true
  return normalizeName(`${record.name} ${record.slug} ${(record.cities || []).join(' ')}`).includes(needle)
}
