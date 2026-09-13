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
  assert.ok(plan.firstAlarmAt < plan.wakeObjectiveAt)
  assert.ok(plan.wakeObjectiveAt < plan.eventStart)
})
