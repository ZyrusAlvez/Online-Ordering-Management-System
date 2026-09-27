import { supabaseAdmin } from '../config/supabase.js';
import { applyWebhookEvent, verifyWebhookSignature } from '../services/payment.service.js';

/**
 * PayMongo webhook receiver.
 *
 * req.body is the raw Buffer here, not parsed JSON: the route is mounted
 * before express.json() because the signature is computed over the exact
 * bytes, and re-serialising a parsed object would change them.
 */
export const paymongo = async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');

  verifyWebhookSignature(rawBody, req.get('paymongo-signature'));

  const event = JSON.parse(rawBody);
  const eventId = event?.data?.id;
  const eventType = event?.data?.attributes?.type;
  const resource = event?.data?.attributes?.data;

  if (!eventId || !eventType) {
    // The signature was valid, so this really is from PayMongo — acknowledge
    // it rather than making them retry a payload we will never understand.
    return res.status(200).json({ received: true, handled: false });
  }

  // Record first: a duplicate delivery loses the race here and is skipped, so
  // a retried event cannot double-apply.
  const { error: insertError } = await supabaseAdmin.from('webhook_events').insert({
    event_id: eventId,
    provider: 'paymongo',
    event_type: eventType,
    payload: event,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      return res.status(200).json({ received: true, duplicate: true });
    }
    throw insertError;
  }

  try {
    const outcome = await applyWebhookEvent(eventType, resource);
    console.log(`[paymongo] ${eventType} ${eventId}: ${outcome}`);
  } catch (err) {
    // The event is stored, so this is recoverable by hand. Returning non-2xx
    // would make PayMongo retry an event we have already recorded, which the
    // idempotency guard above would then skip silently — worse than surfacing
    // the failure in the log.
    console.error(`[paymongo] failed to apply ${eventType} ${eventId}:`, err.message);
  }

  res.status(200).json({ received: true });
};
