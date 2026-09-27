import * as catalog from '../services/catalog.service.js';
import { buildMeta } from '../utils/pagination.js';

export const list = async (req, res) => {
  const { page, limit, search, category_id: categoryId, available } = req.query;
  const { data, total } = await catalog.listProducts({
    page,
    limit,
    search,
    categoryId,
    available,
  });

  res.json({ data, meta: buildMeta({ page, limit, total }) });
};

export const get = async (req, res) => {
  res.json({ data: await catalog.getProduct(req.params.id) });
};

export const create = async (req, res) => {
  res.status(201).json({ data: await catalog.createProduct(req.body) });
};

export const update = async (req, res) => {
  res.json({ data: await catalog.updateProduct(req.params.id, req.body) });
};

export const remove = async (req, res) => {
  await catalog.deleteProduct(req.params.id);
  res.status(204).send();
};
