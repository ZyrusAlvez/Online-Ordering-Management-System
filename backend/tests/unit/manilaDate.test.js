import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, daysInRange, isRealDate, manilaBounds, manilaToday } from '../../src/utils/manilaDate.js';
import { MAX_REPORT_DAYS, salesQuery } from '../../src/validators/admin.validators.js';

describe('manilaToday', () => {
  it('uses the Manila calendar day, not the machine’s', () => {
    // 10pm in UTC on the 14th is already 6am on the 15th in Manila.
    assert.equal(manilaToday(new Date('2026-10-14T22:00:00Z')), '2026-10-15');
    assert.equal(manilaToday(new Date('2026-10-14T15:59:59Z')), '2026-10-14');
    assert.equal(manilaToday(new Date('2026-10-14T16:00:00Z')), '2026-10-15');
  });
});

describe('date helpers', () => {
  it('accepts only real calendar dates', () => {
    for (const ok of ['2026-02-28', '2024-02-29', '2001-03-15']) assert.equal(isRealDate(ok), true, ok);
    for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-1-1', '', 'tomorrow']) {
      assert.equal(isRealDate(bad), false, bad);
    }
  });

  it('adds days across month and year ends, and leap days', () => {
    assert.equal(addDays('2026-02-28', 1), '2026-03-01');
    assert.equal(addDays('2024-02-28', 1), '2024-02-29');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
    assert.equal(addDays('2026-10-04', -6), '2026-09-28');
  });

  it('counts days inclusively', () => {
    assert.equal(daysInRange('2026-10-04', '2026-10-04'), 1);
    assert.equal(daysInRange('2026-10-01', '2026-10-07'), 7);
    assert.equal(daysInRange('2026-01-01', '2026-12-31'), 365);
  });

  it('turns days into Manila instants, ending at the start of the day after', () => {
    assert.deepEqual(manilaBounds('2026-10-04', '2026-10-06'), {
      start: '2026-10-04T00:00:00+08:00',
      end: '2026-10-07T00:00:00+08:00',
    });
    // 00:00 Manila is 16:00 UTC the day before.
    assert.equal(new Date(manilaBounds('2026-10-04', '2026-10-04').start).toISOString(), '2026-10-03T16:00:00.000Z');
  });
});

describe('salesQuery', () => {
  const parse = (q) => salesQuery.safeParse(q);

  it('defaults to the last 7 days ending today', () => {
    const { data } = parse({});
    assert.equal(data.to, manilaToday());
    assert.equal(daysInRange(data.from, data.to), 7);
  });

  it('runs through today when only "from" is given', () => {
    assert.equal(parse({ from: '2026-01-01' }).data.to, manilaToday());
  });

  it('accepts a single day and a full year', () => {
    assert.equal(parse({ from: '2026-10-04', to: '2026-10-04' }).success, true);
    assert.equal(parse({ from: '2026-01-01', to: '2026-12-31' }).success, true);
  });

  it('rejects a reversed range, a range over a year, and bad dates', () => {
    assert.equal(parse({ from: '2026-10-05', to: '2026-10-04' }).success, false);
    assert.equal(parse({ from: '2025-01-01', to: '2026-12-31' }).success, false);
    assert.equal(daysInRange('2025-01-01', '2026-01-01'), MAX_REPORT_DAYS);
    assert.equal(parse({ from: '2025-01-01', to: '2026-01-01' }).success, true, `${MAX_REPORT_DAYS} days is allowed`);
    assert.equal(parse({ from: '2026-02-30' }).success, false);
    assert.equal(parse({ from: '04/10/2026' }).success, false);
    assert.equal(parse({ to: 'yesterday' }).success, false);
  });
});
