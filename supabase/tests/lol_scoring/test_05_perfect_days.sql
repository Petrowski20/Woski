-- Plenos: negativo −2 (0 aciertos de ganador en jornada cerrada),
-- positivo solo desempata, ventana desde la primera predicción y
-- desde la entrada al pool.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(20);

DO $$
DECLARE
  e    integer := t.edition('perfect days');
  ph   integer := t.phase(e, t.ruleset('pd v2', t.cfg_v2(1)), 'Fase', 0);
  m    integer[] := '{}';
  z    uuid := t.player('pd-zero');
  n    uuid := t.player('pd-none');
  x    uuid := t.player('pd-mix');
  p    uuid := t.player('pd-perfect');
  l    uuid := t.player('pd-late');
  pool integer;
BEGIN
  -- J1: m1..m3 · J2: m4, m5 · J3: m6 terminada + m7 pendiente (abierta)
  m := m || t.match(ph, '2026-09-01 12:00+00');
  m := m || t.match(ph, '2026-09-01 14:00+00');
  m := m || t.match(ph, '2026-09-01 16:00+00');
  m := m || t.match(ph, '2026-09-02 12:00+00');
  m := m || t.match(ph, '2026-09-02 14:00+00');
  m := m || t.match(ph, '2026-09-03 12:00+00');
  m := m || t.match(ph, '2026-09-03 14:00+00');
  FOR i IN 1..7 LOOP PERFORM t.crowd('pd-crowd', 4, m[i], 1, 0); END LOOP;

  FOR i IN 1..3 LOOP PERFORM t.vote(z, m[i], 0, 1); END LOOP;        -- J1: 3 fallos
  PERFORM t.vote(z, m[4], 1, 0); PERFORM t.vote(z, m[5], 1, 0);       -- J2: aciertos
                                                                      -- J3: no vota (jornada abierta)
  PERFORM t.vote(n, m[1], 1, 0);                                      -- J1: 1 acierto; J2: nada
  PERFORM t.vote(n, m[6], 1, 0);
  PERFORM t.vote(x, m[1], 0, 1);                                      -- J1: fallo + 2 sin votar
  PERFORM t.vote(x, m[4], 1, 0);
  FOR i IN 1..6 LOOP PERFORM t.vote(p, m[i], 1, 0); END LOOP;         -- todo acertado
  PERFORM t.vote(l, m[4], 0, 1); PERFORM t.vote(l, m[5], 1, 0);       -- empieza en J2

  FOR i IN 1..6 LOOP PERFORM t.finish(m[i], 1, 0); END LOOP;

  -- pd-zero entra al pool en la jornada 2
  INSERT INTO pools (name, edition_id) VALUES ('pd pool', e) RETURNING id INTO pool;
  INSERT INTO pool_members (pool_id, profile_id, joined_at) VALUES (pool, z, '2026-09-02 08:00+00');

  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE ids AS SELECT e, pool, m;
END;
$$;

-- Suma de puntos de series terminadas de un jugador desde una jornada.
CREATE TEMP TABLE raw AS
SELECT pr.profile_id, (mt.match_date AT TIME ZONE 'Europe/Berlin')::date AS day, pr.points_earned
FROM predictions pr JOIN matches mt ON mt.id = pr.match_id
WHERE mt.id = ANY ((SELECT m FROM ids)::integer[]) AND mt.status = 'FINISHED';

SELECT is((SELECT negative_days FROM t.standing((SELECT e FROM ids), t.uid('pd-zero'))), 1::bigint, 'pd-zero: J1 con 3 fallos → pleno negativo');
SELECT is((SELECT total_points FROM t.standing((SELECT e FROM ids), t.uid('pd-zero'))),
          (SELECT SUM(points_earned) - 2 FROM raw WHERE profile_id = t.uid('pd-zero')), 'pd-zero: puntos − 2');
SELECT is((SELECT negative_days FROM t.standing((SELECT e FROM ids), t.uid('pd-none'))), 1::bigint, 'pd-none: J2 sin votar → pleno negativo');
SELECT is((SELECT total_points FROM t.standing((SELECT e FROM ids), t.uid('pd-none'))),
          (SELECT SUM(points_earned) - 2 FROM raw WHERE profile_id = t.uid('pd-none')), 'pd-none: puntos − 2');
SELECT is((SELECT negative_days FROM t.standing((SELECT e FROM ids), t.uid('pd-mix'))), 1::bigint, 'pd-mix: fallo + sin votar → pleno negativo');
SELECT is((SELECT negative_days FROM t.standing((SELECT e FROM ids), t.uid('pd-late'))), 0::bigint, 'pd-late: J1 (antes de su primera predicción) no cuenta');
SELECT is((SELECT total_points FROM t.standing((SELECT e FROM ids), t.uid('pd-late'))),
          (SELECT SUM(points_earned) FROM raw WHERE profile_id = t.uid('pd-late')), 'pd-late: sin penalización');
SELECT is((SELECT negative_days FROM t.standing((SELECT e FROM ids), t.uid('pd-zero'), NULL, DATE '2026-09-03')), 1::bigint,
          'J3 abierta (serie pendiente): no aplica pleno aunque no vote');

-- Pleno positivo: no suma puntos, cuenta para desempatar
SELECT is((SELECT perfect_days FROM t.standing((SELECT e FROM ids), t.uid('pd-perfect'))), 2::bigint, 'pd-perfect: 2 plenos positivos (J1, J2)');
SELECT is((SELECT total_points FROM t.standing((SELECT e FROM ids), t.uid('pd-perfect'))),
          (SELECT SUM(points_earned) FROM raw WHERE profile_id = t.uid('pd-perfect')), 'pleno positivo: 0 puntos extra');
SELECT is((SELECT perfect_days FROM t.standing((SELECT e FROM ids), t.uid('pd-none'))), 0::bigint, 'votar 1 de 3 no es pleno');

-- Pool: la ventana empieza el día de entrada
SELECT is((SELECT negative_days FROM t.standing((SELECT e FROM ids), t.uid('pd-zero'), (SELECT pool FROM ids))), 0::bigint,
          'pool: J1 anterior a la entrada no penaliza');
SELECT is((SELECT total_points FROM t.standing((SELECT e FROM ids), t.uid('pd-zero'), (SELECT pool FROM ids))),
          (SELECT SUM(points_earned) FROM raw WHERE profile_id = t.uid('pd-zero') AND day >= DATE '2026-09-02'),
          'pool: suma los mismos puntos desde la jornada de entrada');

-- ---------- Desempate: puntos → plenos → mejor racha → antigüedad ----------
-- Ruleset con 1 punto por acierto y sin rachas ni penalización, para
-- empatar a puntos a propósito.
DO $$
DECLARE
  e  integer := t.edition('tiebreak');
  ph integer := t.phase(e, t.ruleset('tb v2', t.cfg_v2(1, '{
      "winner_points": {"tiers":[{"min_share":0,"points":1}],"sole_voter_points":1,"min_voters_percent":1,"min_voters_override":null,"fallback_points":1},
      "streak_bonus": {"scope":"phase","tiers":[]},
      "perfect_day": {"positive":0,"negative":0}}')), 'Fase', 0);
  m  integer[] := '{}';
  pp uuid := t.player('tb-perfect', p_created => '2026-02-01');
  qq uuid := t.player('tb-streak',  p_created => '2026-01-01');  -- más antiguo
BEGIN
  m := m || t.match(ph, '2026-09-01 12:00+00');
  m := m || t.match(ph, '2026-09-01 14:00+00');
  m := m || t.match(ph, '2026-09-02 12:00+00');
  m := m || t.match(ph, '2026-09-02 14:00+00');
  m := m || t.match(ph, '2026-09-02 16:00+00');
  -- tb-perfect: ✓ ✓ | ✗ ✗ ✓ → 3 pts, 1 pleno, mejor racha 2
  PERFORM t.vote(pp, m[1], 1, 0); PERFORM t.vote(pp, m[2], 1, 0);
  PERFORM t.vote(pp, m[3], 0, 1); PERFORM t.vote(pp, m[4], 0, 1); PERFORM t.vote(pp, m[5], 1, 0);
  -- tb-streak: ✗ ✓ | ✓ ✓ ✗ → 3 pts, 0 plenos, mejor racha 3
  PERFORM t.vote(qq, m[1], 0, 1); PERFORM t.vote(qq, m[2], 1, 0);
  PERFORM t.vote(qq, m[3], 1, 0); PERFORM t.vote(qq, m[4], 1, 0); PERFORM t.vote(qq, m[5], 0, 1);
  FOR i IN 1..5 LOOP PERFORM t.finish(m[i], 1, 0); END LOOP;
  PERFORM rescore_lol_edition(e);
  CREATE TEMP TABLE tb AS SELECT e;
END;
$$;

SELECT is((SELECT total_points FROM t.standing((SELECT e FROM tb), t.uid('tb-perfect'))), 3::bigint, 'tb-perfect: 3 puntos');
SELECT is((SELECT total_points FROM t.standing((SELECT e FROM tb), t.uid('tb-streak'))), 3::bigint, 'tb-streak: 3 puntos');
SELECT is((SELECT best_streak FROM t.standing((SELECT e FROM tb), t.uid('tb-streak'))), 3, 'tb-streak: mejor racha 3');
SELECT is((SELECT rank_position FROM t.standing((SELECT e FROM tb), t.uid('tb-perfect'))), 1::bigint,
          'empate a puntos: el pleno positivo gana a la mejor racha y a la antigüedad');
SELECT is((SELECT rank_position FROM t.standing((SELECT e FROM tb), t.uid('tb-streak'))), 2::bigint, 'tb-streak segundo');

-- Sin plenos (quitamos el de tb-perfect): decide la mejor racha.
UPDATE predictions SET pred_home_goals = 0, pred_away_goals = 1
WHERE profile_id = t.uid('tb-perfect') AND match_id = (SELECT MIN(mt.id) FROM matches mt JOIN phases ph ON ph.id = mt.phase_id WHERE ph.edition_id = (SELECT e FROM tb));
UPDATE predictions SET pred_home_goals = 1, pred_away_goals = 0
WHERE profile_id = t.uid('tb-perfect') AND match_id = (SELECT MIN(mt.id) + 2 FROM matches mt JOIN phases ph ON ph.id = mt.phase_id WHERE ph.edition_id = (SELECT e FROM tb));
-- tb-perfect pasa a ✗ ✓ | ✓ ✗ ✓: 3 pts, 0 plenos, mejor racha 2.
SELECT lives_ok($$ SELECT rescore_lol_edition((SELECT e FROM tb)) $$, 'recalcular tras cambiar votos');
SELECT is((SELECT rank_position FROM t.standing((SELECT e FROM tb), t.uid('tb-streak'))), 1::bigint,
          'empate a puntos y plenos: gana la mejor racha de la fase');
SELECT * FROM finish();
ROLLBACK;
