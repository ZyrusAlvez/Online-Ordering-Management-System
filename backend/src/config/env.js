import 'dotenv/config';
import { z } from 'zod';

const csv = (value) =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  CORS_ORIGIN: z.string().default('*'),
  LOG_FORMAT: z.string().default('dev'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  // How many reverse proxies sit in front of the API (0 = none: never trust
  // X-Forwarded-For, or a client could fake its IP and dodge the rate limits).
  TRUST_PROXY: z
    .string()
    .default('1')
    .transform((v) => (/^\d+$/.test(v) ? Number(v) : v === 'false' ? false : v)),

  SUPABASE_URL: z.string().url('SUPABASE_URL must be your project URL, e.g. https://xyz.supabase.co'),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1, 'SUPABASE_PUBLISHABLE_KEY is required'),
  SUPABASE_SECRET_KEY: z.string().min(1, 'SUPABASE_SECRET_KEY is required'),
  SUPABASE_JWKS_URL: z.string().url().optional(),
  DATABASE_URL: z.string().optional(),

  // PayMongo is optional: the cash-only business runs fully without it, and
  // the GCash routes return 503 rather than the server refusing to boot.
  PAYMONGO_SECRET_KEY: z.string().optional(),
  PAYMONGO_WEBHOOK_SECRET: z.string().optional(),
  PAYMONGO_API_URL: z.string().url().default('https://api.paymongo.com/v1'),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
  KIOSK_RETURN_URL: z.string().url().default('http://localhost:5173/kiosk/payment-result'),

  // The shared cashier account that /employee/cashier/login signs in to.
  CASHIER_EMAIL: z.string().email().default('cashier@3k.local'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`Invalid environment configuration:\n${details}\n\nSee .env.example.`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  corsOrigins: raw.CORS_ORIGIN === '*' ? '*' : csv(raw.CORS_ORIGIN),
  // GCash endpoints check this and fail loudly instead of half-working.
  paymongoEnabled: Boolean(raw.PAYMONGO_SECRET_KEY),
};
