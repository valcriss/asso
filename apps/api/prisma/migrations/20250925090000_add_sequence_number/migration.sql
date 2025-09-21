BEGIN;

CREATE TABLE "public"."sequence_number" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  "organization_id" uuid NOT NULL,
  "fiscal_year_id" uuid NOT NULL,
  "journal_id" uuid NOT NULL,
  "next_value" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."sequence_number"
  ADD CONSTRAINT "sequence_number_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT;

ALTER TABLE "public"."sequence_number"
  ADD CONSTRAINT "sequence_number_fiscal_year_fkey"
  FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE RESTRICT;

ALTER TABLE "public"."sequence_number"
  ADD CONSTRAINT "sequence_number_journal_fkey"
  FOREIGN KEY ("journal_id") REFERENCES "public"."journal"("id") ON DELETE RESTRICT;

CREATE UNIQUE INDEX "sequence_number_org_year_journal_key"
  ON "public"."sequence_number" ("organization_id", "fiscal_year_id", "journal_id");

ALTER TABLE "public"."sequence_number" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sequence_number" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sequence_number_isolation" ON "public"."sequence_number"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

COMMIT;
