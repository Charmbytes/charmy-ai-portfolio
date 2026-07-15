# Charmy Dhawan — AI-Powered Portfolio

An interactive portfolio where visitors don't just read a resume — they **ask questions**. An AI assistant, grounded in a local knowledge base built from my actual resume, answers questions about my background, skills, projects, experience, education, and contact details.

## Features

- ⚛️ **React + TypeScript frontend** (Vite) — blueprint-styled UI with the AI chat as the hero
- ⚡ **FastAPI backend** — chat, profile, and health endpoints
- 🧠 **Groq-powered AI assistant** — `llama-3.3-70b-versatile` via Groq's OpenAI-compatible API
- 📚 **Local knowledge base** (`knowledge_base.json`) — keyword-scored retrieval grounds every answer in real resume data; the model is instructed never to invent facts
- 🛡️ **Two-layer fallback for reliability** — if Groq is down or unconfigured, the backend answers rule-based from the knowledge base; if the *backend* is unreachable, the frontend answers from embedded local data. The chat never breaks.
- 🗂️ **Dynamic sections** — projects, skills, experience, education, and contact rendered from structured data

## Architecture

```
frontend (React + TS)          backend (FastAPI)              Groq API
┌───────────────────┐   /api   ┌────────────────────┐   ┌──────────────────┐
│ Chat.tsx (hero)   │ ───────▶ │ retrieve() top-k   │──▶│ llama-3.3-70b    │
│ sections from     │          │ from knowledge     │   └──────────────────┘
│ data/profile.ts   │ ◀─────── │ base → prompt      │      │ on failure
│                   │  reply   │                    │ ◀────┘
│ local fallback ◀──┼── if API │ rule-based         │
│ (localAnswer)     │   down   │ fallback           │
└───────────────────┘          └────────────────────┘
```

## Quick start

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env    # paste your GROQ_API_KEY (free at console.groq.com)
uvicorn main:app --reload --port 8000
```

No key? It still works — answers come from the rule-based fallback.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173 (proxies /api to :8000)
```

## Single-server deployment

Build the frontend once, and FastAPI will serve it automatically:

```bash
cd frontend && npm run build     # creates frontend/dist
cd ../backend && uvicorn main:app --host 0.0.0.0 --port 8000
```

Now the whole portfolio (site + API) runs from one process — deployable to Render, Railway, or any VPS. Set `CORS_ORIGINS` in `.env` to your public domain.

Alternatively, deploy the frontend to Vercel/Netlify and the backend separately; the frontend's client-side fallback keeps the chat responsive even if the API sleeps.

## Customizing the knowledge base

All facts live in `backend/knowledge_base.json`. Each section has:

```json
{ "id": "skills", "title": "Skills", "keywords": ["skills", "stack", ...], "content": "..." }
```

Edit content or add sections — retrieval and the AI prompt pick them up automatically. Mirror any display-relevant changes in `frontend/src/data/profile.ts`.

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/chat` | POST | `{message, history}` → grounded AI reply with `source` and `grounded_on` |
| `/api/profile` | GET | Structured profile + sections |
| `/api/health` | GET | Status + whether Groq is configured |

---

Built by [Charmy Dhawan](https://github.com/Charmbytes) · charmydhawan@gmail.com
