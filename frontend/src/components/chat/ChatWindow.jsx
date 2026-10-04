import { useEffect, useRef, useState } from 'react';
import { timeAgo } from '../../lib/format.js';
import { Spinner } from '../ui.jsx';
import { Send } from '../icons.jsx';

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
 */
export default function ChatWindow({ messages, mine, onSend, sending, closedNote, emptyText, labels, className = '' }) {
  const [draft, setDraft] = useState('');
  const end = useRef(null);

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
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
                  own ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-cream-deep text-ink'
                }`}
              >
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
        <form onSubmit={submit} className="flex gap-2 pt-2">
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
        </form>
      )}
    </div>
  );
}
