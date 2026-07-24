// ============================================================================
// ORCA EDGE OPERATIONS OS - the single per-client configuration.
// ----------------------------------------------------------------------------
// One file drives the WHOLE system: the AI intake chat (capture), the scoring
// brain (convert), the nurture sequence, and the dashboard branding. Onboarding
// a new firm = copy this file, edit the values, deploy.
//
// DEMO TENANT: Rivergate Mortgages (fictional UK mortgage brokerage), the
// Orca Edge beachhead. This is the end-to-end delivery a client receives:
// their front door (AI chat) and their operations brain (pipeline dashboard),
// one connected infrastructure on one shared database.
// ============================================================================

export const CONFIG = {
  demoMode: process.env.DEMO_MODE !== 'false',

  firm: {
    slug: 'rivergate-mortgages',
    id: 'rivergate-mortgages',
    vertical: 'mortgage',
    name: 'Rivergate Mortgages',
    tagline: 'a UK mortgage brokerage helping buyers and homeowners find the right mortgage',
    teamEmail: 'hello@orcaedge.io',
    fromEmail: 'Rivergate Mortgages <hello@orcaedge.io>',
    team: ['Daniel Rivers', 'Sofia Grant', 'Marcus Hale'],

    services: [
      { area: 'First-Time Buyers', details: 'Guiding first-time buyers from agreement in principle to completion, and finding lenders suited to smaller deposits.' },
      { area: 'Remortgaging', details: 'Reviewing your current deal and searching the market for a better rate when your fixed term ends, or to release equity.' },
      { area: 'Home Movers', details: 'Arranging the mortgage for your next home, including porting an existing mortgage or arranging a new one.' },
      { area: 'Buy-to-Let', details: 'Mortgages for landlords and investors, including portfolio and limited-company buy-to-let.' },
      { area: 'Self-Employed & Complex Income', details: 'Specialist help for self-employed applicants, contractors, and complex income.' },
    ],
    notHandled: ['commercial property finance over 5 million pounds', 'overseas property mortgages', 'conveyancing (we refer you to trusted solicitors)'],
    offices: [{ city: 'Reading', address: '14 Kings Walk, Reading RG1 2HG', note: 'Head office; appointments by phone or in person.' }],
    hours: 'Monday to Friday 9:00am to 6:00pm, and Saturday mornings by appointment. The AI intake answers 24/7.',
    feesPolicy: [
      'Free initial consultation (a fact-find call) for all new enquiries.',
      'Rivergate is a whole-of-market broker; many mortgages are arranged with no broker fee, as the lender pays commission.',
      'Where a fee applies it is explained clearly and in writing before you commit.',
      'The assistant never quotes an exact rate or fee. It explains the approach and arranges a fact-find call.',
    ],
    nextSteps: 'The best next step is a free, no-obligation fact-find call: about 20 minutes by phone, to understand your situation and outline the options.',
    bookingType: 'fact-find call',
    faqs: [
      { q: 'How much can I borrow?', a: 'It depends on your income, deposit, and outgoings. The adviser works this out on a short fact-find call rather than a rough guess.' },
      { q: 'Do you charge a fee?', a: 'Often there is no fee to you, as the lender pays Rivergate a commission. Where a fee applies it is explained in writing before you commit.' },
      { q: "I'm self-employed, can you still help?", a: 'Yes. Rivergate specialises in self-employed and complex-income cases and works with lenders who understand them.' },
      { q: 'Can the assistant give me mortgage advice?', a: 'No. The assistant gathers your details and arranges for a qualified adviser to give regulated advice.' },
    ],
    captureFields: [
      { key: 'loan_purpose', label: 'Loan purpose', options: ['purchase', 'remortgage', 'buy-to-let', 'product transfer'] },
      { key: 'loan_amount', label: 'Approximate loan amount' },
      { key: 'property_value', label: 'Approximate property value' },
      { key: 'timeline', label: 'Timeline', options: ['ready now', 'within 3 months', 'just exploring'] },
      { key: 'buyer_type', label: 'Buyer type', options: ['first-time buyer', 'home mover', 'landlord', 'self-employed'] },
    ],
  },

  widget: {
    accent: '#4592DC',
    greeting: "Hello, and welcome to Rivergate Mortgages. I can help with questions about buying, remortgaging, or buy-to-let, and arrange a free, no-obligation call with an adviser. What brings you in today?",
  },

  ai: { model: 'claude-haiku-4-5-20251001' },

  scoring: {
    highValueServices: ['purchase / first-time buyer', 'remortgage', 'home mover', 'buy-to-let', 'self-employed / complex income'],
    lowValueServices: ['just exploring', 'general question', 'overseas property'],
    idealClient:
      'A buyer or homeowner ready to act within about three months, with a clear loan purpose ' +
      '(purchase, remortgage, or buy-to-let), a realistic loan amount, and complete contact details. ' +
      'Self-employed and complex-income cases are a strong fit because the firm specialises in them. ' +
      'Someone "just exploring" with no timeline is a weaker fit.',
    bands: [
      { band: 'hot',  min: 80, label: 'Ready to proceed', action: 'Route to an adviser today.', closeProb: 0.70 },
      { band: 'warm', min: 55, label: 'Promising',         action: 'Keep nurturing; likely to convert with follow-up.', closeProb: 0.40 },
      { band: 'cool', min: 30, label: 'Early',             action: 'Light-touch nurture; not ready yet.', closeProb: 0.18 },
      { band: 'cold', min: 0,  label: 'Poor fit',          action: 'Minimal contact; likely not a match.', closeProb: 0.05 },
    ],
  },

  nurture: {
    steps: [
      { step: 1, delayDays: 0,  intent: 'Warm intro. Thank them, restate what they asked about, offer one useful next thing.' },
      { step: 2, delayDays: 3,  intent: 'Share one relevant insight tied to their situation (rates, timing, deposit). Helpful, no hard sell.' },
      { step: 3, delayDays: 8,  intent: 'Soft check-in. Ask if their plans or timeline have changed, invite a short call.' },
      { step: 4, delayDays: 16, intent: 'Offer a specific, low-friction call slot and a clear reason it is worth their time.' },
      { step: 5, delayDays: 30, intent: 'Final courteous touch. Leave the door open.' },
    ],
    coldMultiplier: 3,
    maxSteps: 5,
    tone: 'Warm, plain, professional. No hype words. Short. Signed off by the firm, not a bot.',
    unsubscribeText: 'If you would rather not hear from us, reply STOP and we will close your file.',
  },

  team: { notify: 'hello@orcaedge.io' },
  crm: { sheetWebhookUrl: process.env.SHEET_WEBHOOK_URL || '' },
  brand: { primary: '#060B14', steel: '#3875AE', blue: '#4592DC', light: '#E9F1F8' },
};

export function bandForScore(score) {
  for (const b of CONFIG.scoring.bands) if (score >= b.min) return b;
  return CONFIG.scoring.bands[CONFIG.scoring.bands.length - 1];
}
export function closeProbForScore(score) {
  if (score == null) return 0;
  return bandForScore(score).closeProb;
}
