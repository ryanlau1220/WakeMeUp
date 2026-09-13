import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { BuiltInAgent, CopilotRuntime } from '@copilotkit/runtime/v2';
import { createCopilotExpressHandler } from '@copilotkit/runtime/v2/express';
import { apiKey, chatWithAgent, generateWakePlan, isOpenRouter, MODEL } from './agent.js';
import { isCalendarEventPayload } from './wakePlan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '32kb' }));

if (isOpenRouter) process.env.OPENAI_BASE_URL ||= 'https://openrouter.ai/api/v1';
const copilotRuntime = new CopilotRuntime({
  agents: {
    default: new BuiltInAgent({
      model: isOpenRouter ? `openai:${MODEL}` : MODEL.replace('/', ':'),
      apiKey,
      prompt:
        'You are Wake Me Up. Use the provided plan context to help the user review or adjust it. ' +
        'Never schedule an alarm; Android schedules only an explicitly approved plan.',
      maxOutputTokens: 400,
    }),
  },
});
app.use(
  createCopilotExpressHandler({
    runtime: copilotRuntime,
    basePath: '/api/copilotkit',
    cors: false,
  }),
);

const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    agent: 'Wake Me Up Agent',
    openRouterConfigured:
      !!process.env.OPENROUTER_API_KEY ||
      (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-or-')),
    telegramConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
  });
});

// Endpoint to generate structured wake plan from calendar context
app.post('/api/plan/generate', async (req: Request, res: Response) => {
  const { events, preferences, history, feedback } = req.body;
  if (
    Array.isArray(events) &&
    events.length > 0 &&
    events.every(isCalendarEventPayload) &&
    events[0].startMillis <= Date.now() + 2 * 60_000
  ) {
    return res.status(422).json({
      error: 'This commitment is too soon to plan for. Choose a later event or use Test alarm.',
    });
  }
  try {
    console.log(`[Agent] Generating wake plan for ${events?.length || 0} events...`);
    const plan = await generateWakePlan({ events, preferences, history, feedback });
    console.log(
      '[Agent] Proposed plan:',
      plan.eventTitle,
      'at',
      new Date(plan.firstAlarmAt).toLocaleTimeString(),
    );
    res.json(plan);
  } catch (error: any) {
    console.error('[Agent Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Conversational adjustment endpoint
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { messages, context } = req.body;
    const reply = await chatWithAgent({ messages, context });
    res.json({ reply });
  } catch (error: any) {
    console.error('[Chat Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Telegram Escalation Endpoint
app.post('/api/telegram/escalate', async (req: Request, res: Response) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let chatId = process.env.TELEGRAM_CHAT_ID;
  const { planTitle, message } = req.body;

  if (
    (planTitle !== undefined && (typeof planTitle !== 'string' || planTitle.length > 200)) ||
    (message !== undefined && (typeof message !== 'string' || message.length > 500))
  ) {
    return res.status(400).json({ error: 'Escalation content is invalid.' });
  }

  if (!token) {
    return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not configured in .env' });
  }

  try {
    // If chatId not in env, attempt auto-resolution from getUpdates
    if (!chatId) {
      const updatesRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
      const data = (await updatesRes.json()) as any;
      if (data.ok && data.result?.length > 0) {
        chatId = data.result[data.result.length - 1]?.message?.chat?.id;
      }
    }

    if (!chatId) {
      return res
        .status(400)
        .json({ error: 'No chat ID found. Please send a message to @WakeMeUpBot first.' });
    }

    const text = `🚨 Wake Me Up Alert\n\nWake objective failed verification for commitment: ${planTitle || 'Early Commitment'}.\n\n${message || 'The user did not complete step verification after multiple alarm attempts.'}`;

    const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    const sendData = (await sendRes.json()) as any;
    res.json({ ok: sendData.ok, chatId, result: sendData.result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=========================================`);
  console.log(`  Wake Me Up Agent Server (TS) running on :${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/api/health`);
  console.log(`=========================================\n`);
});
