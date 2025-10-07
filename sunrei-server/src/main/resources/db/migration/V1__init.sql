-- Enable PostGIS extension for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Place
CREATE TABLE IF NOT EXISTS place (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    address VARCHAR(255) NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    geom geometry(Point, 4326) NOT NULL,
    google_maps_id VARCHAR(255),
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    closed_reason VARCHAR(255),
    closed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_place_location ON place(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_place_is_closed ON place(is_closed);
-- For Spatial index
CREATE INDEX IF NOT EXISTS idx_place_geom ON place USING GIST (geom);

-- Add trigger to keep geom in sync with latitude/longitude updates
CREATE OR REPLACE FUNCTION sync_place_geom()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER place_geom_sync
BEFORE INSERT OR UPDATE OF latitude, longitude ON place
FOR EACH ROW
EXECUTE FUNCTION sync_place_geom();

COMMENT ON COLUMN place.geom IS 'PostGIS geometry point for efficient spatial queries (auto-synced with latitude/longitude)';

-- Sunrei
CREATE TABLE IF NOT EXISTS sunrei (
    id VARCHAR(32) PRIMARY KEY,
    title VARCHAR(128) NOT NULL,
    description TEXT,
    link VARCHAR(255),
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sunrei_created_at ON sunrei(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sunrei_deleted_at ON sunrei(deleted_at);

-- SunreiSpot
CREATE TABLE IF NOT EXISTS sunrei_spot (
    id VARCHAR(32) PRIMARY KEY,
    title VARCHAR(128) NOT NULL,
    description TEXT,
    youtube_link VARCHAR(255),
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    place_id VARCHAR(32) NOT NULL REFERENCES place(id),
    sunrei_id VARCHAR(32) NOT NULL REFERENCES sunrei(id) ON DELETE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sunrei_spot_sunrei_id_deleted_at ON sunrei_spot(sunrei_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_sunrei_spot_place_id_deleted_at ON sunrei_spot(place_id, deleted_at);

-- Tag
CREATE TABLE IF NOT EXISTS tag (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    description TEXT
);
CREATE TABLE IF NOT EXISTS sunrei_tags (
    sunrei_id VARCHAR(32) NOT NULL REFERENCES sunrei(id) ON DELETE CASCADE,
    tag_id VARCHAR(32) NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    PRIMARY KEY (sunrei_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_sunrei_tags_sunrei_id ON sunrei_tags(sunrei_id);
CREATE INDEX IF NOT EXISTS idx_sunrei_tags_tag_id ON sunrei_tags(tag_id);
