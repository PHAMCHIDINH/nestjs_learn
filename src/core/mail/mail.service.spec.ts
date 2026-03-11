import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(),
  },
}));

type EnvMap = Record<string, string | undefined>;

const createConfigService = (env: EnvMap): ConfigService =>
  ({
    get: jest.fn((key: string, defaultValue?: string) => {
      const value = env[key];
      if (typeof value === 'string') {
        return value;
      }
      return defaultValue;
    }),
  }) as unknown as ConfigService;

describe('MailService', () => {
  const createTransportMock = nodemailer.createTransport as jest.Mock;
  const fetchMock = jest.fn();

  beforeEach(() => {
    createTransportMock.mockReset();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.restoreAllMocks();
  });

  it('sends OTP email successfully with SMTP', async () => {
    const verifyMock = jest.fn().mockResolvedValue(true);
    const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'smtp_1' });

    createTransportMock.mockReturnValue({
      verify: verifyMock,
      sendMail: sendMailMock,
    });

    const service = new MailService(
      createConfigService({
        NODE_ENV: 'production',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_FAMILY: '4',
        SMTP_VERIFY_ON_STARTUP: 'true',
        SMTP_SECURE: 'false',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'app-password',
        MAIL_FROM: 'Cho Sinh Vien <no-reply@example.com>',
      }),
    );

    await service.onModuleInit();
    await service.sendOtpEmail('student@example.com', '123456', {
      requestId: 'req-1',
    });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        family: 4,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        dnsTimeout: 10000,
      }),
    );
    expect(verifyMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Cho Sinh Vien <no-reply@example.com>',
        to: 'student@example.com',
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses Resend automatically when RESEND_API_KEY is configured', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(''),
    });

    const service = new MailService(
      createConfigService({
        NODE_ENV: 'production',
        RESEND_API_KEY: 're_test_key',
        MAIL_FROM: 'Cho Sinh Vien <no-reply@example.com>',
      }),
    );

    await service.onModuleInit();
    await service.sendOtpEmail('student@example.com', '654321', {
      requestId: 'req-2',
    });

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_key',
        }),
      }),
    );
  });

  it('skips mail provider setup entirely in manual OTP mode', async () => {
    const service = new MailService(
      createConfigService({
        NODE_ENV: 'production',
        OTP_DELIVERY_MODE: 'manual',
      }),
    );

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    await expect(
      service.sendOtpEmail('student@example.com', '123456', {
        requestId: 'req-manual',
      }),
    ).resolves.toBeUndefined();

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.isManualOtpDelivery()).toBe(true);
  });

  it('throws 503 when Resend returns an error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: jest.fn().mockResolvedValue('forbidden'),
    });

    const service = new MailService(
      createConfigService({
        NODE_ENV: 'production',
        MAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_test_key',
        MAIL_FROM: 'no-reply@example.com',
      }),
    );

    await service.onModuleInit();

    await expect(
      service.sendOtpEmail('student@example.com', '123456', {
        requestId: 'req-3',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws 503 when SMTP provider returns an error', async () => {
    const verifyMock = jest.fn().mockResolvedValue(true);
    const sendMailMock = jest.fn().mockRejectedValue(new Error('smtp failure'));

    createTransportMock.mockReturnValue({
      verify: verifyMock,
      sendMail: sendMailMock,
    });

    const service = new MailService(
      createConfigService({
        NODE_ENV: 'test',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_VERIFY_ON_STARTUP: 'true',
        SMTP_SECURE: 'false',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'app-password',
        MAIL_FROM: 'no-reply@example.com',
      }),
    );

    await service.onModuleInit();

    await expect(
      service.sendOtpEmail('student@example.com', '123456', {
        requestId: 'req-4',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not crash startup in production when SMTP verify fails by default', async () => {
    const verifyMock = jest.fn().mockRejectedValue(new Error('connect timeout'));
    const sendMailMock = jest.fn();

    createTransportMock.mockReturnValue({
      verify: verifyMock,
      sendMail: sendMailMock,
    });

    const service = new MailService(
      createConfigService({
        NODE_ENV: 'production',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_VERIFY_ON_STARTUP: 'true',
        SMTP_SECURE: 'false',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'app-password',
        MAIL_FROM: 'no-reply@example.com',
      }),
    );

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    await expect(
      service.sendOtpEmail('student@example.com', '123456', {
        requestId: 'req-5',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails startup when SMTP_FAIL_FAST is true and verify fails', async () => {
    const verifyMock = jest.fn().mockRejectedValue(new Error('connect timeout'));
    const sendMailMock = jest.fn();

    createTransportMock.mockReturnValue({
      verify: verifyMock,
      sendMail: sendMailMock,
    });

    const service = new MailService(
      createConfigService({
        NODE_ENV: 'production',
        SMTP_FAIL_FAST: 'true',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_VERIFY_ON_STARTUP: 'true',
        SMTP_SECURE: 'false',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'app-password',
        MAIL_FROM: 'no-reply@example.com',
      }),
    );

    await expect(service.onModuleInit()).rejects.toThrow(
      'SMTP provider verification failed at startup',
    );
  });

  it('fails fast at startup in production when mail config is missing', async () => {
    const service = new MailService(
      createConfigService({
        NODE_ENV: 'production',
        SMTP_HOST: '',
        MAIL_FROM: '',
      }),
    );

    await expect(service.onModuleInit()).rejects.toThrow(
      'Mail service is required in production',
    );
  });

  it('skips SMTP verify at startup by default', async () => {
    const verifyMock = jest.fn().mockResolvedValue(true);
    const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'smtp_2' });

    createTransportMock.mockReturnValue({
      verify: verifyMock,
      sendMail: sendMailMock,
    });

    const service = new MailService(
      createConfigService({
        NODE_ENV: 'production',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'app-password',
        MAIL_FROM: 'no-reply@example.com',
      }),
    );

    await service.onModuleInit();
    expect(verifyMock).not.toHaveBeenCalled();
  });
});
