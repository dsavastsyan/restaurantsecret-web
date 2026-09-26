import { Fragment } from 'react'
import { normalizeCatalogMetroStations } from '@/lib/catalogMapItems'

export default function MetroStationsText({ restaurant, className = '' }) {
  const stations = normalizeCatalogMetroStations(restaurant)
  if (!stations.length) return null

  const accessibleLabel = stations
    .map((station) => `метро ${station.name}, ${station.distanceMeters} метров`)
    .join(', ')

  return (
    <div className={`metro-stations ${className}`.trim()} aria-label={accessibleLabel}>
      {stations.map((station, index) => (
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
  )
}
