// Opt-out endpoint. Nurture emails link here so a recipient can stop follow-ups in one
// click. Marks the lead opted out and paused, records it, and shows a plain confirmation.
import { one, query } from '../db/index.js';
import { getFirmId } from '../lib/http.js';

export default async function handler(req, res) {
  const id = Number(req.query?.id);
  let message = 'Link is invalid or has expired.';
  if (id) {
    try {
      const firmId = await getFirmId();
      const lead = await one(`SELECT id FROM people WHERE id=$1 AND firm_id=$2`, [id, firmId]);
      if (lead) {
        await query(`UPDATE people SET opted_out=true, nurture_paused=true, next_action_at=NULL, updated_at=now() WHERE id=$1`, [id]);
        await query(`INSERT INTO events (person_id, firm_id, type, detail) VALUES ($1,$2,'note_added',$3)`,
          [id, firmId, { note: 'Opted out of follow-ups' }]);
        message = 'You have been unsubscribed. You will not receive further follow-ups.';
      }
    } catch { /* fall through to default message */ }
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta charset="utf-8"><title>Unsubscribe</title>
  <div style="font-family:system-ui,sans-serif;max-width:460px;margin:12vh auto;text-align:center;color:#17222f">
  <h2 style="font-weight:600">${message}</h2></div>`);
}
