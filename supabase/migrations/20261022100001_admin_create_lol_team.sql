-- ============================================================
--  Equipos de LoL: alta desde /admin (pestaña Equipos)
--  Solo crea funciones; no toca tablas, filas ni puntuación.
--
--  * admin_create_lol_team: crea un equipo de LoL (nombre,
--    siglas, región, país y color opcionales). Slug "lol-" +
--    siglas en minúscula. Región y país van a teams.metadata
--    (region, country), como los equipos cargados en
--    20260928100003. Deja registro en lol_admin_audit
--    (action create_team, team_id).
--  * admin_create_lol_teams: alta en lote (lista JSON). Todo o
--    nada: si una fila falla no se crea ninguna y el error dice
--    qué fila.
--  Las dos: SECURITY DEFINER, ADMIN con lol_require_admin_actor()
--  (también desde el SQL Editor), search_path fijo, EXECUTE solo
--  para authenticated (ni anon ni service_role).
-- ============================================================


-- ------------------------------------------------------------
--  Un equipo
--  Validaciones (mensajes en castellano):
--  * nombre: no vacío, 2–60 caracteres (como admin_update_lol_team).
--  * siglas: 2–5 letras o números; se pasan a mayúsculas.
--  * región: una de las que usan los equipos de LoL (EMEA, NA,
--    BR, KR, CN, APAC); se pasa a mayúsculas.
--  * país: opcional, ISO 3166-1 alfa-2 (2 letras).
--  * color: opcional, '#rrggbb' (como el CHECK teams_color_hex).
--  * Sin duplicados: siglas dentro de LoL y slug en toda la tabla.
--    Los UNIQUE de teams cubren además dos altas simultáneas.
--  Devuelve el id del equipo nuevo.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_create_lol_team(
  p_name    text,
  p_tag     text,
  p_region  text,
  p_country text DEFAULT NULL,
  p_color   text DEFAULT NULL,
  p_reason  text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   text    := public.lol_require_admin_actor();
  v_name    text    := btrim(coalesce(p_name, ''));
  v_tag     text    := upper(btrim(coalesce(p_tag, '')));
  v_region  text    := upper(btrim(coalesce(p_region, '')));
  v_country text    := upper(NULLIF(btrim(coalesce(p_country, '')), ''));
  v_color   text    := lower(NULLIF(btrim(coalesce(p_color, '')), ''));
  v_slug    text;
  v_sport   integer;
  v_other   text;
  v_id      integer;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'El nombre no puede estar vacío' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'El nombre debe tener entre 2 y 60 caracteres' USING ERRCODE = '22023';
  END IF;
  IF v_tag !~ '^[A-Z0-9]{2,5}$' THEN
    RAISE EXCEPTION 'Las siglas deben tener de 2 a 5 letras o números, sin espacios ni símbolos' USING ERRCODE = '22023';
  END IF;
  IF v_region NOT IN ('EMEA', 'NA', 'BR', 'KR', 'CN', 'APAC') THEN
    RAISE EXCEPTION 'La región debe ser EMEA, NA, BR, KR, CN o APAC' USING ERRCODE = '22023';
  END IF;
  IF v_country IS NOT NULL AND v_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'El país debe ser un código de 2 letras (ES, KR, US…) o quedar vacío' USING ERRCODE = '22023';
  END IF;
  IF v_color IS NOT NULL AND v_color !~ '^#[0-9a-f]{6}$' THEN
    RAISE EXCEPTION 'El color debe tener el formato #rrggbb' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_sport FROM public.sports WHERE slug = 'lol';
  IF v_sport IS NULL THEN
    RAISE EXCEPTION 'No existe el deporte LoL (sports.slug = lol)' USING ERRCODE = '22023';
  END IF;

  SELECT t.name INTO v_other
  FROM public.teams t
  WHERE t.sport_id = v_sport AND upper(t.iso_code) = v_tag
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Ya hay un equipo de LoL con las siglas % (%)', v_tag, v_other USING ERRCODE = '23505';
  END IF;

  v_slug := 'lol-' || lower(v_tag);
  SELECT t.name || ' (' || t.iso_code || ')' INTO v_other
  FROM public.teams t
  WHERE t.slug = v_slug
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'El identificador % ya lo usa el equipo %; elige otras siglas', v_slug, v_other USING ERRCODE = '23505';
  END IF;

  BEGIN
    INSERT INTO public.teams (sport_id, slug, name, iso_code, color, metadata)
    VALUES (v_sport, v_slug, v_name, v_tag, v_color,
            jsonb_build_object('region', v_region)
            || CASE WHEN v_country IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('country', v_country) END)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Otro alta con las mismas siglas o slug acaba de entrar.
    RAISE EXCEPTION 'Ya hay un equipo de LoL con las siglas % o el identificador %', v_tag, v_slug USING ERRCODE = '23505';
  END;

  PERFORM public.lol_team_log(
    v_actor, 'create_team', v_id, NULL,
    public.lol_team_snapshot(v_id)
      || jsonb_build_object('slug', v_slug, 'region', v_region, 'country', v_country),
    p_reason);

  RETURN v_id;
END;
$$;


-- ------------------------------------------------------------
--  Varios equipos a la vez (alta en lote)
--  p_teams: lista de objetos {name, tag, region, country?, color?}.
--  Crea en el orden de la lista con admin_create_lol_team. Si una
--  fila falla, la excepción deshace todas las anteriores y el
--  mensaje empieza por "Fila N (SIGLAS): ". Máximo 100 filas.
--  Devuelve los ids en el mismo orden.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_create_lol_teams(
  p_teams  jsonb,
  p_reason text DEFAULT NULL
)
RETURNS integer[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text := public.lol_require_admin_actor();
  v_row   jsonb;
  v_i     integer := 0;
  v_ids   integer[] := '{}';
  v_state text;
  v_msg   text;
BEGIN
  IF jsonb_typeof(p_teams) IS DISTINCT FROM 'array' OR jsonb_array_length(p_teams) = 0 THEN
    RAISE EXCEPTION 'La lista de equipos está vacía' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_teams) > 100 THEN
    RAISE EXCEPTION 'Como máximo 100 equipos por lote' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_teams) LOOP
    v_i := v_i + 1;
    BEGIN
      IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'cada fila debe ser un objeto con name, tag y region' USING ERRCODE = '22023';
      END IF;
      v_ids := v_ids || public.admin_create_lol_team(
        v_row ->> 'name', v_row ->> 'tag', v_row ->> 'region', v_row ->> 'country', v_row ->> 'color', p_reason);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      RAISE EXCEPTION 'Fila % (%): %', v_i, coalesce(upper(btrim(v_row ->> 'tag')), '?'), v_msg USING ERRCODE = v_state;
    END;
  END LOOP;

  RETURN v_ids;
END;
$$;


-- ------------------------------------------------------------
--  Permisos
-- ------------------------------------------------------------

-- service_role también fuera (los privilegios por defecto de Supabase se
-- lo dan): estas altas son solo de un ADMIN identificado o del SQL Editor.
REVOKE ALL ON FUNCTION public.admin_create_lol_team(text, text, text, text, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_create_lol_teams(jsonb, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_lol_team(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_lol_teams(jsonb, text) TO authenticated;
