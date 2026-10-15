-- ============================================================
--  Admin: gestión de usuarios (/admin/usuarios)
--  Solo añade objetos; no cambia tablas ni funciones existentes
--  salvo una columna nueva y nullable en lol_admin_audit.
--
--  * lol_admin_audit.target_profile_id: a quién afecta la acción
--    (las de series siguen usando match_id/edition_id).
--  * admin_list_users(): listado para ADMIN con el correo y el
--    último acceso de auth.users. SECURITY DEFINER porque
--    authenticated no lee auth.users; ADMIN comprobado dentro.
--  * admin_user_action_begin(target, action): registra la acción
--    ANTES de hacerla (quién, a quién, cuándo) y aplica el límite
--    de intentos por admin. Devuelve el id del registro.
--  * admin_user_action_end(id, ok, error): anota el resultado en
--    ese mismo registro.
--  La contraseña temporal nunca pasa por aquí: la genera y aplica
--  el servidor de la app con auth.admin.updateUserById.
--  Igual que admin_*_lol_*: actor con auth.uid() (service_role NO,
--  porque el registro necesita un autor).
-- ============================================================


ALTER TABLE public.lol_admin_audit
  ADD COLUMN IF NOT EXISTS target_profile_id uuid;

CREATE INDEX IF NOT EXISTS idx_lol_admin_audit_target
  ON public.lol_admin_audit (target_profile_id)
  WHERE target_profile_id IS NOT NULL;

-- Límite de intentos: actor + acción + fecha.
CREATE INDEX IF NOT EXISTS idx_lol_admin_audit_actor_action
  ON public.lol_admin_audit (actor_id, action, created_at DESC);


-- ------------------------------------------------------------
--  Listado
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id                   uuid,
  nickname             text,
  email                text,
  role                 text,
  is_hidden            boolean,
  clubs                text[],
  last_sign_in_at      timestamptz,
  created_at           timestamptz,
  must_change_password boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.lol_require_admin_actor();

  RETURN QUERY
  SELECT
    p.id,
    p.nickname::text,
    u.email::text,
    p.role::text,
    COALESCE(p.is_hidden, false),
    COALESCE(
      (SELECT array_agg(c.name ORDER BY c.name)
       FROM public.club_members cm
       JOIN public.clubs c ON c.id = cm.club_id
       WHERE cm.profile_id = p.id),
      '{}'::text[]),
    u.last_sign_in_at,
    p.created_at::timestamptz,
    COALESCE((u.raw_app_meta_data ->> 'must_change_password')::boolean, false)
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY lower(p.nickname);
END;
$$;


-- ------------------------------------------------------------
--  Registro + límite de intentos
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_user_action_begin(p_target uuid, p_action text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_limit  integer;
  v_window interval := interval '10 minutes';
  v_recent integer;
  v_id     bigint;
BEGIN
  IF public.lol_require_admin_actor() <> 'admin' OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Esta operación solo la puede hacer un administrador identificado' USING ERRCODE = '42501';
  END IF;

  v_limit := CASE p_action
    WHEN 'user_password_reset' THEN 5
    WHEN 'user_hide'           THEN 30
    WHEN 'user_show'           THEN 30
  END;
  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'Acción desconocida: %', p_action USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target) THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'user_password_reset' AND p_target = v_actor THEN
    RAISE EXCEPTION 'No puedes reiniciar tu propia contraseña desde el panel' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'user_password_reset'
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target AND role::text = 'ADMIN') THEN
    RAISE EXCEPTION 'No se puede reiniciar la contraseña de otro administrador' USING ERRCODE = '42501';
  END IF;

  -- Dos peticiones simultáneas del mismo admin no se cuelan las dos.
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_user_action:' || v_actor || ':' || p_action, 0));

  SELECT count(*) INTO v_recent
  FROM public.lol_admin_audit
  WHERE actor_id = v_actor
    AND action = p_action
    AND created_at > now() - v_window;

  IF v_recent >= v_limit THEN
    RAISE EXCEPTION 'Demasiados intentos: máximo % cada 10 minutos', v_limit USING ERRCODE = 'WR429';
  END IF;

  INSERT INTO public.lol_admin_audit (actor_id, actor_kind, action, target_profile_id, after)
  VALUES (v_actor, 'admin', p_action, p_target, jsonb_build_object('status', 'started'))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_user_action_end(p_audit_id bigint, p_ok boolean, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.lol_require_admin_actor() <> 'admin' THEN
    RAISE EXCEPTION 'Esta operación solo la puede hacer un administrador identificado' USING ERRCODE = '42501';
  END IF;

  -- Solo el autor y solo una vez.
  UPDATE public.lol_admin_audit
  SET after = jsonb_build_object('status', CASE WHEN p_ok THEN 'ok' ELSE 'error' END)
           || CASE WHEN p_ok OR p_error IS NULL THEN '{}'::jsonb
                   ELSE jsonb_build_object('error', left(p_error, 300)) END
  WHERE id = p_audit_id
    AND actor_id = auth.uid()
    AND action IN ('user_password_reset', 'user_hide', 'user_show')
    AND after ->> 'status' = 'started';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de auditoría no encontrado' USING ERRCODE = 'P0002';
  END IF;
END;
$$;


REVOKE ALL ON FUNCTION public.admin_list_users()                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_user_action_begin(uuid, text)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_user_action_end(bigint, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_action_begin(uuid, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_action_end(bigint, boolean, text) TO authenticated;
