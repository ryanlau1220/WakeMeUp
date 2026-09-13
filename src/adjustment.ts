export function requestedAlarmTime(feedback: string, eventStartMillis: number): number | undefined {
  const match = feedback.match(/\b(?:to|at)\s+(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (!match) return undefined;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour < 1 || hour > 12) return undefined;
  if (/p/i.test(match[3]) && hour !== 12) hour += 12;
  if (/a/i.test(match[3]) && hour === 12) hour = 0;

  const requested = new Date(eventStartMillis);
  requested.setHours(hour, minute, 0, 0);
  return requested.getTime();
}
