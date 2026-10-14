-- Tramos por % de votantes, "único" con min_voters y fallback
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(26);

-- ---------- Función pura (lol_share_points) ----------
CREATE TEMP TABLE b AS SELECT t.cfg_v2() -> 'winner_points' AS w;

SELECT is((SELECT points FROM lol_share_points((SELECT w FROM b), 499, 1000)), 3, '49,9 % → 3 (25 <= x < 50)');
SELECT is((SELECT points FROM lol_share_points((SELECT w FROM b), 500, 1000)), 2, '50 % → 2');
SELECT is((SELECT points FROM lol_share_points((SELECT w FROM b), 249, 1000)), 4, '24,9 % → 4');
SELECT is((SELECT points FROM lol_share_points((SELECT w FROM b), 250, 1000)), 3, '25 % → 3');
SELECT is((SELECT points FROM lol_share_points((SELECT w FROM b), 1000, 1000)), 2, '100 % (no único) → 2');
SELECT is((SELECT tier FROM lol_share_points((SELECT w FROM b), 1, 10)), 'sole', 'único con 10 votantes → tramo sole');
SELECT is((SELECT points FROM lol_share_points((SELECT w FROM b), 1, 10)), 6, 'único con 10 votantes → 6');
SELECT is((SELECT points FROM lol_share_points((SELECT w FROM b), 1, 1)), 6, 'único y único votante de la serie → 6 (mínimo 1)');

-- Mínimo por porcentaje: max(1, ceil(1 % de votantes))
SELECT is((SELECT min_voters FROM lol_share_points((SELECT w FROM b), 1, 1)),    1, 'min_voters con 1 votante = 1');
SELECT is((SELECT min_voters FROM lol_share_points((SELECT w FROM b), 1, 100)),  1, 'min_voters con 100 votantes = 1');
SELECT is((SELECT min_voters FROM lol_share_points((SELECT w FROM b), 1, 101)),  2, 'min_voters con 101 votantes = 2');
SELECT is((SELECT min_voters FROM lol_share_points((SELECT w FROM b), 1, 250)),  3, 'min_voters con 250 votantes = 3');
SELECT is((SELECT min_voters FROM lol_share_points((SELECT w FROM b), 1, 1000)), 10, 'min_voters con 1000 votantes = 10');
SELECT is((SELECT min_voters FROM lol_share_points(jsonb_set((SELECT w FROM b), '{min_voters_percent}', '50'), 1, 10)), 5,
          'min_voters_percent 50 con 10 votantes = 5');

-- Override: con menos votantes que el mínimo, el único cobra fallback.
SELECT is((SELECT points FROM lol_share_points(jsonb_set((SELECT w FROM b), '{min_voters_override}', '3'), 1, 2)), 2,
          'override 3, 2 votantes, único → fallback 2');
SELECT is((SELECT tier FROM lol_share_points(jsonb_set((SELECT w FROM b), '{min_voters_override}', '3'), 1, 2)), 'fallback',
          'override 3, 2 votantes → tramo fallback');
SELECT is((SELECT points FROM lol_share_points(jsonb_set((SELECT w FROM b), '{min_voters_override}', '3'), 1, 3)), 6,
          'override 3, 3 votantes, único → 6');
SELECT is((SELECT points FROM lol_share_points(
             jsonb_set(jsonb_set((SELECT w FROM b), '{min_voters_override}', '5'), '{fallback_points}', '1'), 1, 4)), 1,
          'fallback_points configurable');

-- ---------- De punta a punta ----------
DO $$
DECLARE
  e  integer := t.edition('tiers e2e');
  ph integer := t.phase(e, t.ruleset('tiers v2', t.cfg_v2()), 'Fase', 0);
  m5 integer := t.match(ph, '2026-09-10 14:00+00', 5);
  m1 integer := t.match(ph, '2026-09-10 16:00+00', 1, 'CCC', 'DDD');
BEGIN
  -- Bo5 3-0: 4 votantes visibles + 1 oculto (no cuenta).
  PERFORM t.vote(t.player('tr-a'), m5, 3, 0);
  PERFORM t.vote(t.player('tr-b'), m5, 3, 0);
  PERFORM t.vote(t.player('tr-c'), m5, 3, 1);
  PERFORM t.vote(t.player('tr-d'), m5, 0, 3);
  PERFORM t.vote(t.player('tr-hidden', p_hidden => true), m5, 0, 3);
  PERFORM t.finish(m5, 3, 0);

  -- Bo1 1-0: 2 de 8 aciertan (25 %).
  PERFORM t.crowd('tr-win', 2, m1, 1, 0);
  PERFORM t.crowd('tr-lose', 6, m1, 0, 1);
  PERFORM t.finish(m1, 1, 0);

  PERFORM score_lol_match(m5);
  PERFORM score_lol_match(m1);
  CREATE TEMP TABLE ids AS SELECT m5, m1;
END;
$$;

SELECT is((SELECT (explanation ->> 'voters')::integer FROM lol_score_breakdown(t.uid('tr-a'), (SELECT m5 FROM ids))), 4,
          'el oculto no cuenta como votante');
SELECT is((SELECT base_winner FROM lol_score_breakdown(t.uid('tr-a'), (SELECT m5 FROM ids))), 2, 'ganador 75 % → 2');
SELECT is((SELECT base_exact  FROM lol_score_breakdown(t.uid('tr-a'), (SELECT m5 FROM ids))), 2, 'exacto 50 % → 2');
SELECT is(t.pts(t.uid('tr-a'), (SELECT m5 FROM ids)), 4, 'points_earned = ganador + exacto');
SELECT is(t.pts(t.uid('tr-c'), (SELECT m5 FROM ids)), 2, 'solo ganador → 2');
SELECT is(t.pts(t.uid('tr-d'), (SELECT m5 FROM ids)), 0, 'fallo → 0');
SELECT is(t.pts(t.uid('tr-win1'), (SELECT m1 FROM ids)), 3, 'Bo1 con 25 % de acierto → 3');
SELECT is((SELECT base_exact FROM lol_score_breakdown(t.uid('tr-win1'), (SELECT m1 FROM ids))), 0, 'Bo1 sin acierto de marcador');

SELECT * FROM finish();
ROLLBACK;
