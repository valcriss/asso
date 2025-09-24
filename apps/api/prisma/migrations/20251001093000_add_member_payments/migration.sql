BEGIN;

CREATE TYPE "MemberPaymentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE');

CREATE TABLE "public"."member_payment" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "status" "MemberPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "due_date" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "entry_id" UUID,
    "supporting_document_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "member_payment_assignment_id_key" UNIQUE ("assignment_id")
);

CREATE INDEX "member_payment_org_status_idx" ON "public"."member_payment"("organization_id", "status");
CREATE INDEX "member_payment_org_due_date_idx" ON "public"."member_payment"("organization_id", "due_date");

ALTER TABLE "public"."member_payment"
    ADD CONSTRAINT "member_payment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."member_payment"
    ADD CONSTRAINT "member_payment_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."member_fee_assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."member_payment"
    ADD CONSTRAINT "member_payment_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."member_payment"
    ADD CONSTRAINT "member_payment_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."member_payment"
    ADD CONSTRAINT "member_payment_supporting_document_id_fkey" FOREIGN KEY ("supporting_document_id") REFERENCES "public"."attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."member_payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."member_payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "member_payment_isolation" ON "public"."member_payment"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_org')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org')::uuid);

COMMIT;
