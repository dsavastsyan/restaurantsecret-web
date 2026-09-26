export function collapseChainRestaurants(items) {
  const chainCounts = new Map()
  for (const item of items) {
    if (!item.chainSlug) continue
    chainCounts.set(item.chainSlug, (chainCounts.get(item.chainSlug) || 0) + 1)
  }

  const emittedChains = new Set()
  const result = []
  for (const item of items) {
    if (!item.chainSlug) {
      result.push(item)
      continue
    }
    if (emittedChains.has(item.chainSlug)) continue
    emittedChains.add(item.chainSlug)
    result.push({
      isChainCard: true,
      slug: item.chainSlug,
      name: item.chainName,
      cuisine: item.cuisine,
      chainCount: chainCounts.get(item.chainSlug) || 1,
    })
  }
  return result
}

export function getChainSearchSuggestions(
  items,
  query,
  {
    limit = 5,
    matchesQuery = (candidate, value) => String(candidate || '').toLowerCase().includes(String(value || '').toLowerCase()),
    getQueryScore = () => 0,
  } = {},
) {
  const normalizedQuery = String(query || '').trim()
  if (!normalizedQuery) return []

  const chains = new Map()
  for (const item of items) {
    const slug = String(item?.chainSlug || '').trim()
    const name = String(item?.chainName || '').trim()
    if (!slug || !name) continue

    const key = slug.toLowerCase()
    const existing = chains.get(key)
    if (existing) {
      existing.locationsCount += 1
    } else {
      chains.set(key, { slug, name, locationsCount: 1 })
    }
  }

  return Array.from(chains.values())
    .filter((chain) => matchesQuery(chain.name, normalizedQuery))
    .map((chain) => ({ ...chain, score: getQueryScore(chain.name, normalizedQuery) }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, 'ru'))
    .slice(0, Math.max(0, limit))
    .map(({ score: _score, ...chain }) => chain)
}
