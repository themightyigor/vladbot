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

/** Strip leading "HH:MM PersonName " from exported message text. */
function stripTimeAndName(text, personName) {
  if (!text || typeof text !== 'string') return text;
  const escaped = personName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`^\\d{1,2}:\\d{2}\\s+${escaped}\\s*`, 'i'), '').trim() || text;
}

function extractStyle(messages, personName) {
  const byPerson = messages.filter((m) => m.author === personName);
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

function buildPairs(messages, personName, maxPairs = 40) {
  const candidatePairs = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const curr = messages[i];
    const next = messages[i + 1];
    const currText = typeof curr.text === 'string' ? curr.text : getText(curr.text);
    const nextText = typeof next.text === 'string' ? next.text : getText(next.text);
    if (!currText || !nextText) continue;
    if (next.author !== personName) continue;
    if (currText.length > 400 || nextText.length > 400) continue;
    candidatePairs.push({
      user: currText.trim(),
      assistant: stripTimeAndName(nextText.trim(), personName),
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

function buildStyleSamples(messages, personName, maxSamples = 50, minLen = 10, maxLen = 180) {
  const byPerson = messages
    .filter((m) => m.author === personName)
    .map((m) => stripTimeAndName((typeof m.text === 'string' ? m.text : getText(m.text)).trim(), personName))
    .filter((t) => t.length >= minLen && t.length <= maxLen && !/^[\d:]+\s*$/.test(t));
  if (byPerson.length <= maxSamples) return byPerson;
  const step = (byPerson.length - 1) / (maxSamples - 1);
  const out = [];
  const seen = new Set();
  for (let k = 0; k < maxSamples; k++) {
    const i = Math.min(Math.round(k * step), byPerson.length - 1);
    const s = byPerson[i];
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function main() {
  const personName = process.env.PERSON_NAME || 'Vlad';
  const maxPairs = Math.min(Number(process.env.PERSONA_FEW_SHOT_PAIRS) || 40, 60);
  const maxStyleSamples = Math.min(Number(process.env.PERSONA_STYLE_SAMPLES) || 50, 80);
  const messages = loadConversation();

  const style = extractStyle(messages, personName);
  const pairs = buildPairs(messages, personName, maxPairs);
  const styleSamples = buildStyleSamples(messages, personName, maxStyleSamples);

  const styleNotes = [];
  if (style.hasEmoji) styleNotes.push('Uses emoji naturally.');
  styleNotes.push('Replies: minimum 3–4 lines (ladder), one short phrase per line; never just 1–2 lines.');
  styleNotes.push('Tone: toxic, negative—irritation, sarcasm, criticism, cynicism, complaining, dismissiveness.');
  styleNotes.push('Improvises in character—same tone and slang, but new wording, do not copy examples verbatim.');
  styleNotes.push('Separates thoughts by newline (ladder), not by periods.');
  styleNotes.push(`Based on ${style.sampleCount} messages from the conversation.`);

  const samplesBlock = styleSamples.length
    ? `\nExample phrases (match this style):\n${styleSamples.slice(0, 40).map((s) => `- ${s}`).join('\n')}`
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
      personMessageCount: style.sampleCount
    }
  };

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(PERSONA_FILE, JSON.stringify(persona, null, 2), 'utf8');
  console.log(`Persona for "${personName}" saved to ${PERSONA_FILE}`);
  console.log(`System prompt: ${systemPrompt.length} chars. Few-shot pairs: ${pairs.length}. Style samples: ${styleSamples.length}.`);
}

main();
