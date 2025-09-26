ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "is_super_admin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "user"
  SET "is_super_admin" = false
  WHERE "is_super_admin" IS NULL;
