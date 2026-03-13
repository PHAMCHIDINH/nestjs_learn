import {
  ApprovalStatus,
  Category,
  Condition,
  Department,
  Favorite,
  Listing,
  ListingImage,
  ListingStatus,
  User,
} from '@prisma/client';
import {
  mapDepartmentFromFrontend,
  mapDepartmentToFrontend,
  mapUserToFrontend,
} from '../users/user.mapper';

const conditionToFrontend: Record<Condition, string> = {
  NEW: 'new',
  LIKE_NEW: 'like-new',
  GOOD: 'good',
  FAIR: 'fair',
};

const statusToFrontend: Record<ListingStatus, string> = {
  SELLING: 'selling',
  RESERVED: 'reserved',
  SOLD: 'sold',
};

const approvalToFrontend: Record<ApprovalStatus, string> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const mapConditionFromFrontend = (value: string): Condition => {
  const normalized = value.trim().toLowerCase();
  const match = Object.entries(conditionToFrontend).find(
    ([, frontendValue]) => frontendValue === normalized,
  );

  if (!match) {
    throw new Error(`Unsupported condition value: ${value}`);
  }

  return match[0] as Condition;
};

export const mapStatusFromFrontend = (value: string): ListingStatus => {
  const normalized = value.trim().toLowerCase();
  const match = Object.entries(statusToFrontend).find(
    ([, frontendValue]) => frontendValue === normalized,
  );

  if (!match) {
    throw new Error(`Unsupported listing status value: ${value}`);
  }

  return match[0] as ListingStatus;
};

export const mapDepartmentFromFrontendValue = (value: string): Department => {
  return mapDepartmentFromFrontend(value);
};

type ListingWithRelations = Listing & {
  seller: User;
  category: Category;
  images?: ListingImage[];
  favorites?: Favorite[];
  moderationRuns?: Array<{
    riskLevel: string;
    confidence: number | null;
    recommendedAction: string | null;
    summary: string | null;
    violationsJson: unknown;
    createdAt: Date;
  }>;
  moderationJob?: {
    status: string;
  } | null;
};

export const mapListingToFrontend = (
  listing: ListingWithRelations,
  currentUserId?: string,
) => {
  const images = (listing.images ?? []).sort((a, b) => a.order - b.order);
  const favorites = listing.favorites ?? [];
  const latestModeration = [...(listing.moderationRuns ?? [])].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  )[0];

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    originalPrice: listing.originalPrice,
    images: images.map((image) => image.url),
    category: listing.category.slug,
    condition: conditionToFrontend[listing.condition],
    status: statusToFrontend[listing.status],
    approvalStatus: approvalToFrontend[listing.approvalStatus],
    seller: mapUserToFrontend(listing.seller),
    department: mapDepartmentToFrontend(listing.department),
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    views: listing.viewCount,
    savedCount: favorites.length,
    isSaved: currentUserId
      ? favorites.some((favorite) => favorite.userId === currentUserId)
      : false,
    latestModeration: latestModeration
      ? {
          riskLevel: latestModeration.riskLevel.toLowerCase(),
          confidence: latestModeration.confidence,
          recommendedAction:
            latestModeration.recommendedAction?.toLowerCase() ?? null,
          summary: latestModeration.summary ?? null,
          violations: Array.isArray(latestModeration.violationsJson)
            ? latestModeration.violationsJson.filter(
                (value): value is string => typeof value === 'string',
              )
            : [],
          createdAt: latestModeration.createdAt,
        }
      : undefined,
    moderationJobStatus: listing.moderationJob?.status
      ? listing.moderationJob.status.toLowerCase()
      : undefined,
  };
};
