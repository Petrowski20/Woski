-- ============================================================
--  pools: ligas antiguas congeladas y join_code fuera del cliente
--
--  1. Ligas antiguas (club_id IS NULL, las de /ligas): sin altas
--     nuevas. Quien ya es miembro sigue (no se toca pool_members) y
--     la clasificación se sigue leyendo igual. Tampoco se crean
--     ligas sin club: el creador ya no podría inscribirse y la liga
--     quedaría huérfana (pools no tiene política DELETE).
--
--  2. pool_members_insert_own: solo pools de club y solo para
--     miembros del club. Desaparecen las dos ramas que dejaban
--     entrar sin código ni club:
--       * club_id IS NULL      → cualquiera, sabiendo solo el id.
--       * join_code IS NOT NULL → cualquiera en los 4 pools antiguos
--         con código propio, también sabiendo solo el id.
--     Esos 4 pools tienen club (backfill del 22/09 y 28/09, con el
--     mismo código): se entra uniéndose al club con join_club() y
--     después al pool, como en cualquier pool de club.
--
--  3. pools.join_code deja de ser legible para anon/authenticated
--     (privilegio por columna). Lo leían:
--       * app/(main)/ligas/page.tsx (tarjeta de la liga) → se quita.
--       * app/(main)/ligas/actions.ts joinLeagueAction → congelado.
--       * app/(main)/admin/leagues/page.tsx → service role, sigue.
--     Unirse por código va por clubs.join_code dentro de join_club()
--     (SECURITY DEFINER), que no depende de esto.
--     Ojo: una columna nueva en pools no será legible por
--     authenticated hasta que se añada a este GRANT.
--
--  4. Sin UPDATE/DELETE de pools ni UPDATE de pool_members
--     (league_points) para el cliente: no había políticas, así que ya
--     se rechazaban; ahora tampoco hay privilegio.
-- ============================================================


-- ---------------- pools: columnas ----------------

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.pools FROM anon, authenticated;

GRANT SELECT (id, name, description, created_by, created_at, club_id, edition_id)
  ON public.pools TO authenticated;

-- Abrir pool de club (openPoolForEditionAction): sin join_code.
GRANT INSERT (name, description, created_by, club_id, edition_id)
  ON public.pools TO authenticated;


-- ---------------- pools: solo pools de club ----------------

DROP POLICY IF EXISTS "pools_insert_own" ON public.pools;

CREATE POLICY "pools_insert_own"
  ON public.pools FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND club_id IS NOT NULL
    AND edition_id IS NOT NULL
    AND public.club_role(club_id) IN ('owner', 'admin')
  );


-- ---------------- pool_members ----------------

DROP POLICY IF EXISTS "pool_members_insert_own" ON public.pool_members;

CREATE POLICY "pool_members_insert_own"
  ON public.pool_members FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = profile_id
    AND EXISTS (
      SELECT 1 FROM public.pools po
      WHERE po.id = pool_id
        AND po.club_id IS NOT NULL
        AND public.club_role(po.club_id) IS NOT NULL
    )
  );

REVOKE UPDATE, TRUNCATE ON public.pool_members FROM anon, authenticated;
