-- ============================================================
--  profiles: el cliente solo escribe sus columnas de perfil
--
--  Antes: authenticated y anon tenían INSERT/UPDATE/DELETE sobre
--  toda la tabla y profiles_update_own (id = auth.uid()) dejaba a
--  cualquier usuario cambiarse role, is_hidden o total_points.
--
--  Ahora:
--  * UPDATE solo en las columnas que la app escribe con la sesión
--    del usuario:
--      - avatar_url            components/ProfileManager.tsx:121-124
--      - last_viewed_league_id app/(main)/clasificacion/actions.ts:12-15
--                              app/(main)/lol/actions.ts:122-125
--      - nickname              (hoy ninguna pantalla lo edita; se
--                               mantiene editable por decisión)
--    La fila sigue acotada a la propia por profiles_update_own.
--  * Sin INSERT ni DELETE para anon/authenticated: el alta la hace
--    handle_new_user (SECURITY DEFINER) al crearse el usuario en
--    auth.users. No había política de INSERT/DELETE, así que ya se
--    rechazaban; ahora tampoco hay privilegio.
--  * Defensa en profundidad: trigger que rechaza tocar role,
--    is_hidden y total_points salvo desde postgres, service_role o
--    supabase_admin (funciones SECURITY DEFINER, service role,
--    SQL Editor). Mismo criterio que lol_predictions_protect_scoring.
--    Un ADMIN de la app tampoco puede por esta vía: ocultar jugadores
--    va por setPlayerHiddenAction (service role) y los puntos los
--    escriben las funciones de puntuación.
-- ============================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (nickname, avatar_url, last_viewed_league_id) ON public.profiles TO authenticated;


CREATE OR REPLACE FUNCTION public.profiles_protect_privileged()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS DISTINCT FROM 'USER'::public.user_role
       OR NEW.is_hidden
       OR COALESCE(NEW.total_points, 0) <> 0 THEN
      RAISE EXCEPTION 'role, is_hidden y total_points no se pueden fijar desde el cliente'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.role         IS DISTINCT FROM OLD.role
     OR NEW.is_hidden    IS DISTINCT FROM OLD.is_hidden
     OR NEW.total_points IS DISTINCT FROM OLD.total_points THEN
    RAISE EXCEPTION 'role, is_hidden y total_points no se pueden cambiar desde el cliente'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_protect_privileged() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_protect_privileged ON public.profiles;
CREATE TRIGGER trg_profiles_protect_privileged
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_privileged();
