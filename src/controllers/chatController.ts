import * as chatModel from '@/models/chatModel';
import * as storageModel from '@/models/storageModel';
import { CHAT_BUCKET } from '@/models/storageModel';
import { COUNTER_ROLES } from '@/constants/orders';
import { canAccessBranch, getCaller } from '@/controllers/callerController';
import { signedUrlMap, uploadImage } from '@/controllers/storageController';
import { validate } from '@/utils/validate';
import { messageBody } from '@/utils/validators/chat.validators';
import { fail, fromDbError, ok, type Result } from '@/utils/result';

/**
 * Chat between staff and visitors (support threads) and between an online customer and the
 * rider holding their order (delivery threads). Visitor-side calls live in
 * controllers/server/visitorChatActions.ts, since visitors have no account.
 */

export const MAX_IMAGES_PER_THREAD = 30;
type SenderRole = 'customer' | 'rider' | 'cashier';

export type ChatMessage = {
  id: string;
  thread_id: string;
  sender_role: string;
  body: string;
  image_url: string | null;
  created_at: string;
};

/** Replaces each message's private `image_path` with a link that expires in an hour. */
export const withImageUrls = async (rows: any[]): Promise<ChatMessage[]> => {
  const urls = await signedUrlMap(CHAT_BUCKET, rows.map((r) => r.image_path));
  return rows.map(({ image_path: path, ...m }) => ({ ...m, image_url: path ? (urls.get(path) ?? null) : null }));
};

const listMessages = async (threadId: string) => {
  const { data, error } = await chatModel.listMessages(threadId);
  if (error) return fromDbError(error, 'Failed to load messages');
  return ok(await withImageUrls((data ?? []).reverse()));
};

const addMessage = async (
  threadId: string,
  { senderRole, senderId, body = '', imagePath = null }: { senderRole: SenderRole; senderId: string; body?: string; imagePath?: string | null },
): Promise<Result<ChatMessage>> => {
  const { data, error } = await chatModel.insertMessage({
    thread_id: threadId,
    sender_role: senderRole,
    sender_id: senderId,
    body,
    image_path: imagePath,
  });
  if (error) return fromDbError(error, 'Failed to send');

  // The inbox preview lives on the thread, so listing threads never scans messages.
  await chatModel.updateThread(threadId, {
    last_message_at: data.created_at,
    last_message: body ? body.slice(0, 200) : '📷 Photo',
    last_sender_role: senderRole,
  });
  await chatModel.ping(threadId);
  return ok((await withImageUrls([data]))[0]);
};

const addImage = async (threadId: string, senderRole: SenderRole, senderId: string, file: Blob) => {
  const { count, error } = await chatModel.countImages(threadId);
  if (error) return fromDbError(error);
  if ((count ?? 0) >= MAX_IMAGES_PER_THREAD) {
    return fail(`This conversation has reached its limit of ${MAX_IMAGES_PER_THREAD} photos`, 409);
  }
  const uploaded = await uploadImage(CHAT_BUCKET, threadId, file);
  if (uploaded.success === false) return uploaded;

  const sent = await addMessage(threadId, { senderRole, senderId, imagePath: uploaded.data });
  // Do not leave a file behind for a message that was never saved.
  if (sent.success === false) await storageModel.remove(CHAT_BUCKET, [uploaded.data]);
  return sent;
};

// ---------------------------------------------------------------------------
// Staff inbox (support threads)
// ---------------------------------------------------------------------------

/** "Guest-1023", or "Maria (Guest-1023)": the number keeps two guests named Maria apart. */
const guestLabel = (t: { guest_number: number; visitor_name: string | null }) =>
  t.visitor_name ? `${t.visitor_name} (Guest-${t.guest_number})` : `Guest-${t.guest_number}`;

export const listSupportThreads = async (branchId?: string | null) => {
  const caller = await getCaller([...COUNTER_ROLES]);
  if (caller.success === false) return caller;
  let ids = caller.data.branchIds;
  if (branchId) {
    if (!canAccessBranch(caller.data, branchId)) return ok([]);
    ids = [branchId];
  }
  if (ids && ids.length === 0) return ok([]);

  const { data, error } = await chatModel.listSupportThreads(ids);
  if (error) return fromDbError(error, 'Failed to load conversations');
  return ok(
    (data ?? []).map(({ staff_read_at: readAt, ...t }: any) => ({
      ...t,
      last_message: t.last_message ?? '',
      display_name: guestLabel(t),
      unread: t.last_sender_role === 'visitor' && (!readAt || readAt < t.last_message_at),
    })),
  );
};

/** A support thread at one of the caller's branches; anything else is "not found". */
const requireSupportThread = async (threadId: string) => {
  const caller = await getCaller([...COUNTER_ROLES]);
  if (caller.success === false) return caller;
  const { data } = await chatModel.getThread(threadId);
  if (!data || data.kind !== 'support' || !canAccessBranch(caller.data, data.branch_id)) {
    return fail('Conversation not found', 404);
  }
  return ok(caller.data);
};

export const getSupportMessages = async (threadId: string) => {
  const allowed = await requireSupportThread(threadId);
  if (allowed.success === false) return allowed;
  return listMessages(threadId);
};

export const postStaffMessage = async (threadId: string, input: unknown) => {
  const allowed = await requireSupportThread(threadId);
  if (allowed.success === false) return allowed;
  const body = validate(messageBody, input);
  if (body.success === false) return body;
  return addMessage(threadId, { senderRole: 'cashier', senderId: allowed.data.user.id, body: body.data.body });
};

export const postStaffImage = async (threadId: string, file: Blob) => {
  const allowed = await requireSupportThread(threadId);
  if (allowed.success === false) return allowed;
  return addImage(threadId, 'cashier', allowed.data.user.id, file);
};

export const markSupportThreadRead = async (threadId: string) => {
  const allowed = await requireSupportThread(threadId);
  if (allowed.success === false) return allowed;
  const { error } = await chatModel.updateThread(threadId, { staff_read_at: new Date().toISOString() });
  if (error) return fromDbError(error);
  return ok(null);
};

// ---------------------------------------------------------------------------
// Delivery threads: the customer and the rider holding the order
// ---------------------------------------------------------------------------

type Side = 'customer' | 'rider';

/** The order, if the caller is its customer (`as` customer) or the rider holding it (`as` rider). */
const loadParticipantOrder = async (orderId: string, as: Side) => {
  const caller = await getCaller(as === 'rider' ? ['rider'] : undefined);
  if (caller.success === false) return caller;
  const { data: order } = await chatModel.getDeliveryOrder(orderId);
  const userId = caller.data.user.id;
  const allowed = order && order.fulfillment_type === 'delivery' &&
    (as === 'customer' ? order.customer_id === userId : order.rider_id === userId);
  // 404 rather than 403, so other people's order ids are not confirmed to exist.
  if (!allowed) return fail('Delivery order not found', 404);
  return ok({ order, userId });
};

// The thread follows the order, not the rider: another rider may take it over.
const findOrCreateDeliveryThread = async (order: { id: string; branch_id: string }): Promise<Result<string>> => {
  const existing = await chatModel.getThreadForOrder(order.id);
  if (existing.data) return ok(existing.data.id);
  const { data, error } = await chatModel.insertDeliveryThread(order.id, order.branch_id);
  if (!error) return ok(data.id);
  if (error.code !== '23505') return fromDbError(error);
  // Lost a race with the other participant's first request.
  const retry = await chatModel.getThreadForOrder(order.id);
  return retry.data ? ok(retry.data.id) : fromDbError(error);
};

const isOpen = (o: { status: string; rider_id: string | null }) => o.status === 'out_for_delivery' && Boolean(o.rider_id);

const nameOf = async (profileId: string | null) => {
  if (!profileId) return null;
  const { data } = await chatModel.getProfileName(profileId);
  return (data as string | null) ?? null;
};

export const getOrderChat = async (orderId: string, as: Side) => {
  const loaded = await loadParticipantOrder(orderId, as);
  if (loaded.success === false) return loaded;
  const { order } = loaded.data;

  // No thread until a rider takes the order; reading never creates one for an order nobody holds.
  const { data: thread } = await chatModel.getThreadForOrder(orderId);
  let threadId = thread?.id ?? null;
  if (!threadId && order.rider_id) {
    const created = await findOrCreateDeliveryThread(order);
    if (created.success === false) return created;
    threadId = created.data;
  }
  const messages = threadId ? await listMessages(threadId) : ok([] as ChatMessage[]);
  if (messages.success === false) return messages;

  return ok({
    thread_id: threadId,
    open: isOpen(order),
    order: { id: order.id, order_number: order.order_number, status: order.status },
    with:
      as === 'customer'
        ? { role: 'rider', name: await nameOf(order.rider_id) }
        : { role: 'customer', name: order.customer_name ?? (await nameOf(order.customer_id)) },
    messages: messages.data,
  });
};

const openDeliveryThread = async (orderId: string, as: Side) => {
  const loaded = await loadParticipantOrder(orderId, as);
  if (loaded.success === false) return loaded;
  if (!isOpen(loaded.data.order)) return fail('Chat is only open while the order is out for delivery', 409);
  const thread = await findOrCreateDeliveryThread(loaded.data.order);
  if (thread.success === false) return thread;
  return ok({ threadId: thread.data, userId: loaded.data.userId });
};

export const postOrderMessage = async (orderId: string, as: Side, input: unknown) => {
  const body = validate(messageBody, input);
  if (body.success === false) return body;
  const opened = await openDeliveryThread(orderId, as);
  if (opened.success === false) return opened;
  return addMessage(opened.data.threadId, { senderRole: as, senderId: opened.data.userId, body: body.data.body });
};

export const postOrderImage = async (orderId: string, as: Side, file: Blob) => {
  const opened = await openDeliveryThread(orderId, as);
  if (opened.success === false) return opened;
  return addImage(opened.data.threadId, as, opened.data.userId, file);
};
