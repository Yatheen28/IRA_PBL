"""
Source Reliability Scoring – VAJRA AI Stage 3
==============================================
Assigns a heuristic reliability score to every web source based on its
domain. This is a TRANSPARENT HEURISTIC — NOT a guarantee of truth.

A high source_reliability_score means the domain is considered an
authoritative source; it does NOT mean the specific article is correct.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ── Configurable score constants ──────────────────────────────────────────────
# These are heuristic baseline scores, not mathematical truth probabilities.

SCORES: dict[str, float] = {
    "government":             0.90,
    "international_authority": 0.90,
    "scientific_medical":     0.90,
    "fact_checking":          0.90,
    "academic_research":      0.85,
    "established_news":       0.85,
    "reference":              0.75,
    "general_web":            0.50,
    "user_generated":         0.30,
    "unknown":                0.50,
}

# ── Curated seed domain → source-type mapping ─────────────────────────────────
# Kept intentionally small and transparent.  Do NOT grow this into a giant
# manually-maintained list; the heuristic is meant to be auditable.

_DOMAIN_MAP: dict[str, str] = {
    # Government / official
    "gov":                    "government",
    "gov.in":                 "government",
    "india.gov.in":           "government",
    "pib.gov.in":             "government",
    "gov.uk":                 "government",
    "nasa.gov":               "government",
    "cdc.gov":                "scientific_medical",
    "nih.gov":                "scientific_medical",
    "nhs.uk":                 "scientific_medical",
    "fda.gov":                "scientific_medical",
    "icmr.gov.in":            "scientific_medical",

    # International authority
    "who.int":                "international_authority",
    "un.org":                 "international_authority",
    "unicef.org":             "international_authority",
    "worldbank.org":          "international_authority",

    # Scientific / medical
    "mayoclinic.org":         "scientific_medical",
    "webmd.com":              "scientific_medical",
    "healthline.com":         "scientific_medical",
    "medlineplus.gov":        "scientific_medical",

    # Academic / research
    "arxiv.org":              "academic_research",
    "nature.com":             "academic_research",
    "sciencedirect.com":      "academic_research",
    "springer.com":           "academic_research",
    "ncbi.nlm.nih.gov":       "academic_research",
    "pmc.ncbi.nlm.nih.gov":   "academic_research",
    "pubmed.ncbi.nlm.nih.gov": "academic_research",
    "scholar.google.com":     "academic_research",
    "jstor.org":              "academic_research",
    "researchgate.net":       "academic_research",
    "cell.com":               "academic_research",
    "thelancet.com":          "academic_research",
    "bmj.com":                "academic_research",
    "jamanetwork.com":        "academic_research",
    "nejm.org":               "academic_research",

    # Fact-checking
    "snopes.com":             "fact_checking",
    "factcheck.org":          "fact_checking",
    "fullfact.org":           "fact_checking",
    "politifact.com":         "fact_checking",
    "boomlive.in":            "fact_checking",
    "altnews.in":             "fact_checking",
    "factchecker.in":         "fact_checking",
    "vishvasnews.com":        "fact_checking",
    "africacheck.org":        "fact_checking",
    "poynter.org":            "fact_checking",

    # Established news (international)
    "reuters.com":            "established_news",
    "apnews.com":             "established_news",
    "bbc.com":                "established_news",
    "bbc.co.uk":              "established_news",
    "theguardian.com":        "established_news",
    "nytimes.com":            "established_news",
    "washingtonpost.com":     "established_news",
    "economist.com":          "established_news",
    "ft.com":                 "established_news",
    "bloomberg.com":          "established_news",
    "wsj.com":                "established_news",
    "npr.org":                "established_news",
    "pbs.org":                "established_news",
    "abc.net.au":             "established_news",

    # Established news (Indian)
    "thehindu.com":           "established_news",
    "hindustantimes.com":     "established_news",
    "timesofindia.indiatimes.com": "established_news",
    "ndtv.com":               "established_news",
    "theprint.in":            "established_news",
    "thewire.in":             "established_news",
    "scroll.in":              "established_news",
    "livemint.com":           "established_news",
    "indianexpress.com":      "established_news",
    "businessstandard.com":   "established_news",

    # Reference
    "wikipedia.org":          "reference",
    "britannica.com":         "reference",
    "merriam-webster.com":    "reference",

    # User generated
    "reddit.com":             "user_generated",
    "quora.com":              "user_generated",
    "twitter.com":            "user_generated",
    "x.com":                  "user_generated",
    "facebook.com":           "user_generated",
    "youtube.com":            "user_generated",
}


def _extract_registered_domain(url: str) -> str:
    """
    Extract the registered domain from a URL using stdlib urlparse.
    Returns the hostname with 'www.' stripped, lowercased.
    Returns an empty string if the URL is unparseable.
    """
    try:
        hostname = urlparse(url).hostname or ""
        hostname = hostname.lower()
        # Strip leading www.
        if hostname.startswith("www."):
            hostname = hostname[4:]
        return hostname
    except Exception:
        return ""


def _classify_domain(domain: str) -> tuple[str, str]:
    """
    Look up *domain* in the seed map, trying progressively shorter suffixes.
    Returns (source_type, matched_key).

    Strategy: try the full domain first, then each TLD suffix, then
    check if any known TLD-based category applies (e.g. *.gov).
    """
    if not domain:
        return "unknown", ""

    # 1. Exact match
    if domain in _DOMAIN_MAP:
        return _DOMAIN_MAP[domain], domain

    # 2. Try suffix matching: e.g. "news.bbc.co.uk" → "bbc.co.uk" → "bbc.com"
    parts = domain.split(".")
    for i in range(1, len(parts)):
        suffix = ".".join(parts[i:])
        if suffix in _DOMAIN_MAP:
            return _DOMAIN_MAP[suffix], suffix

    # 3. TLD-based heuristics (e.g. *.gov, *.edu, *.ac.*)
    if domain.endswith(".gov") or ".gov." in domain:
        return "government", ".gov"
    if domain.endswith(".edu") or ".edu." in domain:
        return "academic_research", ".edu"
    if domain.endswith(".ac.uk") or ".ac." in domain:
        return "academic_research", ".ac"
    if domain.endswith(".int"):
        return "international_authority", ".int"

    return "unknown", ""


def score_source(url: str) -> dict[str, Any]:
    """
    Return a reliability assessment for the given *url*.

    Returns a dict with:
        source_domain            (str)
        source_type              (str)
        source_reliability_score (float)  — heuristic, NOT a truth score
        reliability_reason       (str)
    """
    domain = _extract_registered_domain(url)
    source_type, matched_key = _classify_domain(domain)
    reliability_score = SCORES.get(source_type, SCORES["unknown"])

    if source_type == "unknown":
        reason = f"Domain '{domain}' is not in the curated source list; default score applied"
    elif matched_key.startswith("."):
        reason = f"TLD '{matched_key}' heuristic matched category '{source_type}'"
    else:
        reason = f"Domain '{domain}' matched curated '{source_type}' category"

    logger.debug(
        "Source scored: domain=%r type=%r score=%.2f",
        domain, source_type, reliability_score,
    )

    return {
        "source_domain": domain,
        "source_type": source_type,
        "source_reliability_score": round(reliability_score, 4),
        "reliability_reason": reason,
    }
