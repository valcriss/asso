ALTER TABLE "member"
  ADD COLUMN "personal_notes" TEXT,
  ADD COLUMN "personal_notes_redacted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_at" TIMESTAMP(3);

ALTER TABLE "donation"
  ADD COLUMN "deleted_at" TIMESTAMP(3);
