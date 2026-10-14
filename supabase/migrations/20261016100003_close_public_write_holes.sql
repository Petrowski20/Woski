-- ============================================================
--  Agujeros de escritura encontrados en la revisión de permisos
--  (catálogo de la base local de pruebas = esquema de producción
--  del 22/09 + migraciones del repo).
--
--  1. v_ranking_global / v_ranking_by_league: anon y authenticated
--     tenían INSERT/UPDATE/DELETE. v_ranking_global es una vista
--     simple sobre profiles, actualizable, y como es del owner
--     (postgres) no aplica la RLS de profiles: cualquiera, incluso
--     sin sesión, podía cambiar total_points/nickname/avatar de
--     cualquier jugador o BORRAR perfiles (con sus predicciones en
--     cascada). Solo se leen: se quita todo lo demás.
--
--  2. ranking_snapshots: sin RLS y con INSERT/UPDATE/DELETE para
--     anon/authenticated (historial de posiciones manipulable por
--     cualquiera). Se activa RLS con lectura igual que antes y se
--     quita la escritura; la escribe record_ranking_snapshot
--     (SECURITY DEFINER).
--
--  3. calculate_match_points (fútbol): SECURITY DEFINER sin
--     comprobar quién llama y ejecutable por PUBLIC (anon incluido).
--     Hoy no es explotable porque está roto desde el 22/09 (lee
--     matches.stage y matches.advancing_team_id, que se movieron a
--     phase_id/metadata: falla con 42703 y deshace todo), pero en
--     cuanto alguien lo arregle cualquiera podría cerrar partidos y
--     repuntuar. Se deja solo para service role; quien lo repare
--     tiene que añadir la guarda de admin (lol_assert_scoring_actor)
--     antes de volver a dárselo a authenticated.
--
--  4. record_ranking_snapshot: SECURITY DEFINER, ejecutable por
--     anon y authenticated. Cualquiera podía congelar la foto de un
--     partido antes de tiempo (ON CONFLICT DO NOTHING haría ignorar
--     la buena). Se añade la guarda de admin / service role / SQL
--     Editor (lol_assert_scoring_actor, mismo criterio que el motor
--     LoL); el cuerpo es copia literal de 20260925100002. /admin lo
--     llama con la sesión del ADMIN: sigue funcionando.
--
--  5. get_admin_player_ranking: ejecutable por anon/authenticated y
--     devuelve is_hidden de todos. Solo la usa /admin/jugadores con
--     service role.
-- ============================================================


-- ---------------- 1. Vistas de ranking: solo lectura ----------------

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.v_ranking_global, public.v_ranking_by_league FROM anon, authenticated;


-- ---------------- 2. ranking_snapshots ----------------

ALTER TABLE public.ranking_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ranking_snapshots_select_all" ON public.ranking_snapshots;
CREATE POLICY "ranking_snapshots_select_all"
  ON public.ranking_snapshots FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ranking_snapshots FROM anon, authenticated;


-- ---------------- 3. calculate_match_points ----------------

REVOKE ALL ON FUNCTION public.calculate_match_points(SMALLINT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_match_points(SMALLINT, INTEGER, INTEGER) TO service_role;


-- ---------------- 4. record_ranking_snapshot ----------------

CREATE OR REPLACE FUNCTION record_ranking_snapshot(p_match_id SMALLINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo admin, service role o SQL Editor.
  PERFORM public.lol_assert_scoring_actor();

  -- Snapshot global
  INSERT INTO ranking_snapshots (match_id, profile_id, pool_id, rank, total_points)
  SELECT
    p_match_id,
    profile_id,
    NULL::integer,
    ROW_NUMBER() OVER (ORDER BY total_points DESC, created_at ASC)::smallint,
    total_points::smallint
  FROM v_ranking_global
  ON CONFLICT DO NOTHING;

  -- Snapshot por pool
  INSERT INTO ranking_snapshots (match_id, profile_id, pool_id, rank, total_points)
  SELECT
    p_match_id,
    profile_id,
    league_id,
    ROW_NUMBER() OVER (
      PARTITION BY league_id
      ORDER BY total_points DESC, created_at ASC
    )::smallint,
    total_points::smallint
  FROM v_ranking_by_league
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ranking_snapshot(SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ranking_snapshot(SMALLINT) TO authenticated, service_role;


-- ---------------- 5. get_admin_player_ranking ----------------

REVOKE ALL ON FUNCTION public.get_admin_player_ranking() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_player_ranking() TO service_role;
