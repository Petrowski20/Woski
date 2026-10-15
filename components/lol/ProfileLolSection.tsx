import Link from 'next/link'
import type { ProfileLolEdition } from '@/utils/lol/types'
import type { LolEditionStatus } from '@/utils/lol/editionStatus'
import type { Lang } from '@/contexts/LangContext'
import { getServerLang, tServer } from '@/utils/i18n-server'
import PointsBreakdown from './PointsBreakdown'
import { formatMatchDate, formatSeriesScore } from './format'

// Sección de LoL de /perfil. Solo presenta lo que calcula la BD
// (get_lol_standings y get_my_lol_breakdowns); no decide ningún punto.
// Cada edición es un bloque plegable; por defecto solo la(s) activa(s)
// abiertas.

type T = (key: string, vars?: Record<string, string | number>) => string

const STATUS_TONE: Record<LolEditionStatus, string> = {
  active: 'bg-success/10 text-success ring-success/30',
  finished: 'bg-bg-muted text-text-muted ring-border',
  upcoming: 'bg-warning/10 text-warning ring-warning/30',
}

const DATE_LOCALE: Record<Lang, string> = { es: 'es-ES', en: 'en-GB', ro: 'ro-RO' }

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-bg-elevated px-4 py-3 min-w-0">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="font-display text-2xl font-bold text-text-primary tabular-nums leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function PointsPill({ points }: { points: number }) {
  const tone = points === 0
    ? 'bg-danger/10 text-danger ring-danger/30'
    : 'bg-success/10 text-success ring-success/30'
  return (
    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ring-1 ring-inset tabular-nums ${tone}`}>
      {points > 0 ? `+${points}` : points} pt{points !== 1 ? 's' : ''}
    </span>
  )
}

function StatusPill({ status, t }: { status: LolEditionStatus; t: T }) {
  return (
    <span className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ring-1 ring-inset ${STATUS_TONE[status]}`}>
      {t(`profile.lol.estado.${status}`)}
    </span>
  )
}

function EditionStats({ data, t }: { data: ProfileLolEdition; t: T }) {
  const { standing, participants, pools, scored, exactHits, exactPlayed } = data
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-border border-y border-border">
        <Stat label={t('profile.lol.puntos')} value={<span className="text-accent">{standing?.points ?? 0}</span>} />
        <Stat
          label={t('profile.lol.posicionGlobal')}
          value={standing ? `#${standing.position}` : '—'}
          sub={standing ? t('profile.lol.deN', { n: participants }) : t('profile.lol.sinClasificar')}
        />
        <Stat
          label={t('profile.lol.rachaActual')}
          value={standing?.currentStreak ?? 0}
          sub={t('profile.lol.mejorFase', { n: standing?.bestStreak ?? 0 })}
        />
        <Stat
          label={t('profile.lol.plenos')}
          value={
            <span>
              <span className="text-success" title={t('profile.lol.plenosPos')}>+{standing?.perfectDays ?? 0}</span>
              <span className="text-text-muted mx-1.5">/</span>
              <span className="text-danger" title={t('profile.lol.plenosNeg')}>−{standing?.negativeDays ?? 0}</span>
            </span>
          }
          sub={t('profile.lol.plenosSub')}
        />
        <Stat
          label={t('profile.lol.aciertosGanador')}
          value={`${standing?.correctWinners ?? 0}/${standing?.finishedSeries ?? 0}`}
          sub={t('profile.lol.sobreSeries')}
        />
        <Stat
          label={t('profile.lol.marcadorExacto')}
          value={`${exactHits}/${exactPlayed}`}
          sub={t('profile.lol.enBo3Bo5')}
        />
      </div>

      {pools.length > 0 && (
        <div className="px-5 py-3 border-b border-border">
          <p className="font-display text-xs font-bold uppercase tracking-display text-text-muted">{t('profile.lol.misPools')}</p>
          <p className="text-xs text-text-muted mb-2">{t('profile.lol.poolsNota')}</p>
          <ul className="flex flex-col gap-1.5">
            {pools.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text-primary truncate">🏆 {p.name}</span>
                <span className="shrink-0 tabular-nums text-text-muted">
                  {p.position
                    ? <><strong className="text-text-primary">#{p.position}</strong> {t('profile.lol.deN', { n: p.participants })} · {t('profile.lol.ptsCorto', { n: p.points })}</>
                    : t('profile.lol.sinClasificar')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="group/series" open={scored.length > 0 && scored.length <= 5}>
        <summary className="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer select-none list-none hover:bg-bg-muted/60 [&::-webkit-details-marker]:hidden">
          <span className="font-display text-xs font-bold uppercase tracking-display text-text-muted">
            {t('profile.lol.misSeries', { n: scored.length })}
          </span>
          <span aria-hidden className="text-text-muted transition-transform group-open/series:rotate-180">▾</span>
        </summary>
        {scored.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-text-muted">{t('profile.lol.sinSeries')}</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {scored.map(m => {
              const mine = m.myPrediction!
              return (
                <li key={m.id} className="px-5 py-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {m.home.name} <span className="text-text-muted font-normal">vs</span> {m.away.name}
                      </p>
                      <p className="text-xs text-text-muted">
                        <time dateTime={m.date} className="capitalize">{formatMatchDate(m.date)}</time>
                        {' · '}{m.phaseName} · Bo{m.bestOf}
                      </p>
                    </div>
                    <PointsPill points={mine.points ?? 0} />
                  </div>
                  <p className="text-xs text-text-muted">
                    {t('profile.lol.resultado')}:{' '}
                    <strong className="text-text-primary">
                      {m.result ? formatSeriesScore(m.result, m.home.tag, m.away.tag) : '—'}
                    </strong>
                    {' · '}{t('profile.lol.tuVoto')}:{' '}
                    <strong className="text-text-primary">{formatSeriesScore(mine, m.home.tag, m.away.tag)}</strong>
                  </p>
                  {mine.breakdown && (
                    <div className="[&_ul]:justify-start">
                      <PointsBreakdown breakdown={mine.breakdown} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </details>
    </>
  )
}

function EditionCard({ data, t, lang }: { data: ProfileLolEdition; t: T; lang: Lang }) {
  const { edition, status, standing, scored } = data
  const played = standing !== null || scored.length > 0
  const startDate = edition.startDate
    ? new Intl.DateTimeFormat(DATE_LOCALE[lang], { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${edition.startDate}T00:00:00Z`))
    : '—'

  return (
    <details
      className="group bg-bg-elevated border border-border rounded-panel shadow-card overflow-hidden"
      open={status === 'active'}
    >
      <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 cursor-pointer select-none list-none hover:bg-bg-muted/60 [&::-webkit-details-marker]:hidden">
        <h3 className="heading-display font-bold text-text-primary min-w-0">{edition.fullName}</h3>
        <StatusPill status={status} t={t} />
        <span className="ml-auto flex items-center gap-3">
          {standing && (
            <span className="text-xs font-semibold tabular-nums text-text-muted">
              {t('profile.lol.resumen', { pts: standing.points, pos: standing.position })}
            </span>
          )}
          <span aria-hidden className="text-text-muted transition-transform group-open:rotate-180">▾</span>
        </span>
      </summary>

      {status === 'active' && (
        <div className="flex justify-end px-5 pb-2 -mt-1">
          <Link
            href={`/lol/clasificacion?edicion=${edition.id}`}
            className="text-xs font-semibold text-accent hover:underline underline-offset-4"
          >
            {t('profile.lol.verClasificacion')}
          </Link>
        </div>
      )}

      {played ? (
        <EditionStats data={data} t={t} />
      ) : (
        <div className="px-5 py-6 text-center border-t border-border">
          {status === 'upcoming' ? (
            <p className="text-sm text-text-muted">{t('profile.lol.aunNoEmpieza', { fecha: startDate })}</p>
          ) : (
            <>
              <p className="text-sm text-text-muted">{t('profile.lol.sinVotos')}</p>
              <Link
                href={`/?edicion=${edition.id}`}
                className="mt-3 inline-block px-4 py-2 rounded-lg text-sm font-semibold bg-accent bg-accent-gradient text-on-accent shadow-glow-accent hover:brightness-110"
              >
                {t('profile.lol.irAVotar')}
              </Link>
            </>
          )}
        </div>
      )}
    </details>
  )
}

export default async function ProfileLolSection({ editions }: { editions: ProfileLolEdition[] }) {
  const lang = await getServerLang()
  const t: T = (key, vars) => tServer(lang, key, vars)

  return (
    <section aria-labelledby="perfil-lol" className="flex flex-col gap-3">
      <h2 id="perfil-lol" className="heading-display text-sm font-bold text-text-muted px-1">
        ⚔️ {t('profile.lol.titulo')}
      </h2>
      {editions.length === 0 ? (
        <p className="bg-bg-elevated border border-border rounded-panel shadow-card px-5 py-6 text-sm text-text-muted text-center">
          {t('profile.lol.sinCompeticiones')}{' '}
          <Link href="/lol/historial" className="text-accent hover:underline">{t('profile.lol.historial')}</Link>.
        </p>
      ) : (
        editions.map(e => <EditionCard key={e.edition.id} data={e} t={t} lang={lang} />)
      )}
    </section>
  )
}
