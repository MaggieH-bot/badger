-- Drop legacy CHECK constraints on assignee / author columns so the V1
-- workspace-member model can write user_ids (UUIDs) and empty string for
-- Unassigned. Pre-V1 schema constrained these columns to the hardcoded
-- {'You','TC','VA','Partner'} set, which now blocks every new save.
--
-- Idempotent: silently no-ops if a table has no matching CHECK.

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.deals'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%assigned_to%'
  loop
    execute format('alter table public.deals drop constraint %I', c.conname);
    raise notice 'Dropped CHECK on deals: %', c.conname;
  end loop;

  for c in
    select conname from pg_constraint
    where conrelid = 'public.contact_log_entries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%author%'
  loop
    execute format('alter table public.contact_log_entries drop constraint %I', c.conname);
    raise notice 'Dropped CHECK on contact_log_entries: %', c.conname;
  end loop;

  for c in
    select conname from pg_constraint
    where conrelid = 'public.notes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%author%'
  loop
    execute format('alter table public.notes drop constraint %I', c.conname);
    raise notice 'Dropped CHECK on notes: %', c.conname;
  end loop;

  for c in
    select conname from pg_constraint
    where conrelid = 'public.documents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%author%'
  loop
    execute format('alter table public.documents drop constraint %I', c.conname);
    raise notice 'Dropped CHECK on documents: %', c.conname;
  end loop;
end $$;
