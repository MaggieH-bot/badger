-- 15W-70 Phase 0: link the two sides of a both-sided client.
-- A both-sided client is modeled as two single-sided deals (a buy deal + a
-- sell deal) tied together by linked_deal_id. Each side keeps its own stage,
-- price, GCI, and Badger nudges; the link just pairs them.
-- Backward compatible — existing `both` deals are untouched (null link).
-- Idempotent — safe to re-run.

alter table public.deals
  add column if not exists linked_deal_id uuid references public.deals (id) on delete set null;

-- Look up a deal's partner side cheaply.
create index if not exists deals_linked_deal_id_idx on public.deals (linked_deal_id);
