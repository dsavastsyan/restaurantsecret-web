// scripts/generate-sitemap.js
// Запускать как: node scripts/generate-sitemap.js
// Требует Node 18+ (встроенный fetch)

import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

const BASE_URL = (process.env.SITEMAP_BASE_URL || 'https://restaurantsecret.ru').replace(/\/+$/, '')
// # Matches the API's own DEFAULT_CITY (functions/routes/restaurants.js) — a
// # bare `/restaurants/{slug}/menu/` URL with no ?city= always resolves to
// # this city when the slug is ambiguous, so that's the one entry we can keep
// # generating a page for without guessing.
const DEFAULT_CITY = 'Москва'
const MENU_FETCH_CONCURRENCY = Math.max(1, Number(process.env.SITEMAP_MENU_FETCH_CONCURRENCY || 8))
const FETCH_TIMEOUT_MS = Math.max(1000, Number(process.env.SITEMAP_FETCH_TIMEOUT_MS || 10000))
const STRICT_API_FETCH = process.env.SITEMAP_STRICT_API_FETCH === 'true'
const API_KEY = process.env.SITEMAP_API_KEY || ''
const MIN_RESTAURANTS = Math.max(0, Number(process.env.SITEMAP_MIN_RESTAURANTS || 0))
const cloudflarePagesBranch = process.env.CF_PAGES_BRANCH
const isCloudflarePagesPreview = Boolean(
  cloudflarePagesBranch && !['main', 'master'].includes(cloudflarePagesBranch)
)
const defaultApiUrls = isCloudflarePagesPreview
  ? ['https://restaurantsecret-api-staging.dsavastyan.workers.dev']
  : ['https://pd.restaurantsecret.ru/cf', 'https://api.restaurantsecret.ru/cf']
const configuredApiUrls = isCloudflarePagesPreview
  ? []
  : [
      process.env.SITEMAP_API_URL,
      process.env.VITE_API_BASE_URL,
      process.env.VITE_API_BASE,
      process.env.VITE_API_URL,
    ]
const API_URLS = Array.from(
  new Set(
    [
      ...configuredApiUrls,
      ...defaultApiUrls,
    ]
      .filter(Boolean)
      .map((url) => url.replace(/\/+$/, '')),
  ),
)

async function fetchJson(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: API_KEY ? { 'X-RS-Sitemap-Key': API_KEY } : undefined,
    })
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`)
    }
    return await res.json()
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`timed out after ${FETCH_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function stripEmpty(value) {
  const text = String(value ?? '').trim()
  return text || undefined
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return NaN
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(',', '.').replace(/\s+/g, ''))
  return Number.isFinite(numeric) ? numeric : NaN
}

function normalizeDishForSeo(dish = {}, categoryName = '') {
  return {
    name: stripEmpty(dish.name || dish.title || dish.canonical_name) || 'Блюдо',
    category: stripEmpty(dish.category || categoryName),
    kcal: toNumber(dish.kcal ?? dish.calories ?? dish.energy_kcal),
    protein: toNumber(dish.protein ?? dish.proteins ?? dish.proteins_g ?? dish.protein_g),
    fat: toNumber(dish.fat ?? dish.fats ?? dish.fats_g ?? dish.fat_g),
    carbs: toNumber(dish.carbs ?? dish.carb ?? dish.carbohydrates ?? dish.carbs_g ?? dish.carbohydrates_g),
  }
}

function flattenMenuForSeo(menu) {
  if (!menu) return []

  if (Array.isArray(menu.categories)) {
    return menu.categories.flatMap((category) => {
      const dishes = Array.isArray(category?.dishes) ? category.dishes : []
      return dishes.map((dish) => normalizeDishForSeo(dish, category?.name))
    })
  }

  if (Array.isArray(menu.items)) {
    return menu.items.map((dish) => normalizeDishForSeo(dish, dish?.category))
  }

  return []
}

function publicPathToFile(pathname) {
  const cleanPath = pathname.replace(/^\/+|\/+$/g, '')
  return cleanPath ? join('dist', cleanPath, 'index.html') : join('dist', 'index.html')
}

function writeRouteHtml(pathname, html) {
  const filePath = publicPathToFile(pathname)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, html, 'utf-8')
}

function upsertHeadTag(html, pattern, tag) {
  if (pattern.test(html)) {
    return html.replace(pattern, tag)
  }
  return html.replace('</head>', `    ${tag}\n  </head>`)
}

function injectBeforeHeadClose(html, tag) {
  return html.replace('</head>', `    ${tag}\n  </head>`)
}

function applySeoTags(baseHtml, route) {
  const title = escapeHtml(route.title)
  const description = escapeHtml(route.description)
  const canonical = escapeHtml(route.canonical)
  const robots = route.robots ? escapeHtml(route.robots) : null

  let html = baseHtml
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)

  html = upsertHeadTag(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${description}" />`,
  )
  html = upsertHeadTag(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${canonical}" />`,
  )
  html = upsertHeadTag(
    html,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${title}" />`,
  )
  html = upsertHeadTag(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${description}" />`,
  )
  html = upsertHeadTag(
    html,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${canonical}" />`,
  )
  html = upsertHeadTag(
    html,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${title}" />`,
  )
  html = upsertHeadTag(
    html,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${description}" />`,
  )

  if (robots) {
    html = upsertHeadTag(
      html,
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="robots" content="${robots}" />`,
    )
  }

  if (route.schema) {
    html = injectBeforeHeadClose(
      html,
      `<script id="restaurant-schema" type="application/ld+json">${JSON.stringify(route.schema)}</script>`,
    )
  }

  if (route.fallbackHtml) {
    html = html.replace('<div id="root"></div>', `<div id="root">${route.fallbackHtml}</div>`)
  }

  return html
}

function createRedirectHtml({ from, to, title = 'Переадресация — RestaurantSecret' }) {
  const escapedTo = escapeHtml(to)
  const canonical = `${BASE_URL}${to}`
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,follow" />
    <meta http-equiv="refresh" content="0; url=${escapedTo}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <title>${escapeHtml(title)}</title>
    <script>window.location.replace(${JSON.stringify(to)})</script>
  </head>
  <body>
    <p><a href="${escapedTo}">Перейти на страницу</a></p>
  </body>
</html>
`
}

function getRestaurantName(restaurant) {
  return stripEmpty(restaurant.name) || stripEmpty(restaurant.title) || stripEmpty(restaurant.slug) || 'Ресторан'
}

function getRestaurantDescription(restaurant) {
  const name = getRestaurantName(restaurant)
  const cuisine = stripEmpty(restaurant.cuisine)
  const metro = stripEmpty(restaurant.metro || restaurant.metroName || restaurant.metro_name)
  const parts = [`Меню ${name} с КБЖУ: калории, белки, жиры и углеводы блюд ресторана.`]
  if (cuisine) parts.push(`Кухня ресторана: ${cuisine}.`)
  if (metro) parts.push(`Рядом с метро ${metro}.`)
  parts.push(`Сравнивайте блюда ${name} по калорийности и макронутриентам перед посещением ресторана.`)
  return parts.join(' ')
}

// hasMenu carries dish names only (no NutritionInformation) — same
// numbers-stay-in-the-app rule as the HTML fallback above.
function restaurantMenuSchema(dishes) {
  if (!dishes.length) return undefined

  const groups = dishNamesByCategory(dishes)
  return {
    '@type': 'Menu',
    hasMenuSection: groups.map((group) => ({
      '@type': 'MenuSection',
      name: group.category,
      hasMenuItem: group.names.map((name) => ({ '@type': 'MenuItem', name })),
    })),
  }
}

function restaurantSchema(restaurant, dishes = []) {
  const slug = restaurant.slug
  const name = getRestaurantName(restaurant)
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name,
    url: `${BASE_URL}/restaurants/${slug}/menu/`,
    servesCuisine: stripEmpty(restaurant.cuisine),
    address: stripEmpty(restaurant.address)
      ? {
          '@type': 'PostalAddress',
          streetAddress: stripEmpty(restaurant.address),
          addressLocality: stripEmpty(restaurant.city) || 'Москва',
          addressCountry: 'RU',
        }
      : undefined,
    hasMenu: restaurantMenuSchema(dishes),
  }
}

function fallbackPage({ title, description, links = [] }) {
  const linkHtml = links
    .map((link) => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`)
    .join('')

  return `<main style="font-family:Inter,system-ui,sans-serif;max-width:760px;margin:0 auto;padding:48px 20px;line-height:1.5">
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
  ${linkHtml ? `<nav><ul>${linkHtml}</ul></nav>` : ''}
</main>`
}

function restaurantCatalogLinks(restaurants) {
  return restaurants
    .filter((restaurant) => restaurant.slug)
    .map((restaurant) => ({
      href: `/restaurants/${escapeHtml(restaurant.slug)}/menu/`,
      label: getRestaurantName(restaurant),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
}

function groupChains(restaurants) {
  const chains = new Map()
  for (const restaurant of restaurants) {
    const chainSlug = stripEmpty(restaurant.chainSlug)
    if (!chainSlug) continue
    const entry = chains.get(chainSlug) ?? { chainName: stripEmpty(restaurant.chainName) || chainSlug, branches: [] }
    entry.branches.push(restaurant)
    chains.set(chainSlug, entry)
  }
  return chains
}

function chainHubDescription(chainName, branches) {
  const cities = [...new Set(branches.map((b) => stripEmpty(b.city)).filter(Boolean))]
  const parts = [`${chainName} — сеть ресторанов с ${branches.length} филиалами${cities.length ? ` в ${cities.slice(0, 6).join(', ')}` : ''}.`]
  parts.push('КБЖУ меню каждого филиала: калории, белки, жиры и углеводы блюд.')
  parts.push(`Выберите ближайший адрес ${chainName} и смотрите актуальное меню перед визитом.`)
  return parts.join(' ')
}

function chainHubSchema(chainSlug, chainName, branches) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: chainName,
    itemListElement: branches
      .filter((b) => b.slug)
      .map((b, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${BASE_URL}/restaurants/${b.slug}/menu/`,
      })),
  }
}

function chainHubFallback(chainSlug, chainName, branches) {
  const description = chainHubDescription(chainName, branches)
  const links = branches
    .filter((b) => b.slug)
    .map((b) => ({
      href: `/restaurants/${b.slug}/menu/`,
      label: getRestaurantName(b),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  const linkHtml = links.map((link) => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`).join('')

  return `<main style="font-family:Inter,system-ui,sans-serif;max-width:760px;margin:0 auto;padding:48px 20px;line-height:1.5">
  <h1>${escapeHtml(chainName)}</h1>
  <p>${escapeHtml(description)}</p>
  <nav><ul>${linkHtml}</ul></nav>
</main>`
}

// Deliberately drops kcal/protein/fat/carbs — names only. The exact КБЖУ
// numbers are the paid product (trial/subscription gate in the app); giving
// them away in crawlable static HTML would let an AI answer cite the figure
// directly instead of sending the person to restaurantsecret.ru for it.
function dishNamesByCategory(dishes) {
  const order = []
  const byCategory = new Map()

  for (const dish of dishes) {
    const category = dish.category || 'Меню'
    if (!byCategory.has(category)) {
      byCategory.set(category, [])
      order.push(category)
    }
    byCategory.get(category).push(dish.name)
  }

  return order.map((category) => ({ category, names: byCategory.get(category) }))
}

function menuListHtml(dishes) {
  if (!dishes.length) return ''

  const groups = dishNamesByCategory(dishes)
  const singleGroup = groups.length === 1

  const groupsHtml = groups
    .map(
      (group) => `
  ${singleGroup ? '' : `<h3>${escapeHtml(group.category)}</h3>`}
  <ul>${group.names.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ul>`,
    )
    .join('')

  return `<h2>Блюда в меню</h2>${groupsHtml}`
}

function restaurantFallback(restaurant, dishes) {
  const slug = restaurant.slug
  const name = getRestaurantName(restaurant)
  const description = getRestaurantDescription(restaurant)
  const cuisine = stripEmpty(restaurant.cuisine)
  const metro = stripEmpty(restaurant.metro || restaurant.metroName || restaurant.metro_name)
  const details = [
    cuisine ? `Кухня: ${cuisine}` : '',
    metro ? `Метро: ${metro}` : '',
    dishes.length ? `Блюд в меню: ${dishes.length}` : Number.isFinite(Number(restaurant.dishesCount)) ? `Блюд в меню: ${Number(restaurant.dishesCount)}` : '',
  ].filter(Boolean)

  return `<main style="font-family:Inter,system-ui,sans-serif;max-width:760px;margin:0 auto;padding:48px 20px;line-height:1.5">
  <h1 aria-label="${escapeHtml(`Меню ${name} с КБЖУ`)}">${escapeHtml(name)}</h1>
  <p>${escapeHtml(description)}</p>
  ${details.length ? `<ul>${details.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
  <p>Точные калории, белки, жиры и углеводы каждого блюда — в приложении RestaurantSecret (первые 7 дней бесплатно).</p>
  ${menuListHtml(dishes)}
  <p><a href="/restaurants/${escapeHtml(slug)}/menu/">Открыть меню ресторана</a></p>
  <p><a href="/catalog/">Вернуться в каталог ресторанов</a></p>
</main>`
}

function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'RestaurantSecret',
    url: BASE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

function generateStaticRoutes(restaurants, menuBySlug) {
  const baseHtml = readFileSync('dist/index.html', 'utf-8')

  const staticRoutes = [
    {
      path: '/',
      title: 'Меню ресторанов с КБЖУ',
      description: 'Меню ресторанов Москвы с удобными фильтрами по составу и КБЖУ блюд',
      canonical: `${BASE_URL}/`,
      schema: websiteSchema(),
      fallbackHtml: fallbackPage({
        title: 'Меню ресторанов с КБЖУ',
        description: 'Меню ресторанов Москвы с удобными фильтрами по составу и КБЖУ блюд',
        links: [{ href: '/catalog', label: 'Открыть каталог ресторанов' }],
      }),
    },
    {
      path: '/catalog',
      title: 'Каталог ресторанов с КБЖУ — RestaurantSecret',
      description: 'Все рестораны Москвы с полным меню и данными КБЖУ. Фильтрация по кухне, метро и целям питания.',
      canonical: `${BASE_URL}/catalog/`,
      fallbackHtml: fallbackPage({
        title: 'Каталог ресторанов с КБЖУ',
        description: 'Все рестораны Москвы с полным меню и данными КБЖУ. Фильтрация по кухне, метро и целям питания.',
        links: restaurantCatalogLinks(restaurants),
      }),
    },
    {
      path: '/how-it-works',
      title: 'Как это работает — RestaurantSecret',
      description: 'Узнайте, как RestaurantSecret помогает следить КБЖУ в ресторанах Москвы. Реальные данные из меню каждого заведения, фильтры по целям питания.',
      canonical: `${BASE_URL}/how-it-works/`,
      fallbackHtml: fallbackPage({
        title: 'Как это работает',
        description: 'RestaurantSecret собирает данные меню ресторанов и помогает находить блюда под ваши цели питания.',
        links: [{ href: '/catalog', label: 'Посмотреть рестораны' }],
      }),
    },
    {
      path: '/tariffs',
      title: 'Подписка и тарифы — RestaurantSecret',
      description: 'Бесплатный и премиум доступ к КБЖУ всех ресторанов Москвы. Пробный период 7 дней бесплатно.',
      canonical: `${BASE_URL}/tariffs/`,
      fallbackHtml: fallbackPage({
        title: 'Подписка и тарифы',
        description: 'Бесплатный и премиум доступ к КБЖУ всех ресторанов Москвы. Пробный период 7 дней бесплатно.',
      }),
    },
    {
      path: '/support',
      title: 'Поддержка веб-сервиса RestaurantSecret и мобильного приложения AnyEat',
      description: 'Контакты и реквизиты RestaurantSecret. Поддержка по подписке и общие вопросы.',
      canonical: `${BASE_URL}/support/`,
      fallbackHtml: fallbackPage({
        title: 'Поддержка веб-сервиса RestaurantSecret и мобильного приложения AnyEat',
        description: 'Контакты и реквизиты RestaurantSecret. Поддержка по подписке и общие вопросы.',
      }),
    },
  ]

  for (const route of staticRoutes) {
    writeRouteHtml(route.path, applySeoTags(baseHtml, route))
  }

  writeRouteHtml('/restaurants', createRedirectHtml({ from: '/restaurants', to: '/catalog/' }))

  let generatedCount = staticRoutes.length + 1

  const chains = groupChains(restaurants)
  for (const [chainSlug, { chainName, branches }] of chains) {
    writeRouteHtml(
      `/restaurants/${chainSlug}`,
      applySeoTags(baseHtml, {
        title: `${chainName} — адреса и меню сети с КБЖУ`,
        description: chainHubDescription(chainName, branches),
        canonical: `${BASE_URL}/restaurants/${chainSlug}/`,
        schema: chainHubSchema(chainSlug, chainName, branches),
        fallbackHtml: chainHubFallback(chainSlug, chainName, branches),
      }),
    )
    generatedCount += 1
  }

  for (const restaurant of restaurants.filter((r) => r.slug)) {
    const slug = restaurant.slug
    const name = getRestaurantName(restaurant)
    const description = getRestaurantDescription(restaurant)
    const menu = menuBySlug.get(slug)
    const dishes = flattenMenuForSeo(menu)
    const title = `Меню ${name} с КБЖУ — калории, белки, жиры, углеводы`

    writeRouteHtml(
      `/restaurants/${slug}`,
      createRedirectHtml({
        from: `/restaurants/${slug}`,
        to: `/restaurants/${slug}/menu/`,
        title,
      }),
    )

    writeRouteHtml(
      `/restaurants/${slug}/menu`,
      applySeoTags(baseHtml, {
        title,
        description,
        canonical: `${BASE_URL}/restaurants/${slug}/menu/`,
        schema: restaurantSchema(restaurant, dishes),
        fallbackHtml: restaurantFallback(restaurant, dishes),
      }),
    )

    writeRouteHtml(
      `/r/${slug}`,
      createRedirectHtml({
        from: `/r/${slug}`,
        to: `/restaurants/${slug}/menu/`,
        title: `${name} — меню с КБЖУ | RestaurantSecret`,
      }),
    )

    writeRouteHtml(
      `/r/${slug}/menu`,
      createRedirectHtml({
        from: `/r/${slug}/menu`,
        to: `/restaurants/${slug}/menu/`,
        title: `${name} — меню с КБЖУ | RestaurantSecret`,
      }),
    )

    writeRouteHtml(
      `/restaurant/${slug}`,
      createRedirectHtml({
        from: `/restaurant/${slug}`,
        to: `/restaurants/${slug}/menu/`,
        title: `${name} — меню с КБЖУ | RestaurantSecret`,
      }),
    )

    writeRouteHtml(
      `/restaurant/${slug}/menu`,
      createRedirectHtml({
        from: `/restaurant/${slug}/menu`,
        to: `/restaurants/${slug}/menu/`,
        title: `${name} — меню с КБЖУ | RestaurantSecret`,
      }),
    )

    generatedCount += 6
  }

  console.log(`✅ Static route entrypoints generated: ${generatedCount}`)
}

async function fetchAllRestaurants() {
  const errors = []

  for (const apiUrl of API_URLS) {
    // # `all=1` lists active restaurants across every city, not just the
    // # default-city subset the live catalog UI queries — otherwise the
    // # sitemap only ever covers Moscow.
    const url = `${apiUrl}/restaurants?limit=2000&all=1`

    try {
      const data = await fetchJson(url)
      return data.items ?? data ?? []
    } catch (error) {
      errors.push(`${url}: ${error?.message ?? String(error)}`)
    }
  }

  throw new Error(`All restaurant API endpoints failed: ${errors.join('; ')}`)
}

async function fetchRestaurantMenu(slug) {
  const errors = []

  for (const apiUrl of API_URLS) {
    const url = `${apiUrl}/restaurants/${encodeURIComponent(slug)}/menu`

    try {
      return await fetchJson(url)
    } catch (error) {
      errors.push(`${url}: ${error?.message ?? String(error)}`)
    }
  }

  throw new Error(errors.join('; '))
}

async function fetchRestaurantMenus(restaurants) {
  const targets = restaurants.filter((restaurant) => restaurant.slug)
  const menuBySlug = new Map()
  let nextIndex = 0
  let failedCount = 0

  async function worker() {
    while (nextIndex < targets.length) {
      const restaurant = targets[nextIndex]
      nextIndex += 1

      try {
        const menu = await fetchRestaurantMenu(restaurant.slug)
        menuBySlug.set(restaurant.slug, menu)
      } catch (error) {
        failedCount += 1
        console.warn(`⚠️  Failed to fetch menu for ${restaurant.slug}: ${error?.message ?? String(error)}`)
      }
    }
  }

  const workerCount = Math.min(MENU_FETCH_CONCURRENCY, targets.length)
  await Promise.all(Array.from({ length: workerCount }, worker))
  console.log(`   Menus fetched: ${menuBySlug.size}/${targets.length}${failedCount ? `, failed: ${failedCount}` : ''}`)
  return menuBySlug
}

function resolveSlugCollisions(restaurants) {
  // # A slug shared by several restaurant rows (a chain onboarded per branch,
  // # e.g. every single-location "Сыроварня" city sharing the bare slug
  // # `syrovarnya`) can't get one canonical `/restaurants/{slug}/menu/` page —
  // # the API itself only resolves it unambiguously when exactly one row owns
  // # the slug (see the backend's getRestaurantBySlug fallback). A bare URL
  // # with no ?city= still deterministically resolves to the DEFAULT_CITY row
  // # when one exists in the group (unchanged, existing behavior) — so that
  // # row keeps its sitemap entry/prerendered page exactly as before. Only the
  // # *other* rows sharing the slug (new now that every city is fetched, not
  // # just the previously Moscow-only list) get dropped, instead of racing to
  // # overwrite the Moscow entry's sitemap URL and static file.
  const bySlug = new Map()
  for (const restaurant of restaurants) {
    if (!restaurant.slug) continue
    const list = bySlug.get(restaurant.slug) ?? []
    list.push(restaurant)
    bySlug.set(restaurant.slug, list)
  }

  const resolved = []
  const droppedSlugs = []
  for (const [slug, list] of bySlug) {
    if (list.length === 1) {
      resolved.push(list[0])
      continue
    }
    const defaultCityMatches = list.filter((r) => r.city === DEFAULT_CITY)
    if (defaultCityMatches.length === 1) {
      resolved.push(defaultCityMatches[0])
    } else {
      // # No single deterministic winner (no Moscow row, or more than one) —
      // # can't safely represent any of them at this bare URL.
      droppedSlugs.push(slug)
    }
  }
  return { resolved, droppedSlugs }
}

async function main() {
  console.log('🔍 Fetching restaurants from API...')
  let restaurants = []

  try {
    restaurants = await fetchAllRestaurants()
  } catch (error) {
    if (STRICT_API_FETCH) {
      throw error
    }

    console.warn(`⚠️  Restaurant API unavailable; generating static-only sitemap: ${error?.message ?? String(error)}`)
  }

  console.log(`   Found ${restaurants.length} restaurants`)
  if (restaurants.length < MIN_RESTAURANTS) {
    throw new Error(`Restaurant count ${restaurants.length} is below required minimum ${MIN_RESTAURANTS}`)
  }

  const { resolved: sitemapRestaurants, droppedSlugs } = resolveSlugCollisions(restaurants)
  if (droppedSlugs.length) {
    console.warn(
      `⚠️  Dropping ${droppedSlugs.length} slug(s) shared by multiple restaurant rows with no single ${DEFAULT_CITY} ` +
        `match to fall back to (needs per-branch/city slugs before they can get their own canonical page): ` +
        `${droppedSlugs.slice(0, 10).join(', ')}${droppedSlugs.length > 10 ? '…' : ''}`,
    )
  }

  console.log('🔍 Fetching restaurant menus for prerender...')
  const menuBySlug = await fetchRestaurantMenus(sitemapRestaurants)

  const today = new Date().toISOString().split('T')[0]

  const staticUrls = [
    { loc: `${BASE_URL}/`,             priority: '1.0', changefreq: 'weekly',  lastmod: today },
    { loc: `${BASE_URL}/catalog/`,      priority: '0.9', changefreq: 'daily',   lastmod: today },
    { loc: `${BASE_URL}/how-it-works/`, priority: '0.6', changefreq: 'monthly', lastmod: today },
    { loc: `${BASE_URL}/tariffs/`,      priority: '0.6', changefreq: 'monthly', lastmod: today },
    { loc: `${BASE_URL}/support/`,      priority: '0.4', changefreq: 'monthly', lastmod: today },
  ]

  const restaurantUrls = sitemapRestaurants
    .filter((r) => r.slug)
    .map((r) => ({
      loc: `${BASE_URL}/restaurants/${r.slug}/menu/`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: r.updatedAt?.split('T')[0] ?? today,
    }))

  // # A chain's hub page (all its branches, one canonical URL) is a stronger
  // # SEO target than any single branch — give it a higher priority.
  const chainHubUrls = [...groupChains(sitemapRestaurants).keys()].map((chainSlug) => ({
    loc: `${BASE_URL}/restaurants/${chainSlug}/`,
    priority: '0.85',
    changefreq: 'weekly',
    lastmod: today,
  }))

  const allUrls = [...staticUrls, ...chainHubUrls, ...restaurantUrls]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <changefreq>${escapeXml(u.changefreq)}</changefreq>
    <priority>${escapeXml(u.priority)}</priority>
    <lastmod>${escapeXml(u.lastmod)}</lastmod>
  </url>`,
  )
  .join('\n')}
</urlset>`

  writeFileSync('dist/sitemap.xml', xml, 'utf-8')
  console.log(`✅ Sitemap generated: ${allUrls.length} URLs → dist/sitemap.xml`)

  generateStaticRoutes(sitemapRestaurants, menuBySlug)
}

main().catch((error) => {
  console.error('❌ Failed to generate sitemap:', error)
  process.exit(1)
})
