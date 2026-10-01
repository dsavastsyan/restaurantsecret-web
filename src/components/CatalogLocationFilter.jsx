import { useMemo, useState } from 'react'
import { buildMetroLineGroups, normalizeMetroStationName } from '@/lib/metroSelection'

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
  const [metroSearch, setMetroSearch] = useState('')
  const [expandedLineIds, setExpandedLineIds] = useState(() => new Set())
  const lineGroups = useMemo(
    () => buildMetroLineGroups(metroData.lines || [], metroData.stations || []),
    [metroData.lines, metroData.stations],
  )
  const visibleLineGroups = useMemo(() => {
    const normalizedQuery = metroSearch.trim().toLocaleLowerCase('ru-RU')
    return lineGroups
      .map((line) => ({
        ...line,
        stations: line.stations.filter((station) => (
          !normalizedQuery
          || station.name_ru.toLocaleLowerCase('ru-RU').includes(normalizedQuery)
        )),
      }))
      .filter((line) => line.stations.length > 0)
  }, [lineGroups, metroSearch])
  const selectedKeys = useMemo(
    () => new Set(selectedStationNames.map(normalizeMetroStationName).filter(Boolean)),
    [selectedStationNames],
  )

  const toggleStation = (stationName) => {
    const normalized = normalizeMetroStationName(stationName)
    const next = selectedStationNames.filter((name) => normalizeMetroStationName(name) !== normalized)
    if (!selectedKeys.has(normalized)) next.push(stationName)
    onMetroChange(next.sort((a, b) => a.localeCompare(b, 'ru')))
  }

  const toggleLine = (lineId) => {
    setExpandedLineIds((current) => {
      const next = new Set(current)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })
  }

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
            <label className="catalog-location-filter__search">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="11" cy="11" r="6.2" />
                <path d="m16 16 4 4" />
              </svg>
              <span className="sr-only">Найти станцию метро</span>
              <input
                type="search"
                value={metroSearch}
                onChange={(event) => setMetroSearch(event.target.value)}
                placeholder="Найти станцию метро"
                autoComplete="off"
              />
            </label>

            {selectedStationNames.length > 0 && (
              <div className="catalog-location-filter__selected" aria-label="Выбранные станции метро">
                {selectedStationNames.map((stationName) => (
                  <button
                    key={stationName}
                    type="button"
                    className="catalog-location-filter__mini-chip"
                    onClick={() => toggleStation(stationName)}
                  >
                    {stationName} <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}

            <div className="catalog-location-filter__lines" role="group" aria-label="Ветки метро">
              {visibleLineGroups.length ? visibleLineGroups.map((line) => {
                const isExpanded = Boolean(metroSearch.trim()) || expandedLineIds.has(line.id)
                return (
                  <div className="catalog-location-filter__line-group" key={line.id}>
                    <button
                      type="button"
                      className={`catalog-location-filter__line-toggle${isExpanded ? ' is-expanded' : ''}`}
                      aria-expanded={isExpanded}
                      onClick={() => toggleLine(line.id)}
                    >
                      <span
                        className="catalog-location-filter__line-color"
                        style={{ backgroundColor: line.color }}
                        aria-hidden="true"
                      />
                      <span className="catalog-location-filter__line-name">{line.name_ru}</span>
                      <span className="catalog-location-filter__line-count">{line.stations.length}</span>
                      <span className="catalog-location-filter__line-chevron" aria-hidden="true">⌄</span>
                    </button>
                    {isExpanded && (
                      <div className="catalog-location-filter__line-stations" role="group" aria-label={`Станции: ${line.name_ru}`}>
                        {line.stations.map((station) => {
                          const isSelected = selectedKeys.has(station.key)
                          return (
                            <label className={`catalog-location-filter__station${isSelected ? ' is-selected' : ''}`} key={`${line.id}:${station.key}`}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleStation(station.name_ru)}
                              />
                              <span className="catalog-location-filter__station-name">{station.name_ru}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              }) : (
                <p className="catalog-location-filter__empty">Ничего не нашли</p>
              )}
            </div>
          </div>
        )}

        {mode === 'nearby' && (
          <div className="catalog-location-filter__nearby">
            <div className="catalog-location-filter__location-card">
              <div className="catalog-location-filter__location-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 2V5M12 19v3M2 12h3M19 12h3" />
                </svg>
              </div>
              <div className="catalog-location-filter__location-copy">
                <strong>Моё местоположение</strong>
                <span>Использовать текущую точку</span>
              </div>
              <button type="button" onClick={onUseCurrentLocation} disabled={geolocationLoading}>
                {geolocationLoading ? 'Определяем…' : 'Выбрать'}
              </button>
            </div>

            <label className="catalog-location-filter__search catalog-location-filter__address">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="11" cy="11" r="6.2" />
                <path d="m16 16 4 4" />
              </svg>
              <span className="sr-only">Введите адрес</span>
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
                placeholder="Введите адрес"
                autoComplete="off"
              />
              {addressQuery.trim().length >= 3 && (
                <button type="button" onClick={onAddressSearch} disabled={addressLoading}>
                  {addressLoading ? 'Ищем…' : 'Найти'}
                </button>
              )}
            </label>
            <div className="catalog-location-filter__address-results-wrap">
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
            </div>

            <button type="button" className="catalog-location-filter__map-action" onClick={onPickOnMap} aria-pressed={isPickingOnMap}>
              {isPickingOnMap ? 'Нажмите на карту' : 'Указать точку на карте'} <span aria-hidden="true">→</span>
            </button>
            <a
              className="catalog-location-filter__attribution"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              Адреса © OpenStreetMap
            </a>

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
