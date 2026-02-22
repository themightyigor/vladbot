/**
 * Daily morning message: alternates "утренний нытик" (по дню недели и погоде в Кингисеппе) and "подкол дня".
 * Used by scripts/sendMorning.js (Railway Cron). Set MORNING_GROUP_CHAT_ID to enable.
 */

import fs from 'fs';
import path from 'path';
import { getReply } from '../ai/openaiService.js';

const KINGISEPP_LAT = 59.37;
const KINGISEPP_LON = 28.61;
const DAY_NAMES_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

// WMO weather code -> короткое описание для промпта
const WEATHER_LABELS = {
  0: 'ясно',
  1: 'преимущественно ясно',
  2: 'переменная облачность',
  3: 'пасмурно',
  45: 'туман',
  48: 'изморозь',
  51: 'морось',
  53: 'морось',
  55: 'морось',
  61: 'дождь',
  63: 'дождь',
  65: 'ливень',
  71: 'снег',
  73: 'снег',
  75: 'снег',
  77: 'снег',
  80: 'ливень',
  81: 'ливень',
  82: 'ливень',
  85: 'снегопад',
  86: 'снегопад',
  95: 'гроза',
  96: 'гроза с градом',
  99: 'гроза с градом'
};

function weatherCodeToLabel(code) {
  return WEATHER_LABELS[code] ?? 'непойми что';
}

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

async function fetchWeatherKingisepp() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${KINGISEPP_LAT}&longitude=${KINGISEPP_LON}&current=temperature_2m,weather_code&timezone=Europe/Moscow`;
    const res = await fetch(url);
    const data = await res.json();
    const cur = data?.current;
    if (!cur) return null;
    return {
      temp: cur.temperature_2m,
      condition: weatherCodeToLabel(cur.weather_code ?? 0)
    };
  } catch (err) {
    console.error('Weather fetch failed:', err.message);
    return null;
  }
}

const NYRIK_ANGLES = [
  'побудь нытиком про утро и подъём',
  'побудь нытиком про день недели и работу/неделю',
  'побудь нытиком про погоду за окном в Кингисеппе',
  'коротко побурчи про сон или кофе',
  'одна фраза недовольного утреннего нытика'
];

async function generateMorningNyrik() {
  const now = new Date();
  const dayName = DAY_NAMES_RU[now.getDay()];
  const weather = await fetchWeatherKingisepp();
  const weatherStr = weather
    ? `Погода в Кингисеппе: ${weather.condition}, ${weather.temp}°C.`
    : 'Погоду не подтянул.';
  const angle = NYRIK_ANGLES[Math.floor(Math.random() * NYRIK_ANGLES.length)];
  const prompt = `Сегодня ${dayName}. ${weatherStr}
Ты просыпаешься и пишешь в группу одну короткую фразу утреннего нытика в своём стиле. Задача: ${angle}. Лесенкой, мат, без лишнего. Только твой ответ.`;
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

  const nextType = state.lastType === 'nyrik' || state.lastType === 'reaction' ? 'podkol' : 'nyrik';
  let text;
  try {
    text = nextType === 'nyrik' ? await generateMorningNyrik() : await generatePodkolDay();
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
