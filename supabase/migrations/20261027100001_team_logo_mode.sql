-- ============================================================
--  Equipos de LoL: cómo se pinta el logo (teams.logo_mode)
--  Solo añade una columna y funciones; no toca puntuación ni auth.
--
--  * teams.logo_mode: 'color' | 'mono' | 'plate' (por defecto
--    'color', que es como se pintaban hasta ahora).
--    - color: el PNG/WebP tal cual.
--    - mono: logo de una sola tinta sobre transparente; la web usa
--      su canal alfa como máscara y lo pinta con el color de texto
--      del tema (negro en claro, blanco en oscuro).
--    - plate: el logo sobre una placa oscura fija (logos blancos
--      con algún detalle de color, que no se ven en modo claro).
--    La web propone el modo al elegir el archivo; el admin decide.
--  * admin_set_lol_team_logo: nuevo parámetro p_logo_mode (por
--    defecto 'color'). Quitar el logo vuelve a 'color'.
--  * admin_set_lol_team_logo_mode: cambia el modo sin volver a subir.
--  Las dos dejan registro en lol_admin_audit con logo_url y
--  logo_mode en before/after. lol_team_snapshot no cambia (las
--  altas y ediciones siguen registrando lo mismo).
-- ============================================================

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS logo_mode text NOT NULL DEFAULT 'color';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_logo_mode_check') THEN
    ALTER TABLE public.teams ADD CONSTRAINT teams_logo_mode_check
      CHECK (logo_mode IN ('color', 'mono', 'plate'));
  END IF;
END;
$$;


-- Foto del logo para la auditoría.
CREATE OR REPLACE FUNCTION public.lol_team_logo_snapshot(p_team_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.lol_team_snapshot(p_team_id)
         || jsonb_build_object('logo_mode', (SELECT t.logo_mode FROM public.teams t WHERE t.id = p_team_id));
$$;

CREATE OR REPLACE FUNCTION public.lol_check_logo_mode(p_mode text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_mode text := lower(btrim(coalesce(p_mode, '')));
BEGIN
  IF v_mode NOT IN ('color', 'mono', 'plate') THEN
    RAISE EXCEPTION 'El modo del logo debe ser color, mono o plate' USING ERRCODE = '22023';
  END IF;
  RETURN v_mode;
END;
$$;


-- ------------------------------------------------------------
--  Logo (poner, cambiar o quitar con NULL) con su modo
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_set_lol_team_logo(integer, text, text);

CREATE OR REPLACE FUNCTION public.admin_set_lol_team_logo(
  p_team_id   integer,
  p_logo_url  text,
  p_reason    text DEFAULT NULL,
  p_logo_mode text DEFAULT 'color'
)
RETURNS TABLE (previous_object text, previous_in_use boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_actor  text := public.lol_require_admin_actor();
  v_url    text := NULLIF(btrim(coalesce(p_logo_url, '')), '');
  v_object text := public.team_logo_object(v_url);
  v_mode   text;
  v_before jsonb;
  v_old    text;
BEGIN
  IF NOT public.is_lol_team(p_team_id) THEN
    RAISE EXCEPTION 'El equipo % no existe o no es de LoL', p_team_id USING ERRCODE = '22023';
  END IF;
  IF v_url IS NOT NULL THEN
    IF v_url !~ '^https?://[^/?#]+/storage/v1/object/public/team-logos/[0-9a-f]{16}\.(png|webp)$' THEN
      RAISE EXCEPTION 'La URL del logo no es del bucket team-logos' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'team-logos' AND o.name = v_object) THEN
      RAISE EXCEPTION 'El archivo % no está en team-logos', v_object USING ERRCODE = '22023';
    END IF;
  END IF;
  -- Sin logo no hay nada que pintar: siempre 'color'.
  v_mode := CASE WHEN v_url IS NULL THEN 'color' ELSE public.lol_check_logo_mode(p_logo_mode) END;

  v_before := public.lol_team_logo_snapshot(p_team_id);
  v_old := public.team_logo_object(v_before ->> 'logo_url');
  IF (v_before ->> 'logo_url') IS NOT DISTINCT FROM v_url AND v_before ->> 'logo_mode' = v_mode THEN
    RETURN QUERY SELECT NULL::text, false;
    RETURN;
  END IF;

  UPDATE public.teams SET logo_url = v_url, logo_mode = v_mode WHERE id = p_team_id;
  PERFORM public.lol_team_log(v_actor,
                              CASE WHEN v_url IS NULL THEN 'remove_team_logo'
                                   WHEN (v_before ->> 'logo_url') IS NOT DISTINCT FROM v_url THEN 'set_team_logo_mode'
                                   ELSE 'set_team_logo' END,
                              p_team_id, v_before, public.lol_team_logo_snapshot(p_team_id), p_reason);

  -- Mismo archivo, solo cambia el modo: no hay anterior que borrar.
  IF (v_before ->> 'logo_url') IS NOT DISTINCT FROM v_url THEN
    RETURN QUERY SELECT NULL::text, false;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT v_old,
         v_old IS NOT NULL AND EXISTS (SELECT 1 FROM public.teams t WHERE public.team_logo_object(t.logo_url) = v_old);
END;
$$;


-- ------------------------------------------------------------
--  Solo el modo (el equipo tiene que tener logo)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_lol_team_logo_mode(
  p_team_id   integer,
  p_logo_mode text,
  p_reason    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  text := public.lol_require_admin_actor();
  v_mode   text := public.lol_check_logo_mode(p_logo_mode);
  v_before jsonb;
BEGIN
  IF NOT public.is_lol_team(p_team_id) THEN
    RAISE EXCEPTION 'El equipo % no existe o no es de LoL', p_team_id USING ERRCODE = '22023';
  END IF;
  v_before := public.lol_team_logo_snapshot(p_team_id);
  IF v_before ->> 'logo_url' IS NULL THEN
    RAISE EXCEPTION 'El equipo no tiene logo' USING ERRCODE = '22023';
  END IF;
  IF v_before ->> 'logo_mode' = v_mode THEN
    RETURN;
  END IF;

  UPDATE public.teams SET logo_mode = v_mode WHERE id = p_team_id;
  PERFORM public.lol_team_log(v_actor, 'set_team_logo_mode', p_team_id, v_before,
                              public.lol_team_logo_snapshot(p_team_id), p_reason);
END;
$$;


-- ------------------------------------------------------------
--  Permisos
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION public.lol_team_logo_snapshot(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_check_logo_mode(text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_set_lol_team_logo(integer, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_lol_team_logo_mode(integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_lol_team_logo(integer, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_lol_team_logo_mode(integer, text, text) TO authenticated;
