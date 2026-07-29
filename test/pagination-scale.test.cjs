const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const profileSource = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'profile-pagination.mjs'),
  'utf8'
);
const fixtureSource = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'pagination-profile.ts'),
  'utf8'
);

test('PDF scale profiling covers the 50/100/200/300 page baselines', () => {
  assert.match(profileSource, /\[50, 100, 200, 300\]/);
  assert.match(profileSource, /representative-240-pages/);
  assert.match(profileSource, /representativeScenario\(240\)/);
  assert.match(profileSource, /scaleScenario\(pageTarget\)/);
  assert.match(profileSource, /SCALE_SENTINEL_PAGE_/);
  assert.match(fixtureSource, /pagesCompleted/);
  assert.match(fixtureSource, /heapUsedBytes/);
  assert.match(fixtureSource, /heapGrowthBytes/);
  assert.match(fixtureSource, /lastPageContainsSentinel/);
  assert.match(fixtureSource, /IsolatedPaginationHost/);
  assert.match(fixtureSource, /headerImageRendered/);
  assert.match(fixtureSource, /all-margin-boxes/);
  assert.match(fixtureSource, /populatedMargins/);
  assert.match(fixtureSource, /blankPageCount/);
  assert.match(fixtureSource, /orphanedFrames/);
  assert.match(fixtureSource, /runCancellation/);
  assert.match(fixtureSource, /cancelledDuringPagination/);
  assert.match(fixtureSource, /timings:/);
  assert.match(fixtureSource, /lastPageText/);
  assert.match(fixtureSource, /timeoutPhase/);
  assert.match(fixtureSource, /passed:/);
  assert.match(fixtureSource, /timeoutPhase:/);
  assert.match(profileSource, /process\.exitCode = 1/);
  assert.match(profileSource, /phase: 'browser-evaluation'/);
  assert.match(profileSource, /evaluationTimeoutMs/);
  assert.match(profileSource, /cancellation: profile\.cancellation/);
});
