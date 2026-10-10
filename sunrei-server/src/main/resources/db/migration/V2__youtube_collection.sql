-- YouTube collection: registered playlists, their videos, collected texts,
-- extraction runs, and extracted places waiting for admin review.
-- An extracted place becomes a SunreiSpot only when an admin approves it.

-- A registered playlist. sync_enabled drives the scheduled collection job.
CREATE TABLE youtube_playlist (
  id VARCHAR(64) PRIMARY KEY,                  -- YouTube playlist ID
  title VARCHAR(255) NOT NULL,
  description TEXT,
  channel_id VARCHAR(64),
  channel_title VARCHAR(255),
  sunrei_id VARCHAR(32) REFERENCES sunrei(id), -- approved places are added here
  sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- A video and its processing status.
CREATE TABLE youtube_video (
  id VARCHAR(32) PRIMARY KEY,                  -- YouTube video ID
  title VARCHAR(255) NOT NULL,
  description TEXT,
  channel_id VARCHAR(64),
  channel_title VARCHAR(255),
  published_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  thumbnail_url VARCHAR(512),
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','REVIEW_PENDING','COMPLETED','FAILED','SKIPPED')),
  stage VARCHAR(64),                           -- current or failed pipeline step
  error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_youtube_video_status ON youtube_video(status);

-- Playlist membership. removed_at marks a video that left the playlist.
CREATE TABLE youtube_playlist_video (
  playlist_id VARCHAR(64) NOT NULL REFERENCES youtube_playlist(id) ON DELETE CASCADE,
  video_id VARCHAR(32) NOT NULL REFERENCES youtube_video(id) ON DELETE CASCADE,
  position INTEGER,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_at TIMESTAMPTZ,
  PRIMARY KEY (playlist_id, video_id));
CREATE INDEX idx_youtube_playlist_video_video_id ON youtube_playlist_video(video_id);

-- Text collected from or derived for a video, kept for debugging and re-extraction.
-- Rows are appended; the newest row of a kind is the current one.
CREATE TABLE youtube_video_text (
  id VARCHAR(32) PRIMARY KEY,
  video_id VARCHAR(32) NOT NULL REFERENCES youtube_video(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL
    CHECK (kind IN ('CAPTIONS','WHISPER','OCR','TRANSCRIPT_REVIEWED','TRANSCRIPT_REVIEW','TIMELINE')),
  language VARCHAR(16),
  segments JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{start, end, text, source}]
  full_text TEXT,
  payload JSONB,                               -- kind-specific data, e.g. review corrections
  params JSONB,                                -- tool settings, e.g. Whisper model or OCR languages
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_youtube_video_text_video_id_kind ON youtube_video_text(video_id, kind, created_at);

-- One agent extraction over a video's texts.
CREATE TABLE youtube_extraction_run (
  id VARCHAR(32) PRIMARY KEY,
  video_id VARCHAR(32) NOT NULL REFERENCES youtube_video(id) ON DELETE CASCADE,
  agent VARCHAR(32) NOT NULL,                  -- codex, claude, or skill
  model VARCHAR(64),
  prompt_sha256 VARCHAR(64),
  input_text_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(16) NOT NULL CHECK (status IN ('SUCCEEDED','FAILED')),
  raw_output JSONB,                            -- unmodified agent output
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_youtube_extraction_run_video_id ON youtube_extraction_run(video_id, created_at);

-- A place candidate from an extraction run, reviewed in the admin.
CREATE TABLE youtube_extracted_place (
  id VARCHAR(32) PRIMARY KEY,
  run_id VARCHAR(32) NOT NULL REFERENCES youtube_extraction_run(id) ON DELETE CASCADE,
  video_id VARCHAR(32) NOT NULL REFERENCES youtube_video(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  category VARCHAR(64),
  area VARCHAR(255),
  description TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{source, quote, startSeconds}]
  confidence VARCHAR(8) CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
  needs_verification BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  timestamp_seconds INTEGER,
  -- Geocoding suggested by the job; the reviewer may correct it before approval.
  place_name VARCHAR(128),
  address VARCHAR(255),
  latitude REAL,
  longitude REAL,
  google_maps_id VARCHAR(255),
  geocode_warning TEXT,
  review_status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (review_status IN ('PENDING','APPROVED','REJECTED')),
  reviewed_at TIMESTAMPTZ,
  sunrei_spot_id VARCHAR(32) REFERENCES sunrei_spot(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_youtube_extracted_place_video_id ON youtube_extracted_place(video_id);
CREATE INDEX idx_youtube_extracted_place_review_status ON youtube_extracted_place(review_status);

-- External call failures (caption blocks, Places 429, agent limits) for diagnosing patterns.
CREATE TABLE youtube_video_attempt (
  id VARCHAR(32) PRIMARY KEY,
  video_id VARCHAR(32) NOT NULL REFERENCES youtube_video(id) ON DELETE CASCADE,
  stage VARCHAR(64) NOT NULL,
  error TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_youtube_video_attempt_video_id ON youtube_video_attempt(video_id, created_at);
