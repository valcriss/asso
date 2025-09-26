ALTER TABLE "organization"
  ADD COLUMN IF NOT EXISTS "api_secret" TEXT,
  ADD COLUMN IF NOT EXISTS "api_secret_rotated_at" TIMESTAMP WITH TIME ZONE;
