"""
Knowledge Graph Builder – VAJRA AI  (Rich Version)
====================================================
Uses Gemini to generate a structured "Claim History & Evidence Map"
from the claim, verdict, and retrieved evidence.

Output schema
─────────────
{
  "nodes": [...],          # all graph nodes
  "edges": [...],          # all edges with labels
  "timeline": [...],       # ordered claim history events
  "variations": [...],     # claim variations found in evidence
  "spread_path": [...],    # documented spread chain (may be empty)
  "debunking_path": [...], # debunking chain (may be empty)
  "current_status": "...", # final assessment string
}

Accuracy principle: only facts from actual evidence are represented.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Gemini prompt
# ──────────────────────────────────────────────────────────────────────────────

_GRAPH_PROMPT_TEMPLATE = """
You are a fact-checking knowledge graph builder.

Given:
  - CLAIM: {claim}
  - VERDICT: {verdict}
  - EVIDENCE (JSON): {evidence_json}

Your task: build a structured knowledge graph representing the claim's
history, spread, variations, and evidence. Use ONLY the information
present in the evidence above — do NOT fabricate dates, events, people,
organizations, or relationships that are not documented.

If a piece of information (e.g., origin date, spread path) is unknown
from the evidence, explicitly mark it as "Unknown / Not established".

Return ONLY a valid JSON object with this exact structure
(no markdown, no explanation outside the JSON):

{{
  "current_status": "<one of: Supported | Contradicted | Partially Supported | Misleading | Insufficient Evidence | Sources Disagree>",
  "current_status_summary": "<1–2 sentence plain-English summary of what the evidence currently says>",
  "timeline": [
    {{
      "id": "t1",
      "type": "<Origin|First Reported|Circulation|Viral Spread|Claim Variation|Fact-Check|Official Response|Scientific Evidence|Challenge|Current Assessment>",
      "date": "<date or year string, or 'Unknown'>",
      "title": "<short title>",
      "description": "<1–2 sentence description>",
      "source": "<source name or null>",
      "url": "<url or null>"
    }}
  ],
  "variations": [
    {{
      "id": "v1",
      "text": "<wording of variation>",
      "when": "<date or 'Unknown'>",
      "where": "<platform/site or 'Unknown'>",
      "source": "<source name or null>",
      "url": "<url or null>"
    }}
  ],
  "spread_path": [
    {{
      "id": "s1",
      "label": "<e.g. Original claim, Social media post, News article>",
      "source": "<source name or null>",
      "url": "<url or null>",
      "date": "<date or 'Unknown'>"
    }}
  ],
  "debunking_path": [
    {{
      "id": "d1",
      "label": "<step label>",
      "description": "<what happened>",
      "source": "<source name or null>",
      "url": "<url or null>",
      "date": "<date or 'Unknown'>"
    }}
  ],
  "evidence_nodes": [
    {{
      "id": "ev1",
      "title": "<evidence title>",
      "summary": "<key passage or summary, max 200 chars>",
      "stance": "<supports|contradicts|context|unclear>",
      "source": "<source domain>",
      "url": "<url>",
      "reliability_tier": "<HIGH|MEDIUM|LOW|UNKNOWN>",
      "publication_date": "<date or 'Unknown'>"
    }}
  ]
}}

Rules:
- The timeline MUST contain at least "Current Assessment" at the end.
- If no spread path is documented in the evidence, return spread_path as [].
- If no debunking path is documented, return debunking_path as [] and do NOT invent one.
- If no claim variations are found, return variations as [].
- Every evidence item from the input should map to one evidence_node.
- Keep all text concise — users will read this in a graph UI.
- Return ONLY valid JSON, no comments, no markdown fences.
"""


def _call_gemini(prompt: str) -> str:
    """Call Gemini and return raw text."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY is not set.")

    from google import genai

    client = genai.Client(api_key=api_key)
    models = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-2.5-flash-lite",
    ]
    for model in models:
        try:
            resp = client.models.generate_content(model=model, contents=prompt)
            return resp.text.strip()
        except Exception as exc:
            err = str(exc)
            if any(k in err for k in ("404", "NOT_FOUND", "deprecated")):
                continue
            raise
    raise RuntimeError("All Gemini models failed.")


def _parse_json(raw: str) -> dict:
    """Strip markdown fences if present and parse JSON."""
    # Remove ```json ... ``` or ``` ... ```
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if match:
        raw = match.group(1).strip()
    return json.loads(raw)


def _fallback_graph(claim: str, verdict: str, evidence: list[dict]) -> dict:
    """
    Build a simple graph directly from evidence without Gemini,
    used when Gemini fails.
    """
    nodes: list[dict] = []
    edges: list[dict] = []
    ec = 0

    def eid() -> str:
        nonlocal ec
        ec += 1
        return f"e{ec}"

    nodes.append({"id": "claim-0", "nodeType": "CLAIM",
                  "data": {"label": claim[:100], "full_text": claim}})
    nodes.append({"id": "verdict-0", "nodeType": "VERDICT",
                  "data": {"label": verdict}})
    edges.append({"id": eid(), "source": "claim-0", "target": "verdict-0",
                  "label": "ANALYSED_AS"})

    for i, ev in enumerate(evidence[:8]):
        eid_ = f"ev-{i}"
        stance = ev.get("stance", "unclear")
        nodes.append({
            "id": eid_,
            "nodeType": "EVIDENCE",
            "data": {
                "label": (ev.get("title") or ev.get("source_domain") or "Source")[:80],
                "summary": (ev.get("content") or "")[:200],
                "stance": stance,
                "source": ev.get("source_domain", ""),
                "url": ev.get("url", ""),
                "reliability_tier": ev.get("reliability_tier", "UNKNOWN"),
            },
        })
        rel = {"supporting": "SUPPORTS", "contradicting": "CONTRADICTS"}.get(stance, "PROVIDES_CONTEXT")
        edges.append({"id": eid(), "source": "claim-0", "target": eid_, "label": rel})

    timeline = [
        {
            "id": "t1",
            "type": "Current Assessment",
            "date": "Unknown",
            "title": "Current Assessment",
            "description": f"Verdict: {verdict}. Based on {len(evidence)} retrieved sources.",
            "source": None,
            "url": None,
        }
    ]

    ev_nodes = [
        {
            "id": f"ev{i}",
            "title": (ev.get("title") or "")[:80],
            "summary": (ev.get("content") or "")[:200],
            "stance": ev.get("stance", "unclear"),
            "source": ev.get("source_domain", ""),
            "url": ev.get("url", ""),
            "reliability_tier": ev.get("reliability_tier", "UNKNOWN"),
            "publication_date": "Unknown",
        }
        for i, ev in enumerate(evidence[:8])
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "timeline": timeline,
        "variations": [],
        "spread_path": [],
        "debunking_path": [],
        "current_status": verdict,
        "current_status_summary": f"Based on {len(evidence)} sources, verdict is: {verdict}.",
        "evidence_nodes": ev_nodes,
    }


# ── Public entry point ──────────────────────────────────────────────────────

def build_graph(
    claim: str,
    verdict: str,
    evidence: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Build a rich knowledge graph for the claim.

    Returns a dict with keys:
        nodes, edges, timeline, variations, spread_path,
        debunking_path, current_status, current_status_summary,
        evidence_nodes
    """
    # Trim evidence to keep the prompt manageable
    trimmed = []
    for ev in evidence[:10]:
        trimmed.append({
            "title":           (ev.get("title") or "")[:120],
            "content":         (ev.get("content") or "")[:300],
            "url":             ev.get("url", ""),
            "source_domain":   ev.get("source_domain", ""),
            "stance":          ev.get("stance", "unclear"),
            "reliability_tier": ev.get("reliability_tier", "UNKNOWN"),
            "combined_score":  ev.get("combined_score"),
        })

    evidence_json = json.dumps(trimmed, ensure_ascii=False, indent=1)
    prompt = _GRAPH_PROMPT_TEMPLATE.format(
        claim=claim[:400],
        verdict=verdict,
        evidence_json=evidence_json,
    )

    try:
        raw = _call_gemini(prompt)
        gemini_data = _parse_json(raw)
    except Exception as exc:
        logger.warning("Gemini graph generation failed (%s); using fallback.", exc)
        return _fallback_graph(claim, verdict, evidence)

    # ── Build flat nodes + edges from Gemini output ──────────────────────────
    nodes: list[dict] = []
    edges: list[dict] = []
    ec = 0

    def eid() -> str:
        nonlocal ec
        ec += 1
        return f"e{ec}"

    # Claim node
    nodes.append({
        "id": "claim-0",
        "nodeType": "CLAIM",
        "data": {"label": claim[:100], "full_text": claim, "verdict": verdict},
    })

    # Timeline nodes
    for t in gemini_data.get("timeline", []):
        nodes.append({
            "id": t["id"],
            "nodeType": "HISTORY_EVENT",
            "data": {
                "label":       t.get("title", ""),
                "type":        t.get("type", ""),
                "date":        t.get("date", "Unknown"),
                "description": t.get("description", ""),
                "source":      t.get("source"),
                "url":         t.get("url"),
            },
        })
        prev = nodes[-2]["id"] if len(nodes) >= 2 else "claim-0"
        edges.append({
            "id": eid(), "source": prev, "target": t["id"],
            "label": "NEXT" if t.get("type") != "Origin" else "ORIGINATED_FROM",
        })

    # Variation nodes
    for v in gemini_data.get("variations", []):
        nodes.append({
            "id": v["id"],
            "nodeType": "CLAIM_VARIATION",
            "data": {
                "label":  (v.get("text") or "")[:80],
                "text":   v.get("text", ""),
                "when":   v.get("when", "Unknown"),
                "where":  v.get("where", "Unknown"),
                "source": v.get("source"),
                "url":    v.get("url"),
            },
        })
        edges.append({
            "id": eid(), "source": "claim-0", "target": v["id"],
            "label": "VARIATION_OF",
        })

    # Evidence nodes
    stance_edge_map = {
        "supports":     "SUPPORTS",
        "supporting":   "SUPPORTS",
        "contradicts":  "CONTRADICTS",
        "contradicting":"CONTRADICTS",
        "context":      "PROVIDES_CONTEXT",
        "contextual":   "PROVIDES_CONTEXT",
        "unclear":      "PROVIDES_CONTEXT",
    }
    for ev in gemini_data.get("evidence_nodes", []):
        nodes.append({
            "id": ev["id"],
            "nodeType": "EVIDENCE",
            "data": {
                "label":            (ev.get("title") or ev.get("source") or "Evidence")[:80],
                "summary":          ev.get("summary", ""),
                "stance":           ev.get("stance", "unclear"),
                "source":           ev.get("source", ""),
                "url":              ev.get("url", ""),
                "reliability_tier": ev.get("reliability_tier", "UNKNOWN"),
                "publication_date": ev.get("publication_date", "Unknown"),
            },
        })
        rel = stance_edge_map.get(ev.get("stance", "unclear"), "PROVIDES_CONTEXT")
        edges.append({
            "id": eid(), "source": "claim-0", "target": ev["id"],
            "label": rel,
        })

    logger.info(
        "Rich knowledge graph built: %d nodes, %d edges",
        len(nodes), len(edges),
    )

    return {
        "nodes":                  nodes,
        "edges":                  edges,
        "timeline":               gemini_data.get("timeline", []),
        "variations":             gemini_data.get("variations", []),
        "spread_path":            gemini_data.get("spread_path", []),
        "debunking_path":         gemini_data.get("debunking_path", []),
        "current_status":         gemini_data.get("current_status", verdict),
        "current_status_summary": gemini_data.get("current_status_summary", ""),
        "evidence_nodes":         gemini_data.get("evidence_nodes", []),
    }
