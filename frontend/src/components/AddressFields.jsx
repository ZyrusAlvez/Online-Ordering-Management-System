import { Suspense, lazy, useRef } from 'react';
import { Field, Input, Spinner } from './ui.jsx';

// Leaflet is a sizeable library and only delivery orders use it, so it loads on demand.
const AddressMap = lazy(() => import('./AddressMap.jsx'));

export const blankAddress = {
  line1: '',
  barangay: '',
  city: '',
  landmark: '',
  notes: '',
  // The pin on the map; null until the customer drops one.
  latitude: null,
  longitude: null,
};

/** Delivery address, as the API stores it. Strings only; empty optional fields are dropped by `cleanAddress`. */
export const cleanAddress = (a) => {
  const clean = (v) => v.trim() || undefined;
  return {
    line1: a.line1.trim(),
    city: a.city.trim(),
    barangay: clean(a.barangay),
    landmark: clean(a.landmark),
    notes: clean(a.notes),
    // Both or neither: the API rejects a lone coordinate.
    ...(typeof a.latitude === 'number' && typeof a.longitude === 'number'
      ? { latitude: a.latitude, longitude: a.longitude }
      : {}),
  };
};

/** Fills the blank optional keys of a saved address so the inputs stay controlled. */
export const fromSaved = (saved) => ({
  ...blankAddress,
  ...Object.fromEntries(Object.entries(saved ?? {}).filter(([, v]) => v !== undefined)),
});

/**
 * Shared by Checkout and Profile. `required` marks street and city as mandatory;
 * `map` shows the pin-your-address map above the fields.
 */
export default function AddressFields({ value, onChange, required = false, map = true }) {
  // The map reports back asynchronously (after a lookup), so it must act on the
  // form as it is by then, not as it was when the lookup started.
  const latest = useRef(value);
  latest.current = value;
  // What the map last filled in. A field is only overwritten while it is still empty
  // or still holds that suggestion, never once the customer has edited it.
  const suggested = useRef({});

  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });

  const applySuggestion = (found) => {
    const next = { ...latest.current };
    for (const key of ['line1', 'barangay', 'city']) {
      const untouched = !next[key] || next[key] === suggested.current[key];
      if (found[key] && untouched) next[key] = found[key];
    }
    suggested.current = { ...suggested.current, ...found };
    onChange(next);
  };

  const pin = typeof value.latitude === 'number' ? { latitude: value.latitude, longitude: value.longitude } : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {map && (
        <div className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-ink">Pin your location</span>
          <Suspense
            fallback={
              <div className="flex h-64 items-center justify-center rounded-xl border border-line text-brand">
                <Spinner />
              </div>
            }
          >
            <AddressMap
              value={pin}
              onChange={(point) =>
                onChange({ ...latest.current, latitude: point?.latitude ?? null, longitude: point?.longitude ?? null })
              }
              onSuggest={applySuggestion}
            />
          </Suspense>
        </div>
      )}
      <div className="sm:col-span-2">
        <Field label="Street address">
          <Input required={required} maxLength={300} autoComplete="address-line1" value={value.line1} onChange={set('line1')} placeholder="House no., street" />
        </Field>
      </div>
      <Field label="Barangay">
        <Input maxLength={120} autoComplete="address-level3" value={value.barangay} onChange={set('barangay')} />
      </Field>
      <Field label="City">
        <Input required={required} maxLength={120} autoComplete="address-level2" value={value.city} onChange={set('city')} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Landmark">
          <Input maxLength={300} value={value.landmark} onChange={set('landmark')} placeholder="Beside the pharmacy" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Delivery notes">
          <Input maxLength={500} value={value.notes} onChange={set('notes')} placeholder="Gate is blue" />
        </Field>
      </div>
    </div>
  );
}
