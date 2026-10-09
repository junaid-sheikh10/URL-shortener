# Notes

Decisions made and benchmark numbers, kept as we go.

## Decisions

- Redirects use 302, not 301, so click counts, expiry and deactivation keep working.
- Unknown and deactivated codes return 404; expired codes return 410.
- Generated codes are 7 random base62 characters; the unique index on `code` is the collision guard, with retry.
- Custom aliases and generated codes share one namespace. A taken alias gives 409; a generated collision retries silently.
- Other users' links return 404, not 403.
- Click count is computed from `clicks`, not stored as a column (revisit if `clicks` grows large).
- `GET /links` uses cursor pagination on `(created_at, id)`.
- Access tokens last ~15 min; refresh tokens are stored hashed, rotated on use, and reuse of an old one revokes the whole family.
- Redirects use cache-aside (TTL never past `expires_at`); PATCH/DELETE delete the key; unknown codes are cached 30-60 s; Redis down means fall back to Postgres.
- `Idempotency-Key` on `POST /links` is scoped per user; a repeat returns the original link.
- The same long URL submitted twice creates two separate links.
- DELETE is a hard delete, so the code becomes claimable again (see limitations).
- Rate limiting fails open on redirects and fails closed on login/register when Redis is down.
- Long URLs are validated twice: Zod in the app (http/https only, max 2048) and a `CHECK` constraint in the database.
- Integration tests use real Postgres and Redis through Testcontainers, not mocks.
- Emails are stored lowercased; failed logins return one generic "invalid credentials" error.
- Raw SQL, no ORM: see `docs/adr/0001-raw-sql-no-orm.md`.
- Clicks go through a queue: see `docs/adr/0002-clicks-recorded-through-a-queue.md`.

## Known limitations

- Cache invalidation on PATCH/DELETE can fail or race with a read. A deactivated link may then keep redirecting until the cache TTL ends. The TTL bounds the window.

- After a link is deleted, old copies of its short address could later redirect to a stranger's link if someone claims the freed code. Soft delete or code reservation would fix it.

## Benchmarks

_Baseline (no cache) vs Redis: p50 / p95 / RPS. To be filled in at Milestones 4 and 5._
