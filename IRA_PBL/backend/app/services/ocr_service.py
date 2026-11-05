"""
OCR Service – VAJRA AI Stage 6
================================
Extracts text from uploaded images using EasyOCR.
EasyOCR is lazy-loaded (not at startup) because it's very large.

Supported formats: PNG, JPG, JPEG, WEBP
"""

from __future__ import annotations

import io
import logging
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# ── Accepted MIME types ────────────────────────────────────────────────────────
ACCEPTED_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
ACCEPTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

# ── EasyOCR singleton ─────────────────────────────────────────────────────────
_reader: Any | None = None
_LANGUAGES = ["en"]   # Extend as needed; adding languages increases model size


def _get_reader():
    """Lazy-load the EasyOCR reader on first call."""
    global _reader
    if _reader is None:
        try:
            import easyocr  # type: ignore
            logger.info("Loading EasyOCR reader (languages: %s) …", _LANGUAGES)
            _reader = easyocr.Reader(_LANGUAGES, gpu=False, verbose=False)
            logger.info("EasyOCR reader loaded successfully.")
        except ImportError as exc:
            raise RuntimeError(
                "EasyOCR is not installed. Run: pip install easyocr"
            ) from exc
        except Exception as exc:
            raise RuntimeError(f"Failed to initialise EasyOCR: {exc}") from exc
    return _reader


def _clean_text(raw_results: list) -> str:
    """
    Join EasyOCR results into a single cleaned string.
    Each result is a tuple: (bbox, text, confidence).
    Filter out very low-confidence detections.
    """
    MIN_CONFIDENCE = 0.3
    texts = [
        text.strip()
        for (_, text, conf) in raw_results
        if conf >= MIN_CONFIDENCE and text.strip()
    ]
    return " ".join(texts).strip()


def extract_text_from_image(
    image_bytes: bytes,
    filename: str = "image",
) -> str:
    """
    Run OCR on raw image bytes and return extracted text.

    Args:
        image_bytes: Raw bytes of the uploaded image file.
        filename:    Original filename (used for extension validation only).

    Returns:
        Extracted text string (non-empty if text was found).

    Raises:
        ValueError:   If the file type is unsupported or image cannot be decoded.
        RuntimeError: If EasyOCR fails to load or process the image.
    """
    # Validate extension
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ACCEPTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '{ext}'. "
            f"Accepted: {', '.join(sorted(ACCEPTED_EXTENSIONS))}"
        )

    # Decode bytes → numpy array for EasyOCR
    try:
        from PIL import Image  # type: ignore
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_np = np.array(pil_image)
    except Exception as exc:
        raise ValueError(f"Could not decode image '{filename}': {exc}") from exc

    logger.info("Running OCR on image '%s' (shape=%s) …", filename, image_np.shape)

    reader = _get_reader()
    try:
        results = reader.readtext(image_np)
    except Exception as exc:
        raise RuntimeError(f"OCR processing failed: {exc}") from exc

    extracted = _clean_text(results)

    if not extracted:
        logger.warning("OCR found no readable text in '%s'.", filename)
        raise ValueError(
            f"No readable text was detected in the image '{filename}'. "
            "Ensure the image contains clear, legible text."
        )

    logger.info(
        "OCR extracted %d chars from '%s': %r…",
        len(extracted), filename, extracted[:80],
    )
    return extracted


def extract_claim_from_image_and_caption(
    image_bytes: bytes,
    caption: str | None = None,
    filename: str = "image.jpg"
) -> dict:
    """
    Multimodal visual claim extraction using Gemini Vision with EasyOCR fallback.
    Understands Indian scripts (Kannada, Hindi, Tamil, Telugu, etc.), visual entities,
    and intelligently contextualizes user captions (discarding conversational noise).
    """
    import base64
    import json
    import os
    import re
    from google import genai
    from google.genai import types

    api_key = os.getenv("GEMINI_API_KEY")
    clean_caption = caption.strip() if caption else ""

    if api_key:
        try:
            ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpeg"
            mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
            mime_type = mime_map.get(ext, "image/jpeg")
            b64 = base64.b64encode(image_bytes).decode("utf-8")

            client = genai.Client(api_key=api_key)
            prompt = f"""You are VAJRA AI's Multimodal Fact-Checking Claim Extractor.
Carefully examine this image along with any text caption provided by the user: "{clean_caption}".

CRITICAL INSTRUCTIONS FOR IMAGE VS CAPTION ANALYSIS:
1. Distinguish between conversational chatter and the core factual claim:
   - Users frequently send photos with casual or rhetorical captions like "look at this car bro", "check this out", "hai", "is this real?", "omg look", "can you believe this".
   - DO NOT make casual or conversational captions the subject of verification! Ignore the conversational filler.
   - Look deeply at the IMAGE itself: identify people (e.g. Sonu Sood, politicians, athletes), events, headlines, dates, claims, vehicle models, announcements, or viral photos.
   - If the caption contains a specific factual assertion about the image (e.g. "Tata bought Ferrari" or "Sonu Sood announced Season 4"), verify that specific assertion against the image facts.
   - If the image contains text in Indian scripts (Kannada, Hindi, Tamil, Telugu, Malayalam, Bengali, etc.), accurately read and transcribe it in the original script.
2. Formulate a clear, specific, factual claim in English that encapsulates what needs to be verified (e.g. "Sonu Sood is hosting Season 4 of Putturada Huli" or "BMW released a flying electric car").

Return ONLY a valid JSON object (no markdown formatting, no backticks):
{{
  "transcribed_text": "<verbatim text from image in original language>",
  "detected_language": "<BCP-47 language code e.g. kn, hi, en, ta, te>",
  "claim_english": "<concise English factual statement to verify>"
}}"""

            for model_id in ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3-flash-preview"]:
                try:
                    response = client.models.generate_content(
                        model=model_id,
                        contents=[
                            types.Content(
                                role="user",
                                parts=[
                                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                                    types.Part.from_text(text=prompt),
                                ],
                            )
                        ],
                    )
                    raw_text = response.text.strip()
                    json_str = re.sub(r"^```(?:json)?\s*", "", raw_text)
                    json_str = re.sub(r"\s*```$", "", json_str).strip()
                    parsed = json.loads(json_str)
                    if parsed.get("claim_english"):
                        logger.info("Gemini Vision extracted claim using %s: '%s' (lang=%s)", model_id, parsed["claim_english"], parsed.get("detected_language"))
                        return {
                            "original_text": parsed.get("transcribed_text", ""),
                            "claim": parsed["claim_english"],
                            "language": parsed.get("detected_language", "en")
                        }
                except Exception as m_err:
                    logger.warning("Gemini Vision attempt with %s failed: %s", model_id, m_err)
        except Exception as exc:
            logger.warning("Gemini Vision claim extraction failed: %s", exc)

    # Fallback to EasyOCR
    logger.info("Falling back to local EasyOCR extraction...")
    try:
        ocr_text = extract_text_from_image(image_bytes, filename)
    except Exception as e:
        logger.warning("EasyOCR extraction also failed: %s", e)
        ocr_text = clean_caption or "Unidentified image claim"

    claim = ocr_text
    if clean_caption and len(clean_caption) > 10 and not any(w in clean_caption.lower() for w in ["look", "bro", "hai", "check"]):
        claim = f"{clean_caption}: {ocr_text}"
    return {
        "original_text": ocr_text,
        "claim": claim,
        "language": "en"
    }
