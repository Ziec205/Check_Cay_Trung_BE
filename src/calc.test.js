import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, splitValue, leftoverAmount } from './calc.js';

test('splitValue tách kg nguyên và phần dư', () => {
  assert.deepEqual(splitValue(201), { kg: 20, remTenths: 1 });
  assert.deepEqual(splitValue(193), { kg: 19, remTenths: 3 });
});

test('summarize gom theo loại kg và cộng dư', () => {
  const s = summarize([201, 193, 206, 200]);
  assert.equal(s.count, 4);
  assert.deepEqual(s.byKg, { 19: 1, 20: 3 });
  assert.equal(s.wholeKg, 79);
  assert.equal(s.remKg, 1.0);
  assert.equal(s.totalKg, 80);
});

test('leftoverAmount tính tiền phần dư theo giá mỗi kg', () => {
  assert.equal(leftoverAmount(0.1, 30000), 3000);
  assert.equal(leftoverAmount(1.3, 25000), 32500);
  assert.equal(leftoverAmount(0.7, 0), 0);
  assert.equal(leftoverAmount(0.3, null), 0);
});
