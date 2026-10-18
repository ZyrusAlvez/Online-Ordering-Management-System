'use server';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as visitorChatModel from '@/models/server/visitorChatModel';
import * as adminModel from '@/models/server/adminModel';
import { checkImage } from '@/controllers/storageController';
import { RULES, clientIp, limit } from '@/controllers/server/rateLimit';
import { validate } from '@/utils/validate';
import { createVisitorThreadSchema, messageBody } from '@/utils/validators/chat.validators';
import { fail, fromDbError, ok, type Result } from '@/utils/result';

// A visitor has no account, so their conversation is guarded by a random token they keep in
// localStorage. Only its hash is stored. This runs on the server because the secret table
// (chat_thread_secrets) must never be readable from the browser.

const MAX_IMAGES_PER_THREAD = 30;
const hashToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

const withImageUrls = async (rows: any[]) => {
  const paths = [...new Set(rows.map((r) => r.image_path).filter(Boolean))] as string[];
  const { data } = paths.length ? await visitorChatModel.signedUrls(paths, 3600) : { data: [] };
  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows.map(({ image_path: path, ...m }) => ({ ...m, image_url: path ? (urls.get(path) ?? null) : null }));
};

const addMessage = async (threadId: string, body: string, imagePath: string | null = null) => {
  const { data, error } = await visitorChatModel.insertMessage({
    thread_id: threadId,
    sender_role: 'visitor',
    body,
    image_path: imagePath,
  });
  if (error) return fromDbError(error, 'Failed to send');
  await visitorChatModel.updateThread(threadId, {
    last_message_at: data.created_at,
    last_message: body ? body.slice(0, 200) : '📷 Photo',
    last_sender_role: 'visitor',
  });
  await visitorChatModel.ping(threadId);
  return ok((await withImageUrls([data]))[0]);
};

/** Unknown thread and wrong token look identical. */
const requireVisitor = async (threadId: string, token: string): Promise<Result<null>> => {
  const denied = fail('Invalid chat token', 401);
  if (!token || !threadId) return denied;
  const { data } = await visitorChatModel.getSecret(threadId);
  if (!data) return denied;
  const stored = Buffer.from(data.token_hash, 'hex');
  const given = Buffer.from(hashToken(token), 'hex');
  return stored.length === given.length && timingSafeEqual(stored, given) ? ok(null) : denied;
};

/** Opens a thread in the chosen branch's inbox with its first message. The token is returned once. */
export async function createVisitorThread(input: unknown) {
  const body = validate(createVisitorThreadSchema, input);
  if (body.success === false) return body;
  const allowed = await limit(RULES.visitorThread, await clientIp());
  if (allowed.success === false) return allowed;
  const { data: branch } = await adminModel.getBranch(body.data.branch_id);
  if (!branch || !branch.is_active) return fail('That branch is not taking messages');

  const token = `chat_${randomBytes(24).toString('base64url')}`;
  const { data: thread, error } = await visitorChatModel.insertSupportThread(branch.id, body.data.name ?? null);
  if (error) return fromDbError(error, 'Could not start the conversation');

  const { error: secretError } = await visitorChatModel.insertSecret(thread.id, hashToken(token));
  if (secretError) {
    await visitorChatModel.deleteThread(thread.id);
    return fromDbError(secretError, 'Could not start the conversation');
  }
  const message = await addMessage(thread.id, body.data.body);
  if (message.success === false) return message;
  return ok({ thread_id: thread.id, token, messages: [message.data] });
}

export async function getVisitorMessages(threadId: string, token: string) {
  const allowed = await requireVisitor(threadId, token);
  if (allowed.success === false) return allowed;
  const { data, error } = await visitorChatModel.listMessages(threadId);
  if (error) return fromDbError(error, 'Failed to load messages');
  return ok(await withImageUrls((data ?? []).reverse()));
}

export async function postVisitorMessage(threadId: string, token: string, input: unknown) {
  const allowed = await requireVisitor(threadId, token);
  if (allowed.success === false) return allowed;
  const body = validate(messageBody, input);
  if (body.success === false) return body;
  const pace = await limit(RULES.visitorMessage, await clientIp());
  if (pace.success === false) return pace;
  return addMessage(threadId, body.data.body);
}

/** `form` carries the (already shrunk) photo as `file`. */
export async function postVisitorImage(threadId: string, token: string, form: FormData) {
  const allowed = await requireVisitor(threadId, token);
  if (allowed.success === false) return allowed;
  const file = form.get('file');
  if (!(file instanceof Blob)) return fail('Attach a photo');
  const pace = await limit(RULES.visitorImage, await clientIp());
  if (pace.success === false) return pace;

  const checked = await checkImage(file);
  if (checked.success === false) return checked;
  const { count } = await visitorChatModel.countImages(threadId);
  if ((count ?? 0) >= MAX_IMAGES_PER_THREAD) {
    return fail(`This conversation has reached its limit of ${MAX_IMAGES_PER_THREAD} photos`, 409);
  }

  const path = `${threadId}/${crypto.randomUUID()}.${checked.data}`;
  const { error } = await visitorChatModel.upload(path, file);
  if (error) return fail('Could not upload the photo', 500);
  const sent = await addMessage(threadId, '', path);
  if (sent.success === false) await visitorChatModel.remove([path]);
  return sent;
}
