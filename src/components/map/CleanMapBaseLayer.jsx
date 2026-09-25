import { TileLayer } from 'react-leaflet'
import './clean-map.css'

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export default function CleanMapBaseLayer() {
  return (
    <TileLayer
      url={TILE_URL}
      attribution={TILE_ATTRIBUTION}
      subdomains="abc"
      maxNativeZoom={19}
    />
  )
}
