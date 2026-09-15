// Server-only — sends the staff signup email verification code via Resend.
// Never import this from client code; RESEND_API_KEY is not a NEXT_PUBLIC_*
// var and won't be defined in the browser.
import { Resend } from "resend";

let cachedClient: Resend | undefined;

function getClient(): Resend {
  if (!cachedClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    cachedClient = new Resend(apiKey);
  }
  return cachedClient;
}

// The display name "Samnan" is what recipients see as the sender, even
// though the address itself is Resend's shared testing domain — sending
// from a custom address (e.g. verify@samnan.com) requires first verifying
// that domain in the Resend dashboard under Domains.
const FROM = "Samnan <onboarding@resend.dev>";

export async function sendSignupVerificationEmail(email: string, code: string): Promise<void> {
  // The Resend SDK returns { data, error } rather than throwing on an API
  // error (e.g. sending to an address it refuses in test mode) — awaiting
  // it alone would silently treat that as success.
  const { error } = await getClient().emails.send({
    from: FROM,
    to: email,
    subject: `Your Samnan verification code is ${code}`,
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 420px; margin: 0 auto; padding: 32px 24px; color: #1e293b;">
        <p style="font-size: 14px; color: #64748b; margin: 0 0 8px;">Samnan</p>
        <h1 style="font-size: 20px; margin: 0 0 16px;">Confirm your email</h1>
        <p style="font-size: 14px; line-height: 1.5; margin: 0 0 24px;">
          Use this code to confirm your email for your staff account request:
        </p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 0 0 24px; text-align: center;">
          ${code}
        </p>
        <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
          This code expires in 10 minutes. If you didn't request this, you can ignore this email.
        </p>
      </div>
    `,
  });
  if (error) throw new Error(error.message);
}

// Generic notification email — a complaint/ticket assignment or status
// change. Sent best-effort (see /api/notifications/send-email); a failure
// here should never block the underlying Firestore write from succeeding.
export async function sendNotificationEmail(email: string, subject: string, heading: string, body: string, link: string): Promise<void> {
  const { error } = await getClient().emails.send({
    from: FROM,
    to: email,
    subject,
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1e293b;">
        <p style="font-size: 14px; color: #64748b; margin: 0 0 8px;">Samnan</p>
        <h1 style="font-size: 20px; margin: 0 0 16px;">${heading}</h1>
        <p style="font-size: 14px; line-height: 1.5; margin: 0 0 24px;">${body}</p>
        <a href="${link}" style="display: inline-block; background: #385bc1; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 18px; border-radius: 6px;">
          View in Samnan
        </a>
      </div>
    `,
  });
  if (error) throw new Error(error.message);
}
