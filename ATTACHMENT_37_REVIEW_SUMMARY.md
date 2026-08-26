# Attachment 37 Review Summary

Attachment 37 supersedes the previous publication request. It requires **exact source recovery only** for the previously validated Phase 4 Step 3 paper-first OP and billing-closure implementation, based on canonical GitHub commit `55574b63c3b664e27eb57a24d3dfce94db6e652e`.

The required source must contain the paper-first `visits.generateOP` and `visits.completeConsultation` routes, blank consultant-branded OP rendering, consultation-linked billing gates, appointment completion only after bill creation, `server/paperFirstVisit.test.ts`, migration `drizzle/0026_lowly_bromley.sql`, Drizzle metadata, and unique `bills.consultationId` protection.

The attachment expressly prohibits reimplementation, reconstruction, publication, modification of canonical main, and using screenshots or reports as replacement source. Recovery must be read-only and may materialize a candidate only in a separate temporary worktree. If an exact candidate is found, it must be revalidated with type-check, focused tests, full tests, build, diff checks, and isolated migration checks, then classified as `PHASE4_STEP3_EXACT_SOURCE_RECOVERED_AND_REVALIDATED`; it must not be pushed or opened as a PR yet.

If no exact source is found, the required outcome is `PHASE4_STEP3_EXACT_SOURCE_NOT_RECOVERABLE`, with every checked recovery location listed and no source code created.
