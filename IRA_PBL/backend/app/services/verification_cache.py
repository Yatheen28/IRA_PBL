"""
Verification Cache Service – VAJRA AI Persistent Verification Memory
=====================================================================
Provides persistent, deterministic, 2-tier caching for verification results
using the existing SQLite database and SQLAlchemy session.

Key Features:
- Tier 1: Fast raw key lookup (sub-millisecond indexed lookup).
- Tier 2: Normalized semantic key lookup (handles syntactic variations and translations).
- Deterministic SHA-256 keys based on canonical claim, mode, and pipeline version.
- Category-aware TTL (2h for insufficient evidence, 4h for time-sensitive, 24h standard, 7d settled).
- Single-flight concurrent request coalescing via per-key asyncio locks.
- Safe SQLite write handling (isolated, non-blocking to reads, error-resilient).
- Zero private data leakage (only public claim text, evidence, and verdicts stored).
- Full observability metrics (hits, misses, bypasses, latencies, coalesced count).
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncGenerator

from sqlalchemy.orm import Session
from app.db.models import VerificationCache
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

PIPELINE_VERSION: str = os.getenv("VAJRA_PIPELINE_VERSION", "3.0.0")
CACHE_ENABLED: bool = os.getenv("VERIFY_CACHE_ENABLED", "true").lower() in ("true", "1", "yes")

# TTLs in hours
DEFAULT_TTL_HOURS: float = float(os.getenv("VERIFY_CACHE_TTL_HOURS", "24.0"))
SHORT_TTL_HOURS: float = 2.0         # For INSUFFICIENT_EVIDENCE / CONFLICTING_EVIDENCE
TIME_SENSITIVE_TTL_HOURS: float = 4.0 # For fast-evolving news
SETTLED_TTL_HOURS: float = 168.0      # 7 days for settled facts with high confidence

TIME_SENSITIVE_PATTERNS = re.compile(
    r"\b(today|yesterday|tomorrow|this week|this month|breaking|recent|latest|current|currently|2026|newly|just now)\b",
    re.IGNORECASE,
)

# ── In-Memory Observability Metrics ───────────────────────────────────────────

class CacheMetrics:
    def __init__(self):
        self.hits_tier1: int = 0
        self.hits_tier2: int = 0
        self.misses: int = 0
        self.expired: int = 0
        self.forced_refreshes: int = 0
        self.bypasses: int = 0
        self.coalesced_requests: int = 0
        self.storage_failures: int = 0

    def to_dict(self) -> dict[str, int]:
        total_hits = self.hits_tier1 + self.hits_tier2
        total_requests = total_hits + self.misses
        hit_ratio = round(total_hits / total_requests, 4) if total_requests > 0 else 0.0
        return {
            "total_requests": total_requests,
            "total_hits": total_hits,
            "hits_tier1_raw": self.hits_tier1,
            "hits_tier2_normalized": self.hits_tier2,
            "misses": self.misses,
            "expired": self.expired,
            "forced_refreshes": self.forced_refreshes,
            "bypasses": self.bypasses,
            "coalesced_requests": self.coalesced_requests,
            "storage_failures": self.storage_failures,
            "hit_ratio": hit_ratio,
        }

metrics = CacheMetrics()

# ── Concurrency & Request Coalescing Registry ─────────────────────────────────

_key_locks: dict[str, asyncio.Lock] = {}
_lock_ref_counts: dict[str, int] = {}
_registry_mutex = asyncio.Lock()


async def acquire_coalesce_lock(cache_key: str) -> tuple[asyncio.Lock, bool]:
    """
    Acquires an asyncio.Lock dedicated to the specified cache_key.
    Returns (lock, is_coalesced_waiter).
    If another task is already executing for this key, is_coalesced_waiter will be True.
    """
    async with _registry_mutex:
        if cache_key not in _key_locks:
            _key_locks[cache_key] = asyncio.Lock()
            _lock_ref_counts[cache_key] = 1
            lock = _key_locks[cache_key]
            is_coalesced = False
        else:
            _lock_ref_counts[cache_key] += 1
            lock = _key_locks[cache_key]
            is_coalesced = True
            metrics.coalesced_requests += 1

    await lock.acquire()
    return lock, is_coalesced


async def release_coalesce_lock(cache_key: str, lock: asyncio.Lock) -> None:
    """Releases the lock and cleans up registry when no waiters remain."""
    lock.release()
    async with _registry_mutex:
        _lock_ref_counts[cache_key] = max(0, _lock_ref_counts.get(cache_key, 1) - 1)
        if _lock_ref_counts[cache_key] == 0:
            _key_locks.pop(cache_key, None)
            _lock_ref_counts.pop(cache_key, None)


# ── Canonicalization & Key Generation ─────────────────────────────────────────

def canonicalize_claim(claim: str) -> str:
    """
    Produce a canonical string for cache key generation.
    - Collapses whitespace
    - Normalizes lowercase
    - Strips peripheral whitespace
    - Preserves negation tokens ('not', 'no', 'never', etc.), dates, numbers, and symbols.
    """
    if not claim:
        return ""
    # Collapse all whitespace sequences to single space
    cleaned = " ".join(claim.strip().split())
    # Lowercase
    cleaned = cleaned.lower()
    # Strip terminal punctuation (periods, question marks) only if not part of an abbreviation or number
    if len(cleaned) > 1 and cleaned.endswith((".", "?", "!")):
        cleaned = cleaned[:-1].strip()
    return cleaned


def make_cache_key(claim_text: str, mode: str = "standard", prefix: str = "raw") -> str:
    """
    Compute a deterministic SHA-256 cache key.
    Format: sha256("{prefix}:{canonical_claim}|mode:{mode}|v:{pipeline_version}")
    """
    canonical = canonicalize_claim(claim_text)
    raw_fingerprint = f"{prefix}:{canonical}|mode:{mode}|v:{PIPELINE_VERSION}"
    return hashlib.sha256(raw_fingerprint.encode("utf-8")).hexdigest()


def compute_ttl(claim: str, verdict: str, confidence: float) -> timedelta:
    """
    Calculate dynamic TTL based on verdict category, confidence, and claim temporal signals.
    """
    upper_verdict = (verdict or "").upper()

    # 1. Rapidly changing or uncertain evidence
    if upper_verdict in ("INSUFFICIENT_EVIDENCE", "CONFLICTING_EVIDENCE", "UNVERIFIED"):
        return timedelta(hours=SHORT_TTL_HOURS)

    # 2. Time-sensitive or breaking events
    if TIME_SENSITIVE_PATTERNS.search(claim):
        return timedelta(hours=TIME_SENSITIVE_TTL_HOURS)

    # 3. High confidence settled claims
    if upper_verdict in ("TRUE", "FALSE") and confidence >= 0.90:
        return timedelta(hours=SETTLED_TTL_HOURS)

    # 4. Standard claim
    return timedelta(hours=DEFAULT_TTL_HOURS)


# ── Database Operations ───────────────────────────────────────────────────────

def _entry_to_response_dict(entry: VerificationCache) -> dict[str, Any]:
    """Convert an ORM VerificationCache entry into a VerifyResponse-compatible dictionary."""
    remaining_seconds = max(0, int((entry.expires_at - datetime.utcnow()).total_seconds()))
    return {
        "original_claim": entry.raw_claim,
        "normalized_claim": entry.normalized_claim,
        "language": entry.language,
        "verdict": entry.verdict,
        "analysis_confidence": entry.analysis_confidence,
        "summary": entry.summary,
        "reasoning": entry.reasoning,
        "evidence": entry.evidence or [],
        "knowledge_graph": entry.knowledge_graph or {"nodes": [], "edges": []},
        "source_diversity": entry.source_diversity,
        "limitations": entry.limitations or [],
        "cache_metadata": {
            "cached": True,
            "cache_key": entry.cache_key,
            "cached_at": entry.created_at.isoformat() if entry.created_at else None,
            "expires_at": entry.expires_at.isoformat() if entry.expires_at else None,
            "ttl_remaining_seconds": remaining_seconds,
            "hit_count": entry.hit_count,
            "pipeline_version": entry.pipeline_version,
        },
    }


def lookup_cache(
    db: Session,
    raw_claim: str,
    normalized_claim: str | None = None,
    mode: str = "standard",
    force_refresh: bool = False,
) -> tuple[dict[str, Any] | None, str]:
    """
    Query the persistent verification cache.

    Returns:
        (cached_dict, status_code)
        status_code in:
            "HIT_TIER1_RAW"
            "HIT_TIER2_NORMALIZED"
            "MISS"
            "MISS_EXPIRED"
            "BYPASS_FORCE_REFRESH"
            "BYPASS_DISABLED"
    """
    if not CACHE_ENABLED:
        metrics.bypasses += 1
        return None, "BYPASS_DISABLED"

    if force_refresh:
        metrics.forced_refreshes += 1
        logger.info("Cache bypass: force_refresh=True for claim: %r", raw_claim[:60])
        return None, "BYPASS_FORCE_REFRESH"

    now = datetime.utcnow()

    has_expired_entry = False

    try:
        # Tier 1: Fast Raw Key Lookup
        raw_key = make_cache_key(raw_claim, mode=mode, prefix="raw")
        entry = db.query(VerificationCache).filter(VerificationCache.cache_key == raw_key).first()

        if entry:
            if entry.expires_at > now:
                # Valid Tier 1 Hit
                entry.hit_count += 1
                entry.last_accessed_at = now
                try:
                    db.commit()
                except Exception as commit_err:
                    logger.warning("Failed to update cache hit stats: %s", commit_err)
                    db.rollback()

                metrics.hits_tier1 += 1
                logger.info("Cache HIT (Tier 1 Raw): %s (hits=%d)", raw_key[:12], entry.hit_count)
                return _entry_to_response_dict(entry), "HIT_TIER1_RAW"
            else:
                # Expired Tier 1 entry
                metrics.expired += 1
                has_expired_entry = True
                logger.info("Cache entry EXPIRED (Tier 1): %s (expired at %s)", raw_key[:12], entry.expires_at)

        # Tier 2: Normalized Semantic Key Lookup (if normalized_claim is provided)
        if normalized_claim:
            norm_key = make_cache_key(normalized_claim, mode=mode, prefix="norm")
            entry_norm = db.query(VerificationCache).filter(VerificationCache.cache_key == norm_key).first()

            if entry_norm:
                if entry_norm.expires_at > now:
                    # Valid Tier 2 Hit
                    entry_norm.hit_count += 1
                    entry_norm.last_accessed_at = now
                    try:
                        db.commit()
                    except Exception as commit_err:
                        logger.warning("Failed to update cache hit stats: %s", commit_err)
                        db.rollback()

                    metrics.hits_tier2 += 1
                    logger.info("Cache HIT (Tier 2 Norm): %s (hits=%d)", norm_key[:12], entry_norm.hit_count)
                    return _entry_to_response_dict(entry_norm), "HIT_TIER2_NORMALIZED"
                else:
                    metrics.expired += 1
                    has_expired_entry = True
                    logger.info("Cache entry EXPIRED (Tier 2): %s", norm_key[:12])

        # Cache Miss
        if has_expired_entry:
            return None, "MISS_EXPIRED"

        metrics.misses += 1
        return None, "MISS"

    except Exception as exc:
        logger.error("Cache lookup database error: %s", exc)
        return None, "MISS_DB_ERROR"


def store_cache(
    db: Session,
    raw_claim: str,
    normalized_claim: str,
    language: str,
    pipeline_result: dict[str, Any],
    mode: str = "standard",
) -> None:
    """
    Store or update verification result in the persistent cache.
    Never caches empty, failed, or malformed results.
    Stores both Tier 1 (raw) and Tier 2 (norm) keys so future equivalent queries hit.
    """
    if not CACHE_ENABLED:
        return

    verdict = pipeline_result.get("verdict")
    if not verdict or not isinstance(verdict, str):
        logger.warning("Refusing to cache result without valid verdict.")
        return

    confidence = float(pipeline_result.get("analysis_confidence", 0.0))
    summary = pipeline_result.get("summary", "")
    reasoning = pipeline_result.get("reasoning", "")
    evidence = pipeline_result.get("evidence", [])
    knowledge_graph = pipeline_result.get("knowledge_graph", {})
    source_diversity = pipeline_result.get("source_diversity")
    limitations = pipeline_result.get("limitations", [])

    now = datetime.utcnow()
    ttl = compute_ttl(raw_claim, verdict, confidence)
    expires_at = now + ttl

    raw_key = make_cache_key(raw_claim, mode=mode, prefix="raw")
    norm_key = make_cache_key(normalized_claim, mode=mode, prefix="norm")

    keys_to_store = [(raw_key, raw_claim)]
    if norm_key != raw_key:
        keys_to_store.append((norm_key, normalized_claim))

    try:
        for k, claim_text in keys_to_store:
            existing = db.query(VerificationCache).filter(VerificationCache.cache_key == k).first()
            if existing:
                existing.raw_claim = raw_claim
                existing.normalized_claim = normalized_claim
                existing.language = language
                existing.mode = mode
                existing.verdict = verdict
                existing.analysis_confidence = confidence
                existing.summary = summary
                existing.reasoning = reasoning
                existing.evidence = evidence
                existing.knowledge_graph = knowledge_graph
                existing.source_diversity = source_diversity
                existing.limitations = limitations
                existing.pipeline_version = PIPELINE_VERSION
                existing.expires_at = expires_at
                existing.last_accessed_at = now
            else:
                entry = VerificationCache(
                    cache_key=k,
                    raw_claim=raw_claim,
                    normalized_claim=normalized_claim,
                    language=language,
                    mode=mode,
                    verdict=verdict,
                    analysis_confidence=confidence,
                    summary=summary,
                    reasoning=reasoning,
                    evidence=evidence,
                    knowledge_graph=knowledge_graph,
                    source_diversity=source_diversity,
                    limitations=limitations,
                    pipeline_version=PIPELINE_VERSION,
                    hit_count=0,
                    created_at=now,
                    expires_at=expires_at,
                    last_accessed_at=now,
                )
                db.add(entry)

        db.commit()
        logger.info(
            "Stored verification in cache: %s (TTL: %.1fh, expires: %s)",
            raw_key[:12], ttl.total_seconds() / 3600, expires_at.isoformat()
        )
    except Exception as exc:
        metrics.storage_failures += 1
        db.rollback()
        logger.error("Failed to store verification cache entry: %s", exc)


def clear_cache(db: Session, expired_only: bool = False) -> int:
    """Clear all or expired cache records safely."""
    try:
        query = db.query(VerificationCache)
        if expired_only:
            query = query.filter(VerificationCache.expires_at <= datetime.utcnow())
        count = query.delete(synchronize_session=False)
        db.commit()
        logger.info("Cleared %d %s cache entries.", count, "expired" if expired_only else "total")
        return count
    except Exception as exc:
        db.rollback()
        logger.error("Failed to clear verification cache: %s", exc)
        return 0


def get_cache_stats(db: Session) -> dict[str, Any]:
    """Retrieve database counts along with in-memory hit/miss telemetry."""
    now = datetime.utcnow()
    try:
        total_rows = db.query(VerificationCache).count()
        active_rows = db.query(VerificationCache).filter(VerificationCache.expires_at > now).count()
        expired_rows = total_rows - active_rows
    except Exception as exc:
        logger.warning("Could not query cache counts from DB: %s", exc)
        total_rows = active_rows = expired_rows = 0

    stat_data = metrics.to_dict()
    stat_data.update({
        "db_total_entries": total_rows,
        "db_active_entries": active_rows,
        "db_expired_entries": expired_rows,
        "pipeline_version": PIPELINE_VERSION,
        "cache_enabled": CACHE_ENABLED,
    })
    return stat_data
