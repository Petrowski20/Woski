-- Rachas con el flujo real del admin (semilla fija): resultados puestos
-- en orden aleatorio, corregidos, series canceladas y reabiertas y votos
-- cargados tarde por un admin. Cada operación recalcula solo desde esa
-- serie (lol_rescore_from_match); al final, recalcular la edición
-- entera no debe cambiar nada: el cálculo incremental es igual al
-- completo, que test_21 compara con el modelo de referencia.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(6);

CREATE FUNCTION pg_temp.score(p_bo integer, p_home_wins boolean) RETURNS integer[] LANGUAGE sql VOLATILE AS $$
  SELECT CASE WHEN p_home_wins THEN ARRAY[(p_bo + 1) / 2, l] ELSE ARRAY[l, (p_bo + 1) / 2] END
  FROM (SELECT floor(random() * ((p_bo + 1) / 2))::integer AS l) x;
$$;

SELECT setseed(0.4242);
DO $$ BEGIN PERFORM t.player('inc-admin', p_role => 'ADMIN'); END $$;
CREATE TEMP TABLE inc (e integer);
CREATE TEMP TABLE ops (kind text, n integer);
GRANT ALL ON ops TO authenticated;

DO $$
DECLARE
  e       integer;
  ph      integer;
  mode    text;
  cfg     jsonb;
  ts      timestamptz;
  m       integer;
  bo      integer;
  res     integer[];
  pred    integer[];
  hw      boolean;
  players uuid[];
  ms      integer[];
  bos     integer[];
  r       record;
BEGIN
  FOR sc IN 1..60 LOOP
    e := t.edition('inc ' || sc);
    players := '{}'; ms := '{}'; bos := '{}';
    FOR p IN 1..4 LOOP players := players || t.player(format('inc%s-p%s', sc, p)); END LOOP;
    ts := TIMESTAMPTZ '2026-10-01 08:00+00';
    FOR f IN 1..(1 + floor(random() * 2)::integer) LOOP
      mode := (ARRAY['plain', 'exact', 'strict'])[1 + floor(random() * 3)::integer];
      cfg := t.cfg_v2(5, jsonb_build_object('streak_bonus', jsonb_build_object('scope', 'phase',
               'tiers', '[{"from":1,"bonus":1},{"from":2,"bonus":2},{"from":4,"bonus":5}]'::jsonb)
               || CASE mode WHEN 'exact'  THEN '{"count_exact_score": true}'::jsonb
                            WHEN 'strict' THEN '{"count_exact_score": true, "exact_as_prediction": true}'::jsonb
                            ELSE '{}'::jsonb END));
      ph := t.phase(e, t.ruleset(format('inc%s-f%s', sc, f), cfg), 'F' || f, f);
      FOR i IN 1..(3 + floor(random() * 6)::integer) LOOP
        ts := ts + make_interval(hours => floor(random() * 6)::integer);
        bo := (ARRAY[1, 3, 5])[1 + floor(random() * 3)::integer];
        m := t.match(ph, ts, bo, 'AAA', 'BBB');
        ms := ms || m; bos := bos || bo;
        FOR p IN 1..4 LOOP
          IF random() < 0.7 THEN
            pred := pg_temp.score(bo, random() < 0.5);
            PERFORM t.vote(players[p], m, pred[1], pred[2]);
          END IF;
        END LOOP;
      END LOOP;
      ts := ts + interval '1 day';
    END LOOP;

    -- Resultados en orden aleatorio (camino real: admin_set_lol_match_result).
    FOR r IN SELECT x.m, x.bo FROM unnest(ms, bos) AS x(m, bo) ORDER BY random() LOOP
      IF random() < 0.9 THEN
        res := pg_temp.score(r.bo, random() < 0.5);
        PERFORM admin_set_lol_match_result(r.m, res[1], res[2], 'fuzz');
        INSERT INTO ops VALUES ('resultado', 1);
      END IF;
    END LOOP;
    -- Correcciones de resultados ya puestos.
    FOR r IN SELECT x.m, x.bo FROM unnest(ms, bos) AS x(m, bo) JOIN matches mt ON mt.id = x.m
             WHERE mt.status = 'FINISHED' ORDER BY random() LIMIT 3 LOOP
      res := pg_temp.score(r.bo, random() < 0.5);
      PERFORM admin_set_lol_match_result(r.m, res[1], res[2], 'corrección');
      INSERT INTO ops VALUES ('corrección', 1);
    END LOOP;
    -- Cancelar series ya puntuadas y reabrir alguna con otro resultado.
    FOR r IN SELECT x.m, x.bo FROM unnest(ms, bos) AS x(m, bo) JOIN matches mt ON mt.id = x.m
             WHERE mt.status = 'FINISHED' ORDER BY random() LIMIT 2 LOOP
      PERFORM admin_set_lol_match_status(r.m, 'CANCELLED', 'fuzz');
      INSERT INTO ops VALUES ('cancelada', 1);
      IF random() < 0.5 THEN
        PERFORM admin_set_lol_match_status(r.m, 'PENDING', 'reabierta');
        res := pg_temp.score(r.bo, random() < 0.5);
        PERFORM admin_set_lol_match_result(r.m, res[1], res[2], 'reabierta');
        INSERT INTO ops VALUES ('reabierta', 1);
      END IF;
    END LOOP;
    -- Votos cargados tarde por un admin en series ya terminadas (sin voto).
    FOR r IN SELECT x.m, x.bo, pl.p FROM unnest(ms, bos) AS x(m, bo) JOIN matches mt ON mt.id = x.m
             CROSS JOIN unnest(players) pl(p)
             WHERE mt.status = 'FINISHED'
               AND NOT EXISTS (SELECT 1 FROM predictions pr WHERE pr.match_id = x.m AND pr.profile_id = pl.p)
             ORDER BY random() LIMIT 2 LOOP
      pred := pg_temp.score(r.bo, random() < 0.5);
      IF t.run_as('authenticated', t.uid('inc-admin'), format(
           'SELECT admin_set_lol_prediction(%L, %s, NULL, %s, %s, %L)', r.p, r.m, pred[1], pred[2], 'voto tardío')) ~ '^[0-9]{5}:'
      THEN RAISE EXCEPTION 'admin_set_lol_prediction falló';
      END IF;
      INSERT INTO ops VALUES ('voto admin', 1);
    END LOOP;
    INSERT INTO inc VALUES (e);
  END LOOP;
END;
$$;

SELECT diag((SELECT string_agg(kind || ' ' || n, ' · ') FROM (SELECT kind, count(*) AS n FROM ops GROUP BY kind ORDER BY kind) x));

CREATE TEMP TABLE before_pts AS
SELECT pr.profile_id, pr.match_id, pr.points_earned, pr.is_correct_winner, pr.is_correct_score
FROM predictions pr JOIN matches mt ON mt.id = pr.match_id JOIN phases p ON p.id = mt.phase_id
WHERE p.edition_id IN (SELECT e FROM inc);
CREATE TEMP TABLE before_st AS
SELECT i.e, s.* FROM inc i CROSS JOIN LATERAL lol_standings_at(i.e, NULL, NULL) s;

SELECT ok((SELECT count(*) FROM ops WHERE kind = 'corrección') > 0 AND (SELECT count(*) FROM ops WHERE kind = 'reabierta') > 0
          AND (SELECT count(*) FROM ops WHERE kind = 'voto admin') > 0, 'cobertura: correcciones, reaperturas y votos de admin');
SELECT ok((SELECT count(*) FROM before_pts WHERE points_earned > 0) > 100, 'cobertura: hay puntos repartidos');
SELECT is((SELECT sum(rescore_lol_edition(e))::integer FROM inc), 0,
          'recalcular la edición entera no cambia nada: incremental = completo');
SELECT set_eq($$ SELECT pr.profile_id, pr.match_id, pr.points_earned, pr.is_correct_winner, pr.is_correct_score
                 FROM predictions pr JOIN matches mt ON mt.id = pr.match_id JOIN phases p ON p.id = mt.phase_id
                 WHERE p.edition_id IN (SELECT e FROM inc) $$,
              $$ SELECT * FROM before_pts $$, 'mismos puntos por predicción');
SELECT set_eq($$ SELECT i.e, s.* FROM inc i CROSS JOIN LATERAL lol_standings_at(i.e, NULL, NULL) s $$,
              $$ SELECT * FROM before_st $$, 'misma clasificación (puntos, plenos y rachas)');
SELECT is_empty($$ SELECT pr.id FROM predictions pr JOIN matches mt ON mt.id = pr.match_id JOIN phases p ON p.id = mt.phase_id
                   WHERE p.edition_id IN (SELECT e FROM inc) AND mt.status <> 'FINISHED'
                     AND (pr.points_earned <> 0 OR pr.is_correct_winner IS NOT NULL) $$,
                'series canceladas o pendientes: sin puntos');

SELECT * FROM finish();
ROLLBACK;
