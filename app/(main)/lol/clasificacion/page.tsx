import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/server'
import EditionSelector from '@/components/lol/EditionSelector'
import PoolSelector from '@/components/lol/PoolSelector'
import type { StandingRow } from '@/utils/lol/types'
import { getActiveLolEditions, getEditionStandings, getUserEditionPools } from '../data'

export const metadata = { title: 'Clasificación · LoL · Woski' }

function MovementBadge({ m }: { m: number | null }) {
  if (m === null) return null
  if (m > 0) return <span className="text-[9px] font-bold text-success leading-none">▲{m}</span>
  if (m < 0) return <span className="text-[9px] font-bold text-danger leading-none">▼{Math.abs(m)}</span>
  return <span className="text-[9px] text-text-muted/60 leading-none">—</span>
}

function Avatar({ url, initial }: { url: string | null; initial: string }) {
  return (
    <div className="relative w-7 h-7 rounded-full overflow-hidden bg-bg-muted border border-border flex items-center justify-center shrink-0">
      {url ? (
        <Image src={url} alt={initial} fill sizes="28px" className="object-cover" />
      ) : (
        <span className="text-[10px] font-bold text-accent">{initial}</span>
      )}
    </div>
  )
}

const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default async function LolClasificacionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { edicion } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const editions = await getActiveLolEditions(supabase)

  if (editions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <span className="text-5xl" aria-hidden>🏆</span>
        <h1 className="text-lg font-bold text-text-primary">No hay ninguna competición en curso ahora mismo</h1>
        <p className="text-sm text-text-muted max-w-sm">
          La clasificación aparecerá aquí cuando arranque la próxima competición de League of Legends.
        </p>
      </div>
    )
  }

  // Edición pedida en la URL si sigue activa; si no, la primera activa.
  const selected = editions.find(e => String(e.id) === edicion) ?? editions[0]

  const [pools, profileRes] = await Promise.all([
    getUserEditionPools(supabase, selected.id, user.id),
    supabase.from('profiles').select('last_viewed_league_id').eq('id', user.id).maybeSingle(),
  ])

  // El ámbito guardado solo vale si es un pool tuyo de esta edición; si no, Global.
  const lastViewed = profileRes.data?.last_viewed_league_id as number | null | undefined
  const activePool = pools.find(p => p.id === lastViewed) ?? null

  const ranking: StandingRow[] = await getEditionStandings(supabase, selected.id, activePool?.id ?? null)

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Clasificación</h1>
        <p className="text-sm text-text-muted mt-1">
          {selected.fullName} · {activePool?.name ?? 'Global'}
        </p>
      </div>

      <div className="mb-4">
        <EditionSelector editions={editions} selectedId={selected.id} basePath="/lol/clasificacion" />
      </div>

      <PoolSelector key={selected.id} editionId={selected.id} pools={pools} activePoolId={activePool?.id ?? null} />

      {/* Leyenda */}
      <div className="bg-bg-muted/60 p-4 rounded-xl mb-4 border border-border">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-muted">
          <span>🎯 <strong className="text-text-primary">Aciertos</strong> ganadores acertados / series jugadas</span>
          <span>
            ⭐ <strong className="text-text-primary">Plenos</strong>{' '}
            <span className="text-success font-semibold">jornadas acertando todo</span> |{' '}
            <span className="text-danger font-semibold">jornadas fallando todo (−1 pt)</span>
          </span>
          <span>🔥 <strong className="text-text-primary">Racha</strong> aciertos seguidos ahora mismo</span>
          <span>💤 Si no votas una jornada, sumas lo mismo que el peor de ese día</span>
        </div>
      </div>

      <div className="bg-bg-elevated rounded-xl shadow-sm border border-border overflow-hidden">
        {ranking.length === 0 ? (
          <p className="text-center text-text-muted text-sm py-12">
            Todavía no hay clasificación: se formará cuando se jueguen los primeros partidos.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-muted/60 border-b border-border text-xs uppercase tracking-wider text-text-muted">
                <th className="px-3 sm:px-4 py-3 text-center w-12">Pos</th>
                <th className="px-3 sm:px-4 py-3 text-left">Usuario</th>
                <th className="px-2 sm:px-3 py-3 text-center">Aciertos</th>
                <th className="px-2 sm:px-3 py-3 text-center">Plenos</th>
                <th className="px-3 py-3 text-center hidden sm:table-cell">Racha</th>
                <th className="px-3 sm:px-4 py-3 text-right sm:pr-6">Total</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map(row => {
                const isMe = row.profileId === user.id
                return (
                  <tr
                    key={row.profileId}
                    aria-current={isMe || undefined}
                    className={`border-b border-border/60 last:border-0 transition-colors ${
                      isMe ? 'bg-accent/10' : 'hover:bg-bg-muted/60'
                    }`}
                  >
                    <td className="px-3 sm:px-4 py-3 text-center w-12">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-bold text-text-muted leading-none tabular-nums">
                          {medals[row.position] ?? row.position}
                        </span>
                        <MovementBadge m={row.movement} />
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3">
                      <Link
                        href={`/jugador/${row.profileId}`}
                        className="flex items-center gap-2 min-w-0 group"
                      >
                        <Avatar url={row.avatarUrl} initial={row.nickname.charAt(0).toUpperCase()} />
                        <span className="font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                          {row.nickname}
                        </span>
                        {isMe && <span className="text-xs text-accent font-normal shrink-0">(Tú)</span>}
                      </Link>
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-center text-text-muted tabular-nums whitespace-nowrap">
                      {row.correctWinners}/{row.finishedSeries}
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-center tabular-nums whitespace-nowrap">
                      <span className="font-semibold text-success">{row.perfectDays}</span>
                      <span className="text-text-muted/60 mx-1">|</span>
                      <span className="font-semibold text-danger">{row.negativeDays}</span>
                    </td>
                    <td className="px-3 py-3 text-center text-text-muted tabular-nums hidden sm:table-cell">
                      {row.currentStreak}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right sm:pr-6 font-bold text-accent tabular-nums whitespace-nowrap">
                      {row.points}
                      <span className="ml-1 text-xs text-text-muted font-normal">pts</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
