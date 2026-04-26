-- Workspace invites — pending invitations to join a workspace.
-- Idempotent: safe to re-run.

create table if not exists workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null check (email = lower(email)),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (workspace_id, email)
);

create index if not exists workspace_invites_email_idx
  on workspace_invites (email);

alter table workspace_invites enable row level security;

-- Members of a workspace can read its invites (to display the pending list).
drop policy if exists "members read workspace invites" on workspace_invites;
create policy "members read workspace invites"
  on workspace_invites for select using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- Members of a workspace can create invites for it.
drop policy if exists "members create workspace invites" on workspace_invites;
create policy "members create workspace invites"
  on workspace_invites for insert with check (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
    and invited_by = auth.uid()
  );

-- Members can revoke (delete) invites for their workspace.
drop policy if exists "members delete workspace invites" on workspace_invites;
create policy "members delete workspace invites"
  on workspace_invites for delete using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- A user can read invites addressed to their email so the bootstrap can resolve them.
drop policy if exists "users read own invites" on workspace_invites;
create policy "users read own invites"
  on workspace_invites for select using (
    email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- A user can mark their own invite as accepted (sets accepted_at).
drop policy if exists "users accept own invites" on workspace_invites;
create policy "users accept own invites"
  on workspace_invites for update using (
    email = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) with check (
    email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
