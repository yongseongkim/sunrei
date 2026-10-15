-- Instagram collection: registered accounts, their posts, collected texts,
-- extraction runs, and extracted places waiting for admin review.
-- An extracted place becomes a SunreiSpot only when an admin approves it.
-- Also generalizes the spot link and adds the INSTAGRAM source type.

-- A spot links to the content that mentions the place: a YouTube timestamp or an Instagram post.
-- Expand step: the PreSync migration runs while the old server still serves and reads youtube_link,
-- so add and copy here; V4 (next release) copies late writes and drops youtube_link.
ALTER TABLE sunrei_spot ADD COLUMN source_link VARCHAR(255);
UPDATE sunrei_spot SET source_link = youtube_link WHERE youtube_link IS NOT NULL;

-- Postgres names an inline column CHECK "<table>_<column>_check".
ALTER TABLE source DROP CONSTRAINT source_type_check;
ALTER TABLE source ADD CONSTRAINT source_type_check
  CHECK (type IN ('YOUTUBE','INSTAGRAM','TV','ANIME','OTHER'));

-- A registered Instagram professional account. sync_enabled drives the scheduled collection job.
CREATE TABLE instagram_account (
  id VARCHAR(32) PRIMARY KEY,                   -- Instagram user ID from Business Discovery
  username VARCHAR(64) NOT NULL,                -- handle without @; can change
  name VARCHAR(255),
  biography TEXT,
  followers_count INTEGER,
  media_count INTEGER,
  sunrei_id VARCHAR(32) REFERENCES sunrei(id),  -- approved places are added here
  sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  backfill_cursor TEXT,                         -- Business Discovery "after" cursor of an unfinished backfill
  backfill_completed_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX idx_instagram_account_username ON instagram_account (lower(username));

-- A post and its processing status. title is derived from the caption on every upsert.
CREATE TABLE instagram_post (
  id VARCHAR(32) PRIMARY KEY,                   -- Instagram media ID
  account_id VARCHAR(32) NOT NULL REFERENCES instagram_account(id) ON DELETE CASCADE,
  shortcode VARCHAR(32) NOT NULL,               -- from the permalink; the API has no shortcode field
  permalink VARCHAR(255) NOT NULL,
  media_type VARCHAR(16) NOT NULL CHECK (media_type IN ('IMAGE','VIDEO','CAROUSEL_ALBUM')),
  product_type VARCHAR(16),                     -- FEED or REELS as reported by the API
  caption TEXT,
  title VARCHAR(128) NOT NULL,                  -- first caption line without hashtags, or the shortcode
  posted_at TIMESTAMPTZ NOT NULL,
  like_count INTEGER,
  comments_count INTEGER,
  location_tag JSONB,                           -- {pk, name, lat, lng}; NULL when absent or not read
  location_tag_read_at TIMESTAMPTZ,             -- NULL = the post page has not been read
  promotion VARCHAR(16) CHECK (promotion IN ('NONE','DISCLOSED_AD','SELF_PROMOTION')),  -- from the latest run
  promotion_evidence TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','REVIEW_PENDING','COMPLETED','FAILED','SKIPPED')),
  stage VARCHAR(64),                            -- current or failed pipeline step
  error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX idx_instagram_post_shortcode ON instagram_post(shortcode);
CREATE INDEX idx_instagram_post_account_id_posted_at ON instagram_post(account_id, posted_at DESC);
CREATE INDEX idx_instagram_post_status ON instagram_post(status);

-- Text derived from a reel, kept for debugging and re-extraction.
-- Rows are appended; the newest row of a kind is the current one.
CREATE TABLE instagram_post_text (
  id VARCHAR(32) PRIMARY KEY,
  post_id VARCHAR(32) NOT NULL REFERENCES instagram_post(id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('WHISPER','OCR')),
  language VARCHAR(16),
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{start, end, text, confidence}]
  full_text TEXT,
  params JSONB,                                 -- tool settings, e.g. Whisper model or OCR interval
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_instagram_post_text_post_id_kind ON instagram_post_text(post_id, kind, created_at);

-- One agent extraction for one post. Posts extracted in one agent call share batch_id.
CREATE TABLE instagram_extraction_run (
  id VARCHAR(32) PRIMARY KEY,
  post_id VARCHAR(32) NOT NULL REFERENCES instagram_post(id) ON DELETE CASCADE,
  batch_id VARCHAR(32),
  agent VARCHAR(32) NOT NULL,                   -- codex, claude, or skill
  model VARCHAR(64),
  prompt_sha256 VARCHAR(64),
  input_text_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(16) NOT NULL CHECK (status IN ('SUCCEEDED','FAILED')),
  promotion VARCHAR(16) CHECK (promotion IN ('NONE','DISCLOSED_AD','SELF_PROMOTION')),
  promotion_evidence TEXT,
  raw_output JSONB,                             -- this post's unmodified item from the agent output
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_instagram_extraction_run_post_id ON instagram_extraction_run(post_id, created_at);

-- A place candidate from an extraction run, reviewed in the admin.
CREATE TABLE instagram_extracted_place (
  id VARCHAR(32) PRIMARY KEY,
  run_id VARCHAR(32) NOT NULL REFERENCES instagram_extraction_run(id) ON DELETE CASCADE,
  post_id VARCHAR(32) NOT NULL REFERENCES instagram_post(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,                   -- business name, or a description when name_found is false
  name_found BOOLEAN NOT NULL DEFAULT TRUE,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  category VARCHAR(64),
  area VARCHAR(255),
  description TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{source, quote, startSeconds}]
  confidence VARCHAR(8) CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
  needs_verification BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  -- Geocoding suggested by the job; the reviewer may correct it before approval.
  geocode_status VARCHAR(16) NOT NULL DEFAULT 'NOT_SEARCHED'
    CHECK (geocode_status IN ('MATCHED','NAME_MISMATCH','NOT_FOUND','NOT_SEARCHED')),
  place_name VARCHAR(128),
  address VARCHAR(255),
  latitude REAL,
  longitude REAL,
  google_maps_id VARCHAR(255),
  geocode_warning TEXT,
  review_status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (review_status IN ('PENDING','APPROVED','REJECTED','SUPERSEDED')),
  reviewed_at TIMESTAMPTZ,
  sunrei_spot_id VARCHAR(32) REFERENCES sunrei_spot(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_instagram_extracted_place_post_id ON instagram_extracted_place(post_id);
CREATE INDEX idx_instagram_extracted_place_review_status ON instagram_extracted_place(review_status);
CREATE INDEX idx_instagram_extracted_place_google_maps_id ON instagram_extracted_place(google_maps_id);

-- External call failures (Graph API limits, login walls, download errors, agent limits).
CREATE TABLE instagram_post_attempt (
  id VARCHAR(32) PRIMARY KEY,
  post_id VARCHAR(32) NOT NULL REFERENCES instagram_post(id) ON DELETE CASCADE,
  stage VARCHAR(64) NOT NULL,
  error TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_instagram_post_attempt_post_id ON instagram_post_attempt(post_id, created_at);
