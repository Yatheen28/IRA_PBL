"""
AI Image Detector – VAJRA AI
============================
Uses Gemini's vision capabilities to determine whether an uploaded image
is AI-generated or authentic, returning a structured verdict.
"""

from __future__ import annotations

import base64
import io
import logging
import os

from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

_AI_DETECT_MODEL = "gemini-3.5-flash-lite"

_PROMPT = """Analyse this image carefully and determine whether it appears to be:
1. AI-GENERATED (created by an AI image generator like DALL-E, Midjourney, Stable Diffusion, etc.)
2. AUTHENTIC (a real photograph or human-made artwork)

Look for these AI-generation indicators:
- Unnatural textures or surfaces (skin, fabric, water, hair)
- Anatomical errors (extra fingers, distorted hands/faces)
- Inconsistent lighting or shadows
- Blurry or morphed background details
- Overly perfect or surreal aesthetics
- Artifacts or blending errors at edges
- Text that is garbled or nonsensical
- Unnaturally symmetric or perfect compositions

Return ONLY a valid JSON object with exactly this structure (no markdown, no text outside JSON):
{
  "verdict": "<AI_GENERATED | AUTHENTIC | UNCERTAIN>",
  "confidence": <float 0.0–1.0 — your confidence in this verdict>,
  "summary": "<1–2 sentence plain-language explanation>",
  "indicators": ["<indicator 1>", "<indicator 2>", ...],
  "limitations": ["<limitation 1>", "<limitation 2>"]
}"""


def detect_ai_image(image_bytes: bytes, filename: str = "image.jpg") -> dict:
    """
    Use Gemini vision to detect if an image is AI-generated.

    Args:
        image_bytes: Raw bytes of the image file.
        filename:    Original filename (used to determine MIME type).

    Returns:
        Dict with keys: verdict, confidence, summary, indicators, limitations.
    """
    import json
    import re

    # Determine MIME type
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpeg"
    mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    mime_type = mime_map.get(ext, "image/jpeg")

    # Encode image as base64
    b64 = base64.b64encode(image_bytes).decode("utf-8")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY is not configured.")

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=_AI_DETECT_MODEL,
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part(
                            inline_data=types.Blob(mime_type=mime_type, data=b64)
                        ),
                        types.Part(text=_PROMPT),
                    ],
                )
            ],
        )
        raw = response.text.strip()
    except Exception as exc:
        logger.error("Gemini AI image detection failed: %s", exc)
        raise RuntimeError(f"AI image detection failed: {exc}") from exc

    # Parse JSON response
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if match:
        raw = match.group(1).strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Could not parse AI detection response as JSON: %r", raw[:300])
        return {
            "verdict": "UNCERTAIN",
            "confidence": 0.0,
            "summary": "Could not determine whether this image is AI-generated.",
            "indicators": [],
            "limitations": ["Response parsing failed."],
        }

    # Validate verdict
    valid_verdicts = {"AI_GENERATED", "AUTHENTIC", "UNCERTAIN"}
    if data.get("verdict") not in valid_verdicts:
        data["verdict"] = "UNCERTAIN"

    # Clamp confidence
    try:
        data["confidence"] = round(max(0.0, min(1.0, float(data.get("confidence", 0.5)))), 4)
    except (TypeError, ValueError):
        data["confidence"] = 0.5

    for field in ("indicators", "limitations"):
        if not isinstance(data.get(field), list):
            data[field] = []

    logger.info("AI image detection result: %s (confidence=%.2f)", data["verdict"], data["confidence"])
    return data
