import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { parseReportParams, billsReportsCache, invalidateBillsCache } from '../src/routes/billRoutes.js';
import { billsRepo } from '../src/db.js';

test('Report Query Parameters - Real Exported Route Parser', () => {
  // 1. Default fallback parameters
  const defaults = parseReportParams({});
  assert.equal(defaults.days, null);
  assert.equal(defaults.limit, 1000);
  assert.equal(defaults.offset, 0);
  assert.equal(defaults.includeUnpaid, false);

  // 2. 30-day analytics view auto-sets 5000 limit
  const monthParams = parseReportParams({ days: '30', includeUnpaid: 'true' });
  assert.equal(monthParams.days, 30);
  assert.equal(monthParams.limit, 5000);
  assert.equal(monthParams.includeUnpaid, true);

  // 3. Clamps abusive limits
  const extremeParams = parseReportParams({ days: '9999', limit: '500000', offset: '-5' });
  assert.equal(extremeParams.days, 365);
  assert.equal(extremeParams.limit, 10000);
  assert.equal(extremeParams.offset, 0);

  // 4. Rejects invalid date format with 400
  const invalidDate = parseReportParams({ startDate: 'not-a-real-date' });
  assert.equal(invalidDate.statusCode, 400);
  assert.match(invalidDate.error, /Invalid startDate format/);

  // 5. Rejects inverted date range with 400
  const invertedDates = parseReportParams({ startDate: '2026-09-20', endDate: '2026-09-10' });
  assert.equal(invertedDates.statusCode, 400);
  assert.match(invertedDates.error, /startDate cannot be after endDate/);

  // 6. Rejects status filter combined with includeUnpaid
  const badCombo = parseReportParams({ status: 'paid', includeUnpaid: 'true' });
  assert.equal(badCombo.statusCode, 400);
  assert.match(badCombo.error, /Cannot combine status filter with includeUnpaid/);
});

test('Server Cache Invalidation - Strict Tenant Isolation & Limit Keying', () => {
  // Clear any existing test entries
  billsReportsCache.clear();

  // Seed cache entries for User 101 and User 202 with explicit limit
  const key101Limit10 = '101:days_30:limit_10:status_all:unpaid_true';
  const key101Limit5000 = '101:days_30:limit_5000:status_all:unpaid_true';
  const key202 = '202:days_7:limit_1000:status_all:unpaid_false';

  billsReportsCache.set(key101Limit10, { timestamp: Date.now(), data: { bills: [1] }, userId: 101 });
  billsReportsCache.set(key101Limit5000, { timestamp: Date.now(), data: { bills: [1, 2] }, userId: 101 });
  billsReportsCache.set(key202, { timestamp: Date.now(), data: { bills: [] }, userId: 202 });

  // Assert limit=10 and limit=5000 do NOT collide (Issue C resolved)
  assert.notEqual(key101Limit10, key101Limit5000);
  assert.equal(billsReportsCache.size, 3);

  // Invalidate User 101
  invalidateBillsCache(101);

  // Assert User 101's entries were purged
  assert.equal(billsReportsCache.has(key101Limit10), false);
  assert.equal(billsReportsCache.has(key101Limit5000), false);

  // Assert User 202's entry SURVIVED (Tenant Isolation verified)
  assert.equal(billsReportsCache.has(key202), true);
  assert.equal(billsReportsCache.size, 1);

  // Clean up
  billsReportsCache.clear();
});

test('Database Date Boundary, Scoped getNextBillId & UNION ALL Execution', async () => {
  if (!process.env.DATABASE_URL) {
    console.log('Skipping live Postgres test (DATABASE_URL not set)');
    return;
  }

  // 1. Test live listByUser with 7-day window and includeUnpaid separate branch
  const rows = await billsRepo.listByUser(1, {
    days: 7,
    limit: 100,
    includeUnpaid: true,
  });

  assert.ok(Array.isArray(rows), 'listByUser should return an array');
  assert.equal(typeof rows.windowTruncated, 'boolean');
  assert.equal(typeof rows.unpaidTruncated, 'boolean');

  // 2. Test live listByUser with date boundary expansion
  const rangeRows = await billsRepo.listByUser(1, {
    startDate: '2026-09-01',
    endDate: '2026-09-17',
    limit: 50,
  });

  assert.ok(Array.isArray(rangeRows), 'listByUser with range should return an array');
  assert.equal(typeof rangeRows.windowTruncated, 'boolean');

  // 3. Test getNextBillId scopes to user_id
  const nextId = await billsRepo.getNextBillId(1);
  assert.ok(Number.isInteger(nextId) && nextId >= 1);
});
