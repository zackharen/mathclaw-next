-- All answer-bearing tables are private to the server. Authenticated callers use
-- explicitly authorized application endpoints; no direct client writes or reads.
create table public.mc_assessment_drafts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 source_key text not null, week date, title text not null, document jsonb not null,
 revision integer not null default 0, created_at timestamptz not null default now(),
 unique(owner_id,source_key)
);
create table public.mc_assessment_classes (
 id uuid primary key default gen_random_uuid(), draft_id uuid not null references public.mc_assessment_drafts(id),
 course_id uuid not null references public.courses(id), owner_id uuid not null references auth.users(id),
 title text not null, document jsonb not null default '{}', revision integer not null default 0,
 approved_at timestamptz, is_open boolean not null default false, open_at timestamptz, close_at timestamptz,
 time_minutes integer check(time_minutes between 1 and 240), released_at timestamptz,
 created_at timestamptz not null default now(), unique(draft_id,course_id)
);
create table public.mc_assessment_attempts (
 id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.mc_assessment_classes(id),
 user_id uuid not null references auth.users(id), attempt_number integer not null default 1,
 started_at timestamptz not null default now(), submitted_at timestamptz, revision integer not null default 0,
 document jsonb not null, score numeric check(score between 0 and 100),
 unique(assignment_id,user_id,attempt_number)
);
create index on public.mc_assessment_attempts(user_id,assignment_id);
create index on public.mc_assessment_classes(course_id);
create table public.mc_question_versions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 title text not null, skill text not null, document jsonb not null,
 status text not null default 'candidate' check(status in ('candidate','curated','suggestion')),
 approved_at timestamptz, created_at timestamptz not null default now()
);
create index on public.mc_question_versions(owner_id,status);
create table public.mc_desmos_assignments (
 id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id),
 owner_id uuid not null references auth.users(id), title text not null, skills jsonb not null,
 settings jsonb not null default '{"needed":3,"window":4,"intervals":[7,14,30,60]}',
 created_at timestamptz not null default now()
);
create index on public.mc_desmos_assignments(course_id);
create table public.mc_learning_state (
 user_id uuid not null references auth.users(id), course_id uuid not null references public.courses(id),
 document jsonb not null default '{}', revision integer not null default 0,
 primary key(user_id,course_id)
);
create index on public.mc_learning_state(course_id);
create table public.mc_assessment_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id),
 course_id uuid references public.courses(id), action text not null, document jsonb not null,
 created_at timestamptz not null default now()
);
create index on public.mc_assessment_audit(course_id,created_at);
-- Explicitly remove Supabase default grants, then retain only the server role.
do $$ declare t text; begin
 foreach t in array array['mc_assessment_drafts','mc_assessment_classes','mc_assessment_attempts','mc_question_versions','mc_desmos_assignments','mc_learning_state','mc_assessment_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public, anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
-- Serialize access changes against attempt writes. Reject stale saves and use
-- database time for closing/elapsed-time decisions, including a teacher's grant.
create function public.mc_save_attempt(p_id uuid,p_revision integer,p_assignment_revision integer,p_document jsonb,p_submit boolean default false)
returns public.mc_assessment_attempts language plpgsql security invoker set search_path=public as $$
declare a public.mc_assessment_attempts; c public.mc_assessment_classes; g jsonb; opening timestamptz; closing timestamptz; mins integer; begin
 select * into a from public.mc_assessment_attempts where id=p_id;
 if not found then raise exception 'Attempt not found'; end if;
 select * into c from public.mc_assessment_classes where id=a.assignment_id for update;
 select * into a from public.mc_assessment_attempts where id=p_id for update;
 if a.revision<>p_revision or c.revision<>p_assignment_revision then raise exception 'Work changed. Reload before saving.'; end if;
 if a.submitted_at is not null then raise exception 'This attempt is submitted.'; end if;
 g=coalesce(c.document->'grants'->a.user_id::text,'{}');
 opening=coalesce((g->>'open_at')::timestamptz,c.open_at);
 closing=coalesce((g->>'close_at')::timestamptz,c.close_at);
 mins=coalesce((g->>'time_minutes')::integer,c.time_minutes);
 if c.approved_at is null or not (coalesce((g->>'is_open')::boolean,c.is_open) or (opening is not null and clock_timestamp()>=opening)) or (opening is not null and clock_timestamp()<opening) then raise exception 'Assessment is locked.'; end if;
 if (closing is not null and clock_timestamp()>=closing) or (mins is not null and clock_timestamp()>=a.started_at+make_interval(mins=>mins+coalesce((g->>'extra_minutes')::integer,0))) then raise exception 'Time expired. Work is frozen for teacher review.'; end if;
 update public.mc_assessment_attempts set document=p_document,revision=revision+1,submitted_at=case when p_submit then clock_timestamp() else null end where id=p_id returning * into a;
 return a;
end $$;
revoke all on function public.mc_save_attempt(uuid,integer,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.mc_save_attempt(uuid,integer,integer,jsonb,boolean) to service_role;
