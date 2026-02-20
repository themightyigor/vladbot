/**
 * OpenAI-based reply in the persona's style.
 * Uses system prompt + RAG (if built) + few-shot examples + conversation history.
 *
 * Character traits of Vlad Timokhin (from dialogue analysis):
 * - Short replies: "Да", "Угу", "Понял", "Окей", "Лады", "Крутяк", "Не", "Ага", "Нах?"
 * - Writes in "ladder" style: one phrase per line, no periods between thoughts
 * - Often starts with: Ну, Да, Блин, Бля, Сука; sometimes glues words: "ДаКак раз", "НуууОкей"
 * - Natural obscenity: хуй, блять, сука, нахуй, ебать, пиздец
 * - Slang: лады, ну го, щас, хз, мб, норм, кста, че, нах, имба, кайф, пон, малой, дядь, чел
 * - Reactions: Ого, Опа, Хех, Ляяя, Хахах, Ахахах
 * - Topics: cars (Omoda, ВАЗ, авито), work/завод, money/зарплата/нищий, Катя, "с малым"
 * - Behavior: нытьё, сарказм, критика ("долбоеб", "овощ"), откладывает дела, "тяжелый на подъем"
 */

import OpenAI from 'openai';

/** Character traits of Vlad Timokhin — use as a light guide, don't overdo; improvise. */
const VLAD_CHARACTER_TRAITS =
  '\n\nCharacter (use sparingly, don\'t overdo): Keep in mind a toxic, negative собеседник: some irritation, sarcasm, criticism, complaining. Improvise freely—you decide when to use slang (лады, хз, мб, щас, норм, че, нах, пон), starters (Ну, Да, Блин, Бля, Сука), obscenity when it fits, reactions (Угу, Ого, Опа, Хахах). Don\'t force every trait into every reply; stay in character but vary and improvise. Prefer full sentences; ladder style (one phrase per line) is optional.';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { retrieve, hasRagIndex } from '../rag/retrieve.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DATA = path.join(process.cwd(), 'data');
const REL_DATA = path.join(__dirname, '../../data');
const PERSONA_FILE = fs.existsSync(path.join(ROOT_DATA, 'persona.json'))
  ? path.join(ROOT_DATA, 'persona.json')
  : path.join(REL_DATA, 'persona.json');

let cachedPersona = null;

function loadPersona() {
  if (cachedPersona) return cachedPersona;
  if (!fs.existsSync(PERSONA_FILE)) {
    throw new Error(`Persona not built. Run: npm run build-persona. Looked at: ${PERSONA_FILE}`);
  }
  cachedPersona = JSON.parse(fs.readFileSync(PERSONA_FILE, 'utf8'));
  return cachedPersona;
}

const MAX_FEW_SHOT_IN_PROMPT = Math.min(Number(process.env.OPENAI_FEW_SHOT_IN_PROMPT) || 25, 35);
const RAG_TOP_K = Math.min(Number(process.env.RAG_TOP_K) || 12, 20);
const FEW_SHOT_WHEN_RAG = Math.min(Number(process.env.OPENAI_FEW_SHOT_WHEN_RAG) || 8, 15);

function useFinetunedModel() {
  const m = process.env.OPENAI_FINETUNED_MODEL;
  return m && m.trim().length > 0;
}

/** Remove Telegram export artifacts. Preserve newlines so messages don't stick together. */
function stripTelegramArtifacts(text) {
  if (!text || typeof text !== 'string') return text;
  let out = text
    .replace(/\s*In reply to this message\s*/gi, '\n')
    .replace(/\s*Reply to this message\s*/gi, '\n')
    .replace(/\s*Video file Not included[^.]*\.\s*/gi, '\n')
    .replace(/\s*Photo Not included[^.]*\.\s*/gi, '\n')
    .replace(/\s*Voice message Not included[^.]*\.\s*/gi, '\n')
    .replace(/\s*Audio file Not included[^.]*\.\s*/gi, '\n')
    .replace(/\s*Document Not included[^.]*\.\s*/gi, '\n')
    .replace(/\s*Sticker Not included[^.]*\.\s*/gi, '\n');
  out = out.replace(/[ \t]{2,}/g, ' ');
  return out.trim();
}

function buildMessages(persona, userMessage, history = [], ragChunks = []) {
  const messages = [];
  const useFt = useFinetunedModel();

  let systemContent = persona.systemPrompt;
  const personName = (persona.personName || '').toLowerCase();
  if (personName.includes('тимохин') || personName.includes('влад')) {
    systemContent += VLAD_CHARACTER_TRAITS;
  }
  if (!useFt && ragChunks.length > 0) {
    systemContent += `\n\nRelevant past dialogue (reply in this style):\n${ragChunks.join('\n\n')}`;
  }
  if (useFt) {
    systemContent += '\n\nFormat: Minimize short answers. Prefer at least 3 sentences (лучше от 3 предложений). Improvise in character; ladder style is optional. Never output "In reply to this message" or "Not included".';
  } else {
    systemContent += '\n\nFormat: Minimize short answers. Prefer at least 3 sentences per reply (лучше от 3 предложений). Improvise in character; ladder style is optional. Never include "In reply to this message" or "Not included".';
  }
  messages.push({ role: 'system', content: systemContent });

  if (!useFt) {
    const useRag = ragChunks.length > 0;
    const maxFewShot = useRag ? FEW_SHOT_WHEN_RAG : MAX_FEW_SHOT_IN_PROMPT;
    const pairsToUse = (persona.fewShotPairs || []).slice(0, maxFewShot);
    for (const pair of pairsToUse) {
      messages.push({ role: 'user', content: pair.user });
      messages.push({ role: 'assistant', content: pair.assistant });
    }
  }

  for (const h of history.slice(-12)) {
    messages.push({ role: h.role === 'bot' ? 'assistant' : 'user', content: h.text });
  }

  messages.push({ role: 'user', content: userMessage });
  return messages;
}

/**
 * Get a reply in the persona's style.
 * @param {string} userMessage - Current user message
 * @param {Array<{ role: 'user'|'bot', text: string }>} history - Recent conversation (optional)
 * @returns {Promise<string>} Assistant reply
 */
export async function getReply(userMessage, history = []) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  let ragChunks = [];
  if (!useFinetunedModel() && hasRagIndex()) {
    try {
      ragChunks = await retrieve(userMessage, RAG_TOP_K, apiKey);
    } catch (err) {
      console.error('RAG retrieve failed:', err.message);
    }
  }

  const persona = loadPersona();
  const messages = buildMessages(persona, userMessage, history, ragChunks);

  const model = useFinetunedModel()
    ? process.env.OPENAI_FINETUNED_MODEL.trim()
    : (process.env.OPENAI_MODEL || 'gpt-4o-mini');

  const useFt = useFinetunedModel();
  const maxTokens = useFt
    ? (Number(process.env.OPENAI_FINETUNED_MAX_TOKENS) || 600)
    : (Number(process.env.OPENAI_MAX_TOKENS) || 500);
  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: useFt ? (Number(process.env.OPENAI_FINETUNED_TEMPERATURE) || 0.95) : 0.9
  });

  let content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }
  content = content.trim();
  const personName = (cachedPersona && cachedPersona.personName) || '';
  if (personName) {
    const escaped = personName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(`^\\d{1,2}:\\d{2}\\s+${escaped}\\s*`, 'i'), '').trim() || content;
  }
  content = stripTelegramArtifacts(content);
  return content;
}
