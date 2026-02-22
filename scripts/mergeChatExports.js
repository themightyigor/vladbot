/**
 * Copies all .html from each ChatExport_* folder under data/exports into data/export,
 * prefixing filenames to avoid collisions (e.g. old_messages.html, new_messages.html).
 * Run from repo root: node scripts/mergeChatExports.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const EXPORTS_DIR = path.join(ROOT, 'data', 'exports');
const MERGE_DIR = path.join(ROOT, 'data', 'export');

const EXPORT_PREFIXES = [
  { dir: 'ChatExport_2026-02-20', prefix: 'old_' },
  { dir: 'ChatExport_2026-02-21', prefix: 'new_' }
];

function main() {
  if (!fs.existsSync(EXPORTS_DIR)) {
    console.error('Missing:', EXPORTS_DIR);
    process.exit(1);
  }

  if (!fs.existsSync(MERGE_DIR)) {
    fs.mkdirSync(MERGE_DIR, { recursive: true });
  }

  let total = 0;
  for (const { dir, prefix } of EXPORT_PREFIXES) {
    const srcDir = path.join(EXPORTS_DIR, dir);
    if (!fs.existsSync(srcDir)) {
      console.warn('Skip (not found):', srcDir);
      continue;
    }
    const files = fs.readdirSync(srcDir)
      .filter((f) => f.toLowerCase().endsWith('.html'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const f of files) {
      const src = path.join(srcDir, f);
      const dest = path.join(MERGE_DIR, prefix + f);
      fs.copyFileSync(src, dest);
      total++;
      console.log(prefix + f);
    }
  }

  console.log('\nTotal:', total, 'files in', MERGE_DIR);
  console.log('Set in .env: EXPORT_HTML_PATH=./data/export');
  console.log('Then run: npm run parse');
}

main();
