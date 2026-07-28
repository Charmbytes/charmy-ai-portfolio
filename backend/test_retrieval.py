"""Tests for the TF-IDF retriever. Run with: pytest test_retrieval.py"""

import json
from pathlib import Path

import pytest

from retrieval import TfidfRetriever, _stem, _tokenize

KB = json.loads((Path(__file__).parent / "knowledge_base.json").read_text())


@pytest.fixture(scope="module")
def retriever() -> TfidfRetriever:
    return TfidfRetriever(KB["sections"])


class TestTokenizeAndStem:
    def test_strips_stopwords(self):
        assert "the" not in _tokenize("what is the tech stack")
        assert "is" not in _tokenize("what is the tech stack")

    def test_stems_plurals(self):
        assert _stem("clubs") == "club"
        assert _stem("languages") == "language"
        assert _stem("projects") == "project"

    def test_does_not_over_stem_short_or_double_s_words(self):
        assert _stem("class") == "class"  # ends in "ss", must not become "clas"
        assert _stem("is") == "is"  # too short to touch


class TestRetrieval:
    @pytest.mark.parametrize(
        "query,expected_id",
        [
            ("what programming languages does charmy know", "skills"),
            ("where did charmy study", "education"),
            ("how can I contact charmy", "contact"),
            ("is charmy involved in any clubs", "leadership"),
            ("tell me about the robotic arm project", "project-arm-simulator"),
            ("what does the ai job hunter do", "project-ai-jobhunter"),
        ],
    )
    def test_top_result_matches_expected_section(self, retriever, query, expected_id):
        results = retriever.retrieve(query, top_k=1)
        assert results, f"no results for {query!r}"
        assert results[0]["id"] == expected_id

    def test_empty_query_returns_nothing(self, retriever):
        assert retriever.retrieve("") == []

    def test_query_with_only_stopwords_returns_nothing(self, retriever):
        assert retriever.retrieve("what is the and or") == []

    def test_respects_top_k(self, retriever):
        results = retriever.retrieve("tell me about charmy's projects", top_k=2)
        assert len(results) <= 2

    def test_scores_are_sorted_descending(self, retriever):
        results = retriever.retrieve_with_scores("charmy projects skills experience", top_k=5)
        scores = [score for _, score in results]
        assert scores == sorted(scores, reverse=True)

    def test_min_score_filters_weak_matches(self, retriever):
        # An unreasonably high min_score should filter out everything.
        assert retriever.retrieve("skills", top_k=5, min_score=0.99) == []
