import * as authService from '../services/auth.service.js';
import * as profileService from '../services/profile.service.js';

export const register = async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json(result);
};

export const login = async (req, res) => {
  res.json(await authService.login(req.body));
};

export const refresh = async (req, res) => {
  res.json(await authService.refresh(req.body.refreshToken));
};

export const logout = async (req, res) => {
  await authService.logout(req.token);
  res.status(204).send();
};

export const me = (req, res) => {
  res.json({ user: req.user });
};

export const getProfile = async (req, res) => {
  res.json({ data: await profileService.getOwnProfile(req.user) });
};

export const updateProfile = async (req, res) => {
  res.json({ data: await profileService.updateOwnProfile(req.user, req.body) });
};

export const changePassword = async (req, res) => {
  await profileService.changeOwnPassword(req.user, {
    currentPassword: req.body.current_password,
    newPassword: req.body.new_password,
  });
  res.status(204).send();
};
