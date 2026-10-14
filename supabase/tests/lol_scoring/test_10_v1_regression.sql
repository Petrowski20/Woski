-- Regresión v1: con rulesets sin "version", el motor nuevo puntúa y
-- clasifica EXACTAMENTE igual que hoy (foto tomada antes de aplicar
-- las migraciones v2 en fixtures/v1_regression_before.sql).
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(9);

SELECT is((SELECT COUNT(*) FROM t.snap_points), 34::bigint, 'la foto v1 existe');

-- El motor no cambia ni una fila de lo que puntuaba TypeScript.
SELECT is(rescore_lol_edition((SELECT edition_id FROM t.snap_meta)), 0, 'rescore v1: 0 filas cambiadas');
SELECT set_eq(
  $$ SELECT pr.id, pr.points_earned, pr.is_correct_winner, pr.is_correct_score
     FROM predictions pr JOIN matches mt ON mt.id = pr.match_id JOIN phases ph ON ph.id = mt.phase_id
     WHERE ph.edition_id = (SELECT edition_id FROM t.snap_meta) $$,
  $$ SELECT * FROM t.snap_points $$,
  'puntos y aciertos idénticos a la foto');

-- Y también desde cero.
UPDATE predictions pr SET points_earned = 0, is_correct_winner = NULL, is_correct_score = NULL
FROM matches mt JOIN phases ph ON ph.id = mt.phase_id
WHERE mt.id = pr.match_id AND ph.edition_id = (SELECT edition_id FROM t.snap_meta);
SELECT ok(rescore_lol_edition((SELECT edition_id FROM t.snap_meta)) > 0, 'rescore v1 desde cero');
SELECT set_eq(
  $$ SELECT pr.id, pr.points_earned, pr.is_correct_winner, pr.is_correct_score
     FROM predictions pr JOIN matches mt ON mt.id = pr.match_id JOIN phases ph ON ph.id = mt.phase_id
     WHERE ph.edition_id = (SELECT edition_id FROM t.snap_meta) $$,
  $$ SELECT * FROM t.snap_points $$,
  'desde cero: puntos idénticos a la foto');

-- Bo1 en v1 sigue dando el exacto (3), como hacía TypeScript.
SELECT is((SELECT base_exact FROM lol_score_breakdown(t.uid('v1-ana'), (SELECT match_ids[1] FROM t.snap_meta))), 3,
          'v1 Bo1: 1-0 acertado cuenta como exacto (3)');

-- Clasificación: global, pool y a fecha pasada; y el wrapper.
SELECT bag_eq(
  $$ SELECT 'global' AS label, s.* FROM lol_standings_at((SELECT edition_id FROM t.snap_meta), NULL, NULL) s
     UNION ALL SELECT 'pool', s.* FROM lol_standings_at((SELECT edition_id FROM t.snap_meta), (SELECT pool_id FROM t.snap_meta), NULL) s
     UNION ALL SELECT 'global-0902', s.* FROM lol_standings_at((SELECT edition_id FROM t.snap_meta), NULL, DATE '2026-09-02') s
     UNION ALL SELECT 'pool-0902', s.* FROM lol_standings_at((SELECT edition_id FROM t.snap_meta), (SELECT pool_id FROM t.snap_meta), DATE '2026-09-02') s $$,
  $$ SELECT * FROM t.snap_standings $$,
  'lol_standings_at idéntico (global, pool, fecha pasada)');
SELECT bag_eq(
  $$ SELECT 'global' AS label, s.* FROM get_lol_standings((SELECT edition_id FROM t.snap_meta), NULL) s
     UNION ALL SELECT 'pool', s.* FROM get_lol_standings((SELECT edition_id FROM t.snap_meta), (SELECT pool_id FROM t.snap_meta)) s $$,
  $$ SELECT * FROM t.snap_get_standings $$,
  'get_lol_standings idéntico');
SELECT ok((SELECT COUNT(DISTINCT negative_days) > 1 AND MAX(perfect_days) >= 0 FROM t.snap_standings),
          'la foto incluye plenos negativos (no es trivial)');

SELECT * FROM finish();
ROLLBACK;
