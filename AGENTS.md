# Association Management & Accounting SaaS Specification

## Vision
This project aims to build a **serious, compliant, and user-friendly SaaS** for managing associations (nonprofits, law 1901 style). It must balance **legal compliance (accounting, audit, FEC exports)** with **practical association management (members, fees, donations, subsidies)**. The solution will be web-based (multi-tenant), secure, and scalable.

---

## Core Technology Stack
- **Backend**: Node.js + TypeScript, Fastify, Prisma (PostgreSQL ORM), Zod (validation).
- **Database**: PostgreSQL.
- **Frontend**: Vue 3 (Composition API), Pinia, Vue Router, TailwindCSS.
- **Testing**: Vitest (unit/integration), Supertest (backend HTTP), Testing Library (frontend), Playwright (E2E).
- **Code quality**: ESLint, Prettier, Husky + lint-staged.
- **CI/CD**: GitHub Actions (tests, build, migrations).

---

## Functional Domains & Features

### 1. Accounting (Legal Core)
- **Double-entry accounting**: every transaction must balance debit and credit lines; validation enforces equality before saving.
- **Association chart of accounts**: pre-configured plan comptable associatif, with flexibility to add custom accounts while ensuring compliance.
- **Fiscal years**: ability to create, open, close, and lock fiscal years; locked years prohibit any modification of entries.
- **Journals**: predefined journals (BANK, CASH, SALES, PURCHASES), with option to add others (e.g., SUBSIDIES, PAYROLL).
- **Immutable entries**: once validated, entries are locked; only reversal entries can correct mistakes.
- **Reports**:
  - Journal reports with sequential numbering.
  - General Ledger with drill-down from account to entry lines.
  - Trial Balance including debit, credit, and balances.
  - Income Statement and Balance Sheet following association standards.
- **Exports**: generate FEC files (French standard format), CSV exports for further analysis, and PDF exports for official reports.

### 2. Treasury & Bank Reconciliation
- **Bank accounts management**: register multiple accounts with IBAN and BIC.
- **OFX import only**: allow importing transactions from OFX files provided by banks.
- **Transaction parsing**: parse OFX into structured transactions with date, label, amount, and reference.
- **Matching engine**: suggest reconciliation between bank transactions and accounting entries based on rules:
  - Exact amount and close date match.
  - Label similarity (fuzzy search for common patterns).
  - Manual override for unmatched items.
- **Audit trail**: every reconciliation is logged; manual matches require user confirmation.

### 3. Members & Fees
- **Member database**: manage personal details, membership type, contact info, GDPR consent.
- **Membership fee templates**: define templates with price, start date, and end date of validity; templates can be reused annually.
- **Fee assignment**: automatically assign fee templates to members based on rules (e.g., annual fee, reduced student fee).
- **Payment tracking**: link payments to accounting entries with status (paid, pending, overdue).
- **Automated reminders**: send email reminders before due dates and overdue notices.
- **Member portal**: allow members to view invoices, download receipts, and check payment history.

### 4. Donations & Fiscal Receipts
- **Donation recording**: donations entered manually or via online payment integrations, linked to accounting entries.
- **Receipt generation**: compliant tax receipts generated as PDFs with sequential numbering and stored in attachments.
- **Donor history**: maintain history of donations per donor/member.
- **Annual exports**: list of donations for fiscal reporting and audit.

### 5. Subsidies & Projects
- **Subsidy registration**: record subsidy details including amount, funder, conditions, and deadlines.
- **Analytical allocation**: link expenditures and revenues to specific projects or subsidies.
- **Budget definition**: set planned budgets for projects and subsidies.
- **Budget vs Actual report**: generate variance reports comparing planned vs realized figures.
- **Justification exports**: export detailed project statements for funders, including attached supporting documents.

### 6. Reporting & Compliance
- **Annual Financial Report**: pre-formatted report with balance sheet, income statement, and notes ready for GA presentation.
- **Export-ready Balance & P&L**: generate PDFs and CSVs suitable for auditors.
- **Project-based reports**: drill down into individual projects, showing income, expenses, and subsidy allocations.
- **FEC export**: compliant with French requirements for audits.
- **Audit trail**: immutable log of all accounting actions, including user, timestamp, and changes.

### 7. Multi-user & Roles
- **Role-based access control**: define roles (ADMIN, TREASURER, SECRETARY, VIEWER) per organization.
- **Permission enforcement**: restrict access to sensitive features (only TREASURER/ADMIN can post entries).
- **Audit logs**: track every user action, including login, data edits, and exports.

### 8. Attachments & Document Management
- **Document uploads**: attach invoices, receipts, or subsidy contracts to entries or projects.
- **Secure storage**: store documents in S3-compatible storage with versioning.
- **Integrity check**: SHA-256 hash stored for each file to guarantee authenticity.
- **Optional watermark**: add a “Copy” watermark to prevent misuse of exported documents.

---

## Bonus Features (“Serious SaaS polish”)
- **Payment integrations**: Stripe, PayPal, HelloAsso API for online payments.
- **Budget forecasting**: define projected expenses and revenues, compare to actuals.
- **Notifications**: automated email notifications for unpaid fees, subsidy deadlines, and year-end tasks.
- **Export bundles**: one ZIP file per fiscal year with all reports, FEC, and attachments.
- **Sequential numbering**: automatic numbering of accounting entries, receipts, and fiscal documents.
- **Analytics dashboards**: interactive charts with filters for year, project, and account.
- **Multi-tenant architecture**: each organization is isolated; admins manage only their organization.
- **GDPR compliance**: support data portability, right to be forgotten, and audit logs.
- **Accessibility compliance**: frontend adheres to WCAG 2.1 standards.

---

## Backend Data Model (Simplified)

### Core Entities
- `organization(id, name, …)`
- `fiscal_year(id, organization_id, label, start, end, locked_at)`
- `account(id, organization_id, code, name, type, is_active)`
- `journal(id, organization_id, code, name, type)`
- `entry(id, organization_id, fiscal_year_id, journal_id, date, ref, memo, locked_at, created_by)`
- `entry_line(id, entry_id, account_id, debit, credit, project_id, member_id)`
- `attachment(id, entry_id, url, filename, mime, sha256)`

### Treasury
- `bank_account(id, organization_id, name, iban, bic)`
- `bank_statement(id, bank_account_id, statement_date, opening_balance, closing_balance)`
- `bank_transaction(id, bank_statement_id, value_date, label, amount, external_ref, matched_entry_id)`

### Members & Donations
- `member(id, organization_id, first_name, last_name, email, rgpd_consent_at)`
- `membership_fee_template(id, organization_id, label, amount, start_date, end_date)`
- `member_payment(id, member_id, template_id, amount, paid_at, payment_method, entry_id)`
- `donation(id, organization_id, donor_name, amount, received_at, receipt_number, entry_id)`

### Projects/Subsidies
- `project(id, organization_id, code, name, funder, budget_amount, start, end)`

### Security & Audit
- `user(id, email, password_hash, …)`
- `user_org_role(user_id, organization_id, role)`
- `audit_log(id, organization_id, user_id, action, entity, entity_id, payload_json, at)`

---

## API Endpoints (Samples)
- `/auth/login` → JWT authentication.
- `/orgs/:orgId/accounts` → manage chart of accounts.
- `/orgs/:orgId/journals` → list journals.
- `/orgs/:orgId/entries` → create accounting entry with lines.
- `/orgs/:orgId/entries/:id/lock` → lock entry.
- `/orgs/:orgId/reports/balance?fy=2025` → generate balance sheet.
- `/orgs/:orgId/reports/fec?fy=2025` → generate FEC file.
- `/orgs/:orgId/members` → CRUD members.
- `/orgs/:orgId/members/:id/payments` → record membership payment.
- `/orgs/:orgId/donations` → record donation + generate receipt.
- `/orgs/:orgId/projects` → manage projects/subsidies.
- `/orgs/:orgId/bank/import-ofx` → upload OFX file and parse transactions.
- `/orgs/:orgId/bank/reconcile` → reconciliation suggestions and confirmations.

---

## Frontend Features (Vue 3)
- **Dashboard**: cash balances, alerts, key KPIs.
- **Accounting UI**:
  - Entry form with debit/credit lines, autocompletion, balance check.
  - Journal and General Ledger views.
  - Reports with export (CSV, PDF).
- **Banking**:
  - Import OFX statement, reconciliation interface with suggestions and manual overrides.
- **Members**:
  - Member list, fee status, payment form.
  - Donation form + receipt generation.
- **Projects/Subsidies**:
  - Project list, budget vs actual, export report.
- **Admin**:
  - Users & roles.
  - Plan comptable editor.
  - Settings (locale, fiscal year).

---

## Tests & Quality
- **Backend**:
  - Unit tests for accounting rules (balanced entries, lock enforcement).
  - Integration tests for reconciliation, FEC export.
  - HTTP tests for API endpoints (Supertest).
- **Frontend**:
  - Unit tests for forms, validation, state management.
  - Component tests with Testing Library.
  - End-to-end scenarios (login, entry creation, reconciliation, report export).
- **Quality Gates**:
  - ESLint + Prettier mandatory.
  - CI/CD pipeline blocks merge on failing tests or lint errors.

---

## Deliverable Quality
This solution will:
- Be **legally compliant** (association accounting rules, FEC export).
- Provide **end-to-end management** (members, fees, donations, subsidies).
- Offer **serious SaaS polish** (multi-tenant, RBAC, backups, GDPR).
- Remain **user-friendly** (modern UI, dashboards, automated reports).

---

# Additional Specifications for Autonomous Implementation

The following sections fill the gaps needed for an autonomous AI agent (or engineering team) to deliver the full SaaS product end‑to‑end.

## 1) Non‑Functional Requirements (NFRs)
- **Availability**: 99.9% monthly uptime target for app + API.
- **Performance**: P50 API < 150 ms, P95 < 600 ms under 200 RPS per region.
- **Scalability**: Horizontal scaling via stateless API pods; PostgreSQL vertical scaling + read replicas (future).
- **Data Residency**: Primary region EU (e.g., `eu-west-1`).
- **RPO/RTO**: RPO ≤ 15 min (point‑in‑time recovery), RTO ≤ 4 h.
- **Accessibility**: WCAG 2.1 AA.
- **Browser Support**: Evergreen Chrome/Firefox/Edge + last 2 Safari versions.

## 2) Multi‑Tenancy & Data Isolation
- **Tenant model**: Each record carries `organization_id`.
- **Enforcement**: PostgreSQL **Row‑Level Security (RLS)** enabled on all tenant tables.
  - Policy: `USING (organization_id = current_setting('app.current_org')::uuid)`.
  - API sets `app.current_org` on connection at request start.
- **Indexes**: Composite `(organization_id, ...)` on frequently filtered columns.
- **Migrations**: All new tables include `organization_id` + RLS policies by default.

## 3) Security & Compliance
- **Transport**: TLS 1.2+ everywhere. HSTS on frontend.
- **Auth**: JWT access tokens (15–60 min), refresh tokens with rotation + revocation.
- **RBAC**: Role checks in Fastify pre‑handlers; route‑level guards.
- **Password storage**: Argon2id.
- **Secrets**: Managed via environment variables + secret manager (e.g., SOPS or cloud KMS).
- **Input validation**: Zod schemas for every endpoint, strict mode.
- **Output encoding**: Prevent XSS; CSP headers; sanitize HTML where applicable.
- **Files**: Antivirus scan on upload (clamd) optional; SHA‑256 checksum stored.
- **GDPR**: Data export (JSON+CSV+PDF), deletion (soft delete + purge job), activity log, DPA template.
- **Audit log retention**: 3 years online, exportable.

## 4) Database Constraints & Integrity
- **Primary keys**: UUID v7.
- **Timestamps**: `created_at`/`updated_at` (UTC) on all tables.
- **Foreign keys**: `ON DELETE RESTRICT` for accounting entities; attachments `ON DELETE CASCADE` from entries.
- **Checks**:
  - `entry_line.debit >= 0`, `entry_line.credit >= 0`.
  - Enforce **sum(debit) = sum(credit)** per `entry` via application + transactional check at commit.
- **Unique sequences**:
  - Per fiscal year & journal, maintain a transactional **piece number** (e.g., `2025-BANQ-000123`).
  - Use a dedicated `sequence_number` table with `(organization_id, fiscal_year_id, journal_id) → next_value` guarded by `SELECT … FOR UPDATE`.

## 5) FEC Export Specification (France)
- **Format**: CSV (semicolon or pipe) with **fixed columns** and **UTF‑8** encoding.
- **Required columns (order)**: `JournalCode,JournalLib,EcritureNum,EcritureDate,CompteNum,CompteLib,CompAuxNum,CompAuxLib,PieceRef,PieceDate,EcritureLib,Debit,Credit,EcritureLet,DateLet,ValidDate,Montantdevise,Idevise`.
- **Dates**: `YYYYMMDD`.
- **Amounts**: dot decimal separator; no thousand separators.
- **Auxiliary accounts**: If using member/customer ledgers, fill `CompAuxNum/CompAuxLib`.
- **Validation**: Pre‑export lints (balanced, locked fiscal year, no orphan lines, all accounts defined).
- **File name**: `FEC_<SIREN>_<YYYY>.csv` or organization code if no SIREN.

## 6) OFX Import & Reconciliation Details
- **Import**: Only **OFX** files; max size 20 MB; support multiple bank accounts.
- **Parsing**: Strict OFX 1.x; handle encoding and sign for debits/credits; deduplicate by `(FITID, amount, date)`.
- **Normalization**: Map bank labels to canonical payees with rules (regex table `ofx_rules`).
- **Matching**:
  - Rule 1: exact amount + ±3 days date window + unmatched.
  - Rule 2: fuzzy label (trigram similarity ≥ 0.7) + amount tolerance ≤ €0.01.
  - Manual match & create new entry flow.
- **Lettrage**: Store `matched_entry_id` and mark entry’s bank line as reconciled; log in `audit_log`.

## 7) Emails, PDFs & Documents
- **Email provider**: SMTP relay (configurable). Templates via MJML → HTML.
- **Receipts**: PDF generation (e.g., `pdf-lib`/`puppeteer`); sequential numbering per fiscal year.
- **Watermark**: Optional “Copy” overlay; include checksum and document id in footer.
- **Localization**: i18n for templates (EN/FR initially).

## 8) Background Jobs & Scheduling
- Job runner (e.g., BullMQ or node‑cron) for:
  - Reminder emails (fees due/overdue).
  - Subsidy deadline notifications.
  - Nightly backups & export bundles.
  - GDPR purges for deleted accounts and expired attachments.

## 9) API Conventions
- **Versioning**: Prefix `/api/v1`.
- **Pagination**: `?page=1&limit=50` (max 200); responses include `total,count,page,limit`.
- **Filtering**: Whitelisted query params; date ranges ISO8601.
- **Idempotency**: Header `Idempotency-Key` for mutation endpoints (create donation/payment/entry).
- **Errors**: Problem+JSON style (`type,title,status,detail,instance`).
- **Rate limiting**: 100 req/min/IP (burst 200); org‑scoped limits for abusive tenants.

## 10) Frontend UX Guidelines
- **Form safety**: optimistic UI with server validation; autosave drafts for long forms (entries with many lines).
- **Keyboard flows**: power‑user data entry (tab/enter to add line, autocomplete accounts by code/name).
- **Accessibility**: semantic HTML, focus order, ARIA labels, color‑contrast checks.
- **Export UX**: background export with notification + download center.

## 11) Observability & Ops
- **Logging**: JSON logs (request id, user id, org id, route, latency). Redact PII.
- **Metrics**: Prometheus endpoints; key metrics (RPS, latencies, DB timings, job durations).
- **Tracing**: OpenTelemetry traces across API ↔ DB ↔ job runner.
- **Error tracking**: Sentry (frontend + backend).

## 12) Backups & Disaster Recovery
- **DB**: PITR enabled (WAL archiving) + nightly full backups retained 30 days.
- **Files**: S3 bucket with versioning + lifecycle policy (90 days current, 365 days glacier).
- **Restore drills**: quarterly test of DB and file restore into staging.

## 13) Environments & Deployment
- **Envs**: `dev`, `staging`, `prod`.
- **Packaging**: Docker images (multi‑stage) for API and frontend.
- **Infra**: Docker Compose for dev; Kubernetes (optional) for prod with HPA.
- **CD**: Tag → build → scan → deploy; run Prisma migrations on startup with lock.
- **Config**: `.env` with schema checked by Zod at boot.

## 14) Internationalization (i18n)
- **Languages**: EN/FR; all UI strings via i18n catalog; number/date/currency localized.
- **Accounting locale**: currency configurable per organization; default EUR.

## 15) Admin & Supervision
- **Super‑admin** panel (separate) to:
  - Lookup organization, lock/unlock tenants, rotate secrets.
  - View usage, errors, email bounces.
- **Org onboarding**: invite flow, default chart of accounts & journals, initial fiscal year wizard.

## 16) Definition of Done (DoD) per Feature
- Feature has: schema + migrations, API with Zod validation, RBAC checks, unit/integration tests (≥ 80% lines), UI components with tests, i18n strings, accessibility checks, docs updated, telemetry added.

## 17) Seed & Fixtures
- **Seed**: demo tenant with sample accounts (512, 53, 606, 706, 740, 756, 627, …), one bank account, one fiscal year, a few members, donations, and a small OFX file for reconciliation demo.

## 18) Data Retention & Purge
- Members: retain while active + 3 years after termination (configurable); donations & receipts retained 6 years.
- Ability to redact personal notes fields on request.

## 19) Legal Texts
- Provide templates for Terms of Service, Privacy Policy, Data Processing Agreement.

## 20) Commit Validation & Quality Gates
- Every commit must be validated through a pre-push or CI hook running:
  - `npm run lint` (ESLint + Prettier checks)
  - `npm test` (unit, integration, frontend, backend)
  - `npm run build` (ensure successful compilation for frontend and backend)
- Commits that fail any of these steps are blocked from merging.

---

# Acceptance Criteria (Samples)
- **Balanced entry**: API rejects any entry where Σdebit ≠ Σcredit (422) and returns line‑level errors.
- **Lock enforcement**: Attempt to modify an entry in a locked fiscal year → 403 with error code `FISCAL_YEAR_LOCKED`.
- **FEC export**: Generates a compliant file for a locked fiscal year; validator passes; checksum stored in audit log.
- **OFX import**: File processed; duplicate FITIDs skipped; at least 80% auto‑matched on seeded data.
- **Membership template**: Applying a template auto‑creates pending invoices and reminders according to validity dates.
- **Multi‑tenant isolation**: A user from Org A cannot access any data from Org B under RLS tests and API tests.

