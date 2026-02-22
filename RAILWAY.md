# Deploy vladbot on Railway

## 0. Before deploy: commit `data/persona.json`

The bot needs `data/persona.json` at runtime. It is **not** in `.gitignore` (only other files in `data/` are ignored).

- If you already have `data/persona.json` locally (after `npm run build-persona`), commit it:
  ```bash
  git add data/persona.json
  git commit -m "Add persona for deploy"
  ```
- Without it, the bot will exit on start with: `Persona not built. Run: npm run build-persona`.

**RAG** (`data/rag-index.json`) is optional. If missing, the bot runs without RAG (no retrieval). To use RAG on Railway, build it locally (`npm run build-rag`) and either commit `data/rag-index.json` (if the repo allows it; it can be large) or use another deploy path (e.g. VPS with uploaded `data/`).

## 1. Create project on Railway

1. Go to [railway.app](https://railway.app) and sign in (e.g. with GitHub).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select your repo (e.g. **themightyigor/vladbot**).
4. Railway will detect the Node app and use `npm install` + start from `railway.json` (`npm start`).

## 2. Set environment variables

In your Railway service → **Variables** tab, add:

| Variable | Required | Notes |
|----------|----------|--------|
| `BOT_TOKEN` | **Yes** | From @BotFather |
| `OPENAI_API_KEY` | **Yes** | From OpenAI |
| `PERSON_NAME` | No | Display name (e.g. Владислав Тимохин); used if you rebuild persona |
| `PERSONA_BIO` | No | Optional facts (for build-persona only) |
| `PERSONA_TRAITS` | No | Optional traits (for build-persona only) |
| `OPENAI_MODEL` | No | Default: `gpt-4o-mini` |
| `OPENAI_VISION_MODEL` | No | For photos/stickers; default: `gpt-4o-mini` |
| `OPENAI_EMBEDDING_MODEL` | No | For RAG; default: `text-embedding-3-small` |
| `RAG_TOP_K` | No | Default: 15 |
| `OPENAI_FINETUNED_MODEL` | No | Only if you use a fine-tuned model |
| Others | No | See `.env.example` |

You can paste from `.env` via **Add variables** → **Raw editor** (do not commit `.env`).

## 3. Deploy

- Railway builds and deploys on every push to the connected branch.
- **Start command** is set in `railway.json`: `npm start` → `node src/index.js`.
- The bot runs long polling; on failure Railway restarts it (see `restartPolicyType` in `railway.json`).

## 4. Check logs

In Railway: your service → **Deployments** → latest → **View logs**. You should see:

- `Persona loaded: Владислав Тимохин` (or your person name)
- `RAG index: yes` or `RAG index: no (optional)`
- `Bot is running (long polling). Username: @YourBot`

If you see `BOT_TOKEN is not set` or `OPENAI_API_KEY is not set`, add them in **Variables**. If you see `Persona not built`, commit `data/persona.json` (see step 0).

## Note on `data/`

- **persona.json** is the only file from `data/` that is committed by default (see `.gitignore`: `data/*` and `!data/persona.json`).
- **rag-index.json** is not committed (often large). The bot works without it; RAG is optional.
- For full control and no Git usage for data, use a VPS and upload the whole `data/` folder (see `DEPLOY.md`).
