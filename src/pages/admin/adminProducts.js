// Shared vocabulary of the "Продукты" admin tabs

export const SOURCE_STATUS = {
  error: 'Ошибка',
  waiting: 'Ждёт',
  current: 'Актуально',
  disabled: 'Недоступно',
}

const SOURCE_STATUS_PRIORITY = { error: 0, waiting: 1, current: 2, disabled: 3 }

export function sortSources(sources) {
  return [...sources].sort((left, right) => (SOURCE_STATUS_PRIORITY[left.status] ?? 9) - (SOURCE_STATUS_PRIORITY[right.status] ?? 9))
}

export const VERDICTS = {
  review: { label: 'Сомнительные', hint: 'Правило не может доказать совпадение — нужен ваш взгляд' },
  reject: { label: 'Явное различие', hint: 'Различаются вкус, жирность, номер или вес — правило отклонило бы пару' },
  accept: { label: 'Совпадают полностью', hint: 'Бренд, вид, вариант, жирность и вес совпадают — правило приняло бы пару' },
}

export const PAIR_KINDS = {
  link: 'Справочники и фото',
  off: 'Open Food Facts',
}

export const COMPLETENESS_ISSUES = {
  no_kbju: { label: 'Нет КБЖУ', hint: 'Все четыре значения нулевые. У генерик-продуктов КБЖУ общеизвестное' },
  no_barcode: { label: 'Нет штрихкода', hint: 'Ни в карточке, ни среди кандидатов' },
  no_weight: { label: 'Нет веса', hint: 'Не указан вес или объём упаковки' },
  no_manufacturer: { label: 'Нет производителя', hint: 'Нет ни производителя, ни бренда. Если бренд есть, он показывается как производитель' },
}

export function toTime(value) {
  if (!value) return Number.NaN
  const text = String(value)
  // D1 datetime('now') has no zone marker but is UTC
  return Date.parse(/Z$|[+-]\d\d:\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`)
}

export function formatDateTime(value) {
  const time = toTime(value)
  if (Number.isNaN(time)) return '—'
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(time))
}

export function formatCount(value) {
  return Number(value || 0).toLocaleString('ru-RU')
}

export function percent(part, total) {
  if (!total) return '0%'
  const value = (part / total) * 100
  return `${value < 10 ? value.toFixed(1).replace('.', ',') : Math.round(value)}%`
}

export function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url || ''
  }
}

export function countVerdicts(pairs) {
  const counts = { review: 0, reject: 0, accept: 0 }
  for (const pair of pairs) if (pair.verdict in counts) counts[pair.verdict] += 1
  return counts
}

export function matchesSourceQuery(source, query) {
  const needle = query.trim().toLocaleLowerCase('ru-RU')
  if (!needle) return true
  return `${source.label} ${source.url || ''} ${source.group || ''} ${source.country || ''}`.toLocaleLowerCase('ru-RU').includes(needle)
}
