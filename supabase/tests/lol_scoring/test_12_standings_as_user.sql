-- Clasificación vista por un usuario authenticated normal (no ADMIN,
-- no oculto), como la pide la app (get_lol_standings con su JWT).
-- El resto de tests llaman a lol_standings_at como la sesión postgres
-- del SQL Editor; aquí se compara contra eso y se comprueba que no se
-- ven votos de series abiertas.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(14);

DO $$
DECLARE
  e  integer := t.edition('standings as user');
  ph integer := t.phase(e, t.ruleset('su v2', t.cfg_v2(1)), 'Fase', 0);
  s1 integer := t.match(ph, '2026-09-01 12:00+00');
  s2 integer := t.match(ph, '2026-09-01 14:00+00');
  s3 integer := t.match(ph, now() + interval '5 days');        -- votación abierta
  u  uuid := t.player('su-user', p_created => '2026-01-03');
  a  uuid := t.player('su-a', p_created => '2026-01-01');
  b  uuid := t.player('su-b', p_created => '2026-01-02');
  h  uuid := t.player('su-hidden', p_hidden => true);
BEGIN
  PERFORM t.vote(u, s1, 1, 0); PERFORM t.vote(a, s1, 0, 1); PERFORM t.vote(b, s1, 1, 0); PERFORM t.vote(h, s1, 1, 0);
  PERFORM t.vote(u, s2, 0, 1); PERFORM t.vote(a, s2, 0, 1); PERFORM t.vote(b, s2, 1, 0); PERFORM t.vote(h, s2, 0, 1);
  PERFORM t.vote(u, s3, 1, 0); PERFORM t.vote(a, s3, 0, 1); PERFORM t.vote(b, s3, 0, 1);
  PERFORM t.finish(s1, 1, 0);
  PERFORM t.finish(s2, 1, 0);
  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE ids AS SELECT e, s1, s2, s3;
END;
$$;
GRANT SELECT ON ids TO authenticated;

-- Representación canónica de una clasificación (para comparar como texto).
CREATE TEMP TABLE canon AS SELECT
  'SELECT string_agg(concat_ws(''|'', profile_id, total_points, correct_winners, finished_series, perfect_days,
                               negative_days, current_streak, best_streak, rank_position), '','' ORDER BY rank_position)
   FROM %s'::text AS tpl;

SELECT ok((SELECT role::text = 'USER' AND NOT is_hidden FROM profiles WHERE id = t.uid('su-user')), 'su-user: ni ADMIN ni oculto');

-- Lo que ve el usuario por la app = lo que calcula postgres
SELECT is(
  t.run_as('authenticated', t.uid('su-user'),
           format((SELECT tpl FROM canon), format('get_lol_standings(%s, NULL)', (SELECT e FROM ids)))),
  (SELECT string_agg(concat_ws('|', profile_id, total_points, correct_winners, finished_series, perfect_days,
                               negative_days, current_streak, best_streak, rank_position), ',' ORDER BY rank_position)
   FROM lol_standings_at((SELECT e FROM ids), NULL, NULL)),
  'authenticated ve la misma clasificación que la sesión postgres');
SELECT is(t.run_as('authenticated', t.uid('su-user'), format('SELECT count(*) FROM get_lol_standings(%s, NULL)', (SELECT e FROM ids))),
          '3', 'clasificación completa: los 3 jugadores visibles (el oculto no)');
SELECT is(t.run_as('authenticated', t.uid('su-user'), format('SELECT max(finished_series) FROM get_lol_standings(%s, NULL)', (SELECT e FROM ids))),
          '2', 'solo cuentan las 2 series cerradas y terminadas');
SELECT is(t.run_as('authenticated', t.uid('su-user'),
          format('SELECT total_points FROM get_lol_standings(%s, NULL) WHERE profile_id = %L', (SELECT e FROM ids), t.uid('su-b'))),
          (SELECT (SUM(points_earned))::text FROM predictions
           WHERE profile_id = t.uid('su-b') AND match_id IN ((SELECT s1 FROM ids), (SELECT s2 FROM ids))),
          've los puntos de otro jugador (series cerradas)');
SELECT is(t.run_as('authenticated', t.uid('su-user'),
          format('SELECT nickname FROM get_lol_standings(%s, NULL) WHERE rank_position = 1', (SELECT e FROM ids))),
          'su-b', 'su-b primero (acertó las dos)');
SELECT alike(t.run_as('authenticated', t.uid('su-user'), format('SELECT count(*) FROM lol_standings_at(%s, NULL, NULL)', (SELECT e FROM ids))),
            '42501: permission denied%', 'lol_standings_at directo: sin permiso (solo vía get_lol_standings)');

-- Votos: de las series cerradas ve todos; de la abierta solo el suyo
SELECT is(t.run_as('authenticated', t.uid('su-user'), format('SELECT count(*) FROM predictions WHERE match_id = %s', (SELECT s1 FROM ids))),
          '4', 'serie cerrada: ve todos los votos');
SELECT is(t.run_as('authenticated', t.uid('su-user'), format('SELECT count(*) FROM predictions WHERE match_id = %s', (SELECT s3 FROM ids))),
          '1', 'serie abierta: solo ve su propio voto');
SELECT is(t.run_as('authenticated', t.uid('su-user'),
          format('SELECT count(*) FROM predictions WHERE match_id = %s AND profile_id <> %L', (SELECT s3 FROM ids), t.uid('su-user'))),
          '0', 'serie abierta: ningún voto ajeno');
SELECT is(t.run_as('authenticated', t.uid('su-user'), format('SELECT count(*) FROM get_my_vote_distribution(ARRAY[%s])', (SELECT s3 FROM ids))),
          '0', 'serie abierta: sin % de votos');
SELECT is(t.run_as('authenticated', t.uid('su-user'), format('SELECT sum(votes) FROM get_my_vote_distribution(ARRAY[%s])', (SELECT s1 FROM ids))),
          '3', 'serie cerrada: % sobre 3 votantes (sin el oculto)');
SELECT is(t.run_as('authenticated', t.uid('su-user'), format('SELECT count(*) FROM get_my_lol_breakdowns(ARRAY[%s, %s])', (SELECT s1 FROM ids), (SELECT s3 FROM ids))),
          '1', 'desglose: solo la serie cerrada');
SELECT is(t.run_as('authenticated', t.uid('su-user'),
          format('SELECT count(*) FROM get_lol_standings(%s, NULL) WHERE total_points > 0 AND finished_series > 2', (SELECT e FROM ids))),
          '0', 'la serie abierta no suma ni cuenta como terminada');

SELECT * FROM finish();
ROLLBACK;
