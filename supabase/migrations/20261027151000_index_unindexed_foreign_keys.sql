-- Performance pass 2026-10-27: cover foreign keys flagged by the Supabase advisor.
create index if not exists mc_assessment_audit_actor_id_idx on public.mc_assessment_audit (actor_id);
create index if not exists mc_assessment_classes_owner_id_idx on public.mc_assessment_classes (owner_id);
create index if not exists mc_desmos_assignments_owner_id_idx on public.mc_desmos_assignments (owner_id);
create index if not exists projector_scene_library_items_folder_teacher_idx on public.projector_scene_library_items (folder_id, teacher_id);
