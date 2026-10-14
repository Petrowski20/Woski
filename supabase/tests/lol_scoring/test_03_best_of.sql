-- Bo1 vs Bo3/Bo5: el marcador exacto solo existe con best_of > 1
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(11);

DO $$
DECLARE
  e    integer := t.edition('best_of');
  ph5  integer := t.phase(e, t.ruleset('bo v2 (default 5)', t.cfg_v2(5)), 'Fase Bo5', 0);
  ph3  integer := t.phase(e, t.ruleset('bo v2 (sin default)', t.cfg_v2() - 'default_best_of'), 'Fase sin default', 1);
  bo1  integer := t.match(ph5, '2026-09-11 14:00+00', 1);
  bo5  integer := t.match(ph5, '2026-09-11 16:00+00');        -- default del ruleset: 5
  bo3  integer := t.match(ph3, '2026-09-12 14:00+00');        -- sin metadata ni default: 3
  u    uuid    := t.player('bo-u');
BEGIN
  PERFORM t.crowd('bo-x', 3, bo1, 0, 1);
  PERFORM t.vote(u, bo1, 1, 0);
  PERFORM t.crowd('bo-x', 3, bo5, 0, 3);
  PERFORM t.vote(u, bo5, 3, 1);
  PERFORM t.crowd('bo-x', 3, bo3, 0, 2);
  PERFORM t.vote(u, bo3, 2, 1);
  PERFORM t.finish(bo1, 1, 0);
  PERFORM t.finish(bo5, 3, 1);
  PERFORM t.finish(bo3, 2, 1);
  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE ids AS SELECT bo1, bo5, bo3;
END;
$$;

SELECT is((SELECT best_of FROM lol_score_breakdown(t.uid('bo-u'), (SELECT bo1 FROM ids))), 1, 'metadata.best_of = 1');
SELECT is((SELECT best_of FROM lol_score_breakdown(t.uid('bo-u'), (SELECT bo5 FROM ids))), 5, 'sin metadata → default_best_of del ruleset');
SELECT is((SELECT best_of FROM lol_score_breakdown(t.uid('bo-u'), (SELECT bo3 FROM ids))), 3, 'sin metadata ni default → 3');

-- Bo1: 1-0 acertado. Único que acierta de 4 → ganador 6, sin marcador.
SELECT is((SELECT base_winner FROM lol_score_breakdown(t.uid('bo-u'), (SELECT bo1 FROM ids))), 6, 'Bo1: ganador único → 6');
SELECT is((SELECT base_exact  FROM lol_score_breakdown(t.uid('bo-u'), (SELECT bo1 FROM ids))), 0, 'Bo1: el marcador no puntúa');
SELECT is((SELECT (explanation -> 'exact' ->> 'applies')::boolean FROM lol_score_breakdown(t.uid('bo-u'), (SELECT bo1 FROM ids))), false,
          'Bo1: explicación sin acierto de marcador');
SELECT is((SELECT is_correct_score FROM predictions WHERE profile_id = t.uid('bo-u') AND match_id = (SELECT bo1 FROM ids)), true,
          'Bo1: is_correct_score sigue siendo el hecho objetivo');

-- Bo5 3-1: ganador único (6) + marcador único (6).
SELECT is((SELECT base_winner FROM lol_score_breakdown(t.uid('bo-u'), (SELECT bo5 FROM ids))), 6, 'Bo5: ganador único → 6');
SELECT is((SELECT base_exact  FROM lol_score_breakdown(t.uid('bo-u'), (SELECT bo5 FROM ids))), 6, 'Bo5: marcador único → 6');

-- Bo3 2-1 (otra fase: racha 1) → 6 + 6.
SELECT is(t.pts(t.uid('bo-u'), (SELECT bo3 FROM ids)), 12, 'Bo3: ganador y marcador independientes');
SELECT is(t.pts(t.uid('bo-x1'), (SELECT bo3 FROM ids)), 0, 'Bo3: fallo → 0');

SELECT * FROM finish();
ROLLBACK;
