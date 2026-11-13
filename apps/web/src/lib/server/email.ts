import "server-only";

/**
 * Transactional email through Resend's REST API (no SDK, so no new dependency).
 * Needs RESEND_API_KEY and EMAIL_FROM (an address on a Resend-verified domain).
 * Never throws: callers get { sent: false, reason } so a mail problem can't undo the action.
 */
export const emailConfigured = () =>
  !!process.env.RESEND_API_KEY?.trim() && !!process.env.EMAIL_FROM?.trim();

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ sent: true } | { sent: false; reason: string }> {
  if (!emailConfigured())
    return { sent: false, reason: "Email is not configured on the server (RESEND_API_KEY / EMAIL_FROM)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM!.trim(), ...input }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => null))?.message;
      return { sent: false, reason: `Email service returned HTTP ${res.status}${detail ? `: ${detail}` : ""}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The invitation sent when an admin adds a user. The password is never emailed. */
export function invitationEmail(opts: { orgName: string; firstName: string; email: string; loginUrl: string; invitedBy?: string }) {
  const { orgName, firstName, email, loginUrl, invitedBy } = opts;
  const subject = `You've been invited to ${orgName} on NORIX`;
  const text = `Hi ${firstName},

${invitedBy ? `${invitedBy} has` : "An administrator has"} added you to ${orgName} on NORIX.

Sign in here: ${loginUrl}
Email: ${email}
Password: the one your administrator set for you. Ask them if you don't have it, then change it after your first sign-in.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#111">
<h2 style="margin:0 0 12px">You've been invited to ${esc(orgName)}</h2>
<p>Hi ${esc(firstName)},</p>
<p>${invitedBy ? `${esc(invitedBy)} has` : "An administrator has"} added you to <b>${esc(orgName)}</b> on NORIX.</p>
<p><a href="${esc(loginUrl)}" style="display:inline-block;background:#000;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Sign in to NORIX</a></p>
<p style="color:#555;font-size:14px">Email: <b>${esc(email)}</b><br>Password: the one your administrator set for you. Ask them if you don't have it, then change it after your first sign-in.</p>
</div>`;
  return { subject, text, html };
}
