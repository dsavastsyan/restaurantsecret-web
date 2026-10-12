export function hubCanonicalChainSlug(restaurant, resolvableChainSlugs) {
  const chainSlug = String(restaurant?.chainSlug ?? '').trim()
  return chainSlug && resolvableChainSlugs.has(chainSlug) ? chainSlug : null
}
