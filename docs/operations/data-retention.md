# Data Retention and GDPR Operations

This document describes how the platform enforces GDPR-aligned retention, export, and deletion workflows introduced in the current iteration.

## Member Data Exports

- **Endpoints** (require ADMIN/SECRETARY/TREASURER roles):
  - `GET /api/v1/orgs/:orgId/members/:memberId/export.json` – full JSON payload with member profile, fee assignments, payments, and accounting entries.
  - `GET /api/v1/orgs/:orgId/members/:memberId/export.csv` – semicolon-separated export (UTF-8) for spreadsheet use.
  - `GET /api/v1/orgs/:orgId/members/:memberId/export.pdf` – human-readable PDF summarising the data subject’s footprint.
- Responses are delivered as downloadable attachments with ISO date-stamped filenames.
- JSON exports include a `generatedAt` timestamp to trace when the data was packaged.
- These endpoints power the access/portability obligations defined in the DPA template.

## Personal Notes Redaction

- Endpoint: `POST /api/v1/orgs/:orgId/members/:memberId/personal-notes/redact`.
- Immediately nulls the `personal_notes` field and records `personal_notes_redacted_at` so that future exports reflect the anonymisation request.
- Redaction is also triggered automatically when a member is soft-deleted.

## Soft Delete & Hard Purge

- Members now carry `deleted_at`, `personal_notes`, and `personal_notes_redacted_at` fields.
- Donations also carry `deleted_at` metadata.
- Deleting a member via the API marks the record as soft-deleted, clears personal notes, and keeps identifiers for the statutory 3-year retention period.
- Standard queries (`listMembers`, `getMember`, assignment auto-assign) ignore soft-deleted rows.

## Scheduled GDPR Purge Job

- A dedicated BullMQ job (`gdpr-data-purge`) runs daily at 03:00 (tenant timezone configurable).
- Processor implementation:
  - Removes `member_payment` rows tied to members deleted more than **3 years** ago.
  - Removes `member_fee_assignment` rows for the same cohort (safety catch; deletes should have happened earlier).
  - Permanently deletes `member` rows once the 3-year retention period expires (database foreign keys cascade `member_id` references to `NULL`).
  - Deletes `donation` rows soft-deleted more than **6 years** ago (covers fiscal receipt obligations).
- Execution metrics (counts per table) are logged; hooks allow telemetry via `onJobExecuted` in tests.

## Operational Checklist

1. **Controller Request Intake** – Support registers the request (export, note redaction, or erasure) and validates authorisation.
2. **Export Delivery** – Use the relevant export endpoint; provide JSON (machine-readable) and PDF (human-readable). Optionally include CSV if the member asks for spreadsheet data.
3. **Personal Notes** – Run the redaction endpoint immediately when a member requests removal of subjective comments. Confirm via a follow-up export.
4. **Member Deletion** – When legally permitted, call the standard DELETE endpoint. Record the deletion timestamp to track retention windows.
5. **Automatic Purge** – No manual action required. Monitor job logs to ensure nightly purges run successfully. Investigate failures to avoid over-retention.
6. **DPA Maintenance** – Update and redistribute the DPA template when sub-processors change or controls are enhanced. Reference this policy as the authoritative retention schedule.

## Change Log

- **v2025-10**: Introduced structured member exports (JSON/CSV/PDF), soft delete with retention timers, background purge job, and personal notes anonymisation workflow.
