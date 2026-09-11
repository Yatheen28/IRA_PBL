"""
VAJRA AI – FastAPI application entry point.
Stage 2+: Full pipeline — Retrieval, Ranking, Reliability, Verdict, OCR, Multilingual.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.routes.verify import router as verify_router
from app.services.semantic_ranker import load_model

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── Lifespan: pre-load BGE at startup ────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Pre-load the BGE embedding model at startup so the first /verify
    request is not delayed by model initialisation.
    """
    logger.info("VAJRA AI startup — pre-loading BGE embedding model …")
    try:
        load_model()
        logger.info("Startup complete. BGE model is ready.")
    except Exception as exc:
        logger.error("FATAL: BGE model failed to load at startup: %s", exc)
        raise

    yield

    logger.info("VAJRA AI shutdown.")


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="VAJRA AI",
    description=(
        "Cross-Platform Multilingual Misinformation Knowledge Explorer. "
        "Full pipeline: Tavily → BGE → Source Reliability → Evidence Analysis "
        "→ Gemini Grounded Verdict → Knowledge Graph."
    ),
    version="0.3.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global error handlers ─────────────────────────────────────────────────────
@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    return JSONResponse(status_code=400, content={"detail": exc.errors()})


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(verify_router)


# ── Health endpoints ──────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {"message": "VAJRA AI backend is running", "version": "0.3.0"}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}
