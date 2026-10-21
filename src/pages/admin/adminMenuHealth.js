export const HEALTH_STATUS = {
  ok: { label: 'Всё ок', className: 'ok' },
  warning: { label: 'Предупреждения', className: 'warning' },
  needs_decision: { label: 'Нужно ваше решение', className: 'needs_decision' },
  pending: { label: 'Ждёт', className: 'pending' },
}

export const HEALTH_REASON_LABELS = {
  dish_drop: 'Резкое падение числа блюд',
  dish_name_loss: 'Потеря названий блюд',
  dish_name_loss_minor: 'Часть названий блюд отличается',
  few_dishes: 'Слишком мало блюд в меню',
  zero_nutrition: 'Нулевое КБЖУ у блюд',
  empty_composition: 'Пустой состав блюд',
  unclassified: 'Есть блюда без категории',
  wait_location: 'Ждёт активную точку ресторана',
  no_cuisine: 'Не указана кухня',
  nutrition_carried_over: 'КБЖУ перенесено без подтверждения',
  kbju_assumption: 'КБЖУ с допущением',
}

export const HEALTH_WARNING_LABELS = {
  no_cuisine: 'Не указана кухня',
  dish_name_loss_minor: 'Часть названий блюд отличается',
  kbju_assumption: 'КБЖУ с допущением',
}

const DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatHealthDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMATTER.format(date)
}

export function formatHealthDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME_FORMATTER.format(date)
}

export function truncateHealthSummary(value, maxLength = 96) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…` : text
}

export function healthStatusInfo(status) {
  return HEALTH_STATUS[status] || HEALTH_STATUS.pending
}

export function healthReasonLabel(code, kind = 'reason') {
  const labels = kind === 'warning' ? HEALTH_WARNING_LABELS : HEALTH_REASON_LABELS
  return labels[code] || 'Дополнительная проверка данных'
}

function normalizePart(value) {
  return String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[«»"'.,()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function idFrom(value) {
  return value?.publicId || value?.public_id || value?.restaurant_public_id || value?.restaurantPublicId || ''
}

function namesFrom(value) {
  return value?.name || value?.restaurant_name || value?.restaurantName || ''
}

function citiesFrom(value) {
  if (Array.isArray(value?.cities)) return value.cities
  if (value?.city) return [value.city]
  if (value?.city_label) return String(value.city_label).split(',')
  return []
}

export function healthMatchKeys(value) {
  const id = idFrom(value)
  const name = normalizePart(namesFrom(value))
  const cities = citiesFrom(value).map(normalizePart).filter(Boolean)
  const keys = []
  if (id) keys.push(`id:${id}`)
  if (name) {
    for (const city of cities) keys.push(`name:${name}|city:${city}`)
    keys.push(`name:${name}`)
  }
  return keys
}

export function buildHealthIndex(records = []) {
  const index = new Map()
  const nameOnlyCounts = new Map()
  for (const record of records) {
    for (const key of healthMatchKeys(record)) {
      if (key.startsWith('name:') && !key.includes('|city:')) {
        nameOnlyCounts.set(key, (nameOnlyCounts.get(key) || 0) + 1)
      }
      if (!index.has(key)) index.set(key, record)
    }
  }
  for (const [key, count] of nameOnlyCounts) {
    if (count > 1) index.delete(key)
  }
  return index
}

export function findHealthRecord(value, index) {
  if (!index) return null
  return healthMatchKeys(value).map((key) => index.get(key)).find(Boolean) || null
}

export function detailValue(details, ...keys) {
  for (const key of keys) {
    if (details && details[key] !== undefined && details[key] !== null) return details[key]
  }
  return null
}
