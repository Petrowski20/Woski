#!/usr/bin/env bash
# ============================================================
#  Tests del motor de puntuación LoL (v1 y v2).
#
#  Monta una base NUEVA (woski_scoring_test) dentro del contenedor
#  local woski-test-db (imagen supabase/postgres, roles reales de
#  Supabase). No toca la base "postgres" del contenedor ni el remoto.
#
#  Esquema = el de producción con su deriva:
#    1. auth: copia del esquema auth del propio contenedor.
#    2. Dump de solo esquema de producción del 22/09
#       (backup_pre_domain_model_20260922.sql, no versionado:
#       matches.id y predictions.match_id smallint, sin
#       v_match_predictions).
#    3. Migraciones del repo posteriores a ese dump, hasta la de
#       integridad (lo que hay hoy en remoto).
#    4. Fixture v1 + foto de lo que puntúa y clasifica HOY
#       (regresión).
#    5. Migraciones nuevas (motor v2).
#    6. Tests pgTAP.
#
#  Uso: supabase/tests/lol_scoring/run.sh [ruta_al_dump]
# ============================================================
set -euo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
DUMP="${1:-$ROOT/backup_pre_domain_model_20260922.sql}"
CONTAINER="${CONTAINER:-woski-test-db}"
DB=woski_scoring_test
# Última migración que ya está en remoto; las posteriores son las nuevas.
LAST_REMOTE=20261013100001

[ -f "$DUMP" ] || { echo "No encuentro el dump: $DUMP" >&2; exit 1; }

psql_admin() { docker exec -i "$CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U supabase_admin "$@"; }
# Las migraciones se aplican como postgres, igual que supabase db push.
psql_pg()    { docker exec -i "$CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$DB" "$@"; }

echo "== Base limpia"
psql_admin -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB OWNER postgres"

echo "== auth + extensiones"
# Sin el trigger on_auth_user_created: apunta a public.handle_new_user,
# que aún no existe; los fixtures crean los perfiles directamente.
docker exec "$CONTAINER" pg_dump -U supabase_admin -d postgres -s -n auth --no-owner \
  | grep -v '^CREATE TRIGGER' \
  | psql_admin -d "$DB" >/dev/null
psql_admin -d "$DB" <<'SQL'
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO postgres, anon, authenticated, service_role;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
-- El dump hace ALTER PUBLICATION supabase_realtime (existe en Supabase).
CREATE PUBLICATION supabase_realtime;
SQL

echo "== Dump de producción (solo esquema)"
# vault y pg_stat_statements no hacen falta para estos tests.
grep -v -E 'CREATE EXTENSION IF NOT EXISTS "(supabase_vault|pg_stat_statements|pg_graphql)"' "$DUMP" \
  | psql_admin -d "$DB" >/dev/null

echo "== Migraciones ya aplicadas en remoto"
for f in "$ROOT"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  if [[ "$v" > "20260922000000" && ! "$v" > "${LAST_REMOTE}" ]]; then
    echo "   $(basename "$f")"
    psql_pg < "$f" >/dev/null
  fi
done

echo "== Utilidades de test y foto v1 de hoy (regresión)"
psql_pg < "$HERE/fixtures/helpers.sql" >/dev/null
psql_pg < "$HERE/fixtures/v1_regression_before.sql" >/dev/null

echo "== Config del bloque 1A de supabase/seeds/worlds_2026_playin_v2.sql"
# El JSON comentado del primer "SET config = '{" hasta su "}'::jsonb".
SEED_CFG="$(awk '
  !done && /^-- SET config = .\{/ { on = 1; print "{"; next }
  on && /^-- \}.::jsonb/          { print "}"; on = 0; done = 1; next }
  on                              { sub(/^-- /, ""); print }
' "$ROOT/supabase/seeds/worlds_2026_playin_v2.sql")"
[ -n "$SEED_CFG" ] || { echo "No encuentro el config del bloque 1A" >&2; exit 1; }
psql_pg <<SQL >/dev/null
CREATE TABLE t.seed_playin AS SELECT \$cfg\$${SEED_CFG}\$cfg\$::jsonb AS config;
SQL

echo "== Migraciones nuevas"
for f in "$ROOT"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  if [[ "$v" > "${LAST_REMOTE}" ]]; then
    echo "   $(basename "$f")"
    psql_pg < "$f" >/dev/null
  fi
done

echo "== Tests"
status=0
for t in "$HERE"/test_*.sql; do
  echo "-- $(basename "$t")"
  if ! out="$(psql_pg -At < "$t" 2>&1)"; then status=1; fi
  echo "$out"
  if grep -q -E '^not ok|Looks like you failed|ERROR' <<<"$out"; then status=1; fi
done

if [ "$status" -eq 0 ]; then echo "== TODO OK"; else echo "== HAY FALLOS"; fi
exit "$status"
