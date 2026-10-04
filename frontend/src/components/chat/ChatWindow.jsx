import { useEffect, useRef, useState } from 'react';
import { timeAgo } from '../../lib/format.js';
import { prepareImage } from '../../lib/image.js';
import { Spinner } from '../ui.jsx';
import { Photo, Send } from '../icons.jsx';

const WHO = { visitor: 'Guest', customer: 'Customer', cashier: 'Cashier', rider: 'Rider' };

/**
 * Message list + composer, shared by the visitor widget, the cashier inbox and
 * the delivery chat. It only renders and reports: `onSend(body)` resolves true
 * once the message went through, which clears the box.
 *
 *   mine(message)  which side of the conversation the viewer is on
 *   labels         optional { role: 'text' } overriding the default sender names,
 *                  e.g. { visitor: 'Guest-1023' } in the cashier inbox
 *   closedNote     when set, replaces the composer (chat closed / not open yet)
 *   onSendImage    (blob) => Promise<boolean>; adds a photo button. Photos are shrunk in
 *                  the browser first, so a phone picture stays well under the 5 MB limit.
 *   imageNote      shown on a disabled photo button when photos are not available yet
 */
export default function ChatWindow({
  messages,
  mine,
  onSend,
  onSendImage,
  imageNote,
  sending,
  closedNote,
  emptyText,
  labels,
  className = '',
}) {
  const [draft, setDraft] = useState('');
  const [photoError, setPhotoError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const end = useRef(null);
  const fileInput = useRef(null);

  // Photo links are signed and change on every fetch. Keep the first link for each
  // message, or every refresh would reload (and flicker) every picture. If a kept link
  // has expired the image fails to load and the latest link is swapped in.
  const links = useRef(new Map());
  const [, repaint] = useState(0);
  const srcOf = (m) => {
    if (!m.image_url) return null;
    if (!links.current.has(m.id)) links.current.set(m.id, m.image_url);
    return links.current.get(m.id);
  };
  const refreshLink = (m) => {
    if (m.image_url && links.current.get(m.id) !== m.image_url) {
      links.current.set(m.id, m.image_url);
      repaint((n) => n + 1);
    }
  };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onSendImage) return;
    setPhotoError(null);
    setUploading(true);
    try {
      await onSendImage(await prepareImage(file));
    } catch (err) {
      setPhotoError(err.message || 'Could not send that photo.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    if (await onSend(body)) setDraft('');
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <ul className="scroll-thin flex-1 space-y-2 overflow-y-auto px-1 py-2" aria-live="polite">
        {messages.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-ink-soft">{emptyText ?? 'No messages yet.'}</li>
        )}
        {messages.map((m) => {
          const own = mine(m);
          return (
            <li key={m.id} className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl text-sm ${m.image_url ? 'w-56 p-1.5' : 'px-3.5 py-2'} ${
                  own ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-cream-deep text-ink'
                }`}
              >
                {m.image_url && (
                  <a href={srcOf(m)} target="_blank" rel="noopener noreferrer" className="block">
                    <img
                      src={srcOf(m)}
                      alt={`Photo from ${own ? 'you' : (labels?.[m.sender_role] ?? WHO[m.sender_role] ?? 'the other person')}`}
                      loading="lazy"
                      onError={() => refreshLink(m)}
                      className="max-h-60 w-full rounded-lg bg-white/20 object-cover"
                    />
                  </a>
                )}
                {m.body}
              </div>
              <span className="mt-0.5 px-1 text-[11px] text-ink-soft">
                {own ? '' : `${labels?.[m.sender_role] ?? WHO[m.sender_role] ?? ''} · `}
                {timeAgo(m.created_at)}
              </span>
            </li>
          );
        })}
        <li ref={end} aria-hidden="true" />
      </ul>

      {closedNote ? (
        <p className="rounded-2xl bg-cream-deep px-4 py-3 text-center text-sm text-ink-soft">{closedNote}</p>
      ) : (
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2 pt-2">
          {(onSendImage || imageNote) && (
            <>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickPhoto} />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={!onSendImage || uploading || sending}
                title={onSendImage ? 'Send a photo' : imageNote}
                aria-label="Send a photo"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-soft transition hover:text-brand disabled:opacity-40"
              >
                {uploading ? <Spinner size={18} /> : <Photo size={18} />}
              </button>
            </>
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            placeholder="Type a message…"
            aria-label="Message"
            className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {sending ? <Spinner size={18} /> : <Send size={18} />}
          </button>
          {photoError && (
            <p role="alert" className="basis-full text-xs font-semibold text-brand-dark">
              {photoError}
            </p>
          )}
          {!onSendImage && imageNote && <p className="basis-full text-[11px] text-ink-soft">{imageNote}</p>}
        </form>
      )}
    </div>
  );
}
