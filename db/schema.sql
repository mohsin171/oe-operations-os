-- Orca Edge shared lead spine. Identical shape to Tool 1 so that "integrated mode"
-- is a connection-string change, not a rewrite. Tool 3 reads and writes the sales
-- columns (score, stage, nurture_*). Tool 2/4 columns are present but null here.

CREATE TABLE IF NOT EXISTS firms (
  id           SERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  vertical     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS people (
  id                  SERIAL PRIMARY KEY,
  firm_id             INTEGER NOT NULL REFERENCES firms(id) ON DELETE CASCADE,

  -- identity (one row per person across the whole journey)
  name                TEXT,
  email               TEXT,
  phone               TEXT,
  company             TEXT,
  source              TEXT,               -- website, referral, csv-import, tool1-intake, ad
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Tool 3: sales pipeline
  stage               TEXT NOT NULL DEFAULT 'new',   -- new|nurture|hot|engaged|won|lost
  score               INTEGER,            -- 0-100, null until scored
  score_band          TEXT,               -- hot|warm|cool|cold
  score_reasons       JSONB DEFAULT '[]', -- array of short "why" strings (the trust feature)
  score_summary       TEXT,
  score_recommendation TEXT,
  scored_at           TIMESTAMPTZ,
  score_mode          TEXT,               -- ai|heuristic (honest about how it was scored)

  captured            JSONB DEFAULT '{}', -- service_interest, estimated_value, timeline, budget_signal, role, notes

  nurture_step        INTEGER NOT NULL DEFAULT 0,
  nurture_paused      BOOLEAN NOT NULL DEFAULT false,
  next_action_at      TIMESTAMPTZ,        -- when the next nurture is due
  last_contacted_at   TIMESTAMPTZ,
  assigned_to         TEXT,               -- team member a hot lead is routed to

  -- Tool 2 (documents) and Tool 4 (comms) reserve these; null in the standalone Tool 3 demo
  doc_status          TEXT,
  comms_status        TEXT,

  opted_out           BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS people_firm_stage_idx ON people(firm_id, stage);
CREATE INDEX IF NOT EXISTS people_next_action_idx ON people(next_action_at);
CREATE INDEX IF NOT EXISTS people_score_idx ON people(score DESC);

CREATE TABLE IF NOT EXISTS messages (
  id          SERIAL PRIMARY KEY,
  person_id   INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  firm_id     INTEGER NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL DEFAULT 'email',   -- email|whatsapp|sms|web
  direction   TEXT NOT NULL DEFAULT 'out',     -- in|out
  subject     TEXT,
  body        TEXT NOT NULL,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_person_idx ON messages(person_id, created_at);

-- Audit trail. Every automated decision is recorded, so the dashboard can always
-- show what happened and why. This is what makes it infrastructure, not a black box.
CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  person_id   INTEGER REFERENCES people(id) ON DELETE CASCADE,
  firm_id     INTEGER NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,   -- lead_created|scored|stage_changed|nurture_sent|nurture_scheduled|flagged_hot|assigned|note_added|imported|replied
  detail      JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_person_idx ON events(person_id, created_at);
CREATE INDEX IF NOT EXISTS events_firm_idx ON events(firm_id, created_at);

-- Rate limiting for public write endpoints (intake/score/tick). Protects AI + email
-- spend from abuse. Old rows are pruned by the limiter itself.
CREATE TABLE IF NOT EXISTS rate_hits (
  id          SERIAL PRIMARY KEY,
  ip          TEXT NOT NULL,
  route       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_hits_lookup ON rate_hits(route, ip, created_at);

-- Additive migration for databases created before these were added:
ALTER TABLE people ADD COLUMN IF NOT EXISTS opted_out BOOLEAN NOT NULL DEFAULT false;

-- Soft-archive support (reversible hide). Added after initial deploys.
ALTER TABLE people ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- OPERATIONS OS: capture columns (Tool 1 intake writes these into the spine)
-- ============================================================================
ALTER TABLE people ADD COLUMN IF NOT EXISTS matter               TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS channel              TEXT DEFAULT 'web';
ALTER TABLE people ADD COLUMN IF NOT EXISTS urgency              TEXT DEFAULT 'unknown';
ALTER TABLE people ADD COLUMN IF NOT EXISTS qualification        TEXT DEFAULT 'unclear';
ALTER TABLE people ADD COLUMN IF NOT EXISTS qualification_reason TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS handoff_needed       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE people ADD COLUMN IF NOT EXISTS handoff_trigger      TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS handoff_summary      TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS notes                TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS session_id           TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS booking_at           TIMESTAMPTZ;
ALTER TABLE people ADD COLUMN IF NOT EXISTS booking_type         TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS first_seen_at        TIMESTAMPTZ DEFAULT now();
ALTER TABLE people ADD COLUMN IF NOT EXISTS first_reply_at       TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS people_session_idx ON people(session_id);

-- Confirmed appointment bookings. One row per slot; a slot cannot be double-booked.
CREATE TABLE IF NOT EXISTS bookings (
  id          SERIAL PRIMARY KEY,
  firm_id     INTEGER NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  person_id   INTEGER REFERENCES people(id) ON DELETE SET NULL,
  slot_at     TIMESTAMPTZ NOT NULL,
  slot_type   TEXT NOT NULL DEFAULT 'fact-find call',
  status      TEXT NOT NULL DEFAULT 'confirmed',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firm_id, slot_at)
);
CREATE INDEX IF NOT EXISTS bookings_firm_idx ON bookings(firm_id, slot_at);

-- ============================================================================
-- SECURE ADMIN LOGIN (invite-based email OTP + server-side sessions)
-- ============================================================================
-- Allowlist: only these emails may request a login code. Orca Edge provisions them.
CREATE TABLE IF NOT EXISTS admins (
  id          SERIAL PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  firm_id     INTEGER REFERENCES firms(id) ON DELETE CASCADE,
  name        TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-time login codes. Hashed, short-lived, single-use, attempt-capped.
CREATE TABLE IF NOT EXISTS login_codes (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT false,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_codes_email_idx ON login_codes(email, created_at DESC);

-- Server-side sessions. The cookie holds a high-entropy token; only its hash is stored.
CREATE TABLE IF NOT EXISTS sessions (
  id          SERIAL PRIMARY KEY,
  token_hash  TEXT UNIQUE NOT NULL,
  email       TEXT NOT NULL,
  firm_id     INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token_hash);
