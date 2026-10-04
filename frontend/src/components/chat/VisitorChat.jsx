import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useVisitorChat } from '../../lib/chat.js';
import { RESTAURANT } from '../Logo.jsx';
import { ErrorNote } from '../ui.jsx';
import { Chat, X } from '../icons.jsx';
import ChatWindow from './ChatWindow.jsx';

/**
 * Floating "message the cashier" widget for the landing page. No account
 * needed: the first message opens a conversation that this browser keeps.
 * The closed launcher is a plain element, meant to sit inside <BottomDock> next
 * to the cart bar; the open panel is a full-screen sheet on phones.
 */
export default function VisitorChat() {
  const { user } = useAuth();
  const chat = useVisitorChat();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState((user?.user_metadata?.full_name ?? '').slice(0, 60));

  // While the panel is open, whatever arrives counts as read.
  useEffect(() => {
    if (open) chat.markSeen();
  }, [open, chat.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Chat with us"
        className="pointer-events-auto relative flex items-center gap-2 rounded-full bg-brand px-5 py-3.5 font-medium text-white shadow-lg transition hover:bg-brand-dark"
      >
        <Chat size={22} />
        <span className="hidden sm:inline">Chat with us</span>
        {chat.unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-sun px-1.5 text-xs font-bold text-ink">
            {chat.unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <section
      aria-label="Chat"
      className="pointer-events-auto fixed inset-0 z-50 flex flex-col overflow-hidden bg-paper sm:inset-auto sm:bottom-24 sm:right-4 sm:h-[28rem] sm:max-h-[75vh] sm:w-[22rem] sm:rounded-2xl sm:border sm:border-line sm:shadow-xl"
    >
      <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
        <div className="leading-tight">
          <p className="font-script text-xl leading-none">{RESTAURANT}</p>
          <p className="mt-0.5 text-xs text-ink-soft">Ask the cashier anything</p>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-full p-1.5 text-ink-soft hover:bg-ink/5">
          <X size={20} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <ChatWindow
          className="flex-1"
          messages={chat.messages}
          mine={(m) => m.sender_role === 'visitor'}
          sending={chat.sending}
          onSend={(body) => chat.send(body, name.trim())}
          emptyText="Hi! Questions about the menu, delivery or your order? Send us a message and the cashier will reply here."
        />
        {!chat.started && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Your name (optional)"
            aria-label="Your name"
            className="mt-2 rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-sun"
          />
        )}
        <div className="mt-2 empty:hidden">
          <ErrorNote error={chat.error} />
        </div>
      </div>
    </section>
  );
}
