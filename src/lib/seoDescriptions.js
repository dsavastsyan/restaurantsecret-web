export function pluralizeRu(n, [one, few, many]) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const DESCRIPTION_TAIL =
  'Постоянное обновление. Быстрые фильтры. Много белков. Мало жиров. Лучшая калорийность.'

// A dish count of 0 means "we don't know" (menu fetch failed at build time),
// not "the menu is empty" — so the count is dropped rather than published.
export function restaurantSeoDescription(name, dishCount) {
  const n = Number.isFinite(dishCount) && dishCount > 0 ? dishCount : 0
  const lead = n
    ? `${n} ${pluralizeRu(n, ['блюдо', 'блюда', 'блюд'])} с полным КБЖУ.`
    : 'Меню с полным КБЖУ.'
  return `${lead} ${DESCRIPTION_TAIL} Сравнивайте блюда ${name} перед посещением ресторана.`
}

export function chainHubSeoDescription(chainName, branchCount, dishCount = 0) {
  const branchWord = pluralizeRu(branchCount, ['филиал', 'филиала', 'филиалов'])
  // "Более N" always takes the genitive plural ("более 233 блюд", not "блюда").
  const dishes = Number.isFinite(dishCount) && dishCount > 0 ? ` Более ${dishCount} блюд.` : ''
  return `${branchCount} ${branchWord} с полным КБЖУ меню.${dishes} ${DESCRIPTION_TAIL} Сравнивайте блюда ${chainName} перед посещением ресторана.`
}
