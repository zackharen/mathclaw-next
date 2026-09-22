alter table public.lesson_resources
  add column if not exists item_kind text not null default 'resource',
  add column if not exists definition text;

alter table public.lesson_resources
  drop constraint if exists lesson_resources_resource_type_check,
  drop constraint if exists lesson_resources_check,
  drop constraint if exists lesson_resources_item_kind_check,
  drop constraint if exists lesson_resources_definition_length_check,
  drop constraint if exists lesson_resources_payload_check;

alter table public.lesson_resources
  add constraint lesson_resources_resource_type_check
    check (resource_type in ('none', 'link', 'file')),
  add constraint lesson_resources_item_kind_check
    check (item_kind in ('resource', 'vocabulary')),
  add constraint lesson_resources_definition_length_check
    check (definition is null or char_length(definition) <= 1000),
  add constraint lesson_resources_payload_check
    check (
      (item_kind = 'resource' and resource_type = 'link' and url is not null and storage_path is null)
      or
      (item_kind = 'resource' and resource_type = 'file' and url is null and storage_bucket is not null and storage_path is not null)
      or
      (item_kind = 'vocabulary' and resource_type = 'none' and url is null and storage_path is null)
      or
      (item_kind = 'vocabulary' and resource_type = 'link' and url is not null and storage_path is null)
      or
      (item_kind = 'vocabulary' and resource_type = 'file' and url is null and storage_bucket is not null and storage_path is not null)
    );

create index if not exists lesson_resources_owner_kind_created_idx
  on public.lesson_resources(owner_id, item_kind, created_at desc);

comment on column public.lesson_resources.item_kind is
  'Distinguishes ordinary lesson resources from lesson-associated vocabulary entries.';

comment on column public.lesson_resources.definition is
  'Optional vocabulary definition. Reserved as null for ordinary lesson resources.';
