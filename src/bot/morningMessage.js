/**
 * Daily scheduled message: короткий мини-анекдот от Владосика (5–10 строк).
 * Used by scripts/sendMorning.js (Railway Cron). Set MORNING_GROUP_CHAT_ID to enable.
 */

import fs from 'fs';
import path from 'path';
import { getReply } from '../ai/openaiService.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_DIR = process.env.MORNING_STATE_DIR?.trim() || DATA_DIR;
const STATE_FILE = path.join(STATE_DIR, 'morning_state.json');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return { lastSentDate: s.lastSentDate ?? null };
    }
  } catch (_) {}
  return { lastSentDate: null };
}

function saveState(state) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Morning state save failed:', err.message);
  }
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

const ANECDOTE_PROMPT = `Ты — Владосик. Напиши один мини-анекдот на утро в групповой чат.

Требования:
- Обязательно от 5 до 10 коротких строк; если набирается меньше — добавь деталей к истории. Лесенка: каждая фраза с новой строки.
- Быт и тон Владосика: завод Полипласт, смены, жига, Магнит, ипотека, кромвелька, Катя, малой; мат умеренно по ситуации.
- Лёгкий бытовой юмор или абсурд, без рубрик и без подписей в конце.

Выдай только текст анекдота, без заголовков и пояснений.
Формат: каждая фраза с новой строки (не один сплошной абзац).`;

/** То же, что уходит в утренний крон — удобно для `npm run preview-morning`. */
export async function generateMorningAnecdote() {
  return getReply(ANECDOTE_PROMPT, [], { username: '', interlocutorName: null });
}

export async function sendMorningMessage(telegram) {
  const chatId = process.env.MORNING_GROUP_CHAT_ID?.trim();
  if (!chatId) {
    console.log('Morning skipped: MORNING_GROUP_CHAT_ID not set');
    return;
  }

  const state = loadState();
  const today = todayStr();
  if (state.lastSentDate === today) {
    console.log('Morning skipped: already sent today', today);
    return;
  }

  let text;
  try {
    text = await generateMorningAnecdote();
  } catch (err) {
    console.error('Morning anecdote generate failed:', err.message);
    return;
  }
  if (!text || !text.trim()) {
    console.log('Morning skipped: empty text from generator');
    return;
  }

  const messageToSend = escapeHtml(text.trim());
  try {
    await telegram.sendMessage(chatId, messageToSend, { parse_mode: 'HTML' });
    saveState({ lastSentDate: today });
    console.log('Morning anecdote sent', today);
  } catch (err) {
    console.error('Morning message send failed:', err.message);
  }
}
