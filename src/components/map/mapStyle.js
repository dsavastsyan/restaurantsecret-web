// The restaurant map needs roads and place labels, but not pedestrian trails,
// railway sleepers or minor/disputed boundaries competing with the markers.
const DECORATIVE_LINE_LAYER_IDS = [
  'highway_path',
  'highway-name-path',
  'railway_transit_dashline',
  'railway_service_dashline',
  'railway_dashline',
  'boundary_3',
  'boundary_disputed',
]

const LOCAL_LABEL = [
  'coalesce',
  ['get', 'name:ru'],
  ['get', 'name'],
  ['get', 'name:nonlatin'],
]

const METRO_STATION_FILTER = [
  'all',
  ['==', ['get', 'class'], 'railway'],
  ['==', ['get', 'subclass'], 'subway'],
]

const METRO_LAYERS = [
  {
    id: 'rs-metro-station-marker',
    type: 'circle',
    source: 'openmaptiles',
    'source-layer': 'poi',
    minzoom: 12,
    filter: METRO_STATION_FILTER,
    paint: {
      'circle-color': '#e53935',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 7, 16, 9],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2.5,
    },
  },
  {
    id: 'rs-metro-station-symbol',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'poi',
    minzoom: 12,
    filter: METRO_STATION_FILTER,
    layout: {
      'text-field': 'M',
      'text-font': ['Noto Sans Bold'],
      'text-size': 11,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#ffffff',
    },
  },
  {
    id: 'rs-metro-station-label',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'poi',
    minzoom: 13,
    filter: METRO_STATION_FILTER,
    layout: {
      'text-field': LOCAL_LABEL,
      'text-font': ['Noto Sans Bold'],
      'text-size': 13,
      'text-offset': [0, 1.15],
      'text-anchor': 'top',
    },
    paint: {
      'text-color': '#b42323',
      'text-halo-color': 'rgba(255, 255, 255, 0.96)',
      'text-halo-width': 2,
      'text-halo-blur': 0.5,
    },
  },
]

export function simplifyMapStyle(maplibreMap) {
  for (const layerId of DECORATIVE_LINE_LAYER_IDS) {
    if (maplibreMap.getLayer(layerId)) {
      maplibreMap.setLayoutProperty(layerId, 'visibility', 'none')
    }
  }

  for (const layer of maplibreMap.getStyle().layers || []) {
    const textField = layer.layout?.['text-field']
    const serializedTextField = JSON.stringify(textField) || ''
    if (layer.type === 'symbol' && serializedTextField.includes('name')) {
      maplibreMap.setLayoutProperty(layer.id, 'text-field', LOCAL_LABEL)
    }
  }

  for (const layer of METRO_LAYERS) {
    if (!maplibreMap.getLayer(layer.id)) {
      maplibreMap.addLayer(layer)
    }
  }
}
