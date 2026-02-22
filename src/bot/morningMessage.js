/**
 * Daily morning message: random time in configurable window, alternates
 * "reaction to yesterday" and "подкол дня". Set MORNING_GROUP_CHAT_ID to enable.
 */

import fs from 'fs';
import path from 'path';
import { getReply } from '../ai/openaiService.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'morning_state.json');

const HOUR_START = Math.max(0, Math.min(23, Number(process.env.MORNING_HOUR_START) || 7));
const HOUR_END = Math.max(HOUR_START, Math.min(23, Number(process.env.MORNING_HOUR_END) || 10));

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
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Morning state save failed:', err.message);
  }
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function randomMorningTime() {
  const hour = HOUR_START + Math.floor(Math.random() * (HOUR_END - HOUR_START + 1));
  const minute = Math.floor(Math.random() * 60);
  return { hour, minute };
}

function nextRunAt() {
  const now = new Date();
  const { hour, minute } = randomMorningTime();
  let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
    const r2 = randomMorningTime();
    next.setHours(r2.hour, r2.minute, 0, 0);
  }
  return next;
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
  if (!chatId) return;

  const state = loadState();
  const today = todayStr();
  if (state.lastSentDate === today) return;

  const nextType = state.lastType === 'reaction' ? 'podkol' : 'reaction';
  let text;
  try {
    text = nextType === 'reaction' ? await generateReactionToYesterday() : await generatePodkolDay();
  } catch (err) {
    console.error('Morning message generate failed:', err.message);
    return;
  }
  if (!text || !text.trim()) return;

  try {
    await telegram.sendMessage(chatId, text.trim());
    saveState({ lastSentDate: today, lastType: nextType });
    console.log('Morning message sent:', nextType, today);
  } catch (err) {
    console.error('Morning message send failed:', err.message);
  }
}

function scheduleNext(telegram) {
  const chatId = process.env.MORNING_GROUP_CHAT_ID?.trim();
  if (!chatId) return;

  const next = nextRunAt();
  const delay = next - Date.now();
  if (delay <= 0) {
    scheduleNext(telegram);
    return;
  }
  setTimeout(async () => {
    await sendMorningMessage(telegram);
    scheduleNext(telegram);
  }, delay);
  console.log('Next morning message at', next.toISOString(), '(server time)');
}

export function startMorningScheduler(telegram) {
  const chatId = process.env.MORNING_GROUP_CHAT_ID?.trim();
  if (!chatId) {
    console.log('Morning scheduler: disabled (MORNING_GROUP_CHAT_ID not set)');
    return;
  }
  console.log('Morning scheduler: enabled for chat', chatId);
  scheduleNext(telegram);
}
