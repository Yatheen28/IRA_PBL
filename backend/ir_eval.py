"""
VAJRA AI — Information Retrieval Evaluation
===========================================
Small manual benchmark to evaluate retrieval/ranking quality.
Compares Tavily original ranking vs BGE vs BM25 vs Hybrid Fusion.
"""

import sys
from pathlib import Path
from typing import Any

# Setup path and env
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

from app.services.web_retriever import search_evidence
from app.services.semantic_ranker import rank_results, load_model
from app.services.bm25_ranker import rank_bm25, reciprocal_rank_fusion

# Ground truth annotations (claim -> set of domains/keywords considered "highly relevant")
# Note: Since the web is dynamic, we evaluate relevance by whether the source is a known
# fact-checker or highly reliable source that explicitly addresses the claim.
BENCHMARK_DATA = [
    {
        "claim": "5G towers cause coronavirus",
        "relevant_domains": {"reuters.com", "bbc.com", "who.int", "snopes.com", "apnews.com", "factcheck.org", "fullfact.org"},
    },
    {
        "claim": "Water boils at 100 degrees Celsius at sea level",
        "relevant_domains": {"usgs.gov", "wikipedia.org", "britannica.com", "nationalgeographic.org", "thoughtco.com"},
    },
    {
        "claim": "The Earth is flat",
        "relevant_domains": {"nasa.gov", "space.com", "scientificamerican.com", "physics.org", "snopes.com", "nationalgeographic.com"},
    }
]

def _extract_domain(url: str) -> str:
    from urllib.parse import urlparse
    try:
        hostname = urlparse(url).hostname or ""
        hostname = hostname.lower()
        if hostname.startswith("www."):
            hostname = hostname[4:]
        return hostname
    except Exception:
        return ""

def _is_relevant(item: dict, relevant_domains: set[str]) -> bool:
    domain = _extract_domain(item.get("url", ""))
    # Evaluate as relevant if it's from a highly authoritative curated list
    # or if the title directly addresses the core claim structure.
    if domain in relevant_domains:
        return True
    return False

def compute_metrics(ranked_results: list[dict], relevant_domains: set[str], k: int = 5) -> dict[str, float]:
    """Compute Precision@K and MRR."""
    results = ranked_results[:k]
    
    # Precision @ K
    relevant_count = sum(1 for item in results if _is_relevant(item, relevant_domains))
    p_at_k = relevant_count / k if k > 0 else 0.0

    # Mean Reciprocal Rank (MRR)
    mrr = 0.0
    for rank, item in enumerate(results, start=1):
        if _is_relevant(item, relevant_domains):
            mrr = 1.0 / rank
            break
            
    return {"P@K": p_at_k, "MRR": mrr}

def evaluate_pipeline():
    print(f"{'='*60}")
    print("VAJRA AI — IR EVALUATION BENCHMARK")
    print(f"{'='*60}")
    
    load_model()
    
    metrics = {
        "Tavily": {"P@K": 0.0, "MRR": 0.0},
        "BM25":   {"P@K": 0.0, "MRR": 0.0},
        "BGE":    {"P@K": 0.0, "MRR": 0.0},
        "Hybrid": {"P@K": 0.0, "MRR": 0.0},
    }
    
    n_queries = len(BENCHMARK_DATA)
    
    for data in BENCHMARK_DATA:
        claim = data["claim"]
        relevant = data["relevant_domains"]
        print(f"\nQuery: {claim!r}")
        
        # 1. Retrieve raw results (Tavily ranking)
        # Fetch a larger pool to rerank
        raw_evidence = search_evidence(claim, max_results=15)
        
        # Assign initial order as Tavily's rank
        for i, item in enumerate(raw_evidence):
            item["tavily_rank"] = i
            
        m_tavily = compute_metrics(raw_evidence, relevant)
        print(f"  Tavily (Original) : P@5={m_tavily['P@K']:.2f}, MRR={m_tavily['MRR']:.2f}")
        
        # 2. BM25 Lexical Ranking
        bm25_evidence = rank_bm25(claim, list(raw_evidence))
        bm25_evidence.sort(key=lambda x: x["lexical_score"], reverse=True)
        m_bm25 = compute_metrics(bm25_evidence, relevant)
        print(f"  BM25 (Lexical)    : P@5={m_bm25['P@K']:.2f}, MRR={m_bm25['MRR']:.2f}")
        
        # 3. BGE Semantic Ranking
        bge_evidence = rank_results(claim, list(raw_evidence))
        m_bge = compute_metrics(bge_evidence, relevant)
        print(f"  BGE (Semantic)    : P@5={m_bge['P@K']:.2f}, MRR={m_bge['MRR']:.2f}")
        
        # 4. Hybrid (RRF)
        # (rank_results already ran BGE, so we just pass that to rank_bm25 then RRF)
        hybrid_evidence = rank_bm25(claim, bge_evidence)
        hybrid_evidence = reciprocal_rank_fusion(hybrid_evidence)
        m_hybrid = compute_metrics(hybrid_evidence, relevant)
        print(f"  Hybrid (RRF)      : P@5={m_hybrid['P@K']:.2f}, MRR={m_hybrid['MRR']:.2f}")
        
        # Accumulate
        for strat, m in [("Tavily", m_tavily), ("BM25", m_bm25), ("BGE", m_bge), ("Hybrid", m_hybrid)]:
            metrics[strat]["P@K"] += m["P@K"]
            metrics[strat]["MRR"] += m["MRR"]

    print(f"\n{'='*60}")
    print("AVERAGE METRICS (over 3 queries)")
    print(f"{'='*60}")
    for strat in metrics:
        avg_p = metrics[strat]["P@K"] / n_queries
        avg_mrr = metrics[strat]["MRR"] / n_queries
        print(f"{strat:10s} | P@5: {avg_p:.3f} | MRR: {avg_mrr:.3f}")

if __name__ == "__main__":
    evaluate_pipeline()
