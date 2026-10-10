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

// The standard OpenStreetMap style is busy and colourful, so without the CARTO key
// it is greyed out (`map-tiles-muted` in index.css) to keep the same quiet look.
export const BASEMAP_OPTIONS = CARTO_KEY
  ? { maxZoom: 20, attribution: `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>` }
  : { maxZoom: 19, attribution: OSM_ATTRIBUTION, className: 'map-tiles-muted' };

/**
 * A branch on the branch map: the restaurant's logo in a round badge, so every
 * branch reads as 3K Kitchen at a glance. The customer's branch is larger with a
 * red ring. Styled in index.css (`.map-logo`).
 */
export const logoIcon = (logoUrl, selected = false, compact = false) => {
  // Smaller on a phone-width map, where nearby branches would otherwise overlap.
  const size = compact ? (selected ? 42 : 30) : selected ? 58 : 44;
  const src = String(logoUrl).replace(/"/g, '%22');
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
    tooltipAnchor: [0, -size / 2 - 4],
    html: `<span class="map-logo${selected ? ' map-logo--selected' : ''}"><img src="${src}" alt="" draggable="false" /></span>`,
  });
};

/**
 * Tile options for the landing-page branch map: the same tiles, washed out to
 * near-white. CARTO's light tiles are already pale, so they only lose their tint.
 */
export const WHITE_BASEMAP_OPTIONS = {
  ...BASEMAP_OPTIONS,
  className: CARTO_KEY ? 'map-tiles-white-soft' : 'map-tiles-white',
};

/** Quiet controls shared by every map: zoom bottom-right, and only the data credits (no Leaflet prefix). */
export const minimalControls = (map) => {
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false);
};
