-- Minesweeper Race: keep each player's latest board (one character per square)
-- so the teacher can open and look at an individual student's board.
ALTER TABLE public.minesweeper_race_results
  ADD COLUMN IF NOT EXISTS board_state text;
