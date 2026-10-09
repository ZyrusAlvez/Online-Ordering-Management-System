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

export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
