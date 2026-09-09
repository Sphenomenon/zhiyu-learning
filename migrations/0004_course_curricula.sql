-- Paid lessons are deliberately kept outside publicly readable content_entries.
CREATE TABLE course_curricula (
  course_id TEXT PRIMARY KEY REFERENCES courses(id),
  draft_json TEXT NOT NULL CHECK (json_valid(draft_json)),
  published_json TEXT CHECK (published_json IS NULL OR json_valid(published_json)),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
