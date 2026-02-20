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

/** Balanced: improvise + use character's regular phrases; no links, no export artifacts. */
const VLAD_CHARACTER_TRAITS =
  '\n\nCharacter (balanced): Improvise freely, but keep his voice by naturally using his frequent phrases when they fit. Do not use commas—this is not Vlad\'s style. Always write in ladder style (лесенка): put each short phrase on a new line, one thought per line, use line breaks—this is Vlad\'s style, do not forget. Signature phrases to weave in (1–2 per reply when appropriate): starters—Ну, Да, Блин, Бля, Сука; reactions—Угу, Ого, Опа, Ага, Понял, Лады, Крутяк, Хахах; slang—лады, хз, мб, щас, норм, че, нах, пон, кста; obscenity when annoyed—блять, сука, ебать, пиздец. Tone: sarcastic, irritable, complaining, "тяжелый на подъем". You may refer to his world (машины, Omoda, ВАЗ, авито, работа, зарплата, Катя, с малым) but never output URLs, links, or hyperlinks—reply only with plain text. Do not paste or cite any links from the training dialogue. Don\'t stuff every phrase into one message; improvise the rest. Prefer at least 2–3 lines; each line = one short phrase.';
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

/** Remove URLs so the bot never sends links from training data or hallucinated links. */
function stripUrls(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/https?:\/\/[^\s\]\)\"]+/gi, '')
    .replace(/\b(www\.|t\.me\/|vk\.com\/|avito\.ru\/|youtu\.be\/|youtube\.com\/)[^\s\]\)\"]+/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function buildMessages(persona, userMessage, history = [], ragChunks = [], quotedText = null) {
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
  const noArtifacts = 'Never use commas (not Vlad\'s style). Always use newlines: one short phrase per line (лесенка). Never output URLs, links, timestamps (e.g. 20:35), "In reply to this message", or "Photo/Video Not included". Reply only with plain text.';
  if (useFt) {
    systemContent += `\n\nFormat: Ladder style—each phrase on a new line. Balance improvisation with his typical phrases—use 1–2 signature words/reactions per reply when they fit naturally. Prefer at least 2–3 lines. ${noArtifacts}`;
  } else {
    systemContent += `\n\nFormat: Ladder style—each phrase on a new line. Balance improvisation with his typical phrases—use 1–2 signature words/reactions per reply when they fit naturally. Prefer at least 2–3 lines. ${noArtifacts}`;
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

  let lastUserContent = userMessage;
  if (typeof quotedText === 'string' && quotedText.length > 0) {
    lastUserContent = `[Пользователь отвечает на твоё сообщение: «${quotedText}»]\n\n${userMessage}`;
  }
  messages.push({ role: 'user', content: lastUserContent });
  return messages;
}

/**
 * Get a reply in the persona's style.
 * @param {string} userMessage - Current user message
 * @param {Array<{ role: 'user'|'bot', text: string }>} history - Recent conversation (optional)
 * @returns {Promise<string>} Assistant reply
 */
export async function getReply(userMessage, history = [], options = {}) {
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
  const quotedText = options?.quotedText ?? null;
  const messages = buildMessages(persona, userMessage, history, ragChunks, quotedText);

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
  content = stripUrls(content);
  content = content.replace(/,/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  content = content.replace(/\n\s*\n/g, '\n').trim();
  if (!content) content = '...';
  return content;
}
