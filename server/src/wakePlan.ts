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

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export function isCalendarEventPayload(value: unknown): value is CalendarEventPayload {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return (
    typeof event.id === 'string' &&
    typeof event.title === 'string' &&
    isFiniteInteger(event.startMillis) &&
    isFiniteInteger(event.endMillis) &&
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
