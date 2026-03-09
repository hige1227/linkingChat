import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '1033', 10),
      secure: false,
      ...(process.env.SMTP_USER
        ? {
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          }
        : {}),
    });
  }

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    const html = this.renderTemplate('verify-email', {
      code,
      expiresIn: '15 分钟',
    });
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM || '"LinkingChat" <noreply@linkingchat.com>',
      to: email,
      subject: '验证您的邮箱 - LinkingChat',
      html,
    });
    this.logger.log(`Verification email sent to ${email}`);
  }

  async sendPasswordResetEmail(email: string, code: string): Promise<void> {
    const html = this.renderTemplate('reset-password', {
      code,
      expiresIn: '15 分钟',
    });
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM || '"LinkingChat" <noreply@linkingchat.com>',
      to: email,
      subject: '重置密码 - LinkingChat',
      html,
    });
    this.logger.log(`Password reset email sent to ${email}`);
  }

  private renderTemplate(
    templateName: string,
    variables: Record<string, string>,
  ): string {
    const templatePath = path.join(
      __dirname,
      'templates',
      `${templateName}.html`,
    );
    try {
      let html = fs.readFileSync(templatePath, 'utf-8');
      for (const [key, value] of Object.entries(variables)) {
        html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
      return html;
    } catch {
      // Fallback if template file not found
      this.logger.warn(`Template ${templateName} not found, using inline`);
      return this.getInlineTemplate(templateName, variables);
    }
  }

  private getInlineTemplate(
    name: string,
    vars: Record<string, string>,
  ): string {
    if (name === 'verify-email') {
      return `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#1976D2;">验证您的邮箱 - LinkingChat</h2>
          <p>请使用以下验证码完成邮箱验证：</p>
          <div style="background:#f5f5f5;padding:20px;text-align:center;border-radius:8px;margin:20px 0;">
            <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1976D2;">${vars.code}</span>
          </div>
          <p>验证码有效期 ${vars.expiresIn}。如非本人操作，请忽略此邮件。</p>
          <p style="color:#999;font-size:12px;">LinkingChat Team</p>
        </div>`;
    }
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1976D2;">重置密码 - LinkingChat</h2>
        <p>您正在重置 LinkingChat 账号密码。请使用以下验证码：</p>
        <div style="background:#f5f5f5;padding:20px;text-align:center;border-radius:8px;margin:20px 0;">
          <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1976D2;">${vars.code}</span>
        </div>
        <p>验证码有效期 ${vars.expiresIn}。如非本人操作，请忽略此邮件。</p>
        <p style="color:#999;font-size:12px;">LinkingChat Team</p>
      </div>`;
  }
}
