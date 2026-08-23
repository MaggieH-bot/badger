# Decisions log

Every meaningful decision gets three lines: what was decided, why, and what
would change it. Agents: **grep this before proposing architecture or
re-opening a settled question, and append immediately when Maggie makes a
call or corrects you.** Nothing here gets re-litigated without a new reason.

Format:

- **YYYY-MM-DD — Decision.** Why. Would change if: …

## Decisions

- **2026-07-19 — CLAUDE.md is the canonical agent briefing for this repo.**
  It points at the runbooks and rules; sessions start there. Would change
  if: the briefing moves or is superseded.

## Corrections

*(Date — what was wrong → what's right.)*

- **2026-08-23 — Two records sharing a client name are NOT duplicates.**
  While chasing a document-save bug I read two "Kate Stevens" rows in Closed
  Transactions as a double-import and drafted a merge script for production.
  Maggie: she bought *and* sold, so the two records are correct — that is
  exactly the buy/sell pair the linked-deal model (15W-70) exists to
  represent. Never treat same-name records as duplicates, and never propose
  merging client records on name alone.

- **2026-08-23 — Diagnose against production data before theorising.**
  The first duplicate query was run against the sandbox project, whose test
  data sent the investigation down a wrong path for several rounds. When a
  bug is reported in prod, confirm which project the evidence came from
  before drawing conclusions from it.
