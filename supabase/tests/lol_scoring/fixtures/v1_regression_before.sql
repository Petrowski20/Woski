-- ============================================================
--  Regresión v1 — foto de HOY (antes del motor v2)
--  Se carga con el esquema que hay en remoto (hasta la migración
--  de integridad). Crea una edición con rulesets v1 y guarda en
--  t.snap_* lo que la app puntúa y clasifica hoy:
--  * puntos: la fórmula del antiguo scoreSeriesPrediction de
--    TypeScript (exacto → exact_score_points, si no ganador →
--    correct_winner_points, si no 0), aplicada como hacía
--    setLolMatchResultAction;
--  * clasificación: lol_standings_at y get_lol_standings de la
--    migración de integridad (global, pool y a una fecha pasada).
--  test_10_v1_regression.sql recalcula con el motor nuevo y
--  compara.
-- ============================================================

DO $$
DECLARE
  e   integer := t.edition('v1 Regression');
  rd  integer := (SELECT id FROM public.rulesets WHERE name = 'LoL Series (default)');
  rc  integer := t.ruleset('v1 custom', '{"scoring_type":"series","correct_winner_points":2,"exact_score_points":5,"default_best_of":5}');
  p1  integer;
  p2  integer;
  ana uuid := t.player('v1-ana', p_created => '2026-01-01');
  bea uuid := t.player('v1-bea', p_created => '2026-01-02');
  car uuid := t.player('v1-carl', p_created => '2026-01-03');
  dan uuid := t.player('v1-dan', p_created => '2026-01-04');
  eva uuid := t.player('v1-eva', p_hidden => true);
  fer uuid := t.player('v1-fer', p_created => '2026-01-05');
  m   integer[] := '{}';
  pool_id integer;
BEGIN
  p1 := t.phase(e, rd, 'Fase v1 default', 0);
  p2 := t.phase(e, rc, 'Fase v1 custom', 1);

  -- Jornada 1 (P1): Bo1, Bo3 (default del ruleset), Bo5
  m := m || t.match(p1, '2026-09-01 14:00+00', 1, 'AAA', 'BBB');
  m := m || t.match(p1, '2026-09-01 16:00+00', NULL, 'CCC', 'DDD');
  m := m || t.match(p1, '2026-09-01 18:00+00', 5, 'EEE', 'FFF');
  -- Jornada 2 (P1): dos Bo3 y una cancelada
  m := m || t.match(p1, '2026-09-02 14:00+00', 3, 'AAA', 'CCC');
  m := m || t.match(p1, '2026-09-02 16:00+00', 3, 'BBB', 'DDD');
  m := m || t.match(p1, '2026-09-02 18:00+00', 3, 'EEE', 'AAA');
  -- Jornada 3 (P2, puntos 2/5, Bo5 por defecto)
  m := m || t.match(p2, '2026-09-03 14:00+00', NULL, 'FFF', 'BBB');
  m := m || t.match(p2, '2026-09-03 16:00+00', 3, 'CCC', 'EEE');
  -- Jornada 4 (P2): una terminada y otra pendiente → jornada abierta
  m := m || t.match(p2, '2026-09-04 14:00+00', NULL, 'DDD', 'AAA');
  m := m || t.match(p2, '2026-09-04 16:00+00', NULL, 'BBB', 'CCC');

  -- Votos
  PERFORM t.vote(ana, m[1], 1, 0);  PERFORM t.vote(bea, m[1], 0, 1);  PERFORM t.vote(car, m[1], 1, 0);  PERFORM t.vote(eva, m[1], 1, 0);
  PERFORM t.vote(ana, m[2], 2, 1);  PERFORM t.vote(bea, m[2], 2, 0);  PERFORM t.vote(car, m[2], 0, 2);  PERFORM t.vote(eva, m[2], 2, 1);
  PERFORM t.vote(ana, m[3], 3, 1);  PERFORM t.vote(bea, m[3], 3, 2);                                     PERFORM t.vote(eva, m[3], 1, 3);
  PERFORM t.vote(ana, m[4], 2, 0);  PERFORM t.vote(bea, m[4], 0, 2);  PERFORM t.vote(car, m[4], 2, 1);  PERFORM t.vote(dan, m[4], 2, 0);
  PERFORM t.vote(ana, m[5], 1, 2);  PERFORM t.vote(bea, m[5], 2, 1);  PERFORM t.vote(car, m[5], 1, 2);  PERFORM t.vote(dan, m[5], 0, 2);
  PERFORM t.vote(ana, m[6], 2, 0);  PERFORM t.vote(dan, m[6], 0, 2);
  PERFORM t.vote(ana, m[7], 3, 0);  PERFORM t.vote(bea, m[7], 3, 0);  PERFORM t.vote(car, m[7], 0, 3);  PERFORM t.vote(dan, m[7], 3, 2);
  PERFORM t.vote(ana, m[8], 2, 1);  PERFORM t.vote(bea, m[8], 1, 2);  PERFORM t.vote(car, m[8], 2, 0);  PERFORM t.vote(dan, m[8], 2, 1);
  PERFORM t.vote(ana, m[9], 3, 1);  PERFORM t.vote(bea, m[9], 1, 3);  PERFORM t.vote(dan, m[9], 3, 1);
  PERFORM t.vote(ana, m[10], 3, 0); PERFORM t.vote(car, m[10], 0, 3);

  -- Resultados
  PERFORM t.finish(m[1], 1, 0);
  PERFORM t.finish(m[2], 2, 1);
  PERFORM t.finish(m[3], 3, 2);
  PERFORM t.finish(m[4], 2, 0);
  PERFORM t.finish(m[5], 0, 2);
  UPDATE public.matches SET status = 'CANCELLED' WHERE id = m[6];
  PERFORM t.finish(m[7], 3, 0);
  PERFORM t.finish(m[8], 2, 1);
  PERFORM t.finish(m[9], 1, 3);

  -- Pool: fer nunca vota; bea entra en la jornada 2.
  INSERT INTO public.pools (name, edition_id) VALUES ('Pool v1 regression', e) RETURNING id INTO pool_id;
  INSERT INTO public.pool_members (pool_id, profile_id, joined_at) VALUES
    (pool_id, ana, '2026-08-30 10:00+00'),
    (pool_id, bea, '2026-09-02 10:00+00'),
    (pool_id, dan, '2026-09-01 10:00+00'),
    (pool_id, fer, '2026-08-30 10:00+00');

  -- Puntuación de HOY (antiguo scoreSeriesPrediction + reset de canceladas)
  UPDATE public.predictions pr
  SET is_correct_score  = (pr.pred_home_goals = mt.home_goals AND pr.pred_away_goals = mt.away_goals),
      is_correct_winner = sign(pr.pred_home_goals - pr.pred_away_goals) = sign(mt.home_goals - mt.away_goals),
      points_earned = CASE
        WHEN pr.pred_home_goals = mt.home_goals AND pr.pred_away_goals = mt.away_goals
          THEN COALESCE((r.config ->> 'exact_score_points')::integer, 3)
        WHEN sign(pr.pred_home_goals - pr.pred_away_goals) = sign(mt.home_goals - mt.away_goals)
          THEN COALESCE((r.config ->> 'correct_winner_points')::integer, 1)
        ELSE 0 END
  FROM public.matches mt
  JOIN public.phases ph  ON ph.id = mt.phase_id
  JOIN public.rulesets r ON r.id = ph.ruleset_id
  WHERE mt.id = pr.match_id AND ph.edition_id = e AND mt.status = 'FINISHED';

  CREATE TABLE t.snap_meta AS SELECT e AS edition_id, pool_id, m AS match_ids;
END;
$$;

CREATE TABLE t.snap_points AS
SELECT pr.id, pr.points_earned, pr.is_correct_winner, pr.is_correct_score
FROM public.predictions pr
JOIN public.matches mt ON mt.id = pr.match_id
JOIN public.phases ph  ON ph.id = mt.phase_id
WHERE ph.edition_id = (SELECT edition_id FROM t.snap_meta);

CREATE TABLE t.snap_standings AS
SELECT 'global' AS label, s.* FROM public.lol_standings_at((SELECT edition_id FROM t.snap_meta), NULL, NULL) s
UNION ALL
SELECT 'pool', s.* FROM public.lol_standings_at((SELECT edition_id FROM t.snap_meta), (SELECT pool_id FROM t.snap_meta), NULL) s
UNION ALL
SELECT 'global-0902', s.* FROM public.lol_standings_at((SELECT edition_id FROM t.snap_meta), NULL, DATE '2026-09-02') s
UNION ALL
SELECT 'pool-0902', s.* FROM public.lol_standings_at((SELECT edition_id FROM t.snap_meta), (SELECT pool_id FROM t.snap_meta), DATE '2026-09-02') s;

CREATE TABLE t.snap_get_standings AS
SELECT 'global' AS label, s.* FROM public.get_lol_standings((SELECT edition_id FROM t.snap_meta), NULL) s
UNION ALL
SELECT 'pool', s.* FROM public.get_lol_standings((SELECT edition_id FROM t.snap_meta), (SELECT pool_id FROM t.snap_meta)) s;
