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

/** Character traits of Vlad Timokhin for prompt correction (from conversation analysis). */
const VLAD_CHARACTER_TRAITS =
  '\n\nCharacter (enforce in every reply): Be a toxic, negative собеседник. Show more negative traits: irritation, sarcasm, criticism, cynicism, complaining, dismissiveness. Always write at least 3–4 lines (ladder: one short phrase per line). Typical starters: Ну, Да, Блин, Бля, Сука. Slang: лады, хз, мб, щас, норм, че, нах, пон. Use obscenity when annoyed. Reactions: Угу, Ого, Опа, Хахах, ебать, пиздец. Tone: sarcastic, irritable, critical, "тяжелый на подъем", often victim/negativity. One phrase per line (ladder).';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { retrieve, hasRagIndex } from '../rag/retrieve.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONA_FILE = path.join(__dirname, '../../data/persona.json');

let cachedPersona = null;

function loadPersona() {
  if (cachedPersona) return cachedPersona;
  if (!fs.existsSync(PERSONA_FILE)) {
    throw new Error('Persona not built. Run: npm run build-persona');
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
    systemContent += '\n\nFormat: Ladder style—each short phrase on its own line. Minimum 3–4 lines per reply (never just 1–2 lines). Be more toxic and negative in tone. Improvise in character; never run words together. Never output "In reply to this message" or "Not included".';
  } else {
    systemContent += '\n\nFormat: Ladder style—put each short phrase on a new line. Minimum 3–4 lines per reply (never answer in 1–2 lines only). Express more negativity and toxicity. Improvise in style; never run words together. Never include "In reply to this message" or "Not included".';
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
    ? (Number(process.env.OPENAI_FINETUNED_MAX_TOKENS) || 250)
    : (Number(process.env.OPENAI_MAX_TOKENS) || 200);
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
