import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

type MailSendContext = { requestId?: string };
type MailProvider = 'smtp' | 'resend';
type OtpDeliveryMode = 'email' | 'manual';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly otpDeliveryMode: OtpDeliveryMode;
  private readonly configuredMailProvider: string;
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
  private readonly resendApiKey: string | null;
  private readonly resendApiBaseUrl: string;
  private readonly fromAddress: string | null;
  private readonly isProduction: boolean;
  private readonly smtpFailFast: boolean;
  private readonly smtpVerifyOnStartup: boolean;
  private readonly activeProvider: MailProvider | null;
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.otpDeliveryMode = this.parseOtpDeliveryMode(
      this.configService.get<string>('OTP_DELIVERY_MODE', 'email'),
    );
    this.configuredMailProvider = (
      this.configService.get<string>('MAIL_PROVIDER', 'auto') ?? 'auto'
    )
      .trim()
      .toLowerCase();
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
    this.resendApiKey =
      this.configService.get<string>('RESEND_API_KEY')?.trim() ?? null;
    this.resendApiBaseUrl =
      this.configService.get<string>(
        'RESEND_API_BASE_URL',
        'https://api.resend.com',
      ) ?? 'https://api.resend.com';
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
    this.activeProvider = this.resolveProvider();
  }

  async onModuleInit() {
    if (this.isManualOtpDelivery()) {
      this.logger.warn(
        'OTP delivery is running in manual mode (OTP_DELIVERY_MODE=manual). Email sending is disabled and OTP codes will be returned to the client.',
      );
      return;
    }

    if (!this.isMailConfigured()) {
      const message =
        'Mail provider is not configured. OTP email delivery is disabled.';

      if (this.isProduction) {
        this.logger.error(
          `${message} Missing: ${this.getMissingConfigKeys().join(', ')}`,
        );
        throw new Error('Mail service is required in production');
      }

      this.logger.warn(message);
      return;
    }

    if (this.activeProvider === 'resend') {
      this.logger.log('Using Resend mail provider.');
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
    if (this.isManualOtpDelivery()) {
      this.logger.warn(
        `Skipping OTP email send because OTP_DELIVERY_MODE=manual to=${this.normalizeLogValue(toEmail)}`,
      );
      return;
    }

    const requestId = this.normalizeLogValue(context?.requestId ?? 'unknown');

    try {
      if (this.activeProvider === 'resend') {
        await this.sendViaResend(toEmail, otpCode);
        return;
      }

      if (!this.transporter || !this.fromAddress) {
        throw new ServiceUnavailableException('Email service is unavailable');
      }

      await this.transporter.sendMail({
        from: this.fromAddress,
        to: toEmail,
        subject: 'OTP Verification Code',
        text: `Your OTP code is: ${otpCode}. This code expires in 10 minutes.`,
        html: `<p>Your OTP code is: <strong>${otpCode}</strong></p><p>This code expires in 10 minutes.</p>`,
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      const providerMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const provider = this.activeProvider ?? 'unknown';

      this.logger.error(
        `Failed to send OTP email provider=${provider} requestId=${requestId} providerMessage=${this.normalizeLogValue(
          providerMessage,
        )} to=${this.normalizeLogValue(toEmail)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('Unable to send OTP email');
    }
  }

  private isMailConfigured(): boolean {
    if (this.isManualOtpDelivery()) {
      return true;
    }

    if (!this.fromAddress || !this.activeProvider) {
      return false;
    }

    if (this.activeProvider === 'resend') {
      return Boolean(this.resendApiKey);
    }

    if (!this.smtpHost) {
      return false;
    }

    if ((this.smtpUser && !this.smtpPass) || (!this.smtpUser && this.smtpPass)) {
      return false;
    }

    return true;
  }

  private getMissingConfigKeys(): string[] {
    const missing: string[] = [];

    if (this.isManualOtpDelivery()) {
      return missing;
    }

    if (!this.activeProvider) {
      if (this.configuredMailProvider === 'resend') {
        missing.push('RESEND_API_KEY');
      } else if (this.configuredMailProvider === 'smtp') {
        missing.push('SMTP_HOST');
      } else {
        missing.push('RESEND_API_KEY or SMTP_HOST');
      }
    } else if (this.activeProvider === 'resend') {
      if (!this.resendApiKey) {
        missing.push('RESEND_API_KEY');
      }
    } else {
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
    }

    if (!this.fromAddress) {
      missing.push('MAIL_FROM');
    }

    return missing;
  }

  private resolveProvider(): MailProvider | null {
    if (this.configuredMailProvider === 'resend') {
      return this.resendApiKey ? 'resend' : null;
    }

    if (this.configuredMailProvider === 'smtp') {
      return this.smtpHost ? 'smtp' : null;
    }

    if (this.resendApiKey) {
      return 'resend';
    }

    if (this.smtpHost) {
      return 'smtp';
    }

    return null;
  }

  isManualOtpDelivery(): boolean {
    return this.otpDeliveryMode === 'manual';
  }

  private async sendViaResend(toEmail: string, otpCode: string): Promise<void> {
    if (!this.resendApiKey || !this.fromAddress) {
      throw new ServiceUnavailableException('Email service is unavailable');
    }

    const response = await fetch(`${this.resendApiBaseUrl}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: [toEmail],
        subject: 'OTP Verification Code',
        text: `Your OTP code is: ${otpCode}. This code expires in 10 minutes.`,
        html: `<p>Your OTP code is: <strong>${otpCode}</strong></p><p>This code expires in 10 minutes.</p>`,
      }),
    });

    if (response.ok) {
      return;
    }

    const responseBody = await response.text();
    throw new Error(
      `Resend HTTP ${response.status} body=${this.normalizeLogValue(responseBody)}`,
    );
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

    return nodemailer.createTransport(transportOptions as any);
  }

  private parseBoolean(value?: string): boolean {
    const normalized = value?.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }

  private parseOtpDeliveryMode(value?: string): OtpDeliveryMode {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'manual') {
      return 'manual';
    }
    if (!normalized || normalized === 'email') {
      return 'email';
    }

    this.logger.warn(
      `Invalid OTP_DELIVERY_MODE value=${this.normalizeLogValue(value ?? '')}. Falling back to email.`,
    );
    return 'email';
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
    } catch {
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
