/**
 * Telegram bot: receives messages, calls OpenAI in persona style, replies.
 * Requires BOT_TOKEN and OPENAI_API_KEY in .env; run npm run parse and npm run build-persona first.
 */

import { Telegraf } from 'telegraf';
import { getReply } from '../ai/openaiService.js';

const bot = new Telegraf(process.env.BOT_TOKEN);

const userHistory = new Map();
const MAX_HISTORY = 20;

function getHistory(chatId) {
  if (!userHistory.has(chatId)) {
    userHistory.set(chatId, []);
  }
  return userHistory.get(chatId);
}

function pushHistory(chatId, role, text) {
  const h = getHistory(chatId);
  h.push({ role, text });
  if (h.length > MAX_HISTORY) {
    h.splice(0, h.length - MAX_HISTORY);
  }
}

bot.start((ctx) => {
  return ctx.reply("Hi. Send me a message and I'll reply in character.");
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text?.trim();
  if (!text) return;

  const chatId = ctx.chat.id;
  const history = getHistory(chatId).map((m) => ({ role: m.role, text: m.text }));

  await ctx.sendChatAction('typing');

  try {
    const reply = await getReply(text, history);
    await ctx.reply(reply);
    pushHistory(chatId, 'user', text);
    pushHistory(chatId, 'bot', reply);
  } catch (err) {
    console.error(err);
    await ctx.reply("Something went wrong. Check logs and that OPENAI_API_KEY and persona are set.");
  }
});

export function runBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    throw new Error('BOT_TOKEN is not set in .env');
  }
  bot.launch().then(() => {
    console.log('Bot is running (long polling).');
  });
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
