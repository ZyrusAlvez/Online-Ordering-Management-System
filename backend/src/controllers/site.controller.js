import * as siteService from '../services/site.service.js';

export const images = async (_req, res) => {
  res.json({ data: await siteService.getSiteImages() });
};
