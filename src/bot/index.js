/**
 * Telegram bot: receives messages, calls OpenAI in persona style, replies.
 * Works in private chat and in groups (when @mentioned or when replying to the bot).
 * Requires BOT_TOKEN and OPENAI_API_KEY in .env; run npm run parse and npm run build-persona first.
 */

import { Telegraf, Input } from 'telegraf';
import { getReply, loadPersona } from '../ai/openaiService.js';
import { hasRagIndex } from '../rag/retrieve.js';
import { getSpeech, isElevenLabsConfigured } from '../ai/elevenlabsService.js';
import { mp3ToOggOpus } from '../ai/mp3ToOgg.js';
import { wouldExceedDailyLimit, addVoiceChars } from '../ai/voiceUsage.js';

const bot = new Telegraf(process.env.BOT_TOKEN);

const userHistory = new Map();
let lastVoiceAt = 0;
const MAX_HISTORY = 20;
const VOICE_COOLDOWN_MS = 5 * 60 * 1000;
const dailyVoiceCharLimit = Math.max(0, Number(process.env.ELEVENLABS_DAILY_CHAR_LIMIT) || 0);

let botUsername = null;
let botId = null;

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

function isReplyToBot(ctx) {
  const reply = ctx.message?.reply_to_message;
  if (!reply?.from) return false;
  return reply.from.is_bot && reply.from.id === botId;
}

function getQuotedText(ctx) {
  const reply = ctx.message?.reply_to_message;
  if (!reply) return null;
  const text = reply.text ?? reply.caption ?? '';
  return text.trim() || null;
}

function getInterlocutorName(ctx) {
  const from = ctx.from;
  if (!from) return null;
  const first = (from.first_name || '').trim();
  const last = (from.last_name || '').trim();
  if (first || last) return [first, last].filter(Boolean).join(' ') || null;
  if (from.username) return from.username;
  return null;
}

/** Extract mentioned users from message (mention = @username, text_mention = name). Excludes bot. */
function getMentionedUsers(ctx) {
  const rawText = ctx.message?.text || ctx.message?.caption || '';
  const entities = ctx.message?.entities || ctx.message?.caption_entities || [];
  if (!rawText || !entities.length) return [];
  const res = [];
  for (const e of entities) {
    if (e.type !== 'mention' && e.type !== 'text_mention') continue;
    if (e.type === 'mention') {
      const s = rawText.slice(e.offset, e.offset + e.length);
      if (s && s.startsWith('@') && (!botUsername || s.toLowerCase() !== `@${botUsername.toLowerCase()}`)) {
        res.push(s);
      }
    } else if (e.type === 'text_mention' && e.user) {
      const u = e.user;
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
      res.push(name || u.username || `id${u.id}`);
    }
  }
  return [...new Set(res)];
}

function shouldRespond(ctx) {
  const type = ctx.chat?.type;
  if (type === 'private') return true;
  if (type === 'group' || type === 'supergroup') {
    if (isReplyToBot(ctx)) return true;
    const text = ctx.message?.text ?? '';
    return !!(botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`));
  }
  return false;
}

function shouldRespondMedia(ctx, captionOrText = '') {
  const type = ctx.chat?.type;
  if (type === 'private') return true;
  if (type === 'group' || type === 'supergroup') {
    if (isReplyToBot(ctx)) return true;
    const text = (captionOrText || ctx.message?.caption || '').trim();
    return !!(botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`));
  }
  return false;
}

async function downloadTelegramFile(telegram, fileId) {
  const file = await telegram.getFile(fileId);
  const token = process.env.BOT_TOKEN;
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function sendReplyAndSave(ctx, key, userMsg, reply) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  const now = Date.now();
  const voiceCooldownExpired = now - lastVoiceAt >= VOICE_COOLDOWN_MS;
  const useVoice =
    isElevenLabsConfigured() &&
    voiceId &&
    voiceCooldownExpired &&
    !wouldExceedDailyLimit(reply.length, dailyVoiceCharLimit);

  if (useVoice) {
    try {
      await ctx.sendChatAction('record_voice');
      const mp3Buffer = await getSpeech(reply, voiceId);
      const oggBuffer = await mp3ToOggOpus(mp3Buffer);
      const file = Input.fromBuffer(oggBuffer, 'voice.ogg');
      await ctx.replyWithVoice(file);
      lastVoiceAt = now;
      addVoiceChars(reply.length);
    } catch (voiceErr) {
      console.error('ElevenLabs voice failed, sending text:', voiceErr.message);
      await ctx.reply(reply);
    }
  } else {
    await ctx.reply(reply);
  }
  pushHistory(key, 'user', userMsg);
  pushHistory(key, 'bot', reply);
}

bot.start((ctx) => {
  return ctx.reply("Hi. Send me a message and I'll reply in character. In groups, @mention me or reply to my message.");
});

bot.on('text', async (ctx) => {
  if (!shouldRespond(ctx)) return;

  let text = ctx.message.text?.trim();
  if (!text) return;

  text = stripMention(text);
  if (!text) return;

  const key = historyKey(ctx);
  const history = getHistory(key).map((m) => ({ role: m.role, text: m.text }));
  const quotedText = getQuotedText(ctx);

  await ctx.sendChatAction('typing');

  try {
    const interlocutorName = getInterlocutorName(ctx);
    const mentionedUsers = getMentionedUsers(ctx);
    const reply = await getReply(text, history, {
      quotedText,
      interlocutorName,
      username: ctx.from?.username ?? '',
      mentionedUsers: mentionedUsers.length ? mentionedUsers : undefined
    });
    await sendReplyAndSave(ctx, key, text, reply);
  } catch (err) {
    console.error(err);
    await ctx.reply("Something went wrong. Check logs and that OPENAI_API_KEY and persona are set.");
  }
});

bot.on('photo', async (ctx) => {
  const caption = ctx.message.caption?.trim() || '';
  if (!shouldRespondMedia(ctx, caption)) return;

  const key = historyKey(ctx);
  const history = getHistory(key).map((m) => ({ role: m.role, text: m.text }));
  const userMsg = caption || '[фото]';

  await ctx.sendChatAction('typing');

  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const imageBuffer = await downloadTelegramFile(ctx.telegram, photo.file_id);
    const promptText = caption ? stripMention(caption).trim() : '';
    const prompt = promptText || 'Что на картинке? Ответь в своём стиле (подкалывай, мат, политика).';
    const mentionedUsers = getMentionedUsers(ctx);
    const reply = await getReply(prompt, history, {
      imageBuffer,
      imageMimeType: 'image/jpeg',
      username: ctx.from?.username ?? '',
      interlocutorName: getInterlocutorName(ctx),
      mentionedUsers: mentionedUsers.length ? mentionedUsers : undefined
    });
    await sendReplyAndSave(ctx, key, userMsg, reply);
  } catch (err) {
    console.error(err);
    await ctx.reply('Не разобрал картинку, блять. Попробуй ещё раз или напиши текстом.');
  }
});

bot.on('sticker', async (ctx) => {
  if (!shouldRespondMedia(ctx)) return;

  const key = historyKey(ctx);
  const history = getHistory(key).map((m) => ({ role: m.role, text: m.text }));
  const sticker = ctx.message.sticker;

  if (sticker.is_animated) {
    try {
      const reply = await getReply('Юзер прислал анимированный стикер. Ответь в своём стиле что такие не смотришь.', history, {
        username: ctx.from?.username ?? '',
        interlocutorName: getInterlocutorName(ctx)
      });
      await sendReplyAndSave(ctx, key, '[аним. стикер]', reply);
    } catch (err) {
      console.error(err);
      await ctx.reply('Анимированные стикеры не смотрю, блять.');
    }
    return;
  }

  await ctx.sendChatAction('typing');

  try {
    const imageBuffer = await downloadTelegramFile(ctx.telegram, sticker.file_id);
    const reply = await getReply('Что на стикере? Ответь в своём стиле (подкалывай, мат, политика).', history, {
      imageBuffer,
      imageMimeType: 'image/webp',
      username: ctx.from?.username ?? '',
      interlocutorName: getInterlocutorName(ctx)
    });
    await sendReplyAndSave(ctx, key, '[стикер]', reply);
  } catch (err) {
    console.error(err);
    await ctx.reply('Стикер не разобрал. Пиши текстом.');
  }
});

export async function runBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    throw new Error('BOT_TOKEN is not set. Set BOT_TOKEN in Railway Variables.');
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY is not set. Set it in Railway Variables.');
  }
  const persona = loadPersona();
  console.log('Persona loaded:', persona?.personName || 'ok');
  console.log('RAG index:', hasRagIndex() ? 'yes' : 'no (optional)');
  const me = await bot.telegram.getMe();
  botUsername = me.username;
  botId = me.id;
  await bot.launch();
  console.log('Bot is running (long polling). Username:', botUsername);
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
