import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { groupMetroStations } from '../src/components/map/metroStations.js'

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

test('clean base map uses no-key raster tiles and catalog overlays metro stations', async () => {
  const baseLayerSource = await readFile(new URL('../src/components/map/CleanMapBaseLayer.jsx', import.meta.url), 'utf8')
  const source = await readFile(new URL('../src/components/CatalogMap.jsx', import.meta.url), 'utf8')

  assert.match(baseLayerSource, /tile\.openstreetmap\.org/)
  assert.match(baseLayerSource, /<TileLayer/)
  assert.doesNotMatch(baseLayerSource, /OpenFreeMap|maplibre|cartocdn|CARTO/)
  assert.match(source, /<CleanMapBaseLayer \/>/)
  assert.match(source, /<MetroStationsLayer stations=\{metroStations\} \/>/)
  assert.match(source, /metroStations = EMPTY_POINTS/)
})
