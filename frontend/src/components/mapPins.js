import L from 'leaflet';

// Leaflet's stock marker loads image files that bundlers do not copy across, so
// pins are drawn as inline SVG instead.
export const pinIcon = (color = '#e8202a', scale = 1) => {
  const w = Math.round(34 * scale);
  const h = Math.round(44 * scale);
  return L.divIcon({
    className: '',
    iconSize: [w, h],
    iconAnchor: [w / 2, h - 2 * scale],
    popupAnchor: [0, -h + 6 * scale],
    html: `<svg width="${w}" height="${h}" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M17 1C8.7 1 2 7.6 2 15.8 2 26.6 17 42 17 42s15-15.4 15-26.2C32 7.6 25.3 1 17 1Z" fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="17" cy="15.5" r="5.5" fill="#fff"/></svg>`,
  });
};

// Every map uses CARTO's light basemap: OpenStreetMap data in a quiet style that
// lets the red pins stand out. CARTO serves it only with a (free) key; without
// one every tile is an "API KEY REQUIRED" placeholder, so with no key set the
// maps fall back to the standard OpenStreetMap tiles instead.
const CARTO_KEY = import.meta.env.VITE_CARTO_BASEMAPS_KEY?.trim();

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// `{r}` asks for sharp tiles on high-density screens.
export const BASEMAP_URL = CARTO_KEY
  ? `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_KEY)}`
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const BASEMAP_OPTIONS = CARTO_KEY
  ? { maxZoom: 20, attribution: `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>` }
  : { maxZoom: 19, attribution: OSM_ATTRIBUTION };
