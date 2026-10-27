create function public.mc_bulk_grade(p_assignment uuid,p_revision integer,p_patches jsonb,p_question text,p_mark numeric,p_note text,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.mc_assessment_classes; a public.mc_assessment_attempts; patch jsonb; points numeric; doc jsonb; changed uuid[]='{}'; begin
 select * into c from mc_assessment_classes where id=p_assignment for update;
 if not found or c.owner_id<>p_actor or c.revision<>p_revision then raise exception 'Class settings changed. Preview again.'; end if;
 if jsonb_typeof(p_patches)<>'array' or jsonb_array_length(p_patches)<1 or jsonb_array_length(p_patches)>1000 or length(p_note)>4000 then raise exception 'Invalid class adjustment'; end if;
 -- Lock and validate every row before changing anything; a conflict rolls back all.
 for patch in select value from jsonb_array_elements(p_patches) order by value->>'id' loop
  select * into a from mc_assessment_attempts where id=(patch->>'id')::uuid and assignment_id=c.id for update;
  if not found or a.revision<>(patch->>'revision')::integer or a.submitted_at is null then raise exception 'Responses changed. Preview again.'; end if;
  select (q->>'points')::numeric into points from jsonb_array_elements(a.document->'questions') q where q->>'id'=p_question;
  if points is null or p_mark<0 or p_mark>points then raise exception 'Invalid question mark'; end if;
 end loop;
 update mc_assessment_classes set released_at=null,revision=revision+1 where id=c.id;
 for patch in select value from jsonb_array_elements(p_patches) loop
  select * into a from mc_assessment_attempts where id=(patch->>'id')::uuid;
  doc=jsonb_set(a.document,'{marks}',coalesce(a.document->'marks','{}')||jsonb_build_object(p_question,p_mark));
  doc=jsonb_set(doc,'{feedback}',coalesce(doc->'feedback','{}')||jsonb_build_object(p_question,p_note));
  doc=jsonb_set(doc,'{gradeHistory}',coalesce(doc->'gradeHistory','[]')||jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'score',a.score,'marks',a.document->'marks','feedback',a.document->'feedback','by',p_actor,'reason','Class-only matching answer adjustment')));
  update mc_assessment_attempts set document=doc,score=(patch->>'score')::numeric,revision=revision+1 where id=a.id;
  changed=array_append(changed,a.id);
 end loop;
 return to_jsonb(changed);
end $$;
revoke all on function public.mc_bulk_grade(uuid,integer,jsonb,text,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.mc_bulk_grade(uuid,integer,jsonb,text,numeric,text,uuid) to service_role;
