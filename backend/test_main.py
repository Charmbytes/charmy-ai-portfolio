"""
Tests for the FastAPI app. Run with: pytest test_main.py

These run with no GROQ_API_KEY set (see conftest.py), so every test
exercises the rule-based fallback path — no network calls, no external
dependencies, safe to run in CI.
"""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


class TestHealth:
    def test_health_ok(self):
        res = client.get("/api/health")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ok"
        assert body["groq_configured"] is False  # no key set in test env


class TestProfile:
    def test_profile_returns_sections(self):
        res = client.get("/api/profile")
        assert res.status_code == 200
        body = res.json()
        assert "profile" in body
        assert "sections" in body
        assert len(body["sections"]) > 0


class TestChat:
    def test_chat_grounds_on_relevant_section(self):
        res = client.post("/api/chat", json={"message": "what programming languages does charmy know"})
        assert res.status_code == 200
        body = res.json()
        assert body["source"] == "fallback"
        assert "skills" in body["grounded_on"]
        assert len(body["reply"]) > 0

    def test_chat_greeting_gets_greeting_response(self):
        res = client.post("/api/chat", json={"message": "hello"})
        assert res.status_code == 200
        body = res.json()
        assert body["grounded_on"] == []
        assert "assistant" in body["reply"].lower() or "charmy" in body["reply"].lower()

    def test_chat_rejects_empty_message(self):
        res = client.post("/api/chat", json={"message": ""})
        assert res.status_code == 422  # min_length=1 validation

    def test_chat_rejects_oversized_message(self):
        res = client.post("/api/chat", json={"message": "x" * 3000})
        assert res.status_code == 422  # max_length=2000 validation

    def test_chat_history_is_accepted(self):
        res = client.post(
            "/api/chat",
            json={
                "message": "what about databases",
                "history": [
                    {"role": "user", "content": "what are your skills"},
                    {"role": "assistant", "content": "Charmy knows Python, FastAPI..."},
                ],
            },
        )
        assert res.status_code == 200


class TestChatStream:
    def test_stream_emits_meta_delta_done(self):
        with client.stream(
            "POST", "/api/chat/stream", json={"message": "tell me about the llm agent project"}
        ) as res:
            assert res.status_code == 200
            assert "text/event-stream" in res.headers["content-type"]
            events = [line for line in res.iter_lines() if line.startswith("event: ")]
        assert "event: meta" in events
        assert "event: delta" in events
        assert "event: done" in events


class TestMetrics:
    def test_metrics_reflects_recorded_requests(self):
        before = client.get("/api/metrics").json()["request_count"]
        client.post("/api/chat", json={"message": "what are charmy's skills"})
        after = client.get("/api/metrics").json()["request_count"]
        assert after == before + 1  # /api/metrics reads aren't tracked, only chat calls are

    def test_metrics_has_expected_shape(self):
        body = client.get("/api/metrics").json()
        assert "uptime_seconds" in body
        assert "request_count" in body
        assert "latency_ms" in body
        assert set(body["latency_ms"].keys()) == {"p50", "p95", "samples"}
