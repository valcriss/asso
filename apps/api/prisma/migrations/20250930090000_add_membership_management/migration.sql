BEGIN;

CREATE TABLE "public"."member" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "membership_type" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3),
    "left_at" TIMESTAMP(3),
    "rgpd_consent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."membership_fee_template" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "membership_type" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_fee_template_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "MemberFeeAssignmentStatus" AS ENUM ('PENDING', 'INVOICED', 'PAID', 'CANCELLED');

CREATE TABLE "public"."member_fee_assignment" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "MemberFeeAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auto_assigned" BOOLEAN NOT NULL DEFAULT FALSE,
    "entry_id" UUID,
    "draft_invoice_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_fee_assignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."entry_line"
    ALTER COLUMN "member_id" TYPE UUID USING CASE
      WHEN "member_id" IS NULL OR btrim("member_id") = '' THEN NULL
      ELSE "member_id"::uuid
    END;

CREATE UNIQUE INDEX "member_org_email_key" ON "public"."member"("organization_id", "email");
CREATE INDEX "member_org_type_idx" ON "public"."member"("organization_id", "membership_type");
CREATE INDEX "member_org_joined_idx" ON "public"."member"("organization_id", "joined_at");

CREATE INDEX "membership_fee_template_org_active_idx" ON "public"."membership_fee_template"("organization_id", "is_active");
CREATE INDEX "membership_fee_template_org_type_idx" ON "public"."membership_fee_template"("organization_id", "membership_type");
CREATE INDEX "membership_fee_template_org_valid_from_idx" ON "public"."membership_fee_template"("organization_id", "valid_from");

CREATE UNIQUE INDEX "member_fee_assignment_unique_period" ON "public"."member_fee_assignment"("organization_id", "member_id", "template_id", "period_start");
CREATE INDEX "member_fee_assignment_org_member_idx" ON "public"."member_fee_assignment"("organization_id", "member_id");
CREATE INDEX "member_fee_assignment_org_template_idx" ON "public"."member_fee_assignment"("organization_id", "template_id");
CREATE INDEX "member_fee_assignment_org_status_idx" ON "public"."member_fee_assignment"("organization_id", "status");

ALTER TABLE "public"."member"
    ADD CONSTRAINT "member_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."membership_fee_template"
    ADD CONSTRAINT "membership_fee_template_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."member_fee_assignment"
    ADD CONSTRAINT "member_fee_assignment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."member_fee_assignment"
    ADD CONSTRAINT "member_fee_assignment_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."member_fee_assignment"
    ADD CONSTRAINT "member_fee_assignment_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."membership_fee_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."member_fee_assignment"
    ADD CONSTRAINT "member_fee_assignment_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."entry_line"
    ADD CONSTRAINT "entry_line_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."member" FORCE ROW LEVEL SECURITY;
CREATE POLICY "member_isolation" ON "public"."member"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

ALTER TABLE "public"."membership_fee_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."membership_fee_template" FORCE ROW LEVEL SECURITY;
CREATE POLICY "membership_fee_template_isolation" ON "public"."membership_fee_template"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

ALTER TABLE "public"."member_fee_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."member_fee_assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "member_fee_assignment_isolation" ON "public"."member_fee_assignment"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

COMMIT;
