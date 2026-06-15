-- 15W-69: archive leads — set stalled records aside without deleting.
-- Adds a reversible `archived` flag (orthogonal to stage/category). Archived
-- deals drop out of Today / Pipeline / Badger insights but are never deleted;
-- they remain restorable from the Archived view.
-- Idempotent — safe to re-run.

alter table public.deals
  add column if not exists archived boolean not null default false;

alter table public.deals
  add column if not exists archived_at timestamptz;

-- Active-view queries filter on archived; index keeps that cheap.
create index if not exists deals_archived_idx on public.deals (archived);
