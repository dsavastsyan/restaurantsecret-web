import { useMemo, useState } from 'react'

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="11" cy="11" r="6.2" />
    <path d="m16 16 4 4" />
  </svg>
)

export default function CatalogPlaceFilter({
  cuisines = [],
  selectedCuisines = [],
  onCuisinesChange,
  venueTypes = [],
  selectedVenueTypes = [],
  onVenueTypesChange,
}) {
  const [cuisineSearch, setCuisineSearch] = useState('')
  const normalizedSearch = cuisineSearch.trim().toLocaleLowerCase('ru-RU')
  const visibleCuisines = useMemo(() => (
    normalizedSearch
      ? cuisines.filter((cuisine) => cuisine.toLocaleLowerCase('ru-RU').includes(normalizedSearch))
      : cuisines
  ), [cuisines, normalizedSearch])

  const toggleCuisine = (cuisine) => {
    const next = selectedCuisines.includes(cuisine)
      ? selectedCuisines.filter((value) => value !== cuisine)
      : [...selectedCuisines, cuisine]
    onCuisinesChange(next)
  }

  const toggleVenueType = (venueType) => {
    const next = selectedVenueTypes.includes(venueType)
      ? selectedVenueTypes.filter((value) => value !== venueType)
      : [...selectedVenueTypes, venueType]
    onVenueTypesChange(next)
  }

  return (
    <div className="catalog-place-filter">
      <section className="catalog-place-filter__section" aria-labelledby="catalog-cuisine-title">
        <div className="catalog-place-filter__section-title">
          <strong id="catalog-cuisine-title">Кухня</strong>
          <span>множественный выбор</span>
        </div>
        <label className="catalog-place-filter__search">
          <SearchIcon />
          <span className="sr-only">Найти кухню</span>
          <input
            type="search"
            value={cuisineSearch}
            onChange={(event) => setCuisineSearch(event.target.value)}
            placeholder="Найти кухню"
            autoComplete="off"
          />
        </label>
        <div className="catalog-place-filter__cuisines" role="group" aria-labelledby="catalog-cuisine-title">
          {visibleCuisines.length ? visibleCuisines.map((cuisine) => {
            const isSelected = selectedCuisines.includes(cuisine)
            return (
              <label className={`catalog-place-filter__cuisine${isSelected ? ' is-selected' : ''}`} key={cuisine}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleCuisine(cuisine)}
                />
                <span>{cuisine}</span>
              </label>
            )
          }) : (
            <p className="catalog-place-filter__empty">Ничего не нашли</p>
          )}
        </div>
      </section>

      <section className="catalog-place-filter__section" aria-labelledby="catalog-venue-title">
        <div className="catalog-place-filter__section-title">
          <strong id="catalog-venue-title">Тип заведения</strong>
        </div>
        <div className="catalog-place-filter__venues" role="group" aria-labelledby="catalog-venue-title">
          {venueTypes.map((venueType) => {
            const isSelected = selectedVenueTypes.includes(venueType.id)
            return (
              <button
                key={venueType.id}
                type="button"
                className={`catalog-place-filter__venue${isSelected ? ' is-selected' : ''}`}
                aria-pressed={isSelected}
                onClick={() => toggleVenueType(venueType.id)}
              >
                {venueType.displayName || venueType.name}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
