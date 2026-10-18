// Shared vocabulary for the order domain.
//
// Kept out of the service layer so validators can import it without pulling in
// a Supabase client, and so route/controller/service all agree on one list.

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'cancelled',
  'voided',
] as const;

export const PAYMENT_STATUSES = [
  'unpaid',
  'processing',
  'paid',
  'refund_pending',
  'refunded',
  'refund_failed',
  'failed',
] as const;

export const CHANNELS = ['kiosk', 'pos', 'online'] as const;
export const PAYMENT_METHODS = ['cash', 'gcash'] as const;
export const ROLES = ['customer', 'cashier', 'rider', 'admin', 'super_admin'] as const;

/**
 * An admin manages the branches it is assigned to; a super admin manages every
 * branch, plus what is shared across them (menu, branches, admins, branding).
 */
export const ADMIN_ROLES = ['admin', 'super_admin'] as const;

/** Roles that work at a branch and see its orders at the counter. */
export const COUNTER_ROLES = ['cashier', ...ADMIN_ROLES] as const;

/** Fulfillment types available per channel — a kiosk cannot take a delivery. */
export const COUNTER_FULFILLMENT = ['dine_in', 'take_out'] as const;
export const REMOTE_FULFILLMENT = ['delivery', 'pickup'] as const;

/**
 * Which status a cashier may move an order to, and from where. Encoded on the
 * server so an out-of-order transition is rejected by the API, not merely
 * hidden by the UI.
 */
export const ALLOWED_TRANSITIONS = {
  pending: ['confirmed', 'preparing'],
  confirmed: ['preparing', 'ready'],
  preparing: ['ready'],
  ready: ['completed'],
  out_for_delivery: ['completed'],
};

/** Select string used wherever an order is returned with its items joined. */
export const WITH_ITEMS =
  '*, branch:branches(id, code, name), ' +
  'order_items(*, product:products(id, name, price), variant:product_variants(id, label, price))';
