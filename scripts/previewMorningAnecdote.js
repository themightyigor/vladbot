/**
 * One-off: вызвать ту же генерацию, что и утренний крон, и напечатать текст в консоль.
 * Нужны: OPENAI_API_KEY, собранный data/persona.json (npm run build-persona).
 */
import 'dotenv/config';
import { generateMorningAnecdote } from '../src/bot/morningMessage.js';

try {
  const text = await generateMorningAnecdote();
  console.log('\n--- мини-анекдот (как в чат) ---\n');
  console.log(text?.trim() || '(пусто)');
  console.log('\n--- конец ---\n');
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
