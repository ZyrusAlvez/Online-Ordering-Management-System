import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError, fromPostgrestError } from '../utils/ApiError.js';
import { canAccessBranch } from '../utils/branchScope.js';
import { signedUrls, uploadPrivateImage } from './storage.service.js';

/**
 * Chat between staff and visitors (support threads) and between an online
 * customer and the rider holding their order (delivery threads).
 *
 * Every write runs on supabaseAdmin: the chat tables have SELECT-only RLS that
 * exists to scope Realtime delivery, so who may post is decided here.
 */

const THREADS = 'chat_threads';
const MESSAGES = 'chat_messages';
const SECRETS = 'chat_thread_secrets';

// sender_id is never returned: a visitor must not learn staff user ids.
const MESSAGE_COLUMNS = 'id, thread_id, sender_role, body, image_path, created_at';
const HISTORY_LIMIT = 200;

// Photos live in a private bucket and are shown through links that expire. Clients
// refetch regularly, so an hour is plenty; a stale link just gets replaced on the next load.
export const CHAT_IMAGE_BUCKET = 'chat-images';
const IMAGE_LINK_SECONDS = 3600;
// Bounds what one conversation (in particular an anonymous guest's) can store.
export const MAX_IMAGES_PER_THREAD = 30;

/** Replaces each message's internal `image_path` with a temporary `image_url` (null for text). */
const withImageUrls = async (rows) => {
  const urls = await signedUrls(
    CHAT_IMAGE_BUCKET,
    rows.map((r) => r.image_path),
    IMAGE_LINK_SECONDS,
  );
  return rows.map(({ image_path: path, ...message }) => ({
    ...message,
    image_url: path ? (urls.get(path) ?? null) : null,
  }));
};

const hashToken = (token) => createHash('sha256').update(token, 'utf8').digest('hex');

/**
 * Tells browsers listening on chat:<thread> that something changed. It carries
 * no message text — clients refetch over the API — so a forged or overheard
 * ping reveals nothing. Failure never blocks the message that was saved.
 */
const ping = async (threadId) => {
  const channel = supabaseAdmin.channel(`chat:${threadId}`);
  try {
    await channel.httpSend('message', { thread_id: threadId });
  } catch (err) {
    console.error('[chat] broadcast failed', err.message);
  } finally {
    supabaseAdmin.removeChannel(channel);
  }
};

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export const listMessages = async (threadId) => {
  const { data, error } = await supabaseAdmin
    .from(MESSAGES)
    .select(MESSAGE_COLUMNS)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) throw fromPostgrestError(error);
  return withImageUrls(data.reverse());
};

const addMessage = async (threadId, { senderRole, senderId = null, body = '', imagePath = null }) => {
  const { data, error } = await supabaseAdmin
    .from(MESSAGES)
    .insert({ thread_id: threadId, sender_role: senderRole, sender_id: senderId, body, image_path: imagePath })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw fromPostgrestError(error);

  const { error: touchError } = await supabaseAdmin
    .from(THREADS)
    // The inbox preview lives on the thread, so listing threads never has to scan messages.
    .update({
      last_message_at: data.created_at,
      last_message: body ? body.slice(0, 200) : '📷 Photo',
      last_sender_role: senderRole,
    })
    .eq('id', threadId);
  if (touchError) throw fromPostgrestError(touchError);

  await ping(threadId);
  return (await withImageUrls([data]))[0];
};

/**
 * Sends a photo into a conversation the caller has already been authorised for.
 * The bytes are checked (a mislabelled file is refused), the conversation's photo
 * count is capped, and the file is stored privately under the thread's own folder.
 */
const addImage = async (threadId, { senderRole, senderId = null, file }) => {
  const { count, error } = await supabaseAdmin
    .from(MESSAGES)
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .not('image_path', 'is', null);
  if (error) throw fromPostgrestError(error);
  if (count >= MAX_IMAGES_PER_THREAD) {
    throw ApiError.conflict(`This conversation has reached its limit of ${MAX_IMAGES_PER_THREAD} photos`);
  }

  const imagePath = await uploadPrivateImage(CHAT_IMAGE_BUCKET, threadId, file);
  try {
    return await addMessage(threadId, { senderRole, senderId, imagePath });
  } catch (err) {
    // Do not leave a file behind for a message that was never saved.
    await supabaseAdmin.storage.from(CHAT_IMAGE_BUCKET).remove([imagePath]);
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Support threads: visitor <-> cashier
// ---------------------------------------------------------------------------

/**
 * What staff see for an anonymous visitor. The number keeps two guests apart
 * (and two guests who both type "Maria"): "Guest-1023", or "Maria (Guest-1023)".
 */
const guestLabel = ({ guest_number: number, visitor_name: name }) => {
  const tag = `Guest-${number}`;
  return name ? `${name} (${tag})` : tag;
};

/**
 * Opens a thread with its first message, in the inbox of the branch the visitor
 * picked. The token is returned once; only its hash is kept.
 */
export const createVisitorThread = async ({ name, body, branchId }) => {
  const token = `chat_${randomBytes(24).toString('base64url')}`;

  const { data: thread, error } = await supabaseAdmin
    .from(THREADS)
    .insert({ kind: 'support', visitor_name: name ?? null, branch_id: branchId })
    .select('id')
    .single();
  if (error) throw fromPostgrestError(error);

  const { error: secretError } = await supabaseAdmin
    .from(SECRETS)
    .insert({ thread_id: thread.id, token_hash: hashToken(token) });
  if (secretError) {
    await supabaseAdmin.from(THREADS).delete().eq('id', thread.id);
    throw fromPostgrestError(secretError);
  }

  const message = await addMessage(thread.id, { senderRole: 'visitor', body });
  return { thread_id: thread.id, token, messages: [message] };
};

/** Proves the caller owns the thread. Unknown thread and wrong token look identical. */
const requireVisitor = async (threadId, token) => {
  const denied = ApiError.unauthorized('Invalid chat token');
  if (!token) throw denied;

  const { data, error } = await supabaseAdmin
    .from(SECRETS)
    .select('token_hash')
    .eq('thread_id', threadId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw denied;

  const stored = Buffer.from(data.token_hash, 'hex');
  const given = Buffer.from(hashToken(token), 'hex');
  if (stored.length !== given.length || !timingSafeEqual(stored, given)) throw denied;
};

export const getVisitorMessages = async (threadId, token) => {
  await requireVisitor(threadId, token);
  return listMessages(threadId);
};

export const postVisitorMessage = async (threadId, token, body) => {
  await requireVisitor(threadId, token);
  return addMessage(threadId, { senderRole: 'visitor', body });
};

export const postVisitorImage = async (threadId, token, file) => {
  await requireVisitor(threadId, token);
  return addImage(threadId, { senderRole: 'visitor', file });
};

// --- cashier side ---

/** A support thread at one of the caller's branches; anything else is "not found". */
const requireSupportThread = async (threadId, scope) => {
  const { data, error } = await supabaseAdmin
    .from(THREADS)
    .select('id, branch_id')
    .eq('id', threadId)
    .eq('kind', 'support')
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data || !canAccessBranch(scope, data.branch_id)) throw ApiError.notFound('Conversation not found');
};

/** The inbox for the given branches (null = every branch). */
export const listSupportThreads = async (branchIds = null) => {
  if (branchIds && branchIds.length === 0) return [];

  let query = supabaseAdmin
    .from(THREADS)
    .select(
      'id, guest_number, visitor_name, last_message, last_sender_role, last_message_at, staff_read_at, ' +
        'created_at, branch_id, branch:branches(id, code, name)',
    )
    .eq('kind', 'support')
    .order('last_message_at', { ascending: false })
    .limit(50);
  if (branchIds) query = query.in('branch_id', branchIds);

  const { data: threads, error } = await query;
  if (error) throw fromPostgrestError(error);

  return threads.map(({ staff_read_at: readAt, ...thread }) => ({
    ...thread,
    last_message: thread.last_message ?? '',
    display_name: guestLabel(thread),
    unread: thread.last_sender_role === 'visitor' && (!readAt || readAt < thread.last_message_at),
  }));
};

export const getSupportMessages = async (threadId, scope) => {
  await requireSupportThread(threadId, scope);
  return listMessages(threadId);
};

export const postStaffMessage = async (threadId, scope, staffId, body) => {
  await requireSupportThread(threadId, scope);
  return addMessage(threadId, { senderRole: 'cashier', senderId: staffId, body });
};

export const postStaffImage = async (threadId, scope, staffId, file) => {
  await requireSupportThread(threadId, scope);
  return addImage(threadId, { senderRole: 'cashier', senderId: staffId, file });
};

export const markSupportThreadRead = async (threadId, scope) => {
  await requireSupportThread(threadId, scope);
  const { error } = await supabaseAdmin
    .from(THREADS)
    .update({ staff_read_at: new Date().toISOString() })
    .eq('id', threadId);
  if (error) throw fromPostgrestError(error);
};

// ---------------------------------------------------------------------------
// Delivery threads: customer <-> the rider holding the order
// ---------------------------------------------------------------------------

const loadDeliveryOrder = async (orderId) => {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, status, fulfillment_type, customer_id, customer_name, rider_id, branch_id')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data || data.fulfillment_type !== 'delivery') throw ApiError.notFound('Delivery order not found');
  return data;
};

/** `as` is the route's side of the conversation: the customer who placed it, or the rider holding it now. */
const requireParticipant = (order, userId, as) => {
  const allowed = as === 'customer' ? order.customer_id === userId : order.rider_id === userId;
  // 404 rather than 403, so the endpoint does not confirm other people's order ids exist.
  if (!allowed) throw ApiError.notFound('Delivery order not found');
};

// A rider may release an order and another may take it, so the thread follows
// the order, not the rider, and history stays readable.
const findOrCreateDeliveryThread = async ({ id: orderId, branch_id: branchId }) => {
  const find = () => supabaseAdmin.from(THREADS).select('id').eq('order_id', orderId).maybeSingle();

  const existing = await find();
  if (existing.error) throw fromPostgrestError(existing.error);
  if (existing.data) return existing.data.id;

  const { data, error } = await supabaseAdmin
    .from(THREADS)
    // The branch's staff can read the conversation, like they can the order.
    .insert({ kind: 'delivery', order_id: orderId, branch_id: branchId })
    .select('id')
    .single();
  if (!error) return data.id;

  // Lost a race with the other participant's first request.
  if (error.code !== '23505') throw fromPostgrestError(error);
  const retry = await find();
  if (retry.error || !retry.data) throw fromPostgrestError(retry.error ?? error);
  return retry.data.id;
};

const isOpen = (order) => order.status === 'out_for_delivery' && Boolean(order.rider_id);

const nameOf = async (profileId) => {
  if (!profileId) return null;
  const { data } = await supabaseAdmin.from('profiles').select('full_name').eq('id', profileId).maybeSingle();
  return data?.full_name ?? null;
};

export const getOrderChat = async (orderId, userId, as) => {
  const order = await loadDeliveryOrder(orderId);
  requireParticipant(order, userId, as);

  // No thread exists until a rider takes the order. Reading never creates one for an
  // order nobody holds.
  const { data: thread, error } = await supabaseAdmin
    .from(THREADS)
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);

  const threadId = thread?.id ?? (order.rider_id ? await findOrCreateDeliveryThread(order) : null);

  return {
    thread_id: threadId,
    open: isOpen(order),
    order: { id: order.id, order_number: order.order_number, status: order.status },
    // Each side sees who they are talking to.
    with:
      as === 'customer'
        ? { role: 'rider', name: await nameOf(order.rider_id) }
        : { role: 'customer', name: order.customer_name ?? (await nameOf(order.customer_id)) },
    messages: threadId ? await listMessages(threadId) : [],
  };
};

/** Loads the order, checks the caller is its customer or rider and the chat is open, and returns the thread id. */
const openDeliveryThread = async (orderId, userId, as) => {
  const order = await loadDeliveryOrder(orderId);
  requireParticipant(order, userId, as);
  if (!isOpen(order)) {
    throw ApiError.conflict('Chat is only open while the order is out for delivery');
  }
  return findOrCreateDeliveryThread(order);
};

export const postOrderMessage = async (orderId, userId, as, body) => {
  const threadId = await openDeliveryThread(orderId, userId, as);
  return addMessage(threadId, { senderRole: as, senderId: userId, body });
};

export const postOrderImage = async (orderId, userId, as, file) => {
  const threadId = await openDeliveryThread(orderId, userId, as);
  return addImage(threadId, { senderRole: as, senderId: userId, file });
};
