import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useLive } from '../../lib/chat.js';
import { subscribeToChat } from '../../lib/supabase.js';
import { ErrorNote, Spinner } from '../ui.jsx';
import ChatWindow from './ChatWindow.jsx';

/**
 * Chat between an online customer and the rider holding their delivery order.
 *
 *   as          'customer' | 'rider' — which side the viewer is
 *   orderKey    changes whenever the order's status or rider does, so the
 *               "is chat open yet" answer is refetched without polling
 */
export default function DeliveryChat({ orderId, as, orderKey, className = '' }) {
  const path = as === 'customer' ? `/orders/${orderId}/chat` : `/rider/orders/${orderId}/chat`;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const chat = useLive(() => api.get(path, { auth: true }), null, [orderId, orderKey]);
  const info = chat.data?.data;
  const threadId = info?.thread_id;

  useEffect(() => (threadId ? subscribeToChat(threadId, chat.refresh) : undefined), [threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (body) => {
    setSending(true);
    setError(null);
    try {
      await api.post(path, { body }, { auth: true });
      await chat.refresh();
      return true;
    } catch (err) {
      setError(err);
      chat.refresh(); // the chat may have just closed
      return false;
    } finally {
      setSending(false);
    }
  };

  const sendImage = async (blob) => {
    try {
      await api.post(`${path}/images`, blob, { auth: true });
      await chat.refresh();
      return true;
    } catch (err) {
      chat.refresh(); // the chat may have just closed
      throw err;
    }
  };

  if (chat.loading && !info) {
    return (
      <div className="flex justify-center py-10 text-brand">
        <Spinner />
      </div>
    );
  }
  if (chat.error && !info) return <ErrorNote error={chat.error} onRetry={chat.reload} />;

  const other = info.with.name || (as === 'customer' ? 'your rider' : 'the customer');
  let closedNote = null;
  if (!info.open) {
    closedNote = info.thread_id
      ? 'This delivery is finished, so the chat is closed.'
      : 'Chat opens once a rider picks up the order.';
  }

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <p className="mb-1 text-sm text-ink-soft">
        Chatting with <strong className="text-ink">{other}</strong> · order {info.order.order_number}
      </p>
      <ErrorNote error={error} />
      <ChatWindow
        className="h-72"
        messages={info.messages}
        mine={(m) => m.sender_role === as}
        sending={sending}
        onSend={send}
        onSendImage={sendImage}
        closedNote={closedNote}
        emptyText={as === 'customer' ? 'Say hi to your rider — tell them where to find you.' : 'Message the customer about the delivery.'}
      />
    </div>
  );
}
