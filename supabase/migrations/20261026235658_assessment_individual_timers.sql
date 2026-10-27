create or replace function public.mc_save_attempt(p_id uuid,p_revision integer,p_assignment_revision integer,p_document jsonb,p_submit boolean default false)
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
 mins=case when g ? 'time_minutes' then (g->>'time_minutes')::integer else c.time_minutes end;
 if c.approved_at is null or not (coalesce((g->>'is_open')::boolean,c.is_open) or (opening is not null and clock_timestamp()>=opening)) or (opening is not null and clock_timestamp()<opening) then raise exception 'Assessment is locked.'; end if;
 if (closing is not null and clock_timestamp()>=closing) or (mins is not null and clock_timestamp()>=a.started_at+make_interval(mins=>mins+coalesce((g->>'extra_minutes')::integer,0))) then raise exception 'Time expired. Work is frozen for teacher review.'; end if;
 update public.mc_assessment_attempts set document=p_document,revision=revision+1,submitted_at=case when p_submit then clock_timestamp() else null end where id=p_id returning * into a;
 return a;
end $$;
revoke all on function public.mc_save_attempt(uuid,integer,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.mc_save_attempt(uuid,integer,integer,jsonb,boolean) to service_role;
