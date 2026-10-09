# URL Shortener

A URL shortener backend, built as a learning project: NestJS, PostgreSQL (raw SQL), Redis, BullMQ.

See [docs/url-shortener-spec.md](docs/url-shortener-spec.md) for the full spec, [GLOSSARY.md](GLOSSARY.md) for the project's vocabulary, [docs/adr/](docs/adr/) for architecture decisions, and [NOTES.md](NOTES.md) for decisions and benchmark numbers.

## Run locally

Requires Node 20+ and Docker.

```
cp .env.example .env     # then adjust values
docker compose up -d     # Postgres + Redis
npm install
npm run start:dev        # http://localhost:3000
```

Run the tests with `npm test` (unit) and `npm run test:e2e`.

## Status

Milestone 0 (setup) is done. See the spec's section 9 for the milestone plan.
