import { post } from './client.js';

/**
 * Logins for the seeded accounts. Passwords come from the environment so the
 * suite never hardcodes credentials; scripts/run-tests.mjs passes them through.
 */
export const ACCOUNTS = {
  admin: {
    email: process.env.TEST_ADMIN_EMAIL ?? 'admin@3k.local',
    password: process.env.TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD,
  },
  cashier: {
    email: process.env.TEST_CASHIER_EMAIL ?? 'cashier@3k.local',
    password: process.env.TEST_CASHIER_PASSWORD ?? process.env.CASHIER_PASSWORD,
  },
  customer: {
    email: process.env.TEST_CUSTOMER_EMAIL ?? 'customer@3k.local',
    password: process.env.TEST_CUSTOMER_PASSWORD ?? 'testpass12345',
  },
  customer2: {
    email: 'customer2@3k.local',
    password: 'testpass12345',
  },
  rider: {
    email: process.env.TEST_RIDER_EMAIL ?? 'rider1@3k.local',
    password: process.env.TEST_RIDER_PASSWORD ?? 'testpass12345',
  },
};

const cache = new Map();

/** Logs in (once per process) and returns the access token for a role. */
export const tokenFor = async (role) => {
  if (cache.has(role)) return cache.get(role);

  const account = ACCOUNTS[role];
  if (!account) throw new Error(`Unknown test role: ${role}`);
  if (!account.password) {
    throw new Error(
      `No password for ${role}. Run: node --env-file=.env scripts/seed-accounts.mjs ` +
        `(it writes TEST_${role.toUpperCase()}_PASSWORD into .env).`,
    );
  }

  const res = await post('/auth/login', { email: account.email, password: account.password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${account.email}: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const token = res.body.session.access_token;
  cache.set(role, token);
  return token;
};

/** The user id behind a role's token, read from the JWT `sub` claim. */
export const userIdFor = async (role) => {
  const token = await tokenFor(role);
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
};

export const roleClaimOf = (token) =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).app_metadata?.role;
