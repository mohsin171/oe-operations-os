// Side effects: sending nurture emails and alerting the team about hot leads.
// If no RESEND_API_KEY is set, messages are still generated and logged (as events and
// messages) but not actually emailed. Honest: the code is complete; adding the key
// flips real sending on, exactly like Tool 1.
import { CONFIG } from './config.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function canSendEmail() {
  // In demo mode we never send real email, even if a Resend key is present.
  if (CONFIG.demoMode) return false;
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail({ to, subject, text }) {
  if (!canSendEmail()) {
    return { sent: false, reason: CONFIG.demoMode ? 'demo-mode' : 'no-resend-key' };
  }
  const bodyWithOptOut = `${text}\n\n---\n${CONFIG.nurture.unsubscribeText}`;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: CONFIG.firm.fromEmail,
        to: [to],
        subject,
        text: bodyWithOptOut,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { sent: false, reason: `resend-${res.status}`, body };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

// Alert the team that a lead is hot and waiting. Falls back to a logged alert.
export async function alertTeam(person) {
  const subject = `Hot lead: ${person.name || 'New enquiry'} (score ${person.score})`;
  const text =
    `A lead just crossed into the hot band and is ready for a partner.\n\n` +
    `Name: ${person.name || 'Unknown'}\n` +
    `Contact: ${person.email || ''} ${person.phone || ''}\n` +
    `Interest: ${(person.captured && person.captured.service_interest) || 'n/a'}\n` +
    `Score: ${person.score} (${person.score_band})\n` +
    `Why: ${(person.score_reasons || []).join('; ')}\n\n` +
    `Assigned to: ${person.assigned_to || 'unassigned'}\n`;
  const result = await sendEmail({ to: CONFIG.firm.teamEmail, subject, text });
  return { subject, text, ...result };
}
