import MetroFilter from './MetroFilter.jsx'

const MODES = [
  { id: 'metro', label: 'У метро' },
  { id: 'nearby', label: 'Рядом с точкой' },
  { id: 'center', label: 'В центре' },
]

const RADII_KM = [1, 3, 5, 10]

export default function CatalogLocationFilter({
  mode,
  onModeChange,
  radiusKm,
  onRadiusChange,
  metroData,
  selectedStationNames,
  onMetroChange,
  pointLabel,
  addressQuery,
  onAddressQueryChange,
  onAddressSearch,
  addressResults,
  addressLoading,
  addressError,
  onSelectAddress,
  onUseCurrentLocation,
  geolocationLoading,
  geolocationError,
  onPickOnMap,
  isPickingOnMap,
}) {
  return (
    <fieldset className="catalog-location-filter">
      <legend>Где удобно?</legend>

      <div className="catalog-location-filter__modes" role="group" aria-label="Способ выбора места">
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            className={mode === option.id ? 'is-active' : ''}
            aria-pressed={mode === option.id}
            onClick={() => onModeChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="catalog-location-filter__body">
        {mode === 'metro' && (
          <div className="catalog-location-filter__metro">
            <span className="catalog-location-filter__caption">Станции</span>
            <MetroFilter
              metroData={metroData}
              selectedStationNames={selectedStationNames}
              onChange={onMetroChange}
            />
          </div>
        )}

        {mode === 'nearby' && (
          <div className="catalog-location-filter__nearby">
            <div className="catalog-location-filter__point-actions">
              <button type="button" onClick={onUseCurrentLocation} disabled={geolocationLoading}>
                {geolocationLoading ? 'Определяем…' : 'Моё местоположение'}
              </button>
              <button type="button" onClick={onPickOnMap} aria-pressed={isPickingOnMap}>
                {isPickingOnMap ? 'Нажмите на карту' : 'Указать на карте'}
              </button>
            </div>

            <div className="catalog-location-filter__address">
              <label htmlFor="catalog-address">Адрес или место</label>
              <div className="catalog-location-filter__address-row">
                <input
                  id="catalog-address"
                  name="catalog-address"
                  type="search"
                  value={addressQuery}
                  onChange={(event) => onAddressQueryChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onAddressSearch()
                    }
                  }}
                  placeholder="Например, Тверская, 7…"
                  autoComplete="off"
                />
                <button type="button" onClick={onAddressSearch} disabled={addressLoading || addressQuery.trim().length < 3}>
                  {addressLoading ? 'Ищем…' : 'Найти'}
                </button>
              </div>
              {addressResults.length > 0 && (
                <ul
                  className="catalog-location-filter__address-results"
                  aria-label="Найденные адреса"
                  aria-live="polite"
                >
                  {addressResults.map((result) => (
                    <li key={result.id}>
                      <button type="button" onClick={() => onSelectAddress(result)}>{result.label}</button>
                    </li>
                  ))}
                </ul>
              )}
              <a
                className="catalog-location-filter__attribution"
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                Адреса © OpenStreetMap
              </a>
            </div>

            {(pointLabel || geolocationError || addressError) && (
              <p className={`catalog-location-filter__status${geolocationError || addressError ? ' is-error' : ''}`} role="status">
                {geolocationError || addressError || `Выбрано: ${pointLabel}`}
              </p>
            )}
          </div>
        )}

        {mode === 'center' && (
          <p className="catalog-location-filter__center-note">
            Ищем от центральной точки выбранного города.
          </p>
        )}

        <div className="catalog-location-filter__radius">
          <span className="catalog-location-filter__caption">Радиус</span>
          <div role="group" aria-label="Допустимый радиус">
            {RADII_KM.map((value) => (
              <button
                key={value}
                type="button"
                className={radiusKm === value ? 'is-active' : ''}
                aria-pressed={radiusKm === value}
                onClick={() => onRadiusChange(value)}
              >
                {value} км
              </button>
            ))}
          </div>
        </div>
      </div>
    </fieldset>
  )
}
