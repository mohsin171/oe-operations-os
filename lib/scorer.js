// The scoring engine (the brain, part one). Rates each lead 0-100 on how likely they
// are to become a paying client, and ALWAYS returns short written reasons, so a partner
// can see why a lead was ranked where it was. That transparency is the trust feature.
import { CONFIG, bandForScore } from './config.js';
import { askJson, hasKey } from './anthropic.js';

export async function scoreLead(person) {
  if (hasKey()) {
    try {
      return await scoreWithAI(person);
    } catch (err) {
      console.error('[scorer] AI scoring failed, falling back to heuristic:', err.message);
    }
  }
  return scoreHeuristic(person);
}

async function scoreWithAI(person) {
  const c = person.captured || {};
  const system = [
    `You are the lead-scoring engine for ${CONFIG.firm.name}, a ${CONFIG.firm.vertical}.`,
    `Rate how likely this lead is to become a paying client, 0 to 100.`,
    ``,
    `What a strong lead looks like for this firm:`,
    CONFIG.scoring.idealClient,
    `High-value services (want these): ${CONFIG.scoring.highValueServices.join('; ')}.`,
    `Low-value services (weak fit): ${CONFIG.scoring.lowValueServices.join('; ')}.`,
    ``,
    `Weigh: service fit, likely engagement value, urgency/timeline, how complete and`,
    `credible the contact details are, and match to the ideal client. A vague or`,
    `anonymous enquiry for a cheap one-off should score low; a named business owner`,
    `wanting high-value advisory soon should score high.`,
    ``,
    `Reply with ONLY a JSON object, no prose, no code fences:`,
    `{"score": <int 0-100>, "reasons": ["<=12 word reason", ...up to 4],`,
    ` "summary": "<one plain sentence>", "recommendation": "<what the firm should do next>"}`,
  ].join('\n');

  const user = JSON.stringify(
    {
      name: person.name || null,
      email: person.email || null,
      phone: person.phone || null,
      company: person.company || null,
      source: person.source || null,
      service_interest: c.service_interest || null,
      estimated_value: c.estimated_value || null,
      timeline: c.timeline || null,
      budget_signal: c.budget_signal || null,
      role: c.role || null,
      notes: c.notes || null,
    },
    null,
    2
  );

  const out = await askJson({ system, user });
  let score = Math.max(0, Math.min(100, Math.round(Number(out.score))));
  if (!Number.isFinite(score)) score = 0;
  const band = bandForScore(score);
  const reasons = Array.isArray(out.reasons) ? out.reasons.slice(0, 4).map(String) : [];
  return {
    score,
    band: band.band,
    reasons,
    summary: String(out.summary || band.label),
    recommendation: String(out.recommendation || band.action),
    mode: 'ai',
  };
}

// Deterministic, explainable heuristic. Runs when no API key is set, so the whole
// pipeline is demonstrable offline. The reasons it returns mirror what the AI produces.
export function scoreHeuristic(person) {
  const c = person.captured || {};
  const reasons = [];
  let score = 20; // baseline: an enquiry exists

  const svc = (c.service_interest || '').toLowerCase();
  const highHit = CONFIG.scoring.highValueServices.find((s) =>
    overlaps(svc, s)
  );
  const lowHit = CONFIG.scoring.lowValueServices.find((s) => overlaps(svc, s));
  if (highHit) {
    score += 22;
    reasons.push(`Wants high-value work: ${highHit}`);
  } else if (lowHit) {
    score -= 8;
    reasons.push(`Low-value request: ${lowHit}`);
  } else if (svc) {
    score += 6;
    reasons.push(`Service interest noted`);
  }

  // Value signal (graduated so the middle of the pipeline spreads out)
  const val = Number(c.estimated_value) || 0;
  if (val >= 30000) { score += 18; reasons.push(`High estimated value (${money(val)})`); }
  else if (val >= 20000) { score += 14; reasons.push(`High estimated value (${money(val)})`); }
  else if (val >= 15000) { score += 11; reasons.push(`Solid estimated value (${money(val)})`); }
  else if (val >= 8000) { score += 7; reasons.push(`Moderate estimated value (${money(val)})`); }
  else if (val >= 3000) { score += 4; }
  else if (val > 0) { score += 1; }

  // Timeline / urgency
  const tl = (c.timeline || '').toLowerCase();
  if (/(now|asap|immediat|this month|this quarter|urgent|weeks)/.test(tl)) {
    score += 16; reasons.push('Wants to move soon');
  } else if (/(next month|next quarter|quarter|q[1-4]|month)/.test(tl)) {
    score += 8; reasons.push('Has a near-term timeline');
  } else if (/(few months)/.test(tl)) {
    score -= 1;
  } else if (/(this year|sometime|someday|explor|just looking|year|no rush|unclear)/.test(tl)) {
    score -= 4; reasons.push('No near-term intent');
  }

  // Budget signal
  const budget = (c.budget_signal || '').toLowerCase();
  if (/(has budget|approved|ready to invest|retainer)/.test(budget)) {
    score += 8; reasons.push('Budget signalled');
  } else if (/(cheap|cheapest|lowest|free)/.test(budget)) {
    score -= 10; reasons.push('Price-shopping');
  }

  // Data quality / credibility
  const hasEmail = !!person.email;
  const hasPhone = !!person.phone;
  const hasCompany = !!person.company;
  const hasName = !!(person.name && person.name.trim() && person.name.trim() !== 'Anonymous');
  const quality = [hasEmail, hasPhone, hasCompany, hasName].filter(Boolean).length;
  if (quality >= 3) { score += 6; reasons.push('Complete, credible contact details'); }
  else if (quality <= 1) { score -= 12; reasons.push('Thin or anonymous contact details'); }

  if (hasCompany) reasons.push(`Business owner: ${person.company}`);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band = bandForScore(score);
  return {
    score,
    band: band.band,
    reasons: reasons.slice(0, 4),
    summary: `${band.label}. ${svc ? capitalize(svc) : 'General enquiry'}${
      val ? `, est. ${money(val)}` : ''
    }.`,
    recommendation: band.action,
    mode: 'heuristic',
  };
}

function overlaps(a, phrase) {
  if (!a) return false;
  const words = phrase.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  return words.some((w) => a.includes(w));
}
function money(n) {
  return '$' + Number(n).toLocaleString('en-US');
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
