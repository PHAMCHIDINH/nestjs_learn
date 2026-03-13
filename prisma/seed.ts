import 'dotenv/config';
import { PrismaClient, ApprovalStatus, Condition, Department, ListingStatus, ReportStatus, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const categories = [
    { slug: 'textbook', name: 'Giáo trình', icon: 'book' },
    { slug: 'electronics', name: 'Điện tử', icon: 'laptop' },
    { slug: 'dorm', name: 'Đồ phòng trọ', icon: 'home' },
    { slug: 'study', name: 'Dụng cụ học tập', icon: 'pen' },
    { slug: 'other', name: 'Khác', icon: 'box' },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, icon: category.icon },
      create: category,
    });
  }

  const admin = await prisma.user.upsert({
    where: { email: 'admin@student.edu.vn' },
    update: {
      name: 'Admin User',
      studentId: '20000001',
      role: UserRole.ADMIN,
      department: Department.CNTT,
      isVerified: true,
      isActive: true,
      passwordHash,
    },
    create: {
      email: 'admin@student.edu.vn',
      studentId: '20000001',
      name: 'Admin User',
      role: UserRole.ADMIN,
      department: Department.CNTT,
      isVerified: true,
      isActive: true,
      passwordHash,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
    },
  });

  const user1 = await prisma.user.upsert({
    where: { email: 'an@student.edu.vn' },
    update: {
      name: 'Nguyen Van An',
      studentId: '20210001',
      department: Department.CNTT,
      isVerified: true,
      isActive: true,
      passwordHash,
    },
    create: {
      email: 'an@student.edu.vn',
      studentId: '20210001',
      name: 'Nguyen Van An',
      department: Department.CNTT,
      isVerified: true,
      isActive: true,
      passwordHash,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=An',
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'binh@student.edu.vn' },
    update: {
      name: 'Tran Thi Binh',
      studentId: '20210002',
      department: Department.KINHTOE,
      isVerified: true,
      isActive: true,
      passwordHash,
    },
    create: {
      email: 'binh@student.edu.vn',
      studentId: '20210002',
      name: 'Tran Thi Binh',
      department: Department.KINHTOE,
      isVerified: true,
      isActive: true,
      passwordHash,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Binh',
    },
  });

  const textbookCategory = await prisma.category.findUniqueOrThrow({ where: { slug: 'textbook' } });
  const electronicsCategory = await prisma.category.findUniqueOrThrow({ where: { slug: 'electronics' } });

  const listing1 = await prisma.listing.upsert({
    where: { slug: 'giao-trinh-giai-tich-1' },
    update: {
      title: 'Giao trinh Giai tich 1',
      description: 'Sach dep, con moi.',
      price: 85000,
      originalPrice: 150000,
      condition: Condition.LIKE_NEW,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.CNTT,
      sellerId: user1.id,
      categoryId: textbookCategory.id,
    },
    create: {
      slug: 'giao-trinh-giai-tich-1',
      title: 'Giao trinh Giai tich 1',
      description: 'Sach dep, con moi.',
      price: 85000,
      originalPrice: 150000,
      condition: Condition.LIKE_NEW,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.APPROVED,
      department: Department.CNTT,
      sellerId: user1.id,
      categoryId: textbookCategory.id,
    },
  });

  const listing2 = await prisma.listing.upsert({
    where: { slug: 'tai-nghe-sony-wh1000xm4' },
    update: {
      title: 'Tai nghe Sony WH1000XM4',
      description: 'Tai nghe chong on con dep.',
      price: 4500000,
      originalPrice: 7000000,
      condition: Condition.GOOD,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.PENDING,
      department: Department.KINHTOE,
      sellerId: user2.id,
      categoryId: electronicsCategory.id,
    },
    create: {
      slug: 'tai-nghe-sony-wh1000xm4',
      title: 'Tai nghe Sony WH1000XM4',
      description: 'Tai nghe chong on con dep.',
      price: 4500000,
      originalPrice: 7000000,
      condition: Condition.GOOD,
      status: ListingStatus.SELLING,
      approvalStatus: ApprovalStatus.PENDING,
      department: Department.KINHTOE,
      sellerId: user2.id,
      categoryId: electronicsCategory.id,
    },
  });

  await prisma.listingImage.deleteMany({ where: { listingId: { in: [listing1.id, listing2.id] } } });

  await prisma.listingImage.createMany({
    data: [
      {
        listingId: listing1.id,
        url: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800',
        order: 0,
      },
      {
        listingId: listing2.id,
        url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
        order: 0,
      },
    ],
  });

  await prisma.favorite.upsert({
    where: { userId_listingId: { userId: user1.id, listingId: listing2.id } },
    update: {},
    create: { userId: user1.id, listingId: listing2.id },
  });

  await prisma.report.upsert({
    where: { id: 'seed-report-1' },
    update: {
      listingId: listing2.id,
      reportedById: user1.id,
      reason: 'Gia cao bat thuong',
    },
    create: {
      id: 'seed-report-1',
      listingId: listing2.id,
      reportedById: user1.id,
      reason: 'Gia cao bat thuong',
      status: ReportStatus.PENDING,
    },
  });

  const conversation = await prisma.conversation.upsert({
    where: { id: 'seed-conv-1' },
    update: { listingId: listing1.id, lastMessageAt: new Date() },
    create: { id: 'seed-conv-1', listingId: listing1.id, lastMessageAt: new Date() },
  });

  await prisma.conversationParticipant.upsert({
    where: {
      conversationId_userId: { conversationId: conversation.id, userId: user1.id },
    },
    update: {},
    create: { conversationId: conversation.id, userId: user1.id },
  });

  await prisma.conversationParticipant.upsert({
    where: {
      conversationId_userId: { conversationId: conversation.id, userId: user2.id },
    },
    update: {},
    create: { conversationId: conversation.id, userId: user2.id },
  });

  await prisma.message.upsert({
    where: { id: 'seed-msg-1' },
    update: {
      conversationId: conversation.id,
      senderId: user2.id,
      content: 'San pham con khong ban?',
    },
    create: {
      id: 'seed-msg-1',
      conversationId: conversation.id,
      senderId: user2.id,
      content: 'San pham con khong ban?',
    },
  });

  console.log('Seed completed');
  console.log('Admin login: admin@student.edu.vn / password123');
  console.log('User login: an@student.edu.vn / password123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
