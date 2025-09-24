-- AlterTable
ALTER TABLE "public"."attachment"
    ALTER COLUMN "entry_id" DROP NOT NULL;

ALTER TABLE "public"."attachment"
    ADD COLUMN "project_id" UUID,
    ADD COLUMN "storage_key" TEXT,
    ADD COLUMN "version_id" TEXT,
    ADD COLUMN "byte_size" INTEGER;

UPDATE "public"."attachment"
SET "storage_key" = 'legacy/' || "id",
    "byte_size" = COALESCE("byte_size", 0);

ALTER TABLE "public"."attachment"
    ALTER COLUMN "storage_key" SET NOT NULL,
    ALTER COLUMN "byte_size" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."attachment"
    ADD CONSTRAINT "attachment_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "public"."project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "attachment_org_project_idx" ON "public"."attachment" ("organization_id", "project_id");
