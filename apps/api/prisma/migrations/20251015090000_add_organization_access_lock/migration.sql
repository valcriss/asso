ALTER TABLE "organization"
  ADD COLUMN IF NOT EXISTS "access_locked_at" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "access_locked_by" UUID,
  ADD COLUMN IF NOT EXISTS "access_locked_reason" TEXT;

CREATE INDEX IF NOT EXISTS "organization_access_locked_at_idx"
  ON "organization" ("access_locked_at")
  WHERE "access_locked_at" IS NOT NULL;
