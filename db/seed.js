// Seeds the Rivergate Mortgages demo tenant with realistic leads across every band and
// stage, then runs them through the real engine so the pipeline is genuinely alive.
// This is what makes the standalone demo believable out of the box.
import { pool, query, one } from './index.js';
import { CONFIG } from '../lib/config.js';
import { scoreAndRoute, runNurture } from '../lib/engine.js';
import { writeTemplate } from '../lib/nurture.js';

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();

// A spread of mortgage leads a real broker would see. estimated_value = loan amount (GBP).
const LEADS = [
  { name: 'James Whitfield', company: null, email: 'james.whitfield@gmail.com', phone: '+44 7700 118001', source: 'website',
    captured: { service_interest: 'remortgage', estimated_value: 320000, timeline: 'ready now', loan_purpose: 'remortgage', buyer_type: 'home mover', property_value: '480000', notes: 'Fixed rate ends next month, wants to move fast.' }, ageDays: 1 },
  { name: 'Priya Sharma', company: null, email: 'priya.sharma@outlook.com', phone: '+44 7700 118002', source: 'website',
    captured: { service_interest: 'purchase / first-time buyer', estimated_value: 285000, timeline: 'ready now', loan_purpose: 'purchase', buyer_type: 'first-time buyer', property_value: '340000', notes: 'Offer accepted, needs a mortgage arranged quickly.' }, ageDays: 1 },
  { name: 'Daniel Brooks', company: 'Brooks Contracting', email: 'daniel@brookscontracting.co.uk', phone: '+44 7700 118003', source: 'website',
    captured: { service_interest: 'self-employed / complex income', estimated_value: 410000, timeline: 'within 3 months', loan_purpose: 'purchase', buyer_type: 'self-employed', property_value: '520000', notes: 'Self-employed 3 years, high-street lenders declined.' }, ageDays: 2 },
  { name: 'Sofia Marchetti', company: null, email: 'sofia.m@gmail.com', phone: '+44 7700 118004', source: 'referral',
    captured: { service_interest: 'buy-to-let', estimated_value: 260000, timeline: 'within 3 months', loan_purpose: 'buy-to-let', buyer_type: 'landlord', property_value: '330000', notes: 'Expanding portfolio, second BTL.' }, ageDays: 3 },

  { name: 'Oliver Grant', company: null, email: 'oliver.grant@gmail.com', phone: '+44 7700 118005', source: 'website',
    captured: { service_interest: 'home mover', estimated_value: 300000, timeline: 'within 3 months', loan_purpose: 'purchase', buyer_type: 'home mover', property_value: '420000', notes: 'Selling current home, porting considered.' }, ageDays: 6 },
  { name: 'Hannah Lowe', company: null, email: 'hannah.lowe@yahoo.com', phone: null, source: 'website',
    captured: { service_interest: 'remortgage', estimated_value: 180000, timeline: 'within 3 months', loan_purpose: 'remortgage', buyer_type: 'home mover', property_value: '260000', notes: 'Exploring a better rate, no rush.' }, ageDays: 10 },
  { name: 'Marcus Reid', company: null, email: 'marcus.reid@gmail.com', phone: '+44 7700 118007', source: 'website',
    captured: { service_interest: 'purchase / first-time buyer', estimated_value: 210000, timeline: 'just exploring', loan_purpose: 'purchase', buyer_type: 'first-time buyer', property_value: '250000', notes: 'Saving deposit, 6-9 months away.' }, ageDays: 15 },
  { name: 'Emma Sorensen', company: null, email: 'emma.sorensen@gmail.com', phone: '+44 7700 118008', source: 'website',
    captured: { service_interest: 'buy-to-let', estimated_value: 150000, timeline: 'just exploring', loan_purpose: 'buy-to-let', buyer_type: 'landlord', property_value: '200000', notes: 'First-time landlord, researching.' }, ageDays: 22 },

  { name: 'Gary Coates', company: null, email: 'gary.coates@hotmail.com', phone: null, source: 'website',
    captured: { service_interest: 'general question', estimated_value: 0, timeline: 'just exploring', notes: 'How much can I borrow? No details given.' }, ageDays: 30 },
  { name: 'Anonymous', company: null, email: 'quickq99@gmail.com', phone: null, source: 'website',
    captured: { service_interest: 'general question', estimated_value: 0, timeline: 'just looking', notes: 'What are your fees?' }, ageDays: 34 },
  { name: 'Tomasz K', company: null, email: null, phone: '+44 7700 118011', source: 'website',
    captured: { service_interest: 'overseas property', estimated_value: 0, timeline: 'unclear', notes: 'Overseas property in Poland (not handled).' }, ageDays: 41 },

  { name: 'Rebecca Shah', company: null, email: 'rebecca.shah@gmail.com', phone: '+44 7700 118012', source: 'referral',
    captured: { service_interest: 'purchase / first-time buyer', estimated_value: 340000, timeline: 'ready now', loan_purpose: 'purchase', buyer_type: 'first-time buyer', property_value: '400000', notes: 'Fact-find call done, application progressing.' }, ageDays: 6, forceStage: 'engaged' },
  { name: 'Adam Price', company: null, email: 'adam.price@gmail.com', phone: '+44 7700 118013', source: 'website',
    captured: { service_interest: 'remortgage', estimated_value: 295000, timeline: 'ready now', loan_purpose: 'remortgage', buyer_type: 'home mover', property_value: '410000', notes: 'Offer produced, awaiting decision.' }, ageDays: 11, forceStage: 'engaged' },
  { name: 'Laura Bennett', company: null, email: 'laura.bennett@gmail.com', phone: '+44 7700 118014', source: 'referral',
    captured: { service_interest: 'self-employed / complex income', estimated_value: 380000, timeline: 'completed', loan_purpose: 'purchase', buyer_type: 'self-employed', property_value: '470000', notes: 'Completed last week. Case reference.' }, ageDays: 20, forceStage: 'won' },
  { name: 'Neil Osborne', company: null, email: 'neil.osborne@hotmail.com', phone: null, source: 'website',
    captured: { service_interest: 'general question', estimated_value: 0, timeline: 'unclear', notes: 'Went cold, no reply after outreach.' }, ageDays: 52, forceStage: 'lost' },

  { name: 'Chloe Martin', company: null, email: 'chloe.martin@gmail.com', phone: '+44 7700 118015', source: 'website',
    captured: { service_interest: 'purchase / first-time buyer', estimated_value: 230000, timeline: 'within 3 months', loan_purpose: 'purchase', buyer_type: 'first-time buyer', property_value: '275000', notes: 'Warming up, wants guidance on deposit.' }, ageDays: 12, nurtureSteps: 2 },
  { name: 'Raj Patel', company: null, email: 'raj.patel@gmail.com', phone: '+44 7700 118016', source: 'referral',
    captured: { service_interest: 'buy-to-let', estimated_value: 240000, timeline: 'within 3 months', loan_purpose: 'buy-to-let', buyer_type: 'landlord', property_value: '300000', notes: 'Following up steadily.' }, ageDays: 22, nurtureSteps: 3, dueNow: true },
];

async function backdateNurture(person, steps) {
  // Insert prior nurture messages + events with realistic backdated timestamps.
  for (let s = 1; s <= steps; s++) {
    const stepDef = CONFIG.nurture.steps.find((x) => x.step === s);
    const msg = writeTemplate(person, stepDef);
    const when = daysAgo(Math.max(1, person.ageDays - s * 3));
    await query(
      `INSERT INTO messages (person_id, firm_id, channel, direction, subject, body, meta, created_at)
       VALUES ($1,$2,'email','out',$3,$4,$5,$6)`,
      [person.id, person.firm_id, msg.subject, msg.body, { step: s, mode: 'template', seeded: true }, when]
    );
    await query(
      `INSERT INTO events (person_id, firm_id, type, detail, created_at)
       VALUES ($1,$2,'nurture_sent',$3,$4)`,
      [person.id, person.firm_id, { step: s, subject: msg.subject, seeded: true }, when]
    );
  }
}

async function run() {
  console.log('[seed] clearing existing data...');
  await query('TRUNCATE events, messages, people, firms RESTART IDENTITY CASCADE');

  const firm = await one(
    `INSERT INTO firms (slug, name, vertical) VALUES ($1,$2,$3) RETURNING *`,
    [CONFIG.firm.slug, CONFIG.firm.name, CONFIG.firm.vertical]
  );
  console.log(`[seed] firm: ${firm.name} (id ${firm.id})`);

  for (const lead of LEADS) {
    const inserted = await one(
      `INSERT INTO people (firm_id, name, email, phone, company, source, captured, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
      [firm.id, lead.name, lead.email, lead.phone, lead.company, lead.source, lead.captured, daysAgo(lead.ageDays)]
    );
    await query(`INSERT INTO events (person_id, firm_id, type, detail, created_at) VALUES ($1,$2,'lead_created',$3,$4)`,
      [inserted.id, firm.id, { source: lead.source }, daysAgo(lead.ageDays)]);

    // Score + route through the real engine.
    const routed = await scoreAndRoute(inserted.id, { reason: 'seed' });
    const person = { ...routed, ...lead, id: inserted.id, firm_id: firm.id };

    // Seed nurture history for the mid-nurture leads.
    if (lead.nurtureSteps) {
      await backdateNurture(person, lead.nurtureSteps);
      const next = lead.dueNow ? daysAgo(1) : new Date(Date.now() + 4 * 864e5).toISOString();
      await query(`UPDATE people SET nurture_step=$1, last_contacted_at=$2, next_action_at=$3 WHERE id=$4`,
        [lead.nurtureSteps, daysAgo(3), next, inserted.id]);
    }

    // Force certain leads into later stages to fill the board.
    if (lead.forceStage) {
      await query(`UPDATE people SET stage=$1, next_action_at=NULL, assigned_to=COALESCE(assigned_to,$2) WHERE id=$3`,
        [lead.forceStage, CONFIG.firm.team[0], inserted.id]);
      await query(`INSERT INTO events (person_id, firm_id, type, detail) VALUES ($1,$2,'stage_changed',$3)`,
        [inserted.id, firm.id, { to: lead.forceStage, seeded: true }]);
    }
  }

  const counts = await query(
    `SELECT stage, count(*)::int n FROM people GROUP BY stage ORDER BY stage`);
  console.log('[seed] pipeline by stage:');
  counts.rows.forEach((r) => console.log(`   ${r.stage.padEnd(9)} ${r.n}`));
  const total = await one(`SELECT count(*)::int n FROM people`);
  console.log(`[seed] total leads: ${total.n}`);
  await pool.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
