import { TileLayer } from 'react-leaflet'
import './clean-map.css'

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION = [
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  '&copy; <a href="https://carto.com/attributions">CARTO</a>',
].join(' ')

export default function CleanMapBaseLayer() {
  return (
    <TileLayer
      url={TILE_URL}
      attribution={TILE_ATTRIBUTION}
      subdomains="abcd"
      maxNativeZoom={20}
    />
  )
}
