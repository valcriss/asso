BEGIN;

CREATE TABLE "public"."donation_receipt_sequence" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donation_receipt_sequence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "donation_receipt_sequence_org_year_key" UNIQUE ("organization_id", "fiscal_year_id")
);

CREATE INDEX "donation_receipt_sequence_org_idx" ON "public"."donation_receipt_sequence"("organization_id");

ALTER TABLE "public"."donation_receipt_sequence"
    ADD CONSTRAINT "donation_receipt_sequence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."donation_receipt_sequence"
    ADD CONSTRAINT "donation_receipt_sequence_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."donation_receipt_sequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."donation_receipt_sequence" FORCE ROW LEVEL SECURITY;
CREATE POLICY "donation_receipt_sequence_isolation" ON "public"."donation_receipt_sequence"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

CREATE TABLE "public"."donation" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "donor_name" TEXT NOT NULL,
    "donor_email" TEXT,
    "donor_address" TEXT,
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "receipt_number" TEXT NOT NULL,
    "receipt_hash" TEXT NOT NULL,
    "receipt_url" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "donation_entry_id_key" UNIQUE ("entry_id"),
    CONSTRAINT "donation_receipt_unique" UNIQUE ("organization_id", "fiscal_year_id", "receipt_number")
);

CREATE INDEX "donation_org_fiscal_year_idx" ON "public"."donation"("organization_id", "fiscal_year_id");
CREATE INDEX "donation_org_received_idx" ON "public"."donation"("organization_id", "received_at");

ALTER TABLE "public"."donation"
    ADD CONSTRAINT "donation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."donation"
    ADD CONSTRAINT "donation_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."donation"
    ADD CONSTRAINT "donation_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."donation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."donation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "donation_isolation" ON "public"."donation"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

COMMIT;
