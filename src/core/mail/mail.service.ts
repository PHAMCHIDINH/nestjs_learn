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
  private readonly smtpSecure: boolean;
  private readonly smtpRequireTLS: boolean;
  private readonly smtpUser: string | null;
  private readonly smtpPass: string | null;
  private readonly fromAddress: string | null;
  private readonly isProduction: boolean;
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.smtpHost = this.configService.get<string>('SMTP_HOST')?.trim() ?? null;
    this.smtpPort = this.parseNumber(
      this.configService.get<string>('SMTP_PORT', '587'),
      587,
    );
    this.smtpSecure = this.parseBoolean(
      this.configService.get<string>('SMTP_SECURE', 'false'),
    );
    this.smtpRequireTLS = this.parseBoolean(
      this.configService.get<string>('SMTP_REQUIRE_TLS', 'false'),
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
      await this.verifyProvider();
      this.logger.log('SMTP mail provider is ready.');
    } catch (error) {
      this.logger.error(
        'SMTP provider verification failed.',
        error instanceof Error ? error.stack : undefined,
      );

      if (this.isProduction) {
        throw new Error('SMTP provider verification failed at startup');
      }
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

    return nodemailer.createTransport({
      host: this.smtpHost,
      port: this.smtpPort,
      secure: this.smtpSecure,
      requireTLS: this.smtpRequireTLS,
      auth:
        this.smtpUser && this.smtpPass
          ? {
              user: this.smtpUser,
              pass: this.smtpPass,
            }
          : undefined,
    });
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

  private normalizeLogValue(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }
}
