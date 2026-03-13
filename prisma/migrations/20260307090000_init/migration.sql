DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Department') THEN
    CREATE TYPE "Department" AS ENUM (
      'CNTT',
      'KINHTOE',
      'MARKETING',
      'NGOAINGU',
      'LUAT',
      'QUANLY',
      'KYTHUAT'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Condition') THEN
    CREATE TYPE "Condition" AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ListingStatus') THEN
    CREATE TYPE "ListingStatus" AS ENUM ('SELLING', 'RESERVED', 'SOLD');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalStatus') THEN
    CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OtpType') THEN
    CREATE TYPE "OtpType" AS ENUM ('REGISTER', 'RESET_PASSWORD');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageType') THEN
    CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportStatus') THEN
    CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "department" "Department",
  "sellerRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalReviews" INTEGER NOT NULL DEFAULT 0,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "lastSeen" TIMESTAMP(3),
  "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "otp_verifications" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" "OtpType" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "icon" TEXT,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "listings" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "originalPrice" INTEGER,
  "condition" "Condition" NOT NULL,
  "status" "ListingStatus" NOT NULL DEFAULT 'SELLING',
  "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "department" "Department",
  "slug" TEXT NOT NULL,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "sellerId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "listing_images" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "publicId" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "listingId" TEXT NOT NULL,
  CONSTRAINT "listing_images_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" TEXT NOT NULL,
  "lastMessageAt" TIMESTAMP(3),
  "listingId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "conversation_participants" (
  "id" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3),
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" TEXT NOT NULL,
  "content" TEXT,
  "imageUrl" TEXT,
  "type" "MessageType" NOT NULL DEFAULT 'TEXT',
  "conversationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "favorites" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "reports" (
  "id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
  "listingId" TEXT NOT NULL,
  "reportedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "reviews" (
  "id" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "listingId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_studentId_key" ON "users"("studentId");
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");
CREATE INDEX IF NOT EXISTS "users_studentId_idx" ON "users"("studentId");
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users"("role");

CREATE INDEX IF NOT EXISTS "otp_verifications_email_type_idx" ON "otp_verifications"("email", "type");

CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_key" ON "categories"("slug");
CREATE INDEX IF NOT EXISTS "categories_name_idx" ON "categories"("name");

CREATE UNIQUE INDEX IF NOT EXISTS "listings_slug_key" ON "listings"("slug");
CREATE INDEX IF NOT EXISTS "listings_sellerId_idx" ON "listings"("sellerId");
CREATE INDEX IF NOT EXISTS "listings_status_approvalStatus_categoryId_idx" ON "listings"("status", "approvalStatus", "categoryId");
CREATE INDEX IF NOT EXISTS "listings_department_idx" ON "listings"("department");
CREATE INDEX IF NOT EXISTS "listings_createdAt_idx" ON "listings"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "listings_approvalStatus_createdAt_idx" ON "listings"("approvalStatus", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "listing_images_listingId_idx" ON "listing_images"("listingId");

CREATE INDEX IF NOT EXISTS "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_participants_conversationId_userId_key" ON "conversation_participants"("conversationId", "userId");
CREATE INDEX IF NOT EXISTS "conversation_participants_userId_idx" ON "conversation_participants"("userId");

CREATE INDEX IF NOT EXISTS "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "favorites_userId_listingId_key" ON "favorites"("userId", "listingId");
CREATE INDEX IF NOT EXISTS "favorites_listingId_idx" ON "favorites"("listingId");

CREATE INDEX IF NOT EXISTS "reports_status_createdAt_idx" ON "reports"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "reports_listingId_idx" ON "reports"("listingId");

CREATE UNIQUE INDEX IF NOT EXISTS "reviews_listingId_reviewerId_key" ON "reviews"("listingId", "reviewerId");
CREATE INDEX IF NOT EXISTS "reviews_sellerId_idx" ON "reviews"("sellerId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_sellerId_fkey') THEN
    ALTER TABLE "listings"
      ADD CONSTRAINT "listings_sellerId_fkey"
      FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_categoryId_fkey') THEN
    ALTER TABLE "listings"
      ADD CONSTRAINT "listings_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listing_images_listingId_fkey') THEN
    ALTER TABLE "listing_images"
      ADD CONSTRAINT "listing_images_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_listingId_fkey') THEN
    ALTER TABLE "conversations"
      ADD CONSTRAINT "conversations_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_participants_conversationId_fkey') THEN
    ALTER TABLE "conversation_participants"
      ADD CONSTRAINT "conversation_participants_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_participants_userId_fkey') THEN
    ALTER TABLE "conversation_participants"
      ADD CONSTRAINT "conversation_participants_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_conversationId_fkey') THEN
    ALTER TABLE "messages"
      ADD CONSTRAINT "messages_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_senderId_fkey') THEN
    ALTER TABLE "messages"
      ADD CONSTRAINT "messages_senderId_fkey"
      FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorites_userId_fkey') THEN
    ALTER TABLE "favorites"
      ADD CONSTRAINT "favorites_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorites_listingId_fkey') THEN
    ALTER TABLE "favorites"
      ADD CONSTRAINT "favorites_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_listingId_fkey') THEN
    ALTER TABLE "reports"
      ADD CONSTRAINT "reports_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_reportedById_fkey') THEN
    ALTER TABLE "reports"
      ADD CONSTRAINT "reports_reportedById_fkey"
      FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_listingId_fkey') THEN
    ALTER TABLE "reviews"
      ADD CONSTRAINT "reviews_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_sellerId_fkey') THEN
    ALTER TABLE "reviews"
      ADD CONSTRAINT "reviews_sellerId_fkey"
      FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_reviewerId_fkey') THEN
    ALTER TABLE "reviews"
      ADD CONSTRAINT "reviews_reviewerId_fkey"
      FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
