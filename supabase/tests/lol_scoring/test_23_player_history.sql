-- Perfil de LoL de un jugador visto por otros (20261024100001):
-- get_lol_player_history y get_lol_player_days. Solo series con la
-- votación cerrada, misma visibilidad que la RLS de predictions.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(29);

-- S1 (día 1) 1-0 · S2 (día 1) 1-0 · S3 (día 2) 0-1 · S4 día 3 cerrada sin resultado · S5 abierta (futuro)
DO $$
DECLARE
  e  integer := t.edition('perfil jugador');
  ph integer := t.phase(e, t.ruleset('perfil', t.cfg_v2(1)), 'Grupos', 0);
  p1 uuid := t.player('ph-p1');
  p2 uuid := t.player('ph-p2');   -- solo vota la serie abierta
  p3 uuid := t.player('ph-p3');   -- sin votos
  p4 uuid := t.player('ph-p4');   -- entra tarde (desde S2) y no vota S3
  v  uuid := t.player('ph-viewer');
  s  integer[] := '{}';
BEGIN
  s := s || t.match(ph, '2026-10-01 10:00+00');
  s := s || t.match(ph, '2026-10-01 14:00+00');
  s := s || t.match(ph, '2026-10-02 10:00+00');
  s := s || t.match(ph, '2026-10-03 10:00+00');
  s := s || t.match(ph, now() + interval '7 days');
  PERFORM t.vote(p1, s[1], 1, 0); PERFORM t.vote(p1, s[2], 1, 0); PERFORM t.vote(p1, s[3], 1, 0);
  PERFORM t.vote(p1, s[4], 0, 1); PERFORM t.vote(p1, s[5], 0, 1);
  PERFORM t.vote(p2, s[5], 1, 0);
  PERFORM t.vote(p4, s[2], 0, 1);
  PERFORM t.crowd('ph-crowd', 3, s[1], 0, 1);
  PERFORM t.finish(s[1], 1, 0); PERFORM t.finish(s[2], 1, 0); PERFORM t.finish(s[3], 0, 1);
  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE ph_ids AS SELECT e, s;
END;
$$;
GRANT SELECT ON ph_ids TO authenticated;

CREATE FUNCTION pg_temp.h(p_viewer text, p_player text, p_sql text) RETURNS text LANGUAGE sql AS $$
  SELECT t.run_as('authenticated', t.uid(p_viewer), format(p_sql,
    format('get_lol_player_history(%L, %s)', t.uid(p_player), (SELECT e FROM ph_ids))));
$$;

-- ---------------- Permisos ----------------
SELECT ok((SELECT prosecdef AND 'search_path=public' = ANY (proconfig) FROM pg_proc WHERE oid = 'get_lol_player_history(uuid,integer)'::regprocedure),
          'history: SECURITY DEFINER y search_path fijo');
SELECT ok((SELECT prosecdef AND 'search_path=public' = ANY (proconfig) FROM pg_proc WHERE oid = 'get_lol_player_days(uuid,integer)'::regprocedure),
          'days: SECURITY DEFINER y search_path fijo');
SELECT ok(NOT has_function_privilege('anon', 'get_lol_player_history(uuid,integer)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'get_lol_player_days(uuid,integer)', 'EXECUTE'), 'anon sin EXECUTE');
SELECT ok(NOT has_function_privilege('service_role', 'get_lol_player_history(uuid,integer)', 'EXECUTE'), 'service_role sin EXECUTE');
SELECT ok(has_function_privilege('authenticated', 'get_lol_player_history(uuid,integer)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'get_lol_player_days(uuid,integer)', 'EXECUTE'), 'authenticated con EXECUTE');
SELECT alike(t.run_as('anon', NULL, format('SELECT count(*) FROM get_lol_player_history(%L, %s)', t.uid('ph-p1'), (SELECT e FROM ph_ids))),
             '42501:%', 'anon: rechazado');
SELECT alike(t.run_as('anon', NULL, format('SELECT count(*) FROM get_lol_player_days(%L, %s)', t.uid('ph-p1'), (SELECT e FROM ph_ids))),
             '42501:%', 'anon: days rechazado');
SELECT is(t.run_as('authenticated', NULL, format('SELECT count(*) FROM get_lol_player_history(%L, %s)', t.uid('ph-p1'), (SELECT e FROM ph_ids))),
          '42501: Inicia sesión para ver el historial de un jugador', 'authenticated sin uid: rechazado');

SELECT is((SELECT count(*) FROM get_lol_player_history(t.uid('ph-p1'), (SELECT e FROM ph_ids))), 4::bigint,
          'SQL Editor (sesión postgres sin JWT): puede consultarla');

-- ---------------- Solo series con la votación cerrada ----------------
SELECT is(pg_temp.h('ph-viewer', 'ph-p1', 'SELECT count(*) FROM %s'), '4', 'otro jugador ve 4 series de ph-p1 (3 terminadas + 1 cerrada sin resultado)');
SELECT is(pg_temp.h('ph-viewer', 'ph-p1', format('SELECT count(*) FROM %%s WHERE match_id = %s', (SELECT s[5] FROM ph_ids))), '0',
          'nunca la serie con la votación abierta');
SELECT is(pg_temp.h('ph-p1', 'ph-p1', format('SELECT count(*) FROM %%s WHERE match_id = %s', (SELECT s[5] FROM ph_ids))), '0',
          'ni siquiera al propio jugador (el historial es solo de series cerradas)');
SELECT is(pg_temp.h('ph-viewer', 'ph-p1', 'SELECT string_agg(match_id::text, '','' ORDER BY match_date DESC) FROM %s'),
          (SELECT format('%s,%s,%s,%s', s[4], s[3], s[2], s[1]) FROM ph_ids), 'de la más reciente a la más antigua');
SELECT is(pg_temp.h('ph-viewer', 'ph-p1', format('SELECT pred_home || ''-'' || pred_away || ''|'' || status || ''|'' || (total IS NULL) FROM %%s WHERE match_id = %s', (SELECT s[4] FROM ph_ids))),
          '0-1|PENDING|true', 'serie cerrada sin resultado: voto visible, sin desglose');
SELECT is(pg_temp.h('ph-viewer', 'ph-p1', 'SELECT count(*) FROM %s WHERE status = ''FINISHED'' AND total IS DISTINCT FROM points_earned'), '0',
          'terminadas: total del desglose = points_earned');
SELECT is(pg_temp.h('ph-viewer', 'ph-p1', format('SELECT correct_winner::text || streak_length FROM %%s WHERE match_id = %s', (SELECT s[2] FROM ph_ids))),
          'true2', 'desglose del motor: ganador acertado, racha 2 tras S2');
-- Lo devuelto coincide con lo que la RLS deja leer al visor directamente.
SELECT is(pg_temp.h('ph-viewer', 'ph-p1', 'SELECT string_agg(match_id::text || '':'' || pred_home || ''-'' || pred_away, '','' ORDER BY match_id) FROM %s WHERE voted'),
          t.run_as('authenticated', t.uid('ph-viewer'), format(
            'SELECT string_agg(match_id::text || '':'' || pred_home_goals || ''-'' || pred_away_goals, '','' ORDER BY match_id) FROM predictions WHERE profile_id = %L',
            t.uid('ph-p1'))),
          'mismos votos que deja ver la RLS de predictions (nada más)');

-- ---------------- Jugadores sin votos visibles ----------------
SELECT is(pg_temp.h('ph-viewer', 'ph-p2', 'SELECT count(*) FROM %s'), '0', 'solo votó una serie abierta: nada (ni su existencia)');
SELECT is(pg_temp.h('ph-viewer', 'ph-p3', 'SELECT count(*) FROM %s'), '0', 'jugador sin votos: vacío');
SELECT is(t.run_as('authenticated', t.uid('ph-viewer'), format('SELECT count(*) FROM get_lol_player_days(%L, %s)', t.uid('ph-p3'), (SELECT e FROM ph_ids))),
          '0', 'jugador sin votos: sin plenos');

-- ---------------- Entrada tarde ----------------
SELECT is(pg_temp.h('ph-viewer', 'ph-p4', 'SELECT string_agg(match_id::text || '':'' || voted, '','' ORDER BY match_id) FROM %s'),
          (SELECT format('%s:true,%s:false,%s:false', s[2], s[3], s[4]) FROM ph_ids),
          'desde su primer voto (S2); S3 y S4 sin voto aparecen como "sin voto"');
SELECT is(pg_temp.h('ph-viewer', 'ph-p4', format('SELECT (total = 0)::text FROM %%s WHERE match_id = %s', (SELECT s[3] FROM ph_ids))),
          'true', 'serie terminada sin voto: desglose a 0');

-- ---------------- Plenos por jornada = clasificación ----------------
SELECT is((SELECT count(*) FILTER (WHERE perfect) || '/' || count(*) FILTER (WHERE negative)
           FROM get_lol_player_days(t.uid('ph-p1'), (SELECT e FROM ph_ids))),
          (SELECT perfect_days || '/' || negative_days FROM t.standing((SELECT e FROM ph_ids), t.uid('ph-p1'))),
          'ph-p1: plenos positivos/negativos = lol_standings_at');
SELECT is((SELECT count(*) FILTER (WHERE perfect) || '/' || count(*) FILTER (WHERE negative)
           FROM get_lol_player_days(t.uid('ph-p4'), (SELECT e FROM ph_ids))),
          (SELECT perfect_days || '/' || negative_days FROM t.standing((SELECT e FROM ph_ids), t.uid('ph-p4'))),
          'ph-p4: plenos positivos/negativos = lol_standings_at');
SELECT is((SELECT string_agg(day || ':' || negative || ':' || pleno_points, ',') FROM get_lol_player_days(t.uid('ph-p4'), (SELECT e FROM ph_ids))),
          '2026-10-01:true:-2,2026-10-02:true:-2', 'ph-p4: S2 fallada (día 1 solo cuenta S2) y S3 sin voto: dos plenos negativos de −2');
SELECT is((SELECT SUM(pleno_points)::bigint FROM get_lol_player_days(t.uid('ph-p1'), (SELECT e FROM ph_ids)))
          + (SELECT SUM(points_earned)::bigint FROM predictions WHERE profile_id = t.uid('ph-p1')),
          (SELECT total_points FROM t.standing((SELECT e FROM ph_ids), t.uid('ph-p1'))),
          'ph-p1: puntos de series + plenos = total de la clasificación');
SELECT is((SELECT SUM(pleno_points)::bigint FROM get_lol_player_days(t.uid('ph-p4'), (SELECT e FROM ph_ids)))
          + (SELECT COALESCE(SUM(points_earned), 0)::bigint FROM predictions WHERE profile_id = t.uid('ph-p4')),
          (SELECT total_points FROM t.standing((SELECT e FROM ph_ids), t.uid('ph-p4'))),
          'ph-p4: puntos de series + plenos = total de la clasificación');

-- ---------------- Fuera de LoL ----------------
SELECT is(t.run_as('authenticated', t.uid('ph-viewer'), format('SELECT count(*) FROM get_lol_player_history(%L, %s)', t.uid('ph-p1'),
            (SELECT e.id FROM editions e JOIN competitions c ON c.id = e.competition_id WHERE c.slug = 'fifa-world-cup' LIMIT 1))),
          '0', 'una edición de fútbol no devuelve nada');
SELECT is(t.run_as('authenticated', t.uid('ph-viewer'), format('SELECT count(*) FROM get_lol_player_history(%L, -1)', t.uid('ph-p1'))),
          '0', 'edición inexistente: vacío');

SELECT * FROM finish();
ROLLBACK;
