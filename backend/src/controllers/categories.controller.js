import * as catalog from '../services/catalog.service.js';

export const list = async (_req, res) => {
  res.json({ data: await catalog.listCategories() });
};

export const create = async (req, res) => {
  res.status(201).json({ data: await catalog.createCategory(req.body) });
};

export const update = async (req, res) => {
  res.json({ data: await catalog.updateCategory(req.params.id, req.body) });
};

export const remove = async (req, res) => {
  await catalog.deleteCategory(req.params.id);
  res.status(204).send();
};
