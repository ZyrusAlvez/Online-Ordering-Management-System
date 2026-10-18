'use client';

import { useEffect, useState } from 'react';
import { call, respond } from '@/utils/apiError';
import { getOrderChat, postOrderImage, postOrderMessage } from '@/controllers/chatController';
import { useLive } from '@/hooks/useChat';
import { subscribeToChat } from '@/hooks/realtime';
import { ErrorNote } from '@/view/components/ui';
import ChatWindow from '@/view/components/chat/ChatWindow';
import { ChatSkeleton } from '@/view/components/Skeletons';

/**
 * Chat between an online customer and the rider holding their delivery order.
 *
 *   as          'customer' | 'rider' — which side the viewer is
 *   orderKey    changes whenever the order's status or rider does, so the
 *               "is chat open yet" answer is refetched without polling
 */
export default function DeliveryChat({ orderId, as, orderKey, className = '' }: any) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const chat = useLive(() => respond(getOrderChat(orderId, as)), null, [orderId, orderKey]);
  const info = chat.data?.data;
  const threadId = info?.thread_id;

  useEffect(() => (threadId ? subscribeToChat(threadId, chat.refresh) : undefined), [threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (body) => {
    setSending(true);
    setError(null);
    try {
      await call(postOrderMessage(orderId, as, { body }));
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
      await call(postOrderImage(orderId, as, blob));
      await chat.refresh();
      return true;
    } catch (err) {
      chat.refresh(); // the chat may have just closed
      throw err;
    }
  };

  if (chat.loading && !info) return <ChatSkeleton />;
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
