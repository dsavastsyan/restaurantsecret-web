import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { simplifyMapStyle } from '../src/components/map/mapStyle.js'

test('map style keeps useful roads while hiding decorative lines and localizing labels', () => {
  const updates = []
  const addedLayers = []
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
    addLayer: (layer) => addedLayers.push(layer),
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

  assert.deepEqual(addedLayers.map(({ id }) => id), [
    'rs-metro-station-marker',
    'rs-metro-station-symbol',
    'rs-metro-station-label',
  ])

  for (const layer of addedLayers) {
    assert.equal(layer.source, 'openmaptiles')
    assert.equal(layer['source-layer'], 'poi')
    assert.deepEqual(layer.filter, [
      'all',
      ['==', ['get', 'class'], 'railway'],
      ['==', ['get', 'subclass'], 'subway'],
    ])
  }

  assert.equal(addedLayers[0].paint['circle-color'], '#e53935')
  assert.equal(addedLayers[1].layout['text-field'], 'M')
  assert.deepEqual(addedLayers[2].layout['text-field'], [
    'coalesce',
    ['get', 'name:ru'],
    ['get', 'name'],
    ['get', 'name:nonlatin'],
  ])
})

test('catalog map renders the shared clean base layer instead of OSM raster tiles', async () => {
  const source = await readFile(new URL('../src/components/CatalogMap.jsx', import.meta.url), 'utf8')

  assert.match(source, /<CleanMapBaseLayer \/>/)
  assert.doesNotMatch(source, /tile\.openstreetmap\.org/)
  assert.doesNotMatch(source, /<TileLayer/)
})
