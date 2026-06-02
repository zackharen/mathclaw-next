alter table projector_library_items
  add column if not exists category text check (
    category in ('Questions', 'Activities', 'Word Walls', 'Data Walls', 'News', 'Announcements')
  );
