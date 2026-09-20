// Slug and genitive-case ("ресторанов ...") forms for every city currently
// in the restaurant catalog (see `SELECT DISTINCT city FROM restaurant` in
// D1). A city missing from these maps still works — citySlug() falls back to
// a percent-encoded slug and cityGenitive() falls back to the nominative
// name — but add it here when a new city shows up, the same way
// RETIRED_RESTAURANT_SLUGS in generate-sitemap.js is maintained by hand.
const CITY_SLUGS = {
  'Москва': 'moskva',
  'Санкт-Петербург': 'sankt-peterburg',
  'Нижний Новгород': 'nizhniy-novgorod',
  'Минск': 'minsk',
  'Екатеринбург': 'ekaterinburg',
  'Сочи': 'sochi',
  'Казань': 'kazan',
  'Московская область': 'moskovskaya-oblast',
  'Альметьевск': 'almetevsk',
  'Ростов-на-Дону': 'rostov-na-donu',
  'Анапа': 'anapa',
  'Барнаул': 'barnaul',
  'Владивосток': 'vladivostok',
  'Волгоград': 'volgograd',
  'Воронеж': 'voronezh',
  'Геленджик': 'gelendzhik',
  'Калининград': 'kaliningrad',
  'Калуга': 'kaluga',
  'Кемерово': 'kemerovo',
  'Краснодар': 'krasnodar',
  'Красноярск': 'krasnoyarsk',
  'Новороссийск': 'novorossiysk',
  'Новосибирск': 'novosibirsk',
  'Пермь': 'perm',
  'Реутов': 'reutov',
  'Саранск': 'saransk',
  'Томск': 'tomsk',
  'Тюмень': 'tyumen',
  'Уфа': 'ufa',
  'Хабаровск': 'khabarovsk',
  'Челябинск': 'chelyabinsk',
}

// Every H1/title/description on a city catalog page reads "КБЖУ ресторанов
// {город}" — grammatically wrong in nominative for any Russian city name
// except the indeclinable ones (Сочи, Кемерово). A city missing here falls
// back to its nominative name rather than a guessed (and possibly wrong)
// ending.
const CITY_GENITIVE = {
  'Москва': 'Москвы',
  'Санкт-Петербург': 'Санкт-Петербурга',
  'Нижний Новгород': 'Нижнего Новгорода',
  'Минск': 'Минска',
  'Екатеринбург': 'Екатеринбурга',
  'Сочи': 'Сочи',
  'Казань': 'Казани',
  'Московская область': 'Московской области',
  'Альметьевск': 'Альметьевска',
  'Ростов-на-Дону': 'Ростова-на-Дону',
  'Анапа': 'Анапы',
  'Барнаул': 'Барнаула',
  'Владивосток': 'Владивостока',
  'Волгоград': 'Волгограда',
  'Воронеж': 'Воронежа',
  'Геленджик': 'Геленджика',
  'Калининград': 'Калининграда',
  'Калуга': 'Калуги',
  'Кемерово': 'Кемерово',
  'Краснодар': 'Краснодара',
  'Красноярск': 'Красноярска',
  'Новороссийск': 'Новороссийска',
  'Новосибирск': 'Новосибирска',
  'Пермь': 'Перми',
  'Реутов': 'Реутова',
  'Саранск': 'Саранска',
  'Томск': 'Томска',
  'Тюмень': 'Тюмени',
  'Уфа': 'Уфы',
  'Хабаровск': 'Хабаровска',
  'Челябинск': 'Челябинска',
}

export function citySlug(cityName) {
  const name = String(cityName || '').trim()
  return CITY_SLUGS[name] || encodeURIComponent(name.toLowerCase())
}

export function cityGenitive(cityName) {
  const name = String(cityName || '').trim()
  return CITY_GENITIVE[name] || name
}

// Plain .js (no TS) on purpose: this module is imported both by the Vite app
// (Catalog.jsx) and by scripts/generate-sitemap.js, which runs under plain
// `node` with no TypeScript/JSX support.
function pluralizeRestaurantsPrepositional(count) {
  const value = Math.abs(Number(count)) % 100
  const lastDigit = value % 10
  if (value >= 11 && value <= 14) return 'ресторанах'
  if (lastDigit === 1) return 'ресторане'
  return 'ресторанах'
}

// Shared copy for a city's catalog landing page (/catalog/:city) — used both
// for the prerendered <title>/<meta description> (generate-sitemap.js) and
// the client-side useMeta() call (Catalog.jsx), so the two never drift.
export function cityCatalogTitle(cityName) {
  return `КБЖУ ресторанов ${cityGenitive(cityName)} — калории и БЖУ блюд | RestaurantSecret`
}

export function cityCatalogDescription(cityName, restaurantCount) {
  const count = Number(restaurantCount) || 0
  const word = pluralizeRestaurantsPrepositional(count)
  return `КБЖУ в ${count.toLocaleString('ru-RU')} ${word} ${cityGenitive(cityName)}: калории, белки, жиры и углеводы из меню. Быстрые фильтры по кухне и метро.`
}
