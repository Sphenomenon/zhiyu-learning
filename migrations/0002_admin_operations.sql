CREATE TABLE admin_operations (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  payload_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
