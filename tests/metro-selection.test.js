import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMetroLineGroups,
  getMetroSelectionPoints,
  normalizeMetroStationName,
} from '../src/lib/metroSelection.js'

const lines = [
  { id: 1, name_ru: 'Красная линия', color_hex: 'ff0000' },
  { id: 2, name_ru: 'Синяя линия', color_hex: '#0000ff' },
]

const stations = [
  { id: 1, line_id: 1, name_ru: 'Альфа', lat: 55.1, lon: 37.1 },
  { id: 2, line_id: 1, name_ru: 'Пересадочная', lat: 55.2, lon: 37.2 },
  { id: 3, line_id: 2, name_ru: 'Пересадочная', lat: 55.2001, lon: 37.2001 },
  { id: 4, line_id: 2, name_ru: 'Бета', lat: 55.3, lon: 37.3 },
]

test('buildMetroLineGroups creates colored line groups with sorted stations', () => {
  const groups = buildMetroLineGroups(lines, stations)

  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].stations.map((station) => station.name_ru), ['Альфа', 'Пересадочная'])
  assert.equal(groups[0].color, '#ff0000')
  assert.deepEqual(groups[1].stations.map((station) => station.name_ru), ['Бета', 'Пересадочная'])
})

test('getMetroSelectionPoints includes every selected station coordinate and removes duplicates', () => {
  const points = getMetroSelectionPoints(
    [...stations, { ...stations[0], id: 5 }],
    ['Альфа', 'Пересадочная'],
  )

  assert.deepEqual(points, [
    { lat: 55.1, lon: 37.1 },
    { lat: 55.2, lon: 37.2 },
    { lat: 55.2001, lon: 37.2001 },
  ])
})

test('normalizeMetroStationName makes selection matching case-insensitive', () => {
  assert.equal(normalizeMetroStationName('  АРБАТСКАЯ '), 'арбатская')
})
