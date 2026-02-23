/**
 * Builds persona (system prompt + few-shot examples) from data/conversation.json.
 * Set PERSON_NAME in .env to the display name of the person to mimic.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const CONVERSATION_FILE = path.join(DATA_DIR, 'conversation.json');
const PERSONA_FILE = path.join(DATA_DIR, 'persona.json');

function loadConversation() {
  if (!fs.existsSync(CONVERSATION_FILE)) {
    console.error(`Run "npm run parse" first. Missing: ${CONVERSATION_FILE}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONVERSATION_FILE, 'utf8'));
}

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

/** Strip leading "HH:MM PersonName " for any of the person's names. */
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

function extractStyle(messages, personNames) {
  const set = new Set(Array.isArray(personNames) ? personNames : [personNames]);
  const byPerson = messages.filter((m) => set.has(m.author));
  const texts = byPerson.map((m) => (typeof m.text === 'string' ? m.text : getText(m.text))).filter(Boolean);
  const joined = texts.join(' ');
  const hasEmoji = /[\u{1F300}-\u{1F9FF}]|[\u2600-\u26FF]|[\u2700-\u27BF]/u.test(joined);
  const avgLen = texts.reduce((a, t) => a + t.length, 0) / (texts.length || 1);
  const short = avgLen < 80;
  return {
    hasEmoji,
    shortReplies: short,
    sampleCount: texts.length
  };
}

function buildPairs(messages, personNames, maxPairs = 40) {
  const set = new Set(Array.isArray(personNames) ? personNames : [personNames]);
  const candidatePairs = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const curr = messages[i];
    const next = messages[i + 1];
    const currText = typeof curr.text === 'string' ? curr.text : getText(curr.text);
    const nextText = typeof next.text === 'string' ? next.text : getText(next.text);
    if (!currText || !nextText) continue;
    if (!set.has(next.author)) continue;
    if (curr.author === 'Unknown') continue;
    if (currText.length > 400 || nextText.length > 400) continue;
    candidatePairs.push({
      user: currText.trim(),
      assistant: stripTimeAndName(nextText.trim(), personNames),
      index: i
    });
  }
  if (candidatePairs.length <= maxPairs) return candidatePairs.map((p) => ({ user: p.user, assistant: p.assistant }));
  const step = (candidatePairs.length - 1) / (maxPairs - 1);
  const indices = new Set();
  for (let k = 0; k < maxPairs; k++) {
    const i = Math.round(k * step);
    indices.add(Math.min(i, candidatePairs.length - 1));
  }
  return [...indices].sort((a, b) => a - b).map((i) => ({
    user: candidatePairs[i].user,
    assistant: candidatePairs[i].assistant
  }));
}

const BAD_STYLE_SAMPLE = /^(Photo|Video file|Sticker) Not included|^In reply to this message\s*$|^https?:\/\/\S+$/i;

/** Topic categories for stratified style samples (order = priority). */
const STYLE_TOPICS = [
  {
    key: 'politics',
    name: 'политика/споры',
    re: /орк|ватник|мобик|сво\b|завод\b.*(развал|войн|параплан)|войн|украин|вторжен|зона войны|до всех орков|реальность vs|политик/i
  },
  {
    key: 'whining',
    name: 'нытьё/деньги/жертва',
    re: /денег нет|нет денег|похуй|нищ|терпил|зп\b|кредит|ипотек|подставили|150к|не по карману|пятизначн|только на себя|реальность\b/i
  },
  {
    key: 'cars',
    name: 'машины/мото',
    re: /машин|жигул|omoda|некро|крета|авто|бмв|двигатель|кузов|колес|мопед|мото|гараж|маслорий|тигуан|грант/i
  },
  {
    key: 'invites',
    name: 'приглашения/планы',
    re: /поехали|приезжай|тусить|на дачу|рыбалк|погнали|в субботу|в воскресенье|подумаю|надо думать|чуть позже|собраться|в спб|на вышку/i
  },
  {
    key: 'roasts',
    name: 'подколы/сарказм',
    re: /конч|заебал|zемский|не выебывайся|конченн|подкол|соскуфился|придурок|дауны|сосите жопу/i
  },
  {
    key: 'work',
    name: 'работа/смена',
    re: /завод|смен|пивточк|работа|зарплат|магнит|терплю у магнита/i
  },
  {
    key: 'health',
    name: 'здоровье',
    re: /нога|спина|зуб|здоровь|болит|больн|врач|больничн/i
  },
  {
    key: 'games',
    name: 'игры/контент',
    re: /кс\b|кромвельк|дока|игр|двач|нормис|видос|пикабу|слово пацана/i
  },
  {
    key: 'support',
    name: 'сухая поддержка/реакции',
    re: /\b(угу|окей|красиво|круто|топ\b|найс|респект|соглы|прикольно|возьми|потянем|бери)\b/i
  }
];

function assignTopic(text) {
  if (text.length <= 55 && STYLE_TOPICS.find((t) => t.key === 'support').re.test(text)) return 'support';
  for (const { key, re } of STYLE_TOPICS) {
    if (key === 'support') continue;
    if (re.test(text)) return key;
  }
  return 'other';
}

function pickFromBucket(arr, count) {
  if (!arr.length || count <= 0) return [];
  if (arr.length <= count) return [...arr];
  const step = (arr.length - 1) / (count - 1);
  const out = [];
  const seen = new Set();
  for (let k = 0; k < count; k++) {
    const i = Math.min(Math.round(k * step), arr.length - 1);
    const s = arr[i];
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function buildStyleSamples(messages, personNames, maxSamples = 75, minLen = 8, maxLen = 280) {
  const set = new Set(Array.isArray(personNames) ? personNames : [personNames]);
  const all = messages
    .filter((m) => set.has(m.author))
    .map((m) => stripTimeAndName((typeof m.text === 'string' ? m.text : getText(m.text)).trim(), personNames))
    .filter(
      (t) =>
        t.length >= minLen &&
        t.length <= maxLen &&
        !/^[\d:]+\s*$/.test(t) &&
        !BAD_STYLE_SAMPLE.test(t) &&
        !/exporting settings to download/i.test(t)
    );

  const byTopic = {};
  for (const key of [...STYLE_TOPICS.map((t) => t.key), 'other']) {
    byTopic[key] = [];
  }
  const seen = new Set();
  for (const t of all) {
    if (seen.has(t)) continue;
    seen.add(t);
    const topic = assignTopic(t);
    byTopic[topic].push(t);
  }

  const topicKeys = [...STYLE_TOPICS.map((t) => t.key), 'other'];
  const perTopic = Math.max(4, Math.floor(maxSamples / topicKeys.length));
  const out = [];
  for (const key of topicKeys) {
    const bucket = byTopic[key] || [];
    const take = key === 'other' ? Math.max(perTopic, maxSamples - out.length) : Math.min(bucket.length, perTopic);
    out.push(...pickFromBucket(bucket, take));
  }

  if (out.length >= maxSamples) {
    return { samples: out.slice(0, maxSamples), byTopic: countByTopic(out, assignTopic) };
  }
  const other = byTopic['other'] || [];
  const need = maxSamples - out.length;
  const otherTaken = pickFromBucket(other.filter((s) => !out.includes(s)), need);
  const final = [...out, ...otherTaken].slice(0, maxSamples);
  return { samples: final, byTopic: countByTopic(final, assignTopic) };
}

function countByTopic(samples, assignTopicFn) {
  const c = {};
  for (const s of samples) {
    const t = assignTopicFn(s);
    c[t] = (c[t] || 0) + 1;
  }
  return c;
}

function main() {
  const personName = process.env.PERSON_NAME || 'Vlad';
  const personNames = getPersonNames();
  const maxPairs = Math.min(Number(process.env.PERSONA_FEW_SHOT_PAIRS) || 55, 70);
  const maxStyleSamples = Math.min(Number(process.env.PERSONA_STYLE_SAMPLES) || 75, 100);
  const messages = loadConversation();

  const style = extractStyle(messages, personNames);
  const pairs = buildPairs(messages, personNames, maxPairs);
  const { samples: styleSamples, byTopic: styleSamplesByTopic } = buildStyleSamples(messages, personNames, maxStyleSamples);

  const styleNotes = [];
  if (style.hasEmoji) styleNotes.push('Uses emoji naturally.');
  styleNotes.push('Replies: minimum 3–4 lines (ladder), one short phrase per line; never just 1–2 lines.');
  styleNotes.push('Tone: toxic, negative—irritation, sarcasm, criticism, cynicism, complaining, dismissiveness.');
  styleNotes.push('Improvises in character—same tone and slang, but new wording, do not copy examples verbatim.');
  styleNotes.push('Separates thoughts by newline (ladder), not by periods.');
  styleNotes.push(`Based on ${style.sampleCount} messages from the conversation.`);

  const samplesInPrompt = Math.min(styleSamples.length, 65);
  const samplesBlock = styleSamples.length
    ? `\nExample phrases (match this style):\n${styleSamples.slice(0, samplesInPrompt).map((s) => `- ${s}`).join('\n')}`
    : '';

  const traitsLine = process.env.PERSONA_TRAITS
    ? `\nCharacter (show this in replies): ${process.env.PERSONA_TRAITS.trim()}`
    : '';

  const bioLine = process.env.PERSONA_BIO
    ? `\nFacts about this person (use naturally when relevant): ${process.env.PERSONA_BIO.trim()}`
    : '';

  const systemPrompt = `You are replying as ${personName} in a Telegram chat. Stay in character.

Reply with only the message text. Do not include timestamp or your name at the start.

Style: ${styleNotes.join(' ')} Use similar vocabulary, tone, and sentence length. Do not announce you are a bot or break character.${bioLine}${traitsLine}${samplesBlock}`;

  const persona = {
    personName,
    systemPrompt,
    fewShotPairs: pairs,
    styleSamples,
    meta: {
      messageCount: messages.length,
      personMessageCount: style.sampleCount,
      styleSamplesByTopic: styleSamplesByTopic || null
    }
  };

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(PERSONA_FILE, JSON.stringify(persona, null, 2), 'utf8');
  console.log(`Persona for "${personName}" saved to ${PERSONA_FILE}`);
  console.log(`System prompt: ${systemPrompt.length} chars. Few-shot pairs: ${pairs.length}. Style samples: ${styleSamples.length}.`);
  if (persona.meta?.styleSamplesByTopic) {
    console.log('Style samples by topic:', persona.meta.styleSamplesByTopic);
  }
}

main();
