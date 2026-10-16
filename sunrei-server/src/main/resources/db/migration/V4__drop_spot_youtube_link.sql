-- Contract step of the spot link rename. Copy anything the old server wrote during the V3 rollout.
UPDATE sunrei_spot SET source_link = youtube_link
  WHERE source_link IS NULL AND youtube_link IS NOT NULL;
ALTER TABLE sunrei_spot DROP COLUMN youtube_link;
