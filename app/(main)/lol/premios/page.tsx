import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/server'
import EditionSelector from '@/components/lol/EditionSelector'
import PoolSelector from '@/components/lol/PoolSelector'
import PhasePills from '@/components/lol/PhasePills'
import { AWARDS, type AwardDef } from '@/utils/lol/awards'
import { pickActivePhase } from '@/utils/lol/phases'
import { profileHref } from '@/utils/profileContext'
import type { LolAwardWinner } from '@/utils/lol/types'
import { getActiveLolEditions, pickLolEdition, getEditionAwards, getEditionPhaseStatus, getUserEditionPools } from '../data'

export const metadata = { title: 'Premios · LoL · Woski' }

function Avatar({ url, initial }: { url: string | null; initial: string }) {
  return (
    <span className="relative w-6 h-6 rounded-full overflow-hidden bg-bg-muted border border-border flex items-center justify-center shrink-0">
      {url ? (
        <Image src={url} alt="" fill sizes="24px" className="object-cover" />
      ) : (
        <span className="text-[10px] font-bold text-accent" aria-hidden>{initial}</span>
      )}
    </span>
  )
}

function AwardCard({ def, winners, editionId, userId }: {
  def: AwardDef
  winners: LolAwardWinner[]
  editionId: number
  userId: string
}) {
  // Todos los ganadores comparten valor (empate); el detalle puede variar
  // (p. ej. el equipo de El Hincha), así que va con cada uno.
  const sameDetail = winners.every(w => w.detail === winners[0]?.detail)
  return (
    <li className="bg-bg-elevated border border-border rounded-card shadow-card p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none" aria-hidden>{def.emoji}</span>
        <div className="min-w-0">
          <h3 className="font-display text-sm font-bold text-text-primary">{def.title}</h3>
          <p className="text-xs text-text-muted">{def.description}</p>
        </div>
      </div>
      {winners.length === 0 ? (
        <p className="text-xs text-text-muted/80 italic">Todavía sin ganador</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
            {winners.map(w => (
              <li key={w.profileId}>
                <Link
                  href={profileHref(w.profileId, 'lol-premios', editionId)}
                  className="inline-flex items-center gap-1.5 min-w-0 group"
                >
                  <Avatar url={w.avatarUrl} initial={w.nickname.charAt(0).toUpperCase()} />
                  <span className="text-sm font-semibold text-text-primary truncate group-hover:text-accent transition-colors">
                    {w.nickname}
                  </span>
                  {w.profileId === userId && <span className="text-xs text-accent shrink-0">(Tú)</span>}
                  {!sameDetail && w.detail && (
                    <span className="text-xs text-text-muted shrink-0">· {def.format(w.value, w.detail)}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {sameDetail && (
            <p className="text-sm font-bold text-accent tabular-nums">{def.format(winners[0].value, winners[0].detail)}</p>
          )}
          {winners.length > 1 && <p className="text-[11px] text-text-muted">Premio compartido</p>}
        </>
      )}
    </li>
  )
}

export default async function LolPremiosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { edicion, fase } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const editions = await getActiveLolEditions(supabase)

  if (editions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <span className="text-5xl" aria-hidden>🎖️</span>
        <h1 className="heading-display text-lg font-bold text-text-primary">No hay ninguna competición en curso ahora mismo</h1>
        <p className="text-sm text-text-muted max-w-sm">
          Los premios aparecerán aquí cuando arranque la próxima competición de League of Legends.
        </p>
      </div>
    )
  }

  const selected = pickLolEdition(editions, edicion)

  const [pools, profileRes, phaseStatus] = await Promise.all([
    getUserEditionPools(supabase, selected.id, user.id),
    supabase.from('profiles').select('last_viewed_league_id').eq('id', user.id).maybeSingle(),
    // Sin fases (error ya registrado) la página sigue con el total.
    getEditionPhaseStatus(supabase, selected.id).catch(() => ({ phases: [], editionFinished: false })),
  ])

  // Mismo ámbito que la clasificación: el pool guardado y la fase elegida o
  // la actual.
  const lastViewed = profileRes.data?.last_viewed_league_id as number | null | undefined
  const activePool = pools.find(p => p.id === lastViewed) ?? null
  const phases = phaseStatus.phases
  const activePhase = pickActivePhase(phases, phaseStatus.editionFinished, fase)
  const phaseHref = (phaseId: number | null) =>
    `/lol/premios?edicion=${selected.id}&fase=${phaseId ?? 'total'}`

  // Una fase sin series terminadas aún no tiene premios: no se piden.
  const phaseNotStarted = activePhase !== null && !activePhase.started
  const winners = phaseNotStarted
    ? []
    : await getEditionAwards(supabase, selected.id, activePool?.id ?? null, activePhase?.id ?? null)

  const byAward = new Map<string, LolAwardWinner[]>()
  for (const w of winners) byAward.set(w.award, [...(byAward.get(w.award) ?? []), w])

  const groups: { title: string; defs: AwardDef[] }[] = [
    { title: 'Los buenos', defs: AWARDS.filter(a => a.group === 'good') },
    { title: 'Los de broma', defs: AWARDS.filter(a => a.group === 'fun') },
  ]

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="heading-display text-2xl font-bold text-text-primary">Premios</h1>
        <p className="text-sm text-text-muted mt-1">
          {selected.fullName} · {activePool?.name ?? 'Global'}{phases.length > 1 && ` · ${activePhase?.name ?? 'Total'}`}
        </p>
      </div>

      <div className="mb-4">
        <EditionSelector editions={editions} selectedId={selected.id} basePath="/lol/premios" />
      </div>

      <PoolSelector key={selected.id} editionId={selected.id} pools={pools} activePoolId={activePool?.id ?? null} />

      <PhasePills
        phases={phases}
        editionFinished={phaseStatus.editionFinished}
        activePhaseId={activePhase?.id ?? null}
        hrefFor={phaseHref}
      />

      <p className="text-xs text-text-muted mb-5">
        Solo series terminadas. Para optar a un premio hay que haber votado al menos 3 series y la mitad de las
        que te tocaban desde tu primer voto (El Dormilón solo pide las 3). Si hay empate, el premio se comparte.
      </p>

      {phaseNotStarted ? (
        <p className="bg-bg-elevated border border-border rounded-card shadow-card px-5 py-10 text-center text-sm text-text-muted">
          {activePhase!.name} aún no ha empezado: sus premios saldrán con la primera serie terminada.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(g => (
            <section key={g.title} aria-labelledby={`premios-${g.title}`}>
              <h2 id={`premios-${g.title}`} className="heading-display text-sm font-bold text-text-muted mb-3 px-1">
                {g.title}
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {g.defs.map(def => (
                  <AwardCard
                    key={def.key}
                    def={def}
                    winners={byAward.get(def.key) ?? []}
                    editionId={selected.id}
                    userId={user.id}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
