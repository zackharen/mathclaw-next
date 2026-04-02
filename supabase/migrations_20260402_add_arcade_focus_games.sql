insert into public.games (slug, name, category, description, is_multiplayer)
values
  ('money_counting', 'Money Counting', 'math_skills', 'Count money or build the right amount with quick replayable rounds.', false),
  ('minesweeper', 'Minesweeper', 'arcade', 'Clear the board, flag the mines, and beat the clock.', false),
  ('telling_time', 'Telling Time', 'math_skills', 'Read clocks and set times with fast clock-based rounds.', false)
on conflict (slug) do update
set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_multiplayer = excluded.is_multiplayer;
