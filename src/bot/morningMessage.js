/**
 * Daily morning message: alternates "reaction to yesterday" and "подкол дня".
 * Used by scripts/sendMorning.js (Railway Cron). Set MORNING_GROUP_CHAT_ID to enable.
 */

import fs from 'fs';
import path from 'path';
import { getReply } from '../ai/openaiService.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_DIR = process.env.MORNING_STATE_DIR?.trim() || DATA_DIR;
const STATE_FILE = path.join(STATE_DIR, 'morning_state.json');

const PODKOL_TARGETS = [
  { username: 'ainiy09', interlocutorName: 'Nikita' },
  { username: 'p0_jl', interlocutorName: 'Rostic' },
  { username: 'vasyachaika', interlocutorName: 'Вася' },
  { username: 'irbzv', interlocutorName: 'Игорь' },
  { username: 'adtrety', interlocutorName: 'Андрей' },
  { username: 'sk42pn', interlocutorName: 'Сергей' }
];

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

async function generateReactionToYesterday() {
  const prompt =
    'Ты просыпаешься. Напиши одну короткую фразу в своём стиле — реакция на вчерашний день в групповом чате: что не читал сообщения, всем похуй как всегда. Лесенкой, мат, без лишнего. Только твой ответ.';
  return getReply(prompt, [], { username: '', interlocutorName: null });
}

async function generatePodkolDay() {
  const target = PODKOL_TARGETS[Math.floor(Math.random() * PODKOL_TARGETS.length)];
  const prompt = `Сейчас ты пишешь в группу. Напиши один короткий подкол или напоминание для этого человека (в своём стиле). Одна-две строки лесенкой. Только текст подкола.`;
  return getReply(prompt, [], {
    username: target.username,
    interlocutorName: target.interlocutorName
  });
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

  const nextType = state.lastType === 'reaction' ? 'podkol' : 'reaction';
  let text;
  try {
    text = nextType === 'reaction' ? await generateReactionToYesterday() : await generatePodkolDay();
  } catch (err) {
    console.error('Morning message generate failed:', err.message);
    return;
  }
  if (!text || !text.trim()) {
    console.log('Morning skipped: empty text from generator');
    return;
  }

  try {
    await telegram.sendMessage(chatId, text.trim());
    saveState({ lastSentDate: today, lastType: nextType });
    console.log('Morning message sent:', nextType, today);
  } catch (err) {
    console.error('Morning message send failed:', err.message);
  }
}
