-- Fresh baseline for the Source -> Sunrei -> SunreiSpot -> Place redesign.
-- This is the single V1 baseline: content + auth tables together.
-- Existing environments must DROP the database before applying this migration
-- (Flyway checksums from the previous V1/V2 will not match).
-- All TIMESTAMPTZ columns are treated as UTC instants in app/API code.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Place: a real-world location. google_maps_id is the dedupe key
-- (one Place = one marker = one public card).
CREATE TABLE place (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  address VARCHAR(255) NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  google_maps_id VARCHAR(255),
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_reason VARCHAR(255),
  closed_at TIMESTAMPTZ,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE INDEX idx_place_location ON place(latitude, longitude);
CREATE INDEX idx_place_is_closed ON place(is_closed);
CREATE INDEX idx_place_geom ON place USING GIST (geom);
CREATE UNIQUE INDEX idx_place_google_maps_id ON place(google_maps_id) WHERE google_maps_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_place_geom()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER place_geom_sync
BEFORE INSERT OR UPDATE OF latitude, longitude ON place
FOR EACH ROW EXECUTE FUNCTION sync_place_geom();

-- Source: channel, program, or work. type drives public behavior
-- (YouTube redirects out; Anime/TV/Other render a managed info page).
CREATE TABLE source (
  id VARCHAR(32) PRIMARY KEY,
  type VARCHAR(16) NOT NULL CHECK (type IN ('YOUTUBE','TV','ANIME','OTHER')),
  name VARCHAR(255) NOT NULL,
  name_en VARCHAR(255), name_ko VARCHAR(255), synopsis TEXT,
  external_url VARCHAR(512),                  -- YouTube redirect or where-to-watch (by type)
  poster_image JSONB,                         -- single MultiSizeImage
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_source_type ON source(type);
CREATE INDEX idx_source_deleted_at ON source(deleted_at);

-- Tag: bilingual, applied to SunreiSpot (spot-level), not Sunrei.
CREATE TABLE tag (
  id VARCHAR(32) PRIMARY KEY,
  label_en VARCHAR(64) NOT NULL, label_ko VARCHAR(64) NOT NULL, description TEXT);
CREATE UNIQUE INDEX idx_tag_label_ko ON tag (lower(label_ko));

-- Sunrei: one video or work item under a Source.
-- published_at NULL = draft; set = published.
CREATE TABLE sunrei (
  id VARCHAR(32) PRIMARY KEY,
  source_id VARCHAR(32) NOT NULL REFERENCES source(id),
  published_at TIMESTAMPTZ,                    -- NULL = draft; set = published
  title VARCHAR(128) NOT NULL, summary TEXT, description TEXT, link VARCHAR(255),
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_sunrei_source_id ON sunrei(source_id);
CREATE INDEX idx_sunrei_published_at ON sunrei(published_at);
CREATE INDEX idx_sunrei_deleted_at ON sunrei(deleted_at);

-- SunreiSpot: one mention of a place under a Sunrei.
CREATE TABLE sunrei_spot (
  id VARCHAR(32) PRIMARY KEY,
  title VARCHAR(128) NOT NULL, context TEXT, youtube_link VARCHAR(255),
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  place_id VARCHAR(32) NOT NULL REFERENCES place(id),
  sunrei_id VARCHAR(32) NOT NULL REFERENCES sunrei(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_sunrei_spot_sunrei_id_deleted_at ON sunrei_spot(sunrei_id, deleted_at);
CREATE INDEX idx_sunrei_spot_place_id_deleted_at ON sunrei_spot(place_id, deleted_at);

-- Spot-level tag join (replaces the old sunrei-level sunrei_tags).
CREATE TABLE sunrei_spot_tags (
  sunrei_spot_id VARCHAR(32) NOT NULL REFERENCES sunrei_spot(id) ON DELETE CASCADE,
  tag_id VARCHAR(32) NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (sunrei_spot_id, tag_id));
CREATE INDEX idx_sst_tag_id ON sunrei_spot_tags(tag_id);

-- Auth tables (existing shape, unchanged behavior).
CREATE TABLE users (
  id VARCHAR(32) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE oauth_providers (
  id VARCHAR(32) PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(64) NOT NULL,
  provider_user_id VARCHAR(64) NOT NULL,
  provider_data TEXT,
  access_token VARCHAR(255),
  refresh_token VARCHAR(255),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, provider),
  UNIQUE(provider, provider_user_id));
CREATE INDEX idx_oauth_providers_user_id ON oauth_providers(user_id);
CREATE INDEX idx_oauth_providers_provider ON oauth_providers(provider);

-- Folded admin reseed (previously V4): one admin account so Google OAuth
-- (linked by email on first login) can access the admin after the content wipe.
INSERT INTO users (id, email, name, role, created_at, updated_at)
VALUES (
  'U00000000000000000000000000',
  'nelson@vcnc.co.kr',
  NULL,
  'admin',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
