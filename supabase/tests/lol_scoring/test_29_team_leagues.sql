-- Liga de cada equipo y plantilla actual (20261102100001):
-- teams.league, lol_roster con edition_id NULL, admin_import_lol_roster
-- con plantilla actual y columna league, admin_set_lol_team_league.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(21);

DO $$
DECLARE
  e integer := t.edition('ligas');
BEGIN
  PERFORM t.player('lg-admin', p_role => 'ADMIN');
  PERFORM t.player('lg-user');
  PERFORM t.team('LGA'); PERFORM t.team('LGB'); PERFORM t.team('LGC');
  CREATE TEMP TABLE lg AS SELECT e,
    (SELECT id FROM teams WHERE iso_code = 'LGA') AS ta,
    (SELECT id FROM teams WHERE iso_code = 'LGB') AS tb,
    (SELECT id FROM teams WHERE iso_code = 'LGC') AS tc;
END;
$$;
GRANT SELECT ON lg TO authenticated, anon;

-- Carga como ADMIN; p_e NULL = plantilla actual.
CREATE FUNCTION pg_temp.imp(p_rows text, p_e integer, p_replace boolean DEFAULT true) RETURNS text LANGUAGE sql AS $$
  SELECT t.run_as('authenticated', t.uid('lg-admin'),
    format('SELECT admin_import_lol_roster(%s, %L::jsonb, %s)', COALESCE(p_e::text, 'NULL'), p_rows,
           CASE WHEN p_replace THEN 'true' ELSE 'false' END));
$$;
CREATE FUNCTION pg_temp.roster(p_tag text, p_e integer) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(r.role || ':' || p.nickname, ',' ORDER BY r.id)
  FROM lol_roster r JOIN lol_players p ON p.id = r.player_id JOIN teams tm ON tm.id = r.team_id
  WHERE r.edition_id IS NOT DISTINCT FROM p_e AND tm.iso_code = p_tag;
$$;
CREATE FUNCTION pg_temp.league(p_tag text) RETURNS text LANGUAGE sql AS $$
  SELECT league FROM teams WHERE iso_code = p_tag;
$$;

-- ---------------- Esquema ----------------
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_league_check'), 'teams.league con CHECK de sigla');
SELECT col_is_null('public', 'lol_roster', 'edition_id', 'lol_roster.edition_id admite NULL (plantilla actual)');
SELECT ok(NOT has_function_privilege('anon', 'admin_set_lol_team_league(integer,text,text)', 'EXECUTE')
          AND NOT has_function_privilege('service_role', 'admin_set_lol_team_league(integer,text,text)', 'EXECUTE'),
          'liga: ni anon ni service_role');
SELECT ok((SELECT prosecdef AND 'search_path=public' = ANY (proconfig) FROM pg_proc WHERE oid = 'admin_set_lol_team_league(integer,text,text)'::regprocedure),
          'liga: SECURITY DEFINER y search_path fijo');

-- ---------------- admin_set_lol_team_league ----------------
UPDATE teams SET league = NULL WHERE iso_code IN ('LGA', 'LGB', 'LGC');
SELECT alike(t.run_as('authenticated', t.uid('lg-user'), format('SELECT admin_set_lol_team_league(%s, ''LEC'')', (SELECT ta FROM lg))),
             '42501:%', 'un USER no cambia la liga');
SELECT is(t.run_as('authenticated', t.uid('lg-admin'), format('SELECT admin_set_lol_team_league(%s, '' lec '')', (SELECT ta FROM lg))),
          'ok', 'un ADMIN pone la liga');
SELECT is(pg_temp.league('LGA'), 'LEC', 'en mayúsculas y sin espacios');
SELECT is((SELECT COALESCE(before ->> 'league', '-') || '→' || (after ->> 'league') FROM lol_admin_audit
           WHERE action = 'set_team_league' AND team_id = (SELECT ta FROM lg) ORDER BY id DESC LIMIT 1),
          '-→LEC', 'registro con el antes (sin liga) y el después');
SELECT is((SELECT count(*) FROM lol_admin_audit WHERE action = 'set_team_league' AND team_id = (SELECT ta FROM lg)), 1::bigint,
          'queda registrado una vez');
SELECT is(t.run_as('authenticated', t.uid('lg-admin'), format('SELECT admin_set_lol_team_league(%s, ''LEC'')', (SELECT ta FROM lg))),
          'ok', 'poner la misma liga no hace nada');
SELECT is((SELECT count(*) FROM lol_admin_audit WHERE action = 'set_team_league' AND team_id = (SELECT ta FROM lg)), 1::bigint,
          '…ni deja registro');
SELECT alike(t.run_as('authenticated', t.uid('lg-admin'), format('SELECT admin_set_lol_team_league(%s, ''L!'')', (SELECT ta FROM lg))),
             '22023:%', 'liga no válida: rechazada');
SELECT is(t.run_as('authenticated', t.uid('lg-admin'), format('SELECT admin_set_lol_team_league(%s, '''')', (SELECT ta FROM lg))),
          'ok', 'vacía la quita');
SELECT is(pg_temp.league('LGA'), NULL, 'sin liga = Resto del mundo');

-- ---------------- Plantilla actual ----------------
SELECT is(pg_temp.imp('[{"team":"LGA","role":"TOP","nickname":"LgTop","league":"lck"},
                        {"team":"LGA","role":"MID","nickname":"LgMid","league":"LCK"},
                        {"team":"LGB","role":"MID","nickname":"LgOther"}]', NULL), '3', 'carga de la plantilla actual');
SELECT is(pg_temp.roster('LGA', NULL), 'TOP:LgTop,MID:LgMid', 'queda sin edición');
SELECT is(pg_temp.league('LGA') || '/' || COALESCE(pg_temp.league('LGB'), '-'), 'LCK/-',
          'la columna league cambia la liga del equipo que la trae');
SELECT is(pg_temp.imp('[{"team":"LGA","role":"MID","nickname":"LgMid"}]', (SELECT e FROM lg)), '1',
          'el mismo jugador puede estar en la plantilla de una edición');
SELECT is(pg_temp.imp('[{"team":"LGC","role":"MID","nickname":"LgMid"}]', NULL, false), '1',
          'fichaje: en la plantilla actual se mueve de equipo');
SELECT is(pg_temp.roster('LGA', NULL) || ' | ' || pg_temp.roster('LGC', NULL) || ' | ' || pg_temp.roster('LGA', (SELECT e FROM lg)),
          'TOP:LgTop | MID:LgMid | MID:LgMid', '…y la plantilla de la edición no cambia');
SELECT alike(pg_temp.imp('[{"team":"LGA","role":"TOP","nickname":"X1","league":"LCK"},
                           {"team":"LGA","role":"MID","nickname":"X2","league":"LEC"}]', NULL),
             '22023:%dos ligas%', 'dos ligas distintas para un equipo: rechazado entero');

SELECT * FROM finish();
ROLLBACK;
