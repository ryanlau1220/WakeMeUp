import type { WakePlan } from './native/WakeMeUpBridge';

export function createManualWakePlan(
  hour: number,
  minute: number,
  label: string,
  now = new Date(),
): WakePlan {
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error('Choose a valid time.');
  }

  const firstAlarm = new Date(now);
  firstAlarm.setHours(hour, minute, 0, 0);
  if (firstAlarm.getTime() <= now.getTime() + 30_000) firstAlarm.setDate(firstAlarm.getDate() + 1);

  const firstAlarmAt = firstAlarm.getTime();
  return {
    id: `manual-${firstAlarmAt}-${Math.random().toString(36).slice(2, 8)}`,
    eventTitle: label.trim() || 'Alarm',
    eventStart: firstAlarmAt + 2 * 60_000,
    wakeObjectiveAt: firstAlarmAt + 60_000,
    firstAlarmAt,
    requiredSteps: 15,
    gracePeriodSeconds: 180,
    retryLimit: 2,
  };
}
