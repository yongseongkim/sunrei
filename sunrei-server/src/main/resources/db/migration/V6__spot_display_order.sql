-- Stable order within a Sunrei; never rewrite creation dates to arrange content.
ALTER TABLE sunrei_spot ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0
  CHECK (sort_order >= 0);

WITH ordered AS (
  SELECT id, (ROW_NUMBER() OVER (
    PARTITION BY sunrei_id ORDER BY created_at, id
  ) - 1)::INTEGER AS position
  FROM sunrei_spot
)
UPDATE sunrei_spot spot SET sort_order = ordered.position
FROM ordered WHERE spot.id = ordered.id;

CREATE INDEX idx_sunrei_spot_display_order
  ON sunrei_spot (sunrei_id, sort_order, id) WHERE deleted_at IS NULL;
