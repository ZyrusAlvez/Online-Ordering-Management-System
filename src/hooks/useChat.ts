'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetch } from '@/hooks/hooks';
import { subscribeToInbox, subscribeToVisitorChannel } from '@/hooks/realtime';
import { listSupportThreads } from '@/controllers/chatController';
import {
  createVisitorThread,
  getVisitorMessages,
  postVisitorImage,
  postVisitorMessage,
} from '@/controllers/server/visitorChatActions';
import { call } from '@/utils/apiError';

const POLL_MS = 20_000;

/**
 * useFetch that also refetches when `subscribe` fires and on a slow timer.
 * Realtime is the fast path; the timer covers a dropped socket.
 */
export function useLive(loader, subscribe, deps: unknown[] = []) {
  const state = useFetch(loader, deps);
  const refresh = useRef(state.refresh);
  refresh.current = state.refresh;

  useEffect(() => subscribe?.(() => refresh.current()), deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = setInterval(() => refresh.current(), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  return state;
}

/** Cashier inbox: one branch's support threads, kept live, with the unread count for badges. */
export function useInbox(branchId) {
  const state = useLive(
    () => call(listSupportThreads(branchId)),
    subscribeToInbox,
    [branchId],
  );
  const threads: any[] = state.data ?? [];
  return { ...state, threads, unread: threads.filter((t) => t.unread).length };
}

// --- visitor (no account) ----------------------------------------------------

const KEY = '3k.chat';

const readStored = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
};
const writeStored = (value) => {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the chat still works until the tab closes.
  }
};

/**
 * The anonymous visitor's conversation with the cashier. The thread id and its
 * secret token live in localStorage, so a returning visitor picks up where they
 * left off. The thread is only created when they send their first message.
 */
export function useVisitorChat() {
  const [conv, setConv] = useState(readStored); // { threadId, token, seen } | null
  const [messages, setMessages] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const threadId = conv?.threadId;
  const token = conv?.token;

  const refresh = useCallback(async () => {
    if (!threadId) return;
    try {
      setMessages(await call(getVisitorMessages(threadId, token)));
    } catch (err) {
      // The thread is gone or the token is stale: start fresh next time.
      if (err.status === 401) {
        writeStored(null);
        setConv(null);
        setMessages([]);
      }
    }
  }, [threadId, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => (threadId ? subscribeToVisitorChannel(threadId, refresh) : undefined), [threadId, refresh]);

  useEffect(() => {
    if (!threadId) return undefined;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [threadId, refresh]);

  /** The first message also says which branch's cashier the conversation is with. */
  const send = async (body, name, branch) => {
    setSending(true);
    setError(null);
    try {
      if (!threadId) {
        const res = await call(createVisitorThread({ branch_id: branch.id, body, ...(name ? { name } : {}) }));
        const next = { threadId: res.thread_id, token: res.token, seen: 0, branchName: branch.name };
        writeStored(next);
        setConv(next);
        setMessages(res.messages);
      } else {
        await call(postVisitorMessage(threadId, token, { body }));
        await refresh();
      }
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setSending(false);
    }
  };

  /** Sends a photo (already shrunk). Only possible once the conversation exists. */
  const sendImage = async (blob) => {
    if (!threadId) return false;
    // A failure throws to the chat window, which shows it next to the photo button.
    const form = new FormData();
    form.append('file', blob);
    await call(postVisitorImage(threadId, token, form));
    await refresh();
    return true;
  };

  const fromStaff = messages.filter((m) => m.sender_role !== 'visitor').length;
  const unread = Math.max(0, fromStaff - (conv?.seen ?? 0));

  const markSeen = () => {
    if (!conv || unread === 0) return;
    const next = { ...conv, seen: fromStaff };
    writeStored(next);
    setConv(next);
  };

  return {
    started: Boolean(threadId),
    branchName: conv?.branchName ?? null,
    messages,
    send,
    sendImage,
    sending,
    error,
    unread,
    markSeen,
  };
}
