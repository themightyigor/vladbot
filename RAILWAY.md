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

**Чтобы реже ловить 409 при деплое** (два инстанса бота одновременно): настрой **Deployment Teardown** в сервисе (Settings → «Configure old deployment termination when a new one is started», [Docs](https://docs.railway.com/deployments/deployment-teardown)): **Draining time** = 10 (секунд). Тогда старый процесс после SIGTERM получит 10 секунд на корректное завершение (`bot.stop()` и освобождение getUpdates). То же можно задать переменной `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=10`. Overlap оставь 0. Новый инстанс при 409 сам делает несколько попыток с паузой (см. код).

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

## 5. (Optional) Утреннее сообщение по Cron

Чтобы Влад раз в день писал в группу в **фиксированное время**, добавь второй сервис — Cron:

1. В том же проекте: **New** → **Empty Service** (или **GitHub Repo** с тем же репо).
2. Подключи тот же репозиторий, что и у бота.
3. **Settings** сервиса:
   - **Cron Schedule:** расписание в формате crontab (UTC). Пример: `0 5 * * *` — каждый день в 05:00 UTC (08:00 МСК). Start Command не меняй — оба сервиса запускают `npm start`; выбор «бот или cron» по переменной ниже.
4. **Variables:** те же, что у бота: `BOT_TOKEN`, `OPENAI_API_KEY`, `MORNING_GROUP_CHAT_ID`. Плюс **обязательно:** `RUN_MORNING_CRON=1` — тогда при запуске по крону выполнится `scripts/sendMorning.js`, а не бот.
5. **Volume (рекомендуется)** — чтобы `morning_state.json` сохранялся между запусками (чередование «реакция на вчера» / «подкол дня»):
   - В проекте нажми **Ctrl+K** (или **⌘K** на Mac), в поиске введи **volume** → **Create Volume** (или правый клик по канвасу → создать volume).
   - Выбери **сервис Cron** (тот, где `sendMorning.js`).
   - **Mount Path** укажи: **`/app/data/morning`** (состояние пишется в этот каталог; `persona.json` остаётся в образе в `data/`).
   - В **Variables** сервиса Cron добавь: **`MORNING_STATE_DIR=/app/data/morning`**.
   - Сохрани. При каждом запуске по крону состояние будет в volume, а персона — из образа. Без volume состояние сбрасывается при новом запуске.

Сервис по крону не держит процесс: он запускает скрипт по расписанию, скрипт отправляет одно сообщение и завершается. [Cron Jobs в Railway](https://docs.railway.com/cron-jobs).

**Если cron не срабатывает:** (1) Должен быть **отдельный сервис** под cron (не тот, где бот с long polling). (2) В Settings этого сервиса выключи **Sleep** / «App sleeping», иначе запуски по расписанию не выполняются. (3) Расписание в **UTC**, минимум раз в 5 минут (например `*/5 * * * *` для теста). (4) Если предыдущий запуск ещё в статусе Active (скрипт завис или не завершился), следующий запуск будет пропущен — смотри логи и убедись, что в конце есть `sendMorning: done, exiting`. (5) У сервиса должен быть успешный деплой (Build и Deploy без ошибок).

## Note on `data/`

- **persona.json** is the only file from `data/` that is committed by default (see `.gitignore`: `data/*` and `!data/persona.json`).
- **rag-index.json** is not committed (often large). The bot works without it; RAG is optional.
- For full control and no Git usage for data, use a VPS and upload the whole `data/` folder (see `DEPLOY.md`).
