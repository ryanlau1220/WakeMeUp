import type { CalendarEvent, WakeHistoryItem, WakePlan } from '../native/WakeMeUpBridge';
import { Bridge } from '../native/WakeMeUpBridge';

let serverBaseUrl: string | null = null;

async function getServerBaseUrl(): Promise<string> {
  if (serverBaseUrl) return serverBaseUrl;
  const configuredUrl = (await Bridge.getAgentServerUrl()).replace(/\/+$/, '');
  const url = new URL(configuredUrl);
  if (!['http:', 'https:'].includes(url.protocol) || (!__DEV__ && url.protocol !== 'https:')) {
    throw new Error('Wake Me Up server URL must use HTTPS outside development builds.');
  }
  serverBaseUrl = configuredUrl;
  return serverBaseUrl;
}

export async function requestAgentWakePlan(
  events: CalendarEvent[],
  preferences = { prepMinutes: 25, travelMinutes: 30, safetyMargin: 10 },
  history: WakeHistoryItem[] = [],
  feedback?: string,
): Promise<WakePlan> {
  const response = await fetch(`${await getServerBaseUrl()}/api/plan/generate`, {
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
    const res = await fetch(`${await getServerBaseUrl()}/api/telegram/escalate`, {
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
