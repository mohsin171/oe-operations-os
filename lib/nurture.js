// The nurture engine (the brain, part two). For leads that are not yet ready, it writes
// the next follow-up message, personalised to the lead's situation, so no lead goes cold
// from neglect. The scheduler decides WHEN; this decides WHAT to say.
import { CONFIG } from './config.js';
import { askJson, hasKey } from './anthropic.js';

// Returns { subject, body, mode }.
export async function writeNurture(person, step) {
  const stepDef = CONFIG.nurture.steps.find((s) => s.step === step) || CONFIG.nurture.steps[0];
  if (hasKey()) {
    try {
      return await writeWithAI(person, stepDef);
    } catch (err) {
      console.error('[nurture] AI generation failed, falling back:', err.message);
    }
  }
  return writeTemplate(person, stepDef);
}

async function writeWithAI(person, stepDef) {
  const c = person.captured || {};
  const system = [
    `You write follow-up emails on behalf of ${CONFIG.firm.name}, a ${CONFIG.firm.vertical}.`,
    `Tone: ${CONFIG.nurture.tone}`,
    `This is nurture step ${stepDef.step} of ${CONFIG.nurture.maxSteps}.`,
    `Goal of this message: ${stepDef.intent}`,
    `Rules: keep it under 130 words. No hype words. Do not invent facts about the lead.`,
    `Sign off from the ${CONFIG.firm.name} team. Never use em dashes.`,
    ``,
    `Reply with ONLY JSON, no code fences:`,
    `{"subject": "<short subject>", "body": "<email body, plain text with line breaks>"}`,
  ].join('\n');

  const user = JSON.stringify(
    {
      name: person.name || 'there',
      company: person.company || null,
      service_interest: c.service_interest || null,
      timeline: c.timeline || null,
      notes: c.notes || null,
    },
    null,
    2
  );

  const out = await askJson({ system, user, maxTokens: 1024 });
  return {
    subject: String(out.subject || `Following up from ${CONFIG.firm.name}`),
    body: String(out.body || '').trim(),
    mode: 'ai',
  };
}

// Personalised template fallback. Still uses the lead's name and interest, so it reads
// as a real follow-up, not a placeholder.
export function writeTemplate(person, stepDef) {
  const first = (person.name || 'there').split(' ')[0];
  const svc = (person.captured && person.captured.service_interest) || 'your enquiry';
  const firm = CONFIG.firm.name;

  const bodies = {
    1: `Hi ${first},\n\nThank you for getting in touch with ${firm} about ${svc}. We would be glad to help.\n\nIf it is useful, we can put together a short, no-obligation review of your situation before you commit to anything. Would that be worthwhile?\n\nBest regards,\nThe ${firm} team`,
    2: `Hi ${first},\n\nA quick, useful note on ${svc}: the firms and individuals who get the best outcomes tend to plan a step ahead of the deadline rather than reacting to it. Happy to share what that looks like in your case whenever you are ready.\n\nNo action needed today.\n\nBest regards,\nThe ${firm} team`,
    3: `Hi ${first},\n\nJust checking in on ${svc}. Has anything changed on your side, or is the timing still open?\n\nIf a short call would help, we can find 15 minutes that suits you.\n\nBest regards,\nThe ${firm} team`,
    4: `Hi ${first},\n\nWe have set aside a couple of slots this week for a brief call about ${svc}. It is the fastest way to see whether we can genuinely add value before you spend anything.\n\nWould Tuesday or Thursday afternoon suit?\n\nBest regards,\nThe ${firm} team`,
    5: `Hi ${first},\n\nWe will leave it here for now so we are not cluttering your inbox. If ${svc} comes back onto your desk, just reply to this email and we will pick it straight up.\n\nWishing you well.\n\nThe ${firm} team`,
  };

  return {
    subject:
      stepDef.step >= 4
        ? `A quick call about ${svc}?`
        : `Following up on ${svc}`,
    body: bodies[stepDef.step] || bodies[1],
    mode: 'template',
  };
}
