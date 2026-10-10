import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  DEFAULT_CENTER,
  inPhilippines,
  reverseGeocode,
  round6,
  searchPlaces,
  toFormAddress,
} from '../lib/geocode.js';
import { getPosition } from '../lib/geo.js';
import { BASEMAP_OPTIONS, BASEMAP_URL, minimalControls, pinIcon } from './mapPins.js';
import { Button, Input } from './ui.jsx';

const pin = pinIcon();

/**
 * Lets the customer pin where the rider should go: tap the map, drag the pin, use
 * their location, or search an address. Pinning also looks up the street,
 * barangay and city and hands them to `onSuggest`, so the form fills itself in.
 *
 *   value      { latitude, longitude } or null
 *   onChange   called with { latitude, longitude } or null (pin removed)
 *   onSuggest  called with { line1, barangay, city } for a pin the user just placed
 */
export default function AddressMap({ value, onChange, onSuggest }) {
  const box = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const callbacks = useRef({ onChange, onSuggest });
  callbacks.current = { onChange, onSuggest };
  const lookup = useRef({ timer: null, abort: null });

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState(null); // { tone: 'info' | 'error', text }
  const [busy, setBusy] = useState(false);

  const lat = value?.latitude;
  const lng = value?.longitude;
  const hasPin = typeof lat === 'number' && typeof lng === 'number';

  /** Looks up the street address under a pin the user placed (debounced; one at a time). */
  const describe = (la, ln) => {
    clearTimeout(lookup.current.timer);
    lookup.current.abort?.abort();
    lookup.current.timer = setTimeout(async () => {
      const abort = new AbortController();
      lookup.current.abort = abort;
      try {
        const found = await reverseGeocode(la, ln, abort.signal);
        if (found) callbacks.current.onSuggest?.(toFormAddress(found));
        else setStatus({ tone: 'info', text: 'Pinned. We couldn’t find a street name here, so please type the address.' });
      } catch (err) {
        if (err.name !== 'AbortError') {
          setStatus({ tone: 'info', text: 'Pinned. The address lookup is unavailable, so please type it in.' });
        }
      }
    }, 700);
  };

  const place = (la, ln, { fly = false, lookupAddress = true } = {}) => {
    if (!inPhilippines(la, ln)) {
      setStatus({ tone: 'error', text: 'That spot is outside the Philippines. Pick a place within the country.' });
      return;
    }
    setStatus(null);
    const point = { latitude: round6(la), longitude: round6(ln) };
    callbacks.current.onChange(point);
    if (fly) map.current?.flyTo([la, ln], 17, { duration: 0.6 });
    if (lookupAddress) describe(la, ln);
  };

  // Build the map once.
  useEffect(() => {
    const m = L.map(box.current, { zoomControl: false, scrollWheelZoom: false }).setView(
      hasPin ? [lat, lng] : DEFAULT_CENTER,
      hasPin ? 17 : 13,
    );
    L.tileLayer(BASEMAP_URL, BASEMAP_OPTIONS).addTo(m);
    minimalControls(m);
    m.on('click', (e) => place(e.latlng.lat, e.latlng.lng));
    map.current = m;
    // The container may be laid out after mounting (a modal, a card that just appeared).
    setTimeout(() => m.invalidateSize(), 0);

    return () => {
      clearTimeout(lookup.current.timer);
      lookup.current.abort?.abort();
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker in step with the value (typed in, restored from a saved address, cleared).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!hasPin) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = L.marker([lat, lng], { icon: pin, draggable: true, keyboard: false }).addTo(m);
      marker.current.on('dragend', () => {
        const p = marker.current.getLatLng();
        place(p.lat, p.lng);
      });
    } else {
      marker.current.setLatLng([lat, lng]);
    }
    if (!m.getBounds().contains([lat, lng])) m.panTo([lat, lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPin, lat, lng]);

  const locate = async () => {
    if (!navigator.geolocation) {
      setStatus({ tone: 'error', text: 'This device can’t share its location. Tap the map instead.' });
      return;
    }
    setBusy(true);
    setStatus({ tone: 'info', text: 'Finding you…' });
    try {
      const here = await getPosition({ highAccuracy: true });
      place(here.latitude, here.longitude, { fly: true });
    } catch (err) {
      setStatus({
        tone: 'error',
        text:
          err.code === 1
            ? 'Location is blocked. Allow it in your browser settings, or tap the map instead.'
            : 'Couldn’t get your location. Tap the map instead.',
      });
    } finally {
      setBusy(false);
    }
  };

  const search = async (e) => {
    e.preventDefault();
    const text = query.trim();
    if (text.length < 3) return;
    setBusy(true);
    setStatus(null);
    try {
      const found = await searchPlaces(text);
      setResults(found);
      if (found.length === 0) setStatus({ tone: 'info', text: 'No match. Try a nearby street or barangay, or tap the map.' });
    } catch {
      setStatus({ tone: 'error', text: 'Search is unavailable right now. Tap the map to pin your address.' });
    } finally {
      setBusy(false);
    }
  };

  const choose = (r) => {
    setResults([]);
    setQuery('');
    place(Number(r.lat), Number(r.lon), { fly: true, lookupAddress: false });
    callbacks.current.onSuggest?.(toFormAddress(r));
  };

  return (
    <div className="space-y-3">
      {/* Not a <form>: this map sits inside the checkout and branch forms, and a
          nested form is invalid HTML (Enter could submit the outer one). */}
      <div role="search" className="flex gap-2">
        <Input
          type="search"
          value={query}
          maxLength={200}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search(e);
          }}
          placeholder="Search your street or barangay"
          aria-label="Search for your address"
        />
        <Button type="button" tone="outline" onClick={search} disabled={busy || query.trim().length < 3}>
          Search
        </Button>
      </div>

      {results.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-line bg-white text-sm" role="listbox" aria-label="Matching places">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => choose(r)}
                className="block w-full border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-cream"
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        ref={box}
        role="application"
        aria-label="Map. Tap to drop a pin where the rider should deliver."
        className="z-0 h-64 w-full overflow-hidden rounded-xl border border-line bg-cream-deep sm:h-72"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" tone="outline" size="sm" onClick={locate} disabled={busy}>
          Use my location
        </Button>
        {hasPin && (
          <Button
            type="button"
            tone="ghost"
            size="sm"
            onClick={() => {
              onChange(null);
              setStatus(null);
            }}
          >
            Remove pin
          </Button>
        )}
        <p className="text-xs text-ink-soft">
          {hasPin ? 'Drag the pin to adjust it.' : 'Tap the map to drop a pin where the rider should deliver.'}
        </p>
      </div>

      {status && (
        <p role={status.tone === 'error' ? 'alert' : 'status'} className={`text-sm ${status.tone === 'error' ? 'text-brand-dark' : 'text-ink-soft'}`}>
          {status.text}
        </p>
      )}
    </div>
  );
}
