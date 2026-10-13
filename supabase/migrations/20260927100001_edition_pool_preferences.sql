-- ============================================================
--  Ámbito elegido en la clasificación, por edición.
--  Hasta ahora LoL guardaba el pool elegido en
--  profiles.last_viewed_league_id, la misma columna que usa la
--  clasificación del Mundial: elegir un pool de LoL cambiaba
--  también la vista del fútbol. Cada edición recuerda ahora su
--  propia elección (pool_id NULL = Global).
--  profiles.last_viewed_league_id no se toca: sigue siendo la
--  preferencia del Mundial.
-- ============================================================

CREATE TABLE public.edition_pool_preferences (
  profile_id uuid    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  edition_id integer NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  pool_id    integer REFERENCES public.pools(id) ON DELETE SET NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, edition_id)
);

COMMENT ON TABLE public.edition_pool_preferences IS
  'Ámbito elegido por cada usuario en la clasificación de cada edición. pool_id NULL = Global.';

ALTER TABLE public.edition_pool_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edition_pool_preferences_select_own"
  ON public.edition_pool_preferences FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- Solo se puede guardar Global o un pool propio de esa misma edición.
CREATE POLICY "edition_pool_preferences_insert_own"
  ON public.edition_pool_preferences FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND (
      pool_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.pool_members pm
        JOIN public.pools po ON po.id = pm.pool_id
        WHERE pm.pool_id = edition_pool_preferences.pool_id
          AND pm.profile_id = auth.uid()
          AND po.edition_id = edition_pool_preferences.edition_id
      )
    )
  );

CREATE POLICY "edition_pool_preferences_update_own"
  ON public.edition_pool_preferences FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (
    profile_id = auth.uid()
    AND (
      pool_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.pool_members pm
        JOIN public.pools po ON po.id = pm.pool_id
        WHERE pm.pool_id = edition_pool_preferences.pool_id
          AND pm.profile_id = auth.uid()
          AND po.edition_id = edition_pool_preferences.edition_id
      )
    )
  );

-- Quien ya había elegido un pool de LoL lo conserva en su edición.
INSERT INTO public.edition_pool_preferences (profile_id, edition_id, pool_id)
SELECT p.id, po.edition_id, po.id
FROM public.profiles p
JOIN public.pools        po ON po.id = p.last_viewed_league_id
JOIN public.editions     e  ON e.id  = po.edition_id
JOIN public.competitions c  ON c.id  = e.competition_id
JOIN public.sports       s  ON s.id  = c.sport_id
WHERE s.slug = 'lol'
ON CONFLICT (profile_id, edition_id) DO NOTHING;
