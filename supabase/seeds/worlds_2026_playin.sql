-- ============================================================
--  DATOS — Worlds 2026 · Play-In
--  No es una migración: no va en supabase/migrations ni se
--  registra en el historial. Se ejecuta a mano en el SQL Editor.
--
--  Crea (solo si no existe):
--    * competición "worlds" (ya existe en remoto como "Worlds":
--      se reutiliza y NO se renombra)
--    * ruleset "LoL Worlds Play-In": copia de "LoL Series (default)"
--      con default_best_of = 5 (el original no se toca)
--    * edición "2026" de Worlds, zona America/Los_Angeles
--    * fase "Play-In"
--    * equipos C9, MVK y FUR (KC ya existe: lol-kc). Sigla, región
--      y país = tabla de 61 equipos de
--      20260928100003_team_tag_and_metadata.sql (coinciden con lo
--      indicado). Sin logos.
--    * 2 series Bo5 en estado PENDING
--
--  Idempotente: cada INSERT comprueba antes si la fila existe, así
--  que ejecutarlo dos veces no duplica nada. No hace UPDATE ni
--  DELETE de filas existentes (la edición "LEC 2026 · Prueba" no se
--  toca). Todo en una transacción: si una comprobación falla, no se
--  aplica nada.
--
--  Ids: ninguno fijo, todo se resuelve por slug / nombre / sigla.
--  best_of: no hay columna; vive en matches.metadata->>'best_of'
--  (prioridad: metadata.best_of > ruleset.default_best_of > 3).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
--  0. Comprobaciones previas
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sports WHERE slug = 'lol') THEN
    RAISE EXCEPTION 'No existe el deporte lol';
  END IF;
  IF (SELECT COUNT(*) FROM public.rulesets WHERE name = 'LoL Series (default)') <> 1 THEN
    RAISE EXCEPTION 'Se esperaba exactamente un ruleset "LoL Series (default)"';
  END IF;
END;
$$;

-- Secuencias de teams y matches: mismo criterio que
-- lol_test_edition.sql (el Mundial se cargó con ids explícitos).
-- Solo adelanta la secuencia hasta MAX(id); nunca la retrasa y no
-- modifica filas.
SELECT setval(pg_get_serial_sequence('public.teams', 'id'),
              GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.teams), (SELECT last_value FROM public.teams_id_seq)));
SELECT setval(pg_get_serial_sequence('public.matches', 'id'),
              GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.matches), (SELECT last_value FROM public.matches_id_seq)));


-- ------------------------------------------------------------
--  1. Competición (en remoto ya existe slug 'worlds' → no hace nada)
-- ------------------------------------------------------------
INSERT INTO public.competitions (sport_id, slug, name)
SELECT s.id, 'worlds', 'World Championship'
FROM public.sports s
WHERE s.slug = 'lol'
ON CONFLICT (slug) DO NOTHING;


-- ------------------------------------------------------------
--  2. Ruleset propio: copia del de LoL por defecto, Bo5.
--  Hereda todo lo demás (3 exacto / 1 ganador; sin
--  prediction_cutoff_minutes → corte de 60 min).
-- ------------------------------------------------------------
INSERT INTO public.rulesets (name, config)
SELECT 'LoL Worlds Play-In',
       r.config || jsonb_build_object('default_best_of', 5)
FROM public.rulesets r
WHERE r.name = 'LoL Series (default)'
  AND NOT EXISTS (SELECT 1 FROM public.rulesets WHERE name = 'LoL Worlds Play-In');


-- ------------------------------------------------------------
--  3. Edición 2026
--  "Activa" en la app = start_date <= hoy <= end_date (hoy en hora
--  de Madrid). No hay columna is_active.
--  ⚠ start_date / end_date NO me los diste:
--    * start_date 2026-10-14: visible en cuanto se cargue, para
--      poder votar antes del jueves.
--    * end_date 2026-11-30: PROVISIONAL, solo es un techo para que
--      siga visible. Cámbialo por el día de la final ANTES de la
--      primera ejecución (después este INSERT ya no la modifica).
-- ------------------------------------------------------------
INSERT INTO public.editions (competition_id, name, start_date, end_date, timezone)
SELECT c.id, '2026', DATE '2026-10-14', DATE '2026-11-30', 'America/Los_Angeles'
FROM public.competitions c
WHERE c.slug = 'worlds'
  AND NOT EXISTS (
    SELECT 1 FROM public.editions e
    WHERE e.competition_id = c.id AND e.name = '2026'
  );


-- ------------------------------------------------------------
--  4. Fase Play-In (única fase por ahora)
-- ------------------------------------------------------------
INSERT INTO public.phases (edition_id, ruleset_id, name, "order")
SELECT e.id, r.id, 'Play-In', 0
FROM public.editions e
JOIN public.competitions c ON c.id = e.competition_id AND c.slug = 'worlds'
CROSS JOIN (SELECT id FROM public.rulesets WHERE name = 'LoL Worlds Play-In') r
WHERE e.name = '2026'
  AND NOT EXISTS (
    SELECT 1 FROM public.phases ph WHERE ph.edition_id = e.id AND ph.name = 'Play-In'
  );


-- ------------------------------------------------------------
--  5. Equipos
--  Un equipo "ya existe" si hay uno de LoL con el mismo slug, la
--  misma sigla o el mismo nombre (sin distinguir mayúsculas: la
--  tabla de 61 lo llama "Furia"). Solo se insertan los que faltan;
--  los existentes no se modifican (KC ya tiene KC / EMEA / FR).
--  Slug: convención lol-<sigla>.
-- ------------------------------------------------------------
CREATE TEMP TABLE _w26_teams (slug text, name text, tag text, region text, country text) ON COMMIT DROP;
INSERT INTO _w26_teams VALUES
  ('lol-kc',  'Karmine Corp', 'KC',  'EMEA', 'FR'),
  ('lol-c9',  'Cloud9',       'C9',  'NA',   'US'),
  ('lol-mvk', 'MVK Esports',  'MVK', 'APAC', 'VN'),
  ('lol-fur', 'FURIA',        'FUR', 'BR',   'BR');

INSERT INTO public.teams (sport_id, slug, name, iso_code, metadata)
SELECT s.id, w.slug, w.name, w.tag,
       jsonb_build_object('region', w.region, 'country', w.country)
FROM _w26_teams w
CROSS JOIN (SELECT id FROM public.sports WHERE slug = 'lol') s
WHERE NOT EXISTS (
  SELECT 1 FROM public.teams t
  WHERE t.slug = w.slug
     OR (t.sport_id = s.id AND (t.iso_code = w.tag OR lower(t.name) = lower(w.name)))
);

-- Cada equipo debe resolverse a UNA sola fila de LoL; si no, se
-- aborta todo (evita colgar partidos de un equipo equivocado).
CREATE TEMP TABLE _w26_team_ids ON COMMIT DROP AS
SELECT w.tag, t.id AS team_id
FROM _w26_teams w
JOIN public.teams t
  ON t.sport_id = (SELECT id FROM public.sports WHERE slug = 'lol')
 AND (t.slug = w.slug OR t.iso_code = w.tag OR lower(t.name) = lower(w.name));

DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(w.tag || ' (' || COALESCE(n.c, 0) || ')', ', ') INTO bad
  FROM _w26_teams w
  LEFT JOIN (SELECT tag, COUNT(DISTINCT team_id) AS c FROM _w26_team_ids GROUP BY tag) n ON n.tag = w.tag
  WHERE COALESCE(n.c, 0) <> 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Equipos que no se resuelven a una sola fila: %', bad;
  END IF;
END;
$$;


-- ------------------------------------------------------------
--  6. Series del Play-In (Bo5, PENDING)
--  Una serie "ya existe" si en la misma fase hay otra con el mismo
--  local, visitante y fecha. Para cambiar la hora de una serie ya
--  cargada usa UPDATE (si cambias la fecha aquí y lo vuelves a
--  ejecutar, crearía una segunda serie).
-- ------------------------------------------------------------
WITH ph AS (
  SELECT ph.id
  FROM public.phases ph
  JOIN public.editions e     ON e.id = ph.edition_id AND e.name = '2026'
  JOIN public.competitions c ON c.id = e.competition_id AND c.slug = 'worlds'
  WHERE ph.name = 'Play-In'
),
data (home_tag, away_tag, match_date, best_of) AS (
  VALUES
    ('KC',  'C9',  TIMESTAMPTZ '2026-10-15 18:00:00+00', 5),
    ('FUR', 'MVK', TIMESTAMPTZ '2026-10-15 23:00:00+00', 5)
)
INSERT INTO public.matches (home_team_id, away_team_id, match_date, status, phase_id, metadata)
SELECT h.team_id, a.team_id, d.match_date, 'PENDING'::public.match_status, ph.id,
       jsonb_build_object('best_of', d.best_of)
FROM data d
CROSS JOIN ph
JOIN _w26_team_ids h ON h.tag = d.home_tag
JOIN _w26_team_ids a ON a.tag = d.away_tag
WHERE NOT EXISTS (
  SELECT 1 FROM public.matches m
  WHERE m.phase_id     = ph.id
    AND m.home_team_id = h.team_id
    AND m.away_team_id = a.team_id
    AND m.match_date   = d.match_date
);


COMMIT;


-- ------------------------------------------------------------
--  7. Resultado (solo lectura; tras el COMMIT para que el SQL Editor lo muestre)
-- ------------------------------------------------------------
SELECT c.name AS competicion, e.name AS edicion, e.start_date, e.end_date, e.timezone,
       ph.name AS fase, r.name AS ruleset, r.config->>'default_best_of' AS default_bo,
       m.id AS match_id, th.iso_code AS local, ta.iso_code AS visitante,
       m.match_date, m.status, m.metadata->>'best_of' AS best_of,
       m.prediction_locks_at
FROM public.matches m
JOIN public.phases ph      ON ph.id = m.phase_id
JOIN public.rulesets r     ON r.id  = ph.ruleset_id
JOIN public.editions e     ON e.id  = ph.edition_id
JOIN public.competitions c ON c.id  = e.competition_id
JOIN public.teams th       ON th.id = m.home_team_id
JOIN public.teams ta       ON ta.id = m.away_team_id
WHERE c.slug = 'worlds' AND e.name = '2026'
ORDER BY m.match_date;
