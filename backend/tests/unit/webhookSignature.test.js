import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { verifyWebhookSignature } from '../../src/services/payment.service.js';

/**
 * Signature verification is the only thing standing between the internet and
 * "mark this order paid", so it gets exercised hard.
 *
 * The secret must match what the process was started with; run-tests.mjs sets
 * PAYMONGO_WEBHOOK_SECRET for both the server and the runner.
 */
const SECRET = process.env.PAYMONGO_WEBHOOK_SECRET ?? 'whsk_testsecret123';

const sign = (body, { secret = SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) => {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `t=${timestamp},te=${sig},li=${sig}`;
};

const BODY = JSON.stringify({ data: { id: 'evt_1', attributes: { type: 'payment.paid' } } });

describe('verifyWebhookSignature', () => {
  it('accepts a correctly signed payload', () => {
    assert.equal(verifyWebhookSignature(BODY, sign(BODY)), true);
  });

  it('rejects a payload signed with the wrong secret', () => {
    assert.throws(() => verifyWebhookSignature(BODY, sign(BODY, { secret: 'whsk_wrong' })), {
      status: 401,
    });
  });

  it('rejects a body altered after signing', () => {
    const header = sign(BODY);
    const tampered = BODY.replace('payment.paid', 'payment.failed');
    assert.throws(() => verifyWebhookSignature(tampered, header), { status: 401 });
  });

  it('rejects an absent signature header', () => {
    assert.throws(() => verifyWebhookSignature(BODY, undefined), { status: 401 });
    assert.throws(() => verifyWebhookSignature(BODY, ''), { status: 401 });
  });

  it('rejects a malformed header', () => {
    for (const header of ['garbage', 't=123', 'te=abc', 't=,te=']) {
      assert.throws(() => verifyWebhookSignature(BODY, header), { status: 401 }, header);
    }
  });

  it('rejects a replayed payload whose timestamp has aged out', () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    assert.throws(() => verifyWebhookSignature(BODY, sign(BODY, { timestamp: old })), {
      status: 401,
    });
  });

  it('rejects a timestamp from the future beyond tolerance', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    assert.throws(() => verifyWebhookSignature(BODY, sign(BODY, { timestamp: future })), {
      status: 401,
    });
  });

  it('accepts a timestamp inside the tolerance window', () => {
    const recent = Math.floor(Date.now() / 1000) - 120;
    assert.equal(verifyWebhookSignature(BODY, sign(BODY, { timestamp: recent })), true);
  });

  it('honours a caller-supplied tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    assert.throws(() => verifyWebhookSignature(BODY, sign(BODY, { timestamp: old })));
    assert.equal(
      verifyWebhookSignature(BODY, sign(BODY, { timestamp: old }), { toleranceSeconds: 1200 }),
      true,
    );
  });

  it('rejects a non-numeric timestamp instead of treating it as fresh', () => {
    const sig = createHmac('sha256', SECRET).update(`abc.${BODY}`, 'utf8').digest('hex');
    assert.throws(() => verifyWebhookSignature(BODY, `t=abc,te=${sig},li=${sig}`), { status: 401 });
  });

  it('rejects a signature of the right shape but wrong value', () => {
    const wrong = 'a'.repeat(64);
    const t = Math.floor(Date.now() / 1000);
    assert.throws(() => verifyWebhookSignature(BODY, `t=${t},te=${wrong},li=${wrong}`), {
      status: 401,
    });
  });

  it('is sensitive to whitespace, since the signature covers exact bytes', () => {
    const header = sign(BODY);
    assert.throws(() => verifyWebhookSignature(` ${BODY}`, header), { status: 401 });
  });
});
