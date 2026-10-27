begin;
do $$
declare t text; d uuid; c uuid; a uuid; a2 uuid; rev integer; saved public.mc_assessment_attempts; owner_uuid uuid='1fd7cb6e-265a-431e-831d-8f9fada5d5dd'; course_uuid uuid='06343a4e-5f93-4b56-aabb-4a3464f885ae'; begin
 foreach t in array array['mc_assessment_drafts','mc_assessment_classes','mc_assessment_attempts','mc_question_versions','mc_desmos_assignments','mc_learning_state','mc_assessment_audit'] loop
  if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'RLS missing %',t; end if;
  if has_table_privilege('anon','public.'||t,'SELECT') or has_table_privilege('authenticated','public.'||t,'SELECT') or has_table_privilege('authenticated','public.'||t,'INSERT') or has_table_privilege('authenticated','public.'||t,'UPDATE') then raise exception 'Browser grant leak %',t; end if;
 end loop;
 if has_function_privilege('authenticated','public.mc_save_attempt(uuid,integer,integer,jsonb,boolean)','EXECUTE') then raise exception 'Browser RPC grant leak'; end if;
 insert into mc_assessment_drafts(owner_id,source_key,title,document) values(owner_uuid,'rollback-qa-'||gen_random_uuid(),'Transactional QA','{}') returning id into d;
 insert into mc_assessment_classes(draft_id,course_id,owner_id,title,approved_at,is_open) values(d,course_uuid,owner_uuid,'Transactional QA',now(),true) returning id into c;
 insert into mc_assessment_attempts(assignment_id,user_id,document) values(c,owner_uuid,'{"work":{}}') returning id into a;
 saved=mc_save_attempt(a,0,0,'{"work":{"q":{"answer":"saved"}}}',false);
 if saved.revision<>1 or saved.submitted_at is not null then raise exception 'Save contract'; end if;
 begin perform mc_save_attempt(a,0,0,'{}',false); raise exception 'Stale save accepted'; exception when raise_exception then if SQLERRM='Stale save accepted' then raise; end if; end;
 update mc_assessment_classes set is_open=false,revision=revision+1 where id=c;
 begin perform mc_save_attempt(a,1,1,'{}',true); raise exception 'Locked submit accepted'; exception when raise_exception then if SQLERRM='Locked submit accepted' then raise; end if; end;
 update mc_assessment_classes set is_open=true,time_minutes=1,revision=revision+1 where id=c;
 update mc_assessment_attempts set started_at=clock_timestamp()-interval '2 minutes' where id=a;
 begin perform mc_save_attempt(a,1,2,'{}',true); raise exception 'Expired submit accepted'; exception when raise_exception then if SQLERRM='Expired submit accepted' then raise; end if; end;
 if (select submitted_at is not null from mc_assessment_attempts where id=a) then raise exception 'Expiry auto-submitted'; end if;
 update mc_assessment_classes set document=jsonb_build_object('grants',jsonb_build_object(owner_uuid::text,jsonb_build_object('extra_minutes',5))),revision=revision+1 where id=c;
 saved=mc_save_attempt(a,1,3,'{"work":{"q":{"answer":"resumed"}}}',false);
 if saved.document->'work'->'q'->>'answer'<>'resumed' then raise exception 'Extension/resume failed'; end if;
 update mc_assessment_classes set close_at=clock_timestamp()-interval '1 second',revision=revision+1 where id=c;
 begin perform mc_save_attempt(a,2,4,'{}',false); raise exception 'Closing save accepted'; exception when raise_exception then if SQLERRM='Closing save accepted' then raise; end if; end;
 update mc_assessment_classes set close_at=null,revision=revision+1 where id=c;
 saved=mc_save_attempt(a,2,5,'{"work":{"q":{"answer":"final"}}}',true);
 if saved.submitted_at is null then raise exception 'Voluntary submit failed'; end if;
 begin perform mc_save_attempt(a,3,5,'{}',false); raise exception 'Submitted write accepted'; exception when raise_exception then if SQLERRM='Submitted write accepted' then raise; end if; end;
 if has_function_privilege('authenticated','public.mc_bulk_grade(uuid,integer,jsonb,text,numeric,text,uuid)','EXECUTE') or has_function_privilege('anon','public.mc_bulk_grade(uuid,integer,jsonb,text,numeric,text,uuid)','EXECUTE') then raise exception 'Bulk RPC browser grant leak'; end if;
 update mc_assessment_attempts set document='{"questions":[{"id":"q","points":3}],"marks":{"q":0}}',score=0 where id=a;
 insert into mc_assessment_attempts(assignment_id,user_id,attempt_number,submitted_at,document,score) values(c,owner_uuid,2,now(),'{"questions":[{"id":"q","points":3}],"marks":{"q":0}}',0) returning id into a2;
 begin
  perform mc_bulk_grade(c,5,jsonb_build_array(jsonb_build_object('id',a,'revision',3,'score',50),jsonb_build_object('id',a2,'revision',99,'score',50)),'q',1.5,'QA',owner_uuid);
  raise exception 'Stale bulk adjustment accepted';
 exception when raise_exception then if SQLERRM='Stale bulk adjustment accepted' then raise; end if; end;
 if exists(select 1 from mc_assessment_attempts where id in(a,a2) and score<>0) or (select revision from mc_assessment_classes where id=c)<>5 then raise exception 'Bulk adjustment partially committed'; end if;
 perform mc_bulk_grade(c,5,jsonb_build_array(jsonb_build_object('id',a,'revision',3,'score',50),jsonb_build_object('id',a2,'revision',0,'score',50)),'q',1.5,'QA',owner_uuid);
 if exists(select 1 from mc_assessment_attempts where id in(a,a2) and (score<>50 or jsonb_array_length(document->'gradeHistory')<>1)) then raise exception 'Bulk adjustment history failed'; end if;
end $$;
rollback;
select 'PASS: private grants/RLS, stale saves, manual locks, elapsed expiry, teacher extension, close freeze, voluntary submission, post-submit immutability, atomic bulk grades and history; all fixture changes rolled back' as result;
