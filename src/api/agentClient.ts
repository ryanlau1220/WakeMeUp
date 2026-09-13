import type { CalendarEvent, WakeHistoryItem, WakePlan } from '../native/WakeMeUpBridge';

const SERVER_BASE_URL = 'http://localhost:3000';

export async function requestAgentWakePlan(
  events: CalendarEvent[],
  preferences = { prepMinutes: 25, travelMinutes: 30, safetyMargin: 10 },
  history: WakeHistoryItem[] = [],
  feedback?: string,
): Promise<WakePlan> {
  const response = await fetch(`${SERVER_BASE_URL}/api/plan/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events, preferences, history, feedback }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Agent request failed: ${errorText}`);
  }

  const plan = await response.json();
  return {
    ...plan,
    id: `draft-${Date.now()}`,
    calendarEventId: plan.eventId,
  };
}

export async function sendTelegramEscalation(planTitle: string, message: string) {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/telegram/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planTitle, message }),
    });
    return await res.json();
  } catch (err: any) {
    console.warn('Telegram alert failed:', err);
    return { ok: false, error: err?.message || String(err) };
  }
}
