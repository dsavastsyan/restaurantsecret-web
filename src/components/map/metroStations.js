export function groupMetroStations(stations = []) {
  const groups = new Map()

  for (const station of stations) {
    const name = String(station?.name_ru || station?.name || '').trim()
    const rawLat = station?.lat
    const rawLon = station?.lon ?? station?.lng
    const lat = Number(rawLat)
    const lon = Number(rawLon)
    if (rawLat == null || rawLon == null || rawLat === '' || rawLon === '') continue
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const key = name.toLocaleLowerCase('ru-RU')
    const current = groups.get(key) || { name, lat: 0, lon: 0, count: 0 }
    current.lat += lat
    current.lon += lon
    current.count += 1
    groups.set(key, current)
  }

  return Array.from(groups.values()).map(({ name, lat, lon, count }) => ({
    name,
    lat: lat / count,
    lon: lon / count,
  }))
}
