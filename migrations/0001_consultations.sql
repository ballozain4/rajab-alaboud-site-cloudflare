PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  client_request_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  city TEXT NOT NULL,
  request_mode TEXT NOT NULL CHECK (request_mode IN ('consultation', 'service')),
  consultation_type TEXT NOT NULL,
  service_slug TEXT NOT NULL DEFAULT '',
  service_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  best_contact_time TEXT NOT NULL,
  source TEXT NOT NULL,
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  utm_content TEXT NOT NULL DEFAULT '',
  utm_term TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (
    status IN (
      'new',
      'reviewed',
      'awaiting-client',
      'contacted',
      'appointment-booked',
      'completed',
      'not-suitable',
      'cancelled'
    )
  ),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  notification_email_status TEXT NOT NULL DEFAULT 'pending',
  notification_whatsapp_status TEXT NOT NULL DEFAULT 'manual',
  device_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consultations_created_at ON consultations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status, archived, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_city ON consultations(city, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_source ON consultations(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_phone ON consultations(phone_normalized);

CREATE TABLE IF NOT EXISTS consultation_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consultation_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_consultation_notes_request
  ON consultation_notes(consultation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS consultation_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consultation_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_consultation_activity_request
  ON consultation_activity(consultation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_updated_at ON rate_limits(updated_at);
