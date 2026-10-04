import * as chatService from '../services/chat.service.js';

const CHAT_TOKEN_HEADER = 'x-chat-token';

// --- visitor (no account) ---
export const createVisitorThread = async (req, res) => {
  res.status(201).json({ data: await chatService.createVisitorThread(req.body) });
};

export const visitorMessages = async (req, res) => {
  res.json({
    data: await chatService.getVisitorMessages(req.params.id, req.get(CHAT_TOKEN_HEADER)),
  });
};

export const visitorSend = async (req, res) => {
  const data = await chatService.postVisitorMessage(
    req.params.id,
    req.get(CHAT_TOKEN_HEADER),
    req.body.body,
  );
  res.status(201).json({ data });
};

// --- cashier inbox ---
export const listThreads = async (_req, res) => {
  res.json({ data: await chatService.listSupportThreads() });
};

export const threadMessages = async (req, res) => {
  res.json({ data: await chatService.getSupportMessages(req.params.id) });
};

export const staffSend = async (req, res) => {
  res.status(201).json({
    data: await chatService.postStaffMessage(req.params.id, req.user.id, req.body.body),
  });
};

export const markRead = async (req, res) => {
  await chatService.markSupportThreadRead(req.params.id);
  res.status(204).send();
};

// --- delivery chat; `as` is fixed by the route that mounts the handler ---
export const orderChat = (as) => async (req, res) => {
  res.json({ data: await chatService.getOrderChat(req.params.id, req.user.id, as) });
};

export const orderSend = (as) => async (req, res) => {
  const data = await chatService.postOrderMessage(req.params.id, req.user.id, as, req.body.body);
  res.status(201).json({ data });
};
