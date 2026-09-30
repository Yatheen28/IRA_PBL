import asyncio
import time
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

from app.services.web_retriever import search_evidence
from app.services.evidence_analyzer import analyze_evidence


async def benchmark_pool(claim: str, size: int):
    print(f"\n--- Benchmarking Pool Size: {size} ---")
    
    t0 = time.perf_counter()
    raw = await asyncio.to_thread(search_evidence, claim, size)
    t1 = time.perf_counter()
    retrieval_ms = (t1 - t0) * 1000
    
    t0 = time.perf_counter()
    enriched = await asyncio.to_thread(analyze_evidence, claim, raw)
    t1 = time.perf_counter()
    analysis_ms = (t1 - t0) * 1000
    
    duplicates = len(raw) - len(enriched)
    dup_rate = duplicates / len(raw) if raw else 0
    
    print(f"Retrieval Latency: {retrieval_ms:.0f} ms")
    print(f"Ranking Latency:   {analysis_ms:.0f} ms")
    print(f"Raw Retrieved:     {len(raw)}")
    print(f"Unique Evidence:   {len(enriched)}")
    print(f"Duplicate Rate:    {dup_rate*100:.1f}%")
    
    # Check top 5 for quality
    top5 = enriched[:5]
    print("Top 5 Sources:")
    for i, e in enumerate(top5):
        print(f"  {i+1}. {e['source_domain']} ({e['combined_score']:.4f})")
    
    return {
        "size": size,
        "retrieval_ms": retrieval_ms,
        "analysis_ms": analysis_ms,
        "raw": len(raw),
        "unique": len(enriched)
    }

async def main():
    claim = "The Earth is flat"
    
    for size in [5, 10, 15]:
        await benchmark_pool(claim, size)

if __name__ == "__main__":
    asyncio.run(main())
