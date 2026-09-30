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
