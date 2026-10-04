import { createClient } from '@supabase/supabase-js';
import { getSession, onSessionChange } from './session.js';

// Realtime only. Every write goes through the REST API so the server's pricing
// and transition rules cannot be bypassed.
const client = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);

// Keep the socket's JWT in step with the app session, including after refreshes.
onSessionChange((s) => {
  if (s?.session?.access_token) client.realtime.setAuth(s.session.access_token);
});

let counter = 0;

/**
 * Calls `onChange(payload)` whenever an order row changes (RLS scopes what the
 * caller receives). Returns an unsubscribe function. The payload is the orders
 * row only — refetch for items.
 */
export const subscribeToOrders = (onChange) => {
  const token = getSession()?.session?.access_token;
  if (token) client.realtime.setAuth(token);

  const channel = client
    .channel(`orders-${(counter += 1)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onChange)
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
};

const authenticate = () => {
  const token = getSession()?.session?.access_token;
  if (token) client.realtime.setAuth(token);
};

/**
 * Calls `onChange()` when a message is added to a delivery thread. Logged-in
 * only: RLS limits it to the order's customer and the rider holding it.
 */
export const subscribeToChat = (threadId, onChange) => {
  authenticate();
  const channel = client
    .channel(`chat-${(counter += 1)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` },
      onChange,
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
};

/** Cashier inbox: fires on any new message or thread. RLS limits it to staff. */
export const subscribeToInbox = (onChange) => {
  authenticate();
  const channel = client
    .channel(`inbox-${(counter += 1)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_threads' }, onChange)
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
};

/**
 * Visitors have no account, hence no JWT for RLS. The server pings a Broadcast
 * channel named after their (unguessable) thread id instead. The ping carries
 * no text — refetch over the API with the thread token.
 */
export const subscribeToVisitorChannel = (threadId, onPing) => {
  const channel = client
    .channel(`chat:${threadId}`)
    .on('broadcast', { event: 'message' }, onPing)
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
};
