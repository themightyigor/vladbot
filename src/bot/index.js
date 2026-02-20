/**
 * Telegram bot: receives messages, calls OpenAI in persona style, replies.
 * Works in private chat and in groups (only when @mentioned).
 * Requires BOT_TOKEN and OPENAI_API_KEY in .env; run npm run parse and npm run build-persona first.
 */

import { Telegraf } from 'telegraf';
import { getReply } from '../ai/openaiService.js';

const bot = new Telegraf(process.env.BOT_TOKEN);

const userHistory = new Map();
const MAX_HISTORY = 20;

let botUsername = null;

function historyKey(ctx) {
  const chatId = ctx.chat.id;
  const type = ctx.chat?.type;
  if (type === 'private') return String(chatId);
  const userId = ctx.from?.id;
  return userId ? `${chatId}:${userId}` : String(chatId);
}

function getHistory(key) {
  if (!userHistory.has(key)) {
    userHistory.set(key, []);
  }
  return userHistory.get(key);
}

function pushHistory(key, role, text) {
  const h = getHistory(key);
  h.push({ role, text });
  if (h.length > MAX_HISTORY) {
    h.splice(0, h.length - MAX_HISTORY);
  }
}

function stripMention(text) {
  if (!text || !botUsername) return text?.trim() ?? '';
  const mention = `@${botUsername}`;
  const re = new RegExp(`^\\s*${mention}\\s*`, 'i');
  return text.replace(re, '').trim();
}

function shouldRespond(ctx) {
  const type = ctx.chat?.type;
  if (type === 'private') return true;
  if (type === 'group' || type === 'supergroup') {
    const text = ctx.message?.text ?? '';
    return !!(botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`));
  }
  return false;
}

bot.start((ctx) => {
  return ctx.reply("Hi. Send me a message and I'll reply in character. In groups, @mention me to get a reply.");
});

bot.on('text', async (ctx) => {
  if (!shouldRespond(ctx)) return;

  let text = ctx.message.text?.trim();
  if (!text) return;

  text = stripMention(text);
  if (!text) return;

  const key = historyKey(ctx);
  const history = getHistory(key).map((m) => ({ role: m.role, text: m.text }));

  await ctx.sendChatAction('typing');

  try {
    const reply = await getReply(text, history);
    await ctx.reply(reply);
    pushHistory(key, 'user', text);
    pushHistory(key, 'bot', reply);
  } catch (err) {
    console.error(err);
    await ctx.reply("Something went wrong. Check logs and that OPENAI_API_KEY and persona are set.");
  }
});

export async function runBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    throw new Error('BOT_TOKEN is not set in .env');
  }
  const me = await bot.telegram.getMe();
  botUsername = me.username;
  await bot.launch();
  console.log('Bot is running (long polling). Username:', botUsername);
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
