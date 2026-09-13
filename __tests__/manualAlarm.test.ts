import { createManualWakePlan } from '../src/manualAlarm';

test('schedules a passed manual time for tomorrow', () => {
  const plan = createManualWakePlan(7, 30, 'Gym', new Date(2026, 8, 13, 8, 0));

  expect(new Date(plan.firstAlarmAt)).toEqual(new Date(2026, 8, 14, 7, 30));
  expect(plan.wakeObjectiveAt - plan.firstAlarmAt).toBe(60_000);
  expect(plan.eventStart - plan.wakeObjectiveAt).toBe(60_000);
  expect(plan.gracePeriodSeconds).toBe(30);
  expect(plan.retryLimit).toBe(1);
});
