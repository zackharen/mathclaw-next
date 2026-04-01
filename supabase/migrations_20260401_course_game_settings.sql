create table if not exists public.course_game_settings (
  course_id uuid not null references public.courses(id) on delete cascade,
  game_slug text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  primary key (course_id, game_slug)
);
