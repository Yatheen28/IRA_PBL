# VAJRA AI 🔍
### *Cross-Platform Multilingual Misinformation Knowledge Explorer*
> **"Verify Before You Share."**

![Stage](https://img.shields.io/badge/Stage-2%20Semantic%20Ranking-blue)
![Python](https://img.shields.io/badge/Python-3.11%2B-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.141-009688?logo=fastapi)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)

---

## 📖 What Is VAJRA AI?

VAJRA AI is an intelligent misinformation detection system. Given any claim or piece of text, it retrieves real-time web evidence, analyses it across multiple sources, and produces a grounded, explainable verdict — without hallucinating facts.

The system is being built **incrementally**, one layer at a time.

---

## 🏗️ Architecture Roadmap

| Stage | Component | Status |
|-------|-----------|--------|
| **1** | Web Evidence Retrieval (Tavily) | ✅ **Complete** |
| **2** | Semantic Evidence Ranking (BGE) | ✅ **Complete** |
| 3 | Source Reliability Scoring | ⏳ Pending |
| 4 | Evidence Ranking & Clustering | ⏳ Pending |
| 5 | Gemini Grounded Verdict Generation | ⏳ Pending |
| 6 | OCR / Image Claim Extraction | ⏳ Pending |
| 7 | Knowledge Graph Integration | ⏳ Pending |
| 8 | Multilingual Support | ⏳ Pending |
| 9 | React Frontend (full integration) | ⏳ Pending |

---

## 📂 Project Structure

```
Dangerous_weapons/          <- project root
│
└── backend/                <- FastAPI backend
    ├── app/
    │   ├── __init__.py
    │   ├── main.py         <- FastAPI app entry point (lifespan, logging)
    │   ├── routes/
    │   │   ├── __init__.py
    │   │   └── verify.py   <- POST /verify endpoint
    │   └── services/
    │       ├── __init__.py
    │       ├── web_retriever.py    <- Stage 1: Tavily search service
    │       └── semantic_ranker.py  <- Stage 2: BGE embedding + cosine ranking
    ├── eval_ranker.py      <- Dev-only evaluation utility (demo / presentation)
    ├── .env                <- secrets (never commit)
    ├── .gitignore
    └── requirements.txt
```

---

## ⚡ Stage 1 – Web Evidence Retrieval

### What it does

```
User Claim
    ↓
FastAPI  POST /verify
    ↓
Tavily Web Search API
    ↓
Top 5 relevant web results
    ↓
Structured evidence response (JSON)
```

No AI verdict. No classification. Pure retrieval.

---

## 🧠 Stage 2 – Semantic Evidence Ranking

### What it does

```
User Claim
    ↓
Tavily Web Search
    ↓
Retrieved Web Results
    ↓
BGE Embedding Model (BAAI/bge-base-en-v1.5)
    ↓
Cosine Similarity
    ↓
Semantic Ranking
    ↓
Top Relevant Evidence (ranked by semantic score)
```

After Stage 1 retrieves results from Tavily, Stage 2 re-ranks them using **semantic similarity** — so the most topically relevant results for the claim appear first, regardless of Tavily's original ordering.

### Why BGE?

`BAAI/bge-base-en-v1.5` is a state-of-the-art open-source embedding model from the **BGE (BAAI General Embedding)** family. It is optimised for asymmetric information retrieval, meaning:

- The **claim** (query) is encoded with a task-description prefix.
- The **evidence** (passages) are encoded without a prefix.

This produces better cosine similarity scores than symmetric models for retrieval tasks.

### Important: semantic_score ≠ truth

> `semantic_score` measures **semantic relevance** — how topically similar the evidence is to the claim.  
> It does **NOT** measure truthfulness.  
> A `semantic_score` of `0.95` means the document is highly relevant, not that it is 95% true.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Python 3.11+ |
| Web Framework | FastAPI |
| ASGI Server | Uvicorn |
| Web Search | Tavily Search API |
| Embedding Model | `BAAI/bge-base-en-v1.5` (sentence-transformers) |
| Similarity | Cosine similarity (scikit-learn) |
| Vectors | NumPy |
| Validation | Pydantic v2 |
| Config | python-dotenv |

---

## 🚀 Setup & Running

### Prerequisites
- Python 3.11 or higher
- A free Tavily API key → https://app.tavily.com

### 1. Clone / navigate to project
```bash
cd backend
```

### 2. Create a virtual environment
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1     # Windows PowerShell
# source .venv/bin/activate    # macOS / Linux
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

> **Note:** `sentence-transformers` will download the `BAAI/bge-base-en-v1.5` model (~440 MB)
> on the first run. Subsequent starts use the cached model from `~/.cache/huggingface/`.

### 4. Configure your API key
Edit `backend/.env`:
```env
TAVILY_API_KEY=tvly-your-real-key-here
```

> **Warning:** Never commit `.env` — it is already in `.gitignore`.

### 5. Start the server
```powershell
.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
```

The server starts at **http://127.0.0.1:8000**

On first startup, the BGE model is pre-loaded via FastAPI's lifespan event — you will see log output like:
```
INFO | app.main | VAJRA AI startup — pre-loading BGE embedding model …
INFO | app.services.semantic_ranker | Loading BGE model: BAAI/bge-base-en-v1.5 …
INFO | app.services.semantic_ranker | BGE model loaded successfully.
INFO | app.main | Startup complete. BGE model is ready.
```

---

## 📡 API Reference

### `GET /`
Health check.
```json
{ "message": "VAJRA AI backend is running" }
```

### `GET /health`
```json
{ "status": "ok" }
```

### `POST /verify`
Submit a claim and receive semantically ranked web evidence.

**Request:**
```json
{
  "claim": "5G towers cause coronavirus"
}
```

**Response:**
```json
{
  "claim": "5G towers cause coronavirus",
  "results": [
    {
      "rank": 1,
      "title": "Fact check: 5G and COVID-19",
      "url": "https://example.com/article",
      "content": "There is no scientific evidence linking 5G...",
      "search_score": 0.91,
      "semantic_score": 0.87
    },
    {
      "rank": 2,
      "title": "Reuters: No link between 5G and coronavirus",
      "url": "https://reuters.com/...",
      "content": "Scientists have confirmed that 5G radio waves...",
      "search_score": 0.84,
      "semantic_score": 0.79
    }
  ]
}
```

**Field descriptions:**

| Field | Description |
|-------|-------------|
| `rank` | 1-based position after semantic re-ranking |
| `search_score` | Original Tavily relevance score (preserved for future hybrid scoring) |
| `semantic_score` | BGE cosine similarity between claim and evidence (semantic relevance, not truth probability) |

**Error codes:**

| Code | Meaning |
|------|---------|
| `422` | Invalid / empty claim |
| `503` | Tavily API key missing |
| `502` | Tavily API or network failure |
| `404` | No results found for claim |
| `500` | Semantic ranking failure (BGE error) |

### `GET /docs`
Interactive Swagger UI — test all endpoints in the browser.  
http://127.0.0.1:8000/docs

---

## 🧪 Quick Test (PowerShell)

```powershell
# Health check
Invoke-RestMethod -Uri "http://127.0.0.1:8000/" -Method GET

# Verify a claim (returns ranked evidence)
Invoke-RestMethod -Uri "http://127.0.0.1:8000/verify" `
  -Method POST `
  -Body '{"claim": "The Earth is flat"}' `
  -ContentType "application/json" | ConvertTo-Json -Depth 5

# Test validation -- should return 422
Invoke-RestMethod -Uri "http://127.0.0.1:8000/verify" `
  -Method POST `
  -Body '{"claim": ""}' `
  -ContentType "application/json"
```

---

## 🔬 Evaluation Utility (Development Only)

Run the standalone evaluation script to test the full pipeline and see ranked output:

```powershell
# From backend/ with the venv active
python eval_ranker.py
```

Example output:
```
======================================================================
Claim:
  5G towers cause coronavirus
======================================================================

Tavily returned 5 result(s).
BGE ranked 5 result(s) successfully.

Retrieved results (sorted by semantic relevance):

  Rank 1
  Semantic relevance score : 0.8741
  Tavily search score      : 0.91
  Title                    : Fact check: 5G and COVID-19 conspiracy theories
  URL                      : https://...

  Rank 2
  Semantic relevance score : 0.8123
  Tavily search score      : 0.87
  Title                    : No scientific evidence links 5G to coronavirus
  URL                      : https://...

  ⚠  Note: semantic_score measures relevance, NOT truthfulness.
```

---

## 🔐 Security Notes

- The Tavily API key is **only used server-side** and is never exposed to the frontend.
- CORS is configured to allow only `http://localhost:5173` (Vite dev server) during local development.
- No stack traces are returned in API error responses.
- API keys are never logged.

---

## 📦 Dependencies

```
fastapi
uvicorn
tavily-python
python-dotenv
pydantic
sentence-transformers
numpy
scikit-learn
```

---

## 📝 Changelog

### Stage 2 – 2026-09-11
- `semantic_ranker.py` — BGE embedding service with singleton model loading
- BGE model pre-loaded at startup via FastAPI lifespan (not per-request)
- Cosine similarity ranking using `sklearn.metrics.pairwise.cosine_similarity`
- Asymmetric embedding: query prefix on claim, passage-side encoding for evidence
- Empty/short content filtering — malformed results skipped without crashing
- Both `search_score` (Tavily) and `semantic_score` (BGE) preserved in response
- Results sorted by `semantic_score DESC`; `rank` field added (1-based)
- Structured logging across all services (no API keys or sensitive data logged)
- `eval_ranker.py` — standalone development evaluation utility
- Version bumped to `0.2.0`

### Stage 1 – 2026-09-11
- Backend scaffolded (`app/`, `routes/`, `services/`)
- `POST /verify` endpoint with Pydantic v2 validation
- `search_evidence()` service using Tavily advanced search
- Health endpoints (`GET /`, `GET /health`)
- CORS configured for `localhost:5173`
- Error handling: missing key, network failure, empty results
- `.env` + `.gitignore` set up securely
- Swagger UI available at `/docs`

---

## 🤝 Contributing

This is an incremental build. Each stage is isolated and tested before the next begins.

---

*README last updated: Stage 2 – Semantic Evidence Ranking*
