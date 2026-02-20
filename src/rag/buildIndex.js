/**
 * Build RAG index: embed (other -> person) dialogue pairs, save to data/rag-index.json.
 * Run after: npm run parse, npm run build-persona.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const CONVERSATION_FILE = path.join(DATA_DIR, 'conversation.json');
const PERSONA_FILE = path.join(DATA_DIR, 'persona.json');
const RAG_INDEX_FILE = path.join(DATA_DIR, 'rag-index.json');
const BATCH_SIZE = 100;
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

function stripTimeAndName(text, personName) {
  if (!text || typeof text !== 'string') return text;
  const escaped = personName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`^\\d{1,2}:\\d{2}\\s+${escaped}\\s*`, 'i'), '').trim() || text;
}

function getText(obj) {
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map((e) => (typeof e === 'string' ? e : e?.text || '')).join('');
  return obj?.text || '';
}

function buildChunks(messages, personName) {
  const chunks = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const curr = messages[i];
    const next = messages[i + 1];
    if (next.author !== personName) continue;
    const userText = (typeof curr.text === 'string' ? curr.text : getText(curr.text)).trim();
    let vladText = (typeof next.text === 'string' ? next.text : getText(next.text)).trim();
    vladText = stripTimeAndName(vladText, personName);
    if (!userText || !vladText) continue;
    if (userText.length > 600 || vladText.length > 600) continue;
    chunks.push({
      userText,
      text: `User: ${userText}\n${personName}: ${vladText}`
    });
  }
  return chunks;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not set');
    process.exit(1);
  }

  if (!fs.existsSync(CONVERSATION_FILE)) {
    console.error('Run npm run parse first. Missing:', CONVERSATION_FILE);
    process.exit(1);
  }

  let personName = process.env.PERSON_NAME || 'Vlad';
  if (fs.existsSync(PERSONA_FILE)) {
    const persona = JSON.parse(fs.readFileSync(PERSONA_FILE, 'utf8'));
    personName = persona.personName || personName;
  }

  const messages = JSON.parse(fs.readFileSync(CONVERSATION_FILE, 'utf8'));
  const chunks = buildChunks(messages, personName);
  console.log(`Built ${chunks.length} dialogue chunks for "${personName}". Embedding...`);

  const openai = new OpenAI({ apiKey });
  const index = { personName, chunks: [] };

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((c) => c.userText);
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: inputs
    });
    const ordered = res.data.sort((a, b) => a.index - b.index);
    for (let j = 0; j < batch.length; j++) {
      index.chunks.push({
        embedding: ordered[j].embedding,
        text: batch[j].text
      });
    }
    process.stdout.write(`\r${Math.min(i + BATCH_SIZE, chunks.length)} / ${chunks.length}`);
  }
  console.log('');

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(RAG_INDEX_FILE, JSON.stringify(index), 'utf8');
  console.log(`RAG index saved to ${RAG_INDEX_FILE} (${index.chunks.length} chunks).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
