import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import MatchCard from '@/components/MatchCard'
import ProfileBackLink from '@/components/ProfileBackLink'
import PlayerLolProfile from '@/components/lol/PlayerLolProfile'
import { getEditionStandings, getLolEditions, getPlayerLolHistory, lolToday } from '../../lol/data'
import {
  originHref,
  parseId,
  parseProfileFrom,
  pickProfileEdition,
  pickProfilePhase,
  resolveProfileSport,
  type ProfileOrigin,
  type ProfileSport,
} from '@/utils/profileContext'

type SearchParams = Record<string, string | string[] | undefined>
type Supabase = Awaited<ReturnType<typeof createClient>>

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('nickname').eq('id', id).maybeSingle()
  return { title: data ? `${data.nickname} · Woski` : 'Jugador · Woski' }
}

interface Profile { id: string; nickname: string; role: string | null; total_points: number | null; avatar_url: string | null }

/** Volver: el origen validado (?from) o, sin él, atrás / la clasificación del deporte. */
function backTarget(origin: ProfileOrigin | null, sport: ProfileSport, editionId: number | null) {
  if (origin) return { href: originHref(origin, editionId), label: origin.label, explicit: true }
  return sport === 'lol'
    ? { href: '/lol/clasificacion', label: 'Clasificación', explicit: false }
    : { href: '/clasificacion', label: 'Clasificación', explicit: false }
}

function ProfileHeader({ profile, points }: { profile: Profile; points: number }) {
  return (
    <div className="bg-bg-elevated border border-border rounded-panel shadow-card px-5 py-5 flex items-center gap-4 min-w-0">
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-bg-muted shrink-0 flex items-center justify-center border border-border">
        {profile.avatar_url ? (
          <Image src={profile.avatar_url} alt={profile.nickname} fill sizes="80px" className="object-cover" />
        ) : (
          <span className="text-2xl font-bold text-accent">{profile.nickname.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h1 className="heading-display text-xl sm:text-2xl font-bold text-text-primary truncate max-w-full">{profile.nickname}</h1>
          {profile.role === 'ADMIN' && (
            <span className="px-2 py-0.5 rounded-full bg-warning/15 text-warning ring-1 ring-inset ring-warning/30 text-xs font-bold uppercase tracking-wide shrink-0">
              Admin
            </span>
          )}
        </div>
        <p className="font-display text-2xl font-bold text-accent tabular-nums mt-0.5">
          {points}
          <span className="text-sm font-medium text-text-muted ml-1">pts</span>
        </p>
      </div>
    </div>
  )
}

/** Perfil de LoL: ediciones que ha jugado, su fila de la clasificación y su historial (todo de la BD). */
async function LolProfile({ supabase, profile, sp, origin }: {
  supabase: Supabase
  profile: Profile
  sp: SearchParams
  origin: ProfileOrigin | null
}) {
  const editions = await getLolEditions(supabase)
  const standings = await Promise.all(editions.map(e => getEditionStandings(supabase, e.id, null)))
  const today = lolToday()
  const played = editions
    .map((e, i) => ({ edition: e, rows: standings[i], mine: standings[i].find(r => r.profileId === profile.id) ?? null }))
    .filter(x => x.mine !== null)

  const editionId = pickProfileEdition(
    played.map(x => ({
      id: x.edition.id,
      startDate: x.edition.startDate,
      active: !!x.edition.startDate && x.edition.startDate <= today && (!x.edition.endDate || x.edition.endDate >= today),
    })),
    parseId(sp.edicion),
  )
  const back = backTarget(origin, 'lol', parseId(sp.edicion) ?? editionId)
  const selected = played.find(x => x.edition.id === editionId) ?? null

  if (!selected) {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <ProfileBackLink {...back} />
        <ProfileHeader profile={profile} points={0} />
        <p className="bg-bg-elevated border border-border rounded-panel shadow-card px-5 py-8 text-center text-sm text-text-muted">
          Este jugador aún no ha votado en ninguna competición de League of Legends.
        </p>
      </div>
    )
  }

  const { series, days } = await getPlayerLolHistory(supabase, profile.id, selected.edition.id)
  const phases = [...new Map(series.map(s => [s.phaseId, { id: s.phaseId, name: s.phaseName, order: s.phaseOrder }])).values()]
    .sort((a, b) => a.order - b.order)
  const phaseId = pickProfilePhase(phases.map(p => p.id), parseId(sp.fase))

  const hrefFor = (e: number, p: number | null) => {
    const q = new URLSearchParams()
    if (origin) q.set('from', origin.key)
    if (sp.deporte === 'lol') q.set('deporte', 'lol')
    q.set('edicion', String(e))
    if (p !== null) q.set('fase', String(p))
    return `/jugador/${encodeURIComponent(profile.id)}?${q.toString()}`
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <ProfileBackLink {...back} />
      <ProfileHeader profile={profile} points={selected.mine!.points} />
      <PlayerLolProfile
        standing={selected.mine}
        participants={selected.rows.length}
        series={series}
        days={days}
        editions={played.map(x => ({ id: x.edition.id, label: x.edition.label }))}
        selectedEditionId={selected.edition.id}
        phases={phases}
        selectedPhaseId={phaseId}
        hrefFor={hrefFor}
      />
    </div>
  )
}

export default async function JugadorPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const origin = parseProfileFrom(sp.from)
  const sport = resolveProfileSport(sp.deporte, origin)

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, nickname, role, total_points, avatar_url')
    .eq('id', id)
    .maybeSingle()
  if (!profile) notFound()

  if (sport === 'lol') return <LolProfile supabase={supabase} profile={profile as Profile} sp={sp} origin={origin} />
  return <FootballProfile supabase={supabase} profile={profile as Profile} back={backTarget(origin, 'futbol', null)} />
}

// Fútbol (archivo): como antes, salvo el enlace de volver.
async function FootballProfile({ supabase, profile, back }: {
  supabase: Supabase
  profile: Profile
  back: ReturnType<typeof backTarget>
}) {
  const id = profile.id
  const [{ data: rawPredictions }] = await Promise.all([
    // SECURITY: !inner + .eq on status ensures predictions for unplayed matches never reach the client
    supabase
      .from('predictions')
      .select(`
        points_earned,
        pred_home_goals,
        pred_away_goals,
        pred_advancing_team_id,
        matches!inner(
          id, home_goals, away_goals, match_date, stage, group_letter,
          status, advancing_team_id, stadium, referee,
          home_team_id, away_team_id,
          home_team:teams!home_team_id(name, flag_emoji, iso_code),
          away_team:teams!away_team_id(name, flag_emoji, iso_code)
        )
      `)
      .eq('profile_id', id)
      .eq('matches.status', 'FINISHED'),
  ])

  const predictions = [...(rawPredictions ?? [])].sort((a, b) => {
    const ma = a.matches as any
    const mb = b.matches as any
    return new Date(mb.match_date).getTime() - new Date(ma.match_date).getTime()
  })

  const plenos   = predictions.filter(p => p.points_earned === 3).length
  const aciertos = predictions.filter(p => p.points_earned === 1 || p.points_earned === 2).length
  const fallos   = predictions.filter(p => p.points_earned === 0).length

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">

      <ProfileBackLink {...back} />

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#FFD6D1] dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-[#FFD6D1] to-[#F9ECE5] dark:from-slate-800 dark:to-slate-900 px-6 py-6 flex items-center gap-5">
          <div className="relative w-20 h-20 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex-shrink-0 flex items-center justify-center border-4 border-white/60 dark:border-slate-700 shadow-md">
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt={profile.nickname} fill sizes="80px" className="object-cover" />
            ) : (
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {profile.nickname.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
                {profile.nickname}
              </h1>
              {profile.role === 'ADMIN' && (
                <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 rounded-full text-xs font-bold uppercase tracking-wide shrink-0">
                  Admin
                </span>
              )}
            </div>
            <p className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
              {profile.total_points}
              <span className="text-base font-medium text-gray-400 dark:text-gray-500 ml-1">pts</span>
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-slate-800 border-t border-gray-100 dark:border-slate-800">
          <div className="flex flex-col items-center py-4 gap-0.5">
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{plenos}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Plenos</span>
            <span className="text-[10px] text-gray-300 dark:text-slate-600">+3 pts</span>
          </div>
          <div className="flex flex-col items-center py-4 gap-0.5">
            <span className="text-2xl font-extrabold text-amber-500 dark:text-amber-400 tabular-nums">{aciertos}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Aciertos</span>
            <span className="text-[10px] text-gray-300 dark:text-slate-600">+1 / +2 pts</span>
          </div>
          <div className="flex flex-col items-center py-4 gap-0.5">
            <span className="text-2xl font-extrabold text-red-500 dark:text-red-400 tabular-nums">{fallos}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Fallos</span>
            <span className="text-[10px] text-gray-300 dark:text-slate-600">0 pts</span>
          </div>
        </div>
      </div>

      {/* Match history */}
      {predictions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="text-5xl">📭</span>
          <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Sin historial</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Aún no hay partidos finalizados con predicción de este jugador.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
            Historial · {predictions.length} partido{predictions.length !== 1 ? 's' : ''}
          </h2>
          {predictions.map((pred) => {
            const match = pred.matches as any
            const formattedDate = new Intl.DateTimeFormat('es-ES', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            }).format(new Date(match.match_date))

            return (
              <MatchCard
                key={match.id}
                id={match.id}
                home={match.home_team}
                away={match.away_team}
                homeTeamId={match.home_team_id}
                awayTeamId={match.away_team_id}
                group={match.group_letter ?? '?'}
                matchStage={match.stage ?? 'GROUP'}
                date={formattedDate}
                status="FINISHED"
                isLocked
                homeRealResult={match.home_goals}
                awayRealResult={match.away_goals}
                realAdvancingTeamId={match.advancing_team_id ?? null}
                homePrediction={pred.pred_home_goals}
                awayPrediction={pred.pred_away_goals}
                predAdvancingTeamId={pred.pred_advancing_team_id ?? null}
                pointsEarned={pred.points_earned ?? 0}
                stadium={match.stadium}
                referee={match.referee}
              />
            )
          })}
        </div>
      )}

    </div>
  )
}
