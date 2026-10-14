-- Jugadores ocultos y series canceladas / reabiertas
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(10);

DO $$
DECLARE
  e  integer := t.edition('hidden cancelled');
  ph integer := t.phase(e, t.ruleset('hc v2', t.cfg_v2(1)), 'Fase', 0);
  m0 integer := t.match(ph, '2026-09-01 10:00+00');
  m1 integer := t.match(ph, '2026-09-01 12:00+00');
  m2 integer := t.match(ph, '2026-09-01 14:00+00');
  m3 integer := t.match(ph, '2026-09-01 16:00+00');
  u  uuid := t.player('hc-u');
  h  uuid := t.player('hc-hidden', p_hidden => true);
BEGIN
  PERFORM t.crowd('hc-crowd', 3, m0, 1, 0);
  PERFORM t.vote(u, m0, 1, 0);
  PERFORM t.finish(m0, 1, 0);
  -- m1: u es el único visible que acierta; el oculto vota lo mismo.
  PERFORM t.crowd('hc-crowd', 3, m1, 0, 1);
  PERFORM t.vote(u, m1, 1, 0);
  PERFORM t.vote(h, m1, 1, 0);
  -- m2: se juega, se puntúa y luego se cancela.
  PERFORM t.crowd('hc-crowd', 3, m2, 1, 0);
  PERFORM t.vote(u, m2, 0, 1);
  PERFORM t.crowd('hc-crowd', 3, m3, 1, 0);
  PERFORM t.vote(u, m3, 1, 0);
  PERFORM t.finish(m1, 1, 0);
  PERFORM t.finish(m2, 1, 0);
  PERFORM t.finish(m3, 1, 0);
  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE ids AS SELECT e, m1, m2, m3;
END;
$$;

SELECT is((SELECT (explanation ->> 'voters')::integer FROM lol_score_breakdown(t.uid('hc-u'), (SELECT m1 FROM ids))), 4,
          'oculto excluido del denominador');
SELECT is((SELECT base_winner FROM lol_score_breakdown(t.uid('hc-u'), (SELECT m1 FROM ids))), 6,
          'el voto oculto no le quita el "único"');
SELECT ok(NOT EXISTS (SELECT 1 FROM lol_standings_at((SELECT e FROM ids), NULL, NULL) WHERE profile_id = t.uid('hc-hidden')),
          'oculto fuera de la clasificación');

SELECT is(t.pts(t.uid('hc-u'), (SELECT m3 FROM ids)), 2, 'antes de cancelar: m2 fallada corta la racha (m3 racha 1)');

UPDATE matches SET status = 'CANCELLED', home_goals = NULL, away_goals = NULL, winner_id = NULL WHERE id = (SELECT m2 FROM ids);
SELECT lives_ok($$ SELECT score_lol_match((SELECT m2 FROM ids)) $$, 'puntuar tras cancelar');
SELECT is((SELECT points_earned::integer FROM predictions WHERE profile_id = t.uid('hc-u') AND match_id = (SELECT m2 FROM ids)), 0,
          'cancelada: 0 puntos');
SELECT ok((SELECT is_correct_winner IS NULL AND is_correct_score IS NULL FROM predictions
           WHERE profile_id = t.uid('hc-u') AND match_id = (SELECT m2 FROM ids)), 'cancelada: aciertos a NULL');
SELECT is((SELECT streak_length FROM lol_score_breakdown(t.uid('hc-u'), (SELECT m3 FROM ids))), 3,
          'cancelada ignorada: m3 continúa la racha de m0 y m1');
SELECT is(t.pts(t.uid('hc-u'), (SELECT m3 FROM ids)), 3, 'm3 recalculada por la cascada de score_lol_match (2 + racha 1)');
SELECT is((SELECT finished_series FROM lol_standings_at((SELECT e FROM ids), NULL, NULL) WHERE profile_id = t.uid('hc-u')), 3::bigint,
          'cancelada fuera de series terminadas');

SELECT * FROM finish();
ROLLBACK;
