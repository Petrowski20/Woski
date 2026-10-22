-- Seed de un equipo por edición (20261025100001): columnas league y
-- seed de team_edition_stats y admin_set_lol_team_seed.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(24);

DO $$
DECLARE
  e  integer := t.edition('seed lol');
  tm integer := t.team('SDA');
  t2 integer := t.team('SDB');
  f  integer;
BEGIN
  PERFORM t.player('sd-admin', p_role => 'ADMIN');
  PERFORM t.player('sd-user');
  INSERT INTO teams (sport_id, slug, name, iso_code)
  SELECT id, 'sd-futbol', 'Selección', 'SDF' FROM sports WHERE slug = 'football' RETURNING id INTO f;
  -- Fila previa del par (como las de fútbol): se actualiza, no se duplica.
  INSERT INTO team_edition_stats (edition_id, team_id) VALUES (e, t2);
  CREATE TEMP TABLE sd AS SELECT e, tm, t2, f,
    (SELECT ed.id FROM editions ed JOIN competitions c ON c.id = ed.competition_id WHERE c.slug = 'fifa-world-cup' LIMIT 1) AS fe;
END;
$$;
GRANT SELECT ON sd TO authenticated;

CREATE FUNCTION pg_temp.seed(p_nick text, p_args text) RETURNS text LANGUAGE sql AS $$
  SELECT t.run_as('authenticated', t.uid(p_nick), 'SELECT admin_set_lol_team_seed(' || p_args || ')');
$$;
CREATE FUNCTION pg_temp.args(p_team text, p_league text, p_seed text) RETURNS text LANGUAGE sql AS $$
  SELECT format('%s, %s, %s, %s', (SELECT e FROM sd), p_team, p_league, p_seed);
$$;

-- ---------------- Permisos ----------------
SELECT ok((SELECT prosecdef AND 'search_path=public' = ANY (proconfig) FROM pg_proc
           WHERE oid = 'admin_set_lol_team_seed(integer,integer,text,integer,text)'::regprocedure),
          'SECURITY DEFINER y search_path fijo');
SELECT ok(NOT has_function_privilege('anon', 'admin_set_lol_team_seed(integer,integer,text,integer,text)', 'EXECUTE')
          AND NOT has_function_privilege('service_role', 'admin_set_lol_team_seed(integer,integer,text,integer,text)', 'EXECUTE'),
          'ni anon ni service_role');
SELECT alike(t.run_as('anon', NULL, format('SELECT admin_set_lol_team_seed(%s)', pg_temp.args((SELECT tm FROM sd)::text, '''LCK''', '1'))),
             '42501:%', 'anon: rechazado');
SELECT alike(pg_temp.seed('sd-user', pg_temp.args((SELECT tm FROM sd)::text, '''LCK''', '1')), '42501:%', 'un USER: rechazado');
SELECT is((SELECT count(*) FROM team_edition_stats WHERE team_id = (SELECT tm FROM sd)), 0::bigint, 'los rechazos no escriben nada');

-- ---------------- Poner, cambiar y quitar ----------------
SELECT is(pg_temp.seed('sd-admin', pg_temp.args((SELECT tm FROM sd)::text, ''' lck ''', '1')), 'ok', 'un ADMIN pone LCK #1');
SELECT is((SELECT league || ' #' || seed FROM team_edition_stats WHERE edition_id = (SELECT e FROM sd) AND team_id = (SELECT tm FROM sd)),
          'LCK #1', 'liga en mayúsculas y sin espacios');
SELECT is(pg_temp.seed('sd-admin', pg_temp.args((SELECT tm FROM sd)::text, '''LCK''', '2')), 'ok', 'cambiar a LCK #2');
SELECT is((SELECT count(*) FROM team_edition_stats WHERE edition_id = (SELECT e FROM sd) AND team_id = (SELECT tm FROM sd)),
          1::bigint, 'sigue habiendo una sola fila del par');
SELECT is(pg_temp.seed('sd-admin', pg_temp.args((SELECT t2 FROM sd)::text, '''LEC''', '3')), 'ok', 'equipo con fila previa');
SELECT is((SELECT string_agg(coalesce(league, '-') || seed, ',') FROM team_edition_stats WHERE team_id = (SELECT t2 FROM sd)),
          'LEC3', 'actualiza la fila existente, sin duplicar');
SELECT is(pg_temp.seed('sd-admin', pg_temp.args((SELECT tm FROM sd)::text, 'NULL', 'NULL')), 'ok', 'quitar el seed');
SELECT ok((SELECT league IS NULL AND seed IS NULL FROM team_edition_stats WHERE edition_id = (SELECT e FROM sd) AND team_id = (SELECT tm FROM sd)),
          'seed quitado');

-- ---------------- Auditoría ----------------
SELECT is((SELECT string_agg(coalesce(before ->> 'seed', '-') || '>' || coalesce(after ->> 'seed', '-'), ',' ORDER BY id)
           FROM lol_admin_audit WHERE action = 'set_team_seed' AND team_id = (SELECT tm FROM sd)),
          '->1,1>2,2>-', 'una fila de auditoría por cambio, con antes y después');
SELECT is((SELECT count(*) FROM lol_admin_audit WHERE action = 'set_team_seed' AND team_id = (SELECT tm FROM sd)
           AND edition_id = (SELECT e FROM sd) AND actor_kind = 'admin' AND actor_id = t.uid('sd-admin')), 3::bigint,
          'auditoría con edición, equipo y admin');
SELECT is(pg_temp.seed('sd-admin', pg_temp.args((SELECT t2 FROM sd)::text, '''LEC''', '3')), 'ok', 'mismo valor otra vez');
SELECT is((SELECT count(*) FROM lol_admin_audit WHERE action = 'set_team_seed' AND team_id = (SELECT t2 FROM sd)), 1::bigint,
          'sin cambios no deja registro');

-- ---------------- Validaciones ----------------
SELECT is(pg_temp.seed('sd-admin', pg_temp.args((SELECT tm FROM sd)::text, '''LCK''', 'NULL')),
          '22023: Indica la liga y el número de seed, o deja los dos vacíos para quitarlo', 'liga sin número');
SELECT is(pg_temp.seed('sd-admin', pg_temp.args((SELECT tm FROM sd)::text, '''L C''', '1')),
          '22023: La liga debe ser una sigla de 2 a 8 letras o números (LCK, LPL, LEC…)', 'liga con espacio');
SELECT is(pg_temp.seed('sd-admin', pg_temp.args((SELECT tm FROM sd)::text, '''LCK''', '17')),
          '22023: El seed debe ser un número del 1 al 16', 'seed fuera de rango');
SELECT alike(pg_temp.seed('sd-admin', pg_temp.args((SELECT f FROM sd)::text, '''LCK''', '1')), '22023: El equipo%', 'equipo de fútbol');
SELECT alike(pg_temp.seed('sd-admin', format('%s, %s, ''LCK'', 1', (SELECT fe FROM sd), (SELECT tm FROM sd))), '22023: La edición%',
             'edición de fútbol');
SELECT throws_ok($$ INSERT INTO team_edition_stats (edition_id, team_id, league, seed) VALUES ((SELECT e FROM sd), (SELECT tm FROM sd), 'LCK', NULL) $$,
                 '23514', NULL, 'CHECK: liga sin seed no entra ni por SQL directo');
-- Lectura pública (la usa el calendario).
SELECT is(t.run_as('authenticated', t.uid('sd-user'), format(
            'SELECT league || seed FROM team_edition_stats WHERE edition_id = %s AND team_id = %s', (SELECT e FROM sd), (SELECT t2 FROM sd))),
          'LEC3', 'cualquier usuario lee el seed');

SELECT * FROM finish();
ROLLBACK;
