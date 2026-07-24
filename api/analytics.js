// Pipeline reporting. Gives partners the numbers the blueprint promises: how many leads,
// where they are, what is stuck, what is about to close, and how well nurture converts.
import { all, one } from '../db/index.js';
import { send, getFirmId } from '../lib/http.js';
import { closeProbForScore } from '../lib/config.js';
import { buildBriefing } from '../lib/briefing.js';

const OPEN = ['new', 'nurture', 'hot', 'engaged'];

export default async function handler(req, res) {
  try {
    const firmId = await getFirmId();
    if (!firmId) return send(res, 200, { empty: true });

    const byStage = await all(
      `SELECT stage, count(*)::int n,
              COALESCE(SUM((captured->>'estimated_value')::numeric),0)::bigint value
         FROM people WHERE firm_id=$1 AND archived=false GROUP BY stage`, [firmId]);
    const stageMap = {};
    byStage.forEach((r) => { stageMap[r.stage] = { n: r.n, value: Number(r.value) }; });

    const openValue = OPEN.reduce((s, st) => s + (stageMap[st]?.value || 0), 0);
    const closingValue = (stageMap.hot?.value || 0) + (stageMap.engaged?.value || 0);

    const hotWaiting = stageMap.hot?.n || 0;
    const nurturing = stageMap.nurture?.n || 0;
    const won = stageMap.won?.n || 0;
    const lost = stageMap.lost?.n || 0;
    const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;

    const avg = await one(
      `SELECT ROUND(AVG(score))::int avg FROM people WHERE firm_id=$1 AND archived=false AND score IS NOT NULL`, [firmId]);

    // Stuck: in nurture, no contact in 14+ days, and no nurture scheduled soon.
    const stuck = await all(
      `SELECT id, name, company, score, last_contacted_at, captured->>'service_interest' svc
         FROM people
        WHERE firm_id=$1 AND archived=false AND stage='nurture'
          AND (last_contacted_at IS NULL OR last_contacted_at < now() - interval '14 days')
        ORDER BY score DESC NULLS LAST LIMIT 8`, [firmId]);

    // Due next: nurtures scheduled to go out.
    const dueSoon = await one(
      `SELECT count(*)::int n FROM people
        WHERE firm_id=$1 AND archived=false AND stage='nurture' AND nurture_paused=false
          AND next_action_at IS NOT NULL AND next_action_at <= now()`, [firmId]);

    const bandDist = await all(
      `SELECT score_band, count(*)::int n FROM people
        WHERE firm_id=$1 AND archived=false AND score_band IS NOT NULL GROUP BY score_band`, [firmId]);

    // What nurture recovered: leads that entered via nurture and reached engaged/won.
    const nurtureSent = await one(
      `SELECT count(*)::int n FROM events WHERE firm_id=$1 AND type='nurture_sent'`, [firmId]);

    // Weighted pipeline forecast: each open lead's value times its close probability.
    const openRows = await all(
      `SELECT score, (captured->>'estimated_value')::numeric AS val
         FROM people WHERE firm_id=$1 AND archived=false AND stage = ANY($2)`, [firmId, OPEN]);
    let weightedValue = 0;
    for (const r of openRows) {
      weightedValue += closeProbForScore(r.score) * (Number(r.val) || 0);
    }
    weightedValue = Math.round(weightedValue);

    // Source performance: where good leads actually come from.
    const sourcePerf = await all(
      `SELECT COALESCE(source,'unknown') source,
              count(*)::int total,
              count(*) FILTER (WHERE stage='won')::int won,
              ROUND(AVG(score))::int avg_score
         FROM people WHERE firm_id=$1 AND archived=false GROUP BY source ORDER BY total DESC`, [firmId]);

    // What's closing: hot + engaged leads, highest value first.
    const closing = await all(
      `SELECT id, name, company, score, score_band, stage,
              (captured->>'estimated_value')::numeric AS value,
              captured->>'service_interest' svc
         FROM people WHERE firm_id=$1 AND archived=false AND stage IN ('hot','engaged')
        ORDER BY value DESC NULLS LAST LIMIT 6`, [firmId]);

    const stats = {
      openValue,
      closingValue,
      weightedValue,
      hotWaiting,
      nurturing,
      won,
      lost,
      winRate,
      avgScore: avg?.avg ?? null,
      dueNow: dueSoon?.n || 0,
      nurtureSent: nurtureSent?.n || 0,
      byStage: stageMap,
      bandDist,
      stuck,
      sourcePerf,
      closing,
      funnel: OPEN.concat(['won']).map((st) => ({ stage: st, n: stageMap[st]?.n || 0 })),
    };
    stats.briefing = buildBriefing(stats);
    return send(res, 200, stats);
  } catch (err) {
    console.error('[analytics]', err);
    return send(res, 500, { error: err.message });
  }
}
