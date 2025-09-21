-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Enable crypto functions required for UUID v7 generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper to generate UUID v7 identifiers using current timestamp and random bits
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid AS $$
DECLARE
    unix_ts_ms BIGINT;
    random_bytes BYTEA;
    uuid_bytes BYTEA;
BEGIN
    unix_ts_ms := floor(extract(epoch FROM clock_timestamp()) * 1000);
    random_bytes := gen_random_bytes(10);
    uuid_bytes := decode(lpad(to_hex(unix_ts_ms), 12, '0'), 'hex') || random_bytes;
    uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
    uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
    RETURN encode(uuid_bytes, 'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- CreateTable
CREATE TABLE "public"."organization" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fiscal_year" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."account" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."journal" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."entry" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "ref" TEXT,
    "memo" TEXT,
    "locked_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."entry_line" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "project_id" TEXT,
    "member_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entry_line_pkey" PRIMARY KEY ("id")
);

-- Enforce non-negative values on debit/credit columns
ALTER TABLE "public"."entry_line"
    ADD CONSTRAINT "entry_line_debit_non_negative" CHECK ("debit" >= 0);

ALTER TABLE "public"."entry_line"
    ADD CONSTRAINT "entry_line_credit_non_negative" CHECK ("credit" >= 0);

-- CreateTable
CREATE TABLE "public"."attachment" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "organization_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_year_org_start_idx" ON "public"."fiscal_year"("organization_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_year_org_label_key" ON "public"."fiscal_year"("organization_id", "label");

-- CreateIndex
CREATE INDEX "account_org_type_idx" ON "public"."account"("organization_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "account_org_code_key" ON "public"."account"("organization_id", "code");

-- CreateIndex
CREATE INDEX "journal_org_type_idx" ON "public"."journal"("organization_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "journal_org_code_key" ON "public"."journal"("organization_id", "code");

-- CreateIndex
CREATE INDEX "entry_org_date_idx" ON "public"."entry"("organization_id", "date");

-- CreateIndex
CREATE INDEX "entry_org_fiscal_year_idx" ON "public"."entry"("organization_id", "fiscal_year_id");

-- CreateIndex
CREATE INDEX "entry_org_journal_date_idx" ON "public"."entry"("organization_id", "journal_id", "date");

-- CreateIndex
CREATE INDEX "entry_line_org_account_idx" ON "public"."entry_line"("organization_id", "account_id");

-- CreateIndex
CREATE INDEX "entry_line_entry_idx" ON "public"."entry_line"("entry_id");

-- CreateIndex
CREATE INDEX "attachment_org_entry_idx" ON "public"."attachment"("organization_id", "entry_id");

-- AddForeignKey
ALTER TABLE "public"."fiscal_year" ADD CONSTRAINT "fiscal_year_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account" ADD CONSTRAINT "account_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal" ADD CONSTRAINT "journal_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."entry" ADD CONSTRAINT "entry_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."entry" ADD CONSTRAINT "entry_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."entry" ADD CONSTRAINT "entry_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "public"."journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."entry_line" ADD CONSTRAINT "entry_line_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."entry_line" ADD CONSTRAINT "entry_line_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."entry_line" ADD CONSTRAINT "entry_line_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attachment" ADD CONSTRAINT "attachment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attachment" ADD CONSTRAINT "attachment_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

