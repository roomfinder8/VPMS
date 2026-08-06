import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

export interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailMessage {
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Attachment[];
}

let cached: Transporter | null = null;

/**
 * Gmail SMTP.
 *
 * The password must be a Google App Password, not the account password -
 * Google stopped accepting the latter for SMTP. App Passwords are shown as
 * four groups of four characters, and people paste them with the spaces
 * intact, so strip whitespace rather than failing with an opaque auth error.
 */
export function getTransporter(): Transporter {
  if (cached) return cached;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

  if (!user || !pass) {
    throw new Error(
      "Gmail is not configured — set GMAIL_USER and GMAIL_APP_PASSWORD",
    );
  }

  cached = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return cached;
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

/** Confirms the credentials work without sending anything. */
export async function verifyMail(): Promise<void> {
  await getTransporter().verify();
}

export async function sendMail(message: MailMessage): Promise<string> {
  const from = process.env.MAIL_FROM_NAME
    ? `"${process.env.MAIL_FROM_NAME}" <${process.env.GMAIL_USER}>`
    : process.env.GMAIL_USER!;

  const info = await getTransporter().sendMail({
    from,
    to: message.to.join(", "),
    cc: message.cc?.length ? message.cc.join(", ") : undefined,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments: message.attachments,
  });

  return info.messageId;
}
