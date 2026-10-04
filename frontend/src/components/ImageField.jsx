import { useEffect, useRef, useState } from 'react';
import { prepareImage } from '../lib/image.js';
import { Button } from './ui.jsx';
import { ChefHat } from './icons.jsx';

/**
 * Picks an image and shows a preview. It does not upload anything itself:
 * `onChange` receives `{ blob }` for a new image, `{ remove: true }` to clear
 * it, or null when the pick is undone — the caller decides when to send it.
 *
 *   current   the saved image URL, if any
 *   shape     'square' (product thumbnails) | 'wide' (promo banner)
 */
export default function ImageField({ current, onChange, shape = 'square', fallbackLabel = 'Default image' }) {
  const input = useRef(null);
  const [picked, setPicked] = useState(null); // { blob, url } | { remove: true } | null
  const [error, setError] = useState(null);

  useEffect(() => () => picked?.url && URL.revokeObjectURL(picked.url), [picked]);

  const choose = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const blob = await prepareImage(file);
      setPicked({ blob, url: URL.createObjectURL(blob) });
      onChange({ blob });
    } catch (err) {
      setError(err.message);
    }
  };

  const undo = () => {
    setPicked(null);
    onChange(null);
  };

  const removed = picked?.remove;
  const shown = removed ? null : picked?.url ?? current;
  const box = shape === 'wide' ? 'aspect-[5/4] w-48' : 'h-28 w-28';

  return (
    <div className="flex items-start gap-4">
      <div className={`${box} shrink-0 overflow-hidden rounded-2xl bg-cream-deep ring-1 ring-ink/10`}>
        {shown ? (
          <img src={shown} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-sun-dark">
            <ChefHat size={28} />
            <span className="px-2 text-center text-[11px] text-ink-soft">{fallbackLabel}</span>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={choose} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" tone="outline" size="sm" onClick={() => input.current.click()}>
            {shown ? 'Replace image' : 'Upload image'}
          </Button>
          {picked ? (
            <Button type="button" tone="ghost" size="sm" onClick={undo}>Undo</Button>
          ) : (
            current && (
              <Button
                type="button"
                tone="danger"
                size="sm"
                onClick={() => {
                  setPicked({ remove: true });
                  onChange({ remove: true });
                }}
              >
                Remove
              </Button>
            )
          )}
        </div>
        <p className="text-xs text-ink-soft">
          {picked && !removed ? 'Saved when you press Save.' : removed ? 'Will be removed when you press Save.' : 'JPEG, PNG or WebP. Large photos are shrunk automatically.'}
        </p>
        {error && <p className="text-xs font-semibold text-brand">{error}</p>}
      </div>
    </div>
  );
}
