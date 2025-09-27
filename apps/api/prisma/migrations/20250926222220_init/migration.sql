-- DropForeignKey
ALTER TABLE "public"."sequence_number" DROP CONSTRAINT "sequence_number_fiscal_year_fkey";

-- DropForeignKey
ALTER TABLE "public"."sequence_number" DROP CONSTRAINT "sequence_number_journal_fkey";

-- DropForeignKey
ALTER TABLE "public"."sequence_number" DROP CONSTRAINT "sequence_number_organization_fkey";

-- AlterTable
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns 
		WHERE table_schema='public' AND table_name='organization' AND column_name='access_locked_at'
	) THEN
		EXECUTE 'ALTER TABLE "public"."organization" ALTER COLUMN "access_locked_at" SET DATA TYPE TIMESTAMP(3)';
	END IF;
	IF EXISTS (
		SELECT 1 FROM information_schema.columns 
		WHERE table_schema='public' AND table_name='organization' AND column_name='api_secret_rotated_at'
	) THEN
		EXECUTE 'ALTER TABLE "public"."organization" ALTER COLUMN "api_secret_rotated_at" SET DATA TYPE TIMESTAMP(3)';
	END IF;
END $$;

-- AlterTable
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.tables 
		WHERE table_schema='public' AND table_name='project'
	) THEN
		EXECUTE 'ALTER TABLE "public"."project" ALTER COLUMN "start_date" SET DATA TYPE TIMESTAMP(3)';
		EXECUTE 'ALTER TABLE "public"."project" ALTER COLUMN "end_date" SET DATA TYPE TIMESTAMP(3)';
		EXECUTE 'ALTER TABLE "public"."project" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3)';
		-- updated_at may not have a default; DROP DEFAULT guarded by IF clause not available directly, so use catch-all block
		BEGIN
			EXECUTE 'ALTER TABLE "public"."project" ALTER COLUMN "updated_at" DROP DEFAULT';
		EXCEPTION WHEN others THEN
			-- ignore if default absent
		END;
		EXECUTE 'ALTER TABLE "public"."project" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3)';
	END IF;
END $$;

-- AlterTable
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.tables 
		WHERE table_schema='public' AND table_name='project_period'
	) THEN
		EXECUTE 'ALTER TABLE "public"."project_period" ALTER COLUMN "start_date" SET DATA TYPE TIMESTAMP(3)';
		EXECUTE 'ALTER TABLE "public"."project_period" ALTER COLUMN "end_date" SET DATA TYPE TIMESTAMP(3)';
		EXECUTE 'ALTER TABLE "public"."project_period" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3)';
		BEGIN
			EXECUTE 'ALTER TABLE "public"."project_period" ALTER COLUMN "updated_at" DROP DEFAULT';
		EXCEPTION WHEN others THEN
			-- ignore
		END;
		EXECUTE 'ALTER TABLE "public"."project_period" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3)';
	END IF;
END $$;

-- AlterTable
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.tables 
		WHERE table_schema='public' AND table_name='sequence_number'
	) THEN
		EXECUTE 'ALTER TABLE "public"."sequence_number" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3)';
		BEGIN
			EXECUTE 'ALTER TABLE "public"."sequence_number" ALTER COLUMN "updated_at" DROP DEFAULT';
		EXCEPTION WHEN others THEN
			-- ignore if no default
		END;
		EXECUTE 'ALTER TABLE "public"."sequence_number" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3)';
	END IF;
END $$;

-- AddForeignKey
ALTER TABLE "public"."sequence_number" ADD CONSTRAINT "sequence_number_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sequence_number" ADD CONSTRAINT "sequence_number_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sequence_number" ADD CONSTRAINT "sequence_number_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "public"."journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
