// The map endpoint's compact format (`format=compact`, see RestaurantSecret
// functions/routes/restaurants.js buildCompactMapPayload) sends each restaurant
// and metro station once and every point as a fixed-order array of indexes into
// them — ~5x smaller than repeating a chain's fields on each of its branches.
// Expanding it here yields the same flat point objects the full format has, so
// the map components and catalog filters stay format-agnostic.

function expandPointMetro(metro, stations) {
  const metroStations = []
  if (!Array.isArray(metro)) return metroStations
  for (let index = 0; index + 1 < metro.length; index += 2) {
    const station = stations[metro[index]]
    if (!Array.isArray(station) || !station[0]) continue
    metroStations.push({
      name: station[0],
      lineColorHex: station[1] ?? null,
      distanceMeters: metro[index + 1],
    })
  }
  return metroStations
}

export function expandRestaurantMapPayload(payload) {
  // A backend without the compact format ignores the parameter and answers in
  // the full one; pass that through untouched.
  if (!payload || !Array.isArray(payload.points)) {
    const items = Array.isArray(payload?.items) ? payload.items : []
    return { items, count: items.length, truncated: Boolean(payload?.truncated) }
  }

  const restaurants = Array.isArray(payload.restaurants) ? payload.restaurants : []
  const stations = Array.isArray(payload.stations) ? payload.stations : []
  const fields = Array.isArray(payload.pointFields) ? payload.pointFields : []
  const column = (name, fallback) => {
    const index = fields.indexOf(name)
    return index === -1 ? fallback : index
  }
  const columns = {
    locationId: column('locationId', 0),
    restaurant: column('restaurant', 1),
    lat: column('lat', 2),
    lon: column('lon', 3),
    address: column('address', 4),
    source: column('source', 5),
    metro: column('metro', 6),
  }

  const items = []
  for (const point of payload.points) {
    const restaurant = restaurants[point?.[columns.restaurant]]
    if (!restaurant) continue
    const locationId = point[columns.locationId]
    const metroStations = expandPointMetro(point[columns.metro], stations)
    items.push({
      id: `location:${locationId}`,
      locationId,
      restaurantId: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      city: restaurant.city,
      address: point[columns.address] ?? null,
      lat: point[columns.lat],
      lon: point[columns.lon],
      locationSource: point[columns.source] ? 'google_places' : 'manual',
      createdAt: restaurant.createdAt ?? null,
      menuAddedAt: restaurant.menuAddedAt ?? null,
      instagramUrl: restaurant.instagramUrl ?? null,
      metro: metroStations[0]?.name ?? null,
      metroNames: Array.from(new Set(metroStations.map((station) => station.name))),
      metroStations,
      cuisine: restaurant.cuisine ?? null,
      primary_venue_type: restaurant.primary_venue_type ?? null,
      autoUpdated: Boolean(restaurant.autoUpdated),
    })
  }

  return { items, count: items.length, truncated: Boolean(payload.truncated) }
}
