-- Enable PostGIS extension for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

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
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tag (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    description TEXT
);

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

CREATE TABLE IF NOT EXISTS sunrei_spot (
    id VARCHAR(32) PRIMARY KEY,
    title VARCHAR(64) NOT NULL,
    description TEXT,
    youtube_link VARCHAR(255),
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    place_id VARCHAR(32) NOT NULL REFERENCES place(id),
    sunrei_id VARCHAR(32) NOT NULL REFERENCES sunrei(id) ON DELETE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sunrei_tags (
    sunrei_id VARCHAR(32) NOT NULL REFERENCES sunrei(id) ON DELETE CASCADE,
    tag_id VARCHAR(32) NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    PRIMARY KEY (sunrei_id, tag_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sunrei_created_at ON sunrei(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sunrei_deleted_at ON sunrei(deleted_at);
CREATE INDEX IF NOT EXISTS idx_sunrei_spot_sunrei_id_deleted_at ON sunrei_spot(sunrei_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_sunrei_spot_place_id_deleted_at ON sunrei_spot(place_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_sunrei_tags_sunrei_id ON sunrei_tags(sunrei_id);
CREATE INDEX IF NOT EXISTS idx_sunrei_tags_tag_id ON sunrei_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_place_location ON place(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_place_is_closed ON place(is_closed);

-- Create spatial index for efficient geospatial queries
CREATE INDEX IF NOT EXISTS idx_place_geom ON place USING GIST (geom);

-- Create GIN index for JSONB columns for better JSON query performance
CREATE INDEX IF NOT EXISTS idx_sunrei_images ON sunrei USING GIN (images);
CREATE INDEX IF NOT EXISTS idx_sunrei_spot_images ON sunrei_spot USING GIN (images);

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

-- Add comments for documentation
COMMENT ON TABLE sunrei IS 'Main table for Sunrei (pilgrimage) entries';
COMMENT ON TABLE sunrei_spot IS 'Individual spots/locations within a Sunrei';
COMMENT ON TABLE place IS 'Physical locations referenced by Sunrei spots';
COMMENT ON TABLE tag IS 'Tags for categorizing Sunrei entries';
COMMENT ON TABLE sunrei_tags IS 'Junction table for many-to-many relationship between Sunrei and tags';

COMMENT ON COLUMN sunrei.images IS 'Array of MultiSizeImage objects in JSONB format: [{images: [{url, width, height}]}]';
COMMENT ON COLUMN sunrei.deleted_at IS 'Timestamp when the Sunrei was soft deleted';
COMMENT ON COLUMN sunrei_spot.images IS 'Array of MultiSizeImage objects in JSONB format: [{images: [{url, width, height}]}]';
COMMENT ON COLUMN sunrei_spot.deleted_at IS 'Timestamp when the Sunrei spot was soft deleted';
COMMENT ON COLUMN place.is_closed IS 'Whether the place is permanently closed or no longer exists';
COMMENT ON COLUMN place.closed_reason IS 'Reason for closure (e.g., "Permanently closed", "Demolished", "Relocated")';
COMMENT ON COLUMN place.closed_at IS 'Date when the place was closed or ceased to exist';
COMMENT ON COLUMN place.notes IS 'Additional notes about the place status or history';
COMMENT ON COLUMN place.geom IS 'PostGIS geometry point for efficient spatial queries (auto-synced with latitude/longitude)';