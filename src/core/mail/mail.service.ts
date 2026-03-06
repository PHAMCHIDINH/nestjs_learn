import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly fromAddress: string | null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const portValue = this.configService.get<string>('SMTP_PORT', '587').trim();
    const secure =
      this.configService.get<string>('SMTP_SECURE', 'false') === 'true';
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const pass = this.configService.get<string>('SMTP_PASS')?.trim();
    const from = this.configService.get<string>('SMTP_FROM')?.trim();

    if (!host || !from) {
      this.transporter = null;
      this.fromAddress = null;
      this.logger.warn(
        'SMTP is not configured. OTP email delivery is disabled.',
      );
      return;
    }

    const port = Number(portValue);
    if (!Number.isFinite(port)) {
      this.transporter = null;
      this.fromAddress = null;
      this.logger.error(
        'SMTP_PORT is invalid. OTP email delivery is disabled.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
    this.fromAddress = from;
  }

  async onModuleInit() {
    if (!this.transporter) {
      return;
    }

    try {
      await this.transporter.verify();
      this.logger.log('SMTP transport is ready.');
    } catch (error) {
      this.logger.error(
        'SMTP connection verification failed.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async sendOtpEmail(toEmail: string, otpCode: string) {
    if (!this.transporter || !this.fromAddress) {
      throw new InternalServerErrorException('SMTP is not configured');
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: toEmail,
        subject: 'OTP Verification Code',
        text: `Your OTP code is: ${otpCode}. This code expires in 10 minutes.`,
        html: `<p>Your OTP code is: <strong>${otpCode}</strong></p><p>This code expires in 10 minutes.</p>`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send OTP email to ${toEmail}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Unable to send OTP email');
    }
  }
}
