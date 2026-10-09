import * as branchService from '../services/branch.service.js';

/** Active branches with their location and hours, for the map and branch pickers. */
export const list = async (_req, res) => {
  res.json({ data: await branchService.listBranches() });
};
