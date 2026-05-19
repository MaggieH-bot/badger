-- Badger base schema — creates every table the app expects, in its current
-- shape, with RLS enabled and policies that match production behavior.
--
-- Reconstructed from the app's TypeScript row types and API code because the
-- original prod schema was set up via the Supabase dashboard and never
-- captured as SQL. Apply this once to a fresh Supabase project (e.g. the
-- badger-sandbox project) and the app will work against it.
--
-- The five 2026-04-26 → 2026-04-28 incremental migration files in this
-- folder describe how production was upgraded over time. On a database
-- where this base schema has already been applied, those incremental
-- migrations are idempotent no-ops — they can be applied for completeness
-- but are not required.
--
-- Idempotent: safe to re-run. Uses IF NOT EXISTS, DROP IF EXISTS + CREATE,
-- and CREATE OR REPLACE throughout.

-- ---------------------------------------------------------------------------
-- 1. Workspaces (root tenant table)
-- ---------------------------------------------------------------------------

create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

alter table public.workspaces enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Workspace members (user ↔ workspace join with role)
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member',
  email        text,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspace_members enable row level security;

-- SECURITY DEFINER helper. Returns the workspace_ids the current user is a
-- member of, bypassing the workspace_members RLS (which would otherwise
-- recurse when used inside its own SELECT policy).
create or replace function public.my_workspace_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select workspace_id from public.workspace_members where user_id = auth.uid();
$$;

-- Workspaces RLS
drop policy if exists "members read workspaces" on public.workspaces;
create policy "members read workspaces"
  on public.workspaces for select
  using (id in (select public.my_workspace_ids()));

-- A creator can always read what they just made (recovery path for partial signups).
drop policy if exists "creators read workspaces" on public.workspaces;
create policy "creators read workspaces"
  on public.workspaces for select
  using (created_by = auth.uid());

drop policy if exists "users create workspaces" on public.workspaces;
create policy "users create workspaces"
  on public.workspaces for insert
  with check (created_by = auth.uid());

drop policy if exists "members update workspaces" on public.workspaces;
create policy "members update workspaces"
  on public.workspaces for update
  using (id in (select public.my_workspace_ids()))
  with check (id in (select public.my_workspace_ids()));

-- Workspace members RLS
drop policy if exists "members read workspace memberships" on public.workspace_members;
create policy "members read workspace memberships"
  on public.workspace_members for select
  using (workspace_id in (select public.my_workspace_ids()));

drop policy if exists "users insert own membership" on public.workspace_members;
create policy "users insert own membership"
  on public.workspace_members for insert
  with check (user_id = auth.uid());

drop policy if exists "users update own membership" on public.workspace_members;
create policy "users update own membership"
  on public.workspace_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Workspace invites (pending invitations)
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        text not null check (email = lower(email)),
  invited_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (workspace_id, email)
);

create index if not exists workspace_invites_email_idx
  on public.workspace_invites (email);

alter table public.workspace_invites enable row level security;

drop policy if exists "members read workspace invites" on public.workspace_invites;
create policy "members read workspace invites"
  on public.workspace_invites for select using (
    workspace_id in (select public.my_workspace_ids())
  );

drop policy if exists "members create workspace invites" on public.workspace_invites;
create policy "members create workspace invites"
  on public.workspace_invites for insert with check (
    workspace_id in (select public.my_workspace_ids())
    and invited_by = auth.uid()
  );

drop policy if exists "members delete workspace invites" on public.workspace_invites;
create policy "members delete workspace invites"
  on public.workspace_invites for delete using (
    workspace_id in (select public.my_workspace_ids())
  );

drop policy if exists "users read own invites" on public.workspace_invites;
create policy "users read own invites"
  on public.workspace_invites for select using (
    email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "users accept own invites" on public.workspace_invites;
create policy "users accept own invites"
  on public.workspace_invites for update using (
    email = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) with check (
    email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- ---------------------------------------------------------------------------
-- 4. Deals (the main pipeline record)
-- ---------------------------------------------------------------------------

create table if not exists public.deals (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  client_name       text not null,
  category          text not null default 'nurture',
  opportunity_type  text,
  probability       integer,
  comments          text,
  stage             text not null default 'lead',
  assigned_to       text not null default '',
  address           text,
  phone             text,
  email             text,
  next_step         text,
  next_step_due     timestamptz,

  -- Context-aware price family. The legacy `price` column is preserved
  -- read-only; the app writes the typed columns below.
  list_price        numeric,
  price_range_low   numeric,
  price_range_high  numeric,
  closed_price      numeric,
  price             numeric,

  sequencing        text,

  target_timeframe  text,
  area_of_interest  text,
  motivation        text,
  blocker           text,
  lead_source       text,

  last_contact      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id)
);

-- Constraints (added separately so re-runs can DROP IF EXISTS + ADD).
alter table public.deals drop constraint if exists deals_stage_check;
alter table public.deals add constraint deals_stage_check
  check (stage in ('lead', 'listing', 'active_buyer', 'under_contract', 'closed'));

alter table public.deals drop constraint if exists deals_category_check;
alter table public.deals add constraint deals_category_check
  check (category in ('hot', 'nurture', 'watch'));

alter table public.deals drop constraint if exists deals_opportunity_type_check;
alter table public.deals add constraint deals_opportunity_type_check
  check (opportunity_type is null or opportunity_type in ('buy', 'sell', 'both', 'rent'));

alter table public.deals drop constraint if exists deals_probability_check;
alter table public.deals add constraint deals_probability_check
  check (probability is null or (probability >= 0 and probability <= 100));

alter table public.deals drop constraint if exists deals_sequencing_check;
alter table public.deals add constraint deals_sequencing_check
  check (sequencing is null or sequencing in ('sell_first', 'buy_first', 'parallel', 'unknown'));

create index if not exists deals_workspace_id_idx on public.deals (workspace_id);
create index if not exists deals_stage_idx on public.deals (stage);

alter table public.deals enable row level security;

drop policy if exists "members access deals" on public.deals;
create policy "members access deals"
  on public.deals for all
  using (workspace_id in (select public.my_workspace_ids()))
  with check (workspace_id in (select public.my_workspace_ids()));

-- ---------------------------------------------------------------------------
-- 5. Contact log entries (touches: calls, texts, emails, in-person, other)
-- ---------------------------------------------------------------------------

create table if not exists public.contact_log_entries (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  timestamp  timestamptz not null default now(),
  method     text not null,
  author     text not null default '',
  note       text not null,
  created_at timestamptz not null default now()
);

create index if not exists contact_log_entries_deal_id_idx
  on public.contact_log_entries (deal_id);

alter table public.contact_log_entries enable row level security;

drop policy if exists "members access contact_log_entries" on public.contact_log_entries;
create policy "members access contact_log_entries"
  on public.contact_log_entries for all
  using (
    deal_id in (
      select id from public.deals where workspace_id in (select public.my_workspace_ids())
    )
  )
  with check (
    deal_id in (
      select id from public.deals where workspace_id in (select public.my_workspace_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Notes (freeform observations on a deal)
-- ---------------------------------------------------------------------------

create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  author     text not null default '',
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_deal_id_idx on public.notes (deal_id);

alter table public.notes enable row level security;

drop policy if exists "members access notes" on public.notes;
create policy "members access notes"
  on public.notes for all
  using (
    deal_id in (
      select id from public.deals where workspace_id in (select public.my_workspace_ids())
    )
  )
  with check (
    deal_id in (
      select id from public.deals where workspace_id in (select public.my_workspace_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Documents (file uploads + text notes on a deal)
-- ---------------------------------------------------------------------------

create table if not exists public.documents (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  title      text not null,
  type       text not null,
  author     text not null default '',
  content    text,
  file_path  text,
  file_name  text,
  file_size  bigint,
  file_mime  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents drop constraint if exists documents_type_check;
alter table public.documents add constraint documents_type_check
  check (type in ('agreement', 'disclosure', 'inspection', 'addendum', 'correspondence', 'other'));

create index if not exists documents_deal_id_idx on public.documents (deal_id);

alter table public.documents enable row level security;

drop policy if exists "members access documents" on public.documents;
create policy "members access documents"
  on public.documents for all
  using (
    deal_id in (
      select id from public.deals where workspace_id in (select public.my_workspace_ids())
    )
  )
  with check (
    deal_id in (
      select id from public.deals where workspace_id in (select public.my_workspace_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Storage bucket for document uploads (private, PDF-only, 25 MB cap)
--    File path scheme used by the app: {workspace_id}/{deal_id}/{document_id}.pdf
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-documents', 'client-documents', false, 26214400, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS: workspace members read/write/delete inside their own workspace's folder.
drop policy if exists "members read client-documents" on storage.objects;
create policy "members read client-documents"
  on storage.objects for select using (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid()
    )
  );

drop policy if exists "members upload client-documents" on storage.objects;
create policy "members upload client-documents"
  on storage.objects for insert with check (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid()
    )
  );

drop policy if exists "members delete client-documents" on storage.objects;
create policy "members delete client-documents"
  on storage.objects for delete using (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid()
    )
  );
