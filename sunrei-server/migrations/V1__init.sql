CREATE TABLE IF NOT EXISTS place (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    address VARCHAR(255) NOT NULL,
    latitude FLOAT8 NOT NULL,
    longitude FLOAT8 NOT NULL,
    google_maps_id VARCHAR(255),

    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sunrei (
    id VARCHAR(32) PRIMARY KEY,
    title VARCHAR(64) NOT NULL,
    description TEXT,
    link VARCHAR(255) NULL,
    images JSONB NOT NULL DEFAULT '[]',

    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sunrei_created_at ON sunrei (created_at);

CREATE TABLE IF NOT EXISTS sunrei_spot (
    id VARCHAR(32) PRIMARY KEY,
    title VARCHAR(64) NOT NULL,
    description TEXT NULL,
    youtube_link VARCHAR(255) NULL,
    images JSONB NOT NULL DEFAULT '[]',
    place_id VARCHAR(32) NOT NULL,
    sunrei_id VARCHAR(32) NOT NULL,

    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sunrei_spot_place_id ON sunrei_spot (place_id);
CREATE INDEX idx_sunrei_spot_sunrei_id ON sunrei_spot (sunrei_id);
CREATE INDEX idx_sunrei_spot_created_at ON sunrei_spot (created_at);

CREATE TABLE IF NOT EXISTS tag (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(32) NOT NULL UNIQUE,
    description VARCHAR(255),

    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tag_name ON tag (name);

CREATE TABLE IF NOT EXISTS sunrei_tag (
    tag_id VARCHAR(32) NOT NULL,
    sunrei_id VARCHAR(32) NOT NULL,
    
    PRIMARY KEY (tag_id, sunrei_id)
);

CREATE INDEX idx_sunrei_tag_tag_id ON sunrei_tag (tag_id);
CREATE INDEX idx_sunrei_tag_sunrei_id ON sunrei_tag (sunrei_id);
