"""
VAJRA AI — Pipeline Profiling Script
=====================================
Instruments the complete verification pipeline with per-stage timing.
Produces a JSON report. Does NOT modify any production code.
"""

import json
import os
import sys
import time
from pathlib import Path

# Setup path and env
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")


def timed(label, func, *args, **kwargs):
    """Run func(*args, **kwargs), return (result, elapsed_seconds)."""
    start = time.perf_counter()
    result = func(*args, **kwargs)
    elapsed = time.perf_counter() - start
    print(f"  {label}: {elapsed:.4f}s")
    return result, elapsed


def profile_claim(claim: str) -> dict:
    """Profile a single claim through the complete pipeline."""
    from app.services.language_service import normalize_claim, translate_from_english
    from app.services.web_retriever import search_evidence
    from app.services.semantic_ranker import rank_results, load_model
    from app.services.evidence_analyzer import analyze_evidence
    from app.services.verdict_engine import generate_verdict
    from app.services.knowledge_graph import build_graph

    timings = {}
    print(f"\n{'='*60}")
    print(f"Profiling claim: {claim!r}")
    print(f"{'='*60}")

    # Pre-load BGE if not already loaded
    load_model()

    # 1. Language detection + normalization
    lang_info, t = timed("Language normalization", normalize_claim, claim)
    timings["language_normalization"] = t
    english_claim = lang_info["normalized_claim"]
    detected_lang = lang_info["language"]
    timings["detected_language"] = detected_lang

    # 2. Web retrieval
    raw_evidence, t = timed("Tavily retrieval", search_evidence, english_claim)
    timings["tavily_retrieval"] = t
    timings["tavily_result_count"] = len(raw_evidence)

    # 3. BGE semantic ranking
    ranked, t = timed("BGE semantic ranking", rank_results, english_claim, raw_evidence)
    timings["bge_ranking"] = t
    timings["ranked_result_count"] = len(ranked)

    # 4. Source reliability + evidence analysis
    enriched, t = timed("Source scoring & analysis", analyze_evidence, english_claim, ranked)
    timings["source_analysis"] = t
    timings["enriched_result_count"] = len(enriched)

    # Check deduplication
    timings["duplicates_removed"] = len(ranked) - len(enriched)

    # 5. Gemini verdict generation
    verdict_result, t = timed("Gemini verdict generation", generate_verdict, english_claim, enriched)
    timings["gemini_verdict"] = t
    timings["verdict"] = verdict_result.get("verdict", "UNKNOWN")
    timings["analysis_confidence"] = verdict_result.get("analysis_confidence", 0.0)

    # 6. Knowledge graph
    graph, t = timed("Knowledge graph generation", build_graph,
                     english_claim, verdict_result["verdict"], verdict_result["evidence"])
    timings["knowledge_graph"] = t
    timings["graph_nodes"] = len(graph.get("nodes", []))
    timings["graph_edges"] = len(graph.get("edges", []))

    # 7. Back-translation (simulate non-English)
    if detected_lang not in ("en", "en-US", "en-GB"):
        _, t = timed("Back-translation (summary)", translate_from_english,
                     verdict_result.get("summary", ""), detected_lang)
        timings["back_translation"] = t
    else:
        timings["back_translation"] = 0.0

    # Total
    total = sum(timings[k] for k in [
        "language_normalization", "tavily_retrieval", "bge_ranking",
        "source_analysis", "gemini_verdict", "knowledge_graph", "back_translation"
    ])
    timings["total_pipeline"] = round(total, 4)

    # Source diversity analysis
    domains = [e.get("source_domain", "") for e in enriched]
    unique_domains = set(domains)
    timings["unique_domains"] = len(unique_domains)
    timings["domain_list"] = list(unique_domains)

    # Evidence lengths
    content_lengths = [len(e.get("content", "")) for e in enriched]
    timings["avg_content_length"] = round(sum(content_lengths) / max(len(content_lengths), 1), 1)

    print(f"\n  TOTAL PIPELINE: {total:.4f}s")
    print(f"  Verdict: {timings['verdict']} (confidence: {timings['analysis_confidence']:.2f})")
    print(f"  Sources: {timings['unique_domains']} unique domains from {timings['enriched_result_count']} results")

    return timings


def main():
    claims = [
        "The Earth is flat",
        "5G towers cause coronavirus",
        "Water boils at 100 degrees Celsius at sea level",
    ]

    all_results = {}
    for claim in claims:
        all_results[claim] = profile_claim(claim)

    # Summary
    print(f"\n{'='*60}")
    print("PROFILING SUMMARY")
    print(f"{'='*60}")
    for claim, timings in all_results.items():
        print(f"\n  {claim!r}")
        print(f"    Total: {timings['total_pipeline']:.2f}s")
        print(f"    Breakdown:")
        for key in ["language_normalization", "tavily_retrieval", "bge_ranking",
                     "source_analysis", "gemini_verdict", "knowledge_graph"]:
            pct = (timings[key] / timings["total_pipeline"] * 100) if timings["total_pipeline"] > 0 else 0
            print(f"      {key:30s} {timings[key]:8.4f}s  ({pct:5.1f}%)")

    # Save JSON report
    report_path = Path(__file__).resolve().parent.parent / "profiling_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False, default=str)
    print(f"\nReport saved to: {report_path}")


if __name__ == "__main__":
    main()
