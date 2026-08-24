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

- **2026-08-24 — Badger never auto-names an attached document.** When a file
  is attached without a name, block the save and make the user name it.
  Maggie: a filename is a machine string ("Fully Signed ALTA -
  2026-08-12T133829.999.pdf"), not a description of what the paper is, and
  Badger can't know which document it's looking at. Would change if: we ever
  read the document's contents well enough to describe it.

- **2026-08-24 — An attached-but-unsaved document blocks Save Changes.** It
  is never silently discarded. Root cause of Charlie's "failed" ALTA uploads:
  the drawer's unsaved-work guard covered Details and More Info but not
  Documents, so Save Changes (and the X) binned an attached file with no
  warning and no upload. A file the agent believes is filed, and isn't, is the
  worst failure this app can have. Would change if: the save flow stops being
  a single record-level commit.

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
