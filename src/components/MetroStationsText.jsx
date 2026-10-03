import { Fragment, useEffect, useMemo, useState } from 'react'
import { normalizeCatalogMetroStations } from '@/lib/catalogMapItems'

export default function MetroStationsText({ restaurant, className = '' }) {
  const stations = normalizeCatalogMetroStations(restaurant)
  const stationsKey = useMemo(
    () => stations.map((station) => `${station.name}:${station.distanceMeters}`).join('|'),
    [stations],
  )
  const [expanded, setExpanded] = useState(false)

  useEffect(() => setExpanded(false), [stationsKey])

  if (!stations.length) return null

  const visibleStations = expanded ? stations : stations.slice(0, 2)

  const accessibleLabel = visibleStations
    .map((station) => `метро ${station.name}, ${station.distanceMeters} метров`)
    .join(', ')

  return (
    <div className={`metro-stations ${className}`.trim()} aria-label={accessibleLabel}>
      <div className="metro-stations__list">
        {visibleStations.map((station, index) => (
          <Fragment key={`${station.name}-${station.lineColorHex || 'unknown'}`}>
            {index > 0 && <span aria-hidden="true">, </span>}
            <span className="metro-stations__station" aria-hidden="true">
              <span
                className="metro-stations__symbol"
                style={station.lineColorHex ? { color: station.lineColorHex } : undefined}
              >
                м
              </span>{' '}
              {station.name} ({station.distanceMeters}м)
            </span>
          </Fragment>
        ))}
      </div>
      {stations.length > 2 && (
        <button
          className="metro-stations__toggle"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Свернуть' : 'Развернуть все'}
        </button>
      )}
    </div>
  )
}
