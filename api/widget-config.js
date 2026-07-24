import { CONFIG } from '../lib/config.js';
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    firmName: CONFIG.firm.name,
    name: CONFIG.firm.name,
    accent: CONFIG.widget.accent,
    greeting: CONFIG.widget.greeting,
    bookingType: CONFIG.firm.bookingType,
    timezone: 'Europe/London',
  });
}
