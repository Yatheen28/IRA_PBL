"""
Evidence Analyzer – VAJRA AI Stage 4
=====================================
Combines semantic ranking (Stage 2) and source reliability (Stage 3)
into a unified evidence structure ready for Gemini analysis.

combined_score = SEMANTIC_WEIGHT × semantic_score
               + RELIABILITY_WEIGHT × source_reliability_score

This is an EVIDENCE RANKING SCORE, not a truth probability.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.source_reliability import score_source
from app.services.bm25_ranker import rank_bm25, reciprocal_rank_fusion
import re
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)

# ── Configurable weighting constants ─────────────────────────────────────────
FUSION_WEIGHT: float = 0.70
RELIABILITY_WEIGHT: float = 0.30

assert abs(FUSION_WEIGHT + RELIABILITY_WEIGHT - 1.0) < 1e-9, \
    "Weights must sum to 1.0"


from urllib.parse import urlparse, urlunparse, parse_qs, urlencode

def _normalize_url(url: str) -> str:
    """Normalize URL by stripping fragments and tracking query parameters."""
    try:
        parsed = urlparse(url)
        # Remove fragment
        parsed = parsed._replace(fragment='')
        # Remove common tracking params
        if parsed.query:
            qs = parse_qs(parsed.query, keep_blank_values=True)
            tracking_params = {'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'}
            qs = {k: v for k, v in qs.items() if k.lower() not in tracking_params}
            parsed = parsed._replace(query=urlencode(qs, doseq=True))
        # Strip trailing slash from path for consistency
        path = parsed.path
        if path.endswith('/') and len(path) > 1:
            parsed = parsed._replace(path=path[:-1])
        return urlunparse(parsed).lower()
    except Exception:
        return url.lower()


def _deduplicate_by_url(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove duplicate URLs, keeping the first occurrence."""
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for item in results:
        url = item.get("url", "").strip()
        if not url:
            continue
        
        norm_url = _normalize_url(url)
        if norm_url not in seen:
            seen.add(norm_url)
            deduped.append(item)
        else:
            logger.debug("Duplicate URL removed: %s (normalized: %s)", url, norm_url)
    return deduped


# Cache to prevent repeated Jina Reader network calls for the same URL within the process
_jina_url_cache: dict[str, str] = {}

# Non-HTML extensions that should not be fetched via Jina Reader
NON_HTML_EXTENSIONS = (
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
    ".mp4", ".mp3", ".wav", ".avi", ".mov", ".zip", ".tar", ".gz",
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"
)

# Potential prompt injection signatures to neutralize in retrieved third-party text
INJECTION_PATTERNS = re.compile(
    r"(ignore\s+all\s+previous\s+instructions|system\s+prompt|system\s+instructions|disregard\s+prior|you\s+must\s+say\s+true|you\s+must\s+say\s+false)",
    re.IGNORECASE,
)


def _sanitize_untrusted_content(text: str) -> str:
    """Neutralize potential prompt injection attempts from untrusted web pages."""
    if not text:
        return ""
    # Defuse common prompt injection instructions by masking
    def _mask_injection(match):
        logger.warning("Neutralized potential prompt injection pattern: %r", match.group(0))
        return f"[UNTRUSTED INSTRUCTION FILTERED: {match.group(0)[:15]}...]"

    return INJECTION_PATTERNS.sub(_mask_injection, text)


def _deep_fetch_content(url: str, original_content: str) -> str:
    """
    Use Jina Reader (Agent-Reach Web capability) to deep-fetch clean page markdown.
    Hardened with:
    - Binary file extension filtering
    - In-memory URL cache
    - Strict 2.5s socket timeout
    - Untrusted prompt injection neutralization
    - Safe fallback to original search snippet
    """
    if not url or not url.startswith(("http://", "https://")):
        return original_content

    # Skip non-HTML files
    parsed_path = urlparse(url).path.lower()
    if any(parsed_path.endswith(ext) for ext in NON_HTML_EXTENSIONS):
        logger.debug("Skipping Jina Reader for non-HTML URL: %s", url)
        return original_content

    # Check process-level cache
    if url in _jina_url_cache:
        return _jina_url_cache[url]

    try:
        jina_url = f"https://r.jina.ai/{url}"
        req = urllib.request.Request(
            jina_url,
            headers={
                "User-Agent": "Vajra-AI-Verification-Agent/3.0",
                "Accept": "text/plain, text/markdown",
            },
        )
        with urllib.request.urlopen(req, timeout=2.5) as response:
            if response.status == 200:
                content = response.read().decode("utf-8", errors="replace")
                clean = content.strip()
                if len(clean) > 50:
                    # Sanitize untrusted web content
                    safe_clean = _sanitize_untrusted_content(clean)
                    enriched = safe_clean[:500].strip() + "..."
                    _jina_url_cache[url] = enriched
                    logger.info("Jina Reader enriched content for: %s (%d chars)", url, len(enriched))
                    return enriched
    except urllib.error.HTTPError as http_err:
        logger.debug("Jina Reader HTTP %d for %s — using original snippet", http_err.code, url)
    except Exception as exc:
        logger.debug("Jina Reader deep-fetch bypassed for %s: %s", url, exc)

    _jina_url_cache[url] = original_content
    return original_content


def analyze_evidence(
    claim: str,
    ranked_results: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Enrich semantically-ranked evidence with source reliability data,
    compute a combined ranking score, deduplicate, and re-sort.

    Args:
        ranked_results: Output of semantic_ranker.rank_results() — each item
                        must have 'url', 'semantic_score', and optionally
                        'search_score', 'title', 'content'.

    Returns:
        A new list of enriched evidence dicts, each containing:
            rank                     (int)
            title                    (str)
            url                      (str)
            content                  (str)
            search_score             (float | None)
            semantic_score           (float)
            source_domain            (str)
            source_type              (str)
            source_reliability_score (float)
            reliability_reason       (str)
            combined_score           (float)   — ranking score, NOT truth probability
            stance                   (str)     — placeholder; set by Gemini in Stage 5

    Note:
        combined_score is an EVIDENCE RANKING SCORE.
        It is NOT a measure of whether the claim is true.
    """
    if not ranked_results:
        return []

    # Deduplicate first to avoid wasting embedding compute on duplicates.
    results = _deduplicate_by_url(ranked_results)
    logger.info(
        "Evidence analysis: %d results after deduplication (was %d)",
        len(results), len(ranked_results),
    )

    # Run BM25 lexical ranking and then fuse with semantic scores
    results = rank_bm25(claim, results)
    results = reciprocal_rank_fusion(results)

    enriched: list[dict[str, Any]] = []
    for item in results:
        # ── Source reliability ──────────────────────────────────────────────
        url = item.get("url", "")
        reliability = score_source(url)

        fusion_score = float(item.get("fusion_score", 0.0))
        reliability_score = reliability["source_reliability_score"]

        combined = round(
            FUSION_WEIGHT * fusion_score
            + RELIABILITY_WEIGHT * reliability_score,
            4,
        )

        content = item.get("content", "")
        # P2.4 Agent-Reach Integration: Expand short snippets for HIGH/MEDIUM reliability sources
        if len(content) < 100 and reliability["reliability_tier"] in ("HIGH", "MEDIUM"):
            content = _deep_fetch_content(url, content)

        enriched.append(
            {
                "title":                    item.get("title", ""),
                "url":                      url,
                "content":                  content,
                "search_score":             item.get("search_score"),
                "semantic_score":           item.get("semantic_score"),
                "lexical_score":            item.get("lexical_score"),
                "fusion_score":             fusion_score,
                "source_domain":            reliability["source_domain"],
                "source_type":              reliability["source_type"],
                "source_reliability_score": reliability_score,
                "reliability_tier":         reliability["reliability_tier"],
                "reliability_reason":       reliability["reliability_reason"],
                "combined_score":           combined,
                "stance":                   "unclear",
                "retrieval_provider":       item.get("retrieval_provider", "tavily"),
            }
        )

    # Re-sort by combined_score descending, then attach 1-based rank.
    enriched.sort(key=lambda x: x["combined_score"], reverse=True)
    for pos, item in enumerate(enriched, start=1):
        item["rank"] = pos

    logger.info(
        "Evidence analysis complete. Top combined_score=%.4f (type=%s)",
        enriched[0]["combined_score"] if enriched else 0.0,
        enriched[0]["source_type"] if enriched else "n/a",
    )

    return enriched
