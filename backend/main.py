"""
Charmy Dhawan — AI Portfolio backend.

FastAPI service that answers visitor questions about Charmy using:
  1. A local knowledge base (knowledge_base.json) for grounding, retrieved
     via TF-IDF + cosine similarity (retrieval.py).
  2. Groq's OpenAI-compatible chat API for natural answers, streamed to the
     client over SSE (falls back to a single JSON response for non-streaming
     clients via /api/chat).
  3. A rule-based fallback when Groq is unavailable, so the portfolio
     never breaks for a visitor.

Run:
    pip install -r requirements.txt
    cp .env.example .env   # add your GROQ_API_KEY
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from collections import deque
from pathlib import Path
from threading import Lock

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from retrieval import TfidfRetriever

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("portfolio")


def log_event(event: str, **fields) -> None:
    """Structured (JSON-lines) logging so logs are greppable/parseable in
    Render's log viewer or any log aggregator, instead of free-text strings."""
    log.info(json.dumps({"event": event, "ts": time.time(), **fields}))


GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

KB_PATH = Path(__file__).parent / "knowledge_base.json"
KB = json.loads(KB_PATH.read_text(encoding="utf-8"))

app = FastAPI(title="Charmy Dhawan — AI Portfolio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Metrics — lightweight in-memory counters (no external deps).
# Resets on restart; fine for a small portfolio service, not meant to
# replace real observability tooling at scale.
# ---------------------------------------------------------------------------

class Metrics:
    def __init__(self, max_latency_samples: int = 500):
        self._lock = Lock()
        self.request_count = 0
        self.groq_success_count = 0
        self.fallback_count = 0
        self.error_count = 0
        self.started_at = time.time()
        self._latencies_ms: deque[float] = deque(maxlen=max_latency_samples)

    def record(self, source: str, latency_ms: float) -> None:
        with self._lock:
            self.request_count += 1
            self._latencies_ms.append(latency_ms)
            if source == "groq":
                self.groq_success_count += 1
            elif source == "fallback":
                self.fallback_count += 1

    def record_error(self) -> None:
        with self._lock:
            self.request_count += 1
            self.error_count += 1

    def snapshot(self) -> dict:
        with self._lock:
            latencies = sorted(self._latencies_ms)
            n = len(latencies)
            p50 = latencies[n // 2] if n else 0
            p95 = latencies[int(n * 0.95)] if n else 0
            return {
                "uptime_seconds": round(time.time() - self.started_at, 1),
                "request_count": self.request_count,
                "groq_success_count": self.groq_success_count,
                "fallback_count": self.fallback_count,
                "error_count": self.error_count,
                "latency_ms": {"p50": p50, "p95": p95, "samples": n},
            }


metrics = Metrics()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)


class ChatResponse(BaseModel):
    reply: str
    grounded_on: list[str]  # section ids used for context
    source: str             # "groq" | "fallback"


# ---------------------------------------------------------------------------
# Retrieval — TF-IDF + cosine similarity over the local knowledge base
# ---------------------------------------------------------------------------

_retriever = TfidfRetriever(KB["sections"])


def retrieve(query: str, top_k: int = 3) -> list[dict]:
    return _retriever.retrieve(query, top_k=top_k)


# ---------------------------------------------------------------------------
# Answer generation
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are the AI assistant on Charmy Dhawan's portfolio website.
Answer visitor questions about Charmy warmly, concisely (2-5 sentences), and in
third person. Refer to Charmy by name ("Charmy" or "Charmy's") — do not use
gendered pronouns (she/he/they) unless the context below explicitly states them.
IMPORTANT EXCEPTION — when the question is about this portfolio website itself
(e.g. "what are you?", "how were you built?", "tell me about this site/portfolio"):
speak in FIRST PERSON as the portfolio AI. Say things like "I was built with...",
"I am powered by Groq...", "You're talking to me right now!" — make it feel alive.
Use ONLY the context provided below — if the answer is not in the context, say
you don't have that detail and suggest asking about Charmy's projects, skills,
experience, education, or contact info. Never invent facts.

Context about Charmy:
{context}
"""

GREETING_RE = re.compile(r"^\s*(hi|hello|hey|yo|hola|namaste)\b", re.IGNORECASE)


def _build_messages(message: str, history: list[ChatTurn], context: str) -> list[dict]:
    messages = [{"role": "system", "content": SYSTEM_PROMPT.format(context=context)}]
    for turn in history[-8:]:
        if turn.role in ("user", "assistant"):
            messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": message})
    return messages


async def ask_groq(message: str, history: list[ChatTurn], context: str) -> str:
    messages = _build_messages(message, history, context)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={"model": GROQ_MODEL, "messages": messages, "max_tokens": 400, "temperature": 0.4},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


async def ask_groq_stream(message: str, history: list[ChatTurn], context: str):
    """Yields text deltas from Groq's streaming chat completions API as they
    arrive. Groq's stream format is OpenAI-compatible: each SSE line is
    `data: {...}` carrying a `choices[0].delta.content` fragment, terminated
    by a literal `data: [DONE]` line."""
    messages = _build_messages(message, history, context)
    async with httpx.AsyncClient(timeout=30) as client:
        async with client.stream(
            "POST",
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": GROQ_MODEL,
                "messages": messages,
                "max_tokens": 400,
                "temperature": 0.4,
                "stream": True,
            },
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                payload = line[len("data: "):]
                if payload == "[DONE]":
                    break
                chunk = json.loads(payload)
                delta = chunk["choices"][0]["delta"].get("content")
                if delta:
                    yield delta


def fallback_answer(message: str, sections: list[dict]) -> str:
    """Rule-based answer so the site keeps working without Groq."""
    if GREETING_RE.match(message) and not sections:
        return KB["fallback_responses"]["greeting"]
    if not sections:
        return KB["fallback_responses"]["unknown"]
    best = sections[0]
    return best["content"]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {"status": "ok", "groq_configured": bool(GROQ_API_KEY)}


@app.get("/api/metrics")
async def get_metrics():
    """Basic request/latency counters. In-memory only — resets on deploy
    restart. Useful for a quick operational snapshot, not long-term analytics."""
    return metrics.snapshot()


@app.get("/api/profile")
async def profile():
    """Structured data for the portfolio sections (projects, skills, etc.)."""
    return {"profile": KB["profile"], "sections": KB["sections"]}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    start = time.perf_counter()
    sections = retrieve(req.message)
    context = "\n\n".join(f"[{s['title']}]\n{s['content']}" for s in sections) or "(no matching context)"
    grounded_on = [s["id"] for s in sections]

    if GROQ_API_KEY:
        try:
            reply = await ask_groq(req.message, req.history, context)
            latency_ms = (time.perf_counter() - start) * 1000
            metrics.record("groq", latency_ms)
            log_event("chat", source="groq", grounded_on=grounded_on, latency_ms=round(latency_ms))
            return ChatResponse(reply=reply, grounded_on=grounded_on, source="groq")
        except Exception as exc:  # network error, rate limit, bad key…
            log_event("groq_error", error=str(exc))

    reply = fallback_answer(req.message, sections)
    latency_ms = (time.perf_counter() - start) * 1000
    metrics.record("fallback", latency_ms)
    log_event("chat", source="fallback", grounded_on=grounded_on, latency_ms=round(latency_ms))
    return ChatResponse(reply=reply, grounded_on=grounded_on, source="fallback")


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest, request: Request):
    """SSE endpoint: streams the reply token-by-token as it comes back from
    Groq. Falls back to emitting the full rule-based answer as a single
    event if Groq isn't configured or the stream call fails, so the client
    doesn't need two separate code paths."""
    start = time.perf_counter()
    sections = retrieve(req.message)
    context = "\n\n".join(f"[{s['title']}]\n{s['content']}" for s in sections) or "(no matching context)"
    grounded_on = [s["id"] for s in sections]

    async def event_source():
        yield f"event: meta\ndata: {json.dumps({'grounded_on': grounded_on})}\n\n"

        if GROQ_API_KEY:
            try:
                async for delta in ask_groq_stream(req.message, req.history, context):
                    if await request.is_disconnected():
                        break
                    yield f"event: delta\ndata: {json.dumps({'text': delta})}\n\n"
                latency_ms = (time.perf_counter() - start) * 1000
                metrics.record("groq", latency_ms)
                log_event("chat_stream", source="groq", grounded_on=grounded_on, latency_ms=round(latency_ms))
                yield f"event: done\ndata: {json.dumps({'source': 'groq'})}\n\n"
                return
            except Exception as exc:
                log_event("groq_stream_error", error=str(exc))

        # Fallback: no Groq key, or the stream call failed partway through.
        reply = fallback_answer(req.message, sections)
        latency_ms = (time.perf_counter() - start) * 1000
        metrics.record("fallback", latency_ms)
        log_event("chat_stream", source="fallback", grounded_on=grounded_on, latency_ms=round(latency_ms))
        yield f"event: delta\ndata: {json.dumps({'text': reply})}\n\n"
        yield f"event: done\ndata: {json.dumps({'source': 'fallback'})}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Optional: serve the built frontend (frontend/dist) for single-server deploys
# ---------------------------------------------------------------------------

_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _DIST.exists():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=_DIST, html=True), name="site")
    log_event("serving_frontend", path=str(_DIST))

