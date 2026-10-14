-- Mínimo de votantes = 3 con el config REAL del bloque 1A de
-- supabase/seeds/worlds_2026_playin_v2.sql (run.sh lo copia en
-- t.seed_playin). El mínimo cuenta votantes de la SERIE completa.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(15);

SELECT is((SELECT config -> 'winner_points' -> 'min_voters_override' FROM t.seed_playin), '3'::jsonb,
          'seed 1A: winner_points.min_voters_override = 3');
SELECT is((SELECT config -> 'exact_score_points' -> 'min_voters_override' FROM t.seed_playin), '3'::jsonb,
          'seed 1A: exact_score_points.min_voters_override = 3');
SELECT lives_ok($$ SELECT validate_ruleset_config((SELECT config FROM t.seed_playin)) $$, 'seed 1A: config v2 válido');

-- Cada serie con jugadores propios (racha 1, sin bonus) y Bo5 (default del seed).
DO $$
DECLARE
  e  integer := t.edition('min voters seed');
  ph integer := t.phase(e, t.ruleset('LoL Worlds Play-In (test)', (SELECT config FROM t.seed_playin)), 'Play-In', 0);
  s2 integer := t.match(ph, '2026-09-01 12:00+00', NULL, 'AAA', 'BBB');   -- 2 votantes
  s3 integer := t.match(ph, '2026-09-01 18:00+00', NULL, 'CCC', 'DDD');   -- 3 votantes
BEGIN
  -- Serie con 2 votantes: mv2-u es el único con ese ganador y ese marcador.
  PERFORM t.vote(t.player('mv2-u'), s2, 3, 1);
  PERFORM t.vote(t.player('mv2-o'), s2, 0, 3);
  -- Serie con 3 votantes: mv3-u es el único con ese ganador y ese marcador.
  PERFORM t.vote(t.player('mv3-u'), s3, 3, 1);
  PERFORM t.vote(t.player('mv3-o1'), s3, 0, 3);
  PERFORM t.vote(t.player('mv3-o2'), s3, 1, 3);
  PERFORM t.finish(s2, 3, 1);
  PERFORM t.finish(s3, 3, 1);
  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE ids AS SELECT s2, s3;
END;
$$;

-- 2 votantes (< 3): el único cobra fallback 2, en ganador y en marcador.
SELECT is((SELECT best_of FROM lol_score_breakdown(t.uid('mv2-u'), (SELECT s2 FROM ids))), 5, 'Bo5 por default_best_of del seed');
SELECT is((SELECT (explanation ->> 'voters')::integer FROM lol_score_breakdown(t.uid('mv2-u'), (SELECT s2 FROM ids))), 2, '2 votantes en la serie');
SELECT is((SELECT base_winner FROM lol_score_breakdown(t.uid('mv2-u'), (SELECT s2 FROM ids))), 2, '2 votantes: ganador único → 2');
SELECT is((SELECT explanation -> 'winner' ->> 'tier' FROM lol_score_breakdown(t.uid('mv2-u'), (SELECT s2 FROM ids))), 'fallback',
          '2 votantes: tramo fallback en ganador');
SELECT is((SELECT base_exact FROM lol_score_breakdown(t.uid('mv2-u'), (SELECT s2 FROM ids))), 2, '2 votantes: marcador único → 2');
SELECT is((SELECT explanation -> 'exact' ->> 'tier' FROM lol_score_breakdown(t.uid('mv2-u'), (SELECT s2 FROM ids))), 'fallback',
          '2 votantes: tramo fallback en marcador');
SELECT is(t.pts(t.uid('mv2-u'), (SELECT s2 FROM ids)), 4, '2 votantes: total 2 + 2');

-- 3 votantes (= 3): el único cobra 6, en ganador y en marcador.
SELECT is((SELECT base_winner FROM lol_score_breakdown(t.uid('mv3-u'), (SELECT s3 FROM ids))), 6, '3 votantes: ganador único → 6');
SELECT is((SELECT explanation -> 'winner' ->> 'tier' FROM lol_score_breakdown(t.uid('mv3-u'), (SELECT s3 FROM ids))), 'sole',
          '3 votantes: tramo sole en ganador');
SELECT is((SELECT base_exact FROM lol_score_breakdown(t.uid('mv3-u'), (SELECT s3 FROM ids))), 6, '3 votantes: marcador único → 6');
SELECT is((SELECT explanation -> 'exact' ->> 'min_voters' FROM lol_score_breakdown(t.uid('mv3-u'), (SELECT s3 FROM ids))), '3',
          'min_voters = override 3');
SELECT is(t.pts(t.uid('mv3-u'), (SELECT s3 FROM ids)), 12, '3 votantes: total 6 + 6');

SELECT * FROM finish();
ROLLBACK;
