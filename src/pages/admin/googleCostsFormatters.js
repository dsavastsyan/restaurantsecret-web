const ruNumber = new Intl.NumberFormat('ru-RU')
const ruDecimal = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatGoogleNumber(value) {
  return ruNumber.format(Number(value || 0))
}

export function formatGoogleMoney(value) {
  return `£${ruDecimal.format(Number(value || 0))}`
}

export function formatGooglePercent(value) {
  return `${ruDecimal.format(Number(value || 0) * 100)}%`
}

export function formatGoogleDays(value) {
  const days = Number(value || 0)
  return `${formatGoogleNumber(days)} ${days === 1 ? 'день' : days >= 2 && days <= 4 ? 'дня' : 'дн.'}`
}

export function formatGoogleDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || 'дата не указана'
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

export function formatGoogleDateTime(value) {
  if (!value) return 'время не указано'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export function formatGoogleMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) return 'текущий месяц'
  const [year, month] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}
