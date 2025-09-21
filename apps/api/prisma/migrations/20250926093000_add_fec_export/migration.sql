BEGIN;

CREATE TABLE "public"."fec_export" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "checksum" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fec_export_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fec_export_org_year_idx" ON "public"."fec_export"("organization_id", "fiscal_year_id");

ALTER TABLE "public"."fec_export"
    ADD CONSTRAINT "fec_export_organization_id_fkey"
    FOREIGN KEY ("organization_id")
    REFERENCES "public"."organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."fec_export"
    ADD CONSTRAINT "fec_export_fiscal_year_id_fkey"
    FOREIGN KEY ("fiscal_year_id")
    REFERENCES "public"."fiscal_year"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."fec_export" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fec_export" FORCE ROW LEVEL SECURITY;

CREATE POLICY "fec_export_isolation" ON "public"."fec_export"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

COMMIT;
