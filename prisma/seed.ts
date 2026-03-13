import 'dotenv/config';
import {
  ApprovalStatus,
  Condition,
  Department,
  ListingStatus,
  MessageType,
  PrismaClient,
  ReportStatus,
  UserRole,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const shouldRespectStartupSeedFlag = process.argv.includes('--if-enabled');

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

if (shouldRespectStartupSeedFlag && !isTruthyEnv(process.env.SEED_ON_STARTUP)) {
  console.log('Skipping seed: SEED_ON_STARTUP is not enabled.');
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
const isFreshSeed = process.argv.includes('--fresh');

type UnsplashKeyword = 'book' | 'electronics' | 'dorm' | 'study' | 'other';

type SeedUser = {
  email: string;
  studentId: string;
  name: string;
  role?: UserRole;
  department: Department;
  avatarSeed: string;
};

type SeedUserMap = Record<
  string,
  {
    id: string;
    name: string;
    department: Department | null;
  }
>;

type SeedCategoryMap = Record<
  string,
  {
    id: string;
    name: string;
  }
>;

type SeedListing = {
  slug: string;
  title: string;
  description: string;
  price: number;
  originalPrice?: number;
  condition: Condition;
  status: ListingStatus;
  approvalStatus: ApprovalStatus;
  department: Department;
  sellerId: string;
  categoryId: string;
  imageKeyword: UnsplashKeyword;
  imageCount: number;
};

type SeedListingMap = Record<
  string,
  {
    id: string;
    slug: string;
    title: string;
    sellerId: string;
  }
>;

type SeedConversation = {
  id: string;
  listingId: string;
  participantIds: string[];
  messages: Array<{
    senderId: string;
    type: MessageType;
    content: string | null;
    imageKeyword?: UnsplashKeyword;
  }>;
};

const UNSPLASH_IMAGE_POOL: Record<UnsplashKeyword, string[]> = {
  book: [
    'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=1200&q=80',
  ],
  electronics: [
    'https://images.unsplash.com/photo-1517336714739-489689fd1ca8?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1580894908361-967195033215?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1496171367470-9ed9a91ea931?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1527443224154-c4c4f0f1c9be?auto=format&fit=crop&w=1200&q=80',
  ],
  dorm: [
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1493666438817-866a91353ca9?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=1200&q=80',
  ],
  study: [
    'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1200&q=80',
  ],
  other: [
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1515169067868-5387ec356754?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1554774853-b414d2a2bdeb?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=80',
  ],
};

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getRandomUnsplashUrl(keyword: UnsplashKeyword): string {
  const urls = UNSPLASH_IMAGE_POOL[keyword] ?? UNSPLASH_IMAGE_POOL.other;
  const randomIndex = Math.floor(Math.random() * urls.length);
  return urls[randomIndex] ?? UNSPLASH_IMAGE_POOL.other[0];
}

function createSampleUsers(): SeedUser[] {
  return [
    {
      email: 'admin@student.edu.vn',
      studentId: '20000001',
      name: 'Admin User',
      role: UserRole.ADMIN,
      department: Department.CNTT,
      avatarSeed: 'admin',
    },
    {
      email: 'an@student.edu.vn',
      studentId: '20210001',
      name: 'Nguyen Van An',
      department: Department.CNTT,
      avatarSeed: 'An',
    },
    {
      email: 'binh@student.edu.vn',
      studentId: '20210002',
      name: 'Tran Thi Binh',
      department: Department.KINHTOE,
      avatarSeed: 'Binh',
    },
    {
      email: 'chi.marketing@student.edu.vn',
      studentId: '20210003',
      name: 'Le Thi Chi',
      department: Department.MARKETING,
      avatarSeed: 'ChiMarketing',
    },
    {
      email: 'dung.ngoaingu@student.edu.vn',
      studentId: '20210004',
      name: 'Pham Quang Dung',
      department: Department.NGOAINGU,
      avatarSeed: 'DungNgoaiNgu',
    },
    {
      email: 'ha.luat@student.edu.vn',
      studentId: '20210005',
      name: 'Vo Minh Ha',
      department: Department.LUAT,
      avatarSeed: 'HaLuat',
    },
    {
      email: 'khanh.quanly@student.edu.vn',
      studentId: '20210006',
      name: 'Do Gia Khanh',
      department: Department.QUANLY,
      avatarSeed: 'KhanhQuanLy',
    },
    {
      email: 'minh.kythuat@student.edu.vn',
      studentId: '20210007',
      name: 'Bui Duc Minh',
      department: Department.KYTHUAT,
      avatarSeed: 'MinhKyThuat',
    },
    {
      email: 'phuong@student.edu.vn',
      studentId: '20210008',
      name: 'Nguyen Thi Phuong',
      department: Department.CNTT,
      avatarSeed: 'Phuong',
    },
  ];
}

function createSampleListings(users: SeedUserMap, categories: SeedCategoryMap): SeedListing[] {
  const templates = [
    {
      title: 'Giao trinh Giai tich 1 ban 2024',
      description: 'Sach con dep, khong viet vao noi dung, dung 1 hoc ky.',
      price: 85000,
      originalPrice: 150000,
      condition: Condition.LIKE_NEW,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.CNTT,
      sellerEmail: 'an@student.edu.vn',
      categorySlug: 'textbook',
      imageKeyword: 'book' as UnsplashKeyword,
      imageCount: 2,
    },
    {
      title: 'Bo de TOEIC 900+ kem file nghe',
      description: 'Sach luyen de ban 2025, da bo sung note mau.',
      price: 120000,
      originalPrice: 220000,
      condition: Condition.NEW,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.NGOAINGU,
      sellerEmail: 'dung.ngoaingu@student.edu.vn',
      categorySlug: 'textbook',
      imageKeyword: 'study' as UnsplashKeyword,
      imageCount: 2,
    },
    {
      title: 'May tinh Casio fx-580VNX',
      description: 'May tinh chay on dinh, phim bam con nhay.',
      price: 420000,
      originalPrice: 700000,
      condition: Condition.GOOD,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.KINHTOE,
      sellerEmail: 'binh@student.edu.vn',
      categorySlug: 'study',
      imageKeyword: 'study' as UnsplashKeyword,
      imageCount: 1,
    },
    {
      title: 'Laptop Dell Latitude 5420 i5',
      description: 'May da thay pin moi, phu hop lam do an va hoc online.',
      price: 9300000,
      originalPrice: 17500000,
      condition: Condition.GOOD,
      status: ListingStatus.RESERVED,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.KYTHUAT,
      sellerEmail: 'minh.kythuat@student.edu.vn',
      categorySlug: 'electronics',
      imageKeyword: 'electronics' as UnsplashKeyword,
      imageCount: 3,
    },
    {
      title: 'Tai nghe Sony WH1000XM4',
      description: 'Pin con khoang 28 gio, chong on tot, co hop day du.',
      price: 4500000,
      originalPrice: 7000000,
      condition: Condition.GOOD,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.PENDING,
      department: Department.KINHTOE,
      sellerEmail: 'binh@student.edu.vn',
      categorySlug: 'electronics',
      imageKeyword: 'electronics' as UnsplashKeyword,
      imageCount: 2,
    },
    {
      title: 'Ban hoc gap gon 1m2',
      description: 'Ban gon, chac chan, chan sat son tinh dien.',
      price: 450000,
      originalPrice: 900000,
      condition: Condition.LIKE_NEW,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.QUANLY,
      sellerEmail: 'khanh.quanly@student.edu.vn',
      categorySlug: 'dorm',
      imageKeyword: 'dorm' as UnsplashKeyword,
      imageCount: 2,
    },
    {
      title: 'Den hoc LED chong can',
      description: '3 muc sang, cong sac USB-C, den van rat moi.',
      price: 180000,
      originalPrice: 320000,
      condition: Condition.NEW,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.CNTT,
      sellerEmail: 'phuong@student.edu.vn',
      categorySlug: 'dorm',
      imageKeyword: 'dorm' as UnsplashKeyword,
      imageCount: 1,
    },
    {
      title: 'Sach Luat Dan su tap 1',
      description: 'Sach co danh dau nhe o 5 trang dau, noi dung con ro net.',
      price: 70000,
      originalPrice: 190000,
      condition: Condition.FAIR,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.LUAT,
      sellerEmail: 'ha.luat@student.edu.vn',
      categorySlug: 'textbook',
      imageKeyword: 'book' as UnsplashKeyword,
      imageCount: 1,
    },
    {
      title: 'Combo but highlight va so note',
      description: 'Set gom 6 but mau va 2 so note chua dung het.',
      price: 95000,
      originalPrice: 180000,
      condition: Condition.NEW,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.MARKETING,
      sellerEmail: 'chi.marketing@student.edu.vn',
      categorySlug: 'study',
      imageKeyword: 'study' as UnsplashKeyword,
      imageCount: 2,
    },
    {
      title: 'Man hinh LG 24 inch IPS',
      description: 'Khong diem chet, co day nguon va day HDMI.',
      price: 2200000,
      originalPrice: 3900000,
      condition: Condition.GOOD,
      status: ListingStatus.SOLD,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.KYTHUAT,
      sellerEmail: 'minh.kythuat@student.edu.vn',
      categorySlug: 'electronics',
      imageKeyword: 'electronics' as UnsplashKeyword,
      imageCount: 2,
    },
    {
      title: 'Ke sach 3 tang go thong',
      description: 'Ke gon dep, phu hop de trong phong tro 15m2.',
      price: 300000,
      originalPrice: 650000,
      condition: Condition.GOOD,
      status: ListingStatus.RESERVED,
      approvalStatus: ApprovalStatus.PENDING,
      department: Department.QUANLY,
      sellerEmail: 'khanh.quanly@student.edu.vn',
      categorySlug: 'dorm',
      imageKeyword: 'dorm' as UnsplashKeyword,
      imageCount: 1,
    },
    {
      title: 'Balo laptop chong nuoc 15.6 inch',
      description: 'Balo di hoc hang ngay, khoa keo con tot.',
      price: 260000,
      originalPrice: 480000,
      condition: Condition.LIKE_NEW,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.CNTT,
      sellerEmail: 'an@student.edu.vn',
      categorySlug: 'other',
      imageKeyword: 'other' as UnsplashKeyword,
      imageCount: 2,
    },
    {
      title: 'May in HP LaserJet cu',
      description: 'May in dung duoc, can thay muc sau khoang 200 trang.',
      price: 1200000,
      originalPrice: 3000000,
      condition: Condition.FAIR,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.REJECTED,
      department: Department.CNTT,
      sellerEmail: 'phuong@student.edu.vn',
      categorySlug: 'electronics',
      imageKeyword: 'electronics' as UnsplashKeyword,
      imageCount: 1,
    },
    {
      title: 'Giao trinh Kinh te vi mo',
      description: 'Ban tai ban moi, sach khong rach, khong mat trang.',
      price: 90000,
      originalPrice: 160000,
      condition: Condition.GOOD,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.KINHTOE,
      sellerEmail: 'binh@student.edu.vn',
      categorySlug: 'textbook',
      imageKeyword: 'book' as UnsplashKeyword,
      imageCount: 2,
    },
    {
      title: 'Ghe xoay cong thai hoc',
      description: 'Ghe ngoi em, co tua dau, phu hop ngoi hoc lau.',
      price: 750000,
      originalPrice: 1500000,
      condition: Condition.LIKE_NEW,
      status: ListingStatus.SOLD,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.QUANLY,
      sellerEmail: 'khanh.quanly@student.edu.vn',
      categorySlug: 'dorm',
      imageKeyword: 'dorm' as UnsplashKeyword,
      imageCount: 2,
    },
    {
      title: 'Bang ve may tinh Wacom One',
      description: 'Bang ve con bao hanh 6 thang, co but va day ket noi.',
      price: 1400000,
      originalPrice: 2100000,
      condition: Condition.LIKE_NEW,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.KYTHUAT,
      sellerEmail: 'minh.kythuat@student.edu.vn',
      categorySlug: 'electronics',
      imageKeyword: 'electronics' as UnsplashKeyword,
      imageCount: 3,
    },
    {
      title: 'May anh Fujifilm Instax Mini 11',
      description: 'May anh chup lien, con 2 hop film chua mo.',
      price: 1600000,
      originalPrice: 2400000,
      condition: Condition.GOOD,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.PENDING,
      department: Department.MARKETING,
      sellerEmail: 'chi.marketing@student.edu.vn',
      categorySlug: 'electronics',
      imageKeyword: 'electronics' as UnsplashKeyword,
      imageCount: 2,
    },
    {
      title: 'Khoa hoc online IELTS Writing',
      description: 'Tai khoan hoc 3 thang con han, co file bai mau.',
      price: 350000,
      originalPrice: 800000,
      condition: Condition.NEW,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.NGOAINGU,
      sellerEmail: 'dung.ngoaingu@student.edu.vn',
      categorySlug: 'other',
      imageKeyword: 'study' as UnsplashKeyword,
      imageCount: 1,
    },
    {
      title: 'Bo dung cu sua dien co ban',
      description: 'Bo tua vit va dong ho do nho gon cho sinh vien ky thuat.',
      price: 500000,
      originalPrice: 980000,
      condition: Condition.GOOD,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.KYTHUAT,
      sellerEmail: 'minh.kythuat@student.edu.vn',
      categorySlug: 'other',
      imageKeyword: 'other' as UnsplashKeyword,
      imageCount: 1,
    },
  ];

  const usedSlugs = new Set<string>();

  return templates.map((template) => {
    const seller = users[template.sellerEmail];
    if (!seller) {
      throw new Error(`Missing seeded user: ${template.sellerEmail}`);
    }

    const category = categories[template.categorySlug];
    if (!category) {
      throw new Error(`Missing seeded category: ${template.categorySlug}`);
    }

    const baseSlug = generateSlug(template.title);
    let slug = baseSlug;
    let suffix = 2;

    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    usedSlugs.add(slug);

    return {
      slug,
      title: template.title,
      description: template.description,
      price: template.price,
      originalPrice: template.originalPrice,
      condition: template.condition,
      status: template.status,
      approvalStatus: template.approvalStatus,
      department: template.department,
      sellerId: seller.id,
      categoryId: category.id,
      imageKeyword: template.imageKeyword,
      imageCount: template.imageCount,
    };
  });
}

function createSampleConversations(users: SeedUserMap, listings: SeedListingMap): SeedConversation[] {
  const templates = [
    {
      id: 'seed-conv-1',
      listingSlug: 'giao-trinh-giai-tich-1-ban-2024',
      participantEmails: ['an@student.edu.vn', 'dung.ngoaingu@student.edu.vn'],
      messages: [
        {
          senderEmail: 'dung.ngoaingu@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Chao ban, sach giai tich nay con khong?',
        },
        {
          senderEmail: 'an@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Con ban nhe, sach con rat moi.',
        },
        {
          senderEmail: 'an@student.edu.vn',
          type: MessageType.IMAGE,
          content: 'Minh gui them anh trang ben trong.',
          imageKeyword: 'book' as UnsplashKeyword,
        },
        {
          senderEmail: 'dung.ngoaingu@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Tot qua, toi toi qua phong A2 xem sach duoc khong?',
        },
      ],
    },
    {
      id: 'seed-conv-2',
      listingSlug: 'laptop-dell-latitude-5420-i5',
      participantEmails: ['minh.kythuat@student.edu.vn', 'binh@student.edu.vn'],
      messages: [
        {
          senderEmail: 'binh@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Laptop da thay pin chua ban?',
        },
        {
          senderEmail: 'minh.kythuat@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Da thay pin moi thang truoc, pin dung duoc 5-6 tieng.',
        },
        {
          senderEmail: 'minh.kythuat@student.edu.vn',
          type: MessageType.IMAGE,
          content: 'Anh cau hinh va tinh trang ban phim.',
          imageKeyword: 'electronics' as UnsplashKeyword,
        },
      ],
    },
    {
      id: 'seed-conv-3',
      listingSlug: 'ban-hoc-gap-gon-1m2',
      participantEmails: ['khanh.quanly@student.edu.vn', 'chi.marketing@student.edu.vn'],
      messages: [
        {
          senderEmail: 'chi.marketing@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Ban hoc co giao tan noi ky tuc xa khong?',
        },
        {
          senderEmail: 'khanh.quanly@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Co nhe, minh giao trong khuon vien truong.',
        },
        {
          senderEmail: 'chi.marketing@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Ok ban giu minh den chieu mai nhe.',
        },
      ],
    },
    {
      id: 'seed-conv-4',
      listingSlug: 'may-anh-fujifilm-instax-mini-11',
      participantEmails: ['chi.marketing@student.edu.vn', 'an@student.edu.vn'],
      messages: [
        {
          senderEmail: 'an@student.edu.vn',
          type: MessageType.TEXT,
          content: 'May anh nay da het bao hanh chua?',
        },
        {
          senderEmail: 'chi.marketing@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Con bao hanh 2 thang, day du hoa don.',
        },
        {
          senderEmail: 'an@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Neu lay hom nay ban fix 100k duoc khong?',
        },
        {
          senderEmail: 'chi.marketing@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Duoc nhe, minh de 1tr5 cho ban.',
        },
      ],
    },
    {
      id: 'seed-conv-5',
      listingSlug: 'sach-luat-dan-su-tap-1',
      participantEmails: ['ha.luat@student.edu.vn', 'phuong@student.edu.vn'],
      messages: [
        {
          senderEmail: 'phuong@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Sach co ghi chu nhieu khong ban?',
        },
        {
          senderEmail: 'ha.luat@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Chi co danh dau nhe 5 trang dau thoi.',
        },
        {
          senderEmail: 'ha.luat@student.edu.vn',
          type: MessageType.IMAGE,
          content: 'Gui ban anh de xem truoc.',
          imageKeyword: 'book' as UnsplashKeyword,
        },
      ],
    },
    {
      id: 'seed-conv-6',
      listingSlug: 'giao-trinh-kinh-te-vi-mo',
      participantEmails: ['binh@student.edu.vn', 'khanh.quanly@student.edu.vn'],
      messages: [
        {
          senderEmail: 'khanh.quanly@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Minh lay 2 quyen kinh te thi co giam them khong?',
        },
        {
          senderEmail: 'binh@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Lay 2 quyen minh de 80k/quyen nha.',
        },
        {
          senderEmail: 'khanh.quanly@student.edu.vn',
          type: MessageType.TEXT,
          content: 'Ok ban, mai gap o canteen luc 10h.',
        },
      ],
    },
  ];

  return templates.map((template) => {
    const listing = listings[template.listingSlug];
    if (!listing) {
      throw new Error(`Missing seeded listing: ${template.listingSlug}`);
    }

    const participantIds = template.participantEmails.map((email) => {
      const user = users[email];
      if (!user) {
        throw new Error(`Missing seeded user in conversation: ${email}`);
      }
      return user.id;
    });

    const messages = template.messages.map((message) => {
      const sender = users[message.senderEmail];
      if (!sender) {
        throw new Error(`Missing seeded sender: ${message.senderEmail}`);
      }

      return {
        senderId: sender.id,
        type: message.type,
        content: message.content,
        imageKeyword: message.imageKeyword,
      };
    });

    return {
      id: template.id,
      listingId: listing.id,
      participantIds,
      messages,
    };
  });
}

async function clearAllData() {
  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.conversationParticipant.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.favorite.deleteMany(),
    prisma.report.deleteMany(),
    prisma.review.deleteMany(),
    prisma.userBlock.deleteMany(),
    prisma.listingImage.deleteMany(),
    prisma.listing.deleteMany(),
    prisma.category.deleteMany(),
    prisma.otpVerification.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  if (isFreshSeed) {
    console.log('Running fresh seed: deleting all existing data...');
    await clearAllData();
  }

  const categorySeeds = [
    { slug: 'textbook', name: 'Giao trinh', icon: 'book' },
    { slug: 'electronics', name: 'Dien tu', icon: 'laptop' },
    { slug: 'dorm', name: 'Do phong tro', icon: 'home' },
    { slug: 'study', name: 'Dung cu hoc tap', icon: 'pen' },
    { slug: 'other', name: 'Khac', icon: 'box' },
  ];

  const categoriesBySlug: SeedCategoryMap = {};
  for (const category of categorySeeds) {
    const savedCategory = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, icon: category.icon },
      create: category,
    });

    categoriesBySlug[savedCategory.slug] = {
      id: savedCategory.id,
      name: savedCategory.name,
    };
  }

  const usersByEmail: SeedUserMap = {};
  for (const userSeed of createSampleUsers()) {
    const savedUser = await prisma.user.upsert({
      where: { email: userSeed.email },
      update: {
        name: userSeed.name,
        studentId: userSeed.studentId,
        role: userSeed.role ?? UserRole.USER,
        department: userSeed.department,
        isVerified: true,
        isActive: true,
        passwordHash,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userSeed.avatarSeed}`,
      },
      create: {
        email: userSeed.email,
        studentId: userSeed.studentId,
        name: userSeed.name,
        role: userSeed.role ?? UserRole.USER,
        department: userSeed.department,
        isVerified: true,
        isActive: true,
        passwordHash,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userSeed.avatarSeed}`,
      },
    });

    usersByEmail[userSeed.email] = {
      id: savedUser.id,
      name: savedUser.name,
      department: savedUser.department,
    };
  }

  const listingSeeds = createSampleListings(usersByEmail, categoriesBySlug);
  const listingsBySlug: SeedListingMap = {};

  for (const listingSeed of listingSeeds) {
    const savedListing = await prisma.listing.upsert({
      where: { slug: listingSeed.slug },
      update: {
        title: listingSeed.title,
        description: listingSeed.description,
        price: listingSeed.price,
        originalPrice: listingSeed.originalPrice,
        condition: listingSeed.condition,
        status: listingSeed.status,
        approvalStatus: listingSeed.approvalStatus,
        department: listingSeed.department,
        sellerId: listingSeed.sellerId,
        categoryId: listingSeed.categoryId,
      },
      create: {
        slug: listingSeed.slug,
        title: listingSeed.title,
        description: listingSeed.description,
        price: listingSeed.price,
        originalPrice: listingSeed.originalPrice,
        condition: listingSeed.condition,
        status: listingSeed.status,
        approvalStatus: listingSeed.approvalStatus,
        department: listingSeed.department,
        sellerId: listingSeed.sellerId,
        categoryId: listingSeed.categoryId,
      },
    });

    listingsBySlug[savedListing.slug] = {
      id: savedListing.id,
      slug: savedListing.slug,
      title: savedListing.title,
      sellerId: savedListing.sellerId,
    };
  }

  const listingIds = Object.values(listingsBySlug).map((listing) => listing.id);
  await prisma.listingImage.deleteMany({
    where: { listingId: { in: listingIds } },
  });

  const listingImagesPayload = listingSeeds.flatMap((listingSeed) => {
    const listing = listingsBySlug[listingSeed.slug];
    return Array.from({ length: listingSeed.imageCount }, (_, order) => ({
      listingId: listing.id,
      url: getRandomUnsplashUrl(listingSeed.imageKeyword),
      order,
    }));
  });

  if (listingImagesPayload.length > 0) {
    await prisma.listingImage.createMany({
      data: listingImagesPayload,
    });
  }

  const conversationSeeds = createSampleConversations(usersByEmail, listingsBySlug);
  const conversationIds = conversationSeeds.map((conversation) => conversation.id);

  if (conversationIds.length > 0) {
    await prisma.message.deleteMany({
      where: { conversationId: { in: conversationIds } },
    });
    await prisma.conversationParticipant.deleteMany({
      where: { conversationId: { in: conversationIds } },
    });
  }

  for (const conversationSeed of conversationSeeds) {
    await prisma.conversation.upsert({
      where: { id: conversationSeed.id },
      update: {
        listingId: conversationSeed.listingId,
        lastMessageAt: new Date(),
      },
      create: {
        id: conversationSeed.id,
        listingId: conversationSeed.listingId,
        lastMessageAt: new Date(),
      },
    });

    await prisma.conversationParticipant.createMany({
      data: conversationSeed.participantIds.map((userId) => ({
        conversationId: conversationSeed.id,
        userId,
      })),
      skipDuplicates: true,
    });

    const baseTimestamp = Date.now();
    const messagePayload = conversationSeed.messages.map((message, index) => ({
      id: `seed-msg-${conversationSeed.id.replace('seed-conv-', '')}-${index + 1}`,
      conversationId: conversationSeed.id,
      senderId: message.senderId,
      type: message.type,
      content: message.content,
      imageUrl: message.type === MessageType.IMAGE ? getRandomUnsplashUrl(message.imageKeyword ?? 'other') : null,
      createdAt: new Date(baseTimestamp + index * 60_000),
    }));

    if (messagePayload.length > 0) {
      await prisma.message.createMany({
        data: messagePayload,
      });

      await prisma.conversation.update({
        where: { id: conversationSeed.id },
        data: {
          lastMessageAt: messagePayload[messagePayload.length - 1]?.createdAt ?? new Date(),
        },
      });
    }
  }

  const favoriteSeeds = [
    ['an@student.edu.vn', 'laptop-dell-latitude-5420-i5'],
    ['an@student.edu.vn', 'may-anh-fujifilm-instax-mini-11'],
    ['binh@student.edu.vn', 'giao-trinh-giai-tich-1-ban-2024'],
    ['binh@student.edu.vn', 'ban-hoc-gap-gon-1m2'],
    ['chi.marketing@student.edu.vn', 'tai-nghe-sony-wh1000xm4'],
    ['chi.marketing@student.edu.vn', 'bang-ve-may-tinh-wacom-one'],
    ['dung.ngoaingu@student.edu.vn', 'combo-but-highlight-va-so-note'],
    ['ha.luat@student.edu.vn', 'giao-trinh-kinh-te-vi-mo'],
    ['khanh.quanly@student.edu.vn', 'bo-de-toeic-900-kem-file-nghe'],
    ['minh.kythuat@student.edu.vn', 'bo-dung-cu-sua-dien-co-ban'],
    ['phuong@student.edu.vn', 'ke-sach-3-tang-go-thong'],
    ['phuong@student.edu.vn', 'balo-laptop-chong-nuoc-15-6-inch'],
  ] as const;

  for (const [userEmail, listingSlug] of favoriteSeeds) {
    const user = usersByEmail[userEmail];
    const listing = listingsBySlug[listingSlug];

    if (!user || !listing) {
      continue;
    }

    await prisma.favorite.upsert({
      where: {
        userId_listingId: {
          userId: user.id,
          listingId: listing.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        listingId: listing.id,
      },
    });
  }

  const reviewSeeds = [
    {
      listingSlug: 'giao-trinh-giai-tich-1-ban-2024',
      reviewerEmail: 'binh@student.edu.vn',
      rating: 5,
      comment: 'Sach dung mo ta, giao dung hen.',
    },
    {
      listingSlug: 'ban-hoc-gap-gon-1m2',
      reviewerEmail: 'chi.marketing@student.edu.vn',
      rating: 4,
      comment: 'Ban chac chan, seller ho tro giao tan noi.',
    },
    {
      listingSlug: 'sach-luat-dan-su-tap-1',
      reviewerEmail: 'phuong@student.edu.vn',
      rating: 5,
      comment: 'Sach tot, minh dung kip cho ky thi giua ky.',
    },
    {
      listingSlug: 'tai-nghe-sony-wh1000xm4',
      reviewerEmail: 'an@student.edu.vn',
      rating: 4,
      comment: 'Am thanh tot, pin on, giao dich nhanh.',
    },
    {
      listingSlug: 'giao-trinh-kinh-te-vi-mo',
      reviewerEmail: 'khanh.quanly@student.edu.vn',
      rating: 3,
      comment: 'Sach on, co vai trang gap mep nho.',
    },
    {
      listingSlug: 'bang-ve-may-tinh-wacom-one',
      reviewerEmail: 'chi.marketing@student.edu.vn',
      rating: 5,
      comment: 'Hang dep, dung ngay khong loi.',
    },
    {
      listingSlug: 'may-anh-fujifilm-instax-mini-11',
      reviewerEmail: 'an@student.edu.vn',
      rating: 4,
      comment: 'May hoat dong tot, film chup mau dep.',
    },
  ] as const;

  for (const reviewSeed of reviewSeeds) {
    const listing = listingsBySlug[reviewSeed.listingSlug];
    const reviewer = usersByEmail[reviewSeed.reviewerEmail];

    if (!listing || !reviewer) {
      continue;
    }

    await prisma.review.upsert({
      where: {
        listingId_reviewerId: {
          listingId: listing.id,
          reviewerId: reviewer.id,
        },
      },
      update: {
        rating: reviewSeed.rating,
        comment: reviewSeed.comment,
        sellerId: listing.sellerId,
      },
      create: {
        listingId: listing.id,
        sellerId: listing.sellerId,
        reviewerId: reviewer.id,
        rating: reviewSeed.rating,
        comment: reviewSeed.comment,
      },
    });
  }

  for (const user of Object.values(usersByEmail)) {
    const aggregate = await prisma.review.aggregate({
      where: { sellerId: user.id },
      _avg: { rating: true },
      _count: { _all: true },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        totalReviews: aggregate._count._all,
        sellerRating: aggregate._avg.rating ?? 0,
      },
    });
  }

  const reportSeeds = [
    {
      id: 'seed-report-1',
      listingSlug: 'tai-nghe-sony-wh1000xm4',
      reportedByEmail: 'an@student.edu.vn',
      reason: 'Gia cao so voi mo ta tinh trang.',
      status: ReportStatus.PENDING,
    },
    {
      id: 'seed-report-2',
      listingSlug: 'may-in-hp-laserjet-cu',
      reportedByEmail: 'minh.kythuat@student.edu.vn',
      reason: 'Thong tin bao hanh chua ro rang.',
      status: ReportStatus.REVIEWED,
    },
    {
      id: 'seed-report-3',
      listingSlug: 'khoa-hoc-online-ielts-writing',
      reportedByEmail: 'ha.luat@student.edu.vn',
      reason: 'Can xac minh quyen chuyen nhuong tai khoan.',
      status: ReportStatus.RESOLVED,
    },
    {
      id: 'seed-report-4',
      listingSlug: 'bo-dung-cu-sua-dien-co-ban',
      reportedByEmail: 'dung.ngoaingu@student.edu.vn',
      reason: 'Hinh anh chua hien ro cac phu kien kem theo.',
      status: ReportStatus.PENDING,
    },
  ] as const;

  for (const reportSeed of reportSeeds) {
    const listing = listingsBySlug[reportSeed.listingSlug];
    const reporter = usersByEmail[reportSeed.reportedByEmail];

    if (!listing || !reporter) {
      continue;
    }

    await prisma.report.upsert({
      where: { id: reportSeed.id },
      update: {
        listingId: listing.id,
        reportedById: reporter.id,
        reason: reportSeed.reason,
        status: reportSeed.status,
      },
      create: {
        id: reportSeed.id,
        listingId: listing.id,
        reportedById: reporter.id,
        reason: reportSeed.reason,
        status: reportSeed.status,
      },
    });
  }

  const userBlockSeeds = [
    ['an@student.edu.vn', 'chi.marketing@student.edu.vn'],
    ['binh@student.edu.vn', 'phuong@student.edu.vn'],
    ['ha.luat@student.edu.vn', 'dung.ngoaingu@student.edu.vn'],
  ] as const;

  for (const [blockerEmail, blockedEmail] of userBlockSeeds) {
    const blocker = usersByEmail[blockerEmail];
    const blocked = usersByEmail[blockedEmail];

    if (!blocker || !blocked) {
      continue;
    }

    await prisma.userBlock.upsert({
      where: {
        blockerId_blockedId: {
          blockerId: blocker.id,
          blockedId: blocked.id,
        },
      },
      update: {},
      create: {
        blockerId: blocker.id,
        blockedId: blocked.id,
      },
    });
  }

  console.log('Seed completed successfully.');
  console.log(`Users seeded: ${Object.keys(usersByEmail).length}`);
  console.log(`Listings seeded: ${Object.keys(listingsBySlug).length}`);
  console.log(`Conversations seeded: ${conversationSeeds.length}`);
  console.log('Default password for all users: password123');
  console.log('Admin login: admin@student.edu.vn / password123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
