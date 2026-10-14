-- ============================================================
--  DATOS — Worlds 2026: reglas de puntuación (motor v2)
--  No es una migración. Se ejecuta a mano en el SQL Editor,
--  DESPUÉS de aplicar las migraciones 20261014120001 y
--  20261014120002 (supabase db push).
--
--  Elige UNO de los dos bloques del paso 1 (A o B), quita los
--  comentarios de ese bloque y ejecútalo. Después, paso 2
--  (recalcular) y paso 3 (comprobar).
--
--  Cada UPDATE es una sola sentencia (atómica). El trigger
--  trg_rulesets_validate_config rechaza un config v2 inválido con
--  un mensaje claro y no cambia nada.
--  Solo toca el ruleset "LoL Worlds Play-In" (lo creó
--  worlds_2026_playin.sql y solo lo usa la fase Play-In).
-- ============================================================


-- ------------------------------------------------------------
--  1A. RECOMENDADO — reglas completas v2, retroactivas desde el
--      día 1 del Play-In.
--      Bo5, corte a la hora de inicio, tramos 2/3/4 y único 6
--      (ganador y marcador exacto), rachas, pleno negativo −2.
--      featured_match_bonus 2 (el Play-In es Bo5; solo aplica si
--      se marca un partido de la jornada).
--      min_voters_override: 3 → el tramo "único" (6) solo vale si
--      votaron al menos 3 personas la SERIE completa; con menos, el
--      único que acierta cobra fallback_points (2).
--      Aviso: sin override (null) el mínimo sería max(1, ceil(1 % de
--      los votantes de la serie)), que con pocos votantes es 1: el
--      único que acierta cobraría 6 aunque solo votara él.
-- ------------------------------------------------------------
-- UPDATE public.rulesets
-- SET config = '{
--   "version": 2,
--   "scoring_type": "series",
--   "default_best_of": 5,
--   "prediction_cutoff_minutes": 0,
--   "winner_points": {
--     "tiers": [{"min_share": 50, "points": 2}, {"min_share": 25, "points": 3}, {"min_share": 0, "points": 4}],
--     "sole_voter_points": 6, "min_voters_percent": 1, "min_voters_override": 3, "fallback_points": 2
--   },
--   "exact_score_points": {
--     "tiers": [{"min_share": 50, "points": 2}, {"min_share": 25, "points": 3}, {"min_share": 0, "points": 4}],
--     "sole_voter_points": 6, "min_voters_percent": 1, "min_voters_override": 3, "fallback_points": 2
--   },
--   "streak_bonus": {
--     "scope": "phase",
--     "tiers": [{"from": 3, "bonus": 1}, {"from": 7, "bonus": 2}, {"from": 12, "bonus": 3}, {"from": 18, "bonus": 4}]
--   },
--   "perfect_day": {"positive": 0, "negative": -2},
--   "featured_match_bonus": 2
-- }'::jsonb
-- WHERE name = 'LoL Worlds Play-In';


-- ------------------------------------------------------------
--  1B. ALTERNATIVA — mantener las reglas simples (v1: exacto 3,
--      ganador 1, pleno negativo −1, racha solo para desempatar)
--      y solo adelantar el corte a la hora de inicio.
-- ------------------------------------------------------------
-- UPDATE public.rulesets
-- SET config = config || '{"prediction_cutoff_minutes": 0}'::jsonb
-- WHERE name = 'LoL Worlds Play-In';


-- ------------------------------------------------------------
--  2. Recalcular toda la edición con las reglas nuevas
--     (idempotente: si lo repites devuelve 0 filas cambiadas).
--     Desde el SQL Editor no hace falta JWT: la función reconoce
--     la sesión de postgres. Devuelve cuántas predicciones cambian.
-- ------------------------------------------------------------
-- SELECT public.rescore_lol_edition(e.id) AS predicciones_cambiadas
-- FROM public.editions e
-- JOIN public.competitions c ON c.id = e.competition_id
-- WHERE c.slug = 'worlds' AND e.name = '2026';


-- ------------------------------------------------------------
--  3. Comprobación (solo lectura, se puede ejecutar sola)
-- ------------------------------------------------------------
SELECT ph.name                                   AS fase,
       r.name                                    AS ruleset,
       public.lol_ruleset_version(r.config)      AS version,
       r.config ->> 'default_best_of'            AS default_bo,
       r.config ->> 'prediction_cutoff_minutes'  AS corte_min,
       COUNT(m.id)                               AS series,
       COUNT(m.id) FILTER (WHERE m.status = 'FINISHED') AS terminadas
FROM public.competitions c
JOIN public.editions e  ON e.competition_id = c.id AND e.name = '2026'
JOIN public.phases ph   ON ph.edition_id = e.id
JOIN public.rulesets r  ON r.id = ph.ruleset_id
LEFT JOIN public.matches m ON m.phase_id = ph.id
WHERE c.slug = 'worlds'
GROUP BY ph."order", ph.name, r.name, r.config
ORDER BY ph."order";


-- ============================================================
--  PLANTILLAS para las próximas fases (crean solo el ruleset;
--  la fase y sus series se añaden como en worlds_2026_playin.sql
--  y lol_add_series_template.sql). Idempotentes por nombre.
-- ============================================================

-- Swiss: Bo1, con partido de la jornada (+2).
-- INSERT INTO public.rulesets (name, config)
-- SELECT 'LoL Worlds Swiss', '{
--   "version": 2,
--   "scoring_type": "series",
--   "default_best_of": 1,
--   "prediction_cutoff_minutes": 0,
--   "winner_points": {
--     "tiers": [{"min_share": 50, "points": 2}, {"min_share": 25, "points": 3}, {"min_share": 0, "points": 4}],
--     "sole_voter_points": 6, "min_voters_percent": 1, "min_voters_override": null, "fallback_points": 2
--   },
--   "exact_score_points": {
--     "tiers": [{"min_share": 50, "points": 2}, {"min_share": 25, "points": 3}, {"min_share": 0, "points": 4}],
--     "sole_voter_points": 6, "min_voters_percent": 1, "min_voters_override": null, "fallback_points": 2
--   },
--   "streak_bonus": {
--     "scope": "phase",
--     "tiers": [{"from": 3, "bonus": 1}, {"from": 7, "bonus": 2}, {"from": 12, "bonus": 3}, {"from": 18, "bonus": 4}]
--   },
--   "perfect_day": {"positive": 0, "negative": -2},
--   "featured_match_bonus": 2
-- }'::jsonb
-- WHERE NOT EXISTS (SELECT 1 FROM public.rulesets WHERE name = 'LoL Worlds Swiss');

-- Play-offs: Bo5 (ganador + marcador exacto).
-- INSERT INTO public.rulesets (name, config)
-- SELECT 'LoL Worlds Play-offs', '{
--   "version": 2,
--   "scoring_type": "series",
--   "default_best_of": 5,
--   "prediction_cutoff_minutes": 0,
--   "winner_points": {
--     "tiers": [{"min_share": 50, "points": 2}, {"min_share": 25, "points": 3}, {"min_share": 0, "points": 4}],
--     "sole_voter_points": 6, "min_voters_percent": 1, "min_voters_override": null, "fallback_points": 2
--   },
--   "exact_score_points": {
--     "tiers": [{"min_share": 50, "points": 2}, {"min_share": 25, "points": 3}, {"min_share": 0, "points": 4}],
--     "sole_voter_points": 6, "min_voters_percent": 1, "min_voters_override": null, "fallback_points": 2
--   },
--   "streak_bonus": {
--     "scope": "phase",
--     "tiers": [{"from": 3, "bonus": 1}, {"from": 7, "bonus": 2}, {"from": 12, "bonus": 3}, {"from": 18, "bonus": 4}]
--   },
--   "perfect_day": {"positive": 0, "negative": -2},
--   "featured_match_bonus": 2
-- }'::jsonb
-- WHERE NOT EXISTS (SELECT 1 FROM public.rulesets WHERE name = 'LoL Worlds Play-offs');
