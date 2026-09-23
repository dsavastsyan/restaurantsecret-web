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
