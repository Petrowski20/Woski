# Auditoría técnica — Woski / PollaMundialista 2026

> Documento generado como radiografía del estado actual del proyecto, de cara a planificar su evolución hacia una plataforma genérica de predicciones deportivas/esports. No incluye propuestas de arquitectura ni cambios de código.

---

## 1. Información general

- **Framework**: Next.js `^16.2.6` (App Router). El `AGENTS.md` del repo advierte explícitamente que **no es el Next.js "clásico"** — hay cambios de convención respecto a versiones anteriores (por ejemplo, el archivo de interceptación de requests se llama `proxy.ts` en la raíz, no `middleware.ts`).
- **Lenguaje**: TypeScript estricto (`strict: true` en `tsconfig.json`) en todo el proyecto. No hay JavaScript salvo configs (`*.config.mjs`, `*.config.ts`).
- **Gestor de paquetes**: npm (hay `package-lock.json`; no hay `yarn.lock` ni `pnpm-lock.yaml`).
- **Runtime de scripts**: `tsx` para el script de seed (`npm run seed`).
- **React**: 19.2.4 (última mayor).
- **Estilos**: Tailwind CSS v4 (vía `@tailwindcss/postcss`), sin librería de componentes tipo shadcn/ui — los componentes UI están escritos a mano.
- **Backend/BD**: Supabase (`@supabase/supabase-js` + `@supabase/ssr`) — Postgres + Auth + Storage. No hay servidor propio; toda la lógica de servidor vive en Server Actions y Route Handlers de Next.js.
- **Estado global**: no hay Zustand/Redux/TanStack Query. El único Context de React es `LangContext` (i18n). El resto del estado se resuelve con Server Components + Server Actions + `revalidatePath`, y estado local de componente (`useState`) en los `'use client'`.
- **Temas**: `next-themes` para modo claro/oscuro.
- **Notificaciones**: `sonner` (toasts).
- **Exportación de imágenes**: `html-to-image` y `html2canvas` (ambas presentes — posible redundancia, ver sección 10).
- **Iconos**: `lucide-react`.
- **i18n**: sistema propio (no `next-intl` ni similar) basado en JSON (`locales/es.json`, `en.json`, `ro.json`) + cookie `pm_lang` + Context de cliente.

---

## 2. Árbol de carpetas

```
pollamundialista/
├── AGENTS.md / CLAUDE.md          # instrucciones para agentes IA
├── README.md                      # README genérico de create-next-app (no actualizado)
├── next.config.ts
├── proxy.ts                       # equivalente al middleware.ts clásico (auth gate)
├── tsconfig.json / eslint.config.mjs / postcss.config.mjs
├── package.json
├── reporte_mundial.json           # export de datos de prueba (dump manual, no usado por la app)
│
├── app/
│   ├── layout.tsx                 # root layout: fuente, ThemeProvider, LangProvider
│   ├── not-found.tsx
│   ├── globals.css
│   ├── icon.svg
│   │
│   ├── (auth)/
│   │   └── login/
│   │       ├── page.tsx
│   │       └── actions.ts         # login, signup
│   │
│   ├── (main)/                    # todo lo que requiere sesión (gate en layout.tsx)
│   │   ├── layout.tsx             # Navbar + Footer + Toaster + auth check
│   │   ├── actions.ts             # predicciones del usuario
│   │   ├── page.tsx                # home / partidos
│   │   ├── admin/
│   │   │   ├── layout.tsx / page.tsx / actions.ts   (582 líneas — el más grande)
│   │   │   ├── jugadores/page.tsx
│   │   │   ├── leagues/page.tsx
│   │   │   ├── predicciones/page.tsx
│   │   │   ├── recordatorios/page.tsx
│   │   │   └── stats/page.tsx
│   │   ├── clasificacion/ (page.tsx, actions.ts)
│   │   ├── jugador/[id]/page.tsx
│   │   ├── ligas/ (page.tsx, actions.ts, loading.tsx)
│   │   ├── perfil/ (page.tsx, actions.ts)
│   │   ├── premios/page.tsx
│   │   ├── reglas/page.tsx
│   │   ├── selecciones/ (page.tsx, [iso]/page.tsx)
│   │   └── supuestos/ (page.tsx, loading.tsx)   # "simulador" de bracket
│   │
│   └── api/
│       └── export/route.ts        # export JSON admin-only (profiles/matches/predictions)
│
├── components/                    # 26 componentes, sin subcarpetas (estructura plana)
│   ├── Admin*.tsx (5)             # AdminFunnyStats, AdminJugadoresManager, AdminMatchManager,
│   │                               #  AdminPredictionsEditor, AdminSubNav
│   ├── Auth/Nav/UI genéricos      # AuthForm, NavBar, MobileMenu, UserDropdown, Footer, etc.
│   ├── League*.tsx                # LeagueCard, LeagueManager, LeagueSelector, LeaveLeagueButton
│   ├── Match*.tsx                 # MatchCard, MatchGrid
│   ├── SimuladorClient.tsx        # bracket interactivo de eliminatorias (619 líneas)
│   ├── RecordsBoard.tsx, RemindersView.tsx, ProfileManager.tsx, GamesDropdown.tsx
│   └── ThemeProvider.tsx, ScrollToTopButton.tsx, CopyButton.tsx
│
├── contexts/
│   └── LangContext.tsx            # único Context de la app (i18n)
│
├── locales/ (es.json, en.json, ro.json)  # ~347 claves cada uno
│
├── utils/
│   ├── supabase/ (client.ts, server.ts, middleware.ts)
│   ├── data/selecciones.ts
│   ├── getFlagUrl.ts
│   └── i18n-server.ts
│
├── scripts/
│   ├── seed.ts                    # seed de equipos/jugadores vía service role
│   └── data/ (teams.json, bracket.json, annex_c.json, players/<iso>.json × 51)
│
├── supabase/
│   ├── config.toml
│   └── migrations/ (27 archivos SQL, 2026-05-25 → 2026-07-02)
│
└── public/ (svgs sueltos, sin branding propio salvo logo.svg/titulo.svg)
```

---

## 3. Arquitectura

**Patrón general**: App Router de Next.js con Server Components por defecto y Server Actions (`'use server'`) para toda mutación. No hay una capa de API REST/GraphQL propia más allá de un único Route Handler (`/api/export`) pensado para exportar un dump de datos, no como API de aplicación.

**Grupos de rutas**: dos route groups, `(auth)` y `(main)`, sin prefijo de URL. `(main)/layout.tsx` hace de guardia de autenticación a nivel de layout (Server Component que llama a `supabase.auth.getUser()` y redirige a `/login` si no hay sesión), duplicando parcialmente lo que ya hace `proxy.ts` a nivel de request.

**Comunicación entre páginas**: no hay fetching cliente (no TanStack Query, no SWR). Cada página es un Server Component que consulta Supabase directamente en el propio archivo `page.tsx`, pasa los datos como props a componentes cliente (`'use client'`) para la parte interactiva, y las mutaciones se hacen con Server Actions que llaman `revalidatePath()` para refrescar la caché de Next y re-renderizar. El patrón es consistente en todo el proyecto: **page.tsx (fetch) → componente cliente (interacción) → actions.ts (mutación) → revalidatePath**.

**Componentes**: carpeta plana sin subcarpetas por dominio ni separación ui/ vs feature/. Los nombres siguen el dominio de negocio (`AdminMatchManager`, `LeagueCard`, `MatchCard`) en vez de ser genéricos. Varios componentes son grandes y concentran mucha lógica de UI + validación + llamadas a Server Actions en un solo archivo (`AdminMatchManager.tsx` 755 líneas, `SimuladorClient.tsx` 619, `MatchCard.tsx` 580, `AdminFunnyStats.tsx` 550).

**Hooks**: no hay carpeta `hooks/` ni hooks custom reutilizables — toda la lógica de estado vive inline en cada componente cliente con `useState`/`useCallback`. El único hook reutilizable es `useLang()` de `LangContext`.

**Lib/Utilidades**: no hay carpeta `lib/`. Las utilidades están repartidas en `utils/` (clientes Supabase, i18n server-side, flags, datos de selecciones estáticos) y son pocas y específicas — no hay una capa de "dominio" (helpers de scoring, validadores, formateadores) extraída del código de UI o de las Server Actions.

**Providers**: solo dos, ambos en el root layout: `ThemeProvider` (next-themes) y `LangProvider` (contexto propio). No hay provider de sesión de Supabase en cliente (el estado de auth se resuelve siempre en servidor).

**Middleware**: existe una **duplicación**: `proxy.ts` (raíz, es el que Next.js realmente ejecuta en esta versión) y `utils/supabase/middleware.ts` (exporta `updateSession`, con lógica casi idéntica) — este segundo archivo no está importado por nadie (ver sección 10, código muerto). La lógica activa (`proxy.ts`) protege todas las rutas excepto `/login`, valida el token contra Supabase Auth en cada request y limpia cookies `sb-*` si la sesión es inválida.

**Layouts**: 4 niveles — root (`app/layout.tsx`, fuente/tema/idioma), `(main)/layout.tsx` (navbar/footer/gate de auth), `(main)/admin/layout.tsx` (sub-navegación de admin). No hay verificación de rol `ADMIN` en el layout de `/admin` — la protección de rol se hace página por página / action por action, no de forma centralizada (ver sección 9).

**Gestión del estado**: sin store global. El estado "de servidor" vive en Postgres y se refresca vía Server Actions + `revalidatePath`; el estado de UI es local a cada componente cliente. El idioma es la única pieza de estado verdaderamente "global" en cliente, vía Context + cookie.

**Gestión de autenticación**: Supabase Auth con email/password (`signInWithPassword`, `signUp`). El registro dispara un trigger de Postgres (`handle_new_user`) que crea automáticamente la fila en `profiles` a partir de `raw_user_meta_data` (nickname, birth_date). Hay validación de edad mínima (16 años) en el Server Action de signup, y una comprobación best-effort de nickname duplicado antes de crear el usuario (con manejo del caso de carrera vía el mensaje de error de Postgres).

---

## 4. Base de datos (Supabase / Postgres)

> Reconstruido a partir de las 27 migraciones en `supabase/migrations/`. **Importante**: se detectó al menos un caso de columnas usadas por la aplicación (`matches.stadium`, `matches.referee`) que **no existen en ninguna migración** — ver nota al final de esta sección y sección 10.

### Enums
- `user_role`: `USER | ADMIN`
- `request_status`: `PENDING | APPROVED | REJECTED`
- `group_letter`: `A`…`L` (12 grupos — específico del formato de 48 equipos del Mundial 2026)
- `match_stage`: `GROUP | ROUND_OF_32 | ROUND_OF_16 | QUARTER_FINAL | SEMI_FINAL | THIRD_PLACE | FINAL`
- `match_status`: `PENDING | IN_PROGRESS | FINISHED | CANCELLED`
- `player_position`: `GK | DF | MF | FW`

### Tablas

**`teams`** — catálogo de selecciones nacionales.
- PK: `id` (serial)
- Columnas: `name`, `iso_code` (unique), `group_letter` (nullable, solo fase de grupos), `flag_emoji`, estadísticas de grupo (`matches_played`, `wins`, `draws`, `losses`, `goals_for`, `goals_against`, `points`, `goal_difference` generada), `is_eliminated`, y (añadidas después) `fifa_ranking`, `manager`, `confederation`, `world_cups_won`, `last_wc_result` (renombrada desde `best_wc_result`), `seudonimo`.
- Muy acoplada al Mundial: `group_letter` de tipo enum fijo A-L, estadísticas de "fase de grupos" como columnas de primer nivel en vez de derivarse de `matches`.

**`matches`** — partidos del torneo.
- PK: `id` (smallserial)
- FKs: `home_team_id`, `away_team_id`, `winner_id`, `advancing_team_id` → `teams.id`
- Columnas: `match_date`, `stage`, `group_letter` (solo si `stage = GROUP`), `matchday`, `status`, `home_goals`, `away_goals`, `updated_at`.
- Checks: equipos distintos, `group_letter` solo en fase de grupos, goles no negativos.
- Índices: `match_date`, `stage`.
- **Nota**: el código de aplicación (`app/(main)/admin/actions.ts::createMatchAction`, `app/api/export/route.ts`) lee/escribe columnas `stadium` y `referee` que no aparecen en ninguna migración → indicio de **drift entre el esquema versionado y el esquema real desplegado**.

**`favorite_clubs`** — catálogo de clubes de fútbol (no selecciones) para el perfil de usuario ("¿de qué equipo eres?"). Genérico, no específico del Mundial.

**`private_leagues`** — ligas privadas creadas por usuarios.
- PK: `id`, FK `created_by` → `auth.users`.
- `join_code` (varchar(8), unique) generado en aplicación con alfabeto sin ambigüedad visual.
- `triple_rule_enabled`: activa/desactiva el bonus "triple" por liga.

**`invitations`** — invitaciones por email a una liga privada, con expiración a 7 días. No se ha visto código de aplicación que las consuma activamente (ver sección 10).

**`profiles`** — 1:1 con `auth.users` (PK = FK a `auth.users.id`, `ON DELETE CASCADE`).
- `nickname` (unique), `role` (enum, default `USER`), `birth_date`, `city`, `favorite_club_id`, `invitation_id`, `total_points` (suma global, desnormalizada), `avatar_url`, `last_viewed_league_id`, `is_hidden` (excluir de rankings públicos), `created_at`.
- Índice: `total_points DESC` (ranking global).

**`profile_leagues`** — tabla puente usuario↔liga (PK compuesta).
- `league_points` (desnormalizado, análogo a `profiles.total_points` pero por liga).

**`join_requests`** — formulario público de solicitud de acceso (email, nickname sugerido, mensaje, liga preferida, estado). Tabla desconectada del resto del modelo (no hay FK), pensada como buzón de entrada manual para el admin.

**`predictions`** — núcleo del dominio.
- PK: `id`; FKs: `profile_id` → `profiles` (cascade), `match_id` → `matches`, `pred_winner_id` / `pred_advancing_team_id` → `teams`.
- `pred_home_goals`, `pred_away_goals` (obligatorios, ≥0), `points_earned` (calculado por RPC), `triple_bonus` (boolean, **nunca escrito por ninguna función** — ver sección 10), `updated_at`.
- Constraint único `(profile_id, match_id)`: una predicción por partido y usuario.
- Índices: `match_id`, `profile_id`.

**`players`** — plantilla convocada por equipo (info editorial, no juego).
- FK `team_id` → `teams` (cascade). Datos pre-torneo: `caps`, `intl_goals`, `club`, medidas físicas, `transfermarkt_id`.

**`ranking_snapshots`** — historial de posición en el ranking, una fila por `(match_id, profile_id, league_id NULL|liga)`, usada para calcular el "movimiento" (sube/baja) tras cada jornada. Rellenada por la función `record_ranking_snapshot()`.

### Vistas
- `v_ranking_global` — ranking global, excluye `is_hidden`, con desempates (`exact_scores`, `correct_signs`, `goal_diff_sum`, `created_at`).
- `v_ranking_by_league` — mismo cálculo particionado por liga.
- `v_match_predictions` — predicciones de un partido + nickname (para calcular el triple).

Ambas vistas de ranking se han recreado **7 veces** a lo largo del historial de migraciones (evolución incremental: añadir `avatar_url`, cambiar `position` calculada en DB → calculada en frontend, añadir desempates, excluir ocultos). Es la pieza de esquema más inestable del proyecto.

### Funciones / RPCs (todas `SECURITY DEFINER`)
- `calculate_match_points(match_id, home_goals, away_goals)` — corazón del sistema de puntuación; reescrita **4 veces** (ver sección 5).
- `record_ranking_snapshot(match_id)` / `get_ranking_movement(league_id)`.
- `get_player_stats()` — estadísticas agregadas por jugador (aciertos exactos/diferencia/signo/fallos), calculadas comparando goles reales vs. predichos (no `points_earned`, para ser inmune a cambios de puntuación).
- `get_admin_player_ranking()` / `get_daily_mvp(limit)` — ranking administrativo y "MVP del día", con lógica de "día" anclada a zona horaria `America/Mexico_City` (sede del Mundial 2026) — **fuertemente específico del evento**.
- `get_funny_prediction_stats(league_id)` — estadísticas "divertidas" muy elaboradas (rachas de acierto/fallo, apuestas a underdogs por ranking FIFA, rendimiento por confederación, minutos de antelación al pronosticar, etc.), devuelve un JSONB agregado por jugador. Es, con diferencia, la función más compleja del proyecto (268 líneas) y ha tenido 4 versiones.
- `handle_new_user()` — trigger `AFTER INSERT ON auth.users` que crea el `profile` correspondiente.

### Storage
- Bucket `avatars` (público, límite 5 MB, solo `image/jpeg|png|webp`).

### RLS (Row Level Security)
Activado en `teams`, `matches`, `profiles`, `predictions`, `profile_leagues`, `private_leagues`, `players`. Detalle en sección 9.

### Diagrama de relaciones

```
auth.users (Supabase Auth)
└── profiles (1:1, ON DELETE CASCADE)
     ├── favorite_clubs (N:1, favorite_club_id)
     ├── invitations (N:1, invitation_id — quién lo invitó)
     ├── private_leagues (N:1, last_viewed_league_id — preferencia de vista)
     ├── predictions (1:N, ON DELETE CASCADE)
     │     ├── matches (N:1)
     │     │     ├── teams (N:1, home_team_id)
     │     │     ├── teams (N:1, away_team_id)
     │     │     ├── teams (N:1, winner_id, nullable)
     │     │     └── teams (N:1, advancing_team_id, nullable — penaltis/prórroga)
     │     ├── teams (N:1, pred_winner_id, nullable)
     │     └── teams (N:1, pred_advancing_team_id, nullable)
     ├── profile_leagues (1:N, ON DELETE CASCADE) ── private_leagues (N:1)
     │     └── private_leagues.created_by (1:N, quién creó la liga)
     └── ranking_snapshots (1:N) ── matches (N:1) / private_leagues (N:1, nullable)

teams
└── players (1:N, ON DELETE CASCADE)

join_requests            (sin FKs — buzón desconectado)
```

### Tablas demasiado específicas del Mundial

| Tabla / columna | Por qué es específica del Mundial 2026 |
|---|---|
| `teams.group_letter` (enum `A`-`L`) | Asume 12 grupos fijos (formato de 48 equipos). Un torneo de esports o una liga de 20 equipos no encaja. |
| `teams.world_cups_won`, `teams.last_wc_result` | Campos editoriales atados 100% al histórico de Mundiales de fútbol. |
| `matches.group_letter`, `matches.matchday` | Mismo problema de formato fijo. |
| `match_stage` enum | Fases codificadas como `ROUND_OF_32`/`QUARTER_FINAL`/etc., específicas del bracket de un Mundial de 48 equipos; no generalizable a ligas de temporada regular o brackets de esports con formatos distintos. |
| `players.caps`, `players.intl_goals` | "Caps" (partidos con la selección) es terminología de fútbol de selecciones, no aplica a clubes ni a esports. |
| Zona horaria hardcodeada `America/Mexico_City` en `get_admin_player_ranking`/`get_daily_mvp` | Sede fija del Mundial 2026; cualquier otra competición necesitaría esto parametrizado. |
| `favorite_clubs` | Concepto específico de fútbol (club favorito), no generalizable directamente a otros deportes. |

---

## 5. Flujo de la aplicación

1. **Registro**: el usuario rellena el formulario de signup (`AuthForm` → `signup` Server Action) con email, contraseña, nickname, fecha de nacimiento y equipo favorito opcional. Se valida edad mínima (16 años) y unicidad de nickname antes de llamar a `supabase.auth.signUp`. Un trigger de base de datos crea automáticamente el `profile`.
2. **Login**: `AuthForm` → `login` Server Action → `signInWithPassword`. `proxy.ts` protege el resto de la app: sin sesión válida, redirige a `/login`.
3. **Creación de liga**: desde `/ligas`, el usuario crea una liga privada (`createLeagueAction`); se genera un `join_code` de 6 caracteres sin ambigüedad visual, se inserta la liga y se inscribe automáticamente al creador como miembro (con rollback manual si falla la inscripción).
4. **Unirse a una liga**: el usuario introduce un `join_code` (`joinLeagueAction`), que resuelve el `league_id` y crea la fila en `profile_leagues`.
5. **Hacer una predicción**: en la home (`page.tsx` + `MatchGrid`/`MatchCard`), el usuario introduce marcador (y, en eliminatorias, quién clasifica) para partidos aún no comenzados. `savePredictionAction`/`saveAllPredictionsAction` hacen upsert en `predictions`; la RLS impide insertar/editar si `match.match_date <= now()`.
6. **Consultar clasificación**: `/clasificacion` lee `v_ranking_global` o `v_ranking_by_league` (según preferencia guardada en `profiles.last_viewed_league_id`), con desempates por aciertos exactos, aciertos de signo y suma de error de gol.
7. **Cierre de jornada / cálculo de puntos**: el admin, desde `/admin`, introduce el resultado real de un partido (`saveMatchResultAction`/`saveAllMatchesAction`), que invoca el RPC `calculate_match_points`. Este marca el partido `FINISHED`, puntúa todas las predicciones asociadas y recalcula `profiles.total_points` y `profile_leagues.league_points` de los usuarios afectados.
8. **Cálculo de puntos (detalle del algoritmo actual, v3 "Ganador Absoluto")**:
   - Fase de grupos: 1X2 (signo) correcto → 1 pt; + diferencia de goles exacta → 2 pts; + marcador exacto → 3 pts. Fallar el signo → 0.
   - Eliminatorias: primero se determina el "ganador absoluto" real (por goles en 90' o, si hay empate, por `advancing_team_id` registrado a mano por el admin); si el usuario falla quién clasifica → 0 pts sin importar el marcador; si acierta, se gradúa igual que en grupos (1/2/3 pts) sobre el resultado en 90 minutos.
   - El "triple bonus" (contrarian bonus, +1 si acertaste una predicción minoritaria) está modelado en el esquema (`predictions.triple_bonus`, `private_leagues.triple_rule_enabled`) pero **no hay ninguna función que lo calcule** actualmente (ver sección 10).
9. Tras cada `calculate_match_points`, opcionalmente se llama `record_ranking_snapshot` para congelar la posición de cada jugador y poder mostrar movimiento (sube/baja) en la clasificación.

---

## 6. Modelo de dominio

| Entidad | Qué representa |
|---|---|
| **Usuario / Perfil** (`profiles`) | Cuenta de la app, 1:1 con la identidad de Supabase Auth. Lleva puntos globales, rol (`USER`/`ADMIN`), y preferencias (idioma vía cookie, última liga vista, visibilidad en ranking). |
| **Liga privada** (`private_leagues`) | Grupo cerrado de usuarios que compiten entre sí con un subranking propio; se accede por código de invitación. |
| **Membresía** (`profile_leagues`) | Relación usuario↔liga con puntos acumulados dentro de esa liga. |
| **Equipo** (`teams`) | Selección nacional participante, con metadatos editoriales (ranking FIFA, confederación, historial) y estadísticas de grupo. |
| **Jugador (convocado)** (`players`) | Ficha de un futbolista de la plantilla de un equipo — puramente informativa/editorial, no interactúa con el sistema de puntos. |
| **Partido** (`matches`) | Evento deportivo entre dos equipos, con fase, fecha, resultado real y (en eliminatorias) equipo clasificado. |
| **Predicción** (`predictions`) | Pronóstico de un usuario para un partido concreto: marcador (y clasificado, si aplica en eliminatorias) más los puntos obtenidos. |
| **Solicitud de acceso** (`join_requests`) | Formulario público de interesados en unirse a la polla, gestionado manualmente por el admin. |
| **Invitación** (`invitations`) | Invitación nominal por email a una liga concreta, con expiración. |
| **Snapshot de ranking** (`ranking_snapshots`) | Fotografía de la posición de cada usuario tras cada jornada, usada para mostrar tendencia (sube/baja). |
| **Club favorito** (`favorite_clubs`) | Dato de perfil de usuario ("de qué equipo eres"), no forma parte del torneo. |

En términos de "modelo de predicciones deportivas" genérico, las piezas centrales y reutilizables son: **Usuario, Liga, Membresía, Predicción**. Las piezas fuertemente acopladas al Mundial son: **Equipo (selección), Jugador (convocatoria), Partido (fases fijas de bracket de 48 equipos)**.

---

## 7. Integraciones externas

- **Supabase Auth** — email/password, sesión gestionada vía cookies `sb-*` (SSR con `@supabase/ssr`), sin OAuth de terceros configurado en el código visto.
- **Supabase Postgres (RPCs/Views/RLS)** — toda la lógica de negocio de servidor (puntuación, rankings, estadísticas) vive en funciones SQL, no en código Node.
- **Supabase Storage** — bucket `avatars`.
- **Supabase Realtime** — no se ha encontrado uso (`match_status.IN_PROGRESS` está definido "por si acaso" para realtime, según comentario en la migración base, pero no hay suscripciones activas en el código).
- **API deportiva externa** — **no integrada realmente**: hay un `TODO` explícito en `syncMatchesAction` (`app/(main)/admin/actions.ts`) con un ejemplo comentado de llamada a `api.football-data.org` usando `FOOTBALL_API_TOKEN`. Hoy la carga de partidos/resultados es 100% manual vía el panel de admin.
- **`ICEBERG_TOKEN`** — aparece como variable de entorno referenciada por el propio entorno de ejecución (no se ha encontrado uso en el código de la aplicación; podría ser una variable de la plataforma de despliegue/tooling, no del dominio de negocio).
- **html-to-image / html2canvas** — generación de imágenes en cliente (p. ej. para compartir predicciones/resultados como imagen), sin backend involucrado.

---

## 8. Variables de entorno

| Variable | Para qué sirve |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase, usada por los tres clientes (browser, server, proxy). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima de Supabase para el cliente con permisos regidos por RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio (bypassa RLS), usada en varias Server Actions/páginas de admin y en el script de seed. Solo debe usarse en servidor. |
| `FOOTBALL_API_TOKEN` | Referenciada (comentada) para una futura integración con una API de resultados de fútbol; no está en uso activo. |
| `ICEBERG_TOKEN` | Presente en el entorno de ejecución; no se ha localizado consumo en el código de la aplicación. |

No se han mostrado valores de ninguna variable.

---

## 9. Seguridad

- **Autenticación**: Supabase Auth (password), validada en cada request por `proxy.ts` vía `getUser()` (llamada real al servidor de Auth, no solo lectura de cookie/JWT local) — patrón correcto y documentado con un comentario explícito de "no colocar lógica entre `createServerClient` y `getUser()`".
- **Autorización de rol ADMIN**: **no está centralizada**. Cada Server Action que requiere rol admin repite el mismo patrón manual (`supabase.auth.getUser()` → `select role from profiles` → comparar `=== 'ADMIN'`), duplicado en `admin/actions.ts`, `ligas/actions.ts`, `api/export/route.ts`, y en varias `page.tsx` de `/admin/*`. No hay un layout o middleware que bloquee `/admin/**` de raíz — la protección depende de que cada archivo nuevo recuerde añadir la comprobación.
- **RLS (Row Level Security)**: activada y usada como mecanismo real de autorización (no solo defensa en profundidad) en `teams`, `matches`, `profiles`, `predictions`, `profile_leagues`, `private_leagues`, `players`. Reglas destacables:
  - Predicciones: cualquiera puede leer todas (necesario para ranking/triple), pero solo se puede insertar/editar la propia y **solo si el partido no ha comenzado** (`match_date > now()` evaluado dentro de la política RLS — la regla de negocio "no puedes predecir un partido ya empezado" vive en la base de datos, no solo en el frontend).
  - `private_leagues`: lectura abierta a cualquier autenticado (necesario para validar `join_code`), inserción solo si `created_by = auth.uid()`.
  - Las funciones RPC sensibles (`calculate_match_points`, `record_ranking_snapshot`, stats) son `SECURITY DEFINER` con `search_path` fijado a `public` (buena práctica contra "search_path hijacking") y `GRANT EXECUTE` explícito solo a `authenticated`. La verificación de que quien llama es admin se delega a la Server Action que invoca el RPC, no al RPC mismo — es decir, el RPC confía en el llamador.
  - Varias Server Actions de admin usan el **cliente con `SUPABASE_SERVICE_ROLE_KEY`** (bypass total de RLS) después de comprobar el rol manualmente — esto es necesario para operaciones cross-usuario (p. ej. tocar `profiles`/`predictions` de otra persona), pero significa que un fallo en la comprobación manual de rol en cualquiera de esos puntos deja una vía de escritura sin restricción de RLS.
- **Protección de rutas**: a nivel de request, `proxy.ts` con matcher que excluye estáticos; a nivel de layout, `(main)/layout.tsx` repite la comprobación de sesión (redundante pero no dañino); a nivel de `/admin`, no hay guardia de layout — solo comprobaciones ad-hoc por página/acción (ver arriba).
- **Storage**: bucket de avatares público, con tipo MIME y tamaño limitados a nivel de configuración del bucket; políticas de INSERT/UPDATE restringidas a `auth.uid() = owner`.

---

## 10. Deuda técnica

- **Drift de esquema**: `matches.stadium` y `matches.referee` se usan en `admin/actions.ts` y `api/export/route.ts` pero no existen en ninguna migración versionada — el esquema real desplegado y las migraciones en el repo no coinciden (o hay una migración faltante en el repo).
- **Autorización de admin duplicada**: el patrón "obtener usuario → leer `profiles.role` → comparar con `'ADMIN'`" está copiado y pegado en al menos 8 sitios distintos (Server Actions y páginas), en vez de estar centralizado en un helper o en el layout de `/admin`.
- **Middleware duplicado / código muerto**: `utils/supabase/middleware.ts` (`updateSession`) reimplementa casi exactamente la misma lógica que `proxy.ts`, y no está importado por nada — es código muerto que puede confundir sobre cuál es la fuente de verdad de la protección de rutas.
- **`triple_bonus` sin implementar**: existe la columna `predictions.triple_bonus` y el flag `private_leagues.triple_rule_enabled`, documentados extensamente en comentarios SQL como parte del sistema de puntuación ("norma del triple"), pero ninguna versión de `calculate_match_points` lo calcula — es una feature a medio construir (esquema listo, lógica ausente).
- **`syncMatchesAction` es un stub**: la sincronización automática de partidos con una API externa está sin implementar (solo comentario `TODO` con ejemplo); todo el ciclo de vida de partidos hoy es 100% manual desde el admin.
- **`invitations` y `join_requests` parecen subutilizadas**: existen las tablas y su RLS/estructura, pero no se ha encontrado un flujo de aplicación claro que las recorra de punta a punta (creación de invitación → consumo → alta de usuario invitado).
- **Redundancia de librerías**: `html-to-image` y `html2canvas` resuelven el mismo problema (captura de DOM a imagen); probablemente una es vestigial de una migración incompleta de una a otra.
- **Componentes muy grandes / multi-responsabilidad**: `AdminMatchManager.tsx` (755 líneas), `SimuladorClient.tsx` (619), `MatchCard.tsx` (580), `AdminFunnyStats.tsx` (550), `ProfileManager.tsx` (388), `RemindersView.tsx` (373), `AdminPredictionsEditor.tsx` (372) concentran fetching de datos derivados, validación de formularios y renderizado en un único archivo, sin extraer subcomponentes ni hooks.
- **Ausencia de capa de dominio/lib compartida**: no hay `lib/` con helpers de scoring, formateo de fechas por timezone del torneo, validación de reglas de negocio, etc. — esa lógica está repetida entre SQL (RPCs) y TypeScript (validaciones de formulario) sin una única fuente de verdad, lo que ya ha causado bugs reales documentados en las propias migraciones (`20260702000001_recalculate_all_points.sql` explica que una copia desincronizada del cálculo de puntos en `updatePlayerPredictionAction` puntuaba mal las ediciones manuales de admin).
- **Evolución muy inestable del sistema de puntuación**: `calculate_match_points` tiene 4 versiones y las vistas de ranking han sido recreadas 7 veces — señal de que las reglas de negocio del "core" no estaban bien cerradas al iniciar el proyecto y se han ido corrigiendo sobre la marcha en producción (varias migraciones son literalmente "fix_*").
- **Nombres específicos del Mundial en todo el stack**: desde el nombre del repo (`pollamundialista`) y tablas (`teams.group_letter`, `match_stage` con fases de bracket de 48 equipos) hasta funciones con timezone hardcodeada (`America/Mexico_City`) — ningún punto de personalización por torneo/temporada/deporte.
- **`reporte_mundial.json`** en la raíz del repo es un dump de datos de prueba (nombres de usuario, resultados) que no forma parte del build ni se referencia desde el código — parece un artefacto de depuración olvidado en el repositorio.
- **README genérico**: sigue siendo el `README.md` por defecto de `create-next-app`, sin documentar el dominio, el flujo de desarrollo con Supabase local, ni las convenciones del proyecto (más allá de lo que sí cubre `AGENTS.md`).
- **`locales/ro.json` (rumano)**: presencia de un tercer idioma sin contexto de negocio evidente en el resto del código/README — vale la pena confirmar si sigue siendo necesario.

---

## 11. Puntos fuertes

- **Reglas de negocio críticas viven en la base de datos, no solo en el frontend**: la ventana de edición de predicciones ("no puedes predecir un partido ya empezado") está impuesta por RLS, no solo por deshabilitar un botón en React — esto es difícil de saltarse y es una decisión de arquitectura sólida.
- **Uso disciplinado de Server Components + Server Actions**: no hay una mezcla confusa de fetching cliente y servidor; el patrón fetch-en-servidor/mutar-con-action/`revalidatePath` es consistente en todas las páginas, lo que hace el código predecible de leer.
- **Funciones SQL bien aisladas y documentadas**: los RPCs (`calculate_match_points`, `get_player_stats`, `get_funny_prediction_stats`, etc.) están comentados con el propósito de cada regla de puntuación, tienen `SECURITY DEFINER` + `search_path` fijo + `GRANT` explícito — patrón de seguridad correcto y repetido consistentemente.
- **`ON DELETE CASCADE` bien pensado** en la cadena `auth.users → profiles → predictions/profile_leagues`, evitando registros huérfanos al borrar usuarios.
- **`get_player_stats()` diseñada para ser inmune a cambios de puntuación** (compara goles reales vs. predichos en vez de depender de `points_earned`) — buena práctica de desacoplar analítica del algoritmo de scoring, que precisamente ha cambiado varias veces.
- **Migraciones versionadas y con mensajes explicativos**: aunque el "core" de puntuación se ha corregido varias veces, cada corrección está documentada en el propio SQL con el motivo del fix (buena trazabilidad histórica de decisiones).
- **RLS usada de forma consistente como mecanismo de autorización real**, no decorativo.
- **Separación clara entre datos "de torneo" (equipos, partidos) y datos "editoriales" (`players`, historial FIFA)**, que ya viven en tablas separadas — facilita más adelante independizar lo editorial de lo transaccional.

---

## 12. Riesgos para una futura evolución (hacia plataforma genérica)

- **El bracket está modelado como enum fijo, no como estructura de datos**: `match_stage` (`GROUP`, `ROUND_OF_32`... `FINAL`) asume un formato de torneo concreto de 48 equipos. Cualquier otro formato (liga de temporada regular, doble eliminación de esports, grupos + playoffs con distinto número de fases) requeriría cambiar el enum, lo que en Postgres no es trivial (no se puede quitar un valor de enum sin recrear el tipo) y rompe todo el código que compara contra esos literales.
- **`group_letter` como enum A-L**: asume exactamente 12 grupos. Un torneo genérico necesita un número arbitrario de grupos (o ninguno).
- **Puntuación no configurable**: el algoritmo de puntos (1/2/3 + reglas de "ganador absoluto" en eliminatorias) está hardcodeado dentro de una función SQL, no parametrizado por liga/torneo. Cualquier liga que quisiera reglas de puntuación distintas (p. ej. sin bonus por diferencia de goles, o puntuación distinta para fase de grupos) no podría hoy sin tocar la función global, que afecta a todos los torneos.
- **Timezone hardcodeada en RPCs de "día"**: `get_admin_player_ranking`/`get_daily_mvp` fijan `America/Mexico_City`. Un torneo en otra sede/zona horaria calcularía mal el "MVP del día".
- **`total_points`/`league_points` desnormalizados y recalculados por fuerza bruta** (`SUM` completo sobre todas las predicciones del usuario en cada llamada) dentro del mismo RPC que cierra un partido — funciona a la escala actual (un Mundial, participación moderada) pero no está pensado para múltiples torneos simultáneos corriendo en la misma plataforma.
- **No hay concepto de "Torneo/Competición" como entidad de primer nivel**: hoy `teams`, `matches`, `group_letter` etc. son globales y únicos — implícitamente hay un solo torneo activo (el Mundial 2026). Convertir esto en plataforma genérica requiere introducir una entidad `Tournament`/`Competition` de la que cuelguen equipos, partidos, fases y reglas de puntuación, lo cual es un cambio de modelo de datos de fondo, no incremental.
- **Autorización de admin no centralizada**: replicar el patrón actual (chequeo manual copiado en cada action) a una plataforma multi-torneo/multi-tenant multiplicaría el riesgo de un punto olvidado; hoy ya es frágil con un solo dominio de admin.
- **Terminología de fútbol de selecciones incrustada en nombres de columnas/tablas** (`caps`, `favorite_clubs`, `world_cups_won`, `seudonimo` de equipo) dificulta reutilizar el esquema tal cual para otro deporte o para esports sin una migración de renombrado + recarga de datos.
- **Dependencia fuerte de convenciones de una versión de Next.js "no estándar"** (`proxy.ts` en vez de `middleware.ts`, según advierte el propio `AGENTS.md`): cualquier evolución debe seguir consultando la documentación empaquetada en `node_modules/next/dist/docs/` de esa versión concreta, lo que añade fricción a cambios de infraestructura (routing, middleware) y a la incorporación de nuevos colaboradores/agentes que asuman el comportamiento "clásico" de Next.js.
- **Falta de tests**: no se ha encontrado carpeta de tests ni configuración de test runner en `package.json` — cualquier refactor del núcleo de puntuación (ya de por sí probado en producción a base de "fix" sucesivos) se haría hoy sin red de seguridad automatizada.

---

## 13. Resumen ejecutivo

**Qué está bien diseñado**: el flujo Server Component → Server Action → `revalidatePath` es consistente y fácil de seguir en todo el código; las reglas de negocio más sensibles (ventana de edición de predicciones, cálculo de puntos) están correctamente ancladas en la base de datos con RLS y RPCs `SECURITY DEFINER`, en vez de confiar solo en el cliente. La separación entre datos transaccionales (`matches`, `predictions`) y datos editoriales (`players`, ranking FIFA) ya existe, lo cual ayuda.

**Qué habría que generalizar**: todo lo relacionado con la estructura del torneo — el enum de fases (`match_stage`), el enum de grupos (`group_letter` A-L), la ausencia de una entidad `Tournament`/`Competition`, la puntuación hardcodeada en un único RPC global, y la zona horaria fija en las funciones de "ranking del día". Esta es, con diferencia, la mayor barrera estructural para convertir el proyecto en una plataforma multi-torneo/multi-deporte.

**Qué se puede reutilizar prácticamente tal cual**: el modelo de `profiles`/autenticación, `private_leagues`/`profile_leagues` (el concepto de liga privada con código de invitación es genérico), el patrón de `predictions` (usuario + evento + pronóstico + puntos), el sistema de RLS como mecanismo de autorización, y buena parte de la capa de UI de layout/navegación/tema/i18n, que no tiene acoplamiento al dominio deportivo.

**Qué convendría refactorizar primero** (sin entrar aún en diseño de la nueva arquitectura, solo priorización de riesgo): (1) cerrar el drift de esquema (`stadium`/`referee` y cualquier otro desfase entre BD real y migraciones) para poder confiar en las migraciones como fuente de verdad antes de construir nada encima; (2) centralizar la comprobación de rol `ADMIN` en un único punto en vez de 8 copias; (3) decidir el destino de `triple_bonus`/`triple_rule_enabled` (implementarlo o retirarlo) antes de que se convierta en deuda heredada por un nuevo modelo de puntuación configurable; (4) eliminar el código muerto (`utils/supabase/middleware.ts`, `reporte_mundial.json`, la librería de captura de imagen no usada) para reducir ruido antes de la reestructuración grande.
