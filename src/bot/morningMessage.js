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
  'тупой вывод про работу и усталость',
  'бытовая мудрость про деньги, жигу или ипотеку',
  'кривая мысль с отсылкой на одного знакомого',
  'полуабсурдный вывод про завод, магнит или нищету',
  'фраза как будто владосик хотел выдать базу, но вышла хуйня'
];

async function generateMorningWisdom() {
  const now = new Date();
  const dayName = DAY_NAMES_RU[now.getDay()];
  const angle = WISDOM_ANGLES[Math.floor(Math.random() * WISDOM_ANGLES.length)];
  const prompt = `Сегодня ${dayName}.
Ты пишешь в группу "мудрость от владосика" в своём стиле.
Нужна одна короткая бытовая мудрость. Задача: ${angle}.
Не делай её глубокой, красивой или реально умной.
Наоборот: туповатая, приземлённая, местами абсурдная, но узнаваемая по вайбу Владоса.
Пусть это звучит не как цитата, а как бытовой высер, где Владосик вроде хотел объяснить жизнь, но по факту сказал хуйню.
Можно дать одну короткую отсылку к его быту и окружению: завод, магнит, жига, ипотека, кромвелька, Катя, малой, пивточка, раф на кокосовом, Нива, полипласт.
Иногда можно упомянуть одного знакомого Влада: Никита, Вася, Игорь, Ростик, Андрей или Сергей. Не пихай всех сразу.
Можно мат, можно лесенкой.
Сделай 1-3 короткие строки, без лишнего разгона.
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
