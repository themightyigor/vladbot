# Deploying the bot (run 24/7)

So the bot works without running `npm start` on your PC, run it on a server. Two common ways:

---

## Option 1: VPS (Linux server)

Use any VPS: DigitalOcean, Hetzner, Timeweb, Oracle Cloud Free Tier, etc.

### 1. Create a server

- **OS:** Ubuntu 22.04 (or any Linux with Node 18+).
- **Size:** 1 vCPU, 512 MB–1 GB RAM is enough.

### 2. Connect and install Node.js

```bash
ssh root@YOUR_SERVER_IP
```

```bash
apt update && apt install -y git
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # should be 18+
```

### 3. Upload the project

**Option A – from your PC (with project and data ready):**

On your **Windows PC** (PowerShell), from the project folder:

```powershell
scp -r c:\Users\Igor\vladbot root@YOUR_SERVER_IP:/root/vladbot
```

Then on the **server**:

```bash
cd /root/vladbot
npm install
```

**Option B – from Git (if the project is in a repo):**

On the server:

```bash
cd /root
git clone YOUR_REPO_URL vladbot
cd vladbot
npm install
```

You still need to copy **`.env`** and the **`data/`** folder (persona, RAG index, etc.) to the server (e.g. with `scp` or by creating `.env` and re-running `build-persona` and `build-rag` on the server if you have the export there).

### 4. Create `.env` on the server

```bash
cd /root/vladbot
nano .env
```

Paste the same content as on your PC (BOT_TOKEN, OPENAI_API_KEY, PERSON_NAME, etc.). Save (Ctrl+O, Enter, Ctrl+X).

If you didn’t upload `data/`, copy `data/` from your PC to the server (e.g. `scp -r c:\Users\Igor\vladbot\data root@YOUR_SERVER_IP:/root/vladbot/`).

### 5. Run the bot with PM2 (keeps it running and restarts on crash)

```bash
npm install -g pm2
pm2 start src/index.js --name vladbot
pm2 save
pm2 startup
```

After `pm2 startup` run the command it prints (e.g. `sudo env PATH=... pm2 startup systemd -u root --hp /root`).

Useful commands:

```bash
pm2 status      # see if bot is running
pm2 logs vladbot
pm2 restart vladbot
pm2 stop vladbot
```

The bot is now running 24/7 and will restart after reboot.

---

## Option 2: Railway (deploy from Git)

[Railway](https://railway.app) can run the bot from a GitHub repo.

### 1. Push project to GitHub

- Create a repo, push your code.
- **Do not** commit `.env` or `data/` (they are in `.gitignore`). You will set env and data on Railway.

### 2. Create project on Railway

- Go to [railway.app](https://railway.app), sign in (e.g. with GitHub).
- **New Project** → **Deploy from GitHub repo** → choose your repo.
- Railway will detect Node and run `npm install` and use `npm start` if you have it in `package.json` (you do).

### 3. Set environment variables

- Open your service → **Variables**.
- Add every variable from your `.env`: `BOT_TOKEN`, `OPENAI_API_KEY`, `PERSON_NAME`, `PERSONA_BIO`, `PERSONA_TRAITS`, `EXPORT_HTML_PATH` (if needed), `OPENAI_FINETUNED_MODEL` (if you use fine-tune), etc.

### 4. Add `data/` (persona + RAG)

Railway runs from Git, so it doesn’t have your local `data/` folder. Options:

- **A)** Commit `data/persona.json` and `data/rag-index.json` (and optionally `data/conversation.json`) into the repo so deploy has them. Don’t commit if the content is private.
- **B)** Build on deploy: add a **build command** that runs after `npm install`, e.g. `npm run parse && npm run build-persona && npm run build-rag`. That requires the export and env (e.g. `EXPORT_HTML_PATH`) to be available on Railway; usually you’d need to put the export somewhere (e.g. URL or mounted volume) and adapt the script.
- **C)** Easiest for private data: build `persona.json` and `rag-index.json` locally, then commit only those two files (no conversation export). Add them to repo once, then deploy. If you don’t want them in Git, use Option 1 (VPS) and upload `data/` via `scp`.

### 5. Deploy

- Railway deploys on every push. Start command is `npm start` (from `package.json`).
- Open **Settings** → ensure **Start Command** is `npm start` or leave default.
- Bot will be online as long as the Railway service is running (free tier has limits; paid plan for always-on).

---

## Summary

| Method | Cost | Difficulty |
|--------|------|------------|
| **VPS + PM2** | ~$0–5/month | Medium (SSH, copy project + data, pm2) |
| **Railway** | $0 (limits) or ~$5/month | Easy if you use Git and commit persona/RAG or build on deploy |

For full control and no surprises with `data/`, **VPS + PM2** is the most straightforward: upload project and `data/`, create `.env`, run with `pm2 start`.
