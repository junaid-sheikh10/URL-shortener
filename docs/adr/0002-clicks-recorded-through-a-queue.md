# Clicks are recorded through a queue, never in the redirect path

A redirect only pushes a job onto a Redis-backed queue; a background worker writes clicks to Postgres in batches. This keeps the hottest endpoint free of database writes, at the cost of extra moving parts and possible click loss if Redis fails. Retries with backoff and a dead-letter path limit that loss.
