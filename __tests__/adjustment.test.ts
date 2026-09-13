import { requestedAlarmTime } from '../src/adjustment';

test('extracts an explicit AM alarm time on the event day', () => {
  const event = new Date(2026, 8, 14, 8, 30).getTime();
  const requested = requestedAlarmTime('Change the time to 6am', event);

  expect(new Date(requested ?? 0).getHours()).toBe(6);
  expect(new Date(requested ?? 0).getMinutes()).toBe(0);
});
