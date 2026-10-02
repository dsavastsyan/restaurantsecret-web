function cuisineKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[\s\p{Pd}_/\\()[\]{}.,;:!?]+/gu, '')
}

const CANONICAL_CUISINES = [
  'Абхазская', 'Азербайджанская', 'Американская', 'Аргентинская', 'Армянская',
  'Азиатская', 'Авторская', 'Балканская', 'Барбекю', 'Белорусская', 'Бельгийская',
  'Ближневосточная', 'Бургерная', 'Веганская', 'Вегетарианская', 'Вьетнамская',
  'Восточная', 'Гавайская', 'Гастробар', 'Греческая', 'Грузинская', 'Дагестанская',
  'Деревенская', 'Домашняя', 'Европейская', 'Еврейская', 'Завтраки',
  'Здоровое питание', 'Израильская', 'Индийская', 'Интернациональная', 'Испанская',
  'Итальянская', 'Кавказская', 'Карибская', 'Китайская', 'Кондитерская', 'Корейская',
  'Кофейня', 'Крымская', 'Латиноамериканская', 'Мексиканская', 'Мясная', 'Никкей',
  'Паназиатская', 'Пекарня', 'Пельменная', 'Перуанская', 'Пивная', 'Пицца',
  'Португальская', 'Русская', 'Рыбная', 'Салат-бар', 'Сибирская', 'Смешанная',
  'Средиземноморская', 'Стейк-хаус', 'Стритфуд', 'Суши', 'Тайваньская', 'Тайская',
  'Татарская', 'Турецкая', 'Узбекская', 'Украинская', 'Фастфуд', 'Французская',
  'Чешская', 'Японская',
]

const CANONICAL_BY_KEY = new Map(CANONICAL_CUISINES.map((label) => [cuisineKey(label), label]))
const RAW_CUISINE_ALIASES = {
  'быстрое питание': ['Фастфуд'],
  'быстрая еда': ['Фастфуд'],
  'выпечка': ['Пекарня'],
  'кофеспот': ['Кофейня'],
  'международная': ['Интернациональная'],
  'морепродукты': ['Рыбная'],
  'морская': ['Рыбная'],
  'пиццерия': ['Пицца'],
  'правильное питание': ['Здоровое питание'],
  'рыбный': ['Рыбная'],
  'фаст фуд': ['Фастфуд'],
  'фаст-фуд': ['Фастфуд'],
  'фастфуд': ['Фастфуд'],
  'хот дог': ['Фастфуд'],
  'хот-дог': ['Фастфуд'],
  'хотдоги': ['Фастфуд'],
  'бургеры': ['Фастфуд'],
  'бургер': ['Фастфуд'],
  'бургерная': ['Фастфуд'],
  'сэндвичи': ['Фастфуд'],
  'сэндвич': ['Фастфуд'],
  'авторская азиатская': ['Авторская', 'Азиатская'],
  'авторская европейская': ['Авторская', 'Европейская'],
  'авторская мясная': ['Авторская', 'Мясная'],
  'диетический фастфуд': ['Здоровое питание', 'Фастфуд'],
  'здоровый фастфуд': ['Здоровое питание', 'Фастфуд'],
  'домашняя итальянская': ['Домашняя', 'Итальянская'],
  'испано-португальская': ['Испанская', 'Португальская'],
  'итальянская деревенская': ['Деревенская', 'Итальянская'],
  'итальянская кофейня': ['Итальянская', 'Кофейня'],
  'кофейня с завтраками': ['Завтраки', 'Кофейня'],
  'мультикультурная': ['Смешанная'],
  'рыбно-морская': ['Рыбная'],
  'русско-французская': ['Русская', 'Французская'],
  'универсальная': ['Смешанная'],
  'веганские суши': ['Веганская', 'Суши'],
}
const ALIASES_BY_KEY = new Map(
  Object.entries(RAW_CUISINE_ALIASES).map(([label, values]) => [cuisineKey(label), values]),
)

function rawCuisineParts(value) {
  return String(value || '')
    .split(/\s*[,;/]\s*|\s+и\s+/iu)
    .map((part) => part.trim())
    .filter(Boolean)
}

function normalizeCuisineValues(value) {
  const normalized = []
  for (const part of rawCuisineParts(value)) {
    const key = cuisineKey(part)
    if (key === 'nan') {
      normalized.push('Другое')
      continue
    }
    const labels = ALIASES_BY_KEY.get(key)
      || (CANONICAL_BY_KEY.has(key) ? [CANONICAL_BY_KEY.get(key)] : [
        part.charAt(0).toLocaleUpperCase('ru-RU') + part.slice(1).toLocaleLowerCase('ru-RU'),
      ])
    normalized.push(...labels)
  }
  return Array.from(new Set(normalized.filter(Boolean)))
}

export function normalizeCatalogCuisine(value) {
  if (!value) return ''

  return normalizeCuisineValues(value).join(', ')
}

export function getCatalogCuisineFilterValues(values = []) {
  const selected = Array.isArray(values) ? values : [values]
  const normalized = selected
    .flatMap((value) => normalizeCatalogCuisine(value).split(', '))
    .filter(Boolean)

  // The backend expands canonical values to legacy spellings for old rows.
  return Array.from(new Set(normalized))
}

export const CATALOG_VENUE_TYPES = [
  { id: 'restaurant', name: 'Рестораны' },
  { id: 'cafe', name: 'Кафе' },
  { id: 'coffee_tea', name: 'Кофе и чай' },
  { id: 'fast_food', name: 'Быстрая еда' },
  { id: 'bar', name: 'Бары' },
]

export function getCatalogRestaurantVenueType(restaurant) {
  const value = restaurant?.primary_venue_type ?? restaurant?.primaryVenueType
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return CATALOG_VENUE_TYPES.some((option) => option.id === normalized) ? normalized : ''
}

export function getCatalogRestaurantMetroNames(restaurant) {
  const values = [
    restaurant?.metro,
    restaurant?.metro_name,
    restaurant?.metroName,
    restaurant?.metro_station,
    restaurant?.metroStation,
    ...(Array.isArray(restaurant?.metroNames) ? restaurant.metroNames : []),
    ...(Array.isArray(restaurant?.metros) ? restaurant.metros : []),
  ]

  return Array.from(new Set(
    values
      .map((value) => typeof value === 'string' ? value.trim().toLowerCase() : '')
      .filter(Boolean),
  ))
}

export function filterCatalogRestaurants(
  items,
  {
    query = '',
    cuisines = [],
    metro = [],
    venueType = '',
    sortByRelevance = false,
    matchesQuery = (candidate, value) => String(candidate || '').toLowerCase().includes(String(value).toLowerCase()),
    getQueryScore = () => 0,
  } = {},
) {
  const normalizedQuery = String(query).trim()
  const normalizedCuisines = cuisines
    .flatMap((cuisine) => normalizeCatalogCuisine(cuisine).split(', '))
    .map((cuisine) => cuisine.trim().toLowerCase())
    .filter(Boolean)
  const normalizedMetro = (Array.isArray(metro) ? metro : [metro])
    .map((station) => String(station || '').trim().toLowerCase())
    .filter(Boolean)
  const normalizedVenueTypes = (Array.isArray(venueType) ? venueType : [venueType])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)

  const matches = items.filter((item) => {
    const itemCuisines = normalizeCatalogCuisine(item?.cuisine)
      .toLowerCase()
      .split(',')
      .map((cuisine) => cuisine.trim())
      .filter(Boolean)
    const queryMatches = !normalizedQuery
      || matchesQuery(item?.name, normalizedQuery)
      || matchesQuery(item?.chainName, normalizedQuery)
    const matchesCuisine = !normalizedCuisines.length || normalizedCuisines.some((selectedCuisine) => (
      itemCuisines.some((itemCuisine) => itemCuisine.includes(selectedCuisine))
    ))
    const restaurantMetroNames = getCatalogRestaurantMetroNames(item)
    const matchesMetro = !normalizedMetro.length
      || normalizedMetro.some((station) => restaurantMetroNames.includes(station))
    const matchesVenueType = !normalizedVenueTypes.length
      || normalizedVenueTypes.includes(getCatalogRestaurantVenueType(item))

    return queryMatches && matchesCuisine && matchesMetro && matchesVenueType
  })

  if (!normalizedQuery || !sortByRelevance) return matches

  return matches
    .map((item, index) => ({ item, index, score: getQueryScore(item?.name, normalizedQuery) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item)
}
