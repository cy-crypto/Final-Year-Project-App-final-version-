const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateGoalTarget, validateSleepInterval, sleepMinutes, formatSleepDuration, changeSleepDateTime, hasSleepOverlap } = require('../services/fitnessCalculations.ts');
const { toCanonicalMeasurements, fromCanonicalMeasurement, validateFitnessMeasurements, localFitnessDate } = require('../services/fitnessCalculations.ts');

test('goal targets are positive, finite, bounded, and integral for counts', () => {
  for (const value of ['', '0', '-1', 'Infinity', 'NaN', '1e3', '12.123', '10000000000']) assert.ok(validateGoalTarget('calories', value));
  assert.ok(validateGoalTarget('steps', '1.5'));
  assert.ok(validateGoalTarget('workout_frequency', '2.2'));
  assert.equal(validateGoalTarget('steps', '8000'), null);
  assert.equal(validateGoalTarget('calories', '200.25'), null);
});

test('overnight and timezone offsets use elapsed time', () => {
  const bed = new Date('2026-10-25T23:00:00+05:00');
  const wake = new Date('2026-10-26T07:00:00+05:00');
  assert.equal(validateSleepInterval(bed, wake, new Date('2026-10-27T00:00:00Z')), null);
  assert.equal(sleepMinutes(bed, wake), 480);
  assert.equal(formatSleepDuration(480), '8h 0m');
  assert.equal(formatSleepDuration(null), 'No data');
  assert.equal(formatSleepDuration(0), '0h 0m');
});

test('DST spring and repeated fall-back hour measure real elapsed time', () => {
  assert.equal(sleepMinutes(new Date('2026-03-08T01:30:00-05:00'), new Date('2026-03-08T03:30:00-04:00')), 60);
  assert.equal(sleepMinutes(new Date('2025-11-02T01:30:00-04:00'), new Date('2025-11-02T01:30:00-05:00')), 60);
});

test('invalid, missing, reversed and future intervals are rejected', () => {
  const now = new Date('2026-10-27T00:00:00Z');
  assert.ok(validateSleepInterval(null, now, now));
  assert.ok(validateSleepInterval(new Date('bad'), now, now));
  assert.ok(validateSleepInterval(now, now, now));
  assert.ok(validateSleepInterval(now, new Date(now.getTime() - 1000), now));
  assert.ok(validateSleepInterval(now, new Date(now.getTime() + 1000), now));
});

test('date/time picker changes preserve the other part and do not mutate input', () => {
  const current = new Date(2026, 9, 26, 23, 10);
  const changed = changeSleepDateTime(current, new Date(2026, 9, 27, 7, 30), 'date');
  assert.equal(changed.getDate(), 27); assert.equal(changed.getHours(), 23);
  const time = changeSleepDateTime(changed, new Date(2026, 9, 28, 7, 30), 'time');
  assert.equal(time.getDate(), 27); assert.equal(time.getHours(), 7); assert.equal(time.getMinutes(), 30);
  assert.equal(current.getDate(), 26);
});

test('overlaps exclude edited session and allow adjacent intervals', () => {
  const rows = [{ id: 'one', bedtime: '2026-10-25T23:00:00Z', wake_time: '2026-10-26T07:00:00Z' }];
  assert.equal(hasSleepOverlap(rows, new Date(rows[0].bedtime), new Date(rows[0].wake_time), null), true);
  assert.equal(hasSleepOverlap(rows, new Date(rows[0].bedtime), new Date(rows[0].wake_time), 'one'), false);
  assert.equal(hasSleepOverlap(rows, new Date('2026-10-26T07:00:00Z'), new Date('2026-10-26T08:00:00Z'), null), false);
});

test('fitness measurements convert lb/in to canonical kg/cm and round trip', () => {
  assert.deepEqual(toCanonicalMeasurements(154.3235835294143, 66.92913385826772, 'imperial'), { weightKg: 70, heightCm: 170 });
  assert.deepEqual(toCanonicalMeasurements(70.55, 175.5, 'metric'), { weightKg: 70.55, heightCm: 175.5 });
  const weight = fromCanonicalMeasurement(70.55, 'weight', 'imperial');
  const height = fromCanonicalMeasurement(175.5, 'height', 'imperial');
  assert.deepEqual(toCanonicalMeasurements(Number(weight), Number(height), 'imperial'), { weightKg: 70.55, heightCm: 175.5 });
});

test('profile validation permits incomplete profiles and enforces adult ranges', () => {
  assert.equal(validateFitnessMeasurements('', '', '', 'metric'), null);
  assert.equal(validateFitnessMeasurements('70.55', '175.5', '25', 'metric'), null);
  assert.equal(validateFitnessMeasurements('154.32', '66.93', '25', 'imperial'), null);
  for (const values of [['24', '170', '25'], ['351', '170', '25'], ['70', '99', '25'], ['70', '251', '25'], ['70', '170', '25.5'], ['70', '170', '17'], ['NaN', '170', '25'], ['Infinity', '170', '25']]) {
    assert.ok(validateFitnessMeasurements(...values, 'metric'), values.join(','));
  }
});

test('fitness snapshot day uses local date rather than UTC ISO date', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Asia/Karachi';
  try { assert.equal(localFitnessDate(new Date('2026-10-26T20:00:00Z')), '2026-10-27'); }
  finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
