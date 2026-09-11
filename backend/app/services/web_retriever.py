"""
Web Evidence Retrieval Service – VAJRA AI
Retrieves relevant web results for a given claim using Tavily Search.
This is a pure retrieval component; no AI classification or verdict is generated here.
"""

import os
from typing import Any

from tavily import TavilyClient
from dotenv import load_dotenv

load_dotenv()

# Fail fast at import time if the key is missing, so /verify gives a clear error.
_TAVILY_API_KEY: str | None = os.getenv("TAVILY_API_KEY")


def _get_client() -> TavilyClient:
    """Return a configured TavilyClient, raising clearly if the API key is absent."""
    if not _TAVILY_API_KEY:
        raise EnvironmentError(
            "TAVILY_API_KEY is not set. Add it to the .env file before starting the server."
        )
    return TavilyClient(api_key=_TAVILY_API_KEY)


def search_evidence(claim: str, max_results: int = 5) -> list[dict[str, Any]]:
    """
    Query Tavily for web evidence related to *claim*.

    Args:
        claim:       The user-submitted claim text to search for.
        max_results: Maximum number of results to return (default 5).

    Returns:
        A list of evidence dicts, each containing:
            - title   (str)
            - url     (str)
            - content (str) – snippet / page excerpt
            - score   (float | None) – Tavily relevance score if available
    """
    client = _get_client()

    # search_depth="advanced" gives richer snippets; topic="news" would be another option.
    response = client.search(
        query=claim,
        search_depth="advanced",
        max_results=max_results,
    )

    raw_results: list[dict] = response.get("results", [])

    # Normalise each result to a clean, stable schema.
    evidence: list[dict[str, Any]] = []
    for item in raw_results:
        evidence.append(
            {
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "content": item.get("content", ""),
                # Tavily may or may not include a relevance score.
                "score": item.get("score"),
            }
        )

    return evidence
