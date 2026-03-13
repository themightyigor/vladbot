/**
 * Daily scheduled message: sends "мудрость от владосика".
 * Used by scripts/sendMorning.js (Railway Cron). Set MORNING_GROUP_CHAT_ID to enable.
 */

import fs from 'fs';
import path from 'path';
import { getReply } from '../ai/openaiService.js';

const DAY_NAMES_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_DIR = process.env.MORNING_STATE_DIR?.trim() || DATA_DIR;
const STATE_FILE = path.join(STATE_DIR, 'morning_state.json');
const WISDOM_SIGNATURE = 'Мудрости от Владосика228';

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (_) {}
  return { lastSentDate: null, lastType: null };
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

const WISDOM_ANGLES = [
  'абсурдная псевдо-глубокая мысль про жизнь',
  'жизненный совет, который звучит уверенно, но по сути полная хуйня',
  'мудрость про людей и их привычки с нелепым сравнением',
  'едкая философия про утро, сон или усталость с шизовым поворотом',
  'короткий афоризм с вайбом "владосик всё понял", но логика там сломана'
];

async function generateMorningWisdom() {
  const now = new Date();
  const dayName = DAY_NAMES_RU[now.getDay()];
  const angle = WISDOM_ANGLES[Math.floor(Math.random() * WISDOM_ANGLES.length)];
  const prompt = `Сегодня ${dayName}.
Ты пишешь в группу "мудрость от владосика" в своём стиле.
Нужна одна короткая, смешная или едкая псевдомудрая мысль. Задача: ${angle}.
Сделай её нарочито абсурдной: чтобы звучало как будто есть смысл, но при этом это немного бред, нелепость или кривая бытовая философия.
Можно мат, можно лесенкой, но без лишнего разгона.
Никаких кавычек, заголовков, пояснений и подписи. Только текст самой мудрости.`;
  return getReply(prompt, [], { username: '', interlocutorName: null });
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
    text = await generateMorningWisdom();
  } catch (err) {
    console.error('Morning message generate failed:', err.message);
    return;
  }
  if (!text || !text.trim()) {
    console.log('Morning skipped: empty text from generator');
    return;
  }

  const messageToSend = `${escapeHtml(text.trim())}\n\n<i>${escapeHtml(WISDOM_SIGNATURE)}</i>`;
  try {
    await telegram.sendMessage(chatId, messageToSend, { parse_mode: 'HTML' });
    saveState({ lastSentDate: today, lastType: 'wisdom' });
    console.log('Morning message sent: wisdom', today);
  } catch (err) {
    console.error('Morning message send failed:', err.message);
  }
}
