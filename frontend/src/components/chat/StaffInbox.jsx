import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useLive } from '../../lib/chat.js';
import { subscribeToInbox } from '../../lib/supabase.js';
import { timeAgo } from '../../lib/format.js';
import { Empty, ErrorNote, Modal } from '../ui.jsx';
import ChatWindow from './ChatWindow.jsx';

function Conversation({ thread, onChanged }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const { data, refresh } = useLive(
    () => api.get(`/pos/chat/threads/${thread.id}/messages`, { auth: true }),
    subscribeToInbox,
    [thread.id],
  );
  const messages = data?.data ?? [];
  const latest = messages.at(-1)?.id;

  // Opening a thread, or a message landing in it while it is open, counts as read.
  useEffect(() => {
    if (!latest) return;
    api.post(`/pos/chat/threads/${thread.id}/read`, undefined, { auth: true }).then(onChanged, () => {});
  }, [thread.id, latest]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (body) => {
    setSending(true);
    setError(null);
    try {
      await api.post(`/pos/chat/threads/${thread.id}/messages`, { body }, { auth: true });
      await refresh();
      onChanged();
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setSending(false);
    }
  };

  const sendImage = async (blob) => {
    await api.post(`/pos/chat/threads/${thread.id}/images`, blob, { auth: true });
    await refresh();
    onChanged();
    return true;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ErrorNote error={error} />
      <ChatWindow
        className="flex-1"
        messages={messages}
        mine={(m) => m.sender_role === 'cashier'}
        labels={{ visitor: thread.display_name }}
        sending={sending}
        onSend={send}
        onSendImage={sendImage}
      />
    </div>
  );
}

/** Cashier view of visitor chats: conversation list on the left, messages on the right. */
export default function StaffInbox({ inbox, onClose }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = inbox.threads.find((t) => t.id === selectedId);

  return (
    <Modal open onClose={onClose} title="Messages" wide>
      {inbox.threads.length === 0 ? (
        <Empty title="No messages yet" hint="When someone chats from the website, it shows up here." />
      ) : (
        <div className="grid h-[60vh] gap-3 sm:grid-cols-[14rem_1fr]">
          <ul className={`scroll-thin space-y-1 overflow-y-auto ${selected ? 'hidden sm:block' : ''}`}>
            {inbox.threads.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full rounded-2xl px-3 py-2.5 text-left transition ${
                    t.id === selectedId ? 'bg-cream-deep' : 'hover:bg-cream'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${t.unread ? 'font-extrabold' : 'font-semibold'}`}>
                      {t.display_name}
                    </span>
                    {t.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                  </span>
                  <span className="block truncate text-xs text-ink-soft">
                    {t.last_sender_role === 'cashier' ? 'You: ' : ''}
                    {t.last_message}
                  </span>
                  <span className="text-[11px] text-ink-soft">{timeAgo(t.last_message_at)}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className={`flex min-h-0 flex-col ${selected ? '' : 'hidden sm:flex'}`}>
            {selected ? (
              <>
                <button
                  onClick={() => setSelectedId(null)}
                  className="mb-2 self-start text-sm font-semibold text-brand sm:hidden"
                >
                  ← All messages
                </button>
                <p className="mb-1 text-sm font-semibold">{selected.display_name}</p>
                <Conversation key={selected.id} thread={selected} onChanged={inbox.refresh} />
              </>
            ) : (
              <p className="m-auto text-sm text-ink-soft">Choose a conversation.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
