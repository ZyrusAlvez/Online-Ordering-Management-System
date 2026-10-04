import * as employeeService from '../services/employee.service.js';

export const cashierLogin = async (req, res) => {
  res.json(await employeeService.loginCashier(req.body.password));
};

export const kioskUnlock = async (req, res) => {
  const { id, name, key } = await employeeService.unlockKiosk({
    password: req.body.password,
    deviceName: req.body.device_name,
  });
  res.status(201).json({ data: { id, name, key } });
};
