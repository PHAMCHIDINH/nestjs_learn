import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

type MailSendContext = { requestId?: string };

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly smtpHost: string | null;
  private readonly smtpPort: number;
  private readonly smtpFamily: number | undefined;
  private readonly smtpSecure: boolean;
  private readonly smtpRequireTLS: boolean;
  private readonly smtpConnectionTimeout: number;
  private readonly smtpGreetingTimeout: number;
  private readonly smtpSocketTimeout: number;
  private readonly smtpDnsTimeout: number;
  private readonly smtpUser: string | null;
  private readonly smtpPass: string | null;
  private readonly fromAddress: string | null;
  private readonly isProduction: boolean;
  private readonly smtpFailFast: boolean;
  private readonly smtpVerifyOnStartup: boolean;
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.smtpHost = this.configService.get<string>('SMTP_HOST')?.trim() ?? null;
    this.smtpPort = this.parseNumber(
      this.configService.get<string>('SMTP_PORT', '587'),
      587,
    );
    this.smtpFamily = this.parseFamily(
      this.configService.get<string>('SMTP_FAMILY'),
    );
    this.smtpSecure = this.parseBoolean(
      this.configService.get<string>('SMTP_SECURE', 'false'),
    );
    this.smtpRequireTLS = this.parseBoolean(
      this.configService.get<string>('SMTP_REQUIRE_TLS', 'false'),
    );
    this.smtpConnectionTimeout = this.parseNumber(
      this.configService.get<string>('SMTP_CONNECTION_TIMEOUT', '10000'),
      10000,
    );
    this.smtpGreetingTimeout = this.parseNumber(
      this.configService.get<string>('SMTP_GREETING_TIMEOUT', '10000'),
      10000,
    );
    this.smtpSocketTimeout = this.parseNumber(
      this.configService.get<string>('SMTP_SOCKET_TIMEOUT', '15000'),
      15000,
    );
    this.smtpDnsTimeout = this.parseNumber(
      this.configService.get<string>('SMTP_DNS_TIMEOUT', '10000'),
      10000,
    );
    this.smtpUser = this.configService.get<string>('SMTP_USER')?.trim() ?? null;
    this.smtpPass = this.configService.get<string>('SMTP_PASS')?.trim() ?? null;
    this.fromAddress = this.configService.get<string>('MAIL_FROM')?.trim() ?? null;
    this.isProduction =
      this.configService.get<string>(
        'NODE_ENV',
        process.env.NODE_ENV ?? 'development',
      ) ===
      'production';
    this.smtpFailFast = this.parseBoolean(
      this.configService.get<string>('SMTP_FAIL_FAST', 'false'),
    );
    this.smtpVerifyOnStartup = this.parseBoolean(
      this.configService.get<string>('SMTP_VERIFY_ON_STARTUP', 'false'),
    );
  }

  async onModuleInit() {
    if (!this.isMailConfigured()) {
      const message =
        'SMTP mail provider is not configured. OTP email delivery is disabled.';

      if (this.isProduction) {
        this.logger.error(
          `${message} Missing: ${this.getMissingConfigKeys().join(', ')}`,
        );
        throw new Error('Mail service is required in production');
      }

      this.logger.warn(message);
      return;
    }

    try {
      this.transporter = this.createTransporter();

      if (!this.smtpVerifyOnStartup) {
        this.logger.log(
          'Skipping SMTP verify at startup (SMTP_VERIFY_ON_STARTUP=false).',
        );
        return;
      }

      await this.verifyProvider();
      this.logger.log('SMTP mail provider is ready.');
    } catch (error) {
      this.logger.error(
        'SMTP provider verification failed.',
        error instanceof Error ? error.stack : undefined,
      );

      this.transporter = null;

      if (this.isProduction && this.smtpFailFast) {
        throw new Error('SMTP provider verification failed at startup');
      }

      this.logger.warn(
        'SMTP is unavailable at startup. Application will continue, but OTP email delivery is disabled until SMTP recovers.',
      );
    }
  }

  async sendOtpEmail(
    toEmail: string,
    otpCode: string,
    context?: MailSendContext,
  ) {
    if (!this.transporter || !this.fromAddress) {
      throw new ServiceUnavailableException('Email service is unavailable');
    }

    const requestId = this.normalizeLogValue(context?.requestId ?? 'unknown');

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: toEmail,
        subject: 'OTP Verification Code',
        text: `Your OTP code is: ${otpCode}. This code expires in 10 minutes.`,
        html: `<p>Your OTP code is: <strong>${otpCode}</strong></p><p>This code expires in 10 minutes.</p>`,
      });
    } catch (error) {
      const providerMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Failed to send OTP email provider=smtp requestId=${requestId} providerMessage=${this.normalizeLogValue(
          providerMessage,
        )} to=${this.normalizeLogValue(toEmail)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('Unable to send OTP email');
    }
  }

  private isMailConfigured(): boolean {
    if (!this.smtpHost || !this.fromAddress) {
      return false;
    }

    // Require complete credentials only when one side is provided.
    if ((this.smtpUser && !this.smtpPass) || (!this.smtpUser && this.smtpPass)) {
      return false;
    }

    return true;
  }

  private getMissingConfigKeys(): string[] {
    const missing: string[] = [];
    if (!this.smtpHost) {
      missing.push('SMTP_HOST');
    }
    if ((this.smtpUser && !this.smtpPass) || (!this.smtpUser && this.smtpPass)) {
      if (!this.smtpUser) {
        missing.push('SMTP_USER');
      }
      if (!this.smtpPass) {
        missing.push('SMTP_PASS');
      }
    }
    if (!this.fromAddress) {
      missing.push('MAIL_FROM');
    }
    return missing;
  }

  private async verifyProvider(): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP transporter is not initialized');
    }

    await this.transporter.verify();
  }

  private createTransporter() {
    if (!this.smtpHost) {
      throw new Error('Missing SMTP_HOST');
    }

    const transportOptions = {
      host: this.smtpHost,
      port: this.smtpPort,
      family: this.smtpFamily,
      secure: this.smtpSecure,
      requireTLS: this.smtpRequireTLS,
      connectionTimeout: this.smtpConnectionTimeout,
      greetingTimeout: this.smtpGreetingTimeout,
      socketTimeout: this.smtpSocketTimeout,
      dnsTimeout: this.smtpDnsTimeout,
      auth:
        this.smtpUser && this.smtpPass
          ? {
              user: this.smtpUser,
              pass: this.smtpPass,
            }
          : undefined,
    };

    // nodemailer v8 typings can pick a generic transport overload here; force SMTP options.
    return nodemailer.createTransport(transportOptions as any);
  }

  private parseBoolean(value?: string): boolean {
    const normalized = value?.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }

  private parseNumber(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }

    const parsed = Number(value);
    try {
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('Invalid number');
      }
      return parsed;
    } catch (error) {
      this.logger.warn(
        `Invalid SMTP_PORT value=${this.normalizeLogValue(value)}. Falling back to ${fallback}.`,
      );
      return fallback;
    }
  }

  private parseFamily(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = Number(value);
    if (parsed === 4 || parsed === 6) {
      return parsed;
    }

    this.logger.warn(
      `Invalid SMTP_FAMILY value=${this.normalizeLogValue(value)}. Expected 4 or 6. Ignoring.`,
    );
    return undefined;
  }

  private normalizeLogValue(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }
}
