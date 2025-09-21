BEGIN;

CREATE TABLE "public"."ofx_rule" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "bank_account_id" UUID,
    "pattern" TEXT NOT NULL,
    "normalized_label" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ofx_rule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ofx_rule_org_priority_idx" ON "public"."ofx_rule" ("organization_id", "priority");
CREATE INDEX "ofx_rule_org_account_idx" ON "public"."ofx_rule" ("organization_id", "bank_account_id");

ALTER TABLE "public"."ofx_rule"
  ADD CONSTRAINT "ofx_rule_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."ofx_rule"
  ADD CONSTRAINT "ofx_rule_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "public"."bank_transaction" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "bank_statement_id" UUID,
    "fitid" TEXT NOT NULL,
    "value_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "raw_label" TEXT NOT NULL,
    "normalized_label" TEXT,
    "memo" TEXT,
    "matched_entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_transaction_dedup_key" ON "public"."bank_transaction" ("bank_account_id", "fitid", "amount", "value_date");
CREATE INDEX "bank_transaction_org_account_date_idx" ON "public"."bank_transaction" ("organization_id", "bank_account_id", "value_date");

ALTER TABLE "public"."bank_transaction"
  ADD CONSTRAINT "bank_transaction_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."bank_transaction"
  ADD CONSTRAINT "bank_transaction_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."bank_transaction"
  ADD CONSTRAINT "bank_transaction_bank_statement_id_fkey"
    FOREIGN KEY ("bank_statement_id") REFERENCES "public"."bank_statement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."bank_transaction"
  ADD CONSTRAINT "bank_transaction_matched_entry_id_fkey"
    FOREIGN KEY ("matched_entry_id") REFERENCES "public"."entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."ofx_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ofx_rule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ofx_rule_isolation" ON "public"."ofx_rule"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

ALTER TABLE "public"."bank_transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bank_transaction" FORCE ROW LEVEL SECURITY;
CREATE POLICY "bank_transaction_isolation" ON "public"."bank_transaction"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

COMMIT;
