import nodemailer from "nodemailer";
import { Resend } from "resend";

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

type MailInput = {
  to: string;
  studentName?: string;
  lectureTitle: string;
  watchUrl: string;
};

function buildMessage(input: MailInput) {
  const greeting = input.studentName ? `Hi ${input.studentName},` : "Hi,";
  const text = [
    greeting,
    "",
    `Your lecture "${input.lectureTitle}" is ready.`,
    `Watch now: ${input.watchUrl}`,
    "",
    "If this was not expected, please contact your teacher.",
  ].join("\n");
  const html = `<p>${greeting}</p><p>Your lecture "<strong>${input.lectureTitle}</strong>" is ready.</p><p><a href="${input.watchUrl}">Watch now</a></p><p>If this was not expected, please contact your teacher.</p>`;

  return {
    subject: `Lecture Access: ${input.lectureTitle}`,
    text,
    html,
  };
}

async function sendWithSmtp(input: MailInput) {
  const host = getEnv("SMTP_HOST");
  const user = getEnv("SMTP_USER");
  const pass = getEnv("SMTP_PASS");
  if (!host || !user || !pass) {
    return null;
  }

  const port = Number(getEnv("SMTP_PORT") ?? "587");
  const secure = (getEnv("SMTP_SECURE") ?? "false").toLowerCase() === "true";
  const from = getEnv("SMTP_FROM") ?? getEnv("EMAIL_FROM") ?? user;
  const message = buildMessage(input);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from,
    to: input.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  return {
    messageId: info.messageId ?? null,
    raw: info,
    provider: "smtp" as const,
  };
}

async function sendWithResend(input: MailInput) {
  const resendApiKey = getEnv("RESEND_API_KEY");
  const from = getEnv("EMAIL_FROM");
  if (!resendApiKey || !from) {
    throw new Error(
      "No email provider configured. Set SMTP_* for Nodemailer, or RESEND_API_KEY + EMAIL_FROM."
    );
  }

  const resend = new Resend(resendApiKey);
  const message = buildMessage(input);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if ("error" in result && result.error) {
    throw new Error(result.error.message || "Resend failed to send email");
  }

  const messageId =
    ("data" in result && result.data?.id) ||
    ("id" in result ? result.id : null);

  return {
    messageId,
    raw: result,
    provider: "resend" as const,
  };
}

export async function sendLectureAccessEmail(input: MailInput) {
  const smtpResult = await sendWithSmtp(input);
  if (smtpResult) {
    return smtpResult;
  }
  return sendWithResend(input);
}
