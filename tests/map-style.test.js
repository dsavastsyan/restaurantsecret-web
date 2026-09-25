import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { groupMetroStations } from '../src/components/map/metroStations.js'
import { simplifyMapStyle } from '../src/components/map/mapStyle.js'

test('map style keeps useful roads while hiding decorative lines and localizing labels', () => {
  const updates = []
  const existingLayers = new Set(['highway_path', 'railway_dashline', 'boundary_3'])
  const map = {
    getLayer: (id) => existingLayers.has(id),
    getStyle: () => ({
      layers: [
        { id: 'highway-name-major', type: 'symbol', layout: { 'text-field': ['get', 'name_en'] } },
        { id: 'highway-shield', type: 'symbol', layout: { 'text-field': ['get', 'ref'] } },
        { id: 'highway-major', type: 'line', layout: {} },
      ],
    }),
    setLayoutProperty: (id, property, value) => updates.push({ id, property, value }),
  }

  simplifyMapStyle(map)

  assert.deepEqual(
    updates.filter(({ property }) => property === 'visibility').map(({ id }) => id),
    ['highway_path', 'railway_dashline', 'boundary_3'],
  )
  assert.deepEqual(updates.find(({ id }) => id === 'highway-name-major'), {
    id: 'highway-name-major',
    property: 'text-field',
    value: ['coalesce', ['get', 'name:ru'], ['get', 'name'], ['get', 'name:nonlatin']],
  })
  assert.equal(updates.some(({ id }) => id === 'highway-shield'), false)
  assert.equal(updates.some(({ id }) => id === 'highway-major'), false)
})

test('metro stations are deduplicated by name and invalid points are discarded', () => {
  const grouped = groupMetroStations([
    { name_ru: 'Китай-город', lat: 55.756, lon: 37.631 },
    { name_ru: 'китай-город', lat: 55.758, lon: 37.633 },
    { name_ru: 'Лубянка', lat: 55.76, lon: 37.628 },
    { name_ru: '', lat: 55.7, lon: 37.6 },
    { name_ru: 'Некорректная', lat: null, lon: null },
  ])

  assert.equal(grouped.length, 2)
  assert.equal(grouped[0].name, 'Китай-город')
  assert.ok(Math.abs(grouped[0].lat - 55.757) < 1e-9)
  assert.ok(Math.abs(grouped[0].lon - 37.632) < 1e-9)
  assert.deepEqual(grouped[1], { name: 'Лубянка', lat: 55.76, lon: 37.628 })
})

test('catalog uses the same clean vector style as develop and overlays metro stations', async () => {
  const baseLayerSource = await readFile(new URL('../src/components/map/CleanMapBaseLayer.jsx', import.meta.url), 'utf8')
  const source = await readFile(new URL('../src/components/CatalogMap.jsx', import.meta.url), 'utf8')

  assert.match(baseLayerSource, /tiles\.openfreemap\.org\/styles\/positron/)
  assert.match(baseLayerSource, /maplibreGL/)
  assert.doesNotMatch(baseLayerSource, /cartocdn|CARTO/)
  assert.match(source, /<CleanMapBaseLayer \/>/)
  assert.match(source, /<MetroStationsLayer stations=\{metroStations\} selectedStationNames=\{selectedMetroStationNames\} \/>/)
  assert.match(source, /metroStations = EMPTY_POINTS/)
  assert.match(source, /selectedMetroStationNames = EMPTY_POINTS/)
})
