/**
 * OpenAI-based reply in the persona's style.
 * Uses system prompt + RAG (if built) + few-shot examples + conversation history.
 * Vlad: tease interlocutor, dark humor, heavy swearing, politics in every reply.
 * Less work/salary whining. User-specific: p0_jl (сво), ainiy09 (Zемский, сытый).
 */

import OpenAI from 'openai';

const VLAD_CHARACTER_TRAITS =
  '\n\nCharacter (balanced): Vlad teases and needles the interlocutor but does not go overboard—balance between roasts and normal chat; not every message should be pure insult. Use dark humor and swear naturally (блять, сука, ебать, пиздец, нахуй, похуй, заебись) when it fits. Regularly provoke or nudge the conversation toward Russia–Ukraine (вторжение, война, орки, ватники, мобики, сво, завод, реальность)—weave in politics without turning every reply into a lecture. Do NOT constantly whine about work or salary. Write in ladder style (лесенка): one short phrase per line, no commas. Typical phrases: Ну, Да, Бля, Сука; Угу, Ого, Опа, Ага, Понял, Лады, Крутяк; хз, мб, щас, норм, че, нах, пон, кста; Разъеб, Пиздеж, База, Пф, Мм, Эээ. Never output URLs or links. Reply only in plain text. At least 2–3 lines per message.';

/** Phrases and words Vlad often uses in political/conflict replies (Russia–Ukraine, factory, reality). Use when provoking or in conflict. */
const VLAD_CONFLICT_PHRASES =
  '\n\nIn political or conflict replies use naturally (do not paste verbatim): орки, ватники, мобики, сво (уехавшие), завод/заводы, зона войны, жить не в России, до всех орков дойдёт, Украину обвинят, хоть не с нацистами, завод героически сбил параплан, дожить бы до 40, непонятные люди с зп десятерых россиян, этот орк жив ещё, политически активный, развалили завод, в России массово, реальность vs ожидание.';

/** When replying to Nikita: third-person + irony/dismissiveness; call him "zемский"; подколы про ниву и мурка. */
const NIKITA_STYLE =
  '\n\nWith this interlocutor (Nikita): Reply in third person about him—irony and slight dismissiveness. Call him "zемский" (not "ты" or "Никита"). Example: "zемский опять не признаёт", "этот ничего не признает". Remind him naturally that he is сытый and у него изимод по жизни. Tease him about the endless preparation for buying a Niva (готовится к покупке нивы, тяжёлая покупка нивы) and that he watches a lot of murk/murka (насмотрелся мурка, много смотрит мурка). Stay in ladder style.';

/** When replying to Rostic\'s Love (p0_jl): condescending-ironic; provoke conflicts about Russia\'s invasion of Ukraine when relevant. */
const ROSTIC_STYLE =
  '\n\nWith this interlocutor (Rostic\'s Love): Reply in a condescending-ironic tone (снисходительно-иронично). Tease that he "не шарит", can reference пояснительную бригаду, тяжёлая покупка нивы. When the topic allows, provoke or needle him into conflict over Russia\'s invasion of Ukraine (вторжение России на Украину)—stay in character, no lectures, just needling and provocation in Vlad\'s voice. Ladder style.';

/** When replying to @Vasyachaika: references to his weight, his mom being fat, suggest Obolon beer, call him торч sometimes; if argument is stuck say at least won\'t die at 40. */
const VASYACHAIKA_STYLE =
  '\n\nWith this interlocutor (@Vasyachaika): Reply with context for him. Make references to his excess weight (лишний вес). Call his mom fat (мама толстая). Suggest to have Obolon beer (накатать оболонь). Sometimes call him торч. If the argument reaches a dead end, say something like "хотя бы не сдохну в 40" (at least I won\'t die at 40). Stay in ladder style, Vlad\'s tone.';

/** When replying to @irbzv (Игорь): he\'s айтишник, сытый; "у айтишников все просто"; suggest raf on coconut (раф на кокосовом). */
const IGOR_STYLE =
  '\n\nWith this interlocutor (@irbzv, Игорь): Make references to him being айтишник (IT guy) and сытый (well-off). Use the phrase "у айтишников все просто" when it fits. Suggest he have a raf on coconut (предложи выпить раф на кокосовом, раф на кокосовом). Stay in ladder style, Vlad\'s tone.';

/** When replying to @adtrety (Андрей): remind him he наебывает бабок в втб (works at VTB, "обманывает бабулек" / screws over grannies at VTB). */
const ANDREY_STYLE =
  '\n\nWith this interlocutor (@adtrety, Андрей): Remind him that he наебывает бабок в втб (работает в ВТБ, обманывает бабулек/пенсионеров в ВТБ—подкалывай про это). Use naturally, ladder style, Vlad\'s tone.';

/**
 * Aliases for interlocutors Vlad has a special style for.
 * Keys: nikita, rostic, vasyachaika, igor, andrey. Values: TG username (no @) or display-name parts.
 * Add more aliases here so the bot recognizes the same person by different nicks.
 */
const INTERLOCUTOR_ALIASES = {
  nikita: ['ainiy09', 'nikita', 'никита', 'никит'],
  rostic: ['p0_jl', 'rostic', 'rostics', 'rostics love', 'ростик'],
  vasyachaika: ['vasyachaika', 'васячайка', 'васячайк', 'вася'],
  igor: ['irbzv', 'igor', 'игорь', 'игор'],
  andrey: ['adtrety', 'andrey', 'андрей', 'андрей']
};

/** Resolve Telegram username or display name to a style key (nikita | rostic | vasyachaika | igor | andrey) or null. */
function resolveInterlocutorStyle(telegramUsername, displayName) {
  const u = (telegramUsername || '').trim().toLowerCase().replace(/^@/, '');
  const n = (displayName || '').trim().toLowerCase();
  for (const [style, aliases] of Object.entries(INTERLOCUTOR_ALIASES)) {
    for (const alias of aliases) {
      const a = alias.toLowerCase();
      if (u === a || n === a || n.includes(a) || (a.length >= 3 && u.includes(a))) return style;
    }
  }
  return null;
}

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

const MAX_FEW_SHOT_IN_PROMPT = Math.min(Number(process.env.OPENAI_FEW_SHOT_IN_PROMPT) || 32, 45);
const RAG_TOP_K = Math.min(Number(process.env.RAG_TOP_K) || 15, 25);
const FEW_SHOT_WHEN_RAG = Math.min(Number(process.env.OPENAI_FEW_SHOT_WHEN_RAG) || 10, 18);

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

function buildMessages(persona, userMessage, history = [], ragChunks = [], options = {}) {
  const messages = [];
  const useFt = useFinetunedModel();
  const quotedText = options.quotedText ?? null;
  const username = (options.username || '').trim().toLowerCase();
  const interlocutorName = options.interlocutorName ?? null;
  const mentionedUsers = options.mentionedUsers && Array.isArray(options.mentionedUsers) ? options.mentionedUsers : [];
  const prefix = interlocutorName && interlocutorName.trim() ? (interlocutorName.trim() + ': ') : '';

  let systemContent = persona.systemPrompt;
  const personName = (persona.personName || '').toLowerCase();
  const styleKey = resolveInterlocutorStyle(username, interlocutorName || '');
  if (personName.includes('тимохин') || personName.includes('влад')) {
    systemContent += VLAD_CHARACTER_TRAITS;
    systemContent += VLAD_CONFLICT_PHRASES;
    if (styleKey === 'nikita') {
      systemContent += '\n\nInterlocutor: Zемский (@ainiy09). Always call him Zемский. He is сытый (well-off).';
      systemContent += NIKITA_STYLE;
    } else if (styleKey === 'rostic') {
      systemContent += '\n\nInterlocutor: @p0_jl. He пиздовал на сво (уехал за бугор). Tease him about having left, про сво.';
      systemContent += ROSTIC_STYLE;
    } else if (styleKey === 'vasyachaika') {
      systemContent += VASYACHAIKA_STYLE;
    } else if (styleKey === 'igor') {
      systemContent += IGOR_STYLE;
    } else if (styleKey === 'andrey') {
      systemContent += ANDREY_STYLE;
    }
  }
  if (prefix) {
    systemContent += `\n\nCurrent interlocutor: ${interlocutorName.trim()}. Adjust tone and style to how you usually reply to this person.`;
  }
  if (mentionedUsers.length > 0) {
    const list = mentionedUsers.join(', ');
    systemContent += `\n\nIn the message the user mentioned (nickname/link): ${list}. Include a short reference or nod to the mentioned person(s) in your reply—подкол, отсылка, обращение к ним.`;
  }
  if (!useFt && ragChunks.length > 0) {
    systemContent += `\n\nRelevant past dialogue (reply in this style):\n${ragChunks.join('\n\n')}`;
  }
  if (!useFt && persona.styleSamples && persona.styleSamples.length > 40) {
    const extra = persona.styleSamples.slice(40, 70).map((s) => `- ${s}`).join('\n');
    if (extra) systemContent += `\n\nMore example phrases (match this style):\n${extra}`;
  }
  const noArtifacts = 'Never use commas (not Vlad\'s style). Always use newlines: one short phrase per line (лесенка). Never output URLs, links, timestamps (e.g. 20:35), "In reply to this message", or "Photo/Video Not included". Reply only with plain text.';
  if (useFt) {
    systemContent += `\n\nLength (strict): Every reply MUST be 3–6 lines (лесенка). One-word or one-line answers (Да, Ну, Пф, Хех, Красота, Топ) are FORBIDDEN. Expand, tease, add reactions, improvise—never be dry or laconic. Format: ladder style, each phrase on a new line. ${noArtifacts}`;
  } else {
    systemContent += `\n\nFormat: Ladder style—each phrase on a new line. Balance improvisation with his typical phrases—use 1–2 signature words/reactions per reply when they fit naturally. Prefer at least 2–3 lines. ${noArtifacts}`;
  }
  messages.push({ role: 'system', content: systemContent });

  const useRag = ragChunks.length > 0;
  const maxFewShot = useFt
    ? Math.min(Number(process.env.OPENAI_FINETUNED_FEW_SHOT) || 8, 12)
    : useRag ? FEW_SHOT_WHEN_RAG : MAX_FEW_SHOT_IN_PROMPT;
  let pairsToUse = persona.fewShotPairs || [];
  if (useFt && pairsToUse.length > maxFewShot) {
    const withLength = pairsToUse.map((p) => ({ ...p, _lines: (p.assistant || '').split(/\n/).length }));
    pairsToUse = withLength
      .filter((p) => p._lines >= 2)
      .sort((a, b) => b._lines - a._lines)
      .slice(0, maxFewShot)
      .map(({ user, assistant }) => ({ user, assistant }));
    if (pairsToUse.length < maxFewShot) {
      pairsToUse = (persona.fewShotPairs || []).slice(0, maxFewShot);
    }
  } else {
    pairsToUse = pairsToUse.slice(0, maxFewShot);
  }
  if (pairsToUse.length > 0) {
    for (const pair of pairsToUse) {
      messages.push({ role: 'user', content: pair.user });
      messages.push({ role: 'assistant', content: pair.assistant });
    }
  }

  for (const h of history.slice(-12)) {
    const content = h.role === 'user' && prefix ? prefix + h.text : h.text;
    messages.push({ role: h.role === 'bot' ? 'assistant' : 'user', content });
  }

  let lastUserContent = userMessage;
  if (typeof quotedText === 'string' && quotedText.length > 0) {
    lastUserContent = `[Пользователь отвечает на твоё сообщение: «${quotedText}»]\n\n${userMessage}`;
  }
  if (prefix) lastUserContent = prefix + lastUserContent;
  const imageBuffer = options.imageBuffer;
  const imageMimeType = options.imageMimeType || 'image/jpeg';
  if (imageBuffer && Buffer.isBuffer(imageBuffer)) {
    const b64 = imageBuffer.toString('base64');
    const dataUrl = `data:${imageMimeType};base64,${b64}`;
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: lastUserContent },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]
    });
  } else {
    messages.push({ role: 'user', content: lastUserContent });
  }
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
  const hasImage = options?.imageBuffer && Buffer.isBuffer(options.imageBuffer);
  const messages = buildMessages(persona, userMessage, history, ragChunks, {
    quotedText: options?.quotedText ?? null,
    username: options?.username ?? '',
    interlocutorName: options?.interlocutorName ?? null,
    imageBuffer: options?.imageBuffer,
    imageMimeType: options?.imageMimeType
  });

  const model = hasImage
    ? (process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini')
    : useFinetunedModel()
      ? process.env.OPENAI_FINETUNED_MODEL.trim()
      : (process.env.OPENAI_MODEL || 'gpt-5-mini');

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
