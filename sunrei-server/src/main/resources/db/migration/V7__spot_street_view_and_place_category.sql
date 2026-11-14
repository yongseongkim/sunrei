ALTER TABLE place ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT 'OTHER';
ALTER TABLE place ADD CONSTRAINT place_category_check CHECK
    (category IN ('RESTAURANT','CAFE','BAR','SHOP','STAY','SIGHTSEEING','PARK','TRANSPORT','OTHER'));

-- Only an editor-selected viewpoint and its binding are persisted, never provider imagery or metadata.
ALTER TABLE sunrei_spot ADD COLUMN street_view JSONB;
ALTER TABLE sunrei_spot ADD COLUMN street_view_revision BIGINT NOT NULL DEFAULT 0;
