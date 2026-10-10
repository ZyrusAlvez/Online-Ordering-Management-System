import * as riderService from '../services/rider.service.js';
import { buildMeta } from '../utils/pagination.js';

export const pool = async (req, res) => {
  res.json({ data: await riderService.listPool(req.branchScope.ids) });
};

export const listMine = async (req, res) => {
  const { page, limit, active } = req.query;
  const { data, total } = await riderService.listRiderOrders(req.user.id, { page, limit, active });

  res.json({ data, meta: buildMeta({ page, limit, total }) });
};

export const claim = async (req, res) => {
  res.json({ data: await riderService.claimOrder(req.params.id, req.user.id, req.branchScope.ids) });
};

export const unclaim = async (req, res) => {
  res.json({ data: await riderService.unclaimOrder(req.params.id, req.user.id) });
};

export const delivered = async (req, res) => {
  const data = await riderService.markDelivered(req.params.id, req.user.id, {
    collectedAmount: req.body.collected_amount ?? null,
  });

  res.json({ data });
};
