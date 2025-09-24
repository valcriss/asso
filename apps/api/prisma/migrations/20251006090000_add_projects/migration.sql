-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('PROJECT', 'SUBSIDY');

-- CreateTable
CREATE TABLE "public"."project" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ProjectType" NOT NULL DEFAULT 'PROJECT',
    "funder" TEXT,
    "planned_amount" NUMERIC(16, 2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "start_date" TIMESTAMPTZ,
    "end_date" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_period" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "planned_amount" NUMERIC(16, 2) NOT NULL,
    "start_date" TIMESTAMPTZ,
    "end_date" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "project_period_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "public"."entry_line"
    ALTER COLUMN "project_id" TYPE UUID USING NULLIF("project_id", '')::UUID;

-- AddForeignKey
ALTER TABLE "public"."project"
    ADD CONSTRAINT "project_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."project_period"
    ADD CONSTRAINT "project_period_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "project_period_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."entry_line"
    ADD CONSTRAINT "entry_line_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "project_org_code_key" ON "public"."project" ("organization_id", "code");
CREATE INDEX "project_org_type_idx" ON "public"."project" ("organization_id", "type");
CREATE UNIQUE INDEX "project_period_unique_label" ON "public"."project_period" ("project_id", "label");
CREATE INDEX "project_period_org_project_idx" ON "public"."project_period" ("organization_id", "project_id");
CREATE INDEX "project_period_org_start_idx" ON "public"."project_period" ("organization_id", "start_date");

-- Row Level Security
ALTER TABLE "public"."project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project" FORCE ROW LEVEL SECURITY;
CREATE POLICY "project_isolation" ON "public"."project"
    FOR ALL
    USING ("organization_id" = current_setting('app.current_org')::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

ALTER TABLE "public"."project_period" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_period" FORCE ROW LEVEL SECURITY;
CREATE POLICY "project_period_isolation" ON "public"."project_period"
    FOR ALL
    USING ("organization_id" = current_setting('app.current_org')::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);
