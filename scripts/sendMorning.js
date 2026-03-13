/**
 * One-shot scheduled wisdom message for Railway Cron. Run on schedule (e.g. 0 5 * * * = 08:00 MSK).
 * Requires: BOT_TOKEN, MORNING_GROUP_CHAT_ID, OPENAI_API_KEY; data/persona.json; optional volume for data/morning_state.json.
 */
import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { sendMorningMessage } from '../src/bot/morningMessage.js';

console.log('sendMorning: started');
const token = process.env.BOT_TOKEN?.trim();
const chatId = process.env.MORNING_GROUP_CHAT_ID?.trim();
if (!token || !chatId) {
  console.error('BOT_TOKEN and MORNING_GROUP_CHAT_ID are required');
  process.exit(1);
}

const bot = new Telegraf(token);
try {
  await sendMorningMessage(bot.telegram);
} catch (err) {
  console.error('sendMorning failed:', err?.message || err);
  process.exit(1);
}
console.log('sendMorning: done, exiting');
process.exit(0);
