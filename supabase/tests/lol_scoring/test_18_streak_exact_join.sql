-- Racha con marcador exacto (streak_bonus.count_exact_score) y
-- participación desde el primer voto (20261020100001).
-- Datos sintéticos con la forma del Play-In de Worlds (edición 3):
-- config real del seed 1A (t.seed_playin), Bo5, series S125..S131.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(49);

-- ---------- Validación del config ----------
SELECT lives_ok($$ SELECT validate_ruleset_config((SELECT config FROM t.seed_playin)) $$,
                'sin count_exact_score sigue siendo válido');
SELECT lives_ok($$ SELECT validate_ruleset_config(jsonb_set((SELECT config FROM t.seed_playin), '{streak_bonus,count_exact_score}', 'true')) $$,
                'count_exact_score = true es válido');
SELECT lives_ok($$ SELECT validate_ruleset_config(jsonb_set((SELECT config FROM t.seed_playin), '{streak_bonus,count_exact_score}', 'false')) $$,
                'count_exact_score = false es válido');
SELECT throws_ok($$ SELECT validate_ruleset_config(jsonb_set((SELECT config FROM t.seed_playin), '{streak_bonus,count_exact_score}', '"yes"')) $$,
                 '22023', 'config v2: "streak_bonus.count_exact_score" debe ser true o false', 'count_exact_score no booleano: rechazado');
SELECT throws_ok($$ SELECT validate_ruleset_config(jsonb_set((SELECT config FROM t.seed_playin), '{streak_bonus,count_exact}', 'true')) $$,
                 '22023', NULL, 'otra clave en streak_bonus: rechazada');

-- ---------- Play-In sintético ----------
-- S125 3-1 (local) · S126 2-3 (visitante)                → jornada 1
-- S127 3-0 · S128 3-0                                     → jornada 2
-- S129 3-0 · S130 3-0                                     → jornada 3
-- S131 3-0                                                → jornada 4
DO $$
DECLARE
  e    integer := t.edition('worlds playin sintético');
  rs   integer := t.ruleset('LoL Worlds Play-In (racha exacto)', (SELECT config FROM t.seed_playin));
  ph   integer := t.phase(e, rs, 'Play-In', 0);
  s    integer[] := '{}';
  g10  uuid := t.player('G10YM',        p_created => '2026-01-01');
  p1   uuid := t.player('pi-p1',        p_created => '2026-01-02');
  p2   uuid := t.player('pi-p2',        p_created => '2026-01-03');
  p3   uuid := t.player('pi-p3',        p_created => '2026-01-04');
  p4   uuid := t.player('pi-p4',        p_created => '2026-01-05');
  ser  uuid := t.player('ser9889super', p_created => '2026-01-06');
  nv   uuid := t.player('pi-novotes',   p_created => '2026-01-07');
  pool integer;
BEGIN
  s := s || t.match(ph, '2026-10-01 10:00+00');   -- S125
  s := s || t.match(ph, '2026-10-01 14:00+00');   -- S126
  s := s || t.match(ph, '2026-10-02 10:00+00');   -- S127
  s := s || t.match(ph, '2026-10-02 14:00+00');   -- S128
  s := s || t.match(ph, '2026-10-03 10:00+00');   -- S129
  s := s || t.match(ph, '2026-10-03 14:00+00');   -- S130
  s := s || t.match(ph, '2026-10-04 10:00+00');   -- S131

  -- S125 (3-1): ganador local 2/5 (40 % → 3), exacto 3-1 2/5 (→ 3)
  PERFORM t.vote(g10, s[1], 3, 1); PERFORM t.vote(p4, s[1], 3, 1);
  PERFORM t.vote(p1, s[1], 1, 3);  PERFORM t.vote(p2, s[1], 0, 3); PERFORM t.vote(p3, s[1], 2, 3);
  -- S126 (2-3): ganador visitante 3/5 (60 % → 2)
  PERFORM t.vote(g10, s[2], 1, 3); PERFORM t.vote(p1, s[2], 2, 3); PERFORM t.vote(p3, s[2], 0, 3);
  PERFORM t.vote(p2, s[2], 3, 2);  PERFORM t.vote(p4, s[2], 3, 0);
  -- S127 (3-0)
  PERFORM t.vote(g10, s[3], 3, 1); PERFORM t.vote(p1, s[3], 3, 0); PERFORM t.vote(p2, s[3], 0, 3);
  PERFORM t.vote(p3, s[3], 3, 0);  PERFORM t.vote(p4, s[3], 3, 2);
  -- S128 (3-0): G10YM no vota
  PERFORM t.vote(p1, s[4], 3, 0); PERFORM t.vote(p2, s[4], 0, 3); PERFORM t.vote(p3, s[4], 0, 3); PERFORM t.vote(p4, s[4], 3, 0);
  -- S129 (3-0): ser9889super aún no vota
  PERFORM t.vote(g10, s[5], 3, 0); PERFORM t.vote(p1, s[5], 3, 0); PERFORM t.vote(p2, s[5], 0, 3); PERFORM t.vote(p3, s[5], 3, 1);
  -- S130 (3-0): primer voto de ser9889super
  PERFORM t.vote(ser, s[6], 3, 0); PERFORM t.vote(g10, s[6], 3, 1); PERFORM t.vote(p1, s[6], 3, 0);
  PERFORM t.vote(p2, s[6], 0, 3);  PERFORM t.vote(p3, s[6], 3, 2);
  -- S131 (3-0): ser9889super no vota (ya participa)
  PERFORM t.vote(g10, s[7], 3, 0); PERFORM t.vote(p1, s[7], 3, 1); PERFORM t.vote(p2, s[7], 0, 3); PERFORM t.vote(p3, s[7], 3, 0);

  INSERT INTO pools (name, edition_id) VALUES ('pi pool', e) RETURNING id INTO pool;
  INSERT INTO pool_members (pool_id, profile_id, joined_at) VALUES
    (pool, g10, '2026-09-01 08:00+00'), (pool, ser, '2026-09-01 08:00+00'), (pool, nv, '2026-09-01 08:00+00');

  -- Solo S125 y S126 cerradas
  PERFORM t.finish(s[1], 3, 1);
  PERFORM t.finish(s[2], 2, 3);
  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE pi AS SELECT e, rs, pool, s;
END;
$$;
GRANT SELECT ON pi TO authenticated;

CREATE TEMP TABLE before_flag AS
SELECT profile_id, total_points, correct_winners, finished_series, perfect_days, negative_days
FROM lol_standings_at((SELECT e FROM pi), NULL, NULL);
CREATE TEMP TABLE before_pts AS
SELECT pr.profile_id, pr.match_id, pr.points_earned FROM predictions pr WHERE pr.match_id = ANY ((SELECT s FROM pi)::integer[]);

SELECT is((SELECT total_points FROM before_flag WHERE profile_id = t.uid('G10YM')), 8::bigint, 'flag a false: G10YM 8 (6 + 2, racha 2 sin bonus)');
SELECT is((SELECT streak_length FROM lol_score_breakdown(t.uid('G10YM'), (SELECT s[2] FROM pi))), 2, 'flag a false: racha 2 en S126');

-- Activar el flag SOLO en este ruleset (como el SQL manual de producción) y recalcular.
UPDATE rulesets SET config = jsonb_set(config, '{streak_bonus,count_exact_score}', 'true') WHERE id = (SELECT rs FROM pi);
SELECT ok(rescore_lol_edition((SELECT e FROM pi)) > 0, 'rescore con el flag cambia filas');

SELECT is((SELECT streak_length FROM lol_score_breakdown(t.uid('G10YM'), (SELECT s[1] FROM pi))), 2, 'S125 ganador + exacto: racha 2');
SELECT is((SELECT streak_bonus  FROM lol_score_breakdown(t.uid('G10YM'), (SELECT s[1] FROM pi))), 0, 'S125: bonus 0');
SELECT is((SELECT streak_length FROM lol_score_breakdown(t.uid('G10YM'), (SELECT s[2] FROM pi))), 3, 'S126 solo ganador: racha 3');
SELECT is((SELECT streak_bonus  FROM lol_score_breakdown(t.uid('G10YM'), (SELECT s[2] FROM pi))), 1, 'S126: bonus +1');
SELECT is((SELECT total_points FROM lol_standings_at((SELECT e FROM pi), NULL, NULL) WHERE profile_id = t.uid('G10YM')),
          9::bigint, 'G10YM pasa de 8 a 9');
SELECT is_empty(
  $$ SELECT profile_id, total_points, correct_winners, finished_series, perfect_days, negative_days
     FROM lol_standings_at((SELECT e FROM pi), NULL, NULL) WHERE profile_id <> t.uid('G10YM')
     EXCEPT SELECT * FROM before_flag $$,
  'nadie más cambia en la clasificación (los de racha 2 no cobran)');
SELECT is_empty(
  $$ SELECT pr.profile_id, pr.match_id, pr.points_earned FROM predictions pr
     WHERE pr.match_id = ANY ((SELECT s FROM pi)::integer[]) AND pr.profile_id <> t.uid('G10YM')
     EXCEPT SELECT * FROM before_pts $$,
  'ni en los puntos por serie');
SELECT is((SELECT streak_length FROM lol_score_breakdown(t.uid('pi-p1'), (SELECT s[2] FROM pi))), 2,
          'pi-p1: falla S125 y acierta exacto en S126 → racha 2, sin bonus');

-- ---------- Resto del Play-In ----------
DO $$
BEGIN
  FOR i IN 3..7 LOOP PERFORM t.finish((SELECT s[i] FROM pi), 3, 0); END LOOP;
  PERFORM rescore_lol_edition((SELECT e FROM pi));
END;
$$;

CREATE TEMP TABLE bd AS
SELECT pid AS nick, i, b.streak_length, b.streak_bonus, b.explanation
FROM (VALUES ('G10YM'), ('pi-p4'), ('ser9889super')) v(pid)
CROSS JOIN generate_series(1, 7) i
CROSS JOIN LATERAL lol_score_breakdown(t.uid(v.pid), (SELECT s[i] FROM pi)) b;

SELECT is((SELECT streak_length FROM bd WHERE nick = 'G10YM' AND i = 3), 4, 'exacto fallado (S127) no reinicia: 3 → 4');
SELECT is((SELECT streak_bonus  FROM bd WHERE nick = 'G10YM' AND i = 3), 1, 'S127: bonus del tramo de 4 (+1)');
SELECT is((SELECT streak_length FROM bd WHERE nick = 'G10YM' AND i = 4), 0, 'S128 sin votar (ya participa): racha 0');
SELECT is((SELECT streak_length FROM bd WHERE nick = 'G10YM' AND i = 5), 2, 'S129 tras no votar: vuelve a empezar (exacto → 2)');
SELECT is((SELECT streak_length FROM bd WHERE nick = 'G10YM' AND i = 7), 5, 'S130 ganador (3) + S131 exacto (5)');
SELECT is((SELECT streak_length FROM bd WHERE nick = 'pi-p4' AND i = 2), 0, 'ganador fallado (S126): racha 0');
SELECT is((SELECT streak_length FROM bd WHERE nick = 'pi-p4' AND i = 3), 1, 'S127 tras el fallo: 1 (solo ganador)');
SELECT is((SELECT streak_length FROM bd WHERE nick = 'ser9889super' AND i = 6), 2,
          'ser9889super: S125..S129 sin votar no cuentan; S130 exacto → 2');
SELECT is((SELECT explanation -> 'streak' FROM bd WHERE nick = 'G10YM' AND i = 1),
          '{"bonus": 0, "gain": 2, "length": 2, "count_exact_score": true}'::jsonb, 'explanation.streak con gain y flag');

-- Desglose como lo pide la UI (get_my_lol_breakdowns con su JWT).
SELECT is(t.run_as('authenticated', t.uid('G10YM'), format(
            'SELECT string_agg(streak_length || ''/'' || streak_bonus, '','' ORDER BY match_id) FROM get_my_lol_breakdowns(%L)',
            (SELECT s FROM pi))),
          '2/0,3/1,4/1,2/0,3/1,5/1', 'get_my_lol_breakdowns: racha tras cada serie y bonus (sin S128, no votada)');
SELECT is(t.run_as('authenticated', t.uid('G10YM'), format(
            'SELECT sum(total) FROM get_my_lol_breakdowns(%L)', (SELECT s FROM pi))),
          (SELECT SUM(points_earned)::text FROM predictions WHERE profile_id = t.uid('G10YM') AND match_id = ANY ((SELECT s FROM pi)::integer[])),
          'el desglose suma lo mismo que points_earned');

-- Clasificación: rachas iguales que el motor.
SELECT is((SELECT current_streak FROM t.standing((SELECT e FROM pi), t.uid('G10YM'))), 5, 'racha actual = la del motor tras S131');
SELECT is((SELECT best_streak FROM t.standing((SELECT e FROM pi), t.uid('G10YM'))), 5, 'mejor racha de la fase: max(2+1+1, 2+1+2)');

-- ---------- Jugador que entra tarde ----------
SELECT is((SELECT finished_series::text || '|' || correct_winners || '|' || negative_days || '|' || total_points
           FROM lol_standings_at((SELECT e FROM pi), NULL, DATE '2026-10-02') WHERE profile_id = t.uid('ser9889super')),
          '0|0|0|0', 'ser9889super antes de su primer voto: 0/0, sin pleno negativo, 0 puntos');
SELECT is((SELECT perfect_days FROM t.standing((SELECT e FROM pi), t.uid('ser9889super'))), 1::bigint,
          'jornada parcial (S129 antes, S130 después): solo cuenta S130 → pleno positivo');
SELECT is((SELECT negative_days FROM t.standing((SELECT e FROM pi), t.uid('ser9889super'))), 1::bigint,
          'S131 sin votar (ya participa): pleno negativo');
SELECT is((SELECT total_points FROM t.standing((SELECT e FROM pi), t.uid('ser9889super'))),
          (SELECT points_earned - 2 FROM predictions WHERE profile_id = t.uid('ser9889super') AND match_id = (SELECT s[6] FROM pi))::bigint,
          'ser9889super: puntos de S130 − 2, sin penalización por S125..S129');
SELECT is((SELECT finished_series::text || '|' || correct_winners FROM lol_standings_at((SELECT e FROM pi), NULL, NULL)
           WHERE profile_id = t.uid('ser9889super')), '2|1', 'ser9889super: Aciertos 1/2');
SELECT is((SELECT finished_series FROM lol_standings_at((SELECT e FROM pi), NULL, NULL) WHERE profile_id = t.uid('G10YM')),
          7::bigint, 'G10YM (vota desde S125): x/7 aunque no votara S128');

-- ---------- Jugador sin votos en la edición ----------
SELECT is((SELECT count(*) FROM lol_standings_at((SELECT e FROM pi), NULL, NULL) WHERE profile_id = t.uid('pi-novotes')),
          0::bigint, 'sin votos: no sale en la Global');
SELECT is((SELECT finished_series::text || '|' || correct_winners || '|' || perfect_days || '|' || negative_days || '|' || total_points
           FROM lol_standings_at((SELECT e FROM pi), (SELECT pool FROM pi), NULL) WHERE profile_id = t.uid('pi-novotes')),
          '0|0|0|0|0', 'sin votos en el pool: 0/0, sin plenos ni penalización');

-- ---------- Clasificación histórica = final en el último instante ----------
SELECT set_eq(
  $$ SELECT * FROM lol_standings_at((SELECT e FROM pi), NULL, DATE '2026-10-04') $$,
  $$ SELECT * FROM lol_standings_at((SELECT e FROM pi), NULL, NULL) $$,
  'lol_standings_at(último día) = lol_standings_at(sin corte)');
SELECT set_eq(
  $$ SELECT profile_id, total_points, correct_winners, finished_series, perfect_days, negative_days, current_streak, best_streak, rank_position
     FROM get_lol_standings((SELECT e FROM pi), (SELECT pool FROM pi)) $$,
  $$ SELECT * FROM lol_standings_at((SELECT e FROM pi), (SELECT pool FROM pi), DATE '2026-10-04') $$,
  'get_lol_standings (pool) = lol_standings_at(último día)');

-- ---------- Salto de tramo, Bo1 y cambio de fase ----------
-- Tramos {3:+1, 4:+5}: si la racha salta de 2 a 4 en una serie, cobra +5.
DO $$
DECLARE
  e   integer := t.edition('racha exacto tramos');
  cfg jsonb   := t.cfg_v2(5, '{"streak_bonus": {"scope": "phase", "count_exact_score": true,
                                "tiers": [{"from": 3, "bonus": 1}, {"from": 4, "bonus": 5}]}}');
  f1  integer := t.phase(e, t.ruleset('rx bo5', cfg), 'Bo5', 0);
  f2  integer := t.phase(e, t.ruleset('rx bo1', cfg || '{"default_best_of": 1}'), 'Bo1', 1);
  a   integer[] := '{}';
  b   integer[] := '{}';
  u   uuid := t.player('rx-u');
BEGIN
  a := a || t.match(f1, '2026-10-10 10:00+00');
  a := a || t.match(f1, '2026-10-10 12:00+00');
  FOR i IN 1..3 LOOP b := b || t.match(f2, TIMESTAMPTZ '2026-10-11 10:00+00' + make_interval(hours => i)); END LOOP;
  FOR i IN 1..2 LOOP PERFORM t.crowd('rx-crowd', 3, a[i], 0, 3); PERFORM t.vote(u, a[i], 3, 1); PERFORM t.finish(a[i], 3, 1); END LOOP;
  FOR i IN 1..3 LOOP PERFORM t.crowd('rx-crowd', 3, b[i], 0, 1); PERFORM t.vote(u, b[i], 1, 0); PERFORM t.finish(b[i], 1, 0); END LOOP;
  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE rx AS SELECT e, a, b;
END;
$$;

SELECT is((SELECT streak_length FROM lol_score_breakdown(t.uid('rx-u'), (SELECT a[2] FROM rx))), 4, 'salto 2 → 4 dentro de una serie');
SELECT is((SELECT streak_bonus  FROM lol_score_breakdown(t.uid('rx-u'), (SELECT a[2] FROM rx))), 5, 'cobra el tramo de 4 (+5), no el de 3');
SELECT is((SELECT streak_length FROM lol_score_breakdown(t.uid('rx-u'), (SELECT b[1] FROM rx))), 1, 'cambio de fase: la racha vuelve a 1');
SELECT is((SELECT streak_length FROM lol_score_breakdown(t.uid('rx-u'), (SELECT b[3] FROM rx))), 3, 'Bo1: el 1-0 acertado suma solo +1 (3 series → 3)');
SELECT is((SELECT base_exact FROM lol_score_breakdown(t.uid('rx-u'), (SELECT b[3] FROM rx))), 0, 'Bo1: sin puntos de exacto');
SELECT is((SELECT current_streak FROM t.standing((SELECT e FROM rx), t.uid('rx-u'))), 3, 'clasificación: racha actual solo de la fase Bo1');

-- ---------- Flag a false: idéntico al motor anterior ----------
UPDATE rulesets SET config = jsonb_set(config, '{streak_bonus,count_exact_score}', 'false') WHERE id = (SELECT rs FROM pi);
SELECT ok(rescore_lol_edition((SELECT e FROM pi)) > 0, 'desactivar el flag y recalcular');
SELECT is((SELECT streak_length FROM lol_score_breakdown(t.uid('G10YM'), (SELECT s[7] FROM pi))), 3, 'sin flag: S129..S131 → racha 3');
SELECT is((SELECT current_streak FROM t.standing((SELECT e FROM pi), t.uid('G10YM'))), 3, 'sin flag: racha actual 3 en la clasificación');
SELECT is((SELECT total_points FROM t.standing((SELECT e FROM pi), t.uid('G10YM'), NULL, DATE '2026-10-01')), 8::bigint,
          'sin flag: G10YM vuelve a 8 tras la jornada 1');

SELECT * FROM finish();
ROLLBACK;
