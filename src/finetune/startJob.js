/**
 * Uploads data/training.jsonl and starts an OpenAI fine-tuning job.
 * Run after: npm run prepare-finetune.
 * When the job completes, set OPENAI_FINETUNED_MODEL in .env to the returned model name.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRAINING_FILE = path.join(__dirname, '../../data/training.jsonl');

const BASE_MODEL = process.env.OPENAI_FINE_TUNE_BASE_MODEL || 'gpt-4o-mini-2024-07-18';

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not set');
    process.exit(1);
  }

  if (!fs.existsSync(TRAINING_FILE)) {
    console.error('Run npm run prepare-finetune first. Missing:', TRAINING_FILE);
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });
  console.log('Uploading training file...');
  const file = await openai.files.create({
    file: fs.createReadStream(TRAINING_FILE),
    purpose: 'fine-tune'
  });
  console.log('File ID:', file.id);

  console.log('Starting fine-tuning job (base model: %s)...', BASE_MODEL);
  const job = await openai.fineTuning.jobs.create({
    model: BASE_MODEL,
    training_file: file.id
  });

  console.log('');
  console.log('Job ID:', job.id);
  console.log('Status:', job.status);
  console.log('');
  console.log('Check status: https://platform.openai.com/fine-tuning');
  console.log('When status is "succeeded", copy the model name (e.g. ft:gpt-4.1-mini:org:...)');
  console.log('and set in .env: OPENAI_FINETUNED_MODEL=<that-model-name>');
  console.log('Then restart the bot.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
