"""
/verify route – VAJRA AI
========================
Full pipeline: Language → Tavily → BGE → Source Reliability →
               Evidence Analysis → Gemini Verdict → Knowledge Graph

Also exposes POST /verify/image for image-based claims via OCR.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, field_validator

from app.services.web_retriever import search_evidence
from app.services.semantic_ranker import rank_results
from app.services.evidence_analyzer import analyze_evidence
from app.services.verdict_engine import generate_verdict
from app.services.language_service import normalize_claim, translate_from_english
from app.services.knowledge_graph import build_graph

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class VerifyRequest(BaseModel):
    claim: str

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
    semantic_score: float
    source_domain: str
    source_type: str
    source_reliability_score: float
    reliability_reason: str
    combined_score: float
    stance: str


class KnowledgeGraphData(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


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


# ── Shared pipeline logic ──────────────────────────────────────────────────────

def _run_pipeline(english_claim: str) -> dict[str, Any]:
    """
    Core verification pipeline for an English-normalised claim.
    Returns a dict matching VerifyResponse fields (minus language wrappers).
    """
    # Stage 1 – Tavily web retrieval
    logger.info("Stage 1: Tavily retrieval for claim: %r", english_claim[:80])
    try:
        raw_evidence = search_evidence(english_claim)
    except EnvironmentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Web search failed: {exc}") from exc

    if not raw_evidence:
        raise HTTPException(status_code=404, detail="No evidence found for the given claim.")

    # Stage 2 – BGE semantic ranking
    logger.info("Stage 2: BGE semantic ranking (%d results)", len(raw_evidence))
    try:
        ranked = rank_results(claim=english_claim, results=raw_evidence)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Semantic ranking failed: {exc}") from exc

    # Stage 3+4 – Source reliability + evidence analysis
    logger.info("Stage 3+4: Source reliability scoring and evidence analysis")
    try:
        enriched = analyze_evidence(ranked_results=ranked)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Evidence analysis failed: {exc}") from exc

    if not enriched:
        raise HTTPException(status_code=404, detail="No usable evidence survived analysis.")

    # Stage 5 – Gemini grounded verdict
    logger.info("Stage 5: Gemini verdict generation")
    try:
        verdict_result = generate_verdict(claim=english_claim, evidence=enriched)
    except EnvironmentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Verdict generation failed: {exc}") from exc

    # Stage 8 – Knowledge graph
    logger.info("Stage 8: Building knowledge graph")
    try:
        graph = build_graph(
            claim=english_claim,
            verdict=verdict_result["verdict"],
            evidence=verdict_result["evidence"],
        )
    except Exception as exc:
        logger.warning("Knowledge graph generation failed (non-fatal): %s", exc)
        graph = {"nodes": [], "edges": []}

    return {
        "verdict":                verdict_result["verdict"],
        "analysis_confidence":    verdict_result["analysis_confidence"],
        "summary":                verdict_result["summary"],
        "reasoning":              verdict_result["reasoning"],
        "evidence":               verdict_result["evidence"],
        "knowledge_graph":        graph,
        "limitations":            verdict_result["limitations"],
    }


# ── POST /verify (text claim) ─────────────────────────────────────────────────

@router.post("/verify", response_model=VerifyResponse, tags=["Verification"])
async def verify_claim(body: VerifyRequest) -> VerifyResponse:
    """
    Full verification pipeline for a text claim.

    - Detects language and translates to English if needed.
    - Retrieves web evidence via Tavily.
    - Ranks evidence by BGE semantic similarity.
    - Scores source reliability.
    - Generates a grounded verdict via Gemini.
    - Returns structured evidence + knowledge graph.

    **analysis_confidence** is NOT a truth probability — it reflects the
    model's confidence in its analysis given the supplied evidence.
    """
    # Stage 7 – Language detection + normalisation
    logger.info("POST /verify — claim: %r", body.claim[:80])
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

    pipeline = _run_pipeline(english_claim)

    # Translate summary/reasoning back to detected language if not English
    summary = pipeline["summary"]
    reasoning = pipeline["reasoning"]
    if detected_lang not in ("en", "en-US", "en-GB"):
        try:
            summary = translate_from_english(summary, detected_lang)
            reasoning = translate_from_english(reasoning, detected_lang)
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
    )


# ── POST /verify/image (OCR claim) ────────────────────────────────────────────

@router.post("/verify/image", response_model=VerifyResponse, tags=["Verification"])
async def verify_image(
    image: UploadFile = File(..., description="Image file (PNG/JPG/JPEG/WEBP)"),
) -> VerifyResponse:
    """
    Extract a claim from an uploaded image via OCR, then run the full
    verification pipeline.

    Supported formats: PNG, JPG, JPEG, WEBP.
    Returns 422 if no text is detected in the image.
    """
    logger.info("POST /verify/image — file: %r", image.filename)

    # Late import so EasyOCR is only loaded if this endpoint is actually used.
    from app.services.ocr_service import extract_text_from_image

    try:
        image_bytes = await image.read()
        extracted_text = extract_text_from_image(image_bytes, image.filename or "upload")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Stage 7 – Language detection on OCR text
    try:
        lang_info = normalize_claim(extracted_text)
    except Exception as exc:
        logger.warning("Language normalisation on OCR text failed: %s", exc)
        lang_info = {
            "original_claim": extracted_text,
            "normalized_claim": extracted_text,
            "language": "en",
        }

    english_claim = lang_info["normalized_claim"]
    detected_lang = lang_info["language"]

    pipeline = _run_pipeline(english_claim)

    summary = pipeline["summary"]
    reasoning = pipeline["reasoning"]
    if detected_lang not in ("en", "en-US", "en-GB"):
        try:
            summary = translate_from_english(summary, detected_lang)
            reasoning = translate_from_english(reasoning, detected_lang)
        except Exception as exc:
            logger.warning("Back-translation failed: %s", exc)

    return VerifyResponse(
        original_claim=extracted_text,
        normalized_claim=english_claim,
        language=detected_lang,
        verdict=pipeline["verdict"],
        analysis_confidence=pipeline["analysis_confidence"],
        summary=summary,
        reasoning=reasoning,
        evidence=[EvidenceItem(**e) for e in pipeline["evidence"]],
        knowledge_graph=KnowledgeGraphData(**pipeline["knowledge_graph"]),
        limitations=pipeline["limitations"],
    )
