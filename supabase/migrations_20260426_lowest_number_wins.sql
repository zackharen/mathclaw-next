-- Lowest Number Wins: live classroom game
-- Players each submit a number; whoever picks the lowest number that no one else picked wins.

CREATE TABLE lowest_number_wins_sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         uuid        REFERENCES courses(id) ON DELETE CASCADE,
  host_teacher_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status            text        NOT NULL DEFAULT 'waiting'
                                CHECK (status IN ('waiting', 'picking', 'revealed', 'ended')),
  current_round     integer     NOT NULL DEFAULT 0,
  number_type       text        NOT NULL DEFAULT 'integers'
                                CHECK (number_type IN ('integers', 'decimals')),
  metadata          jsonb       NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lowest_number_wins_players (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid        NOT NULL REFERENCES lowest_number_wins_sessions(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  display_name  text        NOT NULL DEFAULT 'Student',
  role          text        NOT NULL DEFAULT 'student' CHECK (role IN ('teacher', 'student')),
  total_wins    integer     NOT NULL DEFAULT 0,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE TABLE lowest_number_wins_picks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid        NOT NULL REFERENCES lowest_number_wins_sessions(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  round_number  integer     NOT NULL,
  value         numeric     NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id, round_number)
);

-- Indexes for common query patterns
CREATE INDEX ON lowest_number_wins_players (session_id);
CREATE INDEX ON lowest_number_wins_picks (session_id, round_number);

-- RLS
ALTER TABLE lowest_number_wins_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lowest_number_wins_players  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lowest_number_wins_picks    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lnw_sessions: authenticated read"
  ON lowest_number_wins_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "lnw_players: authenticated read"
  ON lowest_number_wins_players FOR SELECT
  TO authenticated
  USING (true);

-- Picks are hidden from other students until the session is in revealed or ended state,
-- or the row belongs to the current user.
CREATE POLICY "lnw_picks: own or revealed"
  ON lowest_number_wins_picks FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM lowest_number_wins_sessions s
      WHERE s.id = session_id
        AND s.status IN ('revealed', 'ended')
    )
  );
