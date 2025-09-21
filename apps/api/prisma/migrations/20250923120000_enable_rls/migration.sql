BEGIN;

ALTER TABLE "public"."fiscal_year" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fiscal_year" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fiscal_year_isolation" ON "public"."fiscal_year"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

ALTER TABLE "public"."account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."account" FORCE ROW LEVEL SECURITY;
CREATE POLICY "account_isolation" ON "public"."account"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

ALTER TABLE "public"."journal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."journal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "journal_isolation" ON "public"."journal"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

ALTER TABLE "public"."entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "entry_isolation" ON "public"."entry"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

ALTER TABLE "public"."entry_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."entry_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "entry_line_isolation" ON "public"."entry_line"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

ALTER TABLE "public"."attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."attachment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attachment_isolation" ON "public"."attachment"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

COMMIT;
