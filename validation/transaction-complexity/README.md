# Transaction Complexity Intelligence — validation harness

This is a **non-production validation harness**. It does not change Badger's data model, UI, Supabase schema, or transaction workflow.

## What it tests

The question is narrow: **Can one dependency representation handle both a one-hop settlement dependency and a multi-hop transaction chain, while surfacing review points without taking legal or operational action automatically?**

The fixtures are anonymized from real transaction patterns. Names, addresses, client identifiers, and source documents are intentionally excluded because the repository is public.

## Run

```bash
node validation/transaction-complexity/validate.mjs
```

A passing run must:

- identify every downstream transaction affected by the changed upstream event;
- propagate impact through a two-hop chain;
- distinguish on-time, delayed, and failed upstream states;
- respect a documented delay window when one exists;
- surface lender/title/settlement coordination and financing-fallback review where relevant;
- never auto-void a contract, auto-change a settlement date, send a notice, or state a legal conclusion;
- produce consumer-safe wording that routes contract/legal questions back to the appropriate professional.

## Go / revise / stop rule

- **GO TO PRODUCT DESIGN** only if the same schema fits both truth sets cleanly and the next live case also fits without adding case-specific hacks.
- **REVISE** if the graph works but requires additional general relationship types or missing-data states.
- **STOP / KEEP AS MANUAL TOOL** if each new case requires custom logic that cannot be expressed as reusable dependency relationships.

## Deliberate non-goals

- No contract parsing.
- No legal interpretation.
- No automatic date changes.
- No client communications.
- No production Badger integration.
- No new database tables.

This harness validates the **shared transaction-complexity capability**, not a finished Badger feature.
