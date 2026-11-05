# VAJRA AI: Evidence-Grounded Misinformation Detection & Real-Time Verified Communication System

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57.svg?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📌 Overview

The rapid diffusion of digital media across modern messaging channels has created an unprecedented vulnerability to coordinated misinformation, synthetic media, and out-of-context claims. Conventional conversational AI assistants often exacerbate this problem through **sycophancy, conversational drift, and parametric hallucinations**—confidently asserting statements without verifiable citations.

**VAJRA AI** is a comprehensive, evidence-grounded misinformation detection platform and authenticated real-time communication workstation. The system replaces black-box guessing with an auditable, multi-stage **Information Retrieval & Analytics (IRA)** pipeline. Instead of relying on an LLM's static training memory, VAJRA AI dynamically retrieves live multi-source evidence, evaluates source credibility, detects synthetic media manipulation, and synthesizes structured verdicts with complete provenance and knowledge graph visualization.

---

## 🔬 Core System Architecture

```
                                  [ User Claim / Image ]
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
             [ Text Claim Input ]                         [ Media Upload ]
                       │                                           │
                       │                        ┌──────────────────┴──────────────────┐
                       │                        ▼                                     ▼
                       │               [ Multimodal OCR ]                  [ Deepfake Detection ]
                       │         (Gemini Vision + EasyOCR)                (Generative Artifacts)
                       │                        │                                     │
                       └────────────────►───────┤                                     ▼
                                                │                            [ Synthetic Verdict ]
                                                ▼
                                    [ Language Normalization ]
                                 (Pivot Translation via NLLB/API)
                                                │
                                                ▼
                                  [ Web Evidence Retrieval ]
                                   (Tavily Advanced Search)
                                                │
                                                ▼
                                   [ Deep Content Scraping ]
                                (Jina Reader + Regex Sanitizer)
                                                │
                        ┌───────────────────────┴───────────────────────┐
                        ▼                                               ▼
             [ Lexical Ranker ]                               [ Semantic Ranker ]
            (Okapi BM25 Scoring)                          (BGE BAAI/bge-base-en-v1.5)
                        │                                               │
                        └───────────────────────┬───────────────────────┘
                                                │
                                                ▼
                                 [ Reciprocal Rank Fusion ]
                                    (Hybrid Score Fusion)
                                                │
                                                ▼
                                 [ Domain Authority Scoring ]
                                (Institutional Reliability Map)
                                                │
                                                ▼
                                  [ Grounded NLI Inference ]
                                  (Strict Zero-Shot Gemini)
                                                │
                        ┌───────────────────────┴───────────────────────┐
                        ▼                                               ▼
             [ Structured Verdict ]                          [ Knowledge Graph ]
          (Multi-Stance Evidence)                        (Timeline & Spread Topology)
```

---

## 💡 Key Features & Technical Highlights

### 1. Hybrid Lexical & Dense Vector Information Retrieval
* **Okapi BM25 Lexical Scoring:** Evaluates exact keyword occurrences, specific dates, entity names, and numerical statistics with document-length normalization ($k_1 = 1.5, b = 0.75$) and dynamic inverse document frequency ($\text{IDF}$) computation.
* **Dense Semantic Embeddings:** Encodes claims and documents in a 768-dimensional latent vector space using `BAAI/bge-base-en-v1.5` dual-encoders, resolving the **Vocabulary Mismatch Problem** through asymmetric task-instruction encoding.
* **Reciprocal Rank Fusion (RRF):** Combines the lexical and semantic rankings without manual coefficient tuning:
  $$\text{RRF}(d) = \sum_{m \in M} \frac{1}{k + r_m(d)} \quad (k = 60)$$

### 2. Live Content Extraction & Adversarial Ingestion Defense
* **Automated DOM Scraping:** Employs Jina Reader (`r.jina.ai`) to extract clean, boilerplate-free Markdown from dynamic web pages with a strict 2.5-second timeout and binary file exclusion.
* **Prompt Injection Neutralization:** Retrieved third-party web content is processed through an automated sanitization regex layer to disarm adversarial prompt injection attempts (e.g., `ignore previous instructions`, `you must say true`) prior to inference.

### 3. Heuristic Domain Authority & Source Diversity
* **Credibility Taxonomy:** Evaluates source domains against an auditable reliability taxonomy (Government: `0.90`, Scientific/Medical: `0.90`, Fact-Checking Agencies: `0.90`, Established News: `0.85`, Reference: `0.75`, User-Generated Forums: `0.30`).
* **Multi-Factor Score Fusion:**
  $$\text{Combined Score} = 0.70 \times \text{RRF Score} + 0.30 \times \text{Source Reliability Score}$$
* **Diversity Indexing:** Measures unique publisher domains and computes maximum domain concentration ratios to detect echo-chamber syndication.

### 4. Grounded Natural Language Inference (Zero Parametric Memory)
* Evaluates ranked evidence under strictly bounded zero-shot prompts where the evaluator model is forbidden from using internal pre-training memory.
* Generates calibrated verdicts: `TRUE`, `FALSE`, `PARTIALLY_TRUE`, `MISLEADING`, `CONFLICTING_EVIDENCE`, and `INSUFFICIENT_EVIDENCE`.
* Stance attribution per source (`supporting`, `contradicting`, `contextual`).

### 5. Multimodal Forensics & Forensic Image Verification
* **Claim Extraction OCR:** Extracts text from viral flyers, memes, and regional language banners using Gemini Multimodal Vision with EasyOCR fallback.
* **Generative Artifact Detection:** Inspects images for artificial textures, unnatural frequency patterns, lighting inconsistencies, and diffusion artifacts to determine authenticity (`AI_GENERATED`, `AUTHENTIC`, `UNCERTAIN`).

### 6. Interactive Knowledge Graph & Spread Topology
* Automatically maps verified claims into entity-relationship graphs featuring claim origin, chronological event timelines, documented spread vectors, variant wordings, and debunking chains.

### 7. Two-Tier Verification Memory & Request Coalescing
* Two-tier persistent SQLite caching (exact SHA-256 digest + normalized linguistic key) with configurable TTL.
* Asynchronous single-flight request coalescing using locks to prevent redundant pipeline execution during concurrent traffic spikes.

### 8. Authenticated Real-Time Chat Workstation
* Person-to-person messaging engine with PBKDF2/bcrypt password hashing, JWT bearer sessions, SQLite persistence, and asynchronous WebSocket real-time updates (`/chat/ws`).
* In-line, per-message verification triggering text and image fact-checking directly inside chat threads without intrusive conversational bots.

---

## 📂 Repository Structure

```
IRA_PBL/
├── backend/
│   ├── app/
│   │   ├── db/                     # SQLAlchemy models and SQLite connection sessions
│   │   │   ├── models.py           # User, Conversation, Message, Verification entities
│   │   │   └── session.py          # Database engine and session lifecycle
│   │   ├── routes/                 # FastAPI HTTP and WebSocket routers
│   │   │   ├── chat.py             # Auth, conversation CRUD, and WebSocket manager
│   │   │   └── verify.py           # Text verification, OCR, and AI image detection
│   │   ├── services/               # Core analytical and algorithmic engines
│   │   │   ├── ai_image_detector.py # Generative artifact detection
│   │   │   ├── auth.py             # Password hashing and JWT token management
│   │   │   ├── bm25_ranker.py      # Okapi BM25 and Reciprocal Rank Fusion (RRF)
│   │   │   ├── evidence_analyzer.py# Jina Reader extraction and score weighting
│   │   │   ├── knowledge_graph.py  # Claim timeline and topology builder
│   │   │   ├── language_service.py # Language identification and translation
│   │   │   ├── ocr_service.py      # Multimodal OCR (Gemini Vision + EasyOCR)
│   │   │   ├── semantic_ranker.py  # BGE neural embeddings and cosine similarity
│   │   │   ├── source_reliability.py# Domain credibility scoring
│   │   │   ├── verdict_engine.py   # Grounded NLI verdict synthesis
│   │   │   ├── verification_cache.py# Persistent memory and request coalescing
│   │   │   └── web_retriever.py    # Tavily search integration
│   │   └── main.py                 # Application bootstrap, CORS, and lifespan events
│   ├── .env.example                # Template for environment configuration
│   └── requirements.txt            # Python dependencies
│
└── frontend/
    ├── public/                     # Static assets and icons
    ├── src/
    │   ├── api/                    # HTTP and WebSocket service clients
    │   │   ├── chat.js             # Chat and messaging API adapter
    │   │   └── verification.js     # Verification API adapter
    │   ├── components/             # Modular React components
    │   │   ├── chat/               # Conversations, composer, and message actions
    │   │   ├── ClaimInput.jsx      # Input interface for text claims
    │   │   ├── EvidenceCard.jsx    # Evidence presentation with reliability badges
    │   │   ├── ImageUpload.jsx     # Multimodal image upload and preview
    │   │   ├── KnowledgeGraph.jsx  # Interactive claim spread and timeline graph
    │   │   ├── ResultsSection.jsx  # Structured verdict, confidence, and reasoning
    │   │   └── Verifier.jsx        # Standalone verification interface
    │   ├── hooks/                  # React state and verification hooks
    │   ├── styles/                 # Design tokens and global stylesheets
    │   ├── App.jsx                 # Workstation layout and mode navigation
    │   └── main.jsx                # React application root
    ├── index.html                  # HTML entry point
    ├── package.json                # Frontend package dependencies
    └── vite.config.js              # Vite server and reverse proxy configuration
```

---

## 🛠️ Technology Stack

| Layer | Technology | Function |
| :--- | :--- | :--- |
| **Backend Framework** | FastAPI (Python 3.11+) | Asynchronous REST endpoints, WebSocket routing, Pydantic v2 validation |
| **ASGI Server** | Uvicorn | High-performance asynchronous execution |
| **Database & ORM** | SQLite & SQLAlchemy | Persistent user state, conversation history, and verification cache |
| **Neural Embeddings** | `BAAI/bge-base-en-v1.5` | Dense 768-dimensional semantic passage representation |
| **Lexical IR** | Pure Python Okapi BM25 | Term saturation ($k_1=1.5$), length penalty ($b=0.75$), dynamic IDF |
| **Rank Aggregation** | Reciprocal Rank Fusion | Interleaved ranking combining lexical and semantic scores ($k=60$) |
| **Web Discovery** | Tavily Search API | Real-time candidate URL and snippet retrieval |
| **Content Scraping** | Jina AI Reader API | Boilerplate-free HTML-to-Markdown distillation |
| **Multimodal Reasoning** | Google Gemini 3.1 Flash | Grounded NLI inference, multimodal OCR, and synthetic image analysis |
| **Frontend Framework** | React 19 + Vite 8 | Retro workstation interface, reactive state management |
| **Security** | PyJWT, PBKDF2/Bcrypt | Cryptographic access tokens and salted password storage |

---

## 🚀 Installation & Local Setup

### Prerequisites
* **Python:** 3.11 or higher
* **Node.js:** 18.0 or higher
* **API Credentials:**
  * Tavily Search API Key ([https://app.tavily.com](https://app.tavily.com))
  * Google Gemini API Key ([https://aistudio.google.com](https://aistudio.google.com))

---

### Step 1: Configure the Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   # Windows (PowerShell)
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1

   # Linux / macOS
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your API keys:
   ```env
   TAVILY_API_KEY=tvly-your-tavily-api-key
   GEMINI_API_KEY=your-gemini-api-key
   VAJRA_JWT_SECRET=your-random-jwt-secret
   VERIFY_CACHE_ENABLED=true
   VERIFY_CACHE_TTL_HOURS=24.0
   ```

5. Launch the backend server:
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   *The interactive API documentation is available at `http://127.0.0.1:8000/docs`.*

---

### Step 2: Configure the Frontend

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch the Vite development server:
   ```bash
   npm run dev
   ```
   *The workstation will be accessible at `http://localhost:5173`.*

---

## 📡 API Specification

### 1. Text Claim Verification
`POST /verify`
* Submits a factual claim for full-pipeline verification.
* **Payload:**
  ```json
  {
    "claim": "Water boils at 100 degrees Celsius at sea level",
    "force_refresh": false
  }
  ```
* **Response Summary:**
  ```json
  {
    "original_claim": "Water boils at 100 degrees Celsius at sea level",
    "verdict": "TRUE",
    "analysis_confidence": 0.98,
    "summary": "Scientific consensus confirms that pure water boils at 100°C under 1 atmosphere of pressure.",
    "evidence": [
      {
        "rank": 1,
        "title": "Boiling Point of Water - USGS",
        "url": "https://www.usgs.gov/...",
        "source_domain": "usgs.gov",
        "source_reliability_score": 0.90,
        "reliability_tier": "HIGH",
        "combined_score": 0.884,
        "stance": "supporting"
      }
    ],
    "source_diversity": {
      "unique_domains": 5,
      "max_domain_concentration": 0.20
    }
  }
  ```

### 2. Image OCR Fact-Check
`POST /verify/image`
* Multipart upload (`image`) extracting claims from images before executing verification.

### 3. AI Synthetic Image Detection
`POST /verify/image/ai-detect`
* Multipart upload (`image`) analyzing digital generation artifacts.
* **Response Verdicts:** `AI_GENERATED`, `AUTHENTIC`, or `UNCERTAIN`.

### 4. Real-Time Chat & Messaging
* `POST /chat/register` & `POST /chat/login`: User onboarding and JWT bearer generation.
* `GET /chat/conversations`: Fetch active threads.
* `POST /chat/conversations/{id}/messages`: Dispatch text messages.
* `POST /chat/conversations/{id}/messages/image`: Dispatch image attachments.
* `WS /chat/ws?token={token}`: Real-time event subscription.

---

## 🔒 Security & Responsible AI Considerations

* **Deterministic Grounding:** LLM inference is strictly isolated from open-ended web generation, mitigating hallucination and bias propagation.
* **Adversarial Web Sanitization:** Ingested web content is pre-filtered against prompt injection vectors before being incorporated into inference contexts.
* **Privacy by Design:** Personal chat messages and verification queries are decoupled; verification results are attached per message ID and are never used for model re-training.
* **Credential Isolation:** Client applications communicate through scoped JWT bearer tokens; sensitive API keys are restricted strictly to server-side environments.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
