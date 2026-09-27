import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toCentavos, toPesos } from '../../src/services/order.service.js';

/**
 * Order totals are summed in integer centavos precisely because repeated
 * float arithmetic on peso amounts drifts. These tests pin that behaviour.
 */
describe('toCentavos', () => {
  it('converts whole pesos', () => {
    assert.equal(toCentavos(130), 13000);
  });

  it('converts amounts with centavos', () => {
    assert.equal(toCentavos(144.5), 14450);
    assert.equal(toCentavos(0.01), 1);
  });

  it('accepts the numeric strings Postgres returns for numeric columns', () => {
    assert.equal(toCentavos('130.00'), 13000);
    assert.equal(toCentavos('144.50'), 14450);
  });

  it('rounds rather than truncating a float representation error', () => {
    // 1.005 is actually 1.00499999... in IEEE-754.
    assert.equal(toCentavos(19.99), 1999);
    assert.equal(toCentavos(0.1 + 0.2), 30);
  });

  it('handles zero', () => {
    assert.equal(toCentavos(0), 0);
  });
});

describe('toPesos', () => {
  it('converts back', () => {
    assert.equal(toPesos(13000), 130);
    assert.equal(toPesos(14450), 144.5);
  });

  it('returns a number, not a string', () => {
    assert.equal(typeof toPesos(13000), 'number');
  });
});

describe('round-tripping', () => {
  it('is lossless for realistic menu prices', () => {
    for (const amount of [15, 45, 70, 90, 130, 144.5, 280, 350, 1050]) {
      assert.equal(toPesos(toCentavos(amount)), amount, `failed for ${amount}`);
    }
  });

  it('does not drift when summing many lines, unlike float addition', () => {
    // 0.1 + 0.2 + ... in floats famously does not equal the exact decimal sum.
    const unit = 0.1;
    const qty = 3;
    const totalCentavos = toCentavos(unit) * qty;

    assert.equal(toPesos(totalCentavos), 0.3);
    assert.notEqual(unit * qty, 0.3); // the bug this representation avoids
  });

  it('sums a realistic multi-line order exactly', () => {
    const lines = [
      { price: 280, qty: 2 },
      { price: 100, qty: 3 },
      { price: 144.5, qty: 1 },
    ];
    const total = lines.reduce((sum, l) => sum + toCentavos(l.price) * l.qty, 0);
    assert.equal(toPesos(total), 1004.5);
  });
});
