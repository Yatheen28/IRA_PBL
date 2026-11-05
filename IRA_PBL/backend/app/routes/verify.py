"""
/verify route – VAJRA AI
========================
Full pipeline: Language → Tavily → BGE → Source Reliability →
               Evidence Analysis → Gemini Verdict → Knowledge Graph

Also exposes:
  POST /verify/image       for image-based claims via OCR then pipeline
  POST /verify/image/ai-detect  for AI-generated image detection
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.db.session import get_db, SessionLocal
from app.services.web_retriever import search_evidence
from app.services.semantic_ranker import rank_results
from app.services.evidence_analyzer import analyze_evidence
from app.services.verdict_engine import generate_verdict
from app.services.language_service import normalize_claim, translate_from_english
from app.services.knowledge_graph import build_graph
from app.services.ai_image_detector import detect_ai_image
from app.services.verification_cache import (
    lookup_cache,
    store_cache,
    acquire_coalesce_lock,
    release_coalesce_lock,
    make_cache_key,
    get_cache_stats,
    clear_cache,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class VerifyRequest(BaseModel):
    claim: str
    force_refresh: bool = False

    @field_validator("claim")
    @classmethod
    def claim_must_not_be_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("claim must not be empty or whitespace-only")
        return v.strip()


class EvidenceItem(BaseModel):
    rank: int
    title: str
    url: str
    content: str
    search_score: float | None = None
    semantic_score: float | None = None
    lexical_score: float | None = None
    fusion_score: float | None = None
    source_domain: str
    source_type: str
    source_reliability_score: float
    reliability_tier: str = "UNKNOWN"
    reliability_reason: str
    combined_score: float
    stance: str
    retrieval_provider: str = "tavily"


class KnowledgeGraphData(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    timeline: list[dict[str, Any]] = []
    variations: list[dict[str, Any]] = []
    spread_path: list[dict[str, Any]] = []
    debunking_path: list[dict[str, Any]] = []
    current_status: str = ""
    current_status_summary: str = ""
    evidence_nodes: list[dict[str, Any]] = []



class SourceDiversityMeta(BaseModel):
    unique_domains: int
    domain_distribution: dict[str, int]
    max_domain_concentration: float
    total_evidence: int


class CacheMeta(BaseModel):
    cached: bool = False
    cache_key: str | None = None
    cached_at: str | None = None
    expires_at: str | None = None
    ttl_remaining_seconds: int | None = None
    hit_count: int = 0
    pipeline_version: str = "3.0.0"


class VerifyResponse(BaseModel):
    original_claim: str
    normalized_claim: str
    language: str
    verdict: str
    analysis_confidence: float
    summary: str
    reasoning: str
    evidence: list[EvidenceItem]
    knowledge_graph: KnowledgeGraphData
    limitations: list[str]
    source_diversity: SourceDiversityMeta | None = None
    cache_metadata: CacheMeta | None = None


class AIImageDetectResponse(BaseModel):
    verdict: str                    # AI_GENERATED | AUTHENTIC | UNCERTAIN
    confidence: float
    summary: str
    indicators: list[str]
    limitations: list[str]


# ── Shared pipeline logic ──────────────────────────────────────────────────────

import asyncio
from collections import Counter


def _compute_source_diversity(evidence: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute source diversity metadata from evidence list."""
    domains = [e.get("source_domain", "unknown") for e in evidence]
    dist = dict(Counter(domains))
    total = len(evidence)
    max_conc = max(dist.values()) / total if total > 0 else 0.0
    return {
        "unique_domains": len(dist),
        "domain_distribution": dist,
        "max_domain_concentration": round(max_conc, 4),
        "total_evidence": total,
    }


async def _run_pipeline(english_claim: str) -> dict[str, Any]:
    """
    Core verification pipeline for an English-normalised claim.
    Returns a dict matching VerifyResponse fields (minus language wrappers).
    """
    # Stage 1 – Tavily web retrieval
    logger.info("Stage 1: Tavily retrieval for claim: %r", english_claim[:80])
    try:
        raw_evidence = await asyncio.to_thread(search_evidence, english_claim, 15)
    except EnvironmentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Web search failed: {exc}") from exc

    if not raw_evidence:
        raise HTTPException(status_code=404, detail="No evidence found for the given claim.")

    # Stage 2 – BGE semantic ranking
    logger.info("Stage 2: BGE semantic ranking (%d results)", len(raw_evidence))
    try:
        ranked = await asyncio.to_thread(rank_results, english_claim, raw_evidence)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Semantic ranking failed: {exc}") from exc

    # Stage 3+4 – Source reliability + evidence analysis
    logger.info("Stage 3+4: Source reliability scoring and evidence analysis")
    try:
        enriched = await asyncio.to_thread(analyze_evidence, english_claim, ranked)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Evidence analysis failed: {exc}") from exc

    if not enriched:
        raise HTTPException(status_code=404, detail="No usable evidence survived analysis.")

    # Stage 5 – Gemini grounded verdict
    logger.info("Stage 5: Gemini verdict generation")
    try:
        # Wrap Gemini call with a sensible 25-second timeout
        verdict_result = await asyncio.wait_for(
            asyncio.to_thread(generate_verdict, english_claim, enriched),
            timeout=25.0
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Gemini analysis timed out.") from exc
    except EnvironmentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Verdict generation failed: {exc}") from exc

    # Stage 8 – Knowledge graph
    logger.info("Stage 8: Building knowledge graph")
    try:
        graph = await asyncio.to_thread(
            build_graph,
            english_claim,
            verdict_result["verdict"],
            verdict_result["evidence"]
        )
    except Exception as exc:
        logger.warning("Knowledge graph generation failed (non-fatal): %s", exc)
        graph = {"nodes": [], "edges": []}

    # Compute source diversity metadata
    diversity = _compute_source_diversity(verdict_result["evidence"])

    return {
        "verdict":                verdict_result["verdict"],
        "analysis_confidence":    verdict_result["analysis_confidence"],
        "summary":                verdict_result["summary"],
        "reasoning":              verdict_result["reasoning"],
        "evidence":               verdict_result["evidence"],
        "knowledge_graph":        graph,
        "limitations":            verdict_result["limitations"],
        "source_diversity":       diversity,
    }


async def _get_or_execute_pipeline(
    raw_claim: str,
    english_claim: str,
    detected_lang: str,
    db: Session,
    mode: str = "standard",
    force_refresh: bool = False,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """
    Look up cache or execute verification pipeline with single-flight request coalescing.
    Returns (pipeline_dict, cache_metadata_dict).
    """
    # 1. Tier 2 lookup check (normalized claim key)
    cached, hit_tier = lookup_cache(
        db,
        raw_claim=raw_claim,
        normalized_claim=english_claim,
        mode=mode,
        force_refresh=force_refresh,
    )
    if cached:
        return cached, cached.get("cache_metadata")

    # 2. Acquire lock for single-flight request coalescing
    cache_key = make_cache_key(english_claim, mode=mode, prefix="norm")
    lock, is_coalesced = await acquire_coalesce_lock(cache_key)

    try:
        # If another concurrent request just finished, re-check the cache
        if is_coalesced and not force_refresh:
            cached_again, status = lookup_cache(
                db,
                raw_claim=raw_claim,
                normalized_claim=english_claim,
                mode=mode,
                force_refresh=False,
            )
            if cached_again:
                logger.info("Coalesced duplicate request hit freshly cached verdict for key: %s", cache_key[:12])
                return cached_again, cached_again.get("cache_metadata")

        # 3. Cache Miss: Execute full 7-stage verification pipeline
        pipeline_result = await _run_pipeline(english_claim)

        # 4. Store in cache only on successful completion
        store_cache(
            db,
            raw_claim=raw_claim,
            normalized_claim=english_claim,
            language=detected_lang,
            pipeline_result=pipeline_result,
            mode=mode,
        )

        cache_meta = {
            "cached": False,
            "cache_key": cache_key,
            "hit_count": 0,
            "pipeline_version": "3.0.0",
        }
        return pipeline_result, cache_meta

    finally:
        await release_coalesce_lock(cache_key, lock)


# ── POST /verify (text claim) ─────────────────────────────────────────────────

@router.post("/verify", response_model=VerifyResponse, tags=["Verification"])
async def verify_claim(
    body: VerifyRequest,
    force_refresh: bool = False,
    db: Session | None = Depends(get_db),
) -> VerifyResponse:
    """
    Full verification pipeline for a text claim with 2-tier persistent memory.

    - Tier 1: Fast raw key lookup (<5ms).
    - Tier 2: Normalized semantic key lookup.
    - Single-flight concurrency locking prevents redundant API requests.
    - Preserves exact response schema for web & mobile clients.
    """
    should_close_db = False
    if db is None or not isinstance(db, Session):
        db = SessionLocal()
        should_close_db = True

    try:
        effective_force = bool(getattr(body, "force_refresh", False)) or (
            isinstance(force_refresh, bool) and force_refresh
        )

        # Tier 1 fast check (bypasses language normalization if exact raw claim was already verified)
        if not effective_force:
            tier1_cached, hit_tier = lookup_cache(
                db,
                raw_claim=body.claim,
                mode="standard",
                force_refresh=False,
            )
            if tier1_cached:
                return VerifyResponse(
                    original_claim=tier1_cached["original_claim"],
                    normalized_claim=tier1_cached["normalized_claim"],
                    language=tier1_cached["language"],
                    verdict=tier1_cached["verdict"],
                    analysis_confidence=tier1_cached["analysis_confidence"],
                    summary=tier1_cached["summary"],
                    reasoning=tier1_cached["reasoning"],
                    evidence=[EvidenceItem(**e) for e in tier1_cached["evidence"]],
                    knowledge_graph=KnowledgeGraphData(**tier1_cached["knowledge_graph"]),
                    limitations=tier1_cached["limitations"],
                    source_diversity=SourceDiversityMeta(**tier1_cached["source_diversity"]) if tier1_cached.get("source_diversity") else None,
                    cache_metadata=CacheMeta(**tier1_cached["cache_metadata"]) if tier1_cached.get("cache_metadata") else None,
                )

        # Stage 7 – Language detection + normalisation
        logger.info("POST /verify — claim: %r (force_refresh=%s)", body.claim[:80], effective_force)
        try:
            lang_info = normalize_claim(body.claim)
        except Exception as exc:
            logger.warning("Language normalisation failed: %s — using original claim", exc)
            lang_info = {
                "original_claim": body.claim,
                "normalized_claim": body.claim,
                "language": "en",
            }

        english_claim = lang_info["normalized_claim"]
        detected_lang = lang_info["language"]

        pipeline, cache_meta = await _get_or_execute_pipeline(
            raw_claim=body.claim,
            english_claim=english_claim,
            detected_lang=detected_lang,
            db=db,
            mode="standard",
            force_refresh=effective_force,
        )

        # Translate summary/reasoning back to detected language if non-English and freshly generated
        summary = pipeline["summary"]
        reasoning = pipeline["reasoning"]
        is_cached = cache_meta and cache_meta.get("cached", False)
        if detected_lang not in ("en", "en-US", "en-GB") and not is_cached:
            try:
                summary, reasoning = await asyncio.wait_for(
                    asyncio.gather(
                        asyncio.to_thread(translate_from_english, summary, detected_lang),
                        asyncio.to_thread(translate_from_english, reasoning, detected_lang)
                    ),
                    timeout=10.0
                )
            except asyncio.TimeoutError:
                logger.warning("Back-translation timed out — returning English response")
            except Exception as exc:
                logger.warning("Back-translation failed: %s — returning English response", exc)

        return VerifyResponse(
            original_claim=body.claim,
            normalized_claim=english_claim,
            language=detected_lang,
            verdict=pipeline["verdict"],
            analysis_confidence=pipeline["analysis_confidence"],
            summary=summary,
            reasoning=reasoning,
            evidence=[EvidenceItem(**e) for e in pipeline["evidence"]],
            knowledge_graph=KnowledgeGraphData(**pipeline["knowledge_graph"]),
            limitations=pipeline["limitations"],
            source_diversity=SourceDiversityMeta(**pipeline["source_diversity"]) if pipeline.get("source_diversity") else None,
            cache_metadata=CacheMeta(**cache_meta) if cache_meta else None,
        )
    finally:
        if should_close_db:
            db.close()


# ── POST /verify/image (Multimodal OCR & Visual claim) ─────────────────────────

@router.post("/verify/image", response_model=VerifyResponse, tags=["Verification"])
async def verify_image(
    image: UploadFile = File(..., description="Image file (PNG/JPG/JPEG/WEBP)"),
    caption: str | None = Form(None, description="Optional accompanying caption or user text"),
    force_refresh: bool = False,
    db: Session | None = Depends(get_db),
) -> VerifyResponse:
    """
    Extract a factual claim from an uploaded image (and optional caption) via
    Gemini Multimodal Vision + EasyOCR fallback, then verify with persistent memory.
    """
    effective_force = isinstance(force_refresh, bool) and force_refresh
    logger.info("POST /verify/image — file: %r, caption: %r (force_refresh=%s)", image.filename, caption, effective_force)

    should_close_db = False
    if db is None or not isinstance(db, Session):
        db = SessionLocal()
        should_close_db = True

    try:
        from app.services.ocr_service import extract_claim_from_image_and_caption

        try:
            image_bytes = await image.read()
            extracted_data = await asyncio.to_thread(
                extract_claim_from_image_and_caption, image_bytes, caption, image.filename or "upload"
            )
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Image processing failed: {exc}") from exc

        english_claim = extracted_data["claim"]
        detected_lang = extracted_data["language"]
        original_text = extracted_data["original_text"] or english_claim

        pipeline, cache_meta = await _get_or_execute_pipeline(
            raw_claim=original_text,
            english_claim=english_claim,
            detected_lang=detected_lang,
            db=db,
            mode="ocr",
            force_refresh=force_refresh,
        )

        summary = pipeline["summary"]
        reasoning = pipeline["reasoning"]
        is_cached = cache_meta and cache_meta.get("cached", False)
        if detected_lang not in ("en", "en-US", "en-GB") and not is_cached:
            try:
                summary, reasoning = await asyncio.wait_for(
                    asyncio.gather(
                        asyncio.to_thread(translate_from_english, summary, detected_lang),
                        asyncio.to_thread(translate_from_english, reasoning, detected_lang)
                    ),
                    timeout=10.0
                )
            except Exception as exc:
                logger.warning("Back-translation failed: %s", exc)

        return VerifyResponse(
            original_claim=original_text,
            normalized_claim=english_claim,
            language=detected_lang,
            verdict=pipeline["verdict"],
            analysis_confidence=pipeline["analysis_confidence"],
            summary=summary,
            reasoning=reasoning,
            evidence=[EvidenceItem(**e) for e in pipeline["evidence"]],
            knowledge_graph=KnowledgeGraphData(**pipeline["knowledge_graph"]),
            limitations=pipeline["limitations"],
            source_diversity=SourceDiversityMeta(**pipeline["source_diversity"]) if pipeline.get("source_diversity") else None,
            cache_metadata=CacheMeta(**cache_meta) if cache_meta else None,
        )
    finally:
        if should_close_db:
            db.close()


# ── Cache Observability & Management Endpoints ────────────────────────────────

@router.get("/verify/cache/stats", tags=["Verification"])
async def get_verification_cache_telemetry(db: Session = Depends(get_db)):
    """Retrieve cache hit/miss statistics, active entries, and storage status."""
    return get_cache_stats(db)


@router.post("/verify/cache/clear", tags=["Verification"])
async def clear_verification_cache_records(
    expired_only: bool = Query(False, description="If true, only deletes expired cache entries"),
    db: Session = Depends(get_db),
):
    """Safely clear verification cache entries (all or expired only)."""
    count = clear_cache(db, expired_only=expired_only)
    return {"ok": True, "cleared_count": count, "expired_only": expired_only}


# ── POST /verify/image/ai-detect (AI image generation detector) ───────────────

@router.post("/verify/image/ai-detect", response_model=AIImageDetectResponse, tags=["Verification"])
async def detect_ai_generated_image(
    image: UploadFile = File(..., description="Image file (PNG/JPG/JPEG/WEBP)"),
) -> AIImageDetectResponse:
    """
    Analyse an uploaded image to determine whether it was AI-generated.

    Uses Gemini vision to check for AI-generation artefacts (distorted anatomy,
    unnatural textures, hallucinated text, etc.).

    Returns:
        verdict:    AI_GENERATED | AUTHENTIC | UNCERTAIN
        confidence: Gemini's confidence in the verdict (0.0–1.0)
        summary:    Plain-language explanation
        indicators: List of detected AI-generation indicators
        limitations: Caveats about the analysis
    """
    logger.info("POST /verify/image/ai-detect — file: %r", image.filename)

    try:
        image_bytes = await image.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read image: {exc}") from exc

    try:
        result = await asyncio.to_thread(
            detect_ai_image, image_bytes, image.filename or "upload.jpg"
        )
    except EnvironmentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return AIImageDetectResponse(**result)

