import { supabase } from '@/utils/supabase';

// Realtime runs on the one app client, so it already carries the signed-in user's JWT and RLS
// decides which rows each subscriber hears about. Every callback is only a "something changed"
// signal: screens refetch through their controllers.

let counter = 0;

const subscribe = (build: (channel: ReturnType<typeof supabase.channel>) => ReturnType<typeof supabase.channel>) => {
  const channel = build(supabase.channel(`rt-${(counter += 1)}`)).subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

/** Any change to an order row the caller can see. */
export const subscribeToOrders = (onChange: (payload: any) => void) =>
  subscribe((c) => c.on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onChange));

/** A new message in a delivery thread (RLS: the order's customer and its rider). */
export const subscribeToChat = (threadId: string, onChange: () => void) =>
  subscribe((c) =>
    c.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, onChange),
  );

/** Staff inbox: any new message or thread (RLS: staff of the branch). */
export const subscribeToInbox = (onChange: () => void) =>
  subscribe((c) =>
    c
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_threads' }, onChange),
  );

/** Visitors have no JWT for RLS; a broadcast named after their unguessable thread id pings them. */
export const subscribeToVisitorChannel = (threadId: string, onPing: () => void) => {
  const channel = supabase.channel(`chat:${threadId}`).on('broadcast', { event: 'message' }, onPing).subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};
