-- ============================================================
--  Clubs — roles y logo
--  * clubs.logo_url (opcional)
--  * club_members.role: owner | admin | member
--  * Backfill de club_members: la migración del 22/09
--    (20260922100002_clubs_and_pools.sql) creó un club por cada
--    pool antiguo pero no copió a sus miembros. Se copian aquí
--    desde pool_members (pool -> club 1:1), todos como 'member'.
--  * Owner: el miembro que coincide con clubs.created_by. Si algún
--    club no tiene ese miembro no se inventa un owner: se avisa
--    con un NOTICE para decidirlo a mano.
-- ============================================================

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
  CHECK (role IN ('owner', 'admin', 'member'));


-- ------------------------------------------------------------
--  Backfill de miembros. Se conserva la fecha de entrada al pool.
--  Si un jugador está en varios pools del mismo club se queda la
--  primera fecha.
-- ------------------------------------------------------------

INSERT INTO public.club_members (club_id, profile_id, joined_at)
SELECT po.club_id, pm.profile_id, MIN(pm.joined_at)
FROM public.pool_members pm
JOIN public.pools po ON po.id = pm.pool_id
WHERE po.club_id IS NOT NULL
GROUP BY po.club_id, pm.profile_id
ON CONFLICT (club_id, profile_id) DO NOTHING;


-- ------------------------------------------------------------
--  Owner = creador del club, solo si ya es miembro.
-- ------------------------------------------------------------

UPDATE public.club_members cm
SET role = 'owner'
FROM public.clubs c
WHERE c.id = cm.club_id
  AND cm.profile_id = c.created_by;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.id, c.name
    FROM public.clubs c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = c.id AND cm.role = 'owner'
    )
    ORDER BY c.id
  LOOP
    RAISE NOTICE 'Club % (%) sin owner: asignar a mano', r.id, r.name;
  END LOOP;
END;
$$;
