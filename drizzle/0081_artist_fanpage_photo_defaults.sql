-- Preserve all legacy photos, including galleries above the new upload limit.
-- Select at most ten existing photos for the initial carousel, in the old display order.
INSERT OR IGNORE INTO artist_fanpages(artist_id,photo_order,carousel_ids)
SELECT a.id,
 (SELECT json_group_array(id) FROM (SELECT id FROM artist_photos WHERE artist_id=a.id ORDER BY created DESC,id DESC)),
 (SELECT json_group_array(id) FROM (SELECT id FROM artist_photos WHERE artist_id=a.id ORDER BY created DESC,id DESC LIMIT 10))
FROM artists a WHERE EXISTS(SELECT 1 FROM artist_photos WHERE artist_id=a.id);
