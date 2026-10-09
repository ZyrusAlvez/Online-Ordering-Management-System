import { z } from 'zod';
import { latitude, longitude, optionalText, phone, requiredText } from './fields.js';

/** Wall-clock time in Manila, 24-hour "HH:MM". */
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, e.g. 08:00');

const fields = {
  name: requiredText(80, 'Name is required'),
  // Short, stable id used in the branch's cashier login (cashier.<code>@...).
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,30}$/, '2–30 lowercase letters, digits or dashes'),
  // Empty clears it.
  address: optionalText(300).transform((v) => v || null),
  phone: phone.nullable(),
  latitude,
  longitude,
  // Both null = open around the clock.
  opens_at: clock.nullable(),
  closes_at: clock.nullable(),
  is_active: z.boolean(),
};

const hoursAgree = (b) =>
  (b.opens_at === undefined) === (b.closes_at === undefined) &&
  (b.opens_at === null) === (b.closes_at === null);

const closesAfterOpening = (b) => !b.opens_at || !b.closes_at || b.closes_at > b.opens_at;

const hourRules = (schema) =>
  schema
    .refine(hoursAgree, { message: 'Set both opening and closing time, or neither', path: ['closes_at'] })
    .refine(closesAfterOpening, { message: 'Closing time must be after opening time', path: ['closes_at'] });

export const createBranchSchema = hourRules(
  z.object({
    ...fields,
    address: fields.address.optional(),
    phone: fields.phone.optional(),
    opens_at: fields.opens_at.default(null),
    closes_at: fields.closes_at.default(null),
    is_active: fields.is_active.default(true),
  }),
);

export const updateBranchSchema = hourRules(
  z
    .object(fields)
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' }),
);
