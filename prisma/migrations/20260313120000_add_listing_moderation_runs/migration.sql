DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModerationRiskLevel') THEN
    CREATE TYPE "ModerationRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'ERROR');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModerationRecommendedAction') THEN
    CREATE TYPE "ModerationRecommendedAction" AS ENUM ('APPROVE', 'MANUAL_REVIEW');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModerationAppliedAction') THEN
    CREATE TYPE "ModerationAppliedAction" AS ENUM ('APPROVED', 'PENDING');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModerationRunStatus') THEN
    CREATE TYPE "ModerationRunStatus" AS ENUM ('SUCCESS', 'ERROR');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "listing_moderation_runs" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "riskLevel" "ModerationRiskLevel" NOT NULL,
  "confidence" DOUBLE PRECISION,
  "violationsJson" JSONB NOT NULL,
  "summary" TEXT,
  "recommendedAction" "ModerationRecommendedAction",
  "appliedAction" "ModerationAppliedAction",
  "status" "ModerationRunStatus" NOT NULL DEFAULT 'SUCCESS',
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_moderation_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "listing_moderation_runs_listingId_createdAt_idx"
  ON "listing_moderation_runs"("listingId", "createdAt" DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listing_moderation_runs_listingId_fkey') THEN
    ALTER TABLE "listing_moderation_runs"
      ADD CONSTRAINT "listing_moderation_runs_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
