-- Minesweeper Race: live class game where everyone clears the same board.
-- All reads and writes go through /api/play/minesweeper-race with the service
-- role, so RLS is enabled with no policies: the round seed (which determines
-- the mine layout) is never readable straight from the browser.

CREATE TABLE IF NOT EXISTS public.minesweeper_race_sessions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id           uuid        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  host_teacher_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status              text        NOT NULL DEFAULT 'lobby'
                                  CHECK (status IN ('lobby', 'racing', 'results', 'ended')),
  current_round       integer     NOT NULL DEFAULT 0,
  board_size          integer     NOT NULL DEFAULT 9 CHECK (board_size BETWEEN 6 AND 22),
  mine_rule           text        NOT NULL DEFAULT 'freeze'
                                  CHECK (mine_rule IN ('freeze', 'restart', 'out')),
  time_limit_seconds  integer     NOT NULL DEFAULT 0 CHECK (time_limit_seconds >= 0),
  round_seed          text,
  round_started_at    timestamptz,
  round_ended_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minesweeper_race_players (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid        NOT NULL REFERENCES public.minesweeper_race_sessions(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name  text        NOT NULL DEFAULT 'Student',
  role          text        NOT NULL DEFAULT 'student' CHECK (role IN ('teacher', 'student')),
  is_playing    boolean     NOT NULL DEFAULT true,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.minesweeper_race_results (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid        NOT NULL REFERENCES public.minesweeper_race_sessions(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  round_number   integer     NOT NULL,
  status         text        NOT NULL DEFAULT 'playing'
                             CHECK (status IN ('playing', 'finished', 'out')),
  revealed_safe  integer     NOT NULL DEFAULT 0,
  mine_hits      integer     NOT NULL DEFAULT 0,
  restarts       integer     NOT NULL DEFAULT 0,
  elapsed_ms     integer,
  finished_at    timestamptz,
  place          integer,
  points         integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id, round_number)
);

CREATE INDEX IF NOT EXISTS minesweeper_race_sessions_course_status_idx
  ON public.minesweeper_race_sessions (course_id, status);
CREATE INDEX IF NOT EXISTS minesweeper_race_sessions_host_teacher_idx
  ON public.minesweeper_race_sessions (host_teacher_id);
CREATE INDEX IF NOT EXISTS minesweeper_race_players_user_idx
  ON public.minesweeper_race_players (user_id);
CREATE INDEX IF NOT EXISTS minesweeper_race_results_user_idx
  ON public.minesweeper_race_results (user_id);

ALTER TABLE public.minesweeper_race_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minesweeper_race_players  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minesweeper_race_results  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.minesweeper_race_sessions FROM anon, authenticated;
REVOKE ALL ON public.minesweeper_race_players  FROM anon, authenticated;
REVOKE ALL ON public.minesweeper_race_results  FROM anon, authenticated;
