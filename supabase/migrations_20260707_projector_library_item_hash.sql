alter table projector_library_items
  add column if not exists content_hash text;

-- Backfill hashes for existing rows so scene-item extraction dedupes against
-- them. Must match lib/projector/scene-item-extraction.mjs:
-- sha256 hex of "<content_type>:<content>" (UTF-8).
update projector_library_items
  set content_hash = encode(extensions.digest(content_type || ':' || content, 'sha256'), 'hex')
  where content_hash is null;

create index if not exists projector_library_items_teacher_hash_idx
  on projector_library_items(teacher_id, content_hash);
