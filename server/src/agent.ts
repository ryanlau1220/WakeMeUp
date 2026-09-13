import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import {
  isCalendarEventPayload,
  type CalendarEventPayload,
  type WakePlanResult,
  validateWakePlan,
} from './wakePlan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isOpenRouter =
  !!process.env.OPENROUTER_API_KEY ||
  (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-or-'));
const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey,
  baseURL: isOpenRouter ? 'https://openrouter.ai/api/v1' : undefined,
  defaultHeaders: isOpenRouter
    ? {
        'HTTP-Referer': 'https://github.com/WakeMeUp',
        'X-Title': 'WakeMeUp',
      }
    : undefined,
});

const MODEL = process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'openai/gpt-4o-mini';

export interface WakePreferences {
  prepMinutes?: number;
  travelMinutes?: number;
  safetyMargin?: number;
}

export async function generateWakePlan({
  events,
  preferences,
  history,
}: {
  events: CalendarEventPayload[];
  preferences?: WakePreferences;
  history?: any[];
}): Promise<WakePlanResult> {
  if (!Array.isArray(events) || events.length === 0 || !events.every(isCalendarEventPayload)) {
    throw new Error('Select an upcoming commitment before generating a wake plan.')
  }
  const systemPrompt = `You are Wake Me Up, an intelligent morning scheduling agent.
Your mission:
Analyze the user's upcoming calendar commitments and determine the optimal wake plan.
Philosophy: "AI for judgment. Deterministic systems for reliability."

Guidelines:
1. Focus on the earliest commitment tomorrow morning that requires the user to wake up.
2. Deduce appropriate wake objective time by factoring in:
   - Preparation time (default ~20-30 min if unspecified)
   - Travel/commute time (default ~25-35 min for in-person events; 5 min for online)
   - Safety buffer (10-15 min)
3. Set 'firstAlarmAt' 5 to 10 minutes BEFORE 'wakeObjectiveAt' to allow gentle arousal.
4. Set 'requiredSteps' to 15 (physical movement evidence to prevent sleeping again).
5. Provide a 3-point concise bulleted reasoning summary.

Return ONLY a valid JSON object matching this schema:
{
  "eventId": string,
  "eventTitle": string,
  "eventStart": number (epoch milliseconds),
  "wakeObjectiveAt": number (epoch milliseconds),
  "firstAlarmAt": number (epoch milliseconds),
  "requiredSteps": number,
  "gracePeriodSeconds": number,
  "retryLimit": number,
  "reasoningSummary": string[]
}`;

  const userContent = JSON.stringify({
    currentTime: new Date().toISOString(),
    currentTimeMillis: Date.now(),
    upcomingEvents: events,
    userPreferences: preferences || { prepMinutes: 25, travelMinutes: 30, safetyMargin: 10 },
    recentWakeHistory: history || [],
  });

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Here is my schedule context: ${userContent}. Propose the best wake plan.`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response content received from agent model');
  }
  return validateWakePlan(JSON.parse(content), events);
}

export async function chatWithAgent({
  messages,
  context,
}: {
  messages: any[];
  context?: any;
}): Promise<string> {
  const systemPrompt = `You are Wake Me Up, the mobile scheduling agent.
You assist the user in reviewing, adjusting, or answering questions about their Wake Plan.
Be direct, helpful, and concise.
Current schedule context: ${JSON.stringify(context || {})}`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
  });

  return response.choices[0]?.message?.content || '';
}
