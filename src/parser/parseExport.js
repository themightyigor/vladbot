/**
 * Parses Telegram HTML export (messages.html) into structured conversation JSON.
 * Handles common export structures; adapt selectors in parseMessages() if your export differs.
 */

import './polyfillReadableStream.js';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DEFAULT_INPUT = path.join(DATA_DIR, 'messages.html');
const OUTPUT_FILE = path.join(DATA_DIR, 'conversation.json');

function normalizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract plain text from a Cheerio element (strips HTML, preserves line breaks as space).
 */
function getText($el) {
  if (!$el || $el.length === 0) return '';
  return normalizeText($el.text());
}

/**
 * Try multiple possible HTML structures used in Telegram HTML exports.
 * Returns array of { author, text, date }.
 */
function parseMessages($) {
  const entries = [];
  const seen = new Set();

  // Common patterns: message in div with class "message" or "body" / "default"
  const messageBlocks = $('.message, div[class*="message"]').toArray();

  for (const block of messageBlocks) {
    const $block = $(block);

    // Author: .from_name, .author, or first strong/bold element
    const author =
      getText($block.find('.from_name').first()) ||
      getText($block.find('.author').first()) ||
      getText($block.find('strong').first()) ||
      getText($block.find('.pull_left').first()) ||
      '';

    // Skip empty or service messages
    const textEl = $block.find('.text, .body, [class*="text"]').not('.pull_right').first();
    let text = getText(textEl.length ? textEl : $block);
    if (!text && !author) continue;

    // If no dedicated text node, take the main content excluding date/author
    if (!text) {
      const $body = $block.find('.body').length ? $block.find('.body') : $block;
      $body.find('.from_name, .author, .pull_right, strong').remove();
      text = getText($body);
    }

    // Date (optional)
    const date =
      $block.find('.date').attr('title') ||
      getText($block.find('.pull_right').first()) ||
      '';

    const key = `${author}|${text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push({
      author: author.trim() || 'Unknown',
      text: text.trim(),
      date: date.trim() || undefined
    });
  }

  // Fallback: if no .message blocks, try any div that looks like "author: text"
  if (entries.length === 0) {
    $('div').each((_, el) => {
      const $el = $(el);
      const text = getText($el);
      if (text.length < 2 || text.length > 5000) return;
      const strong = $el.find('strong').first();
      if (strong.length) {
        const author = getText(strong);
        const msgText = getText($el.clone().find('strong').remove().end());
        if (author && msgText) {
          entries.push({ author, text: msgText });
        }
      }
    });
  }

  return entries;
}

/**
 * Resolve EXPORT_HTML_PATH to a list of absolute file paths.
 * - Single file: that file
 * - Comma-separated paths: each path trimmed
 * - Directory: all .html files inside it (one level)
 */
function resolveInputPaths() {
  const raw = process.env.EXPORT_HTML_PATH || DEFAULT_INPUT;
  const cwd = process.cwd();

  const resolveOne = (p) => {
    const trimmed = p.trim();
    return path.isAbsolute(trimmed) ? trimmed : path.join(cwd, trimmed);
  };

  if (raw.includes(',')) {
    return raw.split(',').map((p) => resolveOne(p));
  }

  const resolved = resolveOne(raw);
  const stat = fs.existsSync(resolved) && fs.statSync(resolved);

  if (stat?.isDirectory()) {
    const files = fs.readdirSync(resolved)
      .filter((f) => f.toLowerCase().endsWith('.html'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return files.map((f) => path.join(resolved, f));
  }

  return [resolved];
}

function main() {
  const paths = resolveInputPaths();
  const missing = paths.filter((p) => !fs.existsSync(p));

  if (missing.length > 0) {
    console.error('File(s) not found:', missing.join(', '));
    console.error('Set EXPORT_HTML_PATH to a file, a folder, or comma-separated paths.');
    process.exit(1);
  }

  const allMessages = [];
  for (const filePath of paths) {
    const html = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(html, { decodeEntities: true });
    const messages = parseMessages($);
    allMessages.push(...messages.map((m) => ({ ...m, _source: path.basename(filePath) })));
  }

  const messages = allMessages
    .sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return String(a.date).localeCompare(String(b.date));
    })
    .map(({ _source, ...m }) => m);

  if (messages.length === 0) {
    console.error('No messages parsed from any file. Your HTML structure may differ.');
    console.error('Adapt selectors in src/parser/parseExport.js (e.g. .message, .from_name, .text).');
    process.exit(1);
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(messages, null, 2), 'utf8');
  const authors = [...new Set(messages.map((m) => m.author))];
  console.log(`Parsed ${messages.length} messages from ${paths.length} file(s): ${paths.map((p) => path.basename(p)).join(', ')}`);
  console.log(`Authors found: ${authors.join(', ')}`);
  console.log(`Saved to ${OUTPUT_FILE}`);
}

main();
