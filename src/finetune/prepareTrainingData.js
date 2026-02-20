/**
 * Prepares fine-tuning data: conversation.json -> data/training.jsonl.
 * Each line: {"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}.
 * Run after: npm run parse, npm run build-persona.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const CONVERSATION_FILE = path.join(DATA_DIR, 'conversation.json');
const PERSONA_FILE = path.join(DATA_DIR, 'persona.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'training.jsonl');

const MAX_EXAMPLES = Math.min(Number(process.env.FINETUNE_MAX_EXAMPLES) || 5000, 10000);
const MAX_USER_TOKENS = 800;
const MAX_ASSISTANT_TOKENS = 400;

function getText(obj) {
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map((e) => (typeof e === 'string' ? e : e?.text || '')).join('');
  return obj?.text || '';
}

function stripTimeAndName(text, personName) {
  if (!text || typeof text !== 'string') return text;
  const escaped = personName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`^\\d{1,2}:\\d{2}\\s+${escaped}\\s*`, 'i'), '').trim() || text;
}

function roughTokenCount(str) {
  return Math.ceil((str || '').length / 3);
}

function trimToTokens(str, maxTokens) {
  if (roughTokenCount(str) <= maxTokens) return str;
  const approx = maxTokens * 3;
  return str.slice(0, approx).trim();
}

function buildExamples(messages, personName, systemPrompt) {
  const examples = [];
  for (let i = 0; i < messages.length - 1 && examples.length < MAX_EXAMPLES; i++) {
    const curr = messages[i];
    const next = messages[i + 1];
    if (next.author !== personName) continue;
    const userText = (typeof curr.text === 'string' ? curr.text : getText(curr.text)).trim();
    let assistantText = (typeof next.text === 'string' ? next.text : getText(next.text)).trim();
    assistantText = stripTimeAndName(assistantText, personName);
    if (!userText || !assistantText) continue;
    if (userText.length > 2000 || assistantText.length > 1500) continue;
    const userTrimmed = trimToTokens(userText, MAX_USER_TOKENS);
    const assistantTrimmed = trimToTokens(assistantText, MAX_ASSISTANT_TOKENS);
    examples.push({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userTrimmed },
        { role: 'assistant', content: assistantTrimmed }
      ]
    });
  }
  return examples;
}

function main() {
  if (!fs.existsSync(CONVERSATION_FILE)) {
    console.error('Run npm run parse first. Missing:', CONVERSATION_FILE);
    process.exit(1);
  }

  let personName = process.env.PERSON_NAME || 'Vlad';
  let systemPrompt = `You are ${personName} in a Telegram chat. Reply as this person. Reply with only the message text, no timestamp or name. Use newlines instead of periods. Stay in character.`;
  if (fs.existsSync(PERSONA_FILE)) {
    const persona = JSON.parse(fs.readFileSync(PERSONA_FILE, 'utf8'));
    personName = persona.personName || personName;
    if (persona.systemPrompt) {
      const short = persona.systemPrompt.slice(0, 600);
      systemPrompt = short + (persona.systemPrompt.length > 600 ? '...' : '');
    }
  }

  const messages = JSON.parse(fs.readFileSync(CONVERSATION_FILE, 'utf8'));
  const examples = buildExamples(messages, personName, systemPrompt);

  if (examples.length < 10) {
    console.error('Need at least 10 training examples. Got', examples.length);
    process.exit(1);
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const lines = examples.map((ex) => JSON.stringify(ex));
  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf8');

  const approxTokens = examples.reduce((acc, ex) => {
    return acc + ex.messages.reduce((a, m) => a + roughTokenCount(m.content), 0);
  }, 0);
  console.log(`Wrote ${examples.length} examples to ${OUTPUT_FILE}`);
  console.log(`Approx. ${approxTokens} tokens. Run: npm run start-finetune-job`);
}

main();
