CREATE TABLE "public"."audit_log" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "payload_json" JSONB,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_org_at_idx" ON "public"."audit_log"("organization_id", "at");
CREATE INDEX "audit_log_org_entity_idx" ON "public"."audit_log"("organization_id", "entity", "entity_id");

ALTER TABLE "public"."audit_log" ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_isolation" ON "public"."audit_log"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

