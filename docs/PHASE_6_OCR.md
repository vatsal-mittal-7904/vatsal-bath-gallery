# Phase 6: Parcha OCR Workflow

## Subphase 6.1 — Parcha Image Upload and OCR Domain Foundation
*(See previous documentation for Phase 6.1 structural notes. The job model, storage abstraction, and `UPLOADED` state handling remain foundational.)*

---

## Subphase 6.2 — Gemini OCR Extraction and Structured Parsing

### Gemini Integration Architecture
The system utilizes `@google/generative-ai` to parse handwritten lists. The integration is safely isolated within `src/features/parcha/providers/gemini-ocr.provider.ts`. The implementation implements a server-only processing mechanism, ensuring no Gemini logic or API keys are ever exposed to the client.

### Configured Model and Configuration Method
- **Model**: Hardcoded to `gemini-flash-latest` internally within the provider because it offers the optimal balance of speed, multimodal vision capabilities, and deterministic schema outputs required for OCR tasks.
- **Configuration Method**: Controlled strictly via the server environment variable `GEMINI_API_KEY`. 

### Structured Extraction Schema
The model returns a JSON schema strictly validated using Zod (`ocrExtractionSchema`).
It produces:
- `rawText`: Complete extracted body.
- `items`: An array defining `originalText`, `productName`, `brand`, `size`, `quantity`, `unit`, `description`, `confidence`, and `notes`.
Missing fields are explicitly mapped to `null` to avoid inventing defaults.

### Confidence / Uncertainty Semantics
Confidence values are enumerated strictly as `low`, `medium`, or `high`.
- This is a heuristic signal. It is not a calibrated numerical probability percentage, which LLMs notoriously fabricate. 
- A `low` confidence item indicates messy handwriting, strike-throughs, or ambiguities explicitly flagged in the accompanying `notes` field.

### Processing and Retry Behavior
- **Concurrency**: The processor endpoint uses optimistic concurrency (`prisma.parchaJob.update({ where: { id, status: jobBefore.status } })`) to atomically lock the job, preventing race conditions or duplicate provider billing on double-clicks.
- **Failures & Retries**: Transient failures gracefully drop the job into a `FAILED` state. The UI exposes a "Retry" button. A hard cap of `3` `processingAttempts` prevents infinite loops on fundamentally corrupted images.

### Job Status Lifecycle and Transitions
- `UPLOADED` → `PROCESSING` (Atomic lock claimed via POST `/process`)
- `PROCESSING` → `REVIEW_REQUIRED` (Gemini successfully returned structured schema)
- `PROCESSING` → `FAILED` (Network timeout, rate limit, or invalid JSON parse)
- `FAILED` → `PROCESSING` (Manual retry under attempt threshold limit)
- `REVIEW_REQUIRED` → `COMPLETED` *(Reserved for Phase 6.3 Catalogue Matching)*

### Data Retention and Privacy Considerations
- **No PII Sent**: Parcha images explicitly do not include systemic identifiers, and no unrelated database information (catalogue cost, customer PII) is appended to the Gemini prompt context window.
- **Retention**: Draft `ParchaJobRow` extractions overwrite each other cleanly upon reprocessing. Provider traces and images are governed by the hosting setup's standard data policies.
- Note: Admins utilizing Google Cloud in production should verify their data processing agreements to ensure uploaded images are excluded from external model training datasets.

### API Endpoints
- `POST /api/v1/parcha-jobs/[id]/process` — Claims job and triggers Gemini OCR extraction inline.
- `GET /api/v1/parcha-jobs/[id]/extraction` — Retrieves draft rows.
- `PATCH /api/v1/parcha-jobs/[id]/extraction` — Persists user-corrected draft rows.

### Permissions
Both `STAFF` and `OWNER` utilize `parcha:upload` and `parcha:read`. Operations enforce backend role-scoping ensuring staff cannot intercept or mutate jobs belonging to alternate users.

### Local Setup and Testing Instructions
1. Copy `.env.example` to `.env` and fill `GEMINI_API_KEY` with your valid Google AI Studio key.
2. Run standard suite via `npm run test` (Includes robust mocked provider validations).
3. Open `http://localhost:3000/parcha` and click "Upload New Parcha".

### Known Limitations
- The OCR processing currently executes **synchronously** within the Next.js API route because setting up external persistent queues (like RabbitMQ, Redis BullMQ, or AWS SQS) exceeds the zero-dependency monolithic boundary. In highly trafficked productions, this might trigger Vercel/lambda timeouts and should be decoupled to an async background worker mechanism.
- The `ParchaJobRow` data is entirely an unverified draft. 

### Future Steps (Phase 6.3)
- Mapping extracted product text to verified Catalogue SKUs via semantic or fuzzy string matching.
- Explicitly assigning variants to OCR rows, resolving price logic, and aggregating into a finalized converted Estimate.
