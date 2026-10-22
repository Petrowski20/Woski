-- ============================================================
--  LoL — evolución de la clasificación en el perfil de un jugador
--  Solo cambia get_lol_player_days (20261024100001); no toca
--  tablas, permisos de tablas ni la lógica de puntos.
--
--  get_lol_player_days ya calculaba lol_standings_at al cierre de
--  cada jornada con series terminadas, pero solo devolvía las
--  jornadas con pleno. Ahora devuelve TODAS esas jornadas (desde
--  que el jugador aparece en la clasificación global) con su
--  posición, sus puntos y cuántos jugadores había en la
--  clasificación ese día: con eso se pinta la gráfica de evolución
--  sin hacer un segundo cálculo jornada a jornada. Las jornadas con
--  pleno son las que tienen perfect o negative a true.
--
--  Nada se guarda: si cambia un resultado o las reglas, la
--  evolución sale ya recalculada.
--
--  Cambia el RETURNS, así que hay que borrarla y crearla de nuevo
--  (y volver a dar los permisos).
-- ============================================================

DROP FUNCTION IF EXISTS public.get_lol_player_days(uuid, integer);

CREATE FUNCTION public.get_lol_player_days(p_profile_id uuid, p_edition_id integer)
RETURNS TABLE (
  day           date,
  perfect       boolean,
  negative      boolean,
  pleno_points  integer,
  rank_position integer,
  total_points  integer,
  players       integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  -- Por la API hace falta un usuario; el SQL Editor (sesión postgres sin
  -- JWT) puede consultarla, como las demás funciones de LoL.
  IF auth.uid() IS NULL
     AND COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''),
                  NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') IS NOT NULL THEN
    RAISE EXCEPTION 'Inicia sesión para ver el historial de un jugador' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT DISTINCT (mt.match_date AT TIME ZONE e.timezone)::date AS d
    FROM public.matches  mt
    JOIN public.phases   ph ON ph.id = mt.phase_id
    JOIN public.editions e  ON e.id  = ph.edition_id
    WHERE ph.edition_id = p_edition_id
      AND mt.status = 'FINISHED'
      AND public.is_lol_match(mt.id)
  ),
  -- Una sola lol_standings_at por jornada: la fila del jugador y el
  -- número de jugadores de la clasificación de ese día.
  st AS (
    SELECT dd.d, s.perfect_days, s.negative_days, s.total_points, s.rank_position, s.players
    FROM days dd
    CROSS JOIN LATERAL (
      SELECT x.*, COUNT(*) OVER () AS players
      FROM public.lol_standings_at(p_edition_id, NULL, dd.d) x
    ) s
    WHERE s.profile_id = p_profile_id
  ),
  delta AS (
    SELECT st.d, st.rank_position, st.total_points, st.players,
           st.perfect_days  - COALESCE(LAG(st.perfect_days)  OVER w, 0) AS dp,
           st.negative_days - COALESCE(LAG(st.negative_days) OVER w, 0) AS dn,
           st.total_points  - COALESCE(LAG(st.total_points)  OVER w, 0) AS dt
    FROM st
    WINDOW w AS (ORDER BY st.d)
  ),
  day_points AS (
    SELECT (mt.match_date AT TIME ZONE e.timezone)::date AS d, SUM(COALESCE(x.points_earned, 0)) AS pts
    FROM public.predictions x
    JOIN public.matches  mt ON mt.id = x.match_id
    JOIN public.phases   ph ON ph.id = mt.phase_id
    JOIN public.editions e  ON e.id  = ph.edition_id
    WHERE x.profile_id = p_profile_id
      AND ph.edition_id = p_edition_id
      AND mt.status = 'FINISHED'
    GROUP BY 1
  )
  SELECT dl.d,
         dl.dp > 0,
         dl.dn > 0,
         CASE WHEN dl.dp > 0 OR dl.dn > 0 THEN (dl.dt - COALESCE(dp.pts, 0))::integer ELSE 0 END,
         dl.rank_position::integer,
         dl.total_points::integer,
         dl.players::integer
  FROM delta dl
  LEFT JOIN day_points dp ON dp.d = dl.d
  ORDER BY dl.d;
END;
$$;

REVOKE ALL ON FUNCTION public.get_lol_player_days(uuid, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_lol_player_days(uuid, integer) TO authenticated;
