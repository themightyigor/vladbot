import 'dotenv/config';
import { runBot } from './bot/index.js';

runBot().catch((err) => {
  console.error(err);
  process.exit(1);
});
