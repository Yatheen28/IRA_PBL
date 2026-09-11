"""
Language Service – VAJRA AI Stage 7
=====================================
Detects language of incoming claims and translates them to/from English
for use in the retrieval pipeline. Uses langdetect for detection and
Gemini for translation.

Supported languages: English, Hindi, Kannada, Tamil, Telugu, Malayalam
"""

from __future__ import annotations

import logging
import os
from typing import Any

from google import genai
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── Language code map ──────────────────────────────────────────────────────────
SUPPORTED_LANGUAGES: dict[str, str] = {
    "en": "English",
    "hi": "Hindi",
    "kn": "Kannada",
    "ta": "Tamil",
    "te": "Telugu",
    "ml": "Malayalam",
}

# ── Singleton Gemini client for translation ────────────────────────────────────
_TRANSLATION_MODEL = "gemini-3.6-flash"
_gemini_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is not None:
        return _gemini_client
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key.strip() == "your_gemini_api_key_here":
        raise EnvironmentError(
            "GEMINI_API_KEY is not configured. Add it to backend/.env."
        )
    _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


def detect_language(text: str) -> str:
    """
    Detect the language of *text*.
    Returns a BCP-47 language code (e.g. 'en', 'hi', 'ta').
    Falls back to 'en' on any detection error.
    """
    try:
        from langdetect import detect, LangDetectException  # type: ignore
        lang = detect(text)
        logger.info("Language detected: %r for text starting with: %r", lang, text[:60])
        return lang
    except Exception as exc:
        logger.warning("Language detection failed (%s) — defaulting to 'en'", exc)
        return "en"


def translate_to_english(text: str, source_lang: str) -> str:
    """
    Translate *text* from *source_lang* to English using Gemini.
    Returns the original text unchanged if already English or translation fails.
    """
    if source_lang == "en":
        return text

    lang_name = SUPPORTED_LANGUAGES.get(source_lang, source_lang)
    prompt = (
        f"Translate the following {lang_name} text to English. "
        f"Return ONLY the translated text, no explanation:\n\n{text}"
    )
    try:
        client = _get_client()
        response = client.models.generate_content(
            model=_TRANSLATION_MODEL, contents=prompt
        )
        translated = response.text.strip()
        logger.info(
            "Translated from %s to English: %r → %r",
            source_lang, text[:60], translated[:60],
        )
        return translated
    except Exception as exc:
        logger.warning("Translation to English failed: %s — using original text", exc)
        return text


def translate_from_english(text: str, target_lang: str) -> str:
    """
    Translate *text* from English back to *target_lang* using Gemini.
    Returns the original text unchanged if already English or translation fails.
    """
    if target_lang == "en":
        return text

    lang_name = SUPPORTED_LANGUAGES.get(target_lang, target_lang)
    prompt = (
        f"Translate the following English text to {lang_name}. "
        f"Return ONLY the translated text, no explanation:\n\n{text}"
    )
    try:
        client = _get_client()
        response = client.models.generate_content(
            model=_TRANSLATION_MODEL, contents=prompt
        )
        translated = response.text.strip()
        logger.info(
            "Translated from English to %s: %r → %r",
            target_lang, text[:60], translated[:60],
        )
        return translated
    except Exception as exc:
        logger.warning(
            "Translation to %s failed: %s — returning English text", target_lang, exc
        )
        return text


def normalize_claim(claim: str) -> dict[str, Any]:
    """
    Detect language, translate to English if necessary, and return
    a dict with the original and normalized claim.

    Returns:
        {
            "original_claim": str,
            "normalized_claim": str,   # English version (same if already English)
            "language": str,           # detected language code
        }
    """
    import re
    # Lightweight normalization: collapse whitespace
    clean_claim = re.sub(r'\s+', ' ', claim).strip()
    
    lang = detect_language(clean_claim)
    english_claim = translate_to_english(clean_claim, lang)
    return {
        "original_claim": claim,
        "normalized_claim": english_claim,
        "language": lang,
    }
