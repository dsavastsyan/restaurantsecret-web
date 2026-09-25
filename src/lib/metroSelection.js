export function normalizeMetroStationName(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeLineId(value) {
  return String(value ?? '')
}

function normalizeLineColor(value) {
  const color = String(value || '').trim().replace(/^#/, '')
  return /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : '#94a3b8'
}

export function buildMetroLineGroups(lines = [], stations = []) {
  const stationsByLine = new Map()

  for (const station of stations) {
    const name = String(station?.name_ru || '').trim()
    const key = normalizeMetroStationName(name)
    if (!key) continue

    const lineId = normalizeLineId(station?.line_id)
    if (!stationsByLine.has(lineId)) stationsByLine.set(lineId, new Map())

    const lineStations = stationsByLine.get(lineId)
    const existing = lineStations.get(key) || { key, name_ru: name, points: [] }
    const lat = Number(station?.lat)
    const lon = Number(station?.lon)

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      existing.points.push({ lat, lon })
    }

    lineStations.set(key, existing)
  }

  return lines
    .map((line) => {
      const id = normalizeLineId(line?.id)
      const lineStations = Array.from(stationsByLine.get(id)?.values() || [])
        .sort((a, b) => a.name_ru.localeCompare(b.name_ru, 'ru'))

      return {
        id,
        name_ru: String(line?.name_ru || line?.short_name || '').trim(),
        color: normalizeLineColor(line?.color_hex),
        stations: lineStations,
      }
    })
    .filter((line) => line.name_ru && line.stations.length > 0)
}

export function getMetroSelectionPoints(stations = [], selectedStationNames = []) {
  const selectedNames = new Set(selectedStationNames.map(normalizeMetroStationName).filter(Boolean))
  const seen = new Set()
  const points = []

  for (const station of stations) {
    if (!selectedNames.has(normalizeMetroStationName(station?.name_ru))) continue

    const lat = Number(station?.lat)
    const lon = Number(station?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const pointKey = `${lat}:${lon}`
    if (seen.has(pointKey)) continue
    seen.add(pointKey)
    points.push({ lat, lon })
  }

  return points
}
