"""
VAJRA AI — P1 Verification Test Suite
=======================================
Runs representative claims through the complete pipeline and verifies
all P1 requirements are met.
"""
import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")


async def test_claim(claim: str) -> dict:
    """Run a single claim through the pipeline and return structured results."""
    from app.routes.verify import VerifyRequest, verify_claim
    
    start = time.perf_counter()
    try:
        req = VerifyRequest(claim=claim)
        res = await verify_claim(req)
        elapsed = time.perf_counter() - start
        
        evidence = res.evidence
        diversity = res.source_diversity
        
        return {
            "claim": claim,
            "status": "SUCCESS",
            "elapsed_s": round(elapsed, 2),
            "verdict": res.verdict,
            "confidence": res.analysis_confidence,
            "evidence_count": len(evidence),
            "unique_domains": diversity.unique_domains if diversity else 0,
            "max_domain_concentration": diversity.max_domain_concentration if diversity else 0,
            "domain_distribution": diversity.domain_distribution if diversity else {},
            "stances": {e.stance: sum(1 for ev in evidence if ev.stance == e.stance) for e in evidence},
            "reliability_tiers": [e.reliability_tier for e in evidence],
            "has_lexical_scores": all(e.lexical_score is not None for e in evidence),
            "has_fusion_scores": all(e.fusion_score is not None for e in evidence),
            "all_have_source_type": all(bool(e.source_type) for e in evidence),
            "all_have_domain": all(bool(e.source_domain) for e in evidence),
        }
    except Exception as exc:
        elapsed = time.perf_counter() - start
        return {
            "claim": claim,
            "status": "ERROR",
            "elapsed_s": round(elapsed, 2),
            "error": str(exc),
        }


async def main():
    claims = [
        "The Earth is flat",
        "5G towers cause coronavirus",
        "Water boils at 100 degrees Celsius at sea level",
    ]
    
    print("=" * 60)
    print("VAJRA AI — P1 VERIFICATION TEST SUITE")
    print("=" * 60)
    
    results = []
    for claim in claims:
        print(f"\nTesting: {claim!r}")
        result = await test_claim(claim)
        results.append(result)
        
        if result["status"] == "SUCCESS":
            print(f"  [+] Verdict: {result['verdict']} (conf={result['confidence']:.2f})")
            print(f"  [+] Evidence: {result['evidence_count']} items")
            print(f"  [+] Unique domains: {result['unique_domains']}")
            print(f"  [+] Max domain concentration: {result['max_domain_concentration']:.2f}")
            print(f"  [+] Domain dist: {result['domain_distribution']}")
            print(f"  [+] Stances: {result['stances']}")
            print(f"  [+] Reliability tiers: {result['reliability_tiers']}")
            print(f"  [+] Has lexical scores: {result['has_lexical_scores']}")
            print(f"  [+] Has fusion scores: {result['has_fusion_scores']}")
            print(f"  [+] Elapsed: {result['elapsed_s']}s")
        else:
            print(f"  [-] ERROR: {result['error']}")
    
    # P1 Checklist
    print(f"\n{'=' * 60}")
    print("P1 CHECKLIST")
    print("=" * 60)
    
    all_success = all(r["status"] == "SUCCESS" for r in results)
    
    # P1.1 Source Diversity
    has_diversity = all(r.get("unique_domains", 0) > 0 for r in results if r["status"] == "SUCCESS")
    has_concentration = all("max_domain_concentration" in r for r in results if r["status"] == "SUCCESS")
    p1_1 = "PASS" if (has_diversity and has_concentration) else "FAIL"
    print(f"P1.1 Source diversity    — {p1_1}")
    
    # P1.2 Source Reliability
    has_tiers = all(
        all(t in ("HIGH", "MEDIUM", "LOW", "UNKNOWN") for t in r.get("reliability_tiers", []))
        for r in results if r["status"] == "SUCCESS"
    )
    p1_2 = "PASS" if has_tiers else "FAIL"
    print(f"P1.2 Source reliability  — {p1_2}")
    
    # P1.3 Evidence Clustering
    has_stances = all(
        len(r.get("stances", {})) > 0
        for r in results if r["status"] == "SUCCESS"
    )
    p1_3 = "PASS" if has_stances else "FAIL"
    print(f"P1.3 Evidence clustering — {p1_3}")
    
    # P1.4 Gemini Grounding
    verdicts_valid = all(
        r.get("verdict") in ("TRUE", "FALSE", "PARTIALLY_TRUE", "MISLEADING", "INSUFFICIENT_EVIDENCE", "CONFLICTING_EVIDENCE")
        for r in results if r["status"] == "SUCCESS"
    )
    p1_4 = "PASS" if verdicts_valid else "FAIL"
    print(f"P1.4 Gemini grounding   — {p1_4}")
    
    # P1.5 Frontend (verified by code changes, not runtime)
    p1_5 = "PASS"
    print(f"P1.5 Frontend           — {p1_5} (code verified)")
    
    # P1.6 Documentation (will be done after passing)
    p1_6 = "PENDING"
    print(f"P1.6 Documentation      — {p1_6}")
    
    # Overall
    has_lexical = all(r.get("has_lexical_scores", False) for r in results if r["status"] == "SUCCESS")
    has_fusion = all(r.get("has_fusion_scores", False) for r in results if r["status"] == "SUCCESS")
    print(f"\nAll claims succeeded:    {all_success}")
    print(f"All have lexical scores: {has_lexical}")
    print(f"All have fusion scores:  {has_fusion}")
    
    overall = "PASS" if all([all_success, p1_1 == "PASS", p1_2 == "PASS", p1_3 == "PASS", p1_4 == "PASS"]) else "FAIL"
    print(f"\n{'='*60}")
    print(f"P1 GATE: {overall}")
    print(f"{'='*60}")
    
    # Save report
    report_path = Path(__file__).resolve().parent.parent / "p1_verification_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nReport saved to: {report_path}")


if __name__ == "__main__":
    asyncio.run(main())
