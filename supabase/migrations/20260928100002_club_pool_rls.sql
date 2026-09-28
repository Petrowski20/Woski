-- ============================================================
--  Clubs y pools por edición — RLS (segunda capa tras las
--  validaciones de app/(main)/clubes/actions.ts)
--
--  Reglas:
--  * Crear club: cualquier autenticado; el creador entra como owner.
--  * Unirse a club: con el join_code (join_club), entra como member.
--  * Roles: solo el owner cambia roles (admin <-> member) y nunca
--    el suyo propio; un único owner por club.
--  * Abrir pool de un club: owner o admin; una por club y edición.
--  * Unirse a pool de un club: solo miembros del club.
--  * Salir de un pool: el propio usuario.
--
--  /ligas sigue igual: sus pools (club_id NULL, o los 4 antiguos con
--  join_code propio) mantienen el comportamiento de antes.
-- ============================================================


-- ------------------------------------------------------------
--  Helpers (SECURITY DEFINER para no recurrir en las políticas de
--  club_members). Solo devuelven datos del propio usuario o un
--  booleano; no escriben nada.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.club_role(p_club_id integer)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.club_members
  WHERE club_id = p_club_id AND profile_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.club_has_owner(p_club_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id AND role = 'owner'
  )
$$;

REVOKE ALL ON FUNCTION public.club_role(integer)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.club_has_owner(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_role(integer)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.club_has_owner(integer) TO authenticated;


-- ------------------------------------------------------------
--  Integridad
-- ------------------------------------------------------------

-- Un único owner por club (el cambio de owner, cuando exista, será
-- una transferencia explícita).
CREATE UNIQUE INDEX IF NOT EXISTS club_members_one_owner
  ON public.club_members (club_id)
  WHERE role = 'owner';

-- Un pool por club y edición. Los pools de /ligas (club_id NULL)
-- no entran.
CREATE UNIQUE INDEX IF NOT EXISTS pools_club_edition_key
  ON public.pools (club_id, edition_id)
  WHERE club_id IS NOT NULL;


-- ------------------------------------------------------------
--  clubs
--  El join_code deja de ser visible para quien no es miembro
--  (antes cualquier autenticado leía todos los clubs). Nada fuera
--  de /clubes lee esta tabla.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "clubs_select_authenticated" ON public.clubs;

CREATE POLICY "clubs_select_member"
  ON public.clubs FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR public.club_role(id) IS NOT NULL);

CREATE POLICY "clubs_insert_own"
  ON public.clubs FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Nombre y logo: solo el owner. El resto de columnas no se pueden
-- cambiar desde el cliente.
REVOKE UPDATE ON public.clubs FROM anon, authenticated;
GRANT UPDATE (name, logo_url) ON public.clubs TO authenticated;

CREATE POLICY "clubs_update_owner"
  ON public.clubs FOR UPDATE
  TO authenticated
  USING (public.club_role(id) = 'owner')
  WITH CHECK (public.club_role(id) = 'owner');


-- ------------------------------------------------------------
--  club_members
-- ------------------------------------------------------------

-- Los miembros de un club ven a todos los miembros de ese club
-- (la política antigua de "solo mis filas" sigue y se suma).
CREATE POLICY "club_members_select_same_club"
  ON public.club_members FOR SELECT
  TO authenticated
  USING (public.club_role(club_id) IS NOT NULL);

-- Insert directo: solo el creador, como owner, en un club suyo que
-- aún no tiene owner. Unirse como member va por join_club().
CREATE POLICY "club_members_insert_creator_owner"
  ON public.club_members FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = club_id AND c.created_by = auth.uid()
    )
    AND NOT public.club_has_owner(club_id)
  );

-- Cambio de rol: solo el owner, sobre otro miembro, y solo entre
-- admin y member (el owner no se toca por aquí).
REVOKE UPDATE ON public.club_members FROM anon, authenticated;
GRANT UPDATE (role) ON public.club_members TO authenticated;

CREATE POLICY "club_members_update_role_by_owner"
  ON public.club_members FOR UPDATE
  TO authenticated
  USING (
    public.club_role(club_id) = 'owner'
    AND profile_id <> auth.uid()
    AND role IN ('admin', 'member')
  )
  WITH CHECK (
    profile_id <> auth.uid()
    AND role IN ('admin', 'member')
  );


-- ------------------------------------------------------------
--  Unirse a un club con código.
--  Es la única forma de entrar como member: el código es la
--  comprobación. Solo inserta al propio usuario, siempre como
--  member. Devuelve 0 filas si el código no existe.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_club(p_code text)
RETURNS TABLE (club_id integer, club_name text, already_member boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid      uuid := auth.uid();
  v_club     public.clubs%ROWTYPE;
  v_inserted boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_club FROM public.clubs c WHERE c.join_code = upper(trim(p_code));
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.club_members (club_id, profile_id, role)
  VALUES (v_club.id, v_uid, 'member')
  ON CONFLICT ON CONSTRAINT club_members_pkey DO NOTHING;
  v_inserted := FOUND;

  RETURN QUERY SELECT v_club.id, v_club.name, NOT v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.join_club(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_club(text) TO authenticated;


-- ------------------------------------------------------------
--  pools — abrir un pool de club: owner o admin. Los pools sin
--  club (/ligas) siguen como antes.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "private_leagues_insert_own" ON public.pools;

CREATE POLICY "pools_insert_own"
  ON public.pools FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND (
      club_id IS NULL
      OR (edition_id IS NOT NULL AND public.club_role(club_id) IN ('owner', 'admin'))
    )
  );


-- ------------------------------------------------------------
--  pool_members — unirse: pools de club solo para miembros del
--  club. Excepción: pools con join_code propio (los de /ligas,
--  incluidos los 4 antiguos que ya tienen club) siguen entrando por
--  código como hasta ahora. Los pools de club nuevos no tienen
--  join_code.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "profile_leagues_insert_own" ON public.pool_members;

CREATE POLICY "pool_members_insert_own"
  ON public.pool_members FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = profile_id
    AND EXISTS (
      SELECT 1 FROM public.pools po
      WHERE po.id = pool_id
        AND (
          po.club_id IS NULL
          OR po.join_code IS NOT NULL
          OR public.club_role(po.club_id) IS NOT NULL
        )
    )
  );

CREATE POLICY "pool_members_delete_own"
  ON public.pool_members FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());
