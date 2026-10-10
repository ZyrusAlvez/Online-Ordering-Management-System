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

// The branch pin, drawn on a 64 x 84 grid: a red teardrop whose round head holds
// a white disc (centre 32,28, radius 17) showing the logo, standing on a ring at
// its tip (32,72). The logo is an <image> inside the SVG, clipped to the disc, so
// no outside stylesheet (Leaflet's resets marker images) can move or hide it.
const PIN_W = 64;
const PIN_H = 84;
const PIN_TIP_Y = 72;
let clipIds = 0;

const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const pinSvg = (logoUrl) => {
  const clip = `map-pin-disc-${(clipIds += 1)}`;
  return `<svg viewBox="0 0 ${PIN_W} ${PIN_H}" aria-hidden="true">
  <defs><clipPath id="${clip}"><circle cx="32" cy="28" r="15.5" /></clipPath></defs>
  <ellipse class="map-pin__ring" cx="32" cy="${PIN_TIP_Y}" rx="20" ry="5.5" />
  <path class="map-pin__body" d="M32 2C17.6 2 6 13.6 6 28c0 18.5 26 44 26 44s26-25.5 26-44C58 13.6 46.4 2 32 2Z" />
  <circle cx="32" cy="28" r="17" fill="#fff" />
  <image href="${escapeAttr(logoUrl)}" x="16.5" y="12.5" width="31" height="31" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})" />
</svg>`;
};

/**
 * A branch on the branch map: a red pin with the restaurant's logo in its head,
 * so every branch reads as 3K Kitchen at a glance. The customer's branch is the
 * larger one. Styled in index.css (`.map-pin`).
 */
export const logoIcon = (logoUrl, selected = false, compact = false) => {
  // Smaller on a phone-width map, where nearby branches would otherwise overlap.
  const width = compact ? (selected ? 40 : 30) : selected ? 54 : 40;
  const height = Math.round((width * PIN_H) / PIN_W);
  const tipY = Math.round((height * PIN_TIP_Y) / PIN_H);
  return L.divIcon({
    className: '',
    iconSize: [width, height],
    // The tip of the pin is the branch's exact spot.
    iconAnchor: [width / 2, tipY],
    popupAnchor: [0, -tipY + 4],
    tooltipAnchor: [0, -tipY],
    html: `<span class="map-pin${selected ? ' map-pin--selected' : ''}">${pinSvg(logoUrl)}</span>`,
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
