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
}
