# Auditoría del frontend de Woski — 27/09/2026

Informe de solo lectura sobre cómo está organizado hoy el frontend, como base
para decidir cómo reestructurarlo para que LoL (y futuros deportes) no vaya
"encajado a la fuerza" sobre lo que se construyó para el Mundial de fútbol.

**Stack:** Next.js 16 (App Router, `proxy.ts` en lugar de `middleware.ts`),
React 19, Tailwind CSS v4 (sin `tailwind.config`, configuración vía `@theme` en
CSS), Supabase (Postgres + Auth + RLS), `next-themes` para modo oscuro,
`sonner` para toasts, i18n casero (`locales/{es,en,ro}.json`).

**Estado del árbol auditado:** rama `feat/lol-calendar`, último commit
`20393e2`, más cambios sin commitear de esta semana: la tabla
`edition_pool_preferences` para el ámbito de la clasificación de LoL, el filtro
de pools de fútbol en `/clasificacion` y las reglas de jornada de LoL. Las
migraciones `20260927100001` y `20260927100002` **no están aplicadas** en
Supabase.

---

## Resumen ejecutivo

1. **LoL vive dentro de su propia burbuja y está bien aislada.** Tiene rutas en
   `app/(main)/(home)` y `app/(main)/lol/*`, componentes en `components/lol/*`,
   lógica pura en `utils/lol/*` y datos en `app/(main)/lol/data.ts`. Usa tokens
   de tema y filtra siempre por deporte y edición. Lo compartido con fútbol es
   muy poco: tres componentes de `components/shared/`.
2. **El fútbol no es un "módulo": es la app.** Sus rutas están en la raíz
   (`/clasificacion`, `/selecciones`, `/supuestos`, `/premios`, `/reglas`,
   `/ligas`, `/jugador/[id]`, `/admin`). La navegación, el perfil, las ligas y
   el admin asumen fútbol sin ningún parámetro de deporte ni edición.
3. **Buena parte del fútbol está roto contra el esquema actual.** La migración
   del 22/09 eliminó `matches.stage`, `matches.group_letter`,
   `matches.advancing_team_id`, `matches.stadium`/`referee`,
   `predictions.pred_advancing_team_id` y las columnas de estadísticas de
   `teams`. Unas 12 rutas y varias acciones siguen consultándolas. El RPC de
   puntuación de fútbol `calculate_match_points` también, así que no puede
   puntuar.
4. **El calendario de fútbol ya no se puede alcanzar.** `/` pasó a ser el
   calendario de LoL. El antiguo home de fútbol (con `MatchGrid`) se eliminó y
   `MatchGrid.tsx` quedó huérfano. Fútbol no tiene hoy pantalla de votación.
5. **Hay dos sistemas visuales.** LoL y `shared/` usan tokens semánticos
   (`app/styles/theme.css`). Todo lo de fútbol usa la paleta de Tailwind y
   colores `brand-*` escritos a mano.

---

## 1. Mapa de rutas

Leyenda de ámbito: **F** = fútbol, **L** = LoL, **G** = genérica/compartida.
Leyenda de estado: ✅ consultas coherentes con el esquema actual · ⚠️ supuestos
de fútbol o datos no acotados por deporte · ❌ consulta columnas o RPCs que ya
no existen o que fallan.

Todas las rutas bajo `app/(main)` requieren sesión (`app/(main)/layout.tsx`
redirige a `/login`) y comparten `NavBar` + `Footer`.

### Públicas / raíz

| Ruta | Archivo | Qué muestra | Ámbito | Estado |
|---|---|---|---|---|
| `/login` | `app/(auth)/login/page.tsx` | Login y registro (`AuthForm`) | G, con supuestos F | ⚠️ El registro pide "selección favorita" (`utils/data/selecciones.ts`) |
| 404 | `app/not-found.tsx` | Página no encontrada | G | ✅ |
| `/api/export` | `app/api/export/route.ts` | Exportación JSON para admin (perfiles, partidos, predicciones) | F | ❌ Selecciona `stage, group_letter, stadium, referee` (l.30) |

### LoL

| Ruta | Archivo | Qué muestra | Ámbito | Estado |
|---|---|---|---|---|
| `/` | `app/(main)/(home)/page.tsx` | Calendario de series de la edición LoL activa, votación, progreso y Top 5 | L | ✅ |
| `/lol` | `next.config.ts` | Redirección 307 a `/` (conserva `?edicion=`) | L | ✅ |
| `/lol/clasificacion` | `app/(main)/lol/clasificacion/page.tsx` | Clasificación por edición (Global o por pool), plenos, racha, movimiento | L | ✅ Depende de las migraciones del 25/09 y 27/09 (`get_lol_standings`, `edition_pool_preferences`) |
| `/lol/historial` | `app/(main)/lol/historial/page.tsx` | Pantalla "Próximamente" | L | ✅ |
| `/admin/lol` | `app/(main)/admin/lol/page.tsx` | Admin: resultados de series LoL, cancelar o reabrir | L | ✅ |

### Fútbol

| Ruta | Archivo | Qué muestra | Ámbito | Estado |
|---|---|---|---|---|
| `/clasificacion` | `app/(main)/clasificacion/page.tsx` | Ranking global o por liga privada, estadísticas, movimiento, podio del campeón | F | ⚠️ `v_ranking_global` ordena por `profiles.total_points` (solo fútbol, de por vida). `get_player_stats` no filtra por deporte. `FINAL_MATCH_ID = 104` escrito a mano (l.10) |
| `/supuestos` | `app/(main)/supuestos/page.tsx` | Simulador de grupos del Mundial ("Mi Mundial") | F | ❌ `group_letter`, `.eq('stage','GROUP')` (l.93-98) |
| `/selecciones` | `app/(main)/selecciones/page.tsx` | Selecciones agrupadas por grupo del Mundial | F | ❌ `teams.fifa_ranking, manager, confederation…` (l.56) y `matches.group_letter/stage` (l.60-61). Además `teams` no se filtra por `sport_id`: saldrían equipos de LoL |
| `/selecciones/[iso]` | `app/(main)/selecciones/[iso]/page.tsx` | Ficha de selección y convocatoria (`players`) | F | ❌ `teams.group_letter, fifa_ranking, manager…` (l.78) |
| `/premios` | `app/(main)/premios/page.tsx` | Premios humorísticos (El Gafe, El Uyyy…) y MVP del día | F | ❌ `get_funny_prediction_stats` lee columnas eliminadas. `get_daily_mvp` no filtra por deporte y usa zona horaria `America/Mexico_City` |
| `/reglas` | `app/(main)/reglas/page.tsx` | Cómo jugar: puntuación, eliminatorias, penaltis, desempates | F | ⚠️ Contenido 100 % Mundial vía i18n. No menciona LoL |
| `/ligas` | `app/(main)/ligas/page.tsx` | Mis ligas privadas: crear, unirse, miembros, salir | G, con supuestos F | ⚠️ Lista pools sin edición. `createLeagueAction` crea pools con `edition_id = NULL` |
| `/jugador/[id]` | `app/(main)/jugador/[id]/page.tsx` | Perfil público: predicciones de fútbol con `MatchCard` | F | ❌ `stage, group_letter, stadium, referee, advancing_team_id, pred_advancing_team_id` (l.33 y siguientes). **La clasificación de LoL enlaza aquí** |
| `/perfil` | `app/(main)/perfil/page.tsx` | Mi perfil: avatar, apodo, contraseña, cerrar sesión | G | ✅ (`ProfileManager` usa i18n con textos genéricos) |
| `/pruebas` | `app/(main)/pruebas/page.tsx` | Vista previa del podio con el ranking global | F | ⚠️ Página de pruebas sin enlace; texto "¡Tenemos campeón del Mundial!" |

### Admin (`app/(main)/admin/*`, con `AdminSubNav`)

| Ruta | Qué muestra | Ámbito | Estado |
|---|---|---|---|
| `/admin` | Gestor de partidos de fútbol, resultados, interruptor de prueba del podio | F | ❌ `stage, group_letter, advancing_team_id` (l.26-27). `teams` sin filtrar por deporte |
| `/admin/jugadores` | Ranking de jugadores y ocultar/mostrar (`get_admin_player_ranking`) | G, con supuestos F | ⚠️ Puntos diarios sobre todos los partidos sin filtrar deporte; zona horaria de México |
| `/admin/predicciones` | Editor de predicciones de cualquier jugador | F | ❌ `stage, group_letter, advancing_team_id, pred_advancing_team_id` (l.34, l.46) |
| `/admin/recordatorios` | Quién no ha votado cada partido | F | ❌ `stage, group_letter` (l.57) |
| `/admin/leagues` | Listado de todas las ligas con miembros y código | G | ✅ Consulta `pools`/`pool_members` (no muestra la edición) |
| `/admin/stats` | Estadísticas divertidas por jugador y liga | F | ❌ `get_funny_prediction_stats` |
| `/admin/lol` | (ver LoL) | L | ✅ |

### Referencias a `private_leagues` / `profile_leagues` / `league_id`

- **En el frontend no queda ninguna referencia a las tablas antiguas.** Todo
  usa `pools`/`pool_members`/`pool_id`.
- Lo que sigue llamándose `league` es intencionado:
  - la columna `profiles.last_viewed_league_id` (preferencia del Mundial);
  - el parámetro `p_league_id` de los RPC, que se mantuvo en la corrección del
    25/09 para no romper firmas;
  - la columna `league_id` que expone la vista `v_ranking_by_league`, y las
    claves `league_id`/`league_name` del JSON de `get_funny_prediction_stats`;
  - `pool_members.league_points`, puntos de fútbol por pool, que no se renombró.
- **Las vistas** `v_ranking_by_league`/`v_ranking_global` funcionan: Postgres
  sigue los renames por OID.

---

## 2. Inventario de componentes

### 2.1 Genéricos de verdad

No asumen deporte ni en lógica ni en props.

| Componente | Usado por | Nota |
|---|---|---|
| `components/shared/SearchInput.tsx` | LoL (antes también `MatchGrid`) | Tokens de tema. Placeholder por defecto "Buscar por equipo…" |
| `components/shared/NoResults.tsx` | LoL | Tokens. Mensaje por defecto "No hay partidos que coincidan…" |
| `components/shared/SaveAllButton.tsx` | LoL | Tokens |
| `components/ScrollToTopButton.tsx` | Home LoL, admin | |
| `components/CopyButton.tsx` | `/admin/leagues`, `LeagueCard` | |
| `components/ThemeProvider.tsx` | `app/layout.tsx` | Envoltorio de `next-themes` |
| `components/UserDropdown.tsx` | `NavBar` | Paleta a mano, pero sin lógica de deporte |
| `components/ClasificacionToggle.tsx` | `/clasificacion`, `/pruebas` | Alterna podio/tabla. Sin supuestos en la lógica |
| `components/RecordsBoard.tsx` | `/premios` | Pinta tarjetas `AwardCard` genéricas. El contenido futbolero lo pone la página |
| `components/AdminJugadoresManager.tsx` | `/admin/jugadores` | La tabla es genérica. El dato de origen no lo es (§3) |
| `components/ProfileManager.tsx` | `/perfil` | Genérico |

### 2.2 Compartidos en teoría, con supuestos de fútbol enterrados

| Componente | Qué lo delata |
|---|---|
| `components/NavBar.tsx` | Enlaces fijos a rutas de fútbol (`/clasificacion`, `/supuestos` con la etiqueta `nav.miMundial`, `/selecciones`, `/ligas`, `/premios`, `/reglas`). **No hay enlace a `/lol/clasificacion`.** El logo sigue con `alt="PollaMundialista"` (l.43 y l.53). "Inicio" (`/`) es ahora el calendario de LoL |
| `components/MobileMenu.tsx` | Misma lista fija (`NAV_LINKS`, l.15-23), con ⚽ Mi Mundial y 🌍 Selecciones |
| `components/Footer.tsx` | Enlaces externos de fútbol (`dataredonda.com/simulador-mundial`, l.30, y un enlace FIFA) |
| `components/AuthForm.tsx` | El registro pide selección favorita: `import { SELECCIONES } from '@/utils/data/selecciones'` (l.5), `t('auth.seleccion')` (l.122) |
| `components/LeagueSelector.tsx` | Selector de ámbito de `/clasificacion`. Guarda en `profiles.last_viewed_league_id` vía `setLastViewedLeague`. Sin noción de edición |
| `components/LeagueCard.tsx`, `LeagueManager.tsx`, `LeaveLeagueButton.tsx` | Gestión de "ligas privadas". Crean y listan pools sin edición ni deporte. Los textos i18n hablan de "ligas" |
| `components/PodiumTop3.tsx` | Visualmente genérico, pero se invoca con "🏆 ¡Tenemos campeón del Mundial!" y depende de `FINAL_MATCH_ID = 104` en la página |
| `components/AdminSubNav.tsx` | Pestaña "⚽ Partidos" en `/admin` = fútbol. LoL es una pestaña más ("⚔️ LoL", l.13) |
| `components/shared/*` | Genéricos, pero los textos por defecto (`'Buscar por equipo…'`, `'No hay partidos…'`) están fijos en español, fuera del sistema i18n |

### 2.3 Exclusivos de fútbol

| Componente | Usado por | Supuestos |
|---|---|---|
| `components/MatchCard.tsx` (580 líneas) | `/jugador/[id]` | Goles 0-99, empate y "quién pasa por penaltis" (`advancing` ×63), `stage`, grupo, estadio, árbitro, banderas con `getFlagUrl` |
| `components/MatchGrid.tsx` | **Nadie (huérfano)** | Era el home de fútbol. Agrupa por `group_letter` |
| `components/SimuladorClient.tsx` | `/supuestos` | Simulador de grupos del Mundial |
| `components/AdminMatchManager.tsx` (753 líneas) | `/admin` | Crear/editar partidos de fútbol con `stage`, grupo, estadio, árbitro, `advancing_team_id` |
| `components/AdminPredictionsEditor.tsx` | `/admin/predicciones` | Predicciones de fútbol con penaltis |
| `components/RemindersView.tsx` | `/admin/recordatorios` | Agrupa por `stage`/`group_letter`, banderas |
| `components/AdminFunnyStats.tsx` | `/admin/stats` | Goles, confederaciones, ranking FIFA |
| `components/PodiumTestToggle.tsx` | `/admin` | Interruptor de prueba del podio del Mundial |
| `components/GamesDropdown.tsx` | **Nadie (huérfano)** | Enlaces a simuladores externos |
| `utils/getFlagUrl.ts`, `utils/data/selecciones.ts` | Varios | Banderas y catálogo de selecciones |

### 2.4 Exclusivos de LoL (`components/lol/*`)

Todos usan tokens de tema y ninguno usa i18n; los textos están en español
directamente en el código.

| Componente | Función |
|---|---|
| `LolCalendar.tsx` | Calendario de una edición: búsqueda, borradores, guardar todo, bloqueo por hora |
| `LolMatchCard.tsx` | Tarjeta de serie (Bo1/Bo3/Bo5) con slider, reparto de votos y resultado |
| `SeriesSlider.tsx`, `SliderHelp.tsx` | Selector de resultado de la serie y su ayuda |
| `VoteBreakdown.tsx` | Porcentajes de voto (solo después de votar; lo garantiza la BD) |
| `TeamLogo.tsx` | Logo con respaldo (`teams.logo_url`) |
| `EditionSelector.tsx` (+ `HistoryLink`) | Selector de edición activa. Recibe `basePath` |
| `PoolSelector.tsx` | Selector de ámbito (Global + pools de la edición) |
| `PredictionsProgressCard.tsx`, `RankingTop5Card.tsx` | Barra lateral del calendario. `RankingTop5Card` es **el único enlace a `/lol/clasificacion`** |
| `AdminLolResults.tsx` | Admin de resultados |
| `ComingSoon.tsx` | Pantalla "Próximamente" |
| `format.ts`, `saveErrors.ts` | Formato de fecha y marcador, textos de error de guardado |

Lógica pura en `utils/lol/series.ts` (formato Bo, resultados válidos,
puntuación de serie, bloqueo) y tipos en `utils/lol/types.ts`.

---

## 3. Server Actions y RPCs

### 3.1 Server Actions

| Acción | Archivo | Clasificación | Estado |
|---|---|---|---|
| `login`, `signup` | `app/(auth)/login/actions.ts` | G, con supuestos F | ⚠️ El registro guarda la selección favorita |
| `signOutAction` | `app/(main)/perfil/actions.ts` | G | ✅ |
| `createLeagueAction`, `joinLeagueAction`, `getLeagueMembersAction`, `kickMemberAction`, `leaveLeagueAction` | `app/(main)/ligas/actions.ts` | G, sin edición | ✅ Usan `pools`/`pool_members`. ⚠️ `createLeagueAction` no asigna `edition_id` ni `club_id` (l.30-37): los pools nuevos no pertenecen a ninguna edición |
| `setLastViewedLeague` | `app/(main)/clasificacion/actions.ts` | F | ✅ Escribe `profiles.last_viewed_league_id` y no valida pertenencia |
| `saveAllPredictionsAction`, `savePredictionAction` | `app/(main)/actions.ts` | F | ❌ Leen `matches.stage` (l.74) y escriben `pred_advancing_team_id`. No validan que el partido sea de fútbol |
| `getPublicMatchPredictions` | `app/(main)/actions.ts` | F | ✅ Ya usa `pool_members`/`pool_id`. ❌ Selecciona `pred_advancing_team_id` |
| `createMatchAction`, `saveMatchResultAction`, `saveAllMatchesAction` | `app/(main)/admin/actions.ts` | F | ❌ Escriben y leen `stage`, `group_letter`, `stadium`, `referee`, `advancing_team_id`. Llaman a `calculate_match_points` (roto) y `record_ranking_snapshot` |
| `updatePlayerPredictionAction` | `app/(main)/admin/actions.ts` | F | ❌ `pred_advancing_team_id`. ⚠️ Recalcula `profiles.total_points` y pone **ese mismo total** en `pool_members.league_points` de todos los pools del jugador (l.390-391), sin distinguir pool ni edición |
| `getFunnyStatsAction`, `getPublicStatsAction` | `app/(main)/admin/actions.ts` | F | ❌ RPC roto |
| `setPlayerHiddenAction`, `setPodiumTestModeAction`, `getAdminAllPredictionsAction` | `app/(main)/admin/actions.ts` | G / F / F | ✅ / ✅ / sin revisar en detalle |
| `syncMatchesAction` | `app/(main)/admin/actions.ts` | F | Código muerto (upsert comentado) |
| `saveLolPredictionsAction` | `app/(main)/lol/actions.ts` | L | ✅ Valida que el partido sea de LoL (`sports.slug`) |
| `setLolPoolAction` | `app/(main)/lol/actions.ts` | L | ✅ Escribe `edition_pool_preferences` (migración pendiente de aplicar) |
| `setLolMatchResultAction`, `setLolMatchStatusAction` | `app/(main)/admin/lol/actions.ts` | L | ✅ Puntúan en TypeScript con el ruleset de la fase. No tocan `profiles.total_points` ni `league_points` |

### 3.2 RPCs y vistas de Supabase

| RPC / vista | Llamado desde | Clasificación | Corregido tras el rename | Estado actual |
|---|---|---|---|---|
| `calculate_match_points` | acciones de admin de fútbol | F | ✅ Solo cambió el paso de pools (25/09) | ❌ **Sigue leyendo `matches.stage` y `advancing_team_id`** (eliminadas el 22/09). La corrección copió la función literal |
| `record_ranking_snapshot` | acciones de admin de fútbol | F | ✅ | ✅ Sin filtro de deporte |
| `get_ranking_movement` | `/clasificacion` | F | ✅ | ✅ Sin filtro de deporte |
| `get_funny_prediction_stats` | `/premios`, `/admin/stats` | F | ✅ Solo pools | ❌ **Lee `m.stage`, `m.group_letter`, `t.fifa_ranking`, `t.confederation`**, eliminadas (ahora en `team_edition_stats` / `phases`) |
| `get_player_stats` | `/clasificacion` | F | No aplica | ⚠️ Agrega **todas** las predicciones terminadas, también las de LoL (una serie 2-1 cuenta como "marcador") |
| `get_daily_mvp` | `/premios` | F | No aplica | ⚠️ Sin filtro de deporte. Día según `America/Mexico_City` |
| `get_admin_player_ranking` | `/admin/jugadores` | G, con supuestos F | No aplica | ⚠️ Igual que el anterior |
| `v_ranking_global` | `/clasificacion`, `/pruebas` | F | Vista (OID) | ⚠️ Ordena por `profiles.total_points`, solo fútbol, de por vida |
| `v_ranking_by_league` | `/clasificacion` | F | Vista (OID) | ✅ Funciona. Expone `league_id` y usa `pool_members.league_points` |
| `get_lol_standings` (+ `lol_standings_at`) | `/lol/clasificacion`, home LoL | L | Nacida con `pools` | ✅ (versión del 27/09 pendiente de aplicar) |
| `get_my_vote_distribution` | home LoL | L | Nacida con `pools` | ✅ |

---

## 4. Estilos y theming

- **Tailwind v4**, configurado solo con CSS. No hay `tailwind.config.*`.
  - `postcss.config.mjs` carga `@tailwindcss/postcss`.
  - `app/globals.css` importa Tailwind y `./styles/theme.css`, activa el modo
    oscuro por clase (`@variant dark (&:where(.dark, .dark *))`), define los
    colores de marca `--color-brand-{blue,cyan,teal,mint,green,accent}` y las
    animaciones del podio.
- **`app/styles/theme.css` no es "de LoL", es genérico.** Declara tokens
  semánticos en `@theme` y los redefine bajo `.dark`:
  - `bg-surface`/`bg-elevated`/`bg-muted`, `text-primary`/`text-muted`,
    `border`, `accent`/`on-accent`, `success`/`warning`/`danger`, `overlay`;
  - `team-a`/`team-b`, colores neutros "izquierda/derecha" de una tarjeta.

  El `body` ya usa `bg-bg-surface text-text-primary`, así que el fondo global
  es tokenizado para todo el sitio.
- **Quién usa qué** (conteo de clases en cada archivo):
  - **Tokens:** todo `components/lol/*`, `components/shared/*`, las páginas de
    LoL (`(home)`, `lol/clasificacion`, sus `loading`/`error`) y
    `admin/lol/page.tsx`. Ninguno usa colores a mano.
  - **Colores a mano:** el resto. Paleta de Tailwind (`gray-*`, `slate-*`,
    `blue-*`, `emerald-*`, `red-*`…) más `brand-*`, con `dark:` manual en cada
    clase. Los casos más grandes: `reglas/page.tsx` (175 clases),
    `AdminMatchManager` (190), `SimuladorClient` (162), `AdminFunnyStats` (156),
    `MatchCard` (133), `ProfileManager` (120), `RemindersView` (120),
    `selecciones/[iso]` (119).
  - **Nada comparte ambos sistemas**, salvo el `body`.
- **Chrome global sin tokens:** `NavBar`, `MobileMenu`, `UserDropdown`,
  `Footer`, `AdminSubNav` y `AuthForm` usan paleta a mano y `brand-*`. Por eso
  las páginas de LoL viven con tokens dentro de un marco que no los usa.
- **No hay theming por deporte.** No existe ningún mecanismo (atributo
  `data-sport`, variables por sección…) para cambiar el acento según el
  deporte. `team-a`/`team-b` son neutros a propósito.
- **i18n:**
  - Fútbol y el chrome usan `useLang`/`tServer` con `locales/{es,en,ro}.json`.
    Las claves son de dominio Mundial (`nav.miMundial`, `reglas.knockout.*`,
    `auth.seleccion`…).
  - LoL no usa i18n: todo su texto está en español en el código.
  - Hay textos sueltos sin i18n también en fútbol: "🏅 Premios" en `NavBar`, y
    los títulos de `premios/page.tsx`.

---

## 5. Cómo entra LoL hoy en la app

1. **Routing.**
   - `/` lo sirve `app/(main)/(home)/page.tsx`, el calendario de LoL. El route
     group `(home)` existe solo para que la página tenga sus propios
     `loading.tsx`/`error.tsx`.
   - El home de fútbol (`app/(main)/page.tsx` con `MatchGrid`) **se eliminó**
     en `20393e2`.
   - `/lol` redirige con un 307 a `/` (`next.config.ts`). El comentario dice
     que es temporal hasta que haya un segundo deporte.
   - El resto de LoL cuelga de `/lol/*`: `clasificacion` e `historial`.
   - Todo lo demás en la raíz es fútbol.
2. **Layout compartido.** Todas las páginas pasan por `app/(main)/layout.tsx`,
   que comprueba la sesión y pinta `NavBar` + `<main max-w-7xl>` + `Footer` +
   `Toaster`. No hay layout por deporte ni `app/(main)/lol/layout.tsx`.
3. **Navegación.**
   - `NavBar`/`MobileMenu` tienen enlaces fijos de fútbol. "Inicio" lleva al
     calendario LoL.
   - El enlace "⚔️ LoL" se quitó al mover LoL a `/`.
   - **`/lol/clasificacion` solo se alcanza desde el enlace de
     `RankingTop5Card`.** "Clasificación" en el menú lleva a la de fútbol.
   - En admin, LoL es una pestaña (`/admin/lol`) junto a las de fútbol.
4. **Cómo se discrimina el deporte.** No hay ningún condicional del tipo
   `if (sport === …)` en componentes compartidos. La separación es por rutas y
   por consultas:
   - LoL busca sus ediciones con
     `competitions … sports!inner(slug) .eq('sports.slug', 'lol')`
     (`getActiveLolEditions`, `lol/data.ts:23`), con la constante
     `LOL_SPORT_SLUG`.
   - Las acciones de LoL validan que el partido pertenezca a LoL
     (`lol/actions.ts:68`, `admin/lol/actions.ts:53`).
   - Fútbol, al revés: **no filtra nunca por deporte ni edición.** Consulta
     `matches`, `teams` y `predictions` enteras. Solo funcionaba porque solo
     había fútbol.
   - La única excepción es el filtro de pools de fútbol que añadí esta semana
     en `/clasificacion` (l.49-51).
5. **Edición.** LoL trabaja siempre con una edición concreta: `?edicion=` en la
   URL, `EditionSelector` y "ediciones activas" según fechas en hora de Madrid.
   Fútbol asume implícitamente el Mundial 2026 (`FINAL_MATCH_ID = 104`,
   `profiles.total_points`).
6. **Pools.**
   - La tabla es común (`pools` con `edition_id`).
   - LoL solo muestra pools de la edición. Fútbol solo muestra pools cuya
     edición sea de fútbol.
   - La preferencia de ámbito está separada: `profiles.last_viewed_league_id`
     para fútbol y `edition_pool_preferences` para LoL.
   - **No hay interfaz para crear un pool de LoL.** `/ligas` crea pools sin
     edición, y los pools de LoL existentes vienen del seed
     (`supabase/seeds/lol_test_edition.sql`).
7. **Puntos.**
   - Fútbol acumula en `profiles.total_points` y `pool_members.league_points`
     (calculados por RPC).
   - LoL guarda `predictions.points_earned` por serie y calcula el resto (plenos,
     orden) al leer, con `get_lol_standings`. No toca los acumulados de fútbol.

---

## 6. Valoración honesta

La escribo como autor de la parte de LoL y del arreglo de referencias.

### Reutilizable sin fricción para más deportes

- **El patrón completo de LoL** es la plantilla más sana del repo:
  - `app/(main)/lol/data.ts` concentra la carga de datos con errores
    controlados (`LolDataError`), filtra por `sports.slug` y edición, y la
    comparten la página y el Top 5;
  - `utils/lol/series.ts` es lógica pura, sin React ni Supabase, que lee el
    ruleset;
  - los componentes solo usan tokens.

  Casi nada es realmente "de LoL" salvo el formato Bo1/3/5 y los logos.
  `EditionSelector.tsx` y `PoolSelector.tsx` son genéricos (reciben
  `basePath` y `editionId`). `RankingTop5Card`, `PredictionsProgressCard`,
  `VoteBreakdown`, `TeamLogo` y `ComingSoon` también, solo que están en la
  carpeta `lol/`.
- **`get_lol_standings`/`lol_standings_at`** solo son "de LoL" por el nombre y
  por las reglas de jornada. Reciben edición y pool, y leen los puntos del
  ruleset. Con otro nombre y otro juego de claves del ruleset servirían para
  cualquier deporte por edición.
- **`components/shared/*`, `app/styles/theme.css`, `ThemeProvider`,
  `ScrollToTopButton`, `CopyButton`, `RecordsBoard`, `ClasificacionToggle`,
  `ProfileManager`**: sirven tal cual. `PodiumTop3` también, si se le pasa el
  título y la condición de "torneo terminado" desde fuera.
- **`proxy.ts`, `utils/supabase/*`, `LangContext`**: el sistema i18n es
  genérico; lo que hay que revisar son las claves, no el mecanismo.

### Habría que reescribir porque arrastran el diseño del Mundial

- **La navegación: `components/NavBar.tsx`, `components/MobileMenu.tsx`,
  `components/AdminSubNav.tsx`.** Son listas fijas de rutas de fútbol. Hoy
  "Inicio" es LoL y "Clasificación" es fútbol, que es exactamente la
  sensación de "encajado". Necesitan una noción de "sección de deporte" o
  edición activa, no más enlaces.
- **La estructura de rutas de fútbol en la raíz.** `/clasificacion`,
  `/supuestos`, `/selecciones`, `/premios`, `/reglas` deberían colgar de su
  deporte, igual que `/lol/*`. Mientras fútbol ocupe la raíz, cualquier
  deporte nuevo será un invitado.
- **`app/(main)/clasificacion/page.tsx`**: global de por vida
  (`profiles.total_points`), `FINAL_MATCH_ID = 104`, estadísticas sin filtrar
  deporte, `any` por todas partes. Mejor rehacerla sobre el modelo de
  `/lol/clasificacion` (por edición) que adaptarla.
- **`app/(main)/jugador/[id]/page.tsx` + `components/MatchCard.tsx`**: el
  perfil público es "predicciones de fútbol" y hoy está roto por columnas
  eliminadas. La clasificación de LoL enlaza aquí. Debería ser un perfil
  genérico con una sección por deporte o edición. `MatchCard` (580 líneas con
  penaltis y `advancing`) es irrecuperable como pieza genérica; como tarjeta
  solo de fútbol, necesita migrar a `phases`/`metadata`.
- **Todo el admin de fútbol** (`AdminMatchManager`, `AdminPredictionsEditor`,
  `RemindersView`, `app/(main)/admin/actions.ts`): está atado a `stage`,
  `group_letter` y `advancing_team_id`, que ya no existen. Hay que reescribirlo
  en cualquier caso. `AdminLolResults` es un mejor punto de partida para un
  admin por edición.
- **`calculate_match_points` y el modelo de acumulados**
  (`profiles.total_points`, `pool_members.league_points`, y
  `updatePlayerPredictionAction` copiando el total global a todos los pools):
  es incompatible con varias ediciones. LoL ya demostró que se puede calcular
  al leer por edición.
- **`/ligas` y `app/(main)/ligas/actions.ts`**: crean pools sin edición. Con
  el modelo actual (pool = liga de una edición, club = grupo persistente) la
  pantalla debería ser de clubs y pools por edición.
  - **Regresión mía que conviene saber:** desde el filtro que añadí esta semana
    en `/clasificacion`, un pool nuevo creado en `/ligas` (con
    `edition_id = NULL`) **ya no aparece en el selector de fútbol**. Antes sí
    aparecía. Los pools existentes no se ven afectados, porque el 22/09 se les
    asignó la edición del Mundial.
- **`/premios`, `/admin/stats` y el RPC `get_funny_prediction_stats`**:
  diseñados alrededor de goles, confederaciones y ranking FIFA. No tienen
  equivalente directo en LoL; si se quieren premios por deporte, habría que
  diseñarlos por deporte.
- **`/selecciones`, `/selecciones/[iso]`, `/supuestos` (`SimuladorClient`),
  `utils/getFlagUrl.ts`, `utils/data/selecciones.ts`, el campo de selección
  favorita en `AuthForm`**: son contenido del Mundial. No hay nada que
  generalizar: o se mueven a la sección de fútbol y se migran a
  `team_edition_stats`/`phases`, o se archivan.
- **Estilos:** todo lo de fútbol y el chrome global usan paleta a mano con
  `dark:` en cada clase. No hace falta reescribirlo de golpe, pero cualquier
  componente de fútbol que se toque debería pasar a tokens. Si no, el sitio
  seguirá viéndose como dos apps.
- **Código muerto a retirar:** `components/MatchGrid.tsx` y
  `components/GamesDropdown.tsx` (huérfanos), `app/(main)/pruebas/page.tsx`,
  `syncMatchesAction`.

### Lo que yo haría primero, en orden de dependencia (sin compromiso)

1. Decidir la estructura de URLs por deporte o edición: `/[deporte]/…` o
   `/[competicion]/[edicion]/…`, y qué es `/`.
2. Rehacer la navegación a partir de esa estructura.
3. Llevar fútbol a su sección y reescribir su capa de datos contra
   `phases`/`metadata`/`team_edition_stats`, empezando por puntuación y admin,
   que son los bloqueantes.
4. Hacer genérico lo que ya lo es en la práctica: sacar de `components/lol/`
   `EditionSelector`, `PoolSelector`, `RankingTop5Card`,
   `PredictionsProgressCard` y `ComingSoon`, y renombrar
   `get_lol_standings`.
