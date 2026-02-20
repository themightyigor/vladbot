/**
 * Load RAG index and retrieve top-k chunks by similarity to query.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DATA = path.join(process.cwd(), 'data');
const REL_DATA = path.join(__dirname, '../../data');
const RAG_INDEX_FILE = fs.existsSync(path.join(ROOT_DATA, 'rag-index.json'))
  ? path.join(ROOT_DATA, 'rag-index.json')
  : path.join(REL_DATA, 'rag-index.json');

let cachedIndex = null;

function loadIndex() {
  if (cachedIndex) return cachedIndex;
  if (!fs.existsSync(RAG_INDEX_FILE)) return null;
  cachedIndex = JSON.parse(fs.readFileSync(RAG_INDEX_FILE, 'utf8'));
  return cachedIndex;
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Retrieve top-k dialogue chunks most similar to the query.
 * @param {string} query - User message
 * @param {number} k - Number of chunks to return
 * @param {string} apiKey - OpenAI API key for embedding the query
 * @returns {Promise<string[]>} Array of "User: ...\nName: ..." strings
 */
export async function retrieve(query, k = 12, apiKey) {
  const index = loadIndex();
  if (!index || !index.chunks || index.chunks.length === 0) return [];

  if (!apiKey) return [];
  const openai = new OpenAI({ apiKey });
  const res = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    input: query
  });
  const queryEmbedding = res.data[0].embedding;

  const withScore = index.chunks.map((c) => ({
    text: c.text,
    score: cosineSimilarity(queryEmbedding, c.embedding)
  }));
  withScore.sort((a, b) => b.score - a.score);
  return withScore.slice(0, k).map((c) => c.text);
}

export function hasRagIndex() {
  return fs.existsSync(RAG_INDEX_FILE);
}
