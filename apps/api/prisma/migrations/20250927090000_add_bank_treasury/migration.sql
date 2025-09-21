BEGIN;

CREATE TABLE "public"."bank_account" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "bic" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_account_org_account_key" ON "public"."bank_account" ("organization_id", "account_id");
CREATE UNIQUE INDEX "bank_account_account_id_key" ON "public"."bank_account" ("account_id");
CREATE UNIQUE INDEX "bank_account_org_iban_key" ON "public"."bank_account" ("organization_id", "iban");
CREATE INDEX "bank_account_org_idx" ON "public"."bank_account" ("organization_id");

ALTER TABLE "public"."bank_account"
  ADD CONSTRAINT "bank_account_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."bank_account"
  ADD CONSTRAINT "bank_account_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "public"."bank_statement" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "statement_date" TIMESTAMP(3) NOT NULL,
    "opening_balance" DECIMAL(16,2) NOT NULL,
    "closing_balance" DECIMAL(16,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_statement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_statement_account_date_key" ON "public"."bank_statement" ("bank_account_id", "statement_date");
CREATE INDEX "bank_statement_org_account_idx" ON "public"."bank_statement" ("organization_id", "bank_account_id");

ALTER TABLE "public"."bank_statement"
  ADD CONSTRAINT "bank_statement_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."bank_statement"
  ADD CONSTRAINT "bank_statement_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."entry"
  ADD COLUMN "bank_statement_id" UUID;

CREATE INDEX "entry_org_bank_statement_idx" ON "public"."entry" ("organization_id", "bank_statement_id");

ALTER TABLE "public"."entry"
  ADD CONSTRAINT "entry_bank_statement_id_fkey"
    FOREIGN KEY ("bank_statement_id") REFERENCES "public"."bank_statement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."bank_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bank_account" FORCE ROW LEVEL SECURITY;
CREATE POLICY "bank_account_isolation" ON "public"."bank_account"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

ALTER TABLE "public"."bank_statement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bank_statement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "bank_statement_isolation" ON "public"."bank_statement"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

COMMIT;
