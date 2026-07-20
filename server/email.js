// Transactional email via Resend's HTTP API (no SDK - Node 18+ global fetch).
// Everything is gated on RESEND_API_KEY: with no key set, sends are a logged
// no-op, so local dev and un-configured deploys keep working and never crash a
// request. Set on Render:
//   RESEND_API_KEY  - from resend.com
//   EMAIL_FROM      - e.g. "Match Maid <hello@matchmaid.co.nz>" (verified domain)
//   APP_URL         - e.g. "https://matchmaid.co.nz" (for links in emails)
import { randomBytes } from 'node:crypto';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
// resend.dev only delivers to the account owner - fine for testing before the
// real domain is verified. Swap EMAIL_FROM to your domain address in prod.
const EMAIL_FROM = process.env.EMAIL_FROM || 'Match Maid <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL || 'https://matchmaid.co.nz';

export function emailEnabled() {
  return !!RESEND_API_KEY;
}

// A 6-digit numeric code. randomBytes (not Math.random) so it's unguessable.
export function makeCode() {
  return String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, '0');
}

// Fire-and-forget friendly: always resolves, never throws. Returns a small
// result object so callers can log, but a failed email must never fail the
// user-facing action that triggered it.
export async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set - skipped "${subject}" to ${to}`);
    return { skipped: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[email] send failed (${res.status}) "${subject}":`, detail);
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    console.error('[email] error sending', subject, err);
    return { ok: false, error: String(err) };
  }
}

// Shared shell so every email reads as one brand. Kept inline (no external CSS
// or images) so it renders the same in every client.
function shell(bodyHtml) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
    <div style="font-size:20px;font-weight:700;letter-spacing:-0.01em;color:#123b4a;margin-bottom:24px">Match&nbsp;Maid</div>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e6e6e6;margin:28px 0 16px" />
    <p style="font-size:12px;color:#8a8a8a;line-height:1.5;margin:0">Match Maid · Christchurch, NZ<br/>
      You're receiving this because someone used this address on matchmaid.co.nz.</p>
  </div>`;
}

// --- Email: confirm your address (signup verification) ---------------------
export async function sendVerificationEmail({ to, name, code }) {
  const hi = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  const html = shell(`
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">${hi}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">Welcome to Match Maid! Enter this code to confirm your email and finish setting up your account:</p>
    <div style="font-size:34px;font-weight:700;letter-spacing:0.28em;text-align:center;background:#f4f1ea;border:1px solid #e6e0d3;border-radius:12px;padding:20px 0;margin:0 0 20px;color:#123b4a">${escapeHtml(code)}</div>
    <p style="font-size:14px;line-height:1.6;color:#6a6a6a;margin:0">This code expires in 15 minutes. If you didn't create a Match Maid account, you can ignore this email.</p>`);
  const text = `${name ? name + ',\n\n' : ''}Welcome to Match Maid! Your confirmation code is ${code}. It expires in 15 minutes.`;
  return sendEmail({ to, subject: `${code} is your Match Maid confirmation code`, html, text });
}

// --- Email: you have a new enquiry (to the cleaner) ------------------------
export async function sendEnquiryEmail({ to, cleanerName, clientName, service, suburb, message }) {
  const hi = cleanerName ? `Hi ${escapeHtml(cleanerName)},` : 'Hi,';
  const bits = [service && `a <strong>${escapeHtml(service)}</strong>`, suburb && `in <strong>${escapeHtml(suburb)}</strong>`]
    .filter(Boolean).join(' ');
  const html = shell(`
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${hi}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Good news - <strong>${escapeHtml(clientName || 'a customer')}</strong> has sent you a new enquiry${bits ? ' for ' + bits : ''} on Match Maid. It's exclusively yours.</p>
    ${message ? `<blockquote style="margin:0 0 20px;padding:12px 16px;background:#f4f1ea;border-left:3px solid #14b8a6;border-radius:0 8px 8px 0;font-size:14px;line-height:1.6;color:#333">"${escapeHtml(message)}"</blockquote>` : ''}
    <p style="margin:0 0 8px"><a href="${APP_URL}/maid" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">Reply in your portal</a></p>
    <p style="font-size:13px;line-height:1.6;color:#8a8a8a;margin:16px 0 0">Replying quickly keeps you at the top of search results.</p>`);
  const text = `${cleanerName ? cleanerName + ',\n\n' : ''}${clientName || 'A customer'} has sent you a new enquiry${bits ? ' for ' + service + (suburb ? ' in ' + suburb : '') : ''} on Match Maid.${message ? '\n\n"' + message + '"' : ''}\n\nReply in your portal: ${APP_URL}/maid`;
  return sendEmail({ to, subject: `New Match Maid enquiry from ${clientName || 'a customer'}`, html, text });
}

// --- Email: your document was approved / declined (to the cleaner) ---------
const VERIF_LABEL = { id: 'ID', police: 'criminal check', insurance: 'insurance' };
const VERIF_BADGE = { id: 'ID verified', police: 'Criminal checked', insurance: 'Insured' };

export async function sendVerificationDecisionEmail({ to, name, type, approved }) {
  const hi = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  const what = VERIF_LABEL[type] || 'document';
  const badge = VERIF_BADGE[type] || 'verified';
  const html = approved
    ? shell(`
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${hi}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Your <strong>${escapeHtml(what)}</strong> has been approved. The <strong>${escapeHtml(badge)}</strong> badge is now showing on your Match Maid profile.</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">Verified profiles get chosen more often - customers can see at a glance who has been checked.</p>
    <p style="margin:0 0 8px"><a href="${APP_URL}/maid" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">View your profile</a></p>`)
    : shell(`
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${hi}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">We couldn't approve your <strong>${escapeHtml(what)}</strong> this time. Usually it's because the photo is blurry, cropped, or the details are hard to read.</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">Upload a clearer photo and we'll take another look - there's no limit on tries.</p>
    <p style="margin:0 0 8px"><a href="${APP_URL}/maid" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">Upload again</a></p>`);
  const greet = name ? `${name},\n\n` : '';
  const text = approved
    ? `${greet}Your ${what} has been approved and the "${badge}" badge is now on your Match Maid profile.\n\n${APP_URL}/maid`
    : `${greet}We couldn't approve your ${what} this time - usually a blurry or cropped photo. Upload a clearer one and we'll review it again.\n\n${APP_URL}/maid`;
  return sendEmail({
    to,
    subject: approved ? `Your ${what} is verified` : `Your ${what} needs another look`,
    html,
    text,
  });
}

// --- Email: a document is waiting for review (to the admin) ----------------
// Goes to ADMIN_EMAIL so there is no need to keep checking the admin page.
export async function sendVerificationPendingEmail({ to, cleanerName, cleanerEmail, type, hasSelfie }) {
  const what = VERIF_LABEL[type] || 'document';
  const html = shell(`
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px"><strong>${escapeHtml(cleanerName || 'A cleaner')}</strong> has uploaded ${escapeHtml(what === 'ID' ? 'an' : 'a')} <strong>${escapeHtml(what)}</strong> document for review.</p>
    <p style="font-size:14px;line-height:1.6;color:#6a6a6a;margin:0 0 20px">${escapeHtml(cleanerEmail || '')}${type === 'id' ? (hasSelfie ? ' · selfie attached' : ' · <strong>no selfie yet</strong>') : ''}</p>
    <p style="margin:0 0 8px"><a href="${APP_URL}/admin" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">Review it</a></p>`);
  const text = `${cleanerName || 'A cleaner'} uploaded a ${what} document for review${type === 'id' ? (hasSelfie ? ' (selfie attached)' : ' (no selfie yet)') : ''}.

${APP_URL}/admin`;
  return sendEmail({ to, subject: `Match Maid: ${what} to verify from ${cleanerName || 'a cleaner'}`, html, text });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
