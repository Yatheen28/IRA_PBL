import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

from app.routes.verify import VerifyRequest, verify_claim

async def main():
    req = VerifyRequest(claim="The Earth is flat")
    res = await verify_claim(req)
    print("Verdict:", res.verdict)
    print("Language:", res.language)
    print("Evidence Count:", len(res.evidence))

if __name__ == "__main__":
    asyncio.run(main())
