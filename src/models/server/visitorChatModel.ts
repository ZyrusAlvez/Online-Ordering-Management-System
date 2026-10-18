import 'server-only';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { HISTORY_LIMIT, MESSAGE_COLUMNS } from '@/models/chatModel';

export const insertSupportThread = (branchId: string, visitorName: string | null) =>
  supabaseAdmin.from('chat_threads').insert({ kind: 'support', visitor_name: visitorName, branch_id: branchId }).select('id').single();

export const deleteThread = (id: string) => supabaseAdmin.from('chat_threads').delete().eq('id', id);

export const insertSecret = (threadId: string, tokenHash: string) =>
  supabaseAdmin.from('chat_thread_secrets').insert({ thread_id: threadId, token_hash: tokenHash });

export const getSecret = (threadId: string) =>
  supabaseAdmin.from('chat_thread_secrets').select('token_hash').eq('thread_id', threadId).maybeSingle();

export const listMessages = (threadId: string) =>
  supabaseAdmin
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

export const insertMessage = (fields: Record<string, unknown>) =>
  supabaseAdmin.from('chat_messages').insert(fields).select(MESSAGE_COLUMNS).single();

export const countImages = (threadId: string) =>
  supabaseAdmin.from('chat_messages').select('id', { count: 'exact', head: true }).eq('thread_id', threadId).not('image_path', 'is', null);

export const updateThread = (threadId: string, fields: Record<string, unknown>) =>
  supabaseAdmin.from('chat_threads').update(fields).eq('id', threadId);

export const upload = (path: string, file: Blob) =>
  supabaseAdmin.storage.from('chat-images').upload(path, file, { contentType: file.type, upsert: false });

export const remove = (paths: string[]) => supabaseAdmin.storage.from('chat-images').remove(paths);

export const signedUrls = (paths: string[], seconds: number) =>
  supabaseAdmin.storage.from('chat-images').createSignedUrls(paths, seconds);

export const ping = async (threadId: string) => {
  const channel = supabaseAdmin.channel(`chat:${threadId}`);
  try {
    await channel.httpSend('message', { thread_id: threadId });
  } catch {
    // The visitor also polls.
  } finally {
    supabaseAdmin.removeChannel(channel);
  }
};
