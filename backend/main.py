"""
Charmy Dhawan — AI Portfolio backend.

FastAPI service that answers visitor questions about Charmy using:
  1. A local knowledge base (knowledge_base.json) for grounding.
  2. Groq's OpenAI-compatible chat API for natural answers.
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
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("portfolio")

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
# Retrieval — simple keyword scoring over the local knowledge base
# ---------------------------------------------------------------------------

_WORD_RE = re.compile(r"[a-z0-9.+#&]+")

_STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "of", "in", "on",
    "at", "to", "for", "and", "or", "with", "has", "have", "had", "do", "does",
    "did", "what", "which", "whom", "how", "when", "where", "why", "can",
    "could", "would", "should", "tell", "me", "your", "you", "his",
    "her", "their", "it", "its", "that", "this", "charmy", "dhawan", "s",
}


def _tokenize(text: str) -> set[str]:
    return {t for t in _WORD_RE.findall(text.lower()) if t not in _STOPWORDS}


def retrieve(query: str, top_k: int = 3) -> list[dict]:
    """Score each KB section by keyword + content overlap with the query.

    A section is only returned if at least one of its declared keywords
    matches — content overlap alone is too noisy to ground an answer on.
    """
    q_tokens = _tokenize(query)

    def matches(kw: str) -> bool:
        if kw in q_tokens:
            return True
        # light stemming: "studying" matches keyword "study", etc.
        return len(kw) >= 4 and any(t.startswith(kw) or kw.startswith(t) for t in q_tokens if len(t) >= 4)

    scored = []
    for section in KB["sections"]:
        kw_hits = sum(2 for kw in section["keywords"] if matches(kw))
        if kw_hits == 0:
            continue
        content_hits = len(q_tokens & _tokenize(section["content"])) * 0.25
        scored.append((kw_hits + content_hits, section))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [section for _, section in scored[:top_k]]


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


async def ask_groq(message: str, history: list[ChatTurn], context: str) -> str:
    messages = [{"role": "system", "content": SYSTEM_PROMPT.format(context=context)}]
    for turn in history[-8:]:
        if turn.role in ("user", "assistant"):
            messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": message})

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={"model": GROQ_MODEL, "messages": messages, "max_tokens": 400, "temperature": 0.4},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


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


@app.get("/api/profile")
async def profile():
    """Structured data for the portfolio sections (projects, skills, etc.)."""
    return {"profile": KB["profile"], "sections": KB["sections"]}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    sections = retrieve(req.message)
    context = "\n\n".join(f"[{s['title']}]\n{s['content']}" for s in sections) or "(no matching context)"

    if GROQ_API_KEY:
        try:
            reply = await ask_groq(req.message, req.history, context)
            return ChatResponse(reply=reply, grounded_on=[s["id"] for s in sections], source="groq")
        except Exception as exc:  # network error, rate limit, bad key…
            log.warning("Groq call failed, using fallback: %s", exc)

    reply = fallback_answer(req.message, sections)
    return ChatResponse(reply=reply, grounded_on=[s["id"] for s in sections], source="fallback")


# ---------------------------------------------------------------------------
# Optional: serve the built frontend (frontend/dist) for single-server deploys
# ---------------------------------------------------------------------------

_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _DIST.exists():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=_DIST, html=True), name="site")
    log.info("Serving built frontend from %s", _DIST)
