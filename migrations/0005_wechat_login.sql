-- The QR scene and the originating browser use different random credentials.
-- Neither credential is stored in plaintext, and a scan only marks a challenge;
-- the original browser must consume it before a site session is issued.
CREATE TABLE wechat_qr_logins (
  id TEXT PRIMARY KEY,
  scene_hash TEXT NOT NULL UNIQUE,
  ticket_hash TEXT NOT NULL,
  browser_hash TEXT NOT NULL,
  app_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  intent TEXT NOT NULL CHECK (intent IN ('login', 'bind')),
  user_id TEXT REFERENCES users(id),
  session_hash TEXT,
  subject TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  scanned_at INTEGER,
  consumed_at INTEGER,
  CHECK ((intent = 'login' AND user_id IS NULL AND session_hash IS NULL) OR
    (intent = 'bind' AND user_id IS NOT NULL AND session_hash IS NOT NULL))
);
CREATE INDEX wechat_qr_expiry ON wechat_qr_logins(expires_at);
CREATE INDEX wechat_qr_browser ON wechat_qr_logins(browser_hash);

-- A server-only API credential shared across Workers instances. It is never
-- returned to the browser. Expired tokens are replaced, not kept as history.
CREATE TABLE wechat_api_tokens (
  app_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- AppID:OpenID uniquely identifies a WeChat login. A user may link at most one
-- WeChat identity for each official account; the existing PK gives one owner.
CREATE UNIQUE INDEX identities_wechat_user_app ON auth_identities
  (user_id, substr(subject, 1, instr(subject, ':') - 1)) WHERE provider = 'wechat';
