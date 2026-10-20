-- Rachas: pruebas aleatorias (semilla fija) contra un modelo de
-- referencia independiente del motor.
--
-- El modelo (pg_temp.ref_walk) recorre a mano, serie a serie y en
-- orden (match_date, id), las reglas de la racha por fase:
--   * plain: acierto de ganador suma 1; fallo o sin voto, 0.
--   * exact (count_exact_score): el ganador suma 1 y el exacto en
--     Bo3/Bo5 suma 1 más; el bonus es el del tramo tras la serie.
--   * strict (exact_as_prediction): ganador y luego marcador (Bo3/Bo5)
--     son dos predicciones; cada acierto suma 1 y paga su tramo; cada
--     fallo deja la racha a 0 (marcador fallado si falla el ganador).
--   Solo cuentan las series terminadas desde la del primer voto del
--   jugador en la edición (la primera no cancelada con voto); las
--   pendientes y canceladas no cuentan ni cortan.
-- Se compara con lol_score_breakdown, points_earned y lol_standings_at
-- (global y en un pool, a cada fecha de corte).
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(15);

-- ---------------- Modelo de referencia ----------------

-- Tramo: el de mayor "from" <= racha (0 si no llega a ninguno).
CREATE FUNCTION pg_temp.tier(p_cfg jsonb, p_len integer) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((SELECT (x ->> 'bonus')::integer
                   FROM jsonb_array_elements(p_cfg -> 'streak_bonus' -> 'tiers') x
                   WHERE (x ->> 'from')::integer <= p_len
                   ORDER BY (x ->> 'from')::integer DESC LIMIT 1), 0);
$$;

-- Una fila por predicción de racha (k = 1 ganador; k = 2 marcador solo
-- en strict y Bo3/Bo5) de un jugador en una edición, desde p_from_day
-- (NULL = desde su primer voto; si no, además desde ese día).
CREATE FUNCTION pg_temp.ref_walk(p_e integer, p_pid uuid, p_from_day date)
RETURNS TABLE (match_id integer, phase_id integer, day date, voted boolean, k integer, hit boolean, len integer, bonus integer)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE
  v_tz    text := (SELECT timezone FROM editions WHERE id = p_e);
  v_first record;
  ph      record;
  m       record;
  v_cfg   jsonb;
  v_mode  text;
  v_bo    integer;
  v_win   boolean;
  v_ex    boolean;
  v_s     integer;
BEGIN
  SELECT mt.match_date AS d, mt.id INTO v_first
  FROM predictions x JOIN matches mt ON mt.id = x.match_id JOIN phases p ON p.id = mt.phase_id
  WHERE x.profile_id = p_pid AND p.edition_id = p_e AND mt.status <> 'CANCELLED'
  ORDER BY mt.match_date, mt.id LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  FOR ph IN SELECT p.id, r.config FROM phases p JOIN rulesets r ON r.id = p.ruleset_id WHERE p.edition_id = p_e ORDER BY p.id LOOP
    v_cfg  := ph.config;
    v_mode := CASE WHEN v_cfg -> 'streak_bonus' -> 'exact_as_prediction' = 'true' THEN 'strict'
                   WHEN v_cfg -> 'streak_bonus' -> 'count_exact_score' = 'true' THEN 'exact'
                   ELSE 'plain' END;
    v_s := 0;
    FOR m IN
      SELECT mt.*, x.pred_home_goals AS ph_, x.pred_away_goals AS pa_, x.id IS NOT NULL AS has_vote
      FROM matches mt
      LEFT JOIN predictions x ON x.match_id = mt.id AND x.profile_id = p_pid
      WHERE mt.phase_id = ph.id AND mt.status = 'FINISHED'
        AND (mt.match_date, mt.id) >= (v_first.d, v_first.id)
        AND (p_from_day IS NULL OR (mt.match_date AT TIME ZONE v_tz)::date >= p_from_day)
      ORDER BY mt.match_date, mt.id
    LOOP
      v_bo  := COALESCE((m.metadata ->> 'best_of')::integer, (v_cfg ->> 'default_best_of')::integer);
      v_win := m.has_vote AND (m.ph_ > m.pa_) = (m.home_goals > m.away_goals);
      v_ex  := v_win AND m.ph_ = m.home_goals AND m.pa_ = m.away_goals;
      match_id := m.id; phase_id := ph.id; day := (m.match_date AT TIME ZONE v_tz)::date; voted := m.has_vote;
      IF v_mode = 'strict' THEN
        v_s := CASE WHEN v_win THEN v_s + 1 ELSE 0 END;
        k := 1; hit := v_win; len := v_s; bonus := CASE WHEN v_win THEN pg_temp.tier(v_cfg, v_s) ELSE 0 END;
        RETURN NEXT;
        IF v_bo > 1 THEN
          v_s := CASE WHEN v_ex THEN v_s + 1 ELSE 0 END;
          k := 2; hit := v_ex; len := v_s; bonus := CASE WHEN v_ex THEN pg_temp.tier(v_cfg, v_s) ELSE 0 END;
          RETURN NEXT;
        END IF;
      ELSE
        v_s := CASE WHEN v_win THEN v_s + 1 + CASE WHEN v_mode = 'exact' AND v_bo > 1 AND v_ex THEN 1 ELSE 0 END ELSE 0 END;
        k := 1; hit := v_win; len := v_s; bonus := CASE WHEN v_win THEN pg_temp.tier(v_cfg, v_s) ELSE 0 END;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- ---------------- Generador ----------------
-- Marcador de una serie al mejor de p_bo: [local, visitante].
CREATE FUNCTION pg_temp.score(p_bo integer, p_home_wins boolean) RETURNS integer[] LANGUAGE sql VOLATILE AS $$
  SELECT CASE WHEN p_home_wins THEN ARRAY[(p_bo + 1) / 2, l] ELSE ARRAY[l, (p_bo + 1) / 2] END
  FROM (SELECT floor(random() * ((p_bo + 1) / 2))::integer AS l) x;
$$;

SELECT setseed(0.20261022);
CREATE TEMP TABLE fz (e integer, pool integer, phases integer, modes text);

DO $$
DECLARE
  tiers   text[] := ARRAY[
    '[{"from":3,"bonus":1},{"from":7,"bonus":2},{"from":12,"bonus":3},{"from":18,"bonus":4}]',
    '[{"from":1,"bonus":1},{"from":2,"bonus":2},{"from":4,"bonus":5}]',
    '[{"from":2,"bonus":3}]',
    '[]'];
  e       integer;
  ph      integer;
  pool    integer;
  n_ph    integer;
  n_ser   integer;
  mode    text;
  modes   text;
  cfg     jsonb;
  ts      timestamptz;
  m       integer;
  bo      integer;
  res     integer[];
  pred    integer[];
  hw      boolean;
  r       double precision;
  players uuid[];
  joins   integer[];
  pos     integer;
  feat    date;
  st      text;
BEGIN
  FOR sc IN 1..120 LOOP
    e := t.edition('fz ' || sc);
    INSERT INTO pools (name, edition_id) VALUES ('fz pool ' || sc, e) RETURNING id INTO pool;
    players := '{}'; joins := '{}';
    FOR p IN 1..5 LOOP
      players := players || t.player(format('fz%s-p%s', sc, p));
      joins   := joins || (1 + floor(random() * 12))::integer;  -- posición de su primer voto
    END LOOP;
    -- Miembros del pool: entran en días distintos (el pool solo cuenta desde ese día).
    FOR p IN 1..5 LOOP
      INSERT INTO pool_members (pool_id, profile_id, joined_at)
      VALUES (pool, players[p], TIMESTAMPTZ '2026-09-30 12:00+00' + make_interval(days => floor(random() * 8)::integer));
    END LOOP;

    n_ph := 1 + floor(random() * 3)::integer;
    modes := '';
    ts := TIMESTAMPTZ '2026-10-01 08:00+00';
    pos := 0;
    feat := NULL;
    FOR f IN 1..n_ph LOOP
      mode := (ARRAY['plain', 'exact', 'strict'])[1 + floor(random() * 3)::integer];
      modes := modes || mode || ' ';
      cfg := t.cfg_v2(5, jsonb_build_object('streak_bonus',
               jsonb_build_object('scope', 'phase', 'tiers', tiers[1 + floor(random() * 4)::integer]::jsonb)
               || CASE mode WHEN 'exact'  THEN '{"count_exact_score": true}'::jsonb
                            WHEN 'strict' THEN '{"count_exact_score": true, "exact_as_prediction": true}'::jsonb
                            ELSE '{}'::jsonb END));
      ph := t.phase(e, t.ruleset(format('fz%s-f%s', sc, f), cfg), 'F' || f, f);
      n_ser := 2 + floor(random() * 8)::integer;
      FOR i IN 1..n_ser LOOP
        pos := pos + 1;
        -- 0–5 h tras la anterior (0 = misma hora, desempata el id).
        ts := ts + make_interval(hours => floor(random() * 6)::integer);
        bo := (ARRAY[1, 3, 5])[1 + floor(random() * 3)::integer];
        -- Como mucho un partido de la jornada por día.
        IF random() < 0.15 AND feat IS DISTINCT FROM (ts AT TIME ZONE 'Europe/Berlin')::date THEN
          m := t.match(ph, ts, bo, 'AAA', 'BBB', true);
          feat := (ts AT TIME ZONE 'Europe/Berlin')::date;
        ELSE
          m := t.match(ph, ts, bo, 'AAA', 'BBB');
        END IF;
        hw  := random() < 0.5;
        res := pg_temp.score(bo, hw);
        FOR p IN 1..5 LOOP
          IF pos >= joins[p] AND (pos = joins[p] OR random() < 0.75) THEN
            r := random();
            pred := CASE WHEN r < 0.45 THEN res                       -- exacto
                         WHEN r < 0.70 THEN pg_temp.score(bo, hw)     -- ganador (exacto o no)
                         ELSE pg_temp.score(bo, NOT hw) END;          -- ganador fallado
            PERFORM t.vote(players[p], m, pred[1], pred[2]);
          END IF;
        END LOOP;
        r := random();
        st := CASE WHEN r < 0.84 THEN 'FINISHED' WHEN r < 0.92 THEN 'CANCELLED' ELSE 'PENDING' END;
        IF st = 'FINISHED' THEN PERFORM t.finish(m, res[1], res[2]);
        ELSIF st = 'CANCELLED' THEN UPDATE matches SET status = 'CANCELLED' WHERE id = m;
        END IF;
      END LOOP;
      ts := ts + interval '1 day';  -- fases seguidas, sin intercalar
    END LOOP;
    PERFORM rescore_lol_edition(e);
    INSERT INTO fz VALUES (e, pool, n_ph, btrim(modes));
  END LOOP;
END;
$$;

-- Esperado por predicción y por serie, y lo que da el motor.
CREATE TEMP TABLE ref AS
SELECT f.e, pr.pid, w.*
FROM fz f
CROSS JOIN LATERAL (SELECT DISTINCT x.profile_id AS pid FROM predictions x JOIN matches mt ON mt.id = x.match_id
                    JOIN phases p ON p.id = mt.phase_id WHERE p.edition_id = f.e) pr
CROSS JOIN LATERAL pg_temp.ref_walk(f.e, pr.pid, NULL) w;

CREATE TEMP TABLE ref_series AS
SELECT e, pid, match_id, bool_or(voted) AS voted,
       (array_agg(len ORDER BY k DESC))[1] AS len, SUM(bonus)::integer AS bonus,
       jsonb_agg(jsonb_build_object('length', len, 'bonus', bonus) ORDER BY k) AS steps
FROM ref GROUP BY e, pid, match_id;

CREATE TEMP TABLE eng AS
SELECT rs.e, rs.pid, rs.match_id, b.*, pr.points_earned,
       COALESCE((SELECT r.config -> 'streak_bonus' -> 'exact_as_prediction' = 'true' FROM matches mt JOIN phases p ON p.id = mt.phase_id
          JOIN rulesets r ON r.id = p.ruleset_id WHERE mt.id = rs.match_id), false) AS strict
FROM ref_series rs
JOIN predictions pr ON pr.profile_id = rs.pid AND pr.match_id = rs.match_id
CROSS JOIN LATERAL lol_score_breakdown(rs.pid, rs.match_id) b(m_id, p_id, rules_version, best_of, voted, correct_winner,
  correct_score, base_winner, base_exact, streak_length, streak_bonus, featured_bonus, total, explanation);

-- ---------------- Cobertura (que los casos raros aparecen) ----------------
SELECT diag(format('ediciones %s · fases %s · series terminadas %s · predicciones comparadas %s',
  (SELECT count(*) FROM fz), (SELECT sum(phases) FROM fz),
  (SELECT count(DISTINCT match_id) FROM ref), (SELECT count(*) FROM eng)));
SELECT diag(format('fases por modo: plain %s · exact %s · strict %s',
  (SELECT count(*) FROM fz, regexp_split_to_table(modes, ' ') x WHERE x = 'plain'),
  (SELECT count(*) FROM fz, regexp_split_to_table(modes, ' ') x WHERE x = 'exact'),
  (SELECT count(*) FROM fz, regexp_split_to_table(modes, ' ') x WHERE x = 'strict')));
SELECT ok((SELECT count(*) FROM eng WHERE strict AND jsonb_array_length(explanation -> 'streak' -> 'steps') = 2
           AND (explanation -> 'streak' -> 'steps' -> 0 ->> 'bonus')::integer > 0
           AND (explanation -> 'streak' -> 'steps' -> 1 ->> 'bonus')::integer > 0) > 0,
          'cobertura: series estrictas que pagan dos bonus');
SELECT ok((SELECT count(*) FROM eng WHERE strict AND explanation -> 'streak' -> 'steps' -> 0 ->> 'hit' = 'true'
           AND explanation -> 'streak' -> 'steps' -> 1 ->> 'hit' = 'false') > 0,
          'cobertura: ganador acertado y marcador fallado (corte) en strict');
SELECT ok((SELECT count(*) FROM eng WHERE NOT strict AND explanation -> 'streak' ->> 'gain' = '2') > 0,
          'cobertura: exacto que suma 2 en count_exact_score');
SELECT ok((SELECT count(*) FROM (SELECT match_date FROM matches mt JOIN phases p ON p.id = mt.phase_id
           WHERE p.edition_id IN (SELECT e FROM fz) GROUP BY phase_id, match_date HAVING count(*) > 1) x) > 0,
          'cobertura: series a la misma hora (desempate por id)');
SELECT ok((SELECT count(*) FROM matches mt JOIN phases p ON p.id = mt.phase_id
           WHERE p.edition_id IN (SELECT e FROM fz) AND mt.status IN ('CANCELLED', 'PENDING')) > 0,
          'cobertura: canceladas y pendientes intercaladas');

-- ---------------- Motor = modelo ----------------
SELECT is_empty($$
  SELECT s.e, s.pid, s.match_id, s.len AS esperado, g.streak_length AS motor
  FROM ref_series s JOIN eng g USING (e, pid, match_id)
  WHERE g.streak_length <> CASE WHEN g.correct_winner OR g.strict THEN s.len ELSE 0 END
$$, 'racha tras cada serie (streak_length) = modelo');
SELECT is_empty($$
  SELECT s.e, s.pid, s.match_id, s.bonus AS esperado, g.streak_bonus AS motor
  FROM ref_series s JOIN eng g USING (e, pid, match_id)
  WHERE g.streak_bonus <> s.bonus
$$, 'bonus de racha de cada serie = modelo');
SELECT is_empty($$
  SELECT s.e, s.pid, s.match_id, s.steps, g.explanation -> 'streak' -> 'steps'
  FROM ref_series s JOIN eng g USING (e, pid, match_id)
  WHERE g.strict AND (SELECT jsonb_agg(jsonb_build_object('length', x -> 'length', 'bonus', x -> 'bonus') ORDER BY o)
                      FROM jsonb_array_elements(g.explanation -> 'streak' -> 'steps') WITH ORDINALITY y(x, o)) <> s.steps
$$, 'strict: racha y bonus tras cada predicción (steps) = modelo');
SELECT is_empty($$
  SELECT e, pid, match_id FROM eng
  WHERE total <> base_winner + base_exact + streak_bonus + featured_bonus
     OR points_earned IS DISTINCT FROM total::smallint
$$, 'puntos: total = base + racha + destacado, y points_earned = total');
SELECT is_empty($$
  SELECT g.e, g.pid, g.match_id FROM eng g JOIN matches mt ON mt.id = g.match_id
  WHERE g.featured_bonus <> CASE WHEN mt.metadata -> 'featured_match' = 'true' AND g.correct_winner THEN 2 ELSE 0 END
$$, 'partido de la jornada: +2 solo con ganador acertado');

-- Clasificación (global y pool) a cada fecha de corte: racha actual y mejor.
CREATE TEMP TABLE cuts AS
SELECT DISTINCT f.e, f.pool, (mt.match_date AT TIME ZONE 'Europe/Berlin')::date AS day
FROM fz f JOIN phases p ON p.edition_id = f.e JOIN matches mt ON mt.phase_id = p.id WHERE mt.status = 'FINISHED';

CREATE TEMP TABLE st_cmp AS
WITH cur AS (  -- fase en curso: la de la última serie terminada hasta el corte
  SELECT c.e, c.pool, c.day,
         (SELECT mt.phase_id FROM matches mt JOIN phases p ON p.id = mt.phase_id
          WHERE p.edition_id = c.e AND mt.status = 'FINISHED' AND (mt.match_date AT TIME ZONE 'Europe/Berlin')::date <= c.day
          ORDER BY mt.match_date DESC, mt.id DESC LIMIT 1) AS phase_id
  FROM cuts c
)
SELECT cur.e, scope, cur.day, s.profile_id, s.current_streak, s.best_streak,
       COALESCE((SELECT w.len FROM pg_temp.ref_walk(cur.e, s.profile_id, jd.joined) w
                 WHERE w.phase_id = cur.phase_id AND w.day <= cur.day
                 ORDER BY w.day DESC, (SELECT match_date FROM matches WHERE id = w.match_id) DESC, w.match_id DESC, w.k DESC LIMIT 1), 0) AS exp_cur,
       COALESCE((SELECT max(w.len) FROM pg_temp.ref_walk(cur.e, s.profile_id, jd.joined) w
                 WHERE w.phase_id = cur.phase_id AND w.day <= cur.day), 0) AS exp_best
FROM cur
CROSS JOIN LATERAL (VALUES ('global', NULL::integer), ('pool', cur.pool)) sc(scope, pool_id)
CROSS JOIN LATERAL lol_standings_at(cur.e, sc.pool_id, cur.day) s
LEFT JOIN LATERAL (SELECT (min(pm.joined_at) AT TIME ZONE 'Europe/Berlin')::date AS joined
                   FROM pool_members pm WHERE sc.scope = 'pool' AND pm.pool_id = sc.pool_id AND pm.profile_id = s.profile_id) jd ON true;

SELECT diag(format('clasificaciones comparadas: %s filas (global y pool, %s fechas de corte)',
  (SELECT count(*) FROM st_cmp), (SELECT count(*) FROM cuts)));
SELECT is_empty($$ SELECT * FROM st_cmp WHERE scope = 'global' AND current_streak <> exp_cur $$,
                'global: racha actual = modelo en cada fecha de corte');
SELECT is_empty($$ SELECT * FROM st_cmp WHERE scope = 'global' AND best_streak <> exp_best $$,
                'global: mejor racha de la fase = modelo en cada fecha de corte');
SELECT is_empty($$ SELECT * FROM st_cmp WHERE scope = 'pool' AND current_streak <> exp_cur $$,
                'pool: racha actual = modelo (desde el día de entrada) en cada fecha de corte');
SELECT is_empty($$ SELECT * FROM st_cmp WHERE scope = 'pool' AND best_streak <> exp_best $$,
                'pool: mejor racha = modelo (desde el día de entrada) en cada fecha de corte');

-- Recalcular otra vez no cambia nada (idempotente con todos los modos).
SELECT is((SELECT sum(rescore_lol_edition(e))::integer FROM fz), 0, 'rescore repetido: 0 cambios');

SELECT * FROM finish();
ROLLBACK;
