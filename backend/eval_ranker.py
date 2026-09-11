"""
eval_ranker.py – VAJRA AI Stage 2 Evaluation Utility
=====================================================
A development-only script to demonstrate the Information Retrieval
component. It runs a set of test claims through the full pipeline
(Tavily retrieval → BGE semantic ranking) and prints the results in a
human-readable format suitable for project presentations.

Usage (from the backend/ directory, with the venv active):
    python eval_ranker.py

Do NOT run this in production. It loads the BGE model and calls Tavily.

NOTE: semantic_score measures semantic *relevance*, NOT truthfulness.
      A score of 0.95 does not mean the result is 95% true.
"""

import logging
import os
import sys

# ── Ensure the app package is on the path ────────────────────────────────────
# Allow running from backend/ directory directly.
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv

load_dotenv()

from app.services.web_retriever import search_evidence
from app.services.semantic_ranker import load_model, rank_results

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.WARNING,  # Suppress INFO noise during demo output
    format="%(levelname)s | %(message)s",
)

# ── Test claims ───────────────────────────────────────────────────────────────
TEST_CLAIMS = [
    "The Earth is flat",
    "5G towers cause coronavirus",
    "Water boils at 100 degrees Celsius at sea level",
]

SEPARATOR = "=" * 70


def evaluate_claim(claim: str) -> None:
    print(f"\n{SEPARATOR}")
    print(f"Claim:\n  {claim}")
    print(SEPARATOR)

    # Stage 1 – Tavily retrieval
    try:
        raw_results = search_evidence(claim, max_results=5)
    except EnvironmentError as exc:
        print(f"[ERROR] Tavily retrieval failed: {exc}")
        return
    except Exception as exc:
        print(f"[ERROR] Unexpected retrieval error: {exc}")
        return

    if not raw_results:
        print("[WARNING] No web results returned by Tavily.")
        return

    print(f"\nTavily returned {len(raw_results)} result(s).")

    # Stage 2 – BGE semantic ranking
    try:
        ranked = rank_results(claim=claim, results=raw_results)
    except Exception as exc:
        print(f"[ERROR] Semantic ranking failed: {exc}")
        return

    if not ranked:
        print("[WARNING] No results survived the ranking filter.")
        return

    print(f"BGE ranked {len(ranked)} result(s) successfully.\n")
    print("Retrieved results (sorted by semantic relevance):\n")

    for item in ranked:
        print(f"  Rank {item['rank']}")
        print(f"  Semantic relevance score : {item['semantic_score']:.4f}")
        print(f"  Tavily search score      : {item.get('search_score')}")
        print(f"  Title                    : {item['title'] or '(no title)'}")
        print(f"  URL                      : {item['url']}")
        print()

    print(
        "  ⚠  Note: semantic_score measures relevance, NOT truthfulness.\n"
        "     A score of 0.95 does NOT mean the result is 95% true."
    )


def main() -> None:
    print("\n+================================================+")
    print("|  VAJRA AI - Stage 2 Evaluation Utility        |")
    print("|  Semantic Evidence Ranking (BGE)              |")
    print("+================================================+")

    # Pre-load the model once before iterating over claims.
    print("\nLoading BGE model (BAAI/bge-base-en-v1.5) …")
    try:
        load_model()
        print("BGE model loaded successfully.\n")
    except Exception as exc:
        print(f"[FATAL] Could not load BGE model: {exc}")
        sys.exit(1)

    for claim in TEST_CLAIMS:
        evaluate_claim(claim)

    print(f"\n{SEPARATOR}")
    print("Evaluation complete.")
    print(SEPARATOR)


if __name__ == "__main__":
    main()
