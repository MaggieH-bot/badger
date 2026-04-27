-- Workspace member display: add email column + fix SELECT policy.
-- Required so Assigned To can populate from real workspace members.
-- Idempotent: safe to re-run.

-- 1. Email column (nullable; populated lazily by the app on next login).
alter table workspace_members add column if not exists email text;

-- 2. SECURITY DEFINER helper that returns the workspace_ids the current user
--    is a member of. Using SECURITY DEFINER avoids RLS recursion when used
--    inside a workspace_members SELECT policy.
create or replace function my_workspace_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select workspace_id from public.workspace_members where user_id = auth.uid();
$$;

-- 3. SELECT policy: members can read all memberships of their workspaces
--    (the previous "own row only" policy was too narrow to display the team).
drop policy if exists "members read workspace memberships" on workspace_members;
create policy "members read workspace memberships"
  on workspace_members for select
  using (workspace_id in (select my_workspace_ids()));

-- The old "users can read their own memberships" policy is now subsumed by
-- the new one (your own rows live in your own workspaces). Drop to keep the
-- policy set tidy.
drop policy if exists "users can read their own memberships" on workspace_members;

-- 4. UPDATE policy: users can update their OWN membership row only.
--    The app uses this to lazily write the user's email into their own row
--    on next login (no service-role required).
drop policy if exists "users update own membership" on workspace_members;
create policy "users update own membership"
  on workspace_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
