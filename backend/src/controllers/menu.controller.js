import * as catalog from '../services/catalog.service.js';

export const getMenu = async (req, res) => {
  const data = await catalog.getFullMenu({
    includeUnavailable: req.query.include_unavailable === 'true',
  });

  res.json({ data });
};
