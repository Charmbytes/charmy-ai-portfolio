"""
Measures retrieval accuracy of the TF-IDF retriever against eval_set.json.

Run:
    python eval_retrieval.py

Reports top-1 accuracy (did the highest-scored section match the expected
one?) and top-3 accuracy (did the expected section appear anywhere in the
top 3?). Useful for backing up a "retrieval accuracy" claim with a real
number instead of a guess.
"""

import json
from pathlib import Path

from retrieval import TfidfRetriever

BASE = Path(__file__).parent
KB = json.loads((BASE / "knowledge_base.json").read_text())
EVAL_SET = json.loads((BASE / "eval_set.json").read_text())


def main() -> None:
    retriever = TfidfRetriever(KB["sections"])

    top1_correct = 0
    top3_correct = 0
    failures = []

    for case in EVAL_SET:
        results = retriever.retrieve_with_scores(case["question"], top_k=3)
        ids = [sec["id"] for sec, _ in results]

        if ids and ids[0] == case["expected"]:
            top1_correct += 1
        else:
            failures.append((case["question"], case["expected"], ids))

        if case["expected"] in ids:
            top3_correct += 1

    n = len(EVAL_SET)
    print(f"Top-1 accuracy: {top1_correct}/{n} ({100 * top1_correct / n:.1f}%)")
    print(f"Top-3 accuracy: {top3_correct}/{n} ({100 * top3_correct / n:.1f}%)")

    if failures:
        print("\nMisses (question -> expected, got):")
        for question, expected, got in failures:
            print(f"  '{question}' -> expected '{expected}', got {got}")


if __name__ == "__main__":
    main()
