/**
 * Outgoing email via Gmail SMTP (nodemailer).
 *
 * Env (never hardcode, never commit):
 *   SMTP_USER / GMAIL_USER — the Gmail address that sends the mail
 *                        (e.g. the app's own Gmail account).
 *   SMTP_APP_PASSWORD / GMAIL_APP_PASSWORD — a Gmail *app password*
 *                        for that account (Google Account → Security →
 *                        2-Step Verification → App passwords). This is
 *                        NOT the Gmail login password. The user supplies
 *                        it later via Secure Vault; until then sending
 *                        fails with a clear MailNotConfiguredError and
 *                        the signup UI tells the user email sending is
 *                        not configured yet. SMTP_* wins when both are
 *                        set; GMAIL_* is the alias the owner already
 *                        uses in Vercel (same names as the expense
 *                        tracker).
 *
 * The transport is injectable so tests never touch the network: pass a
 * stub `{ sendMail }` and assert on what it received. In production the
 * default transport is a fresh nodemailer Gmail transport (created
 * lazily per send — serverless-safe, no shared connection to go stale).
 */
import nodemailer from "nodemailer";
import type { SendMailOptions, Transporter } from "nodemailer";
import { OTP_EXPIRY_SECONDS } from "./otp";

/** Thrown when SMTP_USER / SMTP_APP_PASSWORD are not set. */
export class MailNotConfiguredError extends Error {
  constructor() {
    super(
      "Email sending is not configured: SMTP_USER (or GMAIL_USER) / SMTP_APP_PASSWORD (or GMAIL_APP_PASSWORD) are missing.",
    );
    this.name = "MailNotConfiguredError";
  }
}

/** Minimal transport shape: the real nodemailer Transporter satisfies it. */
export interface MailTransport {
  sendMail(message: SendMailOptions): Promise<unknown>;
}

/** SMTP_* wins; GMAIL_* is the alias the owner already uses in Vercel. */
export function mailUser(): string | undefined {
  return process.env.SMTP_USER || process.env.GMAIL_USER;
}

/** SMTP_* wins; GMAIL_* is the alias the owner already uses in Vercel. */
export function mailPass(): string | undefined {
  return process.env.SMTP_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
}

export function isMailConfigured(): boolean {
  return Boolean(mailUser() && mailPass());
}

function createGmailTransport(): Transporter {
  const user = mailUser();
  const pass = mailPass();
  if (!user || !pass) throw new MailNotConfiguredError();
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

export interface OtpEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Burmese-first signup OTP email, SharedRide brand. The code is the
 * most prominent thing in the message; expiry (10 minutes) and the
 * "ignore this if it wasn't you" note are in both text and HTML.
 */
export function buildSignupOtpEmail(email: string, otp: string): OtpEmail {
  const minutes = Math.round(OTP_EXPIRY_SECONDS / 60);
  const subject = `SharedRide အတည်ပြုကုဒ်: ${otp}`;
  const text =
    `မင်္ဂလာပါ!\n\n` +
    `SharedRide အကောင့်ဖွင့်ရန် သင့်အတည်ပြုကုဒ် (OTP) မှာ —\n\n` +
    `${otp}\n\n` +
    `ဒီကုဒ်ဟာ ${minutes} မိနစ်အတွင်းသာ အကျုံးဝင်ပါတယ်။ အကောင့်ဖွင့်တဲ့ စာမျက်နှာမှာ ဒီကုဒ်ကို ရိုက်ထည့်ပါ။\n\n` +
    `သင်ကိုယ်တိုင် မတောင်းဆိုခဲ့ဘူးဆိုရင် ဒီအီးမေးလ်ကို လျစ်လျူရှုလိုက်ပါ။\n\n` +
    `— SharedRide (Innovix SharedRide Myanmar)`;
  const html = `<!doctype html>
<html lang="my"><body style="margin:0;padding:0;background:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1E4927;">
<div style="max-width:480px;margin:0 auto;padding:32px 24px;">
<div style="font-size:22px;font-weight:700;color:#1E4927;">SharedRide</div>
<p style="font-size:15px;line-height:1.6;margin:24px 0 8px;">မင်္ဂလာပါ!</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 8px;">SharedRide အကောင့်ဖွင့်ရန် သင့်အတည်ပြုကုဒ် (OTP) မှာ —</p>
<div style="font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;color:#1E4927;background:#C5EDCB;border-radius:12px;padding:20px 12px;margin:20px 0;">${otp}</div>
<p style="font-size:14px;line-height:1.6;margin:0 0 8px;">ဒီကုဒ်ဟာ <strong>${minutes} မိနစ်</strong>အတွင်းသာ အကျုံးဝင်ပါတယ်။ အကောင့်ဖွင့်တဲ့ စာမျက်နှာမှာ ဒီကုဒ်ကို ရိုက်ထည့်ပါ။</p>
<p style="font-size:13px;line-height:1.6;color:#1E4927;opacity:0.7;margin:16px 0 0;">သင်ကိုယ်တိုင် မတောင်းဆိုခဲ့ဘူးဆိုရင် ဒီအီးမေးလ်ကို လျစ်လျူရှုလိုက်ပါ။</p>
<p style="font-size:13px;line-height:1.6;color:#1E4927;opacity:0.7;margin:8px 0 0;">— SharedRide (Innovix SharedRide Myanmar)</p>
</div></body></html>`;
  return { to: email, subject, text, html };
}

/**
 * Send the signup OTP email. Throws MailNotConfiguredError when the
 * SMTP env vars are missing (callers turn that into a clear 503 +
 * "email sending is not configured yet" message, never a crash).
 * Pass a stub transport in tests — no network is touched then.
 */
export async function sendSignupOtpEmail(
  email: string,
  otp: string,
  transport?: MailTransport,
): Promise<void> {
  const mail = buildSignupOtpEmail(email, otp);
  const sender: MailTransport =
    transport ?? (createGmailTransport() as MailTransport);
  await sender.sendMail({
    from: mailUser() ? `"SharedRide" <${mailUser()}>` : "SharedRide",
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}
