# Multi-tenant database guardrails

Every relational table that carries tenant data **must** respect the row-level security (RLS) contract introduced in the migrations. Follow these rules whenever you add a new table that contains an `organization_id` foreign key:

1. **Enable RLS and create the default policy** in the migration:
   ```sql
   ALTER TABLE "public"."your_table" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "public"."your_table" FORCE ROW LEVEL SECURITY;
   CREATE POLICY "your_table_isolation" ON "public"."your_table"
     FOR ALL
     USING ("organization_id" = current_setting('app.current_org')::uuid)
     WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);
   ```
   The policy name should follow the `<table>_isolation` convention to keep maintenance predictable.

2. **Index the tenant discriminator**. Add at least one index that starts with `organization_id` (either a standalone index or the first column of a composite unique/index). This keeps lookups efficient once RLS forces every query to filter on the tenant id.

3. **Prisma schema**: mirror the SQL contract by exposing the foreign key through a `organizationId` field and adding the matching `@@index`/`@@unique` declarations so the client code naturally scopes queries by organization.

When seeding, running tests, or performing maintenance tasks directly through Prisma, wrap the operations in a transaction and execute `SET LOCAL app.current_org = <tenant-id>::uuid` before touching tenant tables. The Fastify plugin takes care of this for HTTP requests via the Prisma transaction context.
