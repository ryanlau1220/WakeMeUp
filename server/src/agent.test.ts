import assert from 'node:assert/strict';
import test from 'node:test';
import { createSafeWakePlan, validateWakePlan } from './wakePlan.js';

const event = {
  id: 'class-1',
  title: 'Software Engineering',
  startMillis: 1_800_000_000_000,
  endMillis: 1_800_003_600_000,
  isAllDay: false,
};

test('rejects an alarm that is not before its commitment', () => {
  assert.throws(() =>
    validateWakePlan(
      {
        eventId: event.id,
        eventStart: event.startMillis,
        wakeObjectiveAt: event.startMillis + 1,
        firstAlarmAt: event.startMillis - 1,
        requiredSteps: 15,
        gracePeriodSeconds: 180,
        retryLimit: 2,
        reasoningSummary: ['Commute'],
      },
      [event],
      event.startMillis - 10_000,
    ),
  )
})

test('creates a scheduleable fallback plan', () => {
  const plan = createSafeWakePlan(event)
  assert.deepEqual(validateWakePlan(plan, [event], plan.firstAlarmAt - 1), plan)
})

test('uses an immediate recovery alarm when preparation time has already elapsed', () => {
  const now = 1_700_000_000_000
  const soonEvent = { ...event, startMillis: now + 10 * 60_000, endMillis: now + 70 * 60_000 }
  const plan = createSafeWakePlan(soonEvent, {}, now)

  assert.equal(plan.firstAlarmAt, now + 60_000)
  assert.deepEqual(validateWakePlan(plan, [soonEvent], now), plan)
})
