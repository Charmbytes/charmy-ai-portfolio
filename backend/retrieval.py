"""
TF-IDF + cosine similarity retrieval over the local knowledge base.

Replaces the earlier boolean keyword-match retriever with a proper vector
space model: terms are weighted by TF-IDF (rare, distinguishing words count
more than common ones), each section becomes a vector, and a query is
scored against every section via cosine similarity. Pure numpy — no
external model downloads, no torch, safe on small/free-tier deployments.
"""

from __future__ import annotations

import math
import re
from collections import Counter

import numpy as np

_WORD_RE = re.compile(r"[a-z0-9.+#&]+")

_STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "of", "in", "on",
    "at", "to", "for", "and", "or", "with", "has", "have", "had", "do", "does",
    "did", "what", "which", "whom", "how", "when", "where", "why", "can",
    "could", "would", "should", "tell", "me", "your", "you", "his",
    "her", "their", "it", "its", "that", "this", "charmy", "dhawan", "s",
    "doing", "right", "now", "today", "currently", "any", "some", "about",
    "involved", "give", "get", "please", "will", "am", "im",
}


_ES_PLURAL_ENDINGS = ("ses", "xes", "zes", "ches", "shes")


def _stem(token: str) -> str:
    """Very light suffix stripping so plurals/gerunds match their base form
    (e.g. "clubs" -> "club", "languages" -> "language"). Deliberately naive —
    this is a small, domain-specific vocabulary, not general NLP."""
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 4 and token.endswith(_ES_PLURAL_ENDINGS):
        return token[:-2]  # boxes -> box, matches -> match, classes -> class
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]  # languages -> language, clubs -> club
    return token


def _tokenize(text: str) -> list[str]:
    return [_stem(t) for t in _WORD_RE.findall(text.lower()) if t not in _STOPWORDS]


class TfidfRetriever:
    """Fits a TF-IDF vector space over KB sections at startup, then scores
    incoming queries against it with cosine similarity.

    Each section's document text is its keywords (repeated, to weight them)
    plus its content — keeping the "curated keywords" signal from the old
    retriever while adding proper term weighting instead of boolean hits.
    """

    def __init__(self, sections: list[dict]):
        self.sections = sections
        docs = [self._section_text(s) for s in sections]
        self.tokenized_docs = [_tokenize(d) for d in docs]

        # Document frequency: how many docs contain each term.
        df: Counter[str] = Counter()
        for tokens in self.tokenized_docs:
            df.update(set(tokens))

        n_docs = len(self.tokenized_docs)
        # Smoothed IDF so terms in every doc don't hit zero weight.
        self.idf = {term: math.log((1 + n_docs) / (1 + freq)) + 1 for term, freq in df.items()}
        self.vocab = {term: i for i, term in enumerate(self.idf)}

        self.doc_vectors = np.array([self._vectorize(tokens) for tokens in self.tokenized_docs])
        self.doc_norms = np.linalg.norm(self.doc_vectors, axis=1)
        self.doc_norms[self.doc_norms == 0] = 1e-9  # avoid div-by-zero for empty docs

    @staticmethod
    def _section_text(section: dict) -> str:
        keywords = " ".join(section.get("keywords", [])) + " "
        return keywords * 4 + section.get("content", "")

    def _vectorize(self, tokens: list[str]) -> np.ndarray:
        vec = np.zeros(len(self.vocab))
        if not tokens:
            return vec
        tf = Counter(tokens)
        max_tf = max(tf.values())
        for term, count in tf.items():
            if term in self.vocab:
                # Augmented TF (dampens the effect of very long docs) * IDF.
                vec[self.vocab[term]] = (0.5 + 0.5 * count / max_tf) * self.idf[term]
        return vec

    def retrieve(self, query: str, top_k: int = 3, min_score: float = 0.05) -> list[dict]:
        q_tokens = _tokenize(query)
        q_vec = self._vectorize(q_tokens)
        q_norm = np.linalg.norm(q_vec)
        if q_norm == 0:
            return []

        scores = (self.doc_vectors @ q_vec) / (self.doc_norms * q_norm)
        ranked = np.argsort(scores)[::-1][:top_k]
        return [self.sections[i] for i in ranked if scores[i] >= min_score]

    def retrieve_with_scores(self, query: str, top_k: int = 3, min_score: float = 0.05) -> list[tuple[dict, float]]:
        """Same as retrieve(), but also returns similarity scores — used by the eval script."""
        q_tokens = _tokenize(query)
        q_vec = self._vectorize(q_tokens)
        q_norm = np.linalg.norm(q_vec)
        if q_norm == 0:
            return []

        scores = (self.doc_vectors @ q_vec) / (self.doc_norms * q_norm)
        ranked = np.argsort(scores)[::-1][:top_k]
        return [(self.sections[i], float(scores[i])) for i in ranked if scores[i] >= min_score]
