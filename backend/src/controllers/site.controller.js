import { getGcashAccount } from '../services/payment.service.js';
import * as siteService from '../services/site.service.js';

export const images = async (_req, res) => {
  res.json({ data: await siteService.getSiteImages() });
};

/** The GCash account customers pay into (null when GCash is switched off). */
export const gcash = (_req, res) => {
  res.json({ data: getGcashAccount() });
};
