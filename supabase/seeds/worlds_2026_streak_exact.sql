-- ============================================================
--  DATOS — Worlds 2026 Play-In: la racha cuenta el marcador exacto
--  No es una migración. Se ejecuta a mano en el SQL Editor,
--  DESPUÉS de aplicar la migración 20261020100001 (db push).
--  Ejecuta los pasos en orden; cada uno por separado.
-- ============================================================


-- ------------------------------------------------------------
--  0. Comprobaciones previas (solo lectura)
-- ------------------------------------------------------------

-- 0a. Qué fases usan el ruleset 3. Debe salir SOLO la fase 10
--     (Play-In, edición 3). Si sale otra, PARA: el flag también le
--     afectaría.
SELECT ph.id AS phase_id, ph.name AS fase, ph.edition_id, e.name AS edicion, r.id AS ruleset_id, r.name AS ruleset
FROM public.phases ph
JOIN public.rulesets r ON r.id = ph.ruleset_id
JOIN public.editions e ON e.id = ph.edition_id
WHERE ph.ruleset_id = 3;

-- 0b. Config actual del bloque de rachas (count_exact_score debe faltar o ser false).
SELECT id, name, config -> 'streak_bonus' AS streak_bonus
FROM public.rulesets
WHERE id = 3;

-- 0c. Foto de la clasificación global de la edición 3 ANTES del cambio.
--     Guárdala (copia el resultado) para comparar en el paso 3.
CREATE TEMP TABLE IF NOT EXISTS before_streak_exact AS
SELECT profile_id, nickname, total_points, correct_winners, finished_series,
       perfect_days, negative_days, current_streak, best_streak, rank_position
FROM public.get_lol_standings(3, NULL);
SELECT * FROM before_streak_exact ORDER BY rank_position;


-- ------------------------------------------------------------
--  1. Activar el flag SOLO en rulesets.id = 3
--     La condición NOT EXISTS evita tocarlo si otra fase distinta
--     de la 10 usa ese ruleset (en ese caso: 0 filas, no cambia
--     nada). El trigger trg_rulesets_validate_config valida el
--     config resultante.
-- ------------------------------------------------------------
UPDATE public.rulesets
SET config = jsonb_set(config, '{streak_bonus,count_exact_score}', 'true'::jsonb)
WHERE id = 3
  AND NOT EXISTS (SELECT 1 FROM public.phases WHERE ruleset_id = 3 AND id <> 10)
RETURNING id, name, config -> 'streak_bonus' AS streak_bonus;


-- ------------------------------------------------------------
--  2. Recalcular la edición 3
--     Firma: public.rescore_lol_edition(p_edition_id integer)
--     RETURNS integer (predicciones cambiadas). Idempotente: si se
--     repite devuelve 0. Desde el SQL Editor no hace falta JWT.
-- ------------------------------------------------------------
SELECT public.rescore_lol_edition(3) AS predicciones_cambiadas;


-- ------------------------------------------------------------
--  3. Comprobación posterior (solo lectura, misma sesión que 0c)
-- ------------------------------------------------------------

-- 3a. Quién cambia y cuánto (con 125 y 126 cerradas: solo G10YM, 8 → 9).
SELECT COALESCE(a.nickname, b.nickname) AS jugador,
       b.total_points AS antes, a.total_points AS despues,
       a.total_points - b.total_points AS diferencia,
       b.current_streak AS racha_antes, a.current_streak AS racha_despues
FROM public.get_lol_standings(3, NULL) a
FULL JOIN before_streak_exact b ON b.profile_id = a.profile_id
WHERE a.total_points IS DISTINCT FROM b.total_points
   OR a.current_streak IS DISTINCT FROM b.current_streak
ORDER BY diferencia DESC NULLS LAST;

-- 3b. Desglose de G10YM serie a serie (racha tras la serie y bonus).
SELECT mt.id AS serie, mt.match_date, b.correct_winner, b.correct_score,
       b.streak_length AS racha, b.streak_bonus AS bonus, b.total
FROM public.profiles p
JOIN public.predictions pr ON pr.profile_id = p.id
JOIN public.matches mt     ON mt.id = pr.match_id AND mt.phase_id = 10
CROSS JOIN LATERAL public.lol_score_breakdown(p.id, mt.id) b
WHERE p.nickname = 'G10YM'
ORDER BY mt.match_date, mt.id;

-- 3c. Recalcular otra vez no cambia nada.
SELECT public.rescore_lol_edition(3) AS debe_ser_0;
