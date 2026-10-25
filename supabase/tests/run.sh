#!/usr/bin/env sh
# Runs the database tests against a local Postgres.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres sh supabase/tests/run.sh
set -e
cd "$(dirname "$0")/.."
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists paintball_test" -c "create database paintball_test"
psql -q -v ON_ERROR_STOP=1 -d paintball_test -f tests/supabase_stub.sql
for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d paintball_test -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d paintball_test -f tests/attendance_test.sql
