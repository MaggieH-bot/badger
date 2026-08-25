# Badger — agent briefing

Badger is a pipeline manager for a real estate team — active opportunities
and transactions from lead through closing. **It is in production**
(`badger-wheat.vercel.app`) and the team uses it daily. Vite + React +
TypeScript + Supabase.

## Read before working

1. **`SANDBOX.md`** — before ANY git or database action. The branch model:
   work directly on `staging` (tested on its Vercel preview against the
   sandbox Supabase); `main` is production and is only touched by an
   approved `staging → main` PR. Never commit to `main`. Never force-push.
   Migrations: sandbox Supabase first, always, via the runbook.
2. **`BUILD_START.md`** — the product boundary. Badger is NOT a CRM, not a
   nurture tool, not marketing automation. The excluded-from-MVP list is
   real; don't build items on it without Maggie deciding to move them.
3. **`docs/decisions.md`** — decisions already made and corrections from
   Maggie. Grep it before proposing architecture.

## Conventions

- Tickets are `15W-xx`; commit messages reference them.
- Canonical stages and urgency rules are defined in `BUILD_START.md` — one
  stage model only; never invent variants.
- Before pushing: `npm run lint` and `npm run build` pass locally.

## Workflow

- **Plan first.** Write the plan to a todo checklist, check in with Maggie
  before starting, mark complete as you go, end with a review summary.
- **Small steps.** Build in small increments; after each step explain what
  changed and what still needs work. Ask before architectural changes
  beyond the MVP boundary.
- **Bugs: repro first, patch second.** Failing reproduction + one-paragraph
  root cause with evidence, then fix the root cause. The repro stays as a
  regression check. No symptom patches.
- **Done means verified.** A named check ran and passed with the result
  shown — lint, build, or the flow exercised on the staging preview. Never
  an unconfirmed claim.
- **Scope discipline.** Edit exactly what was asked, nothing else.
- **Docs stay current.** SANDBOX.md's standing rule applies to everything:
  change the process → update the doc in the same pass; conflict between a
  doc and an instruction → flag it before proceeding.
- **Corrections are permanent.** Append them to `docs/decisions.md`
  immediately.

## Promotion

`staging → main` follows SANDBOX.md, plus: before the PR is merged, a
**fresh session with no shared context reviews the full diff adversarially**
(regressions, RLS/auth holes, urgency-rule boundary cases, schema drift
between sandbox and prod). Findings resolved or explicitly accepted by
Maggie before merge.
