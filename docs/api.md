# Controllers and server actions

There is no HTTP API any more. Screens call **controllers** (in the browser, against Supabase with the user's session)
and **server actions** (on the server, with the secret key). This is the list of what they can call, who may call it,
and what comes back. How the layers fit is in [architecture.md](./architecture.md).

**Contents:** [Results and errors](#results-and-errors) · [Controllers](#controllers) ·
[Server actions](#server-actions) · [Live updates](#live-updates)

---

## Results and errors

Every controller and action returns a `Result<T>` (`src/utils/result.ts`):

```ts
{ success: true, data: T }
{ success: false, error: 'Order not found or is no longer pending', status: 409 }
```

`status` keeps the old HTTP codes: `400` bad input, `401` signed out, `403` not allowed, `404` not found (also for
another branch's or another customer's rows, so their existence is not confirmed), `409` someone changed it first or
the state does not allow it, `413`/`415` image too big or not an image, `503` GCash switched off.

Screens unwrap with `call()` (returns `data`, throws `ApiError` with `status`, `message`, `friendly`) or `respond()`
(returns `{ data }`), from `src/utils/apiError.ts`. Inputs are validated with the zod schemas in
`src/utils/validators/`; the first field message becomes `error`.

Lists return `{ data: [...], meta: { page, limit, total, pages } }` (`limit` 1–100, default 20).

## Controllers

Called from the browser. Who may call is checked by `getCaller()` for a clear message, and again by the database
policies and triggers ([architecture.md](./architecture.md#who-enforces-what)).

### Public (anyone)

| Function | Returns |
| --- | --- |
| `branchController.getActiveBranches()` | Active branches, hours as `"08:00"`, coordinates as numbers |
| `menuController.getMenu({ includeUnavailable?, branchId? })` | Categories → products → variants. With `branchId`, each product has `available_everywhere`, `sold_out_here`, and `is_available` for that branch |
| `siteController.getSiteImages()` | `{ logo: url \| null }` |
| `siteController.getGcashAccount()` | `{ name, number, qr_image }`, or `null` when GCash is off |

### Sign-in (`authController`)

`login(email, password)`, `register(email, password, fullName?)` (the session is null when email confirmation is on),
`loginWithGoogle(next?)`, `finishGoogleLogin(code)`, `adoptSession(tokens)` (after the cashier gate), `logout()` (this
device only), `getSession()`, `onAuthStateChange()`, `roleOf(session)`, `HOME_FOR_ROLE`.

### Customer

| Function | Notes |
| --- | --- |
| `orderController.placeOnlineOrder(body)` | `branch_id`, `fulfillment_type` (`delivery`/`pickup`), `payment_method` (`cash`/`gcash`), `items[{product_id, variant_id?, quantity, notes?}]`, `notes?`, `scheduled_for?`; delivery needs `delivery_address` and `customer_phone`. Prices come from the menu; the branch must be open now or the slot valid |
| `orderController.listMyOrders({ page, limit, status? })` | Own orders, newest first |
| `orderController.getOrder(id)` / `paymentController.getOrderWithPayment(id)` | One order with items; the latter adds `gcash_payment` (latest submission, `receipt_url` a 1-hour link) |
| `orderController.cancelMyOrder(id)` | Only while pending/confirmed and unpaid (or GCash rejected) |
| `paymentController.uploadReceipt(id, file)` | GCash receipt image into the private bucket; returns its path (≤ 10 per order) |
| `paymentController.submitGcashProof(id, { reference_number?, receipt_path? })` | At least one; the order waits for staff (`processing`) |
| `profileController.getMyProfile()` / `updateMyProfile({ full_name?, phone?, default_address? })` | Own profile, with the branches a staff account works at |
| `chatController.getOrderChat(id, 'customer')`, `postOrderMessage(id, 'customer', { body })`, `postOrderImage(id, 'customer', file)` | Delivery chat with the rider holding the order; posting only while out for delivery |

### Counter staff (cashier, admin, super admin, at their branches)

| Function | Notes |
| --- | --- |
| `orderController.listStaffOrders({ branch_id?, status?, payment_status?, channel?, q?, from?, to?, page, limit })` | The POS queue (`q` searches order number and name) and the admin list (`from`/`to`) |
| `orderController.createWalkInOrder(body)` | `branch_id?` (required if several), `fulfillment_type` (`dine_in`/`take_out`), `customer_name`, `payment_method`, `items` |
| `orderController.replaceItems(id, { items })` | Before the kitchen starts and before any payment |
| `orderController.confirmOrder(id)` / `advanceStatus(id, status)` | Moves allowed by `ALLOWED_TRANSITIONS`; anything else is 409 |
| `paymentController.payCash(id, { tendered_amount? })` | Returns `{ order, tendered, change }` |
| `paymentController.payGcashAtCounter(id, { reference_number })` | The cashier saw the receipt |
| `paymentController.verifyGcash(id, { approve, reason? })` | A reason is required to reject |
| `paymentController.voidOrder(id, { reason })` | A paid GCash order goes to `refund_pending`; returns `{ order, refund_pending }` |
| `chatController.listSupportThreads(branchId?)`, `getSupportMessages(id)`, `postStaffMessage(id, { body })`, `postStaffImage(id, file)`, `markSupportThreadRead(id)` | The branch's guest-chat inbox |

### Rider (their branch)

`riderController.getPool()`, `getMyDeliveries({ active: 'true' \| 'false', page, limit })`, `claimOrder(id)`
(race-safe: the loser gets 409), `unclaimOrder(id)`, `markDelivered(id, { collected_amount? })` (required for cash on
delivery, at least the total), and the delivery chat with `as = 'rider'`.

### Admin

| Function | Who |
| --- | --- |
| `paymentController.markRefunded(id)` | Admin of the order's branch, or super admin |
| `branchController.setSoldOut(branchId, productId, soldOut)` | Admin of that branch, or super admin |
| `branchController.getAllBranches()`, `createBranch(body)`, `updateBranch(id, body)` | Super admin (branches are deactivated, never deleted) |
| `menuController.createCategory`, `updateCategory`, `deleteCategory`, `createProduct`, `updateProduct` (variants synced by label), `setProductImage`, `clearProductImage`, `deleteProduct` | Super admin. Options or products that appear in past orders cannot be removed (409) |
| `siteController.setSiteImage('logo', file)` / `clearSiteImage('logo')` | Super admin |

## Server actions

In `src/controllers/server/`, run on the server. Staff actions take the caller's access token first
(`accessToken()` from `AuthContext`).

| Action | Who | Notes |
| --- | --- | --- |
| `employeeActions.loginCashier({ branch_id, password })` | Anyone with the branch's password | Returns session tokens; the same 401 for "no cashier" and "wrong password" |
| `employeeActions.unlockKiosk({ branch_id, password, device_name })` | Anyone with the branch's kiosk password | Returns `{ id, name, key, branch }`; the key is shown once |
| `kioskActions.kioskMe(key)`, `createKioskOrder(key, body)`, `kioskOrder(key, id)` | A kiosk device key | Unknown key 401, revoked 403; a kiosk sees only its own orders |
| `visitorChatActions.createVisitorThread({ branch_id, body, name? })` | Anyone | Returns `{ thread_id, token, messages }`; keep the token |
| `visitorChatActions.getVisitorMessages(id, token)`, `postVisitorMessage(id, token, { body })`, `postVisitorImage(id, token, formData)` | The token's holder | Wrong token 401; at most 30 photos per conversation |
| `staffActions.listRiders`, `createRider`, `updateRider` | Admin (their branches), super admin | A rider works at one branch |
| `staffActions.listKiosks`, `createKiosk`, `revokeKiosk` | Admin (their branches), super admin | Revoking keeps the device row (orders reference it) |
| `staffActions.setEmployeePassword(token, 'cashier' \| 'kiosk', { branch_id, password })` | Admin (their branches), super admin | The first cashier password creates the branch's register login |
| `staffActions.getSalesReport(token, { from?, to?, branch_id? })` | Admin (their branches), super admin | Manila days, default the last 7, at most 366 |
| `staffActions.listAdmins`, `createAdmin`, `updateAdmin` | Super admin | Branch admins only; a super admin is not edited here |
| `accountActions.changeMyPassword(token, { current_password, new_password })` | Any email/password account except the shared cashier | A wrong current password is 400, not 401 |

## Live updates

`src/hooks/realtime.ts`: `subscribeToOrders`, `subscribeToChat(threadId)`, `subscribeToInbox`,
`subscribeToVisitorChannel(threadId)`. Each callback means "something changed, refetch"; RLS decides which rows a
signed-in subscriber hears about, and guests get a content-free broadcast ping.
