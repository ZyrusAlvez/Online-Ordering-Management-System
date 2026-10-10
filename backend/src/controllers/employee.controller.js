import * as employeeService from '../services/employee.service.js';

export const cashierLogin = async (req, res) => {
  res.json(
    await employeeService.loginCashier({ branchId: req.body.branch_id, password: req.body.password }),
  );
};

export const kioskUnlock = async (req, res) => {
  const { id, name, key, branch } = await employeeService.unlockKiosk({
    branchId: req.body.branch_id,
    password: req.body.password,
    deviceName: req.body.device_name,
  });
  res.status(201).json({ data: { id, name, key, branch } });
};
