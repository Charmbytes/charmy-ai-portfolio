"""
Shared pytest fixtures.

Forces GROQ_API_KEY off for the whole test session so every test exercises
the deterministic rule-based fallback path, never a real network call to
Groq. Without this, a developer with a real .env file present would get
flaky tests depending on Groq's live behavior.
"""

import os

import pytest


@pytest.fixture(autouse=True, scope="session")
def _no_groq_key():
    os.environ.pop("GROQ_API_KEY", None)
    import main
    main.GROQ_API_KEY = ""
    yield
