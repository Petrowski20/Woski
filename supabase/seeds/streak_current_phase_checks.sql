-- ============================================================
--  Comprobaciones tras aplicar 20261023100001 (SOLO LECTURA)
--  Racha actual de la clasificación = racha de la fase en curso,
--  igual que la que paga los bonus (lol_score_breakdown).
--
--  No escribe nada: todo va dentro de una transacción READ ONLY
--  que termina en ROLLBACK. Ejecutar como postgres (lol_standings_at
--  no es ejecutable desde la API).
--
--  Uso:
--    psql "$DATABASE_URL" -f supabase/seeds/streak_current_phase_checks.sql
--  En el SQL Editor de Supabase solo se ve el último resultado:
--  ejecutar cada bloque por separado, o solo el 4 (resumen).
-- ============================================================

BEGIN TRANSACTION READ ONLY;


-- ---------------- 1. Migración aplicada ----------------
-- Debe aparecer 20261023100001.

SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 5;


-- ---------------- 2. Versión de lol_standings_at ----------------
-- nueva = true, antigua = false.

SELECT position('current_seq' IN prosrc) > 0                AS nueva,
       position('s.phase_id <> cp.phase_id' IN prosrc) > 0  AS antigua
FROM pg_proc
WHERE oid = 'public.lol_standings_at(integer, integer, date)'::regprocedure;


-- ---------------- 3. Ediciones con fases solapadas ----------------
-- Informativo: las que cambian con esta migración (pares de fases
-- cuyas series terminadas se cruzan en fechas).

SELECT ph1.edition_id, ph1.name AS fase_1, ph2.name AS fase_2
FROM phases ph1
JOIN phases ph2 ON ph2.edition_id = ph1.edition_id AND ph2.id > ph1.id
JOIN LATERAL (SELECT min(match_date) AS d0, max(match_date) AS d1 FROM matches
              WHERE phase_id = ph1.id AND status = 'FINISHED') a ON true
JOIN LATERAL (SELECT min(match_date) AS d0, max(match_date) AS d1 FROM matches
              WHERE phase_id = ph2.id AND status = 'FINISHED') b ON true
WHERE a.d0 <= b.d1 AND b.d0 <= a.d1
ORDER BY 1, 2, 3;


-- ---------------- 4. Racha actual: clasificación vs desglose ----------------
-- Por edición v2 y jugador visible (clasificación global, sin corte):
-- la racha actual debe ser la del desglose de su última serie
-- terminada de la fase en curso desde su primer voto (0 si no votó
-- esa serie o falló el ganador fuera de strict). Debe salir vacío.

WITH cur AS (
  SELECT DISTINCT ON (ph.edition_id)
         ph.edition_id, mt.phase_id,
         public.lol_ruleset_version(r.config) = 2 AS v2,
         COALESCE(r.config -> 'streak_bonus' -> 'exact_as_prediction' = 'true'::jsonb, false) AS strict
  FROM matches mt
  JOIN phases   ph ON ph.id = mt.phase_id
  JOIN rulesets r  ON r.id  = ph.ruleset_id
  WHERE mt.status = 'FINISHED'
  ORDER BY ph.edition_id, mt.match_date DESC, mt.id DESC
),
st AS (
  SELECT c.edition_id, c.phase_id, c.strict, s.profile_id, s.current_streak
  FROM cur c
  CROSS JOIN LATERAL public.lol_standings_at(c.edition_id, NULL, NULL) s
  WHERE c.v2
),
first_vote AS (
  SELECT DISTINCT ON (ph.edition_id, x.profile_id)
         ph.edition_id, x.profile_id, mt.match_date AS d, mt.id
  FROM predictions x
  JOIN matches mt ON mt.id = x.match_id
  JOIN phases  ph ON ph.id = mt.phase_id
  WHERE mt.status <> 'CANCELLED'
  ORDER BY ph.edition_id, x.profile_id, mt.match_date, mt.id
),
last_series AS (
  SELECT st.*,
         (SELECT mt.id FROM matches mt
          WHERE mt.phase_id = st.phase_id AND mt.status = 'FINISHED'
            AND (mt.match_date, mt.id) >= (fv.d, fv.id)
          ORDER BY mt.match_date DESC, mt.id DESC LIMIT 1) AS match_id
  FROM st
  JOIN first_vote fv ON fv.edition_id = st.edition_id AND fv.profile_id = st.profile_id
),
cmp AS (
  SELECT ls.edition_id, ls.profile_id, ls.match_id, ls.current_streak AS clasificacion,
         COALESCE((SELECT CASE WHEN b.voted AND (b.correct_winner OR ls.strict) THEN b.streak_length ELSE 0 END
                   FROM public.lol_score_breakdown(ls.profile_id, ls.match_id) b), 0) AS desglose
  FROM last_series ls
)
SELECT c.edition_id, p.nickname, c.match_id, c.clasificacion, c.desglose
FROM cmp c
JOIN profiles p ON p.id = c.profile_id
WHERE c.clasificacion <> c.desglose
ORDER BY 1, 2;


ROLLBACK;
