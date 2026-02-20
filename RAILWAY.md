# Deploy vladbot on Railway

## 1. Create project on Railway

1. Go to [railway.app](https://railway.app) and sign in (e.g. with GitHub).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select **themightyigor/vladbot** (or your repo).
4. Railway will detect the Node app and use `npm install` + `npm start` from `railway.json`.

## 2. Set environment variables

In your Railway service → **Variables** tab, add the same variables as in your `.env`:

| Variable | Required | Notes |
|----------|----------|--------|
| `BOT_TOKEN` | Yes | From @BotFather |
| `OPENAI_API_KEY` | Yes | From OpenAI |
| `PERSON_NAME` | Yes | Display name (e.g. Vlad) |
| `PERSONA_BIO` | No | Optional facts |
| `PERSONA_TRAITS` | No | Optional traits |
| `OPENAI_FINETUNED_MODEL` | No | Only if you use a fine-tuned model |
| `OPENAI_EMBEDDING_MODEL` | No | Default: text-embedding-3-small |
| `RAG_TOP_K` | No | Default: 12 |
| Others | No | See `.env.example` for full list |

You can paste from `.env.example` and replace values, or use **Add variables** → **Raw editor** and paste your `.env` contents (without committing `.env`).

## 3. Deploy

- Railway will build and deploy on every push to the connected branch.
- **Start command** is set in `railway.json` to `npm start`.
- The bot will stay running; on failure it will restart (see `restartPolicyType` in `railway.json`).

## 4. Check logs

In the Railway dashboard → your service → **Deployments** → select the latest → **View logs**. You should see the Telegraf bot starting without errors.

## Note on `data/`

The repo includes `data/persona.json` and `data/rag-index.json` so the deployed app has the persona and RAG index. If you prefer not to commit them (e.g. privacy), remove them from the repo and use a VPS + upload `data/` instead (see `DEPLOY.md`).
