import test from 'node:test'
import assert from 'node:assert/strict'
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
