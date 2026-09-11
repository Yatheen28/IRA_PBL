"""
Gemini Grounded Verdict Engine – VAJRA AI Stage 5
==================================================
Uses the Gemini API to analyse retrieved, ranked evidence and produce
a structured verdict. Gemini is STRICTLY constrained to the supplied
evidence — it must NOT use outside knowledge for the verdict.

IMPORTANT CONCEPTUAL RULES:
  - analysis_confidence is NOT a calibrated statistical probability.
  - A verdict of TRUE/FALSE means the evidence supports/contradicts the
    claim — it does not mean the claim is objectively proven/disproven.
  - INSUFFICIENT_EVIDENCE is a valid and important verdict.
  - Conflicting evidence must be reported, not resolved arbitrarily.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from google import genai
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── Model configuration ────────────────────────────────────────────────────────
_GEMINI_MODEL = "gemini-3.6-flash"   # Fast, cost-effective for structured tasks
_MAX_EVIDENCE_ITEMS = 5              # Top-N items sent to Gemini
_MAX_CONTENT_CHARS = 800            # Truncate long content to keep prompt manageable

# ── Valid verdicts ─────────────────────────────────────────────────────────────
VALID_VERDICTS = {
    "TRUE",
    "FALSE",
    "PARTIALLY_TRUE",
    "MISLEADING",
    "INSUFFICIENT_EVIDENCE",
    "CONFLICTING_EVIDENCE",
}

# ── Singleton Gemini client ────────────────────────────────────────────────────
_gemini_client: genai.Client | None = None


def _get_client() -> genai.Client:
    """Return a configured Gemini client, raising clearly if key is absent."""
    global _gemini_client
    if _gemini_client is not None:
        return _gemini_client

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key.strip() == "your_gemini_api_key_here":
        raise EnvironmentError(
            "GEMINI_API_KEY is not configured. Add it to backend/.env "
            "and restart the server."
        )
    _gemini_client = genai.Client(api_key=api_key)
    logger.info("Gemini client initialised with model: %s", _GEMINI_MODEL)
    return _gemini_client


def _format_evidence_for_prompt(evidence: list[dict[str, Any]]) -> str:
    """Render top-N evidence items as numbered text for the Gemini prompt."""
    items = evidence[:_MAX_EVIDENCE_ITEMS]
    lines: list[str] = []
    for i, item in enumerate(items, start=1):
        content = (item.get("content") or "")[:_MAX_CONTENT_CHARS]
        lines.append(
            f"[{i}] Source: {item.get('source_domain', 'unknown')} "
            f"(type: {item.get('source_type', 'unknown')}, "
            f"reliability: {item.get('source_reliability_score', 0):.2f})\n"
            f"Title: {item.get('title', '')}\n"
            f"URL: {item.get('url', '')}\n"
            f"Content: {content}\n"
        )
    return "\n".join(lines)


def _build_prompt(claim: str, evidence_text: str) -> str:
    return f"""You are an evidence analysis engine for a misinformation detection system.

STRICT RULES:
1. Use ONLY the evidence supplied below. Do NOT use your own knowledge.
2. Do NOT invent sources, quotations, or facts not present in the evidence.
3. Do NOT assume information that is not in the evidence.
4. If evidence conflicts, return verdict "CONFLICTING_EVIDENCE".
5. If evidence is absent or insufficient, return verdict "INSUFFICIENT_EVIDENCE".
6. "No result" does NOT automatically mean the claim is false.
7. analysis_confidence is your confidence in the analysis (0.0–1.0), NOT the probability the claim is true.

CLAIM TO ANALYSE:
"{claim}"

RETRIEVED EVIDENCE:
{evidence_text}

Return ONLY a valid JSON object with exactly this structure (no markdown, no explanation outside JSON):
{{
  "verdict": "<one of: TRUE | FALSE | PARTIALLY_TRUE | MISLEADING | INSUFFICIENT_EVIDENCE | CONFLICTING_EVIDENCE>",
  "analysis_confidence": <float 0.0–1.0>,
  "summary": "<1–2 sentence plain-language summary>",
  "reasoning": "<detailed reasoning referencing specific evidence items by their [N] number>",
  "supporting_evidence": [<list of [N] numbers from evidence that support the claim>],
  "contradicting_evidence": [<list of [N] numbers that contradict the claim>],
  "contextual_evidence": [<list of [N] numbers that provide context without clearly supporting or contradicting>],
  "limitations": ["<limitation 1>", "<limitation 2>"]
}}"""


def _parse_gemini_response(raw: str) -> dict[str, Any]:
    """
    Extract and parse the JSON object from Gemini's response text.
    Handles cases where Gemini wraps the JSON in markdown code fences.
    """
    # Strip markdown fences if present
    text = raw.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        text = match.group(1).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini returned non-JSON response: {exc}\nRaw: {raw[:500]}") from exc

    # Validate required fields
    verdict = data.get("verdict", "INSUFFICIENT_EVIDENCE")
    if verdict not in VALID_VERDICTS:
        logger.warning("Unexpected verdict value from Gemini: %r — defaulting to INSUFFICIENT_EVIDENCE", verdict)
        data["verdict"] = "INSUFFICIENT_EVIDENCE"

    # Ensure lists exist
    for field in ("supporting_evidence", "contradicting_evidence", "contextual_evidence", "limitations"):
        if not isinstance(data.get(field), list):
            data[field] = []

    # Clamp confidence
    conf = data.get("analysis_confidence", 0.5)
    try:
        data["analysis_confidence"] = round(max(0.0, min(1.0, float(conf))), 4)
    except (TypeError, ValueError):
        data["analysis_confidence"] = 0.5

    return data


def _assign_stances(
    evidence: list[dict[str, Any]],
    supporting: list[int],
    contradicting: list[int],
    contextual: list[int],
) -> list[dict[str, Any]]:
    """
    Update the 'stance' field on each evidence item based on Gemini's
    classification (1-based indices from the prompt).
    """
    supporting_set = {i - 1 for i in supporting if isinstance(i, int)}
    contradicting_set = {i - 1 for i in contradicting if isinstance(i, int)}
    contextual_set = {i - 1 for i in contextual if isinstance(i, int)}

    for idx, item in enumerate(evidence):
        if idx in supporting_set:
            item["stance"] = "supporting"
        elif idx in contradicting_set:
            item["stance"] = "contradicting"
        elif idx in contextual_set:
            item["stance"] = "contextual"
        else:
            item["stance"] = "unclear"
    return evidence


def generate_verdict(
    claim: str,
    evidence: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Call Gemini to produce a grounded verdict from supplied evidence.

    Args:
        claim:    The user-submitted claim (in English).
        evidence: Enriched evidence list from evidence_analyzer.analyze_evidence().

    Returns:
        A dict with keys: verdict, analysis_confidence, summary, reasoning,
        supporting_evidence (indices), contradicting_evidence (indices),
        contextual_evidence (indices), limitations, evidence (with stances).

    Raises:
        EnvironmentError: if GEMINI_API_KEY is not configured.
        RuntimeError:     if Gemini call or response parsing fails.
    """
    if not evidence:
        logger.warning("generate_verdict called with empty evidence — returning INSUFFICIENT_EVIDENCE")
        return {
            "verdict": "INSUFFICIENT_EVIDENCE",
            "analysis_confidence": 0.0,
            "summary": "No evidence was retrieved for this claim.",
            "reasoning": "The retrieval pipeline returned no usable evidence.",
            "supporting_evidence": [],
            "contradicting_evidence": [],
            "contextual_evidence": [],
            "limitations": ["No web evidence was found for this claim."],
        }

    client = _get_client()
    evidence_text = _format_evidence_for_prompt(evidence)
    prompt = _build_prompt(claim, evidence_text)

    logger.info("Sending claim to Gemini (%s) for verdict generation …", _GEMINI_MODEL)
    try:
        response = client.models.generate_content(
            model=_GEMINI_MODEL,
            contents=prompt,
        )
        raw_text = response.text
    except Exception as exc:
        logger.error("Gemini API call failed: %s", exc)
        raise RuntimeError(f"Gemini verdict generation failed: {exc}") from exc

    try:
        parsed = _parse_gemini_response(raw_text)
    except ValueError as exc:
        logger.error("Failed to parse Gemini response: %s", exc)
        raise RuntimeError(str(exc)) from exc

    # Assign stances back onto evidence items
    evidence = _assign_stances(
        evidence,
        supporting=parsed.get("supporting_evidence", []),
        contradicting=parsed.get("contradicting_evidence", []),
        contextual=parsed.get("contextual_evidence", []),
    )

    logger.info(
        "Verdict generated: %s (confidence=%.2f)",
        parsed["verdict"],
        parsed["analysis_confidence"],
    )

    return {
        "verdict":               parsed["verdict"],
        "analysis_confidence":   parsed["analysis_confidence"],
        "summary":               parsed.get("summary", ""),
        "reasoning":             parsed.get("reasoning", ""),
        "supporting_evidence":   parsed.get("supporting_evidence", []),
        "contradicting_evidence": parsed.get("contradicting_evidence", []),
        "contextual_evidence":   parsed.get("contextual_evidence", []),
        "limitations":           parsed.get("limitations", []),
        "evidence":              evidence,
    }
