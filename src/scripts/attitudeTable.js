/**
 * Builds a markdown table: Vlad's attitude toward each interlocutor based on his replies.
 * Reads data/conversation.json, groups by interlocutor, samples replies, infers tone.
 * Output: data/attitude-table.md
 * Run: npm run attitude-table
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const CONVERSATION_FILE = path.join(DATA_DIR, 'conversation.json');
const PERSONA_FILE = path.join(DATA_DIR, 'persona.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'attitude-table.md');

const MAX_SAMPLES = 4;
const OBSCENITY = /(блять|сука|нахуй|пиздец|ебать|хуй|бля|ебало)/i;
const FRIENDLY = /(лады|окей|крутяк|ага|пон|го\s|норм|кста)/i;

function getText(obj) {
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map((e) => (typeof e === 'string' ? e : e?.text || '')).join('');
  return obj?.text || '';
}

function getPersonNames() {
  const main = process.env.PERSON_NAME || 'Vlad';
  const aliases = (process.env.PERSON_ALIASES || '').split(',').map((s) => s.trim()).filter(Boolean);
  return [main, ...aliases];
}

function stripTimeAndName(text, personNames) {
  if (!text || typeof text !== 'string') return text;
  const names = Array.isArray(personNames) ? personNames : [personNames];
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const trimmed = text.replace(new RegExp(`^\\d{1,2}:\\d{2}\\s+${escaped}\\s*`, 'i'), '').trim();
    if (trimmed !== text) return trimmed || text;
  }
  return text;
}

function inferAttitude(replies) {
  if (!replies.length) return '—';
  const texts = replies.map((r) => r.slice(0, 500));
  const avgLen = texts.reduce((a, t) => a + t.length, 0) / texts.length;
  let obscenityCount = 0;
  let friendlyCount = 0;
  for (const t of texts) {
    if (OBSCENITY.test(t)) obscenityCount++;
    if (FRIENDLY.test(t)) friendlyCount++;
  }
  const parts = [];
  if (avgLen < 35) parts.push('короткие ответы');
  else if (avgLen > 120) parts.push('развёрнуто');
  if (obscenityCount / texts.length > 0.15) parts.push('неформально, с матом');
  if (friendlyCount / texts.length > 0.2) parts.push('дружески');
  if (parts.length === 0) parts.push('нейтрально');
  return parts.join('; ');
}

function main() {
  if (!fs.existsSync(CONVERSATION_FILE)) {
    console.error('Run npm run parse first. Missing:', CONVERSATION_FILE);
    process.exit(1);
  }

  const personNames = getPersonNames();
  const set = new Set(personNames);
  const messages = JSON.parse(fs.readFileSync(CONVERSATION_FILE, 'utf8'));

  const byInterlocutor = new Map();
  for (let i = 0; i < messages.length - 1; i++) {
    const curr = messages[i];
    const next = messages[i + 1];
    if (!set.has(next.author)) continue;
    const replyText = (typeof next.text === 'string' ? next.text : getText(next.text)).trim();
    const cleaned = stripTimeAndName(replyText, personNames);
    if (!cleaned) continue;
    if (!byInterlocutor.has(curr.author)) {
      byInterlocutor.set(curr.author, []);
    }
    byInterlocutor.get(curr.author).push(cleaned);
  }

  const rows = [];
  for (const [interlocutor, replies] of byInterlocutor.entries()) {
    const count = replies.length;
    const attitude = inferAttitude(replies);
    const step = replies.length <= MAX_SAMPLES ? 1 : Math.floor(replies.length / MAX_SAMPLES);
    const samples = [];
    for (let j = 0; j < MAX_SAMPLES && j * step < replies.length; j++) {
      const r = replies[j * step];
      const short = r.length > 120 ? r.slice(0, 117) + '…' : r;
      samples.push(short.replace(/\n/g, ' '));
    }
    rows.push({ interlocutor, count, attitude, samples });
  }

  rows.sort((a, b) => b.count - a.count);

  const lines = [
    '# Отношение Влада к собеседникам (по ответам в переписке)',
    '',
    '| Собеседник | Пар (реплик Влада) | Отношение / тон | Примеры ответов |',
    '|------------|--------------------|-----------------|-----------------|'
  ];

  for (const r of rows) {
    const safe = (s) => String(s).replace(/\|/g, ',').replace(/\n/g, ' ');
    const samplesCell = r.samples.map((s) => `«${safe(s)}»`).join('; ');
    const attitudeEsc = safe(r.attitude);
    const nameEsc = safe(r.interlocutor);
    lines.push(`| ${nameEsc} | ${r.count} | ${attitudeEsc} | ${samplesCell} |`);
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf8');
  console.log('Wrote', OUTPUT_FILE, '—', rows.length, 'interlocutors.');
}

main();
