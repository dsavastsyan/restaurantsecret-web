export const MENU_SORT_OPTIONS = [
  { field: 'kcal', label: 'Калории', defaultDirection: 'asc' },
  { field: 'protein', label: 'Белки', defaultDirection: 'desc' },
  { field: 'carbs', label: 'Углеводы', defaultDirection: 'asc' },
  { field: 'fat', label: 'Жиры', defaultDirection: 'asc' },
]

// Keep the API response order until the visitor explicitly chooses a metric
// and direction. This preserves the curated/photo-first order of menu cards.
export const DEFAULT_MENU_SORT = null

export function createDefaultMenuSort() {
  return null
}

export function getMenuSortOption(field) {
  return MENU_SORT_OPTIONS.find((option) => option.field === field) || MENU_SORT_OPTIONS[0]
}

export function getDefaultMenuSortDirection(field) {
  return getMenuSortOption(field).defaultDirection
}

export function toggleMenuSortDirection(direction) {
  return direction === 'asc' ? 'desc' : 'asc'
}

export function sortMenuDishes(dishes, sort = DEFAULT_MENU_SORT) {
  if (!sort?.field) return [...dishes]

  const field = getMenuSortOption(sort?.field).field
  const direction = sort?.direction === 'asc' || sort?.direction === 'desc'
    ? sort.direction
    : getDefaultMenuSortDirection(field)
  const multiplier = direction === 'asc' ? 1 : -1

  return dishes
    .map((dish, index) => ({ dish, index }))
    .sort((left, right) => {
      const leftValue = Number(left.dish?.[field])
      const rightValue = Number(right.dish?.[field])
      const leftHasValue = Number.isFinite(leftValue)
      const rightHasValue = Number.isFinite(rightValue)

      // Missing nutrition belongs at the end regardless of direction. This is
      // especially important for locked dishes whose macros are intentionally
      // omitted from the API response.
      if (leftHasValue !== rightHasValue) return leftHasValue ? -1 : 1
      if (leftHasValue && leftValue !== rightValue) {
        return (leftValue - rightValue) * multiplier
      }

      const leftHasPhoto = left.dish?.photoUrl || left.dish?.photo_url ? 1 : 0
      const rightHasPhoto = right.dish?.photoUrl || right.dish?.photo_url ? 1 : 0
      if (leftHasPhoto !== rightHasPhoto) return rightHasPhoto - leftHasPhoto
      return left.index - right.index
    })
    .map(({ dish }) => dish)
}
