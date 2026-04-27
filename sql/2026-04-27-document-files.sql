-- Document file uploads — adds file metadata columns and a private Supabase
-- Storage bucket scoped to workspace membership.
-- Idempotent: safe to re-run.

-- 1. Schema additions on `documents`. All new columns are nullable; existing
--    text-only document rows keep working unchanged.
alter table documents add column if not exists file_path text;
alter table documents add column if not exists file_name text;
alter table documents add column if not exists file_size bigint;
alter table documents add column if not exists file_mime text;

-- Allow file-only documents (no notes/content). The text content is now
-- optional alongside file uploads.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'documents'
      and column_name = 'content'
      and is_nullable = 'NO'
  ) then
    alter table documents alter column content drop not null;
  end if;
end $$;

-- 2. Storage bucket — private, PDF-only, 25 MB cap.
--    File path scheme used by the app: {workspace_id}/{deal_id}/{document_id}.pdf
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-documents', 'client-documents', false, 26214400, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 3. Storage RLS — workspace members can read / upload / delete files inside
--    their own workspace's folder. (storage.foldername(name))[1] returns the
--    first directory level of the object path, which by convention is the
--    workspace_id (UUID rendered as text).

drop policy if exists "members read client-documents" on storage.objects;
create policy "members read client-documents"
  on storage.objects for select using (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from workspace_members where user_id = auth.uid()
    )
  );

drop policy if exists "members upload client-documents" on storage.objects;
create policy "members upload client-documents"
  on storage.objects for insert with check (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from workspace_members where user_id = auth.uid()
    )
  );

drop policy if exists "members delete client-documents" on storage.objects;
create policy "members delete client-documents"
  on storage.objects for delete using (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from workspace_members where user_id = auth.uid()
    )
  );
