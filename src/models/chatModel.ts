import { supabase } from '@/utils/supabase';

// sender_id is never selected: a visitor must not learn staff user ids.
export const MESSAGE_COLUMNS = 'id, thread_id, sender_role, body, image_path, created_at';
export const HISTORY_LIMIT = 200;

export const listMessages = (threadId: string) =>
  supabase
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

export const insertMessage = (fields: Record<string, unknown>) =>
  supabase.from('chat_messages').insert(fields).select(MESSAGE_COLUMNS).single();

export const countImages = (threadId: string) =>
  supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .not('image_path', 'is', null);

export const updateThread = (threadId: string, fields: Record<string, unknown>) =>
  supabase.from('chat_threads').update(fields).eq('id', threadId);

export const getThread = (threadId: string) =>
  supabase.from('chat_threads').select('id, kind, branch_id').eq('id', threadId).maybeSingle();

export const getThreadForOrder = (orderId: string) =>
  supabase.from('chat_threads').select('id').eq('order_id', orderId).maybeSingle();

export const insertDeliveryThread = (orderId: string, branchId: string) =>
  supabase.from('chat_threads').insert({ kind: 'delivery', order_id: orderId, branch_id: branchId }).select('id').single();

export const listSupportThreads = (branchIds: string[] | null) => {
  let query = supabase
    .from('chat_threads')
    .select(
      'id, guest_number, visitor_name, last_message, last_sender_role, last_message_at, staff_read_at, ' +
        'created_at, branch_id, branch:branches(id, code, name)',
    )
    .eq('kind', 'support')
    .order('last_message_at', { ascending: false })
    .limit(50);
  if (branchIds) query = query.in('branch_id', branchIds);
  return query;
};

export const getDeliveryOrder = (orderId: string) =>
  supabase
    .from('orders')
    .select('id, order_number, status, fulfillment_type, customer_id, customer_name, rider_id, branch_id')
    .eq('id', orderId)
    .maybeSingle();

/** The other side's name only (not their phone or address), for the order's customer and its rider. */
export const getProfileName = (profileId: string) => supabase.rpc('chat_partner_name', { p_profile: profileId });

/**
 * Tells browsers listening on chat:<thread> (anonymous visitors) that something changed. It
 * carries no text; they refetch with their token, so an overheard ping reveals nothing.
 */
export const ping = async (threadId: string) => {
  const channel = supabase.channel(`chat:${threadId}`);
  try {
    await channel.httpSend('message', { thread_id: threadId });
  } catch {
    // Never block a saved message on the ping; visitors also poll.
  } finally {
    supabase.removeChannel(channel);
  }
};
