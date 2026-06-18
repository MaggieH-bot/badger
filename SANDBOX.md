# Badger sandbox & deployment workflow

This file is the runbook for working on Badger safely. Read it once before
your first change; refer back to it whenever you set up a new machine, write
a migration, or promote a change to production.

## Two-tier model

| Tier | Branch | Vercel target | Supabase project |
|---|---|---|---|
| Production | `main` | Production (`badger-wheat.vercel.app`) | live Badger Supabase |
| Work + integration | `staging` | Preview (alias `badger-git-staging-…vercel.app`) | `badger-sandbox` |

Routine work happens directly on `staging` — there is no separate feature-branch
tier. See the Branch model and Daily workflow sections below.

Production data is never touched by preview deploys. Auth, schema, RLS, and
storage all live in the sandbox project for non-prod work.

## One-time setup checklist

### Supabase sandbox project

- [x] Create a new Supabase project named `badger-sandbox`.
  - Project ref: `eljekklabrxlzoisqxwq`
  - URL: `https://eljekklabrxlzoisqxwq.supabase.co`
- [ ] In the sandbox SQL Editor, paste and run **one file**:
  `sql/2026-04-25-base-schema.sql`

  That file creates every table, index, RLS policy, and the storage bucket
  the app needs, in their current shape. It's a reconstruction of prod's
  schema (the original prod tables were created via the Supabase dashboard
  rather than versioned SQL). The four 2026-04-26 → 2026-04-28 files in this
  folder are incremental migrations that document how prod was upgraded over
  time; on a fresh sandbox they're idempotent no-ops and don't need to be
  applied.

  If the sandbox later drifts from prod, treat that as a real bug and patch
  it through the migration runbook below — don't hand-edit the base schema.
- [ ] Authentication → URL Configuration
  - Site URL: `https://badger-git-staging-maggieh-bots-projects.vercel.app`
  - Redirect URLs (add each):
    - `https://badger-*-maggieh-bots-projects.vercel.app/**`
    - `https://badger-git-*-maggieh-bots-projects.vercel.app/**`
    - `http://localhost:5173/**`
- [ ] Optional: create a `client-documents` storage bucket if you'll exercise
  document upload flows on previews.

### Production Supabase project

Leave its redirect URLs **tight** — production should only redirect to the
production domain. Do not add preview wildcards to the production project.

### Vercel environment variables

In the Vercel dashboard → Badger project → Settings → Environment Variables,
each of `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` is split by scope:

| Variable | Production scope | Preview + Development scope |
|---|---|---|
| `VITE_SUPABASE_URL` | live Badger URL | `https://eljekklabrxlzoisqxwq.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | live key | sandbox publishable key (`sb_publishable_…`) |

The sandbox publishable key is held in your Supabase dashboard
(Settings → API). It is treated as a public client key — it ships in the
browser bundle — but is not committed to this repo. Add it directly in
Vercel.

After saving, the next push to a non-`main` branch picks up the sandbox
values automatically. Existing previews can be redeployed manually from
the Vercel dashboard if you want them to switch.

### GitHub branch protection (optional but recommended)

- `main`: require PR, restrict pushes to PRs merged from `staging`, no
  force-push.
- `staging`: require PR, no force-push.

These are dashboard settings under Repository → Settings → Branches. The
workflow rules below still apply even without protection turned on.

## Branch model

- **`main`** — production. Receives merges only from `staging`, and only via a
  PR after explicit approval. Never commit directly. Never force-push (except
  rollback, with explicit approval).
- **`staging`** — the working branch. Routine iteration is committed **directly
  to `staging`** and tested on the staging preview. No `dev/*` feature branches
  or PRs for normal work. Promoted to `main` only on approval.

## Daily workflow

Work directly on `staging`:

```
git switch staging
git pull
# … edit, run `npm run lint` and `npm run build` locally …
git commit -m "…"
git push origin staging
```

1. Vercel auto-builds the staging preview against the sandbox Supabase, at
   `https://badger-git-staging-maggieh-bots-projects.vercel.app`.
2. Magic-link sign-in works there because the sandbox redirect URLs allow the
   `badger-git-*` pattern.
3. Test on the staging preview. Iterate directly on `staging`.

No `dev/*` branches and no PRs for routine staging work — commit straight to
`staging`.

## Promoting to production

The **only** PR is `staging` → `main`, and it ships to production:

1. Confirm staging is verified end-to-end on its preview.
2. Open a PR `staging` → `main`.
3. Merge **only after explicit approval**. Merging to `main` triggers the
   production deploy.

Never edit `main` directly. Never force-push.

## Migration runbook

Migrations live in `sql/` with `YYYY-MM-DD-short-name.sql` filenames. Keep each
migration self-contained. All migrations are idempotent (`IF EXISTS` guards,
`do $$ ... end$$` loops, `COMMENT ON …` overwrites).

1. Write the SQL on `staging` in `sql/<date>-<name>.sql`.
2. Apply to **sandbox** Supabase via its SQL Editor.
3. Exercise the change on the staging preview.
4. When promoting: apply the same SQL to **production** Supabase via its SQL
   Editor, then open the `staging` → `main` PR and merge on approval. The schema
   is already in place when production deploys.

Rules:

- Never apply a migration to production that hasn't been applied and
  exercised in sandbox first.
- Never apply a migration whose corresponding code change isn't merged to
  the same tier.
- If two migrations on different branches conflict, resolve the order
  before merging.

## Test account rules

- Test accounts (workspace owners, members, magic-link recipients) live
  **only** in the sandbox Supabase project.
- Use plus-addressing on a real inbox you own
  (e.g. `you+badger-test-1@yourdomain.com`). One mailbox, many addresses,
  easy cleanup.
- Never seed sandbox from production data. Build test fixtures manually or
  with a small script.
- If a bug needs real-data context, take notes and reproduce in sandbox.
  Never re-point `staging` (or any non-prod branch) at production Supabase to
  "test against real data."

## Rollback procedure

If `main` ships a regression, rollback is a fast-forward of `main` back to
the prior known-good commit using `git reset --hard <good-sha>` followed by
`git push --force-with-lease origin main`. **Requires explicit user approval
per occurrence.**

Precedent: on 2026-05-11, `main` was rolled back from `97c81df` to
`faf82d4` after a direct-to-main overwrite. Same procedure for future
incidents. Note that a rollback only reverts code — SQL migrations applied
to production are not undone automatically; if the regression involves
schema, write a reverse migration and apply it through the sandbox-first
runbook before treating the rollback as complete.

## What this file replaces

This file is the single source of truth for the Badger workflow. The current
flow: work directly on `staging` (main = production; no force-push; test on the
staging preview; promote to `main` only via an approved `staging` → `main` PR).
This supersedes the earlier `dev/<name>`-feature-branch flow. Update this file
when the workflow changes; do not let it drift.
