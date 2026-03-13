-- CreateEnum
CREATE TYPE "ModerationFailureType" AS ENUM ('TIMEOUT', 'PROVIDER', 'PARSE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ModerationJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "listing_moderation_runs"
ADD COLUMN "failureType" "ModerationFailureType",
ADD COLUMN "processingMs" INTEGER;

-- CreateTable
CREATE TABLE "listing_moderation_jobs" (
    "id" TEXT NOT NULL,
    "status" "ModerationJobStatus" NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_moderation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_moderation_jobs_listingId_key" ON "listing_moderation_jobs"("listingId");

-- CreateIndex
CREATE INDEX "listing_moderation_jobs_status_nextRunAt_idx" ON "listing_moderation_jobs"("status", "nextRunAt");

-- AddForeignKey
ALTER TABLE "listing_moderation_jobs" ADD CONSTRAINT "listing_moderation_jobs_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
