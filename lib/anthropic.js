// Thin wrapper around the Anthropic SDK, carrying forward the hard-won lessons from
// Tool 1: use plain messages.create (NOT structured-outputs/json_schema, which failed),
// put the JSON contract in the system prompt, raise max_tokens to avoid truncation,
// and parse defensively so a good reply never errors out.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-haiku-4-5-20251001';
export const hasKey = () => !!process.env.ANTHROPIC_API_KEY;

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Ask the model for JSON. Returns a parsed object, or throws so callers can fall back.
export async function askJson({ system, user, maxTokens = 2048 }) {
  const resp = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = (resp.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return parseJsonLoose(text);
}

// Strip code fences, slice the outermost object, and parse. Robust to chatty models.
export function parseJsonLoose(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    t = t.slice(start, end + 1);
  }
  return JSON.parse(t);
}
