-- Autorización (anon / authenticated / service_role / ADMIN) y
-- carga manual de votos con auditoría.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(38);

DO $$
DECLARE
  e    integer := t.edition('auth');
  ph   integer := t.phase(e, t.ruleset('auth v2', t.cfg_v2(3)), 'Fase', 0);
  done integer := t.match(ph, '2026-09-01 12:00+00', 3, 'AAA', 'BBB');
  open integer := t.match(ph, now() + interval '5 days', 3, 'CCC', 'DDD');
  usr  uuid := t.player('au-user');
  oth  uuid := t.player('au-other');
  adm  uuid := t.player('au-admin', p_role => 'ADMIN');
BEGIN
  PERFORM t.vote(usr, done, 2, 0);
  PERFORM t.vote(oth, done, 0, 2);
  PERFORM t.vote(oth, open, 2, 1);
  PERFORM t.finish(done, 2, 1);
  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE ids AS SELECT e, done, open,
    (SELECT home_team_id FROM matches WHERE id = done) AS done_home,
    (SELECT away_team_id FROM matches WHERE id = done) AS done_away;
END;
$$;
GRANT SELECT ON ids TO anon, authenticated, service_role;

-- Atajos: sentencias a probar
CREATE TEMP TABLE q (k text PRIMARY KEY, sql text);
INSERT INTO q VALUES
  ('score',    format('SELECT score_lol_match(%s)', (SELECT done FROM ids))),
  ('rescore',  format('SELECT rescore_lol_edition(%s)', (SELECT e FROM ids))),
  ('admin_set', format('SELECT admin_set_lol_prediction(%L, %s, NULL, 2, 1, %L)', t.uid('au-user'), (SELECT done FROM ids), 'test')),
  ('featured', format('SELECT set_lol_featured_match(%s, true)', (SELECT open FROM ids)));
GRANT SELECT ON q TO anon, authenticated, service_role;

-- ---------- anon: sin permiso de ejecución ----------
SELECT alike(t.run_as('anon', NULL, (SELECT sql FROM q WHERE k = x)), '42501: permission denied for function%', 'anon no puede: ' || x)
FROM unnest(ARRAY['score', 'rescore', 'admin_set', 'featured']) x;
SELECT alike(t.run_as('anon', NULL, 'SELECT count(*) FROM get_my_lol_breakdowns(ARRAY[1])'), '42501:%', 'anon no puede: get_my_lol_breakdowns');

-- ---------- authenticated sin rol ADMIN: rechazado dentro ----------
SELECT is(t.run_as('authenticated', t.uid('au-user'), (SELECT sql FROM q WHERE k = x)),
          '42501: Solo un administrador puede hacer esto', 'authenticated no puede: ' || x)
FROM unnest(ARRAY['score', 'rescore', 'admin_set', 'featured']) x;

-- Funciones internas: ni siquiera se pueden ejecutar
SELECT alike(t.run_as('authenticated', t.uid('au-user'), x), '42501: permission denied for function%', 'interna bloqueada: ' || x)
FROM unnest(ARRAY[
  format('SELECT total FROM lol_score_breakdown(%L, 1)', t.uid('au-user')),
  'SELECT lol_apply_match_scores(1)',
  'SELECT lol_rescore_from_match(1)',
  'SELECT lol_assert_scoring_actor()',
  'SELECT count(*) FROM lol_standings_at(1, NULL, NULL)',
  'SELECT count(*) FROM lol_share_points(''{}'', 1, 1)'
]) x;

-- No puede escribir sus puntos directamente (trigger de integridad).
-- Serie abierta: en una cerrada la RLS ya filtra la fila antes.
SELECT alike(t.run_as('authenticated', t.uid('au-other'),
            format('UPDATE predictions SET points_earned = 50 WHERE profile_id = %L AND match_id = %s',
                   t.uid('au-other'), (SELECT open FROM ids))),
            '42501:%', 'authenticated no puede escribir points_earned');

-- Desglose propio: solo sus filas y solo series cerradas
SELECT is(t.run_as('authenticated', t.uid('au-user'),
          format('SELECT count(*) FROM get_my_lol_breakdowns(ARRAY[%s, %s])', (SELECT done FROM ids), (SELECT open FROM ids))),
          '1', 'get_my_lol_breakdowns: solo su predicción de la serie cerrada');
SELECT is(t.run_as('authenticated', t.uid('au-other'),
          format('SELECT count(*) FROM get_my_lol_breakdowns(ARRAY[%s])', (SELECT open FROM ids))),
          '0', 'get_my_lol_breakdowns: nada de series con la votación abierta');

-- ---------- service_role: puntúa, pero no carga votos ----------
SELECT is(t.run_as('service_role', NULL, (SELECT sql FROM q WHERE k = 'score')), '0', 'service_role puede puntuar');
SELECT is(t.run_as('service_role', NULL, (SELECT sql FROM q WHERE k = 'rescore')), '0', 'service_role puede recalcular');
SELECT alike(t.run_as('service_role', NULL, (SELECT sql FROM q WHERE k = 'admin_set')), '42501:%',
            'service_role no puede cargar votos (sin admin identificado)');

-- ---------- ADMIN ----------
SELECT is(t.run_as('authenticated', t.uid('au-admin'), (SELECT sql FROM q WHERE k = 'score')), '0', 'ADMIN puede puntuar');
SELECT is(t.run_as('authenticated', t.uid('au-admin'), (SELECT sql FROM q WHERE k = 'featured')), 'ok', 'ADMIN puede marcar el partido de la jornada');

-- Carga manual fuera de plazo (serie terminada): 2-0 → 2-1
SELECT is(t.pts(t.uid('au-user'), (SELECT done FROM ids)), 6, 'antes: único ganador, marcador fallado → 6');
SELECT ok(t.run_as('authenticated', t.uid('au-admin'), (SELECT sql FROM q WHERE k = 'admin_set')) ~ '^[0-9]+$',
          'ADMIN carga un voto fuera de plazo');
SELECT is((SELECT pred_home_goals || '-' || pred_away_goals FROM predictions
           WHERE profile_id = t.uid('au-user') AND match_id = (SELECT done FROM ids)), '2-1', 'voto actualizado');
SELECT is(t.pts(t.uid('au-user'), (SELECT done FROM ids)), 12, 'serie terminada: se repuntúa sola (ganador 6 + exacto 6)');
SELECT is((SELECT (metadata -> 'admin_entered' ->> 'by')::uuid FROM predictions
           WHERE profile_id = t.uid('au-user') AND match_id = (SELECT done FROM ids)), t.uid('au-admin'),
          'predicción marcada como cargada por admin');
SELECT results_eq(
  $$ SELECT actor_id, actor_kind, old_home_goals, old_away_goals, new_home_goals, new_away_goals, reason
     FROM lol_prediction_audit ORDER BY id $$,
  $$ VALUES (t.uid('au-admin'), 'admin', 2, 0, 2, 1, 'test') $$,
  'auditoría: quién, valor anterior, nuevo y motivo');
SELECT ok((SELECT created_at IS NOT NULL AND prediction_id IS NOT NULL FROM lol_prediction_audit LIMIT 1), 'auditoría: cuándo y qué predicción');

-- Alta nueva desde el SQL Editor (sin JWT)
SELECT lives_ok(format($$ SELECT admin_set_lol_prediction(%L, %s, %s, 1, 2) $$,
                       t.player('au-new'), (SELECT done FROM ids), (SELECT done_away FROM ids)),
                'SQL Editor: alta de un voto que no existía');
SELECT results_eq($$ SELECT actor_id IS NULL, actor_kind, old_home_goals IS NULL FROM lol_prediction_audit ORDER BY id DESC LIMIT 1 $$,
                  $$ VALUES (true, 'sql', true) $$, 'auditoría del SQL Editor sin valor anterior');

-- Validaciones
SELECT throws_like(format($$ SELECT admin_set_lol_prediction(%L, %s, %s, 2, 1) $$,
                          t.uid('au-user'), (SELECT done FROM ids), (SELECT done_away FROM ids)),
                   '%no cuadra con el marcador%', 'ganador que no cuadra con el marcador');
SELECT throws_like(format($$ SELECT admin_set_lol_prediction(%L, %s, NULL, 3, 1) $$, t.uid('au-user'), (SELECT done FROM ids)),
                   '%no es un resultado válido para un Bo3%', 'marcador imposible para el best_of');
SELECT throws_like(format($$ SELECT admin_set_lol_prediction(%L, %s, NULL, 2, 1) $$, md5('nadie')::uuid, (SELECT done FROM ids)),
                   '%no existe%', 'usuario inexistente');

-- Auditoría: solo la leen administradores
SELECT is(t.run_as('authenticated', t.uid('au-user'), 'SELECT count(*) FROM lol_prediction_audit'), '0', 'usuario normal no ve la auditoría');
SELECT is(t.run_as('authenticated', t.uid('au-admin'), 'SELECT count(*) FROM lol_prediction_audit'), '2', 'ADMIN ve la auditoría');
SELECT alike(t.run_as('authenticated', t.uid('au-admin'), 'DELETE FROM lol_prediction_audit'), '42501:%',
            'nadie borra la auditoría desde la API');

SELECT * FROM finish();
ROLLBACK;
