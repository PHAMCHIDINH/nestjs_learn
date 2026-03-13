# Seed Data Guide

Tai lieu nay mo ta bo du lieu mau cho backend (`NestJS + Prisma`) va cach seed/reset database.

## Commands

```bash
# Seed data (upsert users/categories/listings + conversations/reviews/reports/favorites)
npm run db:seed

# Fresh seed: xoa toan bo du lieu trong cac bang domain, sau do seed lai
npm run db:seed:fresh

# Reset database bang prisma migrate reset, sau do seed lai
npm run db:reset
```

## Environment

Can set `DATABASE_URL` trong `.env`.

Vi du:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/unimarket_seed?schema=public
```

## Seed Accounts

Tat ca tai khoan seed deu dung mat khau:

`password123`

| Role  | Email                              | Department |
|-------|------------------------------------|------------|
| ADMIN | admin@student.edu.vn               | CNTT       |
| USER  | an@student.edu.vn                  | CNTT       |
| USER  | binh@student.edu.vn                | KINHTOE    |
| USER  | chi.marketing@student.edu.vn       | MARKETING  |
| USER  | dung.ngoaingu@student.edu.vn       | NGOAINGU   |
| USER  | ha.luat@student.edu.vn             | LUAT       |
| USER  | khanh.quanly@student.edu.vn        | QUANLY     |
| USER  | minh.kythuat@student.edu.vn        | KYTHUAT    |
| USER  | phuong@student.edu.vn              | CNTT       |

## Seed Dataset Overview

- Categories: `textbook`, `electronics`, `dorm`, `study`, `other`
- Listings: 18 listings
- Listing images: 1-3 anh/listing (Unsplash URLs)
- Conversations: 6 conversations
- Messages: TEXT + IMAGE (noi dung tieng Viet)
- Favorites: 12 relations
- Reviews: 7 reviews (rating 3-5)
- Reports: 4 reports (`PENDING`, `REVIEWED`, `RESOLVED`)
- User blocks: 3 relations

## Data Shape Highlights

- Listings da da dang theo:
  - `Condition`: `NEW`, `LIKE_NEW`, `GOOD`, `FAIR`
  - `Status`: `SELLING`, `RESERVED`, `SOLD`
  - `ApprovalStatus`: `PENDING`, `APPROVED`, `REJECTED`
- Price range seed:
  - 70,000 VND den 9,300,000 VND
- Conversations gan voi cac listings khac nhau de demo luong chat buyer/seller.

## Notes

- `db:seed` la idempotent cho bo du lieu mau (dung `upsert` theo `email`, `slug`, `id`).
- `db:seed:fresh` se xoa du lieu cac bang domain truoc khi seed lai.
