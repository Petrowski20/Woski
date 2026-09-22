-- ============================================================
--  GAMES — partidas individuales dentro de una serie Bo3/Bo5
--  (LoL y otros esports; el fútbol nunca la usa). No requiere
--  migración de datos: no existe hoy ningún dato equivalente.
-- ============================================================

CREATE TABLE public.games (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id    smallint NOT NULL REFERENCES public.matches(id),
  game_number smallint NOT NULL,
  home_score  smallint,
  away_score  smallint,
  winner_id   integer REFERENCES public.teams(id)
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "games_select_all"
  ON public.games FOR SELECT USING (true);
