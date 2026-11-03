# Ingest worker (Phase 5 placeholder)

This directory will hold the scheduled crawler and AI-assisted ingestion
worker. It is intentionally empty in Phase 0.

Planned constraints (from the architecture decisions):

- Runs as a scheduled GitHub Actions job, never on the 256 MB production server.
- Writes to PocketBase through its REST API using a dedicated machine account.
- Never hard-deletes anything; every change keeps a history.
- Every published claim must link to a public source.

Do not add runtime services here without revisiting the memory budget.
