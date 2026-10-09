# Raw parameterized SQL through `pg`, no ORM

This is a learning project, and an ORM would hide the queries, indexes and constraints we are trying to understand. All SQL is written by hand with `$1, $2` placeholders and lives only in repository classes. Kysely stays an option for later if hand-written queries become a burden.
