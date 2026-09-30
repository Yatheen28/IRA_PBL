# VAJRA Chat — current working handoff

## Goal / non-negotiables
Build person-to-person messaging, NOT an AI chatbot. Keep standalone VAJRA AI available. Optional per-message text/image verification uses existing evidence-grounded backend. Preserve actual frontend design tokens (warm monochrome, IBM Plex Sans/Mono, blue accent, square controls/window-card borders/offset shadows). No seeded contacts, fabricated messages, fake delivery/read/online/typing, or invented verification results.

## Discovery
- Frontend: React 19 + Vite 8, plain CSS, no router/component library. `frontend/src/App.jsx` is standalone verifier. Tokens in `frontend/src/styles/variables.css` and `globals.css`.
- Backend: FastAPI, `/verify`, `/verify/image`; no messaging/auth/persistence/WebSocket implementation exists.
- `/verify/image` currently OCRs text and errors if no readable text. No image-generation analysis currently exists.
- Existing frontend image input is placeholder-only and verifier API returns full evidence/verdict objects.
- Older docs/DESIGN.md chatbot flow is superseded by current user brief.
- Starting git status clean.

## Plan
1. [in progress] Inspect contracts; establish shared interfaces and ownership.
2. Add SQLite-backed authenticated messaging REST/WebSocket backend and browser service.
3. Build Chat UI, mode navigation, responsive two-pane/two-screen layout, composer, message actions/history.
4. Wire optional compact verification/evidence cards and standalone image flow.
5. Run lint/build/backend integration and browser checks, document limitations and deployment requirements.

## Ownership (parallel work; no board needed for two agents)
- Main agent: `CURRENT_WORKING.md`, Chat UI/components/CSS except MessageVerification, App/header/navigation integration, README/docs, integrated validation.
- Messaging agent: backend chat service/routes/tests, app router registration, frontend `src/api/chat.js`, Vite proxy changes, chat contract doc.
- Verification agent: verification API/hooks/image upload; backend image analysis fallback; MessageVerification compact component/CSS; standalone minimal image wiring in a NEW Verifier.jsx (main will mount it).

## Intended architecture
- Actual accounts / bearer sessions; SQLite messages/conversations; authenticated WebSocket updates. Single-process initial deployment; do not claim end-to-end encryption or production scale.
- Browser service encapsulates HTTP/WebSocket; React renders actual server data. No local fake messaging mode.
- New-chat account search finds real users. Two accounts in separate browser sessions can communicate.
- Message verification is user-triggered, private per-user persisted result attached by message id, independent of original message/history. No automatic AI replies.
- Groups structurally supported but creation may remain a future feature; image/photo support prioritized over documents.

## Resume notes
Read this file and `docs/CHAT.md` (once present), inspect git diff and tests. Coordination details/results will be appended as work progresses. Do not read backend/.env secrets. Do not overwrite other agents' files.
