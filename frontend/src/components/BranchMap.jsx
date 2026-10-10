import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatKm, haversineKm, hoursLabel, isOpenNow } from '../lib/geo.js';
import { useSiteImage } from '../lib/siteImages.js';
import { BASEMAP_URL, WHITE_BASEMAP_OPTIONS, logoIcon, minimalControls } from './mapPins.js';

const BRAND = '#e8202a';
const INK = '#3a2a22';

/** Popup body, built as DOM so the "Order here" button can carry a handler. */
const popupFor = (branch, { selected, userPos, onSelect }) => {
  const root = L.DomUtil.create('div', 'branch-popup');
  root.style.minWidth = '180px';

  const title = L.DomUtil.create('p', '', root);
  title.style.cssText = 'margin:0;font-weight:700;font-size:15px';
  title.textContent = branch.name;

  const line = (text, css = '') => {
    const p = L.DomUtil.create('p', '', root);
    p.style.cssText = `margin:2px 0 0;font-size:12px;color:#6b5a50;${css}`;
    p.textContent = text;
  };
  if (branch.address) line(branch.address);
  const open = isOpenNow(branch);
  line(`${open ? 'Open now' : 'Closed now'} · ${hoursLabel(branch)}`, `color:${open ? '#15803d' : '#b45309'};font-weight:600`);
  if (userPos) line(`${formatKm(haversineKm(userPos, branch))} from you`);

  const button = L.DomUtil.create('button', '', root);
  button.type = 'button';
  button.textContent = selected ? 'Your branch ✓' : 'Order here';
  button.style.cssText = `margin-top:10px;width:100%;border:0;border-radius:8px;padding:6px 10px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;color:#fff;background:${selected ? INK : BRAND}`;
  L.DomEvent.on(button, 'click', (e) => {
    L.DomEvent.stop(e);
    onSelect?.(branch.id);
  });
  return root;
};

/**
 * Every branch on one map. The view is fitted to the branches themselves, so it
 * opens centred on the middle of them all (and still does when a branch is
 * added). The customer's own location, when known, is a dot that does not move
 * the framing.
 *
 *   branches    [{ id, name, latitude, longitude, ... }]
 *   selectedId  the customer's branch, drawn larger and in red
 *   userPos     { latitude, longitude } or null
 *   onSelect    called with a branch id from "Order here"
 */
export default function BranchMap({ branches, selectedId, userPos, onSelect, className = '' }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const me = useRef(null);
  const handlers = useRef({ onSelect });
  handlers.current = { onSelect };
  // Each branch is drawn as the restaurant's logo (the one set in Admin → Site images).
  const logo = useSiteImage('logo');

  // Build the map once.
  useEffect(() => {
    // Quarter zoom steps let the view fit the branches tightly, spreading the logos apart.
    const m = L.map(box.current, { scrollWheelZoom: false, zoomControl: false, zoomSnap: 0.25 });
    L.tileLayer(BASEMAP_URL, WHITE_BASEMAP_OPTIONS).addTo(m);
    minimalControls(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    setTimeout(() => m.invalidateSize(), 0);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // Frame all branches whenever the set of branches changes.
  const framing = branches.map((b) => `${b.id}:${b.latitude},${b.longitude}`).join('|');
  useEffect(() => {
    const m = map.current;
    if (!m || branches.length === 0) return;
    const bounds = L.latLngBounds(branches.map((b) => [b.latitude, b.longitude]));
    // Pins stand above their spot, so most of the room goes at the top (plus the selected branch's name).
    m.fitBounds(bounds, { paddingTopLeft: [48, 108], paddingBottomRight: [48, 28], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framing]);

  // Pins and popups: redrawn when the selection or location changes.
  useEffect(() => {
    const group = layer.current;
    if (!group) return;
    group.clearLayers();
    const compact = (box.current?.clientWidth ?? 0) < 520;
    for (const branch of branches) {
      const selected = branch.id === selectedId;
      const marker = L.marker([branch.latitude, branch.longitude], {
        icon: logoIcon(logo, selected, compact),
        riseOnHover: true,
        title: branch.name,
        zIndexOffset: selected ? 1000 : 0,
        keyboard: true,
      });
      marker.bindPopup(() => popupFor(branch, { selected, userPos, onSelect: (id) => handlers.current.onSelect?.(id) }));
      // Names stay out of the way: only the selected branch is labelled; the rest on hover.
      marker.bindTooltip(branch.name, { direction: 'top', permanent: selected, opacity: 1 });
      // The name label would sit on top of the open popup.
      marker.on('popupopen', () => marker.closeTooltip());
      if (selected) marker.on('popupclose', () => marker.openTooltip());
      group.addLayer(marker);
    }
  }, [branches, selectedId, userPos, logo]);

  // "You are here"
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    me.current?.remove();
    me.current = userPos
      ? L.circleMarker([userPos.latitude, userPos.longitude], {
          radius: 6,
          color: '#fff',
          weight: 2,
          fillColor: '#2563eb',
          fillOpacity: 1,
        })
          .bindTooltip('You are here', { direction: 'top' })
          .addTo(m)
      : null;
  }, [userPos]);

  return <div ref={box} className={`branch-map z-0 overflow-hidden rounded-2xl border border-line ${className}`} />;
}
