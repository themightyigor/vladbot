/**
 * Daily character usage for ElevenLabs voice (for rate limiting).
 * Persists to data/voice_usage.json so limit survives restarts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DATA = path.join(process.cwd(), 'data');
const REL_DATA = path.join(__dirname, '../../data');
const USAGE_FILE = fs.existsSync(ROOT_DATA)
  ? path.join(ROOT_DATA, 'voice_usage.json')
  : path.join(REL_DATA, 'voice_usage.json');

function todayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function readUsage() {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
      if (data.date === todayKey()) return data.chars || 0;
    }
  } catch (_) {}
  return 0;
}

function writeUsage(chars) {
  try {
    const dir = path.dirname(USAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify({ date: todayKey(), chars }), 'utf8');
  } catch (err) {
    console.error('voiceUsage write failed:', err.message);
  }
}

export function getTodayVoiceChars() {
  return readUsage();
}

export function addVoiceChars(count) {
  const current = readUsage();
  writeUsage(current + count);
}

export function wouldExceedDailyLimit(replyCharCount, dailyLimit) {
  if (!dailyLimit || dailyLimit <= 0) return false;
  return readUsage() + replyCharCount > dailyLimit;
}
