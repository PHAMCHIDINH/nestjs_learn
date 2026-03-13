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
};

export const mapListingToFrontend = (
  listing: ListingWithRelations,
  currentUserId?: string,
) => {
  const images = (listing.images ?? []).sort((a, b) => a.order - b.order);
  const favorites = listing.favorites ?? [];

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
  };
};
