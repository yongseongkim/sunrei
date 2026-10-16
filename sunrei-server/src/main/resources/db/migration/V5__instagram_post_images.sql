-- Copies of a post's images in Sunrei's image storage: a reel's cover, a photo, or up to
-- five carousel items, each in several sizes. Instagram's own image URLs expire, so only
-- the copies are kept. Spots approved from the post take these as their images.
ALTER TABLE instagram_post ADD COLUMN images JSONB NOT NULL DEFAULT '[]'::jsonb;
