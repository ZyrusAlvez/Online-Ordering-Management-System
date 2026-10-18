'use client';

import { useEffect, useState } from 'react';
import { call, respond } from '@/utils/apiError';
import { getSupportMessages, markSupportThreadRead, postStaffImage, postStaffMessage } from '@/controllers/chatController';
import { useLive } from '@/hooks/useChat';
import { subscribeToInbox } from '@/hooks/realtime';
import { timeAgo } from '@/utils/format';
import { Empty, ErrorNote, Modal } from '@/view/components/ui';
import ChatWindow from '@/view/components/chat/ChatWindow';
import { ChatSkeleton, RowsSkeleton } from '@/view/components/Skeletons';

function Conversation({ thread, onChanged }: any) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const { data, loading, refresh } = useLive(
    () => respond(getSupportMessages(thread.id)),
    subscribeToInbox,
    [thread.id],
  );
  const messages = data?.data ?? [];
  const latest = messages.at(-1)?.id;

  // Opening a thread, or a message landing in it while it is open, counts as read.
  useEffect(() => {
    if (!latest) return;
    call(markSupportThreadRead(thread.id)).then(onChanged, () => {});
  }, [thread.id, latest]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (body) => {
    setSending(true);
    setError(null);
    try {
      await call(postStaffMessage(thread.id, { body }));
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
    await call(postStaffImage(thread.id, blob));
    await refresh();
    onChanged();
    return true;
  };

  if (loading && !data) return <ChatSkeleton />;

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
export default function StaffInbox({ inbox, onClose }: any) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = inbox.threads.find((t) => t.id === selectedId);

  return (
    <Modal open onClose={onClose} title="Messages" wide>
      {inbox.loading && inbox.threads.length === 0 ? (
        <RowsSkeleton count={3} label="Loading messages…" />
      ) : inbox.threads.length === 0 ? (
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
