ALTER TABLE "entry_line"
  ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

-- Ensure future inserts require explicit position values
ALTER TABLE "entry_line"
  ALTER COLUMN "position" DROP DEFAULT;
