# VAJRA AI — Project Progress

> **Last updated:** 30 September 2026
> **Status:** Active Development
> **Stack:** FastAPI (Python) · React (Vite) · Google Gemini · Tavily · EasyOCR · BGE/Sentence-Transformers

---

## 1. Project Overview

**VAJRA AI** (Verified Automated Journalistic and Research Assistant) is a full-stack misinformation detection platform. It accepts text claims or images, runs them through a multi-stage verification pipeline, and returns a grounded verdict backed by real-time web evidence.

Two modes are available from the same interface:

| Mode | URL | Purpose |
|------|-----|---------|
| VAJRA Verifier | `/#verify` | Standalone fact-checker for claims and images |
| VAJRA Chat | `/#chat` | Messenger with inline per-message fact-checking |

---

## 2. Architecture — End-to-End Pipeline

```
User Input (text / image)
        |
        v
Language Detection + Translation  (langdetect + Gemini)
        |
        v
OCR (images only)                 (EasyOCR)
        |
        v
Web Retrieval                     (Tavily Search API)
        |
        v
Semantic Ranking + BM25           (BGE + RRF hybrid fusion)
        |
        v
Source Reliability Scoring        (domain whitelist/blacklist)
        |
        v
Evidence Analysis / Stance        (Gemini per-source stance)
        |
        v
Verdict Engine                    (Gemini final verdict)
        |
        v
Knowledge Graph Builder           (Gemini — timeline/evidence map)
```

### AI Image Detection (separate pipeline)
```
Image Upload → Gemini Vision → AI_GENERATED | AUTHENTIC | UNCERTAIN
```

---

## 3. Backend — Services (backend/app/services/)

### language_service.py
- Language detection using `langdetect`
- Translation to English using Gemini (gemini-3.5-flash-lite)
- Claim normalization — strips noise, resolves ambiguous pronouns
- Returns: normalized_claim, detected_language, translated flag

### web_retriever.py
- Calls Tavily Search API with the normalized claim
- Returns top N results (title, URL, content snippet, score)
- Configurable result count and search depth

### semantic_ranker.py
- Loads BGE (BAAI/bge-base-en-v1.5) embeddings via sentence-transformers
- Computes cosine similarity between claim and each evidence snippet
- Also runs BM25 lexical ranking (via bm25_ranker.py)
- Fuses both with Reciprocal Rank Fusion (RRF) into a combined_score
- Returns ranked evidence list

### bm25_ranker.py
- Standalone BM25 implementation using scikit-learn
- Used as the lexical component in the hybrid ranking fusion

### source_reliability.py
- Scores each source domain:
  - Whitelist (academic, government, major news) → HIGH
  - Known unreliable domains → LOW
  - Everything else → MEDIUM
- Attaches: source_reliability_score, reliability_tier, reliability_reason

### evidence_analyzer.py
- Calls Gemini to analyse each piece of evidence in context
- Assigns stance: supporting | contradicting | contextual | unclear
- Produces combined_score (reliability x semantic x lexical)
- Includes fallback model chain if primary model fails

### verdict_engine.py
- Calls Gemini with the full ranked + scored evidence set
- Produces:
  - verdict: TRUE | FALSE | MISLEADING | PARTIALLY_TRUE | INSUFFICIENT_EVIDENCE | CONFLICTING_EVIDENCE | UNVERIFIED
  - analysis_confidence: float 0-1
  - summary: plain-English verdict explanation
  - reasoning: detailed step-by-step reasoning
  - limitations: list of caveats
- Robust fallback chain: tries multiple Gemini models; catches 404/NOT_FOUND and retries

### knowledge_graph.py
- Calls Gemini with claim + verdict + evidence to generate a structured graph
- Output:
  - timeline[] — chronological history events (Origin, Circulation, Fact-Check...)
  - variations[] — different claim wordings found in evidence
  - spread_path[] — documented source-to-source propagation
  - debunking_path[] — challenge/debunking chain (empty if not found)
  - current_status — one of 6 status strings
  - current_status_summary — plain-English final assessment
  - evidence_nodes[] — each source with stance, reliability, URL, date
  - nodes[] / edges[] — flat graph for programmatic use
- Accuracy enforced: unknown data marked "Unknown / Not established" — nothing fabricated
- Fallback: builds simpler graph directly from evidence if Gemini fails

### ocr_service.py
- Uses EasyOCR to extract text from uploaded images
- Supports multi-language text extraction
- Returns concatenated text string for the verification pipeline

### ai_image_detector.py  [NEW]
- Uses Gemini Vision to analyse uploaded images
- Checks for AI-generation indicators:
  - Unnatural textures (skin, fabric, hair, water)
  - Anatomical errors (extra fingers, distorted faces)
  - Inconsistent lighting / shadows
  - Background blur / morphing artifacts
  - Hallucinated or garbled text
  - Unnaturally perfect composition
- Returns: verdict (AI_GENERATED | AUTHENTIC | UNCERTAIN), confidence, summary, indicators[], limitations[]

### auth.py
- JWT-based authentication for the Chat module
- Password hashing with bcrypt
- Token generation and validation

---

## 4. Backend — API Routes

Server: localhost:8000

### verify.py

| Method | Path | Description |
|--------|------|-------------|
| POST | /verify | Text claim → full pipeline → verdict + knowledge graph |
| POST | /verify/image | Image upload → OCR → full pipeline → verdict |
| POST | /verify/image/ai-detect | Image upload → Gemini vision → AI generation check |

POST /verify response fields:
- original_claim, normalized_claim, language
- verdict, analysis_confidence
- summary, reasoning, limitations[]
- evidence[] — full ranked list with stance, reliability, scores
- knowledge_graph — full rich graph object
- source_diversity — domain distribution metadata

POST /verify/image/ai-detect response:
- verdict: AI_GENERATED | AUTHENTIC | UNCERTAIN
- confidence: 0.0–1.0
- summary, indicators[], limitations[]

### chat.py

| Method | Path | Description |
|--------|------|-------------|
| POST | /chat/register | Register new user |
| POST | /chat/login | Login → JWT token |
| GET | /chat/conversations | List conversations |
| POST | /chat/conversations | Create conversation |
| GET | /chat/conversations/{id}/messages | Get messages |
| POST | /chat/conversations/{id}/messages | Send message |
| DELETE | /chat/messages/{id} | Delete message |
| WS | /chat/ws/{token} | WebSocket real-time events |

---

## 5. Frontend — VAJRA Verifier

Entry: frontend/src/components/Verifier.jsx
URL: http://localhost:5173

### Components

| Component | Purpose |
|-----------|---------|
| Verifier.jsx | Root — orchestrates input, mode selection, results |
| ClaimInput.jsx | Text textarea with counter and clear button |
| ImageUpload.jsx | Drag-and-drop image uploader with preview |
| VerifyButton.jsx | Submit button with loading state |
| LoadingState.jsx | Animated loading skeleton |
| ErrorState.jsx | Error display with retry |
| EmptyResults.jsx | No results state |
| ResultsSection.jsx | Tabbed results view |
| EvidenceCard.jsx | Individual evidence item card |
| KnowledgeGraph.jsx | Full interactive knowledge graph |

### Image Analysis Mode Selector
When an image is uploaded, two modes appear:
- Extract & Verify — EasyOCR text → full fact-check pipeline
- AI Detection — Gemini vision AI-generation check

### ResultsSection Tabs
| Tab | Contents |
|-----|----------|
| Summary | Verdict + confidence, summary, reasoning, limitations |
| Top Sources | Top-5 clickable sources with domain, tier, stance colour |
| Knowledge Graph | Interactive KnowledgeGraph component |
| All Evidence | Full ranked EvidenceCard list |

### PDF Download
- Button: "Download PDF"
- Client-side via jsPDF (no server needed)
- A4 PDF with: branded header, claim, verdict, confidence, summary, top 5 sources with URLs, reasoning, limitations, page numbers

---

## 6. Frontend — VAJRA Chat

Entry: frontend/src/components/chat/Chat.jsx
URL: http://localhost:5173/#chat

### Components

| Component | Purpose |
|-----------|---------|
| Chat.jsx | Root chat — auth, conversations, verification state |
| ChatAuth.jsx | Login / register form |
| ConversationList.jsx | Left sidebar — conversations with unread badges |
| Conversation.jsx | Message thread view |
| MessageComposer.jsx | Input with emoji picker and image attachment |
| ChatMessage.jsx | Individual message bubble |
| MessageActions.jsx | Context menu — reply, verify, copy, delete, forward |
| NewChatDialog.jsx | Start new conversation dialog |
| ChatDialog.jsx | Generic modal dialog wrapper |
| ChatIcon.jsx | SVG icon set |

### Inline VAJRA Verification
Every message has a small bolt button on hover.

Text messages: runs full VAJRA pipeline → inline VerificationCard

Image messages: opens Image Mode Dialog with two options:
- AI Detection → /verify/image/ai-detect → AI_GENERATED / AUTHENTIC / UNCERTAIN
- OCR + Fact Check → /verify/image → full pipeline result

### Evidence Dialog
After "View evidence" click shows:
- Summary and reasoning (collapsible)
- Top 5 sources with clickable links, stance colour, reliability tier
- AI detection indicators (for image analysis)
- Full evidence list
- Limitations

### Real-time Features
- WebSocket live message delivery
- Typing indicators
- Online/offline presence
- Unread count badge in browser tab title

---

## 7. Knowledge Graph

Component: frontend/src/components/KnowledgeGraph.jsx
Generated by: backend/app/services/knowledge_graph.py (Gemini-powered)

### View 1 — Claim Timeline (vertical flowchart)
- Chronological history events: Origin → Circulation → Fact-Check → Current Assessment
- Claim Variations card grid (if found in evidence)
- Spread Path chain (if documented in evidence)
- Debunking Path chain (or "No reliable debunking evidence identified")

### View 2 — Evidence Map
- Central CLAIM node
- Three evidence columns: Supports | Contradicts | Context
- Evidence cards per column (clickable)
- Current Status block at bottom

### Clickable Detail Panel
Every node opens a slide-in panel showing:
- Full text / description
- Event type and date
- Source name and domain
- Reliability tier
- Clickable external link

### Accuracy Guarantee
Never fabricates: origins, dates, people, organizations, social media posts,
spread patterns, fact-checks, debunking events, or relationships.
Unknown information is explicitly shown as "Unknown / Not established".

---

## 8. Dependencies

### Backend

| Package | Purpose |
|---------|---------|
| fastapi | Web framework |
| uvicorn | ASGI server |
| tavily-python | Tavily web search |
| python-dotenv | .env config |
| pydantic | Validation |
| sentence-transformers | BGE embeddings |
| numpy | Vector maths |
| scikit-learn | BM25 / cosine similarity |
| google-genai | Gemini LLM + Vision |
| langdetect | Language detection |
| python-multipart | File upload |
| easyocr | Image OCR |
| Pillow | Image processing |
| sqlalchemy | Chat DB ORM |
| PyJWT | Auth tokens |
| bcrypt | Password hashing |

### Frontend

| Package | Purpose |
|---------|---------|
| react + react-dom | UI framework |
| vite | Dev server + bundler |
| jspdf | Client-side PDF generation |

---

## 9. Environment Variables

File: backend/.env

```
GEMINI_API_KEY=your_gemini_api_key
TAVILY_API_KEY=your_tavily_api_key
```

---

## 10. Running the Project

Backend (terminal 1):
```
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend (terminal 2):
```
cd frontend
npm run dev
```

Open http://localhost:5173

---

## 11. File Map

```
IRA_PBL/
├── backend/
│   ├── .env
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── routes/
│       │   ├── verify.py             # /verify endpoints + ai-detect
│       │   └── chat.py               # /chat endpoints + WebSocket
│       └── services/
│           ├── language_service.py
│           ├── web_retriever.py
│           ├── semantic_ranker.py
│           ├── bm25_ranker.py
│           ├── source_reliability.py
│           ├── evidence_analyzer.py
│           ├── verdict_engine.py
│           ├── knowledge_graph.py
│           ├── ocr_service.py
│           ├── ai_image_detector.py
│           └── auth.py
│
├── frontend/
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── styles/
│       │   ├── variables.css
│       │   └── globals.css
│       ├── api/
│       │   ├── verification.js
│       │   └── chat.js
│       └── components/
│           ├── Header.jsx
│           ├── Footer.jsx
│           ├── Verifier.jsx
│           ├── ClaimInput.jsx
│           ├── ImageUpload.jsx
│           ├── VerifyButton.jsx
│           ├── LoadingState.jsx
│           ├── ErrorState.jsx
│           ├── EmptyResults.jsx
│           ├── ResultsSection.jsx
│           ├── EvidenceCard.jsx
│           ├── KnowledgeGraph.jsx
│           └── chat/
│               ├── Chat.jsx
│               ├── ChatAuth.jsx
│               ├── ConversationList.jsx
│               ├── Conversation.jsx
│               ├── MessageComposer.jsx
│               ├── ChatMessage.jsx
│               ├── MessageActions.jsx
│               ├── NewChatDialog.jsx
│               ├── ChatDialog.jsx
│               ├── ChatIcon.jsx
│               └── Chat.css
│
├── run.txt
├── README.md
└── progress.md
```

---

*VAJRA AI — IRA PBL Project*
