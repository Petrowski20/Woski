-- Rachas: por fase, entre jornadas, reinicio por fallo / no votar /
-- cambio de fase, unirse tarde, canceladas y pendientes no cuentan.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(30);

DO $$
DECLARE
  e    integer := t.edition('streak');
  rs   integer := t.ruleset('streak v2', t.cfg_v2(1));
  pa   integer := t.phase(e, rs, 'Fase A', 0);
  pb   integer := t.phase(e, rs, 'Fase B', 1);
  pc   integer := t.phase(e, rs, 'Fase C', 2);
  a    integer[] := '{}';
  b    integer[] := '{}';
  c    integer[] := '{}';
  canc integer;
  pend integer;
  s_all  uuid := t.player('st-all');
  s_skip uuid := t.player('st-skip');
  s_late uuid := t.player('st-late');
  s_long uuid := t.player('st-long');
BEGIN
  -- Fase A: 3 jornadas. Todas las series las gana el local (1-0).
  a := a || t.match(pa, '2026-09-01 12:00+00');
  a := a || t.match(pa, '2026-09-01 14:00+00');
  canc := t.match(pa, '2026-09-01 15:00+00');
  a := a || t.match(pa, '2026-09-01 16:00+00');
  a := a || t.match(pa, '2026-09-02 12:00+00');
  a := a || t.match(pa, '2026-09-02 14:00+00');
  a := a || t.match(pa, '2026-09-02 16:00+00');
  a := a || t.match(pa, '2026-09-03 12:00+00');
  pend := t.match(pa, '2026-09-03 13:00+00');
  a := a || t.match(pa, '2026-09-03 14:00+00');
  -- Fase B
  b := b || t.match(pb, '2026-09-04 12:00+00');
  b := b || t.match(pb, '2026-09-04 14:00+00');
  -- Fase C: 19 series, una por día
  FOR i IN 1..19 LOOP
    c := c || t.match(pc, TIMESTAMPTZ '2026-09-05 12:00+00' + make_interval(days => i - 1));
  END LOOP;

  FOR i IN 1..array_length(a, 1) LOOP
    PERFORM t.crowd('st-crowd', 3, a[i], 1, 0);
    PERFORM t.vote(s_all, a[i], CASE WHEN i = 5 THEN 0 ELSE 1 END, CASE WHEN i = 5 THEN 1 ELSE 0 END);
    IF i <> 3 THEN PERFORM t.vote(s_skip, a[i], 1, 0); END IF;
    IF i >= 4 THEN PERFORM t.vote(s_late, a[i], 1, 0); END IF;
  END LOOP;
  PERFORM t.vote(s_all, canc, 0, 1);       -- fallo en una cancelada: no corta
  FOR i IN 1..2 LOOP
    PERFORM t.crowd('st-crowd', 3, b[i], 1, 0);
    PERFORM t.vote(s_all, b[i], 1, 0);
  END LOOP;
  FOR i IN 1..19 LOOP
    PERFORM t.crowd('st-crowd', 3, c[i], 1, 0);
    PERFORM t.vote(s_long, c[i], 1, 0);
  END LOOP;

  FOR i IN 1..array_length(a, 1) LOOP PERFORM t.finish(a[i], 1, 0); END LOOP;
  FOR i IN 1..2 LOOP PERFORM t.finish(b[i], 1, 0); END LOOP;
  FOR i IN 1..19 LOOP PERFORM t.finish(c[i], 1, 0); END LOOP;
  UPDATE matches SET status = 'CANCELLED' WHERE id = canc;
  -- pend sigue PENDING (con fecha pasada): ni cuenta ni corta.

  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE ids AS SELECT e, a, b, c;
END;
$$;

CREATE TEMP TABLE sl AS
SELECT p.nick, x.i, bd.streak_length, bd.streak_bonus, bd.total
FROM (VALUES ('st-all'), ('st-skip'), ('st-late')) p(nick)
CROSS JOIN generate_series(1, 8) x(i)
LEFT JOIN LATERAL lol_score_breakdown(t.uid(p.nick), (SELECT a[x.i] FROM ids)) bd ON true;

-- st-all: acierta todo menos la 5ª (la cancelada y la pendiente no cuentan)
SELECT results_eq($$ SELECT streak_length FROM sl WHERE nick = 'st-all' ORDER BY i $$,
                  ARRAY[1, 2, 3, 4, 0, 1, 2, 3], 'st-all: longitudes de racha (fallo en la 5ª)');
SELECT results_eq($$ SELECT streak_bonus FROM sl WHERE nick = 'st-all' ORDER BY i $$,
                  ARRAY[0, 0, 1, 1, 0, 0, 0, 1], 'st-all: bonus 1-2 → 0, 3-6 → +1');
SELECT is((SELECT total FROM sl WHERE nick = 'st-all' AND i = 4), 3, 'bonus sumado a la base del ganador (2 + 1)');
SELECT is((SELECT total FROM sl WHERE nick = 'st-all' AND i = 5), 0, 'fallo → 0 sin bonus');
-- st-skip: no vota la 3ª → reinicia
SELECT results_eq($$ SELECT streak_length FROM sl WHERE nick = 'st-skip' ORDER BY i $$,
                  ARRAY[1, 2, 0, 1, 2, 3, 4, 5], 'st-skip: no votar reinicia la racha');
-- st-late: primera predicción en la 4ª; lo anterior no le corta nada
SELECT results_eq($$ SELECT streak_length FROM sl WHERE nick = 'st-late' ORDER BY i $$,
                  ARRAY[0, 0, 0, 1, 2, 3, 4, 5], 'st-late: empieza a contar en su primera predicción');
SELECT is((SELECT streak_bonus FROM sl WHERE nick = 'st-late' AND i = 6), 1, 'st-late: 3ª seguida → +1');

-- Racha entre jornadas: la 7ª (jornada 3) continúa la que empezó en la 4ª (jornada 2).
SELECT is((SELECT streak_length FROM sl WHERE nick = 'st-skip' AND i = 7), 4, 'la racha atraviesa jornadas');

-- Cambio de fase: B empieza de cero aunque A terminara acertando.
SELECT is((SELECT streak_length FROM lol_score_breakdown(t.uid('st-all'), (SELECT b[1] FROM ids))), 1, 'fase B: reinicio al cambiar de fase');
SELECT is((SELECT streak_length FROM lol_score_breakdown(t.uid('st-all'), (SELECT b[2] FROM ids))), 2, 'fase B: sigue dentro de la fase');

-- Tramos largos (fase C, 19 aciertos seguidos)
SELECT is((SELECT streak_bonus FROM lol_score_breakdown(t.uid('st-long'), (SELECT c[k] FROM ids))), v, 'racha ' || k || ' → +' || v)
FROM (VALUES (1, 0), (2, 0), (3, 1), (6, 1), (7, 2), (11, 2), (12, 3), (17, 3), (18, 4), (19, 4)) x(k, v);

-- points_earned = total del desglose en todas las predicciones de la edición
SELECT is((SELECT COUNT(*) FROM predictions pr
           JOIN matches mt ON mt.id = pr.match_id JOIN phases ph ON ph.id = mt.phase_id
           CROSS JOIN LATERAL lol_score_breakdown(pr.profile_id, pr.match_id) bd
           WHERE ph.edition_id = (SELECT e FROM ids) AND pr.points_earned <> bd.total), 0::bigint,
          'points_earned coincide con el desglose');

-- Clasificación: racha actual reiniciada por fase (v2) y mejor racha de la fase
SELECT is((SELECT current_streak FROM t.standing((SELECT e FROM ids), t.uid('st-all'), NULL, DATE '2026-09-04')), 2,
          'standings: racha actual solo de la fase en curso (v2)');
SELECT is((SELECT best_streak FROM t.standing((SELECT e FROM ids), t.uid('st-all'), NULL, DATE '2026-09-04')), 2,
          'standings: mejor racha de la fase en curso');
SELECT is((SELECT current_streak FROM t.standing((SELECT e FROM ids), t.uid('st-long'))), 19, 'standings: racha larga');
SELECT is((SELECT best_streak FROM t.standing((SELECT e FROM ids), t.uid('st-long'))), 19, 'standings: mejor racha larga');

-- Puntuar una serie cambia la racha de las posteriores de su fase
SELECT is(t.pts(t.uid('st-all'), (SELECT a[8] FROM ids)), 3, 'antes: 8ª de A con racha 3 → 2 + 1');
UPDATE matches SET home_goals = 0, away_goals = 1 WHERE id = (SELECT a[7] FROM ids);
SELECT lives_ok($$ SELECT score_lol_match((SELECT a[7] FROM ids)) $$, 'score_lol_match tras corregir un resultado');
SELECT is(t.pts(t.uid('st-all'), (SELECT a[7] FROM ids)), 0, 'la 7ª pasa a ser fallo');
SELECT is(t.pts(t.uid('st-all'), (SELECT a[8] FROM ids)), 2, 'la 8ª se recalcula: racha 1 → sin bonus');
SELECT is(t.pts(t.uid('st-all'), (SELECT b[2] FROM ids)), 2, 'otra fase no se ve afectada');

SELECT * FROM finish();
ROLLBACK;
