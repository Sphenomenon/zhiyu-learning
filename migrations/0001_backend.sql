PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL
);
CREATE TABLE auth_identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user ON auth_identities(user_id);
CREATE TABLE verification_challenges (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX challenges_expiry ON verification_challenges(expires_at);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE INDEX rate_limits_expiry ON rate_limits(reset_at);

CREATE TABLE courses (id TEXT PRIMARY KEY);
CREATE TABLE content_entries (
  kind TEXT NOT NULL CHECK (kind IN ('site', 'course', 'case')),
  id TEXT NOT NULL,
  draft_json TEXT NOT NULL CHECK (json_valid(draft_json)),
  published_json TEXT CHECK (published_json IS NULL OR json_valid(published_json)),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE TABLE course_resources (
  course_id TEXT PRIMARY KEY REFERENCES courses(id),
  url TEXT NOT NULL,
  extraction_code TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE TABLE entitlements (
  user_id TEXT NOT NULL REFERENCES users(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  source TEXT NOT NULL CHECK (source IN ('code', 'manual')),
  source_id TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  PRIMARY KEY (user_id, course_id)
);
CREATE INDEX entitlements_course ON entitlements(course_id);
CREATE TABLE redemption_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT UNIQUE NOT NULL,
  hint TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  access_expires_at INTEGER,
  redeemed_by TEXT REFERENCES users(id),
  redeemed_at INTEGER,
  revoked_at INTEGER
);
CREATE TABLE code_courses (
  code_id TEXT NOT NULL REFERENCES redemption_codes(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  PRIMARY KEY (code_id, course_id)
);
CREATE TABLE manual_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  note TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_created ON audit_logs(created_at);
CREATE TABLE resource_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  resource_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX resource_access_created ON resource_access_logs(created_at);

-- Claim and grant happen in the same SQLite statement/transaction. A replay never
-- fires the trigger, so it cannot restore an entitlement revoked by the instructor.
CREATE TRIGGER redeem_code_grants
AFTER UPDATE OF redeemed_by ON redemption_codes
WHEN OLD.redeemed_by IS NULL AND NEW.redeemed_by IS NOT NULL
BEGIN
  INSERT INTO entitlements (user_id, course_id, source, source_id, granted_at, expires_at, revoked_at)
  SELECT NEW.redeemed_by, course_id, 'code', NEW.id, NEW.redeemed_at, NEW.access_expires_at, NULL
  FROM code_courses WHERE code_id = NEW.id
  ON CONFLICT (user_id, course_id) DO UPDATE SET
    expires_at = CASE
      WHEN entitlements.revoked_at IS NOT NULL OR entitlements.expires_at <= NEW.redeemed_at THEN excluded.expires_at
      WHEN entitlements.expires_at IS NULL OR excluded.expires_at IS NULL THEN NULL
      ELSE MAX(entitlements.expires_at, excluded.expires_at)
    END,
    source = excluded.source, source_id = excluded.source_id,
    granted_at = excluded.granted_at, revoked_at = NULL;
  INSERT INTO audit_logs (actor_id, action, target_id, created_at)
  VALUES (NEW.redeemed_by, 'code.redeemed', NEW.id, NEW.redeemed_at);
END;
