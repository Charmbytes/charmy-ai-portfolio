# Charmy Dhawan — AI-Powered Portfolio

**🌐 Live demo → [charmy-ai-portfolio-uxbg.vercel.app](https://charmy-ai-portfolio-uxbg.vercel.app/)**

An interactive portfolio where visitors don't just read a resume — they **ask questions**. An AI assistant, grounded in a local knowledge base built from my actual resume, answers questions about my background, skills, projects, experience, education, and contact details, streaming its response token-by-token.

## Features

- ⚛️ **React + TypeScript frontend** (Vite) — blueprint-styled UI with the AI chat as the hero
- ⚡ **FastAPI backend** — streaming chat, profile, health, and metrics endpoints
- 🧠 **Groq-powered AI assistant** — `llama-3.3-70b-versatile` via Groq's OpenAI-compatible API, responses streamed over Server-Sent Events
- 🔎 **TF-IDF + cosine similarity retrieval** — queries are scored against the knowledge base as weighted term vectors, not boolean keyword hits; **85.7% top-1 / 90.5% top-3 accuracy** on a 21-question eval set (`backend/eval_retrieval.py`)
- 🛡️ **Two-layer fallback for reliability** — if Groq is down or unconfigured, the backend answers rule-based from the knowledge base; if the *backend* is unreachable, the frontend answers from embedded local data. The chat never breaks, streaming or not.
- 📈 **Observability** — structured JSON request logs and an in-memory `/api/metrics` endpoint (request counts, latency p50/p95, Groq vs. fallback split)
- ✅ **Tested + CI'd** — 24 pytest tests covering retrieval and every endpoint; GitHub Actions runs tests, the retrieval eval, and a frontend typecheck/build on every push
- 🗂️ **Dynamic sections** — projects, skills, experience, education, and contact rendered from structured data

## Architecture

```
frontend (React + TS)              backend (FastAPI)                    Groq API
┌────────────────────┐   POST      ┌───────────────────────┐   stream   ┌──────────────────┐
│ Chat.tsx (hero)     │ /api/chat/  │ TfidfRetriever         │ ─────────▶│ llama-3.3-70b     │
│  - renders tokens   │  stream     │  top-k sections        │           │  (SSE tokens)     │
│    as they arrive   │ ───────────▶│  (cosine similarity)   │◀───────── └──────────────────┘
│                     │  SSE deltas │        │                │  on failure
│ sections from       │◀────────────│        ▼                │
│ data/profile.ts     │             │  prompt + context      │
│                     │             │        │                │
│ local fallback ◀────┼── if API    │        ▼                │
│ (localAnswer)       │    down     │  rule-based fallback   │
└────────────────────┘             │  metrics + JSON logs   │
                                    └───────────────────────┘
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

No key? It still works — answers come from the rule-based fallback, delivered through the same streaming endpoint as a single event.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173 (proxies /api to :8000)
```

## Testing

```bash
cd backend
pip install -r requirements-dev.txt
pytest -v                  # 24 tests: retrieval + every endpoint, no network calls
python eval_retrieval.py   # retrieval accuracy against backend/eval_set.json
```

```bash
cd frontend
npx tsc --noEmit           # typecheck
npx vite build              # production build
```

Both run automatically on every push/PR via `.github/workflows/ci.yml`.

## Single-server deployment

Build the frontend once, and FastAPI will serve it automatically:

```bash
cd frontend && npm run build     # creates frontend/dist
cd ../backend && uvicorn main:app --host 0.0.0.0 --port 8000
```

Now the whole portfolio (site + API) runs from one process — deployable to Render, Railway, or any VPS. Set `CORS_ORIGINS` in `.env` to your public domain.

Alternatively, deploy the frontend to Vercel/Netlify and the backend separately; the frontend's client-side fallback keeps the chat responsive even if the API sleeps.

**Note on the free tier:** retrieval is pure numpy (TF-IDF, no ML model download), so it's safe on Render's free 512MB plan. There's no neural embedding model here by design — see "Known limitations" below.

## Customizing the knowledge base

All facts live in `backend/knowledge_base.json`. Each section has:

```json
{ "id": "skills", "title": "Skills", "keywords": ["skills", "stack", ...], "content": "..." }
```

Edit content or add sections — retrieval and the AI prompt pick them up automatically. Mirror any display-relevant changes in `frontend/src/data/profile.ts`. After editing the KB, re-run `python eval_retrieval.py` to check retrieval quality hasn't regressed, and consider adding a new case to `eval_set.json`.

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/chat/stream` | POST | `{message, history}` → Server-Sent Events (`meta`, `delta`×N, `done`) streaming the reply as it's generated |
| `/api/chat` | POST | `{message, history}` → grounded AI reply as a single JSON response, with `source` and `grounded_on` |
| `/api/profile` | GET | Structured profile + sections |
| `/api/health` | GET | Status + whether Groq is configured |
| `/api/metrics` | GET | In-memory request count, Groq vs. fallback split, latency p50/p95 (resets on restart) |

## Known limitations

- **TF-IDF, not neural embeddings.** Retrieval uses term-frequency vectors and cosine similarity rather than a semantic embedding model. This was a deliberate tradeoff: it needs no model download, no torch, and fits comfortably on a free-tier deploy, at the cost of not understanding synonyms/paraphrases the way an embedding model would. At the current knowledge-base size (~12 sections) it performs well (85.7% top-1); it would need revisiting at much larger scale.
- **Single generic-word queries underperform.** Words that appear in almost every section's keywords (e.g. "built") don't carry much discriminating signal, so a query that reduces to just that one word after stopword removal can rank somewhat arbitrarily. Multi-word queries are unaffected.
- **Metrics are in-memory only.** `/api/metrics` resets on every deploy/restart — it's a quick operational snapshot, not a substitute for real observability tooling (e.g. Prometheus/Grafana) at production scale.

---

Built by [Charmy Dhawan](https://github.com/Charmbytes) · charmydhawan@gmail.com · [Live site](https://charmy-ai-portfolio-uxbg.vercel.app/)
