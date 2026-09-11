"""
Semantic Evidence Ranker – VAJRA AI Stage 2
Embeds the user's claim and retrieved evidence with BGE, then ranks
results by cosine similarity. Pure ranking; no verdict is generated.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

# ── Singleton model ───────────────────────────────────────────────────────────
# Loaded once at module import time so the heavy model weights are not
# reloaded on every /verify call. BGE base is ~440 MB; loading is slow.
_MODEL_NAME = "BAAI/bge-base-en-v1.5"
_model: SentenceTransformer | None = None


def load_model() -> None:
    """
    Explicitly pre-load the BGE model.
    Call this once at application startup (e.g. via FastAPI lifespan).
    Subsequent calls are no-ops because of the singleton guard.
    """
    global _model
    if _model is None:
        logger.info("Loading BGE embedding model: %s …", _MODEL_NAME)
        try:
            _model = SentenceTransformer(_MODEL_NAME)
            logger.info("BGE model loaded successfully.")
        except Exception as exc:
            logger.error("Failed to load BGE model: %s", exc)
            raise RuntimeError(f"Could not load BGE model '{_MODEL_NAME}': {exc}") from exc
    else:
        logger.debug("BGE model already loaded — skipping reload.")


def _get_model() -> SentenceTransformer:
    """Return the cached model, loading it on first access if needed."""
    global _model
    if _model is None:
        load_model()
    return _model  # type: ignore[return-value]


# ── BGE-specific query prompt ─────────────────────────────────────────────────
# BGE retrieval models expect a task description prefix on the query side only.
# Evidence passages are embedded as-is (no prefix).
_BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

# Minimum character length to consider a result meaningful.
_MIN_CONTENT_LENGTH = 20


def _build_evidence_text(item: dict[str, Any]) -> str:
    """
    Concatenate title + content for embedding.
    URL is intentionally excluded — it carries no semantic signal.
    Falls back gracefully when either field is absent or empty.
    Returns an empty string if there is nothing meaningful to embed.
    """
    title = (item.get("title") or "").strip()
    content = (item.get("content") or "").strip()
    if title and content:
        return f"{title}. {content}"
    return title or content or ""


def _has_meaningful_text(text: str) -> bool:
    """Return True if *text* is long enough to be worth embedding."""
    return len(text) >= _MIN_CONTENT_LENGTH


def rank_results(
    claim: str,
    results: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Re-rank *results* by semantic relevance to *claim*.

    Args:
        claim:   The user-submitted claim text.
        results: Raw evidence items from web_retriever.search_evidence().
                 Each item must contain 'title', 'url', 'content', 'score'.

    Returns:
        A new list of evidence dicts, each augmented with:
            - search_score   (float | None) – original Tavily relevance score
            - semantic_score (float)         – BGE cosine similarity (semantic
                                               relevance score, NOT a truth score)
            - rank           (int)           – 1-based rank after re-ranking
        Sorted by semantic_score descending.

    Notes:
        Results whose combined title + content are too short to be meaningful
        are silently skipped and excluded from the output.
        semantic_score measures *semantic relevance*, not truthfulness.
    """
    logger.info("Claim received for semantic ranking: %r", claim)

    if not results:
        logger.warning("rank_results called with an empty results list.")
        return []

    # ── Filter out items with no usable text ─────────────────────────────────
    valid_pairs: list[tuple[dict[str, Any], str]] = []
    for item in results:
        text = _build_evidence_text(item)
        if _has_meaningful_text(text):
            valid_pairs.append((item, text))
        else:
            logger.debug(
                "Skipping result with insufficient content: title=%r",
                item.get("title"),
            )

    logger.info(
        "Web results retrieved: %d | Results with meaningful text: %d",
        len(results),
        len(valid_pairs),
    )

    if not valid_pairs:
        logger.warning("No results with meaningful text — returning empty list.")
        return []

    items_to_rank, evidence_texts = zip(*valid_pairs)

    # ── Embed claim and evidence ──────────────────────────────────────────────
    model = _get_model()

    try:
        # Claim: use BGE query prefix for asymmetric retrieval.
        # Evidence: embed without prefix (passage side).
        # normalize_embeddings=True makes cosine similarity equivalent to dot product.
        claim_embedding: np.ndarray = model.encode(
            [_BGE_QUERY_PREFIX + claim],
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        evidence_embeddings: np.ndarray = model.encode(
            list(evidence_texts),
            normalize_embeddings=True,
            show_progress_bar=False,
        )
    except Exception as exc:
        logger.error("Embedding generation failed: %s", exc)
        raise RuntimeError(f"Failed to generate BGE embeddings: {exc}") from exc

    logger.info(
        "BGE embeddings generated for %d result(s).", len(evidence_texts)
    )

    # ── Cosine similarity ─────────────────────────────────────────────────────
    # cosine_similarity returns shape (1, n); flatten to (n,)
    similarities: np.ndarray = cosine_similarity(
        claim_embedding, evidence_embeddings
    ).flatten()

    # ── Build ranked result list ──────────────────────────────────────────────
    ranked: list[dict[str, Any]] = []
    for i, item in enumerate(items_to_rank):
        ranked.append(
            {
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "content": item.get("content", ""),
                # Preserve the original Tavily search score for future hybrid scoring.
                "search_score": item.get("score"),
                # Semantic relevance score (NOT a truth/confidence score).
                "semantic_score": float(round(float(similarities[i]), 4)),
            }
        )

    # Sort by semantic relevance, highest first.
    ranked.sort(key=lambda x: x["semantic_score"], reverse=True)

    # Attach 1-based rank after sorting.
    for rank_pos, item in enumerate(ranked, start=1):
        item["rank"] = rank_pos

    logger.info(
        "Semantic ranking completed. Top result semantic_score=%.4f",
        ranked[0]["semantic_score"] if ranked else 0.0,
    )

    return ranked
