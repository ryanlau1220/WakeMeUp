export interface CalendarEventPayload {
  id: string;
  title: string;
  startMillis: number;
  endMillis: number;
  isAllDay: boolean;
  location?: string;
  description?: string;
}

export interface WakePlanResult {
  eventId: string;
  eventTitle: string;
  eventStart: number;
  wakeObjectiveAt: number;
  firstAlarmAt: number;
  requiredSteps: number;
  gracePeriodSeconds: number;
  retryLimit: number;
  reasoningSummary: string[];
}

export interface WakePreferences {
  prepMinutes?: number;
  travelMinutes?: number;
  safetyMargin?: number;
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function isShortText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= maxLength
}

export function isCalendarEventPayload(value: unknown): value is CalendarEventPayload {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return (
    isShortText(event.id, 200) &&
    isShortText(event.title, 200) &&
    isFiniteInteger(event.startMillis) &&
    isFiniteInteger(event.endMillis) &&
    event.startMillis < event.endMillis &&
    typeof event.isAllDay === 'boolean'
  )
}

export function validateWakePlan(
  value: unknown,
  events: CalendarEventPayload[],
  now = Date.now(),
): WakePlanResult {
  if (!value || typeof value !== 'object') {
    throw new Error('Agent returned an invalid wake plan.')
  }
  const plan = value as Record<string, unknown>
  const event = events.find((candidate) => candidate.id === plan.eventId)
  const validTiming =
    isFiniteInteger(plan.eventStart) &&
    isFiniteInteger(plan.wakeObjectiveAt) &&
    isFiniteInteger(plan.firstAlarmAt) &&
    plan.eventStart === event?.startMillis &&
    now < plan.firstAlarmAt &&
    plan.firstAlarmAt < plan.wakeObjectiveAt &&
    plan.wakeObjectiveAt < plan.eventStart
  const validSettings =
    isFiniteInteger(plan.requiredSteps) && plan.requiredSteps >= 1 && plan.requiredSteps <= 100 &&
    isFiniteInteger(plan.gracePeriodSeconds) &&
    plan.gracePeriodSeconds >= 30 &&
    plan.gracePeriodSeconds <= 600 &&
    isFiniteInteger(plan.retryLimit) && plan.retryLimit >= 1 && plan.retryLimit <= 3
  const validReasoning =
    Array.isArray(plan.reasoningSummary) &&
    plan.reasoningSummary.length >= 1 &&
    plan.reasoningSummary.length <= 3 &&
    plan.reasoningSummary.every(
      (reason) => typeof reason === 'string' && reason.length >= 1 && reason.length <= 160,
    )

  if (!event || !validTiming || !validSettings || !validReasoning) {
    throw new Error('Agent returned an unsafe wake plan. Please generate it again.')
  }

  return {
    eventId: event.id,
    eventTitle: event.title,
    eventStart: event.startMillis,
    wakeObjectiveAt: plan.wakeObjectiveAt as number,
    firstAlarmAt: plan.firstAlarmAt as number,
    requiredSteps: plan.requiredSteps as number,
    gracePeriodSeconds: plan.gracePeriodSeconds as number,
    retryLimit: plan.retryLimit as number,
    reasoningSummary: plan.reasoningSummary as string[],
  }
}

export function createSafeWakePlan(
  event: CalendarEventPayload,
  preferences: WakePreferences = {},
  now = Date.now(),
): WakePlanResult {
  const minutes = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 180
      ? value
      : fallback
  const prepMinutes = minutes(preferences.prepMinutes, 25)
  const travelMinutes = minutes(preferences.travelMinutes, 30)
  const safetyMargin = minutes(preferences.safetyMargin, 10)
  const preferredWakeObjectiveAt =
    event.startMillis - (prepMinutes + travelMinutes + safetyMargin) * 60_000
  const preferredFirstAlarmAt = preferredWakeObjectiveAt - 5 * 60_000
  const earliestFirstAlarmAt = now + 60_000
  const needsImmediateRecovery = preferredFirstAlarmAt <= now
  const firstAlarmAt = needsImmediateRecovery ? earliestFirstAlarmAt : preferredFirstAlarmAt
  const wakeObjectiveAt = needsImmediateRecovery
    ? Math.min(event.startMillis - 60_000, firstAlarmAt + 60_000)
    : preferredWakeObjectiveAt

  if (firstAlarmAt >= wakeObjectiveAt) {
    throw new Error('This commitment starts too soon to schedule a safe wake plan.')
  }

  return {
    eventId: event.id,
    eventTitle: event.title,
    eventStart: event.startMillis,
    wakeObjectiveAt,
    firstAlarmAt,
    requiredSteps: 15,
    gracePeriodSeconds: 180,
    retryLimit: 2,
    reasoningSummary: [
      needsImmediateRecovery
        ? 'The commitment is close, so the alarm starts immediately'
        : `Standard ${travelMinutes}-minute travel allowance`,
      needsImmediateRecovery
        ? 'Preparation and travel time must be shortened for this commitment'
        : `${prepMinutes} minutes to prepare plus ${safetyMargin} minutes of margin`,
      'Used safe timing because the agent response could not be scheduled',
    ],
  }
}

export function applyRequestedFirstAlarm(
  plan: WakePlanResult,
  requestedFirstAlarmAt: number,
  now = Date.now(),
): WakePlanResult {
  if (
    !Number.isSafeInteger(requestedFirstAlarmAt) ||
    requestedFirstAlarmAt <= now + 60_000 ||
    requestedFirstAlarmAt >= plan.eventStart ||
    plan.eventStart - requestedFirstAlarmAt > 24 * 60 * 60_000
  ) {
    throw new Error('The requested alarm time must be a future time before this commitment.')
  }

  return {
    ...plan,
    firstAlarmAt: requestedFirstAlarmAt,
    wakeObjectiveAt: Math.min(requestedFirstAlarmAt + 5 * 60_000, plan.eventStart - 1),
    reasoningSummary: ['Used the requested alarm time', ...plan.reasoningSummary].slice(0, 3),
  }
}
