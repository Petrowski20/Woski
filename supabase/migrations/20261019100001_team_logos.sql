-- ============================================================
--  Equipos de LoL: nombre, siglas, color y logo desde /admin
--  Solo añade objetos; no toca puntuación ni auth.
--
--  * teams.color (nuevo, opcional): '#rrggbb'. Fondo de la
--    insignia con las siglas cuando no hay logo.
--  * teams.logo_url: CHECK → solo URLs públicas del bucket
--    team-logos con nombre <sha256 16 hex>.<png|webp>. Las URL de
--    otros sitios ya no se aceptan.
--  * Bucket público team-logos (lectura libre por la URL pública).
--    Límite 512 KB y solo PNG/WebP también en el bucket. Escribir
--    o borrar: solo ADMIN, por política sobre storage.objects con
--    el rol de profiles (no se fía del cliente). Sin UPDATE: el
--    nombre es el hash del contenido, nunca se sobrescribe.
--    El servidor (Next) valida además la firma real del archivo y
--    las dimensiones (máx. 512×512) antes de subir.
--  * Escrituras (SECURITY DEFINER, ADMIN con
--    lol_require_admin_actor(), también desde el SQL Editor):
--    - admin_update_lol_team: nombre, siglas, color.
--    - admin_set_lol_team_logo: pone o quita el logo; exige que el
--      archivo exista en team-logos y devuelve el anterior y si
--      otro equipo lo sigue usando, para que el servidor lo borre
--      del bucket (el borrado va por la API de Storage).
--    Las dos dejan registro en lol_admin_audit (columna nueva
--    team_id).
-- ============================================================


-- ------------------------------------------------------------
--  Columnas y restricciones
-- ------------------------------------------------------------

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS color text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_color_hex') THEN
    ALTER TABLE public.teams ADD CONSTRAINT teams_color_hex
      CHECK (color IS NULL OR color ~ '^#[0-9a-f]{6}$');
  END IF;
  -- Si algún equipo tiene una URL de otro sitio, esto falla y la
  -- migración entera se deshace: revisar antes con
  --   SELECT id, name, logo_url FROM teams WHERE logo_url IS NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_logo_url_team_logos') THEN
    ALTER TABLE public.teams ADD CONSTRAINT teams_logo_url_team_logos
      CHECK (logo_url IS NULL OR logo_url ~ '^https?://[^/?#]+/storage/v1/object/public/team-logos/[0-9a-f]{16}\.(png|webp)$');
  END IF;
END;
$$;

ALTER TABLE public.lol_admin_audit ADD COLUMN IF NOT EXISTS team_id integer;
CREATE INDEX IF NOT EXISTS idx_lol_admin_audit_team ON public.lol_admin_audit (team_id) WHERE team_id IS NOT NULL;


-- ------------------------------------------------------------
--  Bucket y políticas de Storage
-- ------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('team-logos', 'team-logos', true, 524288, ARRAY['image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "team_logos_admin_insert" ON storage.objects;
CREATE POLICY "team_logos_admin_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'team-logos'
    AND name ~ '^[0-9a-f]{16}\.(png|webp)$'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role::text = 'ADMIN'
    )
  );

-- Storage lee la fila al subir (duplicados) y al borrar; la lectura
-- pública va por /object/public y no pasa por aquí.
DROP POLICY IF EXISTS "team_logos_admin_select" ON storage.objects;
CREATE POLICY "team_logos_admin_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role::text = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "team_logos_admin_delete" ON storage.objects;
CREATE POLICY "team_logos_admin_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role::text = 'ADMIN'
    )
  );


-- ------------------------------------------------------------
--  Utilidades internas (sin permiso para la API)
-- ------------------------------------------------------------

-- Foto de un equipo para la auditoría.
CREATE OR REPLACE FUNCTION public.lol_team_snapshot(p_team_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object('name', t.name, 'tag', t.iso_code, 'color', t.color, 'logo_url', t.logo_url)
  FROM public.teams t
  WHERE t.id = p_team_id;
$$;

CREATE OR REPLACE FUNCTION public.is_lol_team(p_team_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams t JOIN public.sports s ON s.id = t.sport_id
    WHERE t.id = p_team_id AND s.slug = 'lol'
  );
$$;

-- Nombre del archivo (<hash>.<ext>) de una URL de team-logos; NULL si no lo es.
CREATE OR REPLACE FUNCTION public.team_logo_object(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT substring(p_url FROM '/storage/v1/object/public/team-logos/([0-9a-f]{16}\.(?:png|webp))$');
$$;

CREATE OR REPLACE FUNCTION public.lol_team_log(
  p_actor   text,
  p_action  text,
  p_team_id integer,
  p_before  jsonb,
  p_after   jsonb,
  p_reason  text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.lol_admin_audit (actor_id, actor_kind, action, team_id, before, after, reason)
  VALUES (auth.uid(), p_actor, p_action, p_team_id, p_before, p_after, NULLIF(btrim(p_reason), ''))
  RETURNING id;
$$;


-- ------------------------------------------------------------
--  Nombre, siglas y color
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_update_lol_team(
  p_team_id integer,
  p_name    text,
  p_tag     text,
  p_color   text,
  p_reason  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  text := public.lol_require_admin_actor();
  v_name   text := btrim(coalesce(p_name, ''));
  v_tag    text := upper(btrim(coalesce(p_tag, '')));
  v_color  text := lower(NULLIF(btrim(coalesce(p_color, '')), ''));
  v_before jsonb;
BEGIN
  IF NOT public.is_lol_team(p_team_id) THEN
    RAISE EXCEPTION 'El equipo % no existe o no es de LoL', p_team_id USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'El nombre debe tener entre 2 y 60 caracteres' USING ERRCODE = '22023';
  END IF;
  IF v_tag !~ '^[A-Z0-9]{2,6}$' THEN
    RAISE EXCEPTION 'Las siglas deben tener de 2 a 6 letras o números, sin espacios' USING ERRCODE = '22023';
  END IF;
  IF v_color IS NOT NULL AND v_color !~ '^#[0-9a-f]{6}$' THEN
    RAISE EXCEPTION 'El color debe tener el formato #rrggbb' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.teams t JOIN public.sports s ON s.id = t.sport_id
    WHERE s.slug = 'lol' AND t.id <> p_team_id AND upper(t.iso_code) = v_tag
  ) THEN
    RAISE EXCEPTION 'Ya hay otro equipo de LoL con las siglas %', v_tag USING ERRCODE = '23505';
  END IF;

  v_before := public.lol_team_snapshot(p_team_id);
  IF v_before ->> 'name' = v_name AND v_before ->> 'tag' = v_tag
     AND (v_before ->> 'color') IS NOT DISTINCT FROM v_color THEN
    RETURN;
  END IF;

  UPDATE public.teams SET name = v_name, iso_code = v_tag, color = v_color WHERE id = p_team_id;
  PERFORM public.lol_team_log(v_actor, 'update_team', p_team_id, v_before, public.lol_team_snapshot(p_team_id), p_reason);
END;
$$;


-- ------------------------------------------------------------
--  Logo (poner, cambiar o quitar con NULL)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_lol_team_logo(
  p_team_id  integer,
  p_logo_url text,
  p_reason   text DEFAULT NULL
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

  v_before := public.lol_team_snapshot(p_team_id);
  v_old := public.team_logo_object(v_before ->> 'logo_url');
  IF (v_before ->> 'logo_url') IS NOT DISTINCT FROM v_url THEN
    RETURN QUERY SELECT NULL::text, false;
    RETURN;
  END IF;

  UPDATE public.teams SET logo_url = v_url WHERE id = p_team_id;
  PERFORM public.lol_team_log(v_actor, CASE WHEN v_url IS NULL THEN 'remove_team_logo' ELSE 'set_team_logo' END,
                              p_team_id, v_before, public.lol_team_snapshot(p_team_id), p_reason);

  RETURN QUERY
  SELECT v_old,
         v_old IS NOT NULL AND EXISTS (SELECT 1 FROM public.teams t WHERE public.team_logo_object(t.logo_url) = v_old);
END;
$$;


-- ------------------------------------------------------------
--  Permisos
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION public.lol_team_snapshot(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_lol_team(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_team_log(text, text, integer, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_update_lol_team(integer, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_lol_team_logo(integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_lol_team(integer, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_lol_team_logo(integer, text, text) TO authenticated;
