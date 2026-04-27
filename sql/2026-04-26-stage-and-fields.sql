-- V1 stage model + contextual fields.
-- Idempotent: safe to re-run (uses IF NOT EXISTS / drop-and-recreate).
--
-- Stages: lead, listing, active_buyer, under_contract, closed.
-- New columns: list_price, price_range_low, price_range_high, closed_price,
--              next_step (renamed from next_action), next_step_due, sequencing.
-- Migration:
--   prospect → lead
--   active + sell/both → listing
--   active + buy → active_buyer
--   active + null type → lead (best-fit; user can correct)
--   closing → under_contract
--   seller price (listing/under_contract) → list_price
--   any closed price → closed_price
--   buyer price NOT migrated (per direction — too guessy)

-- 1. Add new columns (nullable, no defaults).
alter table deals add column if not exists list_price numeric;
alter table deals add column if not exists price_range_low numeric;
alter table deals add column if not exists price_range_high numeric;
alter table deals add column if not exists closed_price numeric;
alter table deals add column if not exists next_step_due timestamptz;
alter table deals add column if not exists sequencing text;

-- 2. Sequencing CHECK constraint (only meaningful for opportunity_type = 'both';
--    nullable for everyone else).
alter table deals drop constraint if exists deals_sequencing_check;
alter table deals add constraint deals_sequencing_check
  check (sequencing is null or sequencing in ('sell_first', 'buy_first', 'parallel', 'unknown'));

-- 3. Rename next_action → next_step (only if it hasn't been renamed already).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'deals' and column_name = 'next_action'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'deals' and column_name = 'next_step'
  ) then
    alter table deals rename column next_action to next_step;
  end if;
end $$;

-- 4. Migrate stage values BEFORE redefining the CHECK constraint.
update deals set stage = 'lead'
  where stage = 'prospect';

update deals set stage = 'listing'
  where stage = 'active' and opportunity_type in ('sell', 'both');

update deals set stage = 'active_buyer'
  where stage = 'active' and opportunity_type = 'buy';

update deals set stage = 'lead'
  where stage = 'active' and opportunity_type is null;

update deals set stage = 'under_contract'
  where stage = 'closing';

-- 5. Drop and re-add the stage CHECK constraint with the new vocabulary.
alter table deals drop constraint if exists deals_stage_check;
alter table deals add constraint deals_stage_check
  check (stage in ('lead', 'listing', 'active_buyer', 'under_contract', 'closed'));

-- 6. Migrate seller / closed prices into the new typed columns.
--    Buyer prices are intentionally NOT migrated; user will fill price_range_low/high.
update deals
  set list_price = price
  where price is not null
    and list_price is null
    and opportunity_type in ('sell', 'both')
    and stage in ('listing', 'under_contract');

update deals
  set closed_price = price
  where price is not null
    and closed_price is null
    and stage = 'closed';

-- The existing `price` column is left in place (deprecated, read-only from the
-- app's perspective). Drop it later once we're confident nothing references it.
