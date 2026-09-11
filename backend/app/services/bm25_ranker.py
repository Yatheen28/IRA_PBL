"""
BM25 Lexical Ranker – VAJRA AI
================================
Lightweight lexical relevance scoring using BM25 (Okapi BM25).
Works alongside BGE semantic ranking for hybrid rank fusion.

BM25 scores measure keyword/lexical overlap, NOT semantic similarity.
Combined with BGE via Reciprocal Rank Fusion (RRF).
"""

from __future__ import annotations

import logging
import math
import re
from typing import Any

logger = logging.getLogger(__name__)


def _tokenize(text: str) -> list[str]:
    """Simple whitespace + punctuation tokenizer with lowercasing."""
    return re.findall(r"[a-z0-9]+", text.lower())


def _compute_bm25(
    query_tokens: list[str],
    documents: list[list[str]],
    k1: float = 1.5,
    b: float = 0.75,
) -> list[float]:
    """
    Compute BM25 scores for a query against a list of tokenized documents.

    Args:
        query_tokens: Tokenized query.
        documents:    List of tokenized documents.
        k1:           Term frequency saturation parameter.
        b:            Length normalization parameter.

    Returns:
        List of BM25 scores (one per document).
    """
    n = len(documents)
    if n == 0:
        return []

    # Average document length
    doc_lengths = [len(d) for d in documents]
    avgdl = sum(doc_lengths) / n if n > 0 else 1.0

    # Document frequency for each query term
    df: dict[str, int] = {}
    for token in set(query_tokens):
        df[token] = sum(1 for doc in documents if token in doc)

    scores: list[float] = []
    for i, doc in enumerate(documents):
        score = 0.0
        dl = doc_lengths[i]
        # Term frequency in this document
        tf_map: dict[str, int] = {}
        for token in doc:
            tf_map[token] = tf_map.get(token, 0) + 1

        for token in query_tokens:
            if token not in df or df[token] == 0:
                continue
            # IDF: log((N - df + 0.5) / (df + 0.5) + 1)
            idf = math.log((n - df[token] + 0.5) / (df[token] + 0.5) + 1.0)
            tf = tf_map.get(token, 0)
            # BM25 term score
            numerator = tf * (k1 + 1)
            denominator = tf + k1 * (1 - b + b * dl / avgdl)
            score += idf * (numerator / denominator)
        scores.append(score)

    return scores


def rank_bm25(
    claim: str,
    results: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Score results by BM25 lexical relevance to the claim.

    Args:
        claim:   The user-submitted claim text.
        results: Evidence items with 'title' and 'content'.

    Returns:
        Same results list, each augmented with 'lexical_score' (float).
        Sorted by lexical_score descending.
    """
    if not results:
        return []

    query_tokens = _tokenize(claim)
    if not query_tokens:
        # No meaningful tokens — assign zero scores
        for item in results:
            item["lexical_score"] = 0.0
        return results

    # Build document texts
    doc_texts = []
    for item in results:
        title = (item.get("title") or "").strip()
        content = (item.get("content") or "").strip()
        doc_texts.append(f"{title} {content}")

    doc_tokens = [_tokenize(text) for text in doc_texts]
    bm25_scores = _compute_bm25(query_tokens, doc_tokens)

    # Normalize scores to [0, 1] range
    max_score = max(bm25_scores) if bm25_scores else 1.0
    if max_score > 0:
        normalized = [s / max_score for s in bm25_scores]
    else:
        normalized = [0.0] * len(bm25_scores)

    for i, item in enumerate(results):
        item["lexical_score"] = round(normalized[i], 4)

    logger.info(
        "BM25 lexical ranking complete for %d results. Top score=%.4f",
        len(results), max(normalized) if normalized else 0.0,
    )

    return results


def reciprocal_rank_fusion(
    results: list[dict[str, Any]],
    k: int = 60,
    semantic_key: str = "semantic_score",
    lexical_key: str = "lexical_score",
) -> list[dict[str, Any]]:
    """
    Combine semantic and lexical rankings using Reciprocal Rank Fusion (RRF).

    RRF formula: score(d) = Σ 1 / (k + rank_i(d))

    This is a well-established rank fusion method that does not require
    arbitrary weight tuning. k=60 is the standard default from the
    original Cormack et al. (2009) paper.

    Args:
        results:      Evidence items with both semantic_score and lexical_score.
        k:            RRF constant (default 60).
        semantic_key: Key for semantic ranking score.
        lexical_key:  Key for lexical ranking score.

    Returns:
        Results sorted by fusion_score descending, with fusion_score added.
    """
    if not results:
        return []

    # Create separate rankings by each score
    by_semantic = sorted(results, key=lambda x: x.get(semantic_key, 0), reverse=True)
    by_lexical = sorted(results, key=lambda x: x.get(lexical_key, 0), reverse=True)

    # Build rank maps (using URL as identity)
    semantic_ranks: dict[str, int] = {}
    for rank, item in enumerate(by_semantic, start=1):
        url = item.get("url", "")
        semantic_ranks[url] = rank

    lexical_ranks: dict[str, int] = {}
    for rank, item in enumerate(by_lexical, start=1):
        url = item.get("url", "")
        lexical_ranks[url] = rank

    # Compute RRF fusion score
    for item in results:
        url = item.get("url", "")
        sem_rank = semantic_ranks.get(url, len(results) + 1)
        lex_rank = lexical_ranks.get(url, len(results) + 1)
        fusion = 1.0 / (k + sem_rank) + 1.0 / (k + lex_rank)
        item["fusion_score"] = round(fusion, 6)

    # Sort by fusion score descending
    results.sort(key=lambda x: x["fusion_score"], reverse=True)

    logger.info(
        "RRF fusion complete. Top fusion_score=%.6f",
        results[0]["fusion_score"] if results else 0.0,
    )

    return results
