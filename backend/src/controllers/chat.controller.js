import * as branchService from '../services/branch.service.js';
import * as chatService from '../services/chat.service.js';
import { branchFilter } from '../utils/branchScope.js';

const CHAT_TOKEN_HEADER = 'x-chat-token';

// --- visitor (no account) ---
export const createVisitorThread = async (req, res) => {
  const branch = await branchService.getActiveBranchOrFail(req.body.branch_id);
  const data = await chatService.createVisitorThread({
    name: req.body.name,
    body: req.body.body,
    branchId: branch.id,
  });
  res.status(201).json({ data });
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

export const visitorSendImage = async (req, res) => {
  const data = await chatService.postVisitorImage(req.params.id, req.get(CHAT_TOKEN_HEADER), req.body);
  res.status(201).json({ data });
};

// --- cashier inbox ---
// Each branch has its own inbox; req.branchScope comes from the /pos router.
export const listThreads = async (req, res) => {
  const branchIds = branchFilter(req.branchScope, req.query.branch_id);
  res.json({ data: await chatService.listSupportThreads(branchIds) });
};

export const threadMessages = async (req, res) => {
  res.json({ data: await chatService.getSupportMessages(req.params.id, req.branchScope) });
};

export const staffSend = async (req, res) => {
  res.status(201).json({
    data: await chatService.postStaffMessage(req.params.id, req.branchScope, req.user.id, req.body.body),
  });
};

export const staffSendImage = async (req, res) => {
  res.status(201).json({
    data: await chatService.postStaffImage(req.params.id, req.branchScope, req.user.id, req.body),
  });
};

export const markRead = async (req, res) => {
  await chatService.markSupportThreadRead(req.params.id, req.branchScope);
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

export const orderSendImage = (as) => async (req, res) => {
  const data = await chatService.postOrderImage(req.params.id, req.user.id, as, req.body);
  res.status(201).json({ data });
};
