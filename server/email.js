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
// `unsubUrl` is passed for nudges and campaign mail, which need a one-click
// opt-out. Transactional mail (a confirmation code, an enquiry someone sent
// you) deliberately does NOT get one: unsubscribing from those would break the
// account, and they aren't the kind of message the opt-out governs.
// Which country's footer an email signs off with. "Christchurch, NZ" under a
// message to a Sydney cleaner is the kind of detail that quietly says this was
// not built for you.
const COUNTRY_FOOTER = {
  NZ: { where: 'Christchurch, NZ', site: 'matchmaid.co.nz' },
  AU: { where: 'Australia', site: 'matchmaid.com.au' },
};

// The word for a background check, per country. Australia does not have a
// "criminal check" - it has a National Police Check.
export const POLICE_CHECK_TERM = { NZ: 'criminal check', AU: 'police check' };

function shell(bodyHtml, unsubUrl, country) {
  const f = COUNTRY_FOOTER[country] || COUNTRY_FOOTER.NZ;
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
    <div style="font-size:20px;font-weight:700;letter-spacing:-0.01em;color:#123b4a;margin-bottom:24px">Match&nbsp;Maid</div>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e6e6e6;margin:28px 0 16px" />
    <p style="font-size:12px;color:#8a8a8a;line-height:1.5;margin:0">Match Maid · ${f.where}<br/>
      You're receiving this because someone used this address on ${f.site}.${
        unsubUrl
          ? `<br/><a href="${unsubUrl}" style="color:#8a8a8a">Unsubscribe from these updates</a>`
          : ''
      }</p>
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
export async function sendEnquiryEmail({ to, cleanerName, clientName, service, suburb, message, country }) {
  const hi = cleanerName ? `Hi ${escapeHtml(cleanerName)},` : 'Hi,';
  const bits = [service && `a <strong>${escapeHtml(service)}</strong>`, suburb && `in <strong>${escapeHtml(suburb)}</strong>`]
    .filter(Boolean).join(' ');
  const html = shell(`
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${hi}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Good news - <strong>${escapeHtml(clientName || 'a customer')}</strong> has sent you a new enquiry${bits ? ' for ' + bits : ''} on Match Maid. It's exclusively yours.</p>
    ${message ? `<blockquote style="margin:0 0 20px;padding:12px 16px;background:#f4f1ea;border-left:3px solid #14b8a6;border-radius:0 8px 8px 0;font-size:14px;line-height:1.6;color:#333">"${escapeHtml(message)}"</blockquote>` : ''}
    <p style="margin:0 0 8px"><a href="${APP_URL}/maid" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">Reply in your portal</a></p>
    <p style="font-size:13px;line-height:1.6;color:#8a8a8a;margin:16px 0 0">Replying quickly keeps you at the top of search results.</p>`, null, country);
  const text = `${cleanerName ? cleanerName + ',\n\n' : ''}${clientName || 'A customer'} has sent you a new enquiry${bits ? ' for ' + service + (suburb ? ' in ' + suburb : '') : ''} on Match Maid.${message ? '\n\n"' + message + '"' : ''}\n\nReply in your portal: ${APP_URL}/maid`;
  return sendEmail({ to, subject: `New Match Maid enquiry from ${clientName || 'a customer'}`, html, text });
}

// --- Email: your document was approved / declined (to the cleaner) ---------
const VERIF_LABEL = { id: 'ID', police: 'criminal check', insurance: 'insurance' };
const VERIF_BADGE = { id: 'ID verified', police: 'Criminal checked', insurance: 'Insured' };
const VERIF_LABEL_AU = { id: 'ID', police: 'police check', insurance: 'insurance' };
const VERIF_BADGE_AU = { id: 'ID verified', police: 'Police checked', insurance: 'Insured' };

export async function sendVerificationDecisionEmail({ to, name, type, approved, country }) {
  const hi = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  const au = country === 'AU';
  const what = (au ? VERIF_LABEL_AU : VERIF_LABEL)[type] || 'document';
  const badge = (au ? VERIF_BADGE_AU : VERIF_BADGE)[type] || 'verified';
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

// --- Email: someone replied ------------------------------------------------
// Transactional, so no unsubscribe: opting out of "someone messaged you" would
// break the thing they signed up for. The nudge opt-out deliberately does not
// govern this.
//
// The message is quoted rather than summarised - most replies are short enough
// to answer from the inbox, and a notification that makes you log in to find
// out whether it needs an answer is a worse notification.
export async function sendNewMessageEmail({ to, toName, fromName, body, portal, country }) {
  const hi = toName ? `Hi ${escapeHtml(String(toName).split(' ')[0])},` : 'Hi,';
  const who = escapeHtml(fromName || 'Someone');
  const trimmed = String(body || '').trim();
  const preview = trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed;
  const html = shell(`
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${hi}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px"><strong>${who}</strong> has sent you a message on Match Maid.</p>
    ${preview ? `<blockquote style="margin:0 0 20px;padding:12px 16px;background:#f4f1ea;border-left:3px solid #14b8a6;border-radius:0 8px 8px 0;font-size:14px;line-height:1.6;color:#333">${escapeHtml(preview)}</blockquote>` : ''}
    <p style="margin:0 0 8px"><a href="${APP_URL}${portal || '/customer'}" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">Reply in your portal</a></p>
    <p style="font-size:13px;line-height:1.6;color:#8a8a8a;margin:16px 0 0">We'll only email you once about this conversation until you have read it, so a quick back-and-forth won't fill your inbox.</p>`, null, country);
  const text = `${toName ? String(toName).split(' ')[0] + ',\n\n' : ''}${fromName || 'Someone'} has sent you a message on Match Maid.${preview ? `\n\n"${preview}"` : ''}\n\nReply: ${APP_URL}${portal || '/customer'}`;
  return sendEmail({ to, subject: `New message from ${fromName || 'a Match Maid user'}`, html, text });
}

// --- Email: finish what you started (nudges) --------------------------------
// One per stalled stage of the onboarding funnel. Each is sent at most once
// ever (the nudges table enforces it), so these read as a single helpful
// reminder rather than a drip campaign.
//
// Each says plainly what is missing and what happens once it's done. No
// urgency, no fake deadline: the only honest lever we have is that a finished
// profile is the one customers can actually find.
const NUDGE = {
  // Confirmed their email, never set a rate - so they never went live.
  cleaner_no_rate: {
    subject: 'Your Match Maid listing is nearly there',
    lead: 'You created a Match Maid account but haven\'t set your rate yet, so your profile isn\'t showing to customers.',
    body: 'Setting an hourly fee for at least one clean type is all that\'s left - it takes about a minute, and it\'s what puts you in search.',
    cta: 'Finish my listing',
    href: '/maid',
  },
  // Live in search with a rate, but no hours - so nothing to match a customer's
  // requested time against. The most consequential gap of the lot: this one
  // makes a listing look present and behave absent.
  cleaner_no_availability: {
    subject: 'Add your hours - customers are searching now',
    lead: 'Match Maid is now open to customers in Christchurch and Auckland, and they are searching. Your listing is live, but you haven\'t marked which times you can work.',
    body: 'Here\'s why that matters: customers pick the days and times they need someone, and we rank cleaners by how well they match. With no hours set there is nothing to match against, so you fall below cleaners who have filled theirs in - even when you\'re cheaper, closer or better reviewed. Tapping the mornings and afternoons you\'re usually free takes about a minute, and you can change it whenever your week changes.',
    cta: 'Set my availability',
    href: '/maid',
  },
  // Live in search, but no ID badge - the single biggest trust signal.
  cleaner_no_id: {
    subject: 'Add your ID badge and get picked more often',
    lead: 'Your Match Maid listing is live - nice one.',
    body: 'One thing would make it stronger: customers can filter for ID-verified cleaners, and profiles with the badge get chosen more often. Uploading a photo ID and a selfie takes a couple of minutes.',
    cta: 'Get verified',
    href: '/maid',
  },
  // No service areas at all. The most complete kind of invisible: a cleaner is
  // matched to a customer by suburb first, so with none set there is no search
  // anywhere in the country that can return them. Written for someone who set
  // up an account and stopped, which in practice is who this reaches.
  cleaner_no_areas: {
    subject: 'Where do you clean? Your listing needs an area',
    lead: 'You started a Match Maid listing but haven\'t said which suburbs you cover, so there\'s no search that can find you yet.',
    body: 'Customers search by their own suburb, and we only show cleaners who cover it. Until you pick your areas your profile can\'t come up for anyone - not even someone on your street. You can draw a circle around where you\'re based and it fills in every suburb inside it, so it takes about a minute. Match Maid is free for cleaners and customers alike while we build the network, and there\'s no commission on anything you earn.',
    cta: 'Set my areas',
    href: '/maid',
  },
  // Signed up, never told us where they live - so we can't match them at all.
  customer_no_suburb: {
    subject: 'Which suburb are you in?',
    lead: 'You signed up to Match Maid but haven\'t told us where you are yet.',
    body: 'We match you to cleaners who cover your suburb, so without it we can\'t line anyone up for you. Adding it takes a few seconds.',
    cta: 'Add my suburb',
    href: '/customer',
  },
};

// --- Email: how did your clean go? (customer, evening of the clean) --------
// Sent alongside the in-app prompt, not instead of it. The in-app prompt only
// works if they open the portal; most people will not, and a review that never
// gets written is a cleaner with no proof they are any good.
//
// One ask, one link, straight into the form. No "we value your feedback".
export async function sendReviewRequestEmail({ to, name, cleanerName, when, country }) {
  const hi = name ? `Hi ${escapeHtml(String(name).split(' ')[0])},` : 'Hi,';
  const who = escapeHtml(cleanerName || 'your cleaner');
  const html = shell(`
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${hi}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">
      ${who} cleaned for you${when ? ` on ${escapeHtml(when)}` : ''}. How did it go?</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">
      It takes about a minute, and it is the main thing other households have to go on when they
      are deciding who to let into their home. It also shows ${who} what they did well.</p>
    <p style="margin:0 0 8px"><a href="${APP_URL}/customer?tab=messages" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">Rate this clean</a></p>
    <p style="font-size:13px;line-height:1.6;color:#8a8a8a;margin:16px 0 0">
      If something went wrong, say so - we would rather know. Reply to this email and it comes
      straight to us.</p>`, null, country);
  const text = `${name ? String(name).split(' ')[0] + ',\n\n' : ''}${cleanerName || 'Your cleaner'} cleaned for you${when ? ` on ${when}` : ''}. How did it go?\n\nIt takes about a minute, and it is the main thing other households have to go on.\n\nRate this clean: ${APP_URL}/customer?tab=messages\n\nIf something went wrong, reply to this email and it comes straight to us.`;
  return sendEmail({ to, subject: `How did your clean with ${cleanerName || 'your cleaner'} go?`, html, text });
}

// --- Email: you've got a new review (cleaner) ------------------------------
// The full card, every category, not just the headline. A cleaner who scores
// 4.8 overall but 3.1 on timeliness has been told something useful; "4.8
// stars" tells them nothing they can act on.
//
// The two asks - Google, and referrals - ride on this email and ONLY when the
// review is good. Asking someone to go and praise you publicly moments after
// they were marked down is tone deaf, and it is the surest way to get the
// honest answer you did not want on a public page. `googleUrl` is omitted
// entirely until there is a Google Business Profile to point at.
export async function sendCleanerReviewEmail({
  to, cleanerName, clientName, overall, dims, wouldUseAgain, comment,
  referralLink, creditDollars, googleUrl, country,
}) {
  const hi = cleanerName ? `Hi ${escapeHtml(String(cleanerName).split(' ')[0])},` : 'Hi,';
  const who = escapeHtml(clientName ? String(clientName).split(' ')[0] : 'A customer');
  const one = (n) => (Math.round(Number(n) * 10) / 10).toFixed(1);
  const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

  // A bar per category. Table-based, because a flex row is a stack of full
  // width blocks in Outlook and the whole card falls apart.
  const rows = dims.map((d) => `
    <tr>
      <td style="padding:4px 0;font-size:14px;color:#1a1a1a;white-space:nowrap">${escapeHtml(d.label)}</td>
      <td style="padding:4px 0 4px 12px;width:100%">
        <div style="background:#e6e6e6;border-radius:999px;height:8px">
          <div style="background:#14b8a6;border-radius:999px;height:8px;width:${Math.max(2, (Number(d.value) / 5) * 100)}%"></div>
        </div>
      </td>
      <td style="padding:4px 0 4px 12px;font-size:14px;font-weight:700;text-align:right;white-space:nowrap">${one(d.value)}</td>
    </tr>`).join('');

  const good = Number(overall) >= 4;
  const asks = !good ? '' : `
    ${googleUrl ? `
    <hr style="border:none;border-top:1px solid #e6e6e6;margin:28px 0 20px" />
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px"><strong>Would you do the same for us?</strong></p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">
      Reviews are how households decide who to trust, and they are how cleaners find Match Maid too.
      If the platform has been worth using, a line on Google helps the next cleaner find us.</p>
    <p style="margin:0 0 20px"><a href="${escapeHtml(googleUrl)}" style="display:inline-block;background:#123b4a;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">Review Match Maid on Google</a></p>` : ''}
    ${referralLink ? `
    <hr style="border:none;border-top:1px solid #e6e6e6;margin:${googleUrl ? '20px' : '28px'} 0 20px" />
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px"><strong>Know another cleaner?</strong></p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">
      Send them your link and you earn <strong>$${creditDollars} credit</strong> once they have been on a
      paid plan for a month. Everyone is free while we build the network, so referrals you make now
      bank until then.</p>
    <p style="margin:0 0 8px"><a href="${escapeHtml(referralLink)}" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">Share your referral link</a></p>
    <p style="font-size:13px;line-height:1.6;color:#8a8a8a;margin:8px 0 0">Your link: ${escapeHtml(referralLink)}</p>` : ''}`;

  const html = shell(`
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${hi}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">${who} has reviewed a clean you did.</p>
    <div style="background:#f4f1ea;border-radius:12px;padding:20px 20px 16px;margin:0 0 20px">
      <p style="margin:0 0 2px;font-size:32px;font-weight:700;line-height:1;color:#123b4a">${one(overall)}<span style="font-size:16px;font-weight:400;color:#8a8a8a"> / 5</span></p>
      <p style="margin:0 0 16px;font-size:16px;color:#14b8a6;letter-spacing:0.1em">${stars(overall)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows}</table>
      <p style="margin:14px 0 0;font-size:14px;color:#1a1a1a">
        ${wouldUseAgain ? '✓ They would book you again' : 'They did not say they would book again'}</p>
    </div>
    ${comment ? `<blockquote style="margin:0 0 20px;padding:12px 16px;background:#fff;border-left:3px solid #14b8a6;font-size:15px;line-height:1.6;font-style:italic;color:#333">${escapeHtml(comment)}</blockquote>` : ''}
    <p style="margin:0 0 8px"><a href="${APP_URL}/maid" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">See it on your profile</a></p>
    ${asks}`, null, country);

  const text = `${cleanerName ? String(cleanerName).split(' ')[0] + ',\n\n' : ''}${who} has reviewed a clean you did.\n\n`
    + `Overall: ${one(overall)}/5\n`
    + dims.map((d) => `  ${d.label}: ${one(d.value)}`).join('\n')
    + `\n  ${wouldUseAgain ? 'Would book you again' : 'Did not say they would book again'}\n`
    + (comment ? `\n"${comment}"\n` : '')
    + `\nSee it on your profile: ${APP_URL}/maid\n`
    + (good && googleUrl ? `\nIf Match Maid has been worth using, a review on Google helps the next cleaner find us: ${googleUrl}\n` : '')
    + (good && referralLink ? `\nKnow another cleaner? Earn $${creditDollars} credit once they have been on a paid plan for a month: ${referralLink}\n` : '');

  return sendEmail({ to, subject: `${who} rated your clean ${one(overall)}/5`, html, text });
}

export async function sendNudgeEmail({ to, name, kind, unsubUrl, country }) {
  const n = NUDGE[kind];
  if (!n) return { ok: false, error: `unknown nudge kind ${kind}` };
  const hi = name ? `Hi ${escapeHtml(String(name).split(' ')[0])},` : 'Hi,';
  const html = shell(`
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${hi}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${n.lead}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">${n.body}</p>
    <p style="margin:0 0 8px"><a href="${APP_URL}${n.href}" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">${escapeHtml(n.cta)}</a></p>`, unsubUrl, country);
  const text = `${name ? String(name).split(' ')[0] + ',\n\n' : ''}${n.lead}\n\n${n.body}\n\n${n.cta}: ${APP_URL}${n.href}${unsubUrl ? `\n\nUnsubscribe: ${unsubUrl}` : ''}`;
  return sendEmail({ to, subject: n.subject, html, text });
}

// --- Email: where we're up to (the pre-launch update) -----------------------
// Two versions of one message, because the two sides are owed different things.
//
// Cleaners get the referral ask: the $10 credit is real, it is theirs to earn,
// and referring another cleaner genuinely is the thing that brings launch
// forward. Customers get the same honesty about timing but NO credit offer -
// there is no customer referral scheme, and inventing one in an email is how
// you end up owing people something you can't pay.
export async function sendPreLaunchUpdateEmail({ to, name, role, referralLink, creditDollars, unsubUrl }) {
  const hi = name ? `Hi ${escapeHtml(String(name).split(' ')[0])},` : 'Hi,';
  const isCleaner = role === 'cleaner';
  const thanks = 'Thanks for your patience while we get Match Maid off the ground.';
  const status = 'We\'re holding off on switching search on until there are enough cleaners for it to be worth using - a directory nobody can find anyone in helps nobody. We\'re close.';

  const body = isCleaner
    ? `<p style="font-size:15px;line-height:1.6;margin:0 0 16px">${thanks}</p>
       <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${status}</p>
       <p style="font-size:15px;line-height:1.6;margin:0 0 20px">If you know another cleaner who'd be a good fit, sending them your link is the fastest way to bring that forward - and you earn <strong>$${creditDollars} credit</strong> once they've been on a paid plan for a month. Everyone is free while we build the network, so referrals you make now bank until then.</p>
       <p style="margin:0 0 16px"><a href="${escapeHtml(referralLink)}" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">Share your referral link</a></p>
       <p style="font-size:13px;line-height:1.6;color:#8a8a8a;margin:0">Your link: ${escapeHtml(referralLink)}</p>`
    : `<p style="font-size:15px;line-height:1.6;margin:0 0 16px">${thanks}</p>
       <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${status}</p>
       <p style="font-size:15px;line-height:1.6;margin:0 0 20px">If you know a cleaner who might want the work, pointing them our way genuinely does bring launch forward - the hold-up is cleaners, not customers. You'll be first to hear when search opens in your area.</p>
       <p style="margin:0 0 8px"><a href="${APP_URL}/for-maids" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">Send a cleaner our way</a></p>`;

  const html = shell(`<p style="font-size:15px;line-height:1.6;margin:0 0 16px">${hi}</p>${body}`, unsubUrl);
  const text = isCleaner
    ? `${thanks}\n\n${status}\n\nRefer a cleaner and earn $${creditDollars} credit once they've been on a paid plan for a month. Everyone is free while we build the network, so referrals you make now bank until then.\n${referralLink}${unsubUrl ? `\n\nUnsubscribe: ${unsubUrl}` : ''}`
    : `${thanks}\n\n${status}\n\nKnow a cleaner? Send them to ${APP_URL}/for-maids - the hold-up is cleaners, not customers.${unsubUrl ? `\n\nUnsubscribe: ${unsubUrl}` : ''}`;
  return sendEmail({ to, subject: 'Where Match Maid is up to', html, text });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
