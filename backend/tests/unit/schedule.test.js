import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertOrderTime, isOpenAt, nextOpenSlot } from '../../src/utils/schedule.js';

const branch = { name: 'Imus', opens_at: '08:00', closes_at: '21:00' };
const allDay = { name: 'Always', opens_at: null, closes_at: null };
// Manila 2026-10-10 10:07 (UTC 02:07)
const NOW = new Date('2026-10-10T02:07:00Z');
const at = (manila) => new Date(`${manila}+08:00`).toISOString();
const status = (fn) => {
  try {
    fn();
    return 'ok';
  } catch (err) {
    return err.status;
  }
};

describe('order times', () => {
  it('knows Manila opening hours', () => {
    assert.equal(isOpenAt(branch, new Date(at('2026-10-10T07:59:00'))), false);
    assert.equal(isOpenAt(branch, new Date(at('2026-10-10T08:00:00'))), true);
    assert.equal(isOpenAt(branch, new Date(at('2026-10-10T20:59:00'))), true);
    assert.equal(isOpenAt(branch, new Date(at('2026-10-10T21:00:00'))), false);
    assert.equal(isOpenAt(allDay, new Date(at('2026-10-10T03:00:00'))), true);
  });

  it('takes ASAP orders only while open', () => {
    assert.equal(status(() => assertOrderTime(branch, null, NOW)), 'ok');
    assert.equal(status(() => assertOrderTime(branch, null, new Date(at('2026-10-10T22:00:00')))), 409);
    assert.equal(status(() => assertOrderTime(allDay, null, new Date(at('2026-10-10T03:00:00')))), 'ok');
  });

  it('takes a 15-minute slot at least 30 minutes ahead, inside opening hours', () => {
    assert.equal(status(() => assertOrderTime(branch, at('2026-10-10T10:45:00'), NOW)), 'ok');
    assert.equal(status(() => assertOrderTime(branch, at('2026-10-10T10:30:00'), NOW)), 400, 'only 23 minutes ahead');
    assert.equal(status(() => assertOrderTime(branch, at('2026-10-10T10:50:00'), NOW)), 400, 'not on a quarter hour');
    assert.equal(status(() => assertOrderTime(branch, at('2026-10-10T21:00:00'), NOW)), 400, 'at closing time');
    assert.equal(status(() => assertOrderTime(branch, at('2026-10-11T07:45:00'), NOW)), 400, 'before opening');
  });

  it('looks at most two days ahead', () => {
    assert.equal(status(() => assertOrderTime(branch, at('2026-10-12T20:45:00'), NOW)), 'ok');
    assert.equal(status(() => assertOrderTime(branch, at('2026-10-13T08:00:00'), NOW)), 400);
  });

  it('finds the next slot the branch is open', () => {
    assert.equal(nextOpenSlot(branch, NOW), at('2026-10-10T10:45:00'));
    assert.equal(nextOpenSlot(branch, new Date(at('2026-10-10T22:10:00'))), at('2026-10-11T08:00:00'));
  });
});
