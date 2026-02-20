# Vladbot

Telegram bot that learns a person’s style from an exported chat (HTML) and replies using OpenAI in that person’s manner.

## Stack

- **Node.js** (ES modules)
- **Telegraf** – Telegram Bot API
- **OpenAI** – GPT for replies in character
- **Cheerio** – parse Telegram HTML export

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set:

   - `BOT_TOKEN` – from [@BotFather](https://t.me/BotFather) (`/newbot`)
   - `OPENAI_API_KEY` – from [OpenAI API keys](https://platform.openai.com/api-keys)
   - `PERSON_NAME` – exact display name of the person to mimic (as in the exported chat)
   - `EXPORT_HTML_PATH` – (optional) path to your `messages.html`; default is `./data/messages.html`

3. **Export from Telegram**

   In Telegram Desktop (or app that exports HTML): export the chat with the person you want to mimic. Save the HTML file (often named `messages.html`).

4. **Put the export(s) in the project**

   - **Single file:** Create a `data` folder and put your export as `data/messages.html`, or set `EXPORT_HTML_PATH` in `.env` to its path.
   - **Multiple files:** Put all HTML files in one folder and set `EXPORT_HTML_PATH=./data/exports`, or list paths separated by commas: `EXPORT_HTML_PATH=./data/chat1.html,./data/chat2.html`.

5. **Parse the HTML**

   ```bash
   npm run parse
   ```

   This reads the HTML and writes `data/conversation.json` (list of `{ author, text, date }`). If parsing fails, your HTML structure may differ; you can adapt the selectors in `src/parser/parseExport.js` (e.g. `.message`, `.from_name`, `.text`).

6. **Build the persona**

   ```bash
   npm run build-persona
   ```

   Uses `PERSON_NAME` to pick that person’s messages from `data/conversation.json`, builds a system prompt and few-shot examples, and saves `data/persona.json`.

7. **Build RAG index (optional, recommended)**

   ```bash
   npm run build-rag
   ```

   Embeds dialogue pairs from the conversation and saves `data/rag-index.json`. When the bot replies, it fetches ~12 similar past dialogues and adds them to the prompt. Uses OpenAI embeddings (small one-time cost).

8. **Run the bot**

   ```bash
   npm start
   ```

   Users can message the bot; it will reply in the learned style via OpenAI.

To run the bot 24/7 without your PC (deploy to a server), see **[DEPLOY.md](DEPLOY.md)**.

## Scripts

| Script            | Description                                  |
|-------------------|----------------------------------------------|
| `npm run parse`   | Parse Telegram HTML export → `conversation.json` |
| `npm run build-persona` | Build persona from conversation → `persona.json` |
| `npm run build-rag` | Build RAG index from conversation → `rag-index.json` (optional) |
| `npm run prepare-finetune` | Build `training.jsonl` for fine-tuning (optional) |
| `npm run start-finetune-job` | Upload file and start OpenAI fine-tuning job (optional) |
| `npm start` / `npm run bot` | Start the Telegram bot (long polling)   |

## Fine-tuning (optional)

To use a fine-tuned model instead of base model + RAG/few-shot:

1. `npm run prepare-finetune` — builds `data/training.jsonl` from your conversation (up to 5000 pairs; set `FINETUNE_MAX_EXAMPLES` to change).
2. `npm run start-finetune-job` — uploads the file and starts a fine-tuning job on OpenAI (base model: `gpt-4o-mini-2024-07-18` by default; set `OPENAI_FINE_TUNE_BASE_MODEL` to use another fine-tunable model).
3. Wait until the job succeeds in the [OpenAI Fine-tuning dashboard](https://platform.openai.com/fine-tuning), then copy the model name (e.g. `ft:gpt-4o-mini-2024-07-18:org:...`).
4. In `.env` set `OPENAI_FINETUNED_MODEL=<that-model-name>` and restart the bot. The bot will use the fine-tuned model and skip RAG and few-shot examples.

Training and inference costs depend on the base model; see [OpenAI pricing](https://openai.com/api/pricing).

## Optional

- **OpenAI model:** set `OPENAI_MODEL` in `.env` (default: `gpt-4o-mini`). Ignored when `OPENAI_FINETUNED_MODEL` is set.
- **Parser input:** set `EXPORT_HTML_PATH` if your HTML file is not at `./data/messages.html`.

## Data layout

- `data/messages.html` – your Telegram HTML export (you add this).
- `data/conversation.json` – parsed messages (created by `npm run parse`).
- `data/persona.json` – system prompt + few-shot examples (created by `npm run build-persona`).
- `data/rag-index.json` – RAG index (created by `npm run build-rag`). Optional; if present, replies use similar past dialogues.
- `data/training.jsonl` – fine-tuning data (created by `npm run prepare-finetune`). Optional.

Don’t commit `data/` or `.env` if the chat is private; add them to `.gitignore`.
