// Обычные меню ресторанов (состав, цена, вес) с нашей оценкой КБЖУ по составу.
// Сервер отдаёт их в `/restaurants/:slug/menu?plain=1` только при флаге `plain_menus`:
// `plainMenu` — у ресторана без КБЖУ-меню, `estimatedTab` — вторая вкладка «По составу»
// у ресторана с КБЖУ-меню. Контракт: product/solutions/plain-menus/API.md в корне RestSecret.
//
// Позиции с оценкой превращаются в обычные «блюда» страницы меню, чтобы поиск, фильтры
// по КБЖУ и сортировка работали без отдельной ветки (решение 27.11: фильтры учитывают
// оценки по умолчанию). Отличает их флаг `isEstimate`: плитка рисует их иначе.

const num = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const round = (value) => Math.round(value)

export function hasPlainMenu(plainMenu) {
  return Boolean(plainMenu && (plainMenu.sections?.length || plainMenu.no_data?.length))
}

// «M 265 г», «330/50/20/50 г» — как в меню ресторана; иначе «265 г» / «400 мл»; нет — null.
export function plainWeightText(offer) {
  const portion = offer?.portion || {}
  const grams = num(portion.g)
  const ml = num(portion.ml)
  if (portion.raw && (grams || ml)) return String(portion.raw)
  if (grams && grams > 0) return `${round(grams)} г`
  if (ml && ml > 0) return `${round(ml)} мл`
  return null
}

// Подпись под цифрами: на что посчитано. Без веса в меню оценка остаётся на 100 г.
export function estimateBasisText(kbju) {
  if (!kbju) return ''
  if (kbju.basis === 'per_portion') {
    const amount = num(kbju.amount)
    const unit = kbju.unit === 'ml' ? 'мл' : 'г'
    return amount ? `Посчитали по составу, на порцию ${round(amount)} ${unit}` : 'Посчитали по составу, на порцию'
  }
  if (kbju.basis === 'per_100ml') return 'Посчитали по составу, на 100 мл'
  return 'Посчитали по составу, на 100 г, вес не указан'
}

export function noDataReasonText(kbju) {
  return kbju?.reason === 'not_estimated'
    ? 'КБЖУ ещё не посчитали'
    : 'КБЖУ не посчитали: в меню нет состава'
}

// Строки для блока «Как посчитали»: продукты с граммами на эту порцию
// (или на 100 г, если вес в меню не указан).
export function howCalculatedIngredients(kbju) {
  const ingredients = Array.isArray(kbju?.ingredients) ? kbju.ingredients : []
  const amount = kbju?.basis === 'per_portion' ? num(kbju.amount) : 100
  return ingredients
    .filter((item) => item?.name)
    .map((item) => {
      const per100 = num(item.grams_per_100)
      const grams = per100 !== null && amount ? round((per100 * amount) / 100) : null
      return grams ? `${item.name} ≈${grams} г` : item.name
    })
}

export function plainOfferToDish(offer, sectionTitle) {
  const kbju = offer?.kbju || {}
  const estimated = kbju.status === 'estimated'
  const macrosHidden = Boolean(kbju.macros_hidden)
  const grams = num(offer?.portion?.g)
  return {
    id: offer?.id,
    name: offer?.name || '',
    category: sectionTitle || offer?.section || 'Меню',
    description: offer?.composition || '',
    ingredients: offer?.composition || '',
    price: num(offer?.price_rub),
    priceFrom: Boolean(offer?.price_from),
    weight: grams,
    kcal: estimated ? num(kbju.kcal) : null,
    protein: estimated && !macrosHidden ? num(kbju.protein_g) : null,
    fat: estimated && !macrosHidden ? num(kbju.fat_g) : null,
    carbs: estimated && !macrosHidden ? num(kbju.carbs_g) : null,
    isEstimate: estimated,
    plainOffer: offer,
    weightText: plainWeightText(offer),
    estimate: estimated
      ? {
        basis: kbju.basis,
        basisText: estimateBasisText(kbju),
        macrosHidden,
        assumptions: kbju.assumptions || '',
        sources: Array.isArray(kbju.sources) ? kbju.sources : [],
        ingredients: howCalculatedIngredients(kbju),
      }
      : null,
  }
}

// Меню в форме, которую понимает страница (categories → dishes), из обычного меню.
export function plainMenuToCategories(plainMenu) {
  const sections = Array.isArray(plainMenu?.sections) ? plainMenu.sections : []
  return sections
    .map((section) => {
      const title = section?.title || 'Меню'
      return {
        name: title,
        dishes: (section?.items || []).map((offer) => plainOfferToDish(offer, title)),
      }
    })
    .filter((category) => category.dishes.length)
}

export function plainNoDataDishes(plainMenu) {
  return (Array.isArray(plainMenu?.no_data) ? plainMenu.no_data : [])
    .map((offer) => ({ ...plainOfferToDish(offer, offer?.section), reasonText: noDataReasonText(offer?.kbju) }))
}

export function plainMenuCounts(plainMenu) {
  const estimated = num(plainMenu?.counts?.estimated)
    ?? (plainMenu?.sections || []).reduce((total, section) => total + (section?.items?.length || 0), 0)
  const noData = num(plainMenu?.counts?.no_data) ?? (plainMenu?.no_data?.length || 0)
  return { total: num(plainMenu?.counts?.total) ?? estimated + noData, estimated, noData }
}

// Какое меню показывать: своё КБЖУ ресторана, обычное меню или вкладку «По составу».
// kbjuKind 'estimated' — у ресторана только обычное меню; вкладка — только при estimatedTab.
export function resolvePlainView(raw, activeTab) {
  const kbjuKind = raw?.kbjuKind
  if (kbjuKind === 'estimated' && hasPlainMenu(raw?.plainMenu)) {
    return { mode: 'estimated', plainMenu: raw.plainMenu, tabs: null }
  }
  if (hasPlainMenu(raw?.estimatedTab)) {
    const restaurantCount = num(raw?.dishCount) ?? null
    const tabs = { active: activeTab === 'estimated' ? 'estimated' : 'restaurant', restaurantCount, estimatedCount: plainMenuCounts(raw.estimatedTab).total }
    return tabs.active === 'estimated'
      ? { mode: 'estimated', plainMenu: raw.estimatedTab, tabs }
      : { mode: 'restaurant', plainMenu: null, tabs }
  }
  return { mode: 'restaurant', plainMenu: null, tabs: null }
}
