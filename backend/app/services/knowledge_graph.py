"""
Knowledge Graph Builder – VAJRA AI Stage 8
==========================================
Generates a React Flow-compatible knowledge graph from the claim,
verdict, and evidence. Only relationships derived from actual retrieved
evidence are represented — no fabricated edges.

Node types:  claim | verdict | evidence | source
Edge types:  SUPPORTS | CONTRADICTS | CONTEXTUAL | SOURCED_FROM | RELATED_TO
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# ── Layout constants for React Flow initial positions ─────────────────────────
_CLAIM_POS = {"x": 400, "y": 50}
_VERDICT_POS = {"x": 400, "y": 200}
_EVIDENCE_START_X = 100
_EVIDENCE_Y = 400
_EVIDENCE_X_GAP = 280
_SOURCE_Y_OFFSET = 180


def _stance_to_edge_type(stance: str) -> str:
    mapping = {
        "supporting":    "SUPPORTS",
        "contradicting": "CONTRADICTS",
        "contextual":    "CONTEXTUAL",
        "unclear":       "CONTEXTUAL",
    }
    return mapping.get(stance, "CONTEXTUAL")


def _edge_color(edge_type: str) -> str:
    colors = {
        "SUPPORTS":    "#22c55e",   # green
        "CONTRADICTS": "#ef4444",   # red
        "CONTEXTUAL":  "#f59e0b",   # amber
        "SOURCED_FROM": "#6366f1",  # indigo
    }
    return colors.get(edge_type, "#94a3b8")


def build_graph(
    claim: str,
    verdict: str,
    evidence: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """
    Build a React Flow-compatible knowledge graph.

    Args:
        claim:    The original user claim (string).
        verdict:  The verdict label from the verdict engine.
        evidence: Enriched evidence list from evidence_analyzer (with stance).

    Returns:
        {
            "nodes": [...],   # React Flow node objects
            "edges": [...],   # React Flow edge objects
        }
    """
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    edge_counter = 0

    def next_edge_id() -> str:
        nonlocal edge_counter
        edge_counter += 1
        return f"e{edge_counter}"

    # ── Claim node ────────────────────────────────────────────────────────────
    claim_node_id = "claim-0"
    nodes.append({
        "id": claim_node_id,
        "type": "claim",
        "position": _CLAIM_POS,
        "data": {
            "label": claim[:120] + ("…" if len(claim) > 120 else ""),
            "nodeType": "claim",
        },
    })

    # ── Verdict node ──────────────────────────────────────────────────────────
    verdict_node_id = "verdict-0"
    nodes.append({
        "id": verdict_node_id,
        "type": "verdict",
        "position": _VERDICT_POS,
        "data": {
            "label": verdict,
            "nodeType": "verdict",
        },
    })
    edges.append({
        "id": next_edge_id(),
        "source": claim_node_id,
        "target": verdict_node_id,
        "label": "ANALYSED_AS",
        "style": {"stroke": "#94a3b8"},
    })

    # ── Evidence nodes ────────────────────────────────────────────────────────
    seen_sources: dict[str, str] = {}   # domain → node_id

    for idx, item in enumerate(evidence):
        ev_node_id = f"evidence-{idx}"
        stance = item.get("stance", "unclear")
        edge_type = _stance_to_edge_type(stance)
        color = _edge_color(edge_type)

        x_pos = _EVIDENCE_START_X + idx * _EVIDENCE_X_GAP

        nodes.append({
            "id": ev_node_id,
            "type": "evidence",
            "position": {"x": x_pos, "y": _EVIDENCE_Y},
            "data": {
                "label": (item.get("title") or item.get("url", ""))[:80],
                "nodeType": "evidence",
                "stance": stance,
                "semantic_score": item.get("semantic_score"),
                "combined_score": item.get("combined_score"),
                "url": item.get("url", ""),
            },
        })

        # Edge: verdict → evidence (stance-typed)
        edges.append({
            "id": next_edge_id(),
            "source": verdict_node_id,
            "target": ev_node_id,
            "label": edge_type,
            "style": {"stroke": color},
        })

        # ── Source node (one per unique domain) ──────────────────────────────
        domain = item.get("source_domain", "")
        if domain and domain not in seen_sources:
            src_node_id = f"source-{domain.replace('.', '-')}"
            seen_sources[domain] = src_node_id
            nodes.append({
                "id": src_node_id,
                "type": "source",
                "position": {
                    "x": x_pos,
                    "y": _EVIDENCE_Y + _SOURCE_Y_OFFSET,
                },
                "data": {
                    "label": domain,
                    "nodeType": "source",
                    "source_type": item.get("source_type", "unknown"),
                    "reliability_score": item.get("source_reliability_score"),
                },
            })

        if domain in seen_sources:
            edges.append({
                "id": next_edge_id(),
                "source": ev_node_id,
                "target": seen_sources[domain],
                "label": "SOURCED_FROM",
                "style": {"stroke": _edge_color("SOURCED_FROM")},
            })

    logger.info(
        "Knowledge graph built: %d nodes, %d edges",
        len(nodes), len(edges),
    )

    return {"nodes": nodes, "edges": edges}
