// The engine ties the pieces together. It is the single code path that decides what
// happens to a lead: score it, route it to a stage, schedule or send nurture, and flag
// hot leads to the team. Everything it does is written to the events audit trail.
import { query, one } from '../db/index.js';
import { CONFIG } from './config.js';
import { scoreLead } from './scorer.js';
import { writeNurture } from './nurture.js';
import { alertTeam } from './actions.js';

async function logEvent(person, type, detail = {}) {
  await query(
    `INSERT INTO events (person_id, firm_id, type, detail) VALUES ($1,$2,$3,$4)`,
    [person.id, person.firm_id, type, detail]
  );
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Score a lead and route it into the right stage. Used for new leads and re-scores.
export async function scoreAndRoute(personId, { reason = 'auto' } = {}) {
  const person = await one(`SELECT * FROM people WHERE id = $1`, [personId]);
  if (!person) return null;

  const result = await scoreLead(person);
  await logEvent(person, 'scored', { ...result, reason });

  // Decide stage from band. Hot leads go to a human immediately and are NOT auto-nurtured.
  let stage = person.stage;
  let nextAction = person.next_action_at;
  let assigned = person.assigned_to;

  const settledStages = ['engaged', 'won', 'lost'];
  if (!settledStages.includes(person.stage)) {
    if (result.band === 'hot') {
      stage = 'hot';
      nextAction = null; // stop nurturing; a human takes over
      if (!assigned) {
        assigned = CONFIG.firm.team[Math.floor(Math.random() * CONFIG.firm.team.length)];
      }
    } else {
      stage = 'nurture';
      // schedule the next nurture step if the sequence has not run out
      if (person.nurture_step < CONFIG.nurture.maxSteps) {
        const nextStepDef = CONFIG.nurture.steps.find((s) => s.step === person.nurture_step + 1);
        let delay = nextStepDef ? nextStepDef.delayDays : 3;
        if (result.band === 'cold') delay *= CONFIG.nurture.coldMultiplier;
        nextAction = addDays(new Date(), delay);
      } else {
        nextAction = null; // sequence complete, go dormant
      }
    }
  }

  await query(
    `UPDATE people SET
       score=$1, score_band=$2, score_reasons=$3, score_summary=$4,
       score_recommendation=$5, scored_at=now(), score_mode=$6,
       stage=$7, next_action_at=$8, assigned_to=$9, updated_at=now()
     WHERE id=$10`,
    [
      result.score, result.band, JSON.stringify(result.reasons), result.summary,
      result.recommendation, result.mode, stage, nextAction, assigned, personId,
    ]
  );

  if (stage !== person.stage) {
    await logEvent(person, 'stage_changed', { from: person.stage, to: stage });
    if (stage === 'hot') {
      const updated = { ...person, ...result, score: result.score, score_band: result.band, score_reasons: result.reasons, assigned_to: assigned };
      const alert = await alertTeam(updated);
      await logEvent(person, 'flagged_hot', { assigned_to: assigned, alert_sent: alert.sent });
      if (assigned) await logEvent(person, 'assigned', { to: assigned });
    } else if (nextAction) {
      await logEvent(person, 'nurture_scheduled', { step: person.nurture_step + 1, due: nextAction });
    }
  }

  return one(`SELECT * FROM people WHERE id=$1`, [personId]);
}

// Send the next nurture message to a single lead (used by the scheduler and the
// "Run next nurture" button). Generates, logs, advances the step, schedules the next.
export async function runNurture(personId, { force = false } = {}) {
  const person = await one(`SELECT * FROM people WHERE id=$1`, [personId]);
  if (!person) return { ok: false, reason: 'not-found' };
  if (person.opted_out) return { ok: false, reason: 'opted-out' };
  if (person.nurture_paused && !force) return { ok: false, reason: 'paused' };
  if (['won', 'lost', 'hot', 'engaged'].includes(person.stage) && !force)
    return { ok: false, reason: `stage-${person.stage}` };
  if (person.nurture_step >= CONFIG.nurture.maxSteps && !force)
    return { ok: false, reason: 'sequence-complete' };

  const nextStep = Math.min(person.nurture_step + 1, CONFIG.nurture.maxSteps);
  const msg = await writeNurture(person, nextStep);

  const { canSendEmail, sendEmail } = await import('./actions.js');
  let delivery = { sent: false, reason: 'no-recipient' };
  if (person.email) {
    delivery = canSendEmail()
      ? await sendEmail({ to: person.email, subject: msg.subject, text: msg.body })
      : { sent: false, reason: 'no-resend-key' };
  }

  await query(
    `INSERT INTO messages (person_id, firm_id, channel, direction, subject, body, meta)
     VALUES ($1,$2,'email','out',$3,$4,$5)`,
    [person.id, person.firm_id, msg.subject, msg.body, { step: nextStep, mode: msg.mode, delivery }]
  );

  // schedule the following step
  let nextAction = null;
  if (nextStep < CONFIG.nurture.maxSteps) {
    const following = CONFIG.nurture.steps.find((s) => s.step === nextStep + 1);
    let delay = following ? following.delayDays : 3;
    if (person.score_band === 'cold') delay *= CONFIG.nurture.coldMultiplier;
    nextAction = addDays(new Date(), delay);
  }

  await query(
    `UPDATE people SET nurture_step=$1, last_contacted_at=now(), next_action_at=$2, updated_at=now()
     WHERE id=$3`,
    [nextStep, nextAction, person.id]
  );

  await logEvent(person, 'nurture_sent', {
    step: nextStep, subject: msg.subject, mode: msg.mode, delivered: delivery.sent,
  });
  if (nextAction) await logEvent(person, 'nurture_scheduled', { step: nextStep + 1, due: nextAction });

  return { ok: true, step: nextStep, message: msg, delivery };
}

// The scheduler pass. Scores anything unscored, then sends every nurture that is due.
// Called by the cron (/api/tick) and by the "Run pipeline now" button.
export async function tick({ firmId }) {
  const summary = { scored: 0, nurtured: 0, flagged_hot: 0 };

  const unscored = await query(
    `SELECT id FROM people WHERE firm_id=$1 AND archived=false AND score IS NULL`,
    [firmId]
  );
  for (const row of unscored.rows) {
    const p = await scoreAndRoute(row.id, { reason: 'tick' });
    summary.scored++;
    if (p && p.stage === 'hot') summary.flagged_hot++;
  }

  const due = await query(
    `SELECT id FROM people
       WHERE firm_id=$1 AND archived=false AND stage='nurture' AND nurture_paused=false AND opted_out=false
         AND next_action_at IS NOT NULL AND next_action_at <= now()`,
    [firmId]
  );
  for (const row of due.rows) {
    const r = await runNurture(row.id);
    if (r.ok) summary.nurtured++;
  }

  return summary;
}
