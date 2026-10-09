# Project Spec: URL Shortener (Backend)

## 0. Instructions for Claude Code (read first)

I am a developer moving from beginner to advanced backend work. **This project is a learning vehicle, not just a deliverable.** Please:

- Work **one milestone at a time** (section 9). Do not build everything at once.
- Before writing code for a milestone, explain in a few sentences what we are about to do and why.
- After each milestone, summarize what was built, what I should understand about it, and what to verify myself.
- Write **raw SQL** (no ORM). Explain any non-obvious query, index, or constraint.
- Prefer simple, readable code over clever abstractions.
- When there is a tradeoff (e.g. 301 vs 302, cache invalidation strategy), state the options and why you chose one.
- Ask me before adding any dependency not listed here.
- Keep a `NOTES.md` with decisions made and benchmark numbers as we go.

---

## 1. Purpose and reasoning

A URL shortener turns a long URL into a short code (e.g. `https://short.io/aB3x9`) and redirects visitors to the original URL.

**Why this project:** the idea is simple, but it contains real backend problems in a small package:

| Problem | What it teaches |
|---|---|
| Millions of redirects vs few creations (read-heavy) | Indexing, caching, measuring performance |
| Unique short codes under concurrency | Constraints, race conditions, collision handling |
| Users own links | Authentication, authorization, ownership checks |
| Public endpoint that can be abused | Rate limiting, input validation, security |
| Click tracking must not slow redirects | Queues, background workers, async design |
| Growing click data | Schema design, partitioning/rollups thinking |

**Learning goals:** raw SQL and schema design, contract-first API design (OpenAPI, validation schemas), auth and security, API performance (caching, load testing), and production readiness (logging, health checks, tests, CI, Docker).

---

## 2. Tech stack and reasoning

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict mode), Node.js 20+ | Already known, so learning effort goes to backend concepts; large job market |
| Framework | **NestJS** | Widely used in industry; teaches modules, dependency injection, guards, pipes, interceptors |
| Database | **PostgreSQL** | Most common production relational DB; strong constraints, indexes, transactions |
| DB access | **`pg` (node-postgres) with raw parameterized SQL** (Kysely optional later) | Forces understanding of what the DB actually runs; ORMs hide this |
| Migrations | `node-pg-migrate` | Versioned, reviewable schema changes like real teams |
| Cache / rate limit / queue store | **Redis** (`ioredis`) | In-memory speed (~1 ms vs 10-30 ms); atomic counters; backs the queue |
| Queue | **BullMQ** | Background click processing with retries and dead-letter handling |
| Validation / contracts | **Zod** (+ `nestjs-zod` or equivalent) | One schema gives runtime validation, TS types, and OpenAPI docs |
| API docs | `@nestjs/swagger` | Generates OpenAPI spec and UI |
| Password hashing | **argon2** | Current best practice |
| Logging | **pino** (`nestjs-pino`) | Fast structured JSON logs with request IDs |
| Testing | **Jest + Testcontainers** | Real Postgres/Redis in tests so they match production |
| Load testing | **k6** | Prove performance claims with numbers |
| Packaging | Docker (multi-stage) + Docker Compose | Reproducible local setup and deployment |
| CI | GitHub Actions | Lint, test, build on each push |

**Why Redis (three jobs):**
1. **Cache** for redirects (cache-aside with TTL), so hot links skip Postgres.
2. **Rate limiting** with atomic counters per IP / user.
3. **Queue backend** for BullMQ click-event jobs.

**Alternatives considered:**
- *Go:* faster and lighter, but a new language on top of new concepts. Stretch goal: rebuild only the redirect endpoint in Go and compare k6 results.
- *Python FastAPI:* great for the later AI project, saved for project 4.
- *Fastify/Express:* Express is simplest but unstructured; NestJS chosen for structure and market demand.

---

## 3. Functional requirements

### 3.1 Features
1. **Auth:** register, login, refresh token.
2. **Create link:** logged-in user submits a long URL, optionally a custom alias and an expiry date. Server returns the short URL.
3. **Redirect:** anyone visiting `GET /:code` is redirected to the long URL.
4. **Click tracking:** each redirect records timestamp, referrer, user agent (country optional), asynchronously.
5. **Manage links:** owner can list their links (paginated), view metadata and click count, update expiry, deactivate, delete.

### 3.2 Endpoints

| Method & path | Purpose | Auth |
|---|---|---|
| `POST /auth/register` | Create account | No |
| `POST /auth/login` | Get access + refresh token | No |
| `POST /auth/refresh` | Rotate refresh token, get new access token | No (refresh token) |
| `POST /links` | Create short link (supports `Idempotency-Key` header) | Yes |
| `GET /:code` | Redirect (HTTP 302) | No |
| `GET /links` | List my links, cursor pagination | Yes |
| `GET /links/:code` | Link metadata + click count | Yes, owner only |
| `PATCH /links/:code` | Update expiry / deactivate | Yes, owner only |
| `DELETE /links/:code` | Delete link | Yes, owner only |
| `GET /health` | Liveness + DB and Redis checks | No |

### 3.3 Business rules
- Only `http` and `https` URLs are accepted. Reject `javascript:`, `data:`, `file:`, etc. Maximum URL length 2048.
- Custom aliases: 3-32 chars, `[A-Za-z0-9_-]`, unique, and not in the reserved list (`links`, `auth`, `health`, `admin`, `api`, `docs`).
- Expired or deactivated links must **not** redirect: return `404` (or `410` for expired; document the choice).
- Redirect uses **302**, not 301, so analytics, expiry, and deactivation keep working. Document why.
- Same `Idempotency-Key` from the same user returns the original result instead of creating a duplicate.
- A user can only read or modify their own links; others get `404` (not `403`, to avoid leaking existence).
- Auto-generated codes: 7 characters, base62, random, generated with retry on unique violation.

### 3.4 Out of scope (for now)
Frontend, QR codes, teams/billing, custom domains, dashboards, multi-region deployment, email verification, OAuth login.

---

## 4. Non-functional requirements

**Performance**
- Redirect p95 latency under ~20 ms on a cache hit (measured locally with k6).
- Record a **baseline without cache** first, then with Redis, and write both results in `NOTES.md`.
- Click recording must never add database writes to the redirect path.
- Cache negative lookups (unknown codes) briefly to protect the database.

**Security**
- Passwords hashed with argon2; never logged or returned.
- Short-lived access tokens (e.g. 15 min) and rotating refresh tokens stored hashed in the DB (reuse of an old refresh token revokes the session family).
- All SQL parameterized; no string concatenation.
- Ownership check on every owner-only endpoint.
- Rate limiting: per IP on redirects, per user on creation, stricter on login/register.
- Helmet security headers, strict CORS config, request body size limit.
- Secrets only from environment variables; `.env` never committed.

**Reliability**
- Config validated at startup with Zod; the app fails fast on bad config.
- Graceful shutdown: stop accepting requests, finish in-flight ones, drain queue worker, close DB and Redis.
- Queue jobs have retries with backoff and a dead-letter path.
- If Redis is down, redirects fall back to Postgres (degraded but working); document the behavior.

**Observability**
- Structured JSON logs with a request ID on every line.
- `/health` checks Postgres and Redis.
- (Stretch) Prometheus metrics: request count, latency histogram, cache hit ratio, queue depth.

**API quality**
- Contract-first: Zod schemas and OpenAPI written **before** handler logic.
- One consistent error format everywhere:
  ```json
  { "error": { "code": "LINK_NOT_FOUND", "message": "Link not found", "requestId": "..." } }
  ```
- Correct status codes (201 create, 302 redirect, 400 validation, 401/404/409/429, etc.).
- Cursor-based pagination (not offset) on `GET /links`.

**Testing and delivery**
- Integration tests with Testcontainers for the full flow: register, login, create, redirect, ownership denial, expiry, deactivation, idempotency, rate limit.
- Unit tests for code generation and URL validation.
- Multi-stage Dockerfile; `docker compose up` starts app + Postgres + Redis.
- GitHub Actions: lint, test, build.

---

## 5. Database schema (initial migration)

```sql
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE links (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  long_url    TEXT NOT NULL,
  owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (long_url ~ '^https?://')
);
CREATE INDEX links_owner_created_idx ON links (owner_id, created_at DESC, id DESC);

CREATE TABLE clicks (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  link_id     BIGINT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  clicked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  referrer    TEXT,
  user_agent  TEXT,
  country     TEXT
);
CREATE INDEX clicks_link_time_idx ON clicks (link_id, clicked_at DESC);

CREATE TABLE idempotency_keys (
  key         TEXT NOT NULL,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  link_id     BIGINT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE refresh_tokens (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  family_id   UUID NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Design questions to explain as we go: `TIMESTAMPTZ` vs `TIMESTAMP`; why `code` needs a unique index; why the pagination index is `(owner_id, created_at DESC, id DESC)`; what to do when `clicks` reaches 100M rows (partitioning, rollup tables); `click_count` as a column vs computed.

---

## 6. Suggested project structure

```
src/
  config/          # Zod-validated env config
  db/              # pg pool, migration runner, query helpers
  auth/            # controller, service, guards, token logic
  links/           # controller, service, repository (raw SQL), schemas
  redirect/        # public redirect controller + cache logic
  clicks/          # BullMQ producer, worker, repository
  common/          # error filter, request-id, rate-limit guard, logging
  health/
migrations/
test/              # integration tests (Testcontainers)
k6/                # load test scripts
docker-compose.yml
Dockerfile
NOTES.md
```

Keep SQL in repository classes, business logic in services, and HTTP concerns in controllers.

---

## 7. Cache design notes

- **Pattern:** cache-aside. Key `link:{code}` stores `{longUrl, isActive, expiresAt}` with a TTL (e.g. 1 hour, never beyond `expires_at`).
- **Miss:** read Postgres, store in Redis, return.
- **Invalidation:** on PATCH or DELETE, delete the Redis key.
- **Negative cache:** store unknown codes for ~30-60 s.
- Be ready to explain what happens if invalidation fails or Redis and Postgres disagree.

---

## 8. Definition of done

- All endpoints in 3.2 work and match the generated OpenAPI spec.
- All rules in 3.3 and requirements in section 4 are met.
- Integration tests pass in CI.
- `NOTES.md` contains k6 results: baseline (no cache) vs Redis, with p50/p95/RPS.
- `docker compose up` runs the full system.
- I can explain: indexes and `EXPLAIN ANALYZE`, cache-aside and invalidation, 302 vs 301, why clicks go through a queue, refresh token rotation, and why idempotency keys exist.

---

## 9. Milestones (work in this order)

0. **Setup:** NestJS + strict TS + lint, Docker Compose (Postgres, Redis), validated env config.
1. **Schema and migrations:** write migrations; seed ~100k rows; practice `EXPLAIN ANALYZE` with and without the `code` index.
2. **Contracts first:** Zod schemas, error format, OpenAPI spec for all endpoints, before logic.
3. **Core features without cache:** auth (argon2, access + refresh tokens), create, redirect, list with cursor pagination, metadata, update, delete, ownership checks.
4. **Baseline load test:** k6 on `GET /:code`; record results.
5. **Redis cache:** cache-aside, invalidation, negative caching; rerun k6 and compare.
6. **Background click tracking:** BullMQ producer on redirect, worker with batch inserts, retries, dead-letter.
7. **Protection:** rate limiting, idempotency keys, URL validation and reserved aliases, Helmet, CORS, body limits.
8. **Production readiness:** structured logs, `/health`, graceful shutdown, Testcontainers integration tests, multi-stage Dockerfile, GitHub Actions.
9. **Stretch:** rebuild only `GET /:code` in Go and compare k6 results; add Prometheus metrics; add a small React UI.

Start with Milestone 0 and stop for my review before moving to Milestone 1.
