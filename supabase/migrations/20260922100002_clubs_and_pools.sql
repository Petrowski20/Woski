-- ============================================================
--  CLUBS (grupo persistente) y POOLS (liga privada de una edición)
-- ============================================================

CREATE TABLE public.clubs (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL,
  join_code  character varying UNIQUE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.club_members (
  club_id    integer NOT NULL REFERENCES public.clubs(id),
  profile_id uuid    NOT NULL REFERENCES public.profiles(id),
  joined_at  timestamp with time zone DEFAULT now(),
  PRIMARY KEY (club_id, profile_id)
);

ALTER TABLE public.clubs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clubs_select_authenticated"
  ON public.clubs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "club_members_select_own"
  ON public.club_members FOR SELECT
  USING (profile_id = auth.uid());


-- ============================================================
--  RENAME: private_leagues -> pools, profile_leagues -> pool_members
--  (100% de los datos existentes se preservan; es un RENAME, no una
--   recreación de tabla. Las vistas/RLS que referencian estas tablas
--   por OID se actualizan automáticamente con el rename.)
-- ============================================================

ALTER TABLE public.private_leagues RENAME TO pools;
ALTER TABLE public.pools ADD COLUMN IF NOT EXISTS club_id integer REFERENCES public.clubs(id);
ALTER TABLE public.pools ADD COLUMN IF NOT EXISTS edition_id integer REFERENCES public.editions(id);

ALTER TABLE public.profile_leagues RENAME TO pool_members;
ALTER TABLE public.pool_members RENAME COLUMN league_id TO pool_id;

-- ranking_snapshots.league_id referenciaba private_leagues(id); se
-- mantiene el mismo FK, solo se renombra la columna para que el nombre
-- siga reflejando la tabla a la que apunta tras el rename.
ALTER TABLE public.ranking_snapshots RENAME COLUMN league_id TO pool_id;


-- ============================================================
--  BACKFILL — un club por cada pool existente (relación 1:1 por
--  defecto, sin inventar agrupaciones), y asociación de todos los
--  pools existentes a la edición 2026 del Mundial.
-- ============================================================

WITH new_clubs AS (
  INSERT INTO public.clubs (name, join_code, created_by, created_at)
  SELECT p.name, p.join_code, p.created_by, p.created_at
  FROM public.pools p
  RETURNING id, name
)
UPDATE public.pools p
SET club_id = nc.id
FROM new_clubs nc
WHERE p.name = nc.name;

UPDATE public.pools
SET edition_id = (
  SELECT ed.id
  FROM public.editions ed
  JOIN public.competitions c ON c.id = ed.competition_id
  WHERE c.slug = 'fifa-world-cup'
);
