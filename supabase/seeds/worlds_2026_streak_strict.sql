-- ============================================================
--  DATOS — Worlds 2026 Play-In: racha estricta (el marcador
--  exacto como predicción propia).
--  No es una migración. Se ejecuta a mano en el SQL Editor,
--  DESPUÉS de aplicar la migración 20261021100001 (db push).
--  Tres sentencias; cópialas y ejecútalas una a una, sin estas
--  líneas de comentario (el editor falla si se mezclan).
--  Requiere count_exact_score = true en el ruleset 3 (ya lo está):
--  si no, el trigger de validación rechaza el UPDATE.
-- ============================================================

-- 1. Comprobación previa: debe salir SOLO la fase 10 (edición 3).

SELECT ph.id AS phase_id, ph.name AS fase, ph.edition_id, r.id AS ruleset_id, r.config -> 'streak_bonus' AS streak_bonus
FROM public.phases ph
JOIN public.rulesets r ON r.id = ph.ruleset_id
WHERE ph.ruleset_id = 3;

-- 2. Activar exact_as_prediction solo en el ruleset 3 (0 filas si
--    otra fase distinta de la 10 lo usa).

UPDATE public.rulesets
SET config = jsonb_set(config, '{streak_bonus,exact_as_prediction}', 'true'::jsonb)
WHERE id = 3
  AND NOT EXISTS (SELECT 1 FROM public.phases WHERE ruleset_id = 3 AND id <> 10)
RETURNING id, name, config -> 'streak_bonus' AS streak_bonus;

-- 3. Recalcular la edición 3 (devuelve las predicciones cambiadas;
--    repetirlo devuelve 0).

SELECT public.rescore_lol_edition(3) AS predicciones_cambiadas;
