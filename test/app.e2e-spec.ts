import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/database/prisma.service';
import { MailService } from '../src/core/mail/mail.service';
import { CloudinaryService } from '../src/core/media/cloudinary.service';

type MockUser = {
  id: string;
  name: string;
  email: string;
  studentId: string;
  department: string | null;
  avatarUrl: string | null;
  avatarPublicId: string | null;
  isVerified: boolean;
  createdAt: Date;
  lastSeen: Date | null;
  isOnline: boolean;
  role: 'USER' | 'ADMIN';
};

const createMockUser = (): MockUser => ({
  id: 'user-1',
  name: 'Test User',
  email: 'user@example.com',
  studentId: 'SV0001',
  department: 'CNTT',
  avatarUrl: null,
  avatarPublicId: null,
  isVerified: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastSeen: null,
  isOnline: false,
  role: 'USER',
});

let currentUser = createMockUser();

const prismaMock = {
  $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  $transaction: jest.fn().mockImplementation(async (input: unknown) => {
    if (typeof input === 'function') {
      return input(prismaMock);
    }
    if (Array.isArray(input)) {
      return Promise.all(input as Promise<unknown>[]);
    }
    return undefined;
  }),
  user: {
    findMany: jest.fn().mockImplementation(async () => [{ ...currentUser }]),
    findUnique: jest.fn().mockImplementation(async ({ where }) => {
      if (!where) {
        return null;
      }

      if (
        where.id === currentUser.id ||
        where.email === currentUser.email ||
        where.studentId === currentUser.studentId
      ) {
        return { ...currentUser };
      }

      return null;
    }),
    create: jest.fn().mockImplementation(async ({ data }) => ({
      id: 'user-created',
      name: data.name,
      email: data.email,
      studentId: data.studentId,
      passwordHash: data.passwordHash ?? '$2a$10$hashhashhashhashhashhashhash',
      department: data.department ?? 'CNTT',
      avatarUrl: null,
      avatarPublicId: null,
      isVerified: false,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      lastSeen: null,
      isOnline: false,
      role: 'USER',
    })),
    update: jest.fn().mockImplementation(async ({ where, data }) => {
      if (!where || where.id !== currentUser.id) {
        return null;
      }

      const patch = data as Record<string, unknown>;
      if (patch.name !== undefined) {
        currentUser.name = String(patch.name);
      }
      if (patch.department !== undefined) {
        currentUser.department = patch.department as string | null;
      }
      if (patch.avatarUrl !== undefined) {
        currentUser.avatarUrl = patch.avatarUrl as string | null;
      }
      if (patch.avatarPublicId !== undefined) {
        currentUser.avatarPublicId = patch.avatarPublicId as string | null;
      }
      if (patch.isVerified !== undefined) {
        currentUser.isVerified = Boolean(patch.isVerified);
      }

      return { ...currentUser };
    }),
  },
  otpVerification: {
    create: jest.fn().mockImplementation(async ({ data }) => ({
      id: `otp-${Math.random().toString(36).slice(2, 8)}`,
      email: data.email,
      code: data.code,
      type: data.type,
      expiresAt: data.expiresAt,
      used: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    update: jest.fn().mockResolvedValue(undefined),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  listing: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const cloudinaryMock = {
  uploadImage: jest
    .fn()
    .mockImplementation(async (_buffer, folder?: string) => {
      const uploadFolder = folder || 'cho-sinh-vien/listings';
      return {
        url: `https://res.cloudinary.com/demo/image/upload/${uploadFolder}/sample.jpg`,
        publicId: `${uploadFolder}/sample`,
      };
    }),
  destroyImage: jest.fn().mockResolvedValue(undefined),
};

const mailServiceMock = {
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
};

type HealthResponseBody = {
  status?: string;
  details?: {
    database?: {
      status?: string;
    };
  };
};

describe('App e2e', () => {
  let app: INestApplication<App>;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    jest.setTimeout(20_000);
    process.env.NODE_ENV = 'test';
    process.env.SMTP_HOST = '';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_SECURE = 'false';
    process.env.SMTP_REQUIRE_TLS = 'false';
    process.env.SMTP_USER = '';
    process.env.SMTP_PASS = '';
    process.env.MAIL_FROM = '';
    process.env.JWT_SECRET = 'dev-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(CloudinaryService)
      .useValue(cloudinaryMock)
      .overrideProvider(MailService)
      .useValue(mailServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const jwtService = new JwtService({ secret: 'dev-secret' });
    userToken = jwtService.sign({ sub: 'user-1', role: 'USER' });
    adminToken = jwtService.sign({ sub: 'admin-1', role: 'ADMIN' });
  });

  beforeEach(() => {
    currentUser = createMockUser();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health', () => {
    it('/health (GET)', async () => {
      const response = await request(app.getHttpServer()).get('/health');
      const body = response.body as HealthResponseBody;

      expect([200, 503]).toContain(response.status);
      expect(body.status).toEqual(expect.any(String));
      expect(body.details?.database?.status).toEqual(expect.any(String));
    });

    it('/health/liveness (GET)', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/liveness')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
      });
    });

    it('/health/readiness (GET)', async () => {
      const response = await request(app.getHttpServer()).get(
        '/health/readiness',
      );
      const body = response.body as HealthResponseBody;

      expect([200, 503]).toContain(response.status);
      expect(body.status).toEqual(expect.any(String));
      expect(body.details?.database?.status).toEqual(expect.any(String));
    });
  });

  describe('auth register', () => {
    it('POST /auth/register should return 201 when OTP email send succeeds', async () => {
      mailServiceMock.sendOtpEmail.mockResolvedValueOnce(undefined);

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'register-success@example.com',
          password: 'password123',
          name: 'Register Success',
          studentId: 'SV1001',
          department: 'cntt',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        message: 'OTP sent successfully',
        email: 'register-success@example.com',
      });
    });

    it('POST /auth/register should return 503 when OTP email send fails', async () => {
      mailServiceMock.sendOtpEmail.mockRejectedValueOnce(
        new ServiceUnavailableException('Unable to send OTP email'),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'register-fail@example.com',
          password: 'password123',
          name: 'Register Fail',
          studentId: 'SV1002',
          department: 'cntt',
        })
        .expect(503);

      expect(response.body).toMatchObject({
        statusCode: 503,
        message: 'Unable to send OTP email',
      });
    });
  });

  describe('users access', () => {
    it('GET /users should return 401 without token', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });

    it('GET /users should return 403 for USER role', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('GET /users should return 200 for ADMIN role', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('POST /users should enforce 401/403/201 by role', async () => {
      const payload = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
        studentId: 'SV0099',
        department: 'cntt',
      };

      await request(app.getHttpServer())
        .post('/users')
        .send(payload)
        .expect(401);

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .send(payload)
        .expect(403);

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)
        .expect(201);
    });

    it('PATCH /users/me should return 401 without token', async () => {
      await request(app.getHttpServer())
        .patch('/users/me')
        .send({ name: 'User Updated' })
        .expect(401);
    });

    it('PATCH /users/me should update name and department', async () => {
      const response = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'User Updated',
          department: 'marketing',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'user-1',
        name: 'User Updated',
        department: 'marketing',
      });
    });

    it('PATCH /users/me should return 400 for invalid department', async () => {
      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          department: 'invalid-department',
        })
        .expect(400);
    });

    it('PATCH /users/me should clear avatar with avatar:null', async () => {
      currentUser.avatarUrl =
        'https://res.cloudinary.com/demo/image/upload/cho-sinh-vien/avatars/old.jpg';
      currentUser.avatarPublicId = 'cho-sinh-vien/avatars/old';

      const response = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ avatar: null })
        .expect(200);

      expect(response.body.avatar).toBeNull();
      expect(cloudinaryMock.destroyImage).toHaveBeenCalledWith(
        'cho-sinh-vien/avatars/old',
      );
    });

    it('PATCH /users/me should replace avatar and destroy old publicId', async () => {
      currentUser.avatarUrl =
        'https://res.cloudinary.com/demo/image/upload/cho-sinh-vien/avatars/old.jpg';
      currentUser.avatarPublicId = 'cho-sinh-vien/avatars/old';

      const response = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          avatar: {
            url: 'https://res.cloudinary.com/demo/image/upload/cho-sinh-vien/avatars/new.jpg',
            publicId: 'cho-sinh-vien/avatars/new',
          },
        })
        .expect(200);

      expect(response.body.avatar).toBe(
        'https://res.cloudinary.com/demo/image/upload/cho-sinh-vien/avatars/new.jpg',
      );
      expect(cloudinaryMock.destroyImage).toHaveBeenCalledWith(
        'cho-sinh-vien/avatars/old',
      );
    });
  });

  describe('listings approvalStatus access', () => {
    it('GET /listings?approvalStatus=pending should return 403 for anonymous', async () => {
      await request(app.getHttpServer())
        .get('/listings?approvalStatus=pending')
        .expect(403);
    });

    it('GET /listings?approvalStatus=pending should return 403 for USER role', async () => {
      await request(app.getHttpServer())
        .get('/listings?approvalStatus=pending')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('GET /listings?approvalStatus=pending should return 200 for ADMIN role', async () => {
      const response = await request(app.getHttpServer())
        .get('/listings?approvalStatus=pending')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        data: expect.any(Array),
        meta: expect.objectContaining({
          total: expect.any(Number),
        }),
      });
    });
  });

  describe('uploads', () => {
    it('POST /uploads/images should return 201 for valid image', async () => {
      const response = await request(app.getHttpServer())
        .post('/uploads/images')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('files', Buffer.from('fake-image-content'), {
          filename: 'image.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        data: [
          {
            url: expect.any(String),
            publicId: expect.any(String),
          },
        ],
      });
    });

    it('POST /uploads/images should return 400 for invalid mime type', async () => {
      await request(app.getHttpServer())
        .post('/uploads/images')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('files', Buffer.from('not-image'), {
          filename: 'file.txt',
          contentType: 'text/plain',
        })
        .expect(400);
    });

    it('POST /uploads/images should return 413 for oversized file', async () => {
      const tooLargeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, 1);

      await request(app.getHttpServer())
        .post('/uploads/images')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('files', tooLargeBuffer, {
          filename: 'large.jpg',
          contentType: 'image/jpeg',
        })
        .expect(413);
    });

    it('POST /uploads/avatar should return 201 for valid image', async () => {
      const response = await request(app.getHttpServer())
        .post('/uploads/avatar')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', Buffer.from('fake-avatar-content'), {
          filename: 'avatar.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        data: {
          url: expect.any(String),
          publicId: expect.any(String),
        },
      });
    });

    it('POST /uploads/avatar should return 400 for invalid mime type', async () => {
      await request(app.getHttpServer())
        .post('/uploads/avatar')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', Buffer.from('not-image'), {
          filename: 'avatar.txt',
          contentType: 'text/plain',
        })
        .expect(400);
    });

    it('POST /uploads/avatar should return 413 for oversized file', async () => {
      const tooLargeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, 1);

      await request(app.getHttpServer())
        .post('/uploads/avatar')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', tooLargeBuffer, {
          filename: 'avatar-large.jpg',
          contentType: 'image/jpeg',
        })
        .expect(413);
    });
  });
});
