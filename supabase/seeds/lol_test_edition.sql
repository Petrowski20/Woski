-- ============================================================
--  SEED DE PRUEBA — edición de LoL para probar /lol
--  Requiere la migración 20260925100001_lol_calendar.sql.
--
--  Crea "LEC 2026 · Prueba" (activa desde hace 10 días hasta dentro
--  de 30), 10 equipos, dos fases y partidos en todos los estados:
--  finalizados, bloqueado (< 1h), próximos Bo1/Bo3/Bo5 y cancelado.
--  Las fechas son relativas a now(), así que siempre hay partidos
--  en cada estado al ejecutarlo.
--
--  Es idempotente: si la edición ya existe no vuelve a crear nada.
--  Al final hay un bloque (comentado) para borrarlo todo.
-- ============================================================

BEGIN;

-- Secuencias -----------------------------------------------------
-- Los equipos/partidos del Mundial se cargaron con IDs explícitos, así que
-- las secuencias pueden haberse quedado atrás (nextval devolvería 1 y
-- chocaría con los IDs existentes). Se adelantan al máximo id actual; nunca
-- se retrasan si ya van por delante.
SELECT setval(pg_get_serial_sequence('public.teams', 'id'),
              GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.teams), (SELECT last_value FROM public.teams_id_seq)));
SELECT setval(pg_get_serial_sequence('public.matches', 'id'),
              GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.matches), (SELECT last_value FROM public.matches_id_seq)));
SELECT setval(pg_get_serial_sequence('public.predictions', 'id'),
              GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.predictions), (SELECT last_value FROM public.predictions_id_seq)));

-- Equipos (sin id explícito: lo asigna teams_id_seq) -------------
INSERT INTO public.teams (sport_id, slug, name, iso_code)
SELECT s.id, t.slug, t.name, t.tag
FROM public.sports s
CROSS JOIN (VALUES
  ('lol-g2',  'G2 Esports',     'G2'),
  ('lol-fnc', 'Fnatic',         'FNC'),
  ('lol-kc',  'Karmine Corp',   'KC'),
  ('lol-mko', 'Movistar KOI',   'MKO'),
  ('lol-th',  'Team Heretics',  'TH'),
  ('lol-gx',  'GIANTX',         'GX'),
  ('lol-sk',  'SK Gaming',      'SK'),
  ('lol-vit', 'Team Vitality',  'VIT'),
  ('lol-bds', 'Team BDS',       'BDS'),
  ('lol-nav', 'Natus Vincere',  'NAV')
) AS t(slug, name, tag)
WHERE s.slug = 'lol'
ON CONFLICT (slug) DO NOTHING;

-- Edición --------------------------------------------------------
INSERT INTO public.editions (competition_id, name, start_date, end_date, timezone)
SELECT c.id, '2026 · Prueba', current_date - 10, current_date + 30, 'Europe/Berlin'
FROM public.competitions c
WHERE c.slug = 'lec'
  AND NOT EXISTS (
    SELECT 1 FROM public.editions e
    WHERE e.competition_id = c.id AND e.name = '2026 · Prueba'
  );

-- Fases ----------------------------------------------------------
INSERT INTO public.phases (edition_id, ruleset_id, name, "order")
SELECT e.id, r.id, p.name, p.ord
FROM public.editions e
JOIN public.competitions c ON c.id = e.competition_id AND c.slug = 'lec'
CROSS JOIN (SELECT id FROM public.rulesets WHERE name = 'LoL Series (default)') r
CROSS JOIN (VALUES ('Fase regular', 0), ('Playoffs', 1)) AS p(name, ord)
WHERE e.name = '2026 · Prueba'
  AND NOT EXISTS (
    SELECT 1 FROM public.phases ph WHERE ph.edition_id = e.id AND ph.name = p.name
  );

-- Partidos -------------------------------------------------------
-- offset_h: horas relativas a la hora en punto actual.
-- home/away: marcador de la serie (NULL si no se ha jugado).
WITH ed AS (
  SELECT e.id
  FROM public.editions e
  JOIN public.competitions c ON c.id = e.competition_id AND c.slug = 'lec'
  WHERE e.name = '2026 · Prueba'
),
data (phase_name, home_slug, away_slug, offset_h, best_of, status, home, away) AS (
  VALUES
    -- Fase regular (Bo1), ya jugada
    ('Fase regular', 'lol-g2',  'lol-fnc', -216.0, 1, 'FINISHED',  1, 0),
    ('Fase regular', 'lol-kc',  'lol-mko', -214.0, 1, 'FINISHED',  0, 1),
    ('Fase regular', 'lol-th',  'lol-gx',  -192.0, 1, 'FINISHED',  1, 0),
    ('Fase regular', 'lol-sk',  'lol-vit', -190.0, 1, 'FINISHED',  0, 1),
    ('Fase regular', 'lol-bds', 'lol-nav', -168.0, 1, 'FINISHED',  1, 0),
    ('Fase regular', 'lol-g2',  'lol-kc',  -166.0, 1, 'FINISHED',  1, 0),
    ('Fase regular', 'lol-fnc', 'lol-th',  -144.0, 1, 'FINISHED',  1, 0),
    ('Fase regular', 'lol-mko', 'lol-vit', -142.0, 1, 'FINISHED',  0, 1),
    ('Fase regular', 'lol-g2',  'lol-vit', -120.0, 1, 'FINISHED',  1, 0),
    ('Fase regular', 'lol-gx',  'lol-bds', -118.0, 1, 'CANCELLED', NULL, NULL),
    -- Bloqueado: empieza en menos de 1h
    ('Fase regular', 'lol-gx',  'lol-sk',     0.5, 1, 'PENDING',   NULL, NULL),
    -- Próximos Bo1
    ('Fase regular', 'lol-g2',  'lol-mko',   24.0, 1, 'PENDING',   NULL, NULL),
    ('Fase regular', 'lol-fnc', 'lol-kc',    26.0, 1, 'PENDING',   NULL, NULL),
    ('Fase regular', 'lol-vit', 'lol-bds',   48.0, 1, 'PENDING',   NULL, NULL),
    ('Fase regular', 'lol-nav', 'lol-th',    50.0, 1, 'PENDING',   NULL, NULL),
    -- Playoffs
    ('Playoffs',     'lol-g2',  'lol-th',   -48.0, 3, 'FINISHED',  2, 1),
    ('Playoffs',     'lol-fnc', 'lol-vit',   72.0, 3, 'PENDING',   NULL, NULL),
    ('Playoffs',     'lol-kc',  'lol-mko',   74.0, 3, 'PENDING',   NULL, NULL),
    ('Playoffs',     'lol-g2',  'lol-fnc',  120.0, 5, 'PENDING',   NULL, NULL),
    ('Playoffs',     'lol-vit', 'lol-kc',   144.0, 5, 'PENDING',   NULL, NULL)
)
INSERT INTO public.matches (
  home_team_id, away_team_id, match_date, status,
  home_goals, away_goals, winner_id, phase_id, metadata
)
SELECT
  th.id,
  ta.id,
  date_trunc('hour', now()) + make_interval(mins => (d.offset_h * 60)::int),
  d.status::public.match_status,
  d.home,
  d.away,
  CASE
    WHEN d.home IS NULL THEN NULL
    WHEN d.home > d.away THEN th.id
    ELSE ta.id
  END,
  ph.id,
  jsonb_build_object('best_of', d.best_of)
FROM data d
CROSS JOIN ed
JOIN public.phases ph ON ph.edition_id = ed.id AND ph.name = d.phase_name
JOIN public.teams  th ON th.slug = d.home_slug
JOIN public.teams  ta ON ta.slug = d.away_slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.matches m
  JOIN public.phases p2 ON p2.id = m.phase_id
  WHERE p2.edition_id = ed.id
);

COMMIT;


-- ============================================================
--  OPCIONAL — votos de relleno para ver el desglose de %.
--  Asigna votos aleatorios a los próximos partidos de la edición
--  de prueba en nombre de hasta 8 perfiles existentes (excluye al
--  perfil indicado para que puedas votar tú en limpio).
--  Descomenta y cambia el UUID si lo quieres.
-- ============================================================
-- INSERT INTO public.predictions (profile_id, match_id, pred_home_goals, pred_away_goals, pred_winner_id)
-- SELECT pr.id, m.id, o.home, o.away,
--        CASE WHEN o.home > o.away THEN m.home_team_id ELSE m.away_team_id END
-- FROM (
--   SELECT id FROM public.profiles
--   WHERE id <> '00000000-0000-0000-0000-000000000000'  -- ← tu UUID
--   ORDER BY random() LIMIT 8
-- ) pr
-- JOIN public.matches  m  ON m.status = 'PENDING'
-- JOIN public.phases   ph ON ph.id = m.phase_id
-- JOIN public.editions e  ON e.id = ph.edition_id AND e.name = '2026 · Prueba'
-- CROSS JOIN LATERAL (SELECT ((m.metadata->>'best_of')::int + 1) / 2 AS w) bw
-- CROSS JOIN LATERAL (
--   SELECT x.home, x.away
--   FROM (
--     SELECT bw.w AS home, l AS away FROM generate_series(0, bw.w - 1) l
--     UNION ALL
--     SELECT l, bw.w FROM generate_series(0, bw.w - 1) l
--   ) x
--   WHERE pr.id IS NOT NULL  -- correlaciona con el perfil: un sorteo por (perfil, partido)
--   ORDER BY random()
--   LIMIT 1
-- ) o
-- ON CONFLICT (profile_id, match_id) DO NOTHING;


-- ============================================================
--  LIMPIEZA — borra la edición de prueba y todo lo que cuelga
--  de ella (predicciones, partidos, fases, edición). Los equipos
--  se conservan por si se reutilizan.
-- ============================================================
-- BEGIN;
-- DELETE FROM public.predictions WHERE match_id IN (
--   SELECT m.id FROM public.matches m
--   JOIN public.phases ph ON ph.id = m.phase_id
--   JOIN public.editions e ON e.id = ph.edition_id
--   WHERE e.name = '2026 · Prueba');
-- DELETE FROM public.matches WHERE phase_id IN (
--   SELECT ph.id FROM public.phases ph
--   JOIN public.editions e ON e.id = ph.edition_id
--   WHERE e.name = '2026 · Prueba');
-- DELETE FROM public.phases WHERE edition_id IN (
--   SELECT id FROM public.editions WHERE name = '2026 · Prueba');
-- DELETE FROM public.editions WHERE name = '2026 · Prueba';
-- COMMIT;
