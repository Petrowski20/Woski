-- Racha estricta: el marcador exacto como predicción propia
-- (streak_bonus.exact_as_prediction, 20261021100001).
-- Cada serie Bo3/Bo5 son dos predicciones seguidas (ganador y
-- marcador); cada acierto suma 1 y paga su bonus, cada fallo o
-- serie sin votar corta.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(63);

-- ---------- Validación del config ----------
CREATE TEMP TABLE cx AS
SELECT jsonb_set((SELECT config FROM t.seed_playin), '{streak_bonus,count_exact_score}', 'true') AS on_ex,
       (SELECT config FROM t.seed_playin) AS base;

SELECT lives_ok($$ SELECT validate_ruleset_config(jsonb_set((SELECT on_ex FROM cx), '{streak_bonus,exact_as_prediction}', 'true')) $$,
                'exact_as_prediction = true con count_exact_score = true: válido');
SELECT lives_ok($$ SELECT validate_ruleset_config(jsonb_set((SELECT on_ex FROM cx), '{streak_bonus,exact_as_prediction}', 'false')) $$,
                'exact_as_prediction = false: válido');
SELECT lives_ok($$ SELECT validate_ruleset_config(jsonb_set((SELECT base FROM cx), '{streak_bonus,exact_as_prediction}', 'false')) $$,
                'exact_as_prediction = false sin count_exact_score: válido');
SELECT throws_ok($$ SELECT validate_ruleset_config(jsonb_set((SELECT on_ex FROM cx), '{streak_bonus,exact_as_prediction}', '"true"')) $$,
                 '22023', 'config v2: "streak_bonus.exact_as_prediction" debe ser true o false', 'texto "true": rechazado');
SELECT throws_ok($$ SELECT validate_ruleset_config(jsonb_set((SELECT on_ex FROM cx), '{streak_bonus,exact_as_prediction}', '1')) $$,
                 '22023', 'config v2: "streak_bonus.exact_as_prediction" debe ser true o false', 'número: rechazado');
SELECT throws_ok($$ SELECT validate_ruleset_config(jsonb_set((SELECT on_ex FROM cx), '{streak_bonus,exact_as_prediction}', 'null')) $$,
                 '22023', 'config v2: "streak_bonus.exact_as_prediction" debe ser true o false', 'null: rechazado');
SELECT throws_ok($$ SELECT validate_ruleset_config(jsonb_set((SELECT base FROM cx), '{streak_bonus,exact_as_prediction}', 'true')) $$,
                 '22023', 'config v2: "streak_bonus.exact_as_prediction" exige "streak_bonus.count_exact_score" = true',
                 'true sin count_exact_score: rechazado');
SELECT throws_ok($$ SELECT validate_ruleset_config(jsonb_set(jsonb_set((SELECT base FROM cx), '{streak_bonus,count_exact_score}', 'false'),
                                                             '{streak_bonus,exact_as_prediction}', 'true')) $$,
                 '22023', 'config v2: "streak_bonus.exact_as_prediction" exige "streak_bonus.count_exact_score" = true',
                 'true con count_exact_score = false: rechazado');
SELECT throws_ok($$ INSERT INTO rulesets (name, config)
                    VALUES ('rechazada', jsonb_set((SELECT base FROM cx), '{streak_bonus,exact_as_prediction}', 'true')) $$,
                 '22023', NULL, 'la tabla rulesets también la rechaza');

-- ---------- Secuencia sintética (tramos del seed: 3 → +1, 7 → +2) ----------
-- Fase Bo5: A..I. Fase Bo1: J..L. "u" vota; la multitud vota otra
-- cosa (solo para que haya votantes).
--   A ✓✓   B ✓✗   C ✓✗   D ✓✓   E ✓✓   F ✗   G ✓✓   H sin voto   I ✓✓
--   Bo1: J ✓   K ✓   L ✓
DO $$
DECLARE
  e   integer := t.edition('racha estricta');
  cfg jsonb   := jsonb_set(jsonb_set((SELECT config FROM t.seed_playin), '{streak_bonus,count_exact_score}', 'true'),
                           '{streak_bonus,exact_as_prediction}', 'true');
  rs5 integer := t.ruleset('estricta bo5', cfg);
  rs1 integer := t.ruleset('estricta bo1', cfg || '{"default_best_of": 1}');
  f1  integer := t.phase(e, rs5, 'Bo5', 0);
  f2  integer := t.phase(e, rs1, 'Bo1', 1);
  a   integer[] := '{}';
  b   integer[] := '{}';
  u   uuid := t.player('st-u');
  -- voto de u por serie (resultado real siempre 3-1)
  vh  integer[] := ARRAY[3, 3, 3, 3, 3, 1, 3, NULL, 3];
  va  integer[] := ARRAY[1, 0, 2, 1, 1, 3, 1, NULL, 1];
BEGIN
  FOR i IN 1..9 LOOP a := a || t.match(f1, TIMESTAMPTZ '2026-10-10 08:00+00' + make_interval(hours => i)); END LOOP;
  FOR i IN 1..3 LOOP b := b || t.match(f2, TIMESTAMPTZ '2026-10-11 08:00+00' + make_interval(hours => i)); END LOOP;
  FOR i IN 1..9 LOOP
    PERFORM t.crowd('st-crowd', 3, a[i], 0, 3);
    IF vh[i] IS NOT NULL THEN PERFORM t.vote(u, a[i], vh[i], va[i]); END IF;
    PERFORM t.finish(a[i], 3, 1);
  END LOOP;
  FOR i IN 1..3 LOOP
    PERFORM t.crowd('st-crowd', 3, b[i], 0, 1); PERFORM t.vote(u, b[i], 1, 0); PERFORM t.finish(b[i], 1, 0);
  END LOOP;
  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE st AS SELECT e, rs5, a, b;
END;
$$;

CREATE TEMP TABLE sb AS
SELECT i, b.streak_length, b.streak_bonus, b.base_winner, b.base_exact, b.total, b.explanation
FROM generate_series(1, 9) i
CROSS JOIN LATERAL lol_score_breakdown(t.uid('st-u'), (SELECT a[i] FROM st)) b;

-- Racha tras cada predicción (ganador/marcador) y bonus de cada una.
CREATE TEMP TABLE steps AS
SELECT i, string_agg((s ->> 'length') || '(' || (s ->> 'bonus') || ')', ' ' ORDER BY o) AS txt
FROM sb CROSS JOIN LATERAL jsonb_array_elements(explanation -> 'streak' -> 'steps') WITH ORDINALITY x(s, o)
GROUP BY i;

SELECT is((SELECT txt FROM steps WHERE i = 1), '1(0) 2(0)', 'A ✓✓: racha 1 y 2, bonus 0 y 0');
SELECT is((SELECT txt FROM steps WHERE i = 2), '3(1) 0(0)', 'B ✓✗: racha 3 (+1) y luego 0');
SELECT is((SELECT txt FROM steps WHERE i = 3), '1(0) 0(0)', 'C ✓✗: racha 1 (0) y luego 0');
SELECT is((SELECT streak_length || '/' || streak_bonus FROM sb WHERE i = 2), '0/1', 'B: streak_length = racha tras el marcador (0), bonus +1');
SELECT is((SELECT txt FROM steps WHERE i = 4), '1(0) 2(0)', 'D ✓✓: vuelve a 1 y 2');
SELECT is((SELECT txt FROM steps WHERE i = 5), '3(1) 4(1)', 'E ✓✓ entrando con 2: racha 3 (+1) y 4 (+1)');
SELECT is((SELECT streak_bonus FROM sb WHERE i = 5), 2, 'E: dos bonus en la misma serie (+2)');
SELECT is((SELECT total FROM sb WHERE i = 5), (SELECT base_winner + base_exact + 2 FROM sb WHERE i = 5),
          'E: total = ganador + marcador + los dos bonus');
SELECT is((SELECT base_winner FROM sb WHERE i = 5), (SELECT base_winner FROM sb WHERE i = 1),
          'los puntos por cuota no cambian con la racha');
SELECT is((SELECT txt FROM steps WHERE i = 6), '0(0) 0(0)', 'F ganador fallado: el marcador cuenta como fallado, racha 0');
SELECT is((SELECT streak_length || '/' || streak_bonus || '/' || total FROM sb WHERE i = 6), '0/0/0', 'F: sin puntos ni bonus');
SELECT is((SELECT explanation -> 'streak' -> 'steps' -> 1 ->> 'hit' FROM sb WHERE i = 6), 'false', 'F: el paso del marcador figura como fallo');
SELECT is((SELECT txt FROM steps WHERE i = 7), '1(0) 2(0)', 'G ✓✓ tras el fallo: 1 y 2');
SELECT is((SELECT count(*) FROM sb WHERE i = 8 AND explanation ->> 'voted' = 'false'), 1::bigint, 'H sin voto: voted = false');
SELECT is((SELECT txt FROM steps WHERE i = 9), '1(0) 2(0)', 'I tras no votar H: vuelve a 1 y 2 (no 3 y 4)');
SELECT is((SELECT explanation -> 'streak' ->> 'exact_as_prediction' FROM sb WHERE i = 1), 'true', 'explanation.streak.exact_as_prediction');
SELECT is((SELECT explanation -> 'streak' -> 'steps' -> 0 ->> 'prediction' || ',' || (explanation -> 'streak' -> 'steps' -> 1 ->> 'prediction')
           FROM sb WHERE i = 1), 'winner,exact', 'steps: primero ganador, después marcador');

-- Bo1: solo la predicción del ganador; la fase nueva empieza en 0.
CREATE TEMP TABLE sb1 AS
SELECT i, b.streak_length, b.streak_bonus, b.base_exact, b.explanation
FROM generate_series(1, 3) i
CROSS JOIN LATERAL lol_score_breakdown(t.uid('st-u'), (SELECT b[i] FROM st)) b;

SELECT is((SELECT string_agg(streak_length || '(' || streak_bonus || ')', ' ' ORDER BY i) FROM sb1), '1(0) 2(0) 3(1)',
          'Bo1: una predicción por serie; cambio de fase reinicia (1, no 3)');
SELECT is((SELECT jsonb_array_length(explanation -> 'streak' -> 'steps') FROM sb1 WHERE i = 1), 1, 'Bo1: un solo paso');
SELECT is((SELECT base_exact FROM sb1 WHERE i = 3), 0, 'Bo1: sin puntos de marcador');

-- Clasificación: actual y mejor de la fase en curso.
SELECT is((SELECT current_streak || '/' || best_streak FROM t.standing((SELECT e FROM st), t.uid('st-u'))), '3/3',
          'clasificación final: actual 3 y mejor 3 (solo la fase Bo1)');
SELECT is((SELECT current_streak || '/' || best_streak FROM t.standing((SELECT e FROM st), t.uid('st-u'), NULL, DATE '2026-10-10')), '2/4',
          'al cierre de la fase Bo5: actual 2 y mejor 4 (pico de E antes del corte de F)');
SELECT is((SELECT total_points FROM t.standing((SELECT e FROM st), t.uid('st-u'), NULL, DATE '2026-10-10')),
          (SELECT SUM(total)::bigint FROM sb), 'puntos de la clasificación = suma de los desgloses (sin plenos: día con fallos y aciertos)');
SELECT is(t.run_as('authenticated', t.uid('st-u'), format(
            'SELECT string_agg(streak_length || ''/'' || streak_bonus, '','' ORDER BY match_id) FROM get_my_lol_breakdowns(%L)',
            (SELECT a FROM st))),
          '2/0,0/1,0/0,2/0,4/2,0/0,2/0,2/0', 'get_my_lol_breakdowns con su JWT (sin H)');
SELECT is((SELECT SUM(points_earned)::integer FROM predictions WHERE profile_id = t.uid('st-u') AND match_id = ANY ((SELECT a FROM st)::integer[])),
          (SELECT SUM(total)::integer FROM sb), 'points_earned = total del desglose');

-- ---------- Salto de tramo dentro de una serie ----------
-- Tramos {3:+1, 4:+5}: entrando con 2, ganador → 3 (+1) y marcador → 4 (+5).
DO $$
DECLARE
  e   integer := t.edition('racha estricta tramos');
  cfg jsonb   := t.cfg_v2(5, '{"streak_bonus": {"scope": "phase", "count_exact_score": true, "exact_as_prediction": true,
                                "tiers": [{"from": 3, "bonus": 1}, {"from": 4, "bonus": 5}]}}');
  f   integer := t.phase(e, t.ruleset('stx', cfg), 'Bo5', 0);
  a   integer[] := '{}';
  u   uuid := t.player('stx-u');
BEGIN
  FOR i IN 1..2 LOOP
    a := a || t.match(f, TIMESTAMPTZ '2026-10-12 10:00+00' + make_interval(hours => i));
    PERFORM t.crowd('stx-crowd', 3, a[i], 0, 3); PERFORM t.vote(u, a[i], 3, 1); PERFORM t.finish(a[i], 3, 1);
  END LOOP;
  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE stx AS SELECT e, a;
END;
$$;
SELECT is((SELECT streak_length || '/' || streak_bonus FROM lol_score_breakdown(t.uid('stx-u'), (SELECT a[2] FROM stx))), '4/6',
          'salto de tramo: +1 por llegar a 3 y +5 por llegar a 4');
SELECT is((SELECT streak_bonus FROM lol_score_breakdown(t.uid('stx-u'), (SELECT a[1] FROM stx))), 0, 'primera serie: racha 1 y 2, sin bonus');

-- ---------- Play-In sintético (mismos datos que test_18) ----------
-- S125 3-1 · S126 2-3 · S127 3-0 · S128 3-0 · S129..S131 3-0
DO $$
DECLARE
  e    integer := t.edition('worlds playin estricto');
  rs   integer := t.ruleset('LoL Worlds Play-In (estricta)',
                            jsonb_set((SELECT config FROM t.seed_playin), '{streak_bonus,count_exact_score}', 'true'));
  ph   integer := t.phase(e, rs, 'Play-In', 0);
  s    integer[] := '{}';
  g10  uuid := t.player('G10YM',        p_created => '2026-01-01');
  p1   uuid := t.player('pi-p1',        p_created => '2026-01-02');
  p2   uuid := t.player('pi-p2',        p_created => '2026-01-03');
  p3   uuid := t.player('pi-p3',        p_created => '2026-01-04');
  p4   uuid := t.player('pi-p4',        p_created => '2026-01-05');
  ser  uuid := t.player('ser9889super', p_created => '2026-01-06');
BEGIN
  s := s || t.match(ph, '2026-10-01 10:00+00');
  s := s || t.match(ph, '2026-10-01 14:00+00');
  s := s || t.match(ph, '2026-10-02 10:00+00');
  s := s || t.match(ph, '2026-10-02 14:00+00');
  s := s || t.match(ph, '2026-10-03 10:00+00');
  s := s || t.match(ph, '2026-10-03 14:00+00');
  s := s || t.match(ph, '2026-10-04 10:00+00');

  PERFORM t.vote(g10, s[1], 3, 1); PERFORM t.vote(p4, s[1], 3, 1);
  PERFORM t.vote(p1, s[1], 1, 3);  PERFORM t.vote(p2, s[1], 0, 3); PERFORM t.vote(p3, s[1], 2, 3);
  PERFORM t.vote(g10, s[2], 1, 3); PERFORM t.vote(p1, s[2], 2, 3); PERFORM t.vote(p3, s[2], 0, 3);
  PERFORM t.vote(p2, s[2], 3, 2);  PERFORM t.vote(p4, s[2], 3, 0);
  PERFORM t.vote(g10, s[3], 3, 1); PERFORM t.vote(p1, s[3], 3, 0); PERFORM t.vote(p2, s[3], 0, 3);
  PERFORM t.vote(p3, s[3], 3, 0);  PERFORM t.vote(p4, s[3], 3, 2);
  PERFORM t.vote(p1, s[4], 3, 0); PERFORM t.vote(p2, s[4], 0, 3); PERFORM t.vote(p3, s[4], 0, 3); PERFORM t.vote(p4, s[4], 3, 0);
  PERFORM t.vote(g10, s[5], 3, 0); PERFORM t.vote(p1, s[5], 3, 0); PERFORM t.vote(p2, s[5], 0, 3); PERFORM t.vote(p3, s[5], 3, 1);
  PERFORM t.vote(ser, s[6], 3, 0); PERFORM t.vote(g10, s[6], 3, 1); PERFORM t.vote(p1, s[6], 3, 0);
  PERFORM t.vote(p2, s[6], 0, 3);  PERFORM t.vote(p3, s[6], 3, 2);
  PERFORM t.vote(g10, s[7], 3, 0); PERFORM t.vote(p1, s[7], 3, 1); PERFORM t.vote(p2, s[7], 0, 3); PERFORM t.vote(p3, s[7], 3, 0);

  PERFORM t.finish(s[1], 3, 1);
  PERFORM t.finish(s[2], 2, 3);
  FOR i IN 3..7 LOOP PERFORM t.finish(s[i], 3, 0); END LOOP;
  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE pi AS SELECT e, rs, s;
END;
$$;

-- Foto con count_exact_score = true y sin exact_as_prediction.
CREATE TEMP TABLE snap_pts AS
SELECT pr.profile_id, pr.match_id, pr.points_earned, pr.is_correct_winner, pr.is_correct_score
FROM predictions pr WHERE pr.match_id = ANY ((SELECT s FROM pi)::integer[]);
CREATE TEMP TABLE snap_bd AS
SELECT b.*
FROM predictions pr CROSS JOIN LATERAL lol_score_breakdown(pr.profile_id, pr.match_id) b
WHERE pr.match_id = ANY ((SELECT s FROM pi)::integer[]);
CREATE TEMP TABLE snap_st AS SELECT * FROM lol_standings_at((SELECT e FROM pi), NULL, NULL);

SELECT is((SELECT count(*) FROM snap_bd WHERE explanation -> 'streak' ? 'steps'), 0::bigint, 'sin el flag: explanation sin steps');

UPDATE rulesets SET config = jsonb_set(config, '{streak_bonus,exact_as_prediction}', 'true') WHERE id = (SELECT rs FROM pi);
SELECT ok(rescore_lol_edition((SELECT e FROM pi)) > 0, 'activar exact_as_prediction y recalcular cambia filas');

CREATE TEMP TABLE bd AS
SELECT v.nick, i, b.streak_length, b.streak_bonus, b.explanation
FROM (VALUES ('G10YM'), ('pi-p4'), ('ser9889super')) v(nick)
CROSS JOIN generate_series(1, 7) i
CROSS JOIN LATERAL lol_score_breakdown(t.uid(v.nick), (SELECT s[i] FROM pi)) b;
CREATE TEMP TABLE bd_steps AS
SELECT nick, i, string_agg((x.s ->> 'length') || '(' || (x.s ->> 'bonus') || ')', ' ' ORDER BY o) AS txt
FROM bd CROSS JOIN LATERAL jsonb_array_elements(explanation -> 'streak' -> 'steps') WITH ORDINALITY x(s, o)
GROUP BY nick, i;

SELECT is((SELECT txt FROM bd_steps WHERE nick = 'G10YM' AND i = 1), '1(0) 2(0)', 'G10YM S125 ganador y marcador: 1 y 2');
SELECT is((SELECT txt FROM bd_steps WHERE nick = 'G10YM' AND i = 2), '3(1) 0(0)', 'G10YM S126: sigue cobrando +1 y el marcador fallado corta');
SELECT is((SELECT txt FROM bd_steps WHERE nick = 'G10YM' AND i = 3), '1(0) 0(0)', 'G10YM S127 ganador ✓ marcador ✗: racha 1 y 0, sin bonus');
SELECT is((SELECT streak_bonus FROM bd WHERE nick = 'G10YM' AND i = 3), 0, 'G10YM S127: pierde el +1 que cobraba');
SELECT is((SELECT txt FROM bd_steps WHERE nick = 'G10YM' AND i = 5), '1(0) 2(0)', 'G10YM S129 tras no votar S128: 1 y 2');
SELECT is((SELECT txt FROM bd_steps WHERE nick = 'G10YM' AND i = 6), '3(1) 0(0)', 'G10YM S130: +1 y corte');
SELECT is((SELECT txt FROM bd_steps WHERE nick = 'G10YM' AND i = 7), '1(0) 2(0)', 'G10YM S131: 1 y 2');
SELECT is((SELECT SUM(points_earned)::integer FROM predictions WHERE profile_id = t.uid('G10YM') AND match_id = ANY ((SELECT s FROM pi)::integer[])),
          (SELECT SUM(points_earned)::integer - 2 FROM snap_pts WHERE profile_id = t.uid('G10YM')),
          'G10YM pierde 2 (los bonus de S127 y S131)');
SELECT is((SELECT current_streak || '/' || best_streak FROM t.standing((SELECT e FROM pi), t.uid('G10YM'))), '2/3',
          'G10YM en la clasificación: actual 2, mejor 3');
SELECT is((SELECT txt FROM bd_steps WHERE nick = 'pi-p4' AND i = 2), '0(0) 0(0)', 'pi-p4 falla el ganador en S126: 0 y 0');
SELECT is((SELECT txt FROM bd_steps WHERE nick = 'pi-p4' AND i = 3), '1(0) 0(0)', 'pi-p4 S127: 1 y 0');
-- Entra tarde: S125..S129 no cuentan; S130 3-0 exacto → 1 y 2; S131 sin votar.
SELECT is((SELECT txt FROM bd_steps WHERE nick = 'ser9889super' AND i = 6), '1(0) 2(0)', 'ser9889super: empieza en su primer voto (S130)');
SELECT is((SELECT current_streak || '/' || best_streak FROM t.standing((SELECT e FROM pi), t.uid('ser9889super'))), '0/2',
          'ser9889super: S131 sin votar corta (actual 0, mejor 2)');
SELECT is((SELECT current_streak || '/' || best_streak FROM t.standing((SELECT e FROM pi), t.uid('ser9889super'), NULL, DATE '2026-10-02')), '0/0',
          'ser9889super antes de su primer voto: 0 y 0');
SELECT is((SELECT total_points FROM t.standing((SELECT e FROM pi), t.uid('ser9889super'))),
          (SELECT points_earned - 2 FROM predictions WHERE profile_id = t.uid('ser9889super') AND match_id = (SELECT s[6] FROM pi))::bigint,
          'ser9889super: sin penalización por S125..S129');

-- Clasificación = motor, jugador a jugador (racha actual tras la última serie votada).
SELECT is_empty(
  $$ SELECT st.profile_id
     FROM lol_standings_at((SELECT e FROM pi), NULL, NULL) st
     CROSS JOIN LATERAL lol_score_breakdown(st.profile_id, (SELECT s[7] FROM pi)) b
     WHERE b.voted AND st.current_streak <> b.streak_length $$,
  'racha actual de la clasificación = streak_length del motor en S131');
SELECT set_eq(
  $$ SELECT profile_id, total_points, correct_winners, finished_series, perfect_days, negative_days, current_streak, best_streak, rank_position
     FROM get_lol_standings((SELECT e FROM pi), NULL) $$,
  $$ SELECT * FROM lol_standings_at((SELECT e FROM pi), NULL, DATE '2026-10-04') $$,
  'get_lol_standings = lol_standings_at(último día)');
SELECT is(t.run_as('authenticated', t.uid('G10YM'), format(
            'SELECT sum(total) FROM get_my_lol_breakdowns(%L)', (SELECT s FROM pi))),
          (SELECT SUM(points_earned)::text FROM predictions WHERE profile_id = t.uid('G10YM') AND match_id = ANY ((SELECT s FROM pi)::integer[])),
          'el desglose suma lo mismo que points_earned');
SELECT is(t.run_as('authenticated', t.uid('G10YM'), format(
            'SELECT (explanation -> ''streak'' -> ''steps'')::text FROM get_my_lol_breakdowns(%L)', ARRAY[(SELECT s[2] FROM pi)])),
          '[{"hit": true, "bonus": 1, "length": 3, "prediction": "winner"}, {"hit": false, "bonus": 0, "length": 0, "prediction": "exact"}]',
          'get_my_lol_breakdowns devuelve los pasos (racha y bonus por predicción)');

-- ---------- Flag a false: idéntico a antes ----------
UPDATE rulesets SET config = jsonb_set(config, '{streak_bonus,exact_as_prediction}', 'false') WHERE id = (SELECT rs FROM pi);
SELECT ok(rescore_lol_edition((SELECT e FROM pi)) > 0, 'desactivar exact_as_prediction y recalcular');
SELECT set_eq(
  $$ SELECT pr.profile_id, pr.match_id, pr.points_earned, pr.is_correct_winner, pr.is_correct_score
     FROM predictions pr WHERE pr.match_id = ANY ((SELECT s FROM pi)::integer[]) $$,
  $$ SELECT * FROM snap_pts $$,
  'exact_as_prediction = false: mismos puntos que count_exact_score solo');
SELECT set_eq(
  $$ SELECT b.* FROM predictions pr CROSS JOIN LATERAL lol_score_breakdown(pr.profile_id, pr.match_id) b
     WHERE pr.match_id = ANY ((SELECT s FROM pi)::integer[]) $$,
  $$ SELECT * FROM snap_bd $$,
  'exact_as_prediction = false: mismo desglose (explanation incluida)');
SELECT set_eq($$ SELECT * FROM lol_standings_at((SELECT e FROM pi), NULL, NULL) $$, $$ SELECT * FROM snap_st $$,
              'exact_as_prediction = false: misma clasificación');
UPDATE rulesets SET config = config #- '{streak_bonus,exact_as_prediction}' WHERE id = (SELECT rs FROM pi);
SELECT is(rescore_lol_edition((SELECT e FROM pi)), 0, 'sin la clave: nada cambia');
SELECT is((SELECT current_streak || '/' || best_streak FROM t.standing((SELECT e FROM pi), t.uid('G10YM'))), '5/5',
          'sin el flag: racha de G10YM como en test_18 (5, mejor 5)');

SELECT * FROM finish();
ROLLBACK;
