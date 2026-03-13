import { ServiceUnavailableException } from '@nestjs/common';
import { Department, OtpType, User, UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

type OtpRecord = {
  id: string;
  email: string;
  code: string;
  type: OtpType;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
};

type DbState = {
  users: User[];
  otps: OtpRecord[];
};

const createUser = (overrides?: Partial<User>): User => ({
  id: 'user-1',
  email: 'user@example.com',
  studentId: 'SV0001',
  passwordHash: 'hash',
  name: 'Test User',
  avatarUrl: null,
  avatarPublicId: null,
  department: Department.CNTT,
  sellerRating: 0,
  totalReviews: 0,
  isVerified: false,
  isActive: true,
  role: UserRole.USER,
  lastSeen: null,
  isOnline: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const cloneState = (state: DbState): DbState => ({
  users: state.users.map((user) => ({
    ...user,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
    lastSeen: user.lastSeen ? new Date(user.lastSeen) : null,
  })),
  otps: state.otps.map((otp) => ({
    ...otp,
    createdAt: new Date(otp.createdAt),
    expiresAt: new Date(otp.expiresAt),
  })),
});

const createPrismaMock = (initialState: DbState) => {
  let state = cloneState(initialState);

  const transaction = async (callback: (tx: unknown) => Promise<unknown>) => {
    const working = cloneState(state);
    const tx = {
      user: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          if (!where) {
            return null;
          }
          return (
            working.users.find(
              (user) =>
                user.id === where.id ||
                user.email === where.email ||
                user.studentId === where.studentId,
            ) ?? null
          );
        }),
        create: jest.fn().mockImplementation(async ({ data }) => {
          const user = createUser({
            id: `user-${working.users.length + 1}`,
            email: data.email,
            studentId: data.studentId,
            passwordHash: data.passwordHash,
            name: data.name,
            department: data.department,
            isVerified: false,
          });
          working.users.push(user);
          return user;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const index = working.users.findIndex((user) => user.id === where.id);
          if (index < 0) {
            return null;
          }
          const next: User = {
            ...working.users[index],
            ...data,
            updatedAt: new Date(),
          };
          working.users[index] = next;
          return next;
        }),
      },
      otpVerification: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const otp: OtpRecord = {
            id: `otp-${working.otps.length + 1}`,
            email: data.email,
            code: data.code,
            type: data.type,
            expiresAt: data.expiresAt,
            used: false,
            createdAt: new Date(),
          };
          working.otps.push(otp);
          return otp;
        }),
      },
    };

    const result = await callback(tx);
    state = working;
    return result;
  };

  return {
    $transaction: jest.fn().mockImplementation(async (input: unknown) => {
      if (typeof input === 'function') {
        return transaction(input as (tx: unknown) => Promise<unknown>);
      }

      if (Array.isArray(input)) {
        return Promise.all(input as Promise<unknown>[]);
      }

      return undefined;
    }),
    getState: () => cloneState(state),
  };
};

const createMailServiceMock = (manual = false) => ({
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
  isManualOtpDelivery: jest.fn().mockReturnValue(manual),
});

const createConfigServiceMock = (nodeEnv = 'test') => ({
  getOrThrow: jest.fn().mockImplementation((key: string) => {
    switch (key) {
      case 'JWT_EXPIRES_IN':
        return '7d';
      case 'OTP_EXPIRES_MINUTES':
        return 5;
      case 'NODE_ENV':
        return nodeEnv;
      default:
        throw new Error(`Unexpected config key: ${key}`);
    }
  }),
});

describe('AuthService', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('register commits user and otp when email send succeeds', async () => {
    const prismaMock = createPrismaMock({ users: [], otps: [] });
    const mailServiceMock = createMailServiceMock(false);
    const configServiceMock = createConfigServiceMock();
    const authService = new AuthService(
      prismaMock as never,
      { sign: jest.fn() } as never,
      mailServiceMock as never,
      configServiceMock as never,
    );

    await authService.register(
      {
        email: 'student1@example.com',
        password: 'password123',
        name: 'Student One',
        studentId: 'SV1001',
        department: 'cntt',
      },
      'req-1',
    );

    const state = prismaMock.getState();
    expect(state.users).toHaveLength(1);
    expect(state.otps).toHaveLength(1);
    expect(mailServiceMock.sendOtpEmail).toHaveBeenCalledWith(
      'student1@example.com',
      expect.any(String),
      { requestId: 'req-1' },
    );
  });

  it('register keeps user and otp when email send fails after transaction commits', async () => {
    const prismaMock = createPrismaMock({ users: [], otps: [] });
    const mailServiceMock = createMailServiceMock(false);
    mailServiceMock.sendOtpEmail.mockRejectedValue(
      new ServiceUnavailableException('Unable to send OTP email'),
    );
    const configServiceMock = createConfigServiceMock();

    const authService = new AuthService(
      prismaMock as never,
      { sign: jest.fn() } as never,
      mailServiceMock as never,
      configServiceMock as never,
    );

    await expect(
      authService.register(
        {
          email: 'student2@example.com',
          password: 'password123',
          name: 'Student Two',
          studentId: 'SV1002',
          department: 'cntt',
        },
        'req-2',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const state = prismaMock.getState();
    expect(state.users).toHaveLength(1);
    expect(state.otps).toHaveLength(1);
  });

  it('resendOtp keeps otp when email send fails after transaction commits', async () => {
    const prismaMock = createPrismaMock({
      users: [
        createUser({
          id: 'user-existing',
          email: 'student3@example.com',
          studentId: 'SV1003',
          isVerified: false,
        }),
      ],
      otps: [],
    });
    const mailServiceMock = createMailServiceMock(false);
    mailServiceMock.sendOtpEmail.mockRejectedValue(
      new ServiceUnavailableException('Unable to send OTP email'),
    );
    const configServiceMock = createConfigServiceMock();

    const authService = new AuthService(
      prismaMock as never,
      { sign: jest.fn() } as never,
      mailServiceMock as never,
      configServiceMock as never,
    );

    await expect(
      authService.resendOtp(
        {
          email: 'student3@example.com',
        },
        'req-3',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const state = prismaMock.getState();
    expect(state.users).toHaveLength(1);
    expect(state.otps).toHaveLength(1);
  });

  it('register returns debugOtp and skips email in manual mode even in production', async () => {
    process.env.NODE_ENV = 'production';

    const prismaMock = createPrismaMock({ users: [], otps: [] });
    const mailServiceMock = createMailServiceMock(true);
    const configServiceMock = createConfigServiceMock('production');
    const authService = new AuthService(
      prismaMock as never,
      { sign: jest.fn() } as never,
      mailServiceMock as never,
      configServiceMock as never,
    );

    const result = await authService.register(
      {
        email: 'student4@example.com',
        password: 'password123',
        name: 'Student Four',
        studentId: 'SV1004',
        department: 'cntt',
      },
      'req-4',
    );

    expect(result.debugOtp).toMatch(/^\d{6}$/);
    expect(mailServiceMock.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('resendOtp returns debugOtp and skips email in manual mode even in production', async () => {
    process.env.NODE_ENV = 'production';

    const prismaMock = createPrismaMock({
      users: [
        createUser({
          id: 'user-manual',
          email: 'student5@example.com',
          studentId: 'SV1005',
          isVerified: false,
        }),
      ],
      otps: [],
    });
    const mailServiceMock = createMailServiceMock(true);
    const configServiceMock = createConfigServiceMock('production');
    const authService = new AuthService(
      prismaMock as never,
      { sign: jest.fn() } as never,
      mailServiceMock as never,
      configServiceMock as never,
    );

    const result = await authService.resendOtp(
      {
        email: 'student5@example.com',
      },
      'req-5',
    );

    expect(result.debugOtp).toMatch(/^\d{6}$/);
    expect(mailServiceMock.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('creates a short-lived socket token for realtime chat', () => {
    const prismaMock = createPrismaMock({ users: [], otps: [] });
    const mailServiceMock = createMailServiceMock(false);
    const configServiceMock = createConfigServiceMock();
    const signMock = jest.fn().mockReturnValue('socket-token');
    const authService = new AuthService(
      prismaMock as never,
      { sign: signMock } as never,
      mailServiceMock as never,
      configServiceMock as never,
    );

    const result = authService.createSocketToken({
      userId: 'user-socket',
      role: 'USER',
    });

    expect(result).toEqual({ token: 'socket-token' });
    expect(signMock).toHaveBeenCalledWith(
      {
        sub: 'user-socket',
        role: 'USER',
        tokenType: 'socket',
      },
      { expiresIn: '5m' },
    );
  });
});
