PRAGMA foreign_keys = ON;

ALTER TABLE pages ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE user_pages ADD COLUMN relationship TEXT NOT NULL DEFAULT 'opened';

CREATE INDEX IF NOT EXISTS idx_pages_created_by ON pages(created_by);
CREATE INDEX IF NOT EXISTS idx_user_pages_relationship ON user_pages(user_id, relationship);
