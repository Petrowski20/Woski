import { getServerLang, tServer } from '@/utils/i18n-server'

export const metadata = { title: 'Cómo jugar · PollaMundialista' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 p-6 shadow-sm">
      <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4">{title}</h2>
      {children}
    </section>
  )
}

function ScoreRow({ points, label, description }: { points: string; label: string; description: string }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-gray-50 dark:border-slate-800 last:border-0">
      <span className="shrink-0 w-10 text-center text-lg font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
        {points}
      </span>
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
    </div>
  )
}

export default async function ReglasPage() {
  const lang = await getServerLang()
  const t = (key: string, vars?: Record<string, string | number>) => tServer(lang, key, vars)

  const tiebreakItems = [
    { num: '1', title: t('reglas.tiebreak.r1.title'), desc: t('reglas.tiebreak.r1.desc') },
    { num: '2', title: t('reglas.tiebreak.r2.title'), desc: t('reglas.tiebreak.r2.desc') },
    { num: '3', title: t('reglas.tiebreak.r3.title'), desc: t('reglas.tiebreak.r3.desc') },
    { num: '4', title: t('reglas.tiebreak.r4.title'), desc: t('reglas.tiebreak.r4.desc') },
  ]

  const phaseItems = [
    { fase: t('reglas.phases.p1.fase'), desc: t('reglas.phases.p1.desc') },
    { fase: t('reglas.phases.p2.fase'), desc: t('reglas.phases.p2.desc') },
  ]

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('reglas.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('reglas.subtitle')}</p>
      </div>

      {/* Sistema de puntuación */}
      <Section title={t('reglas.scoring.title')}>
        <ScoreRow points="+3" label={t('reglas.scoring.exact.label')}       description={t('reglas.scoring.exact.desc')} />
        <ScoreRow points="+2" label={t('reglas.scoring.winnerDiff.label')}  description={t('reglas.scoring.winnerDiff.desc')} />
        <ScoreRow points="+1" label={t('reglas.scoring.winner.label')}      description={t('reglas.scoring.winner.desc')} />
        <ScoreRow points="0"  label={t('reglas.scoring.noAcierto.label')}   description={t('reglas.scoring.noAcierto.desc')} />
        <ScoreRow points="0"  label={t('reglas.scoring.noPrediccion.label')} description={t('reglas.scoring.noPrediccion.desc')} />
      </Section>

      {/* Ejemplos fase de grupos */}
      <Section title={t('reglas.examples.title')}>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-2.5">
            <span className="text-gray-700 dark:text-gray-300">
              {t('reglas.examples.predices')} <strong>2–1</strong> · {t('reglas.examples.real')} <strong>2–1</strong>
            </span>
            <span className="font-bold text-green-700 dark:text-green-400">+3 pts</span>
          </div>
          <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-lg px-4 py-2.5">
            <span className="text-gray-700 dark:text-gray-300">
              {t('reglas.examples.predices')} <strong>2–0</strong> · {t('reglas.examples.real')} <strong>3–1</strong>{' '}
              <span className="text-xs text-gray-400">{t('reglas.examples.localGana', { n: 2 })}</span>
            </span>
            <span className="font-bold text-blue-700 dark:text-blue-400">+2 pts</span>
          </div>
          <div className="flex items-center justify-between bg-yellow-50 dark:bg-yellow-900/20 rounded-lg px-4 py-2.5">
            <span className="text-gray-700 dark:text-gray-300">
              {t('reglas.examples.predices')} <strong>2–0</strong> · {t('reglas.examples.real')} <strong>3–0</strong>
            </span>
            <span className="font-bold text-yellow-700 dark:text-yellow-400">+1 pt</span>
          </div>
          <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-2.5">
            <span className="text-gray-700 dark:text-gray-300">
              {t('reglas.examples.predices')} <strong>1–0</strong> · {t('reglas.examples.real')} <strong>0–2</strong>
            </span>
            <span className="font-bold text-red-600 dark:text-red-400">0 pts</span>
          </div>
        </div>
      </Section>

      {/* Fases Eliminatorias */}
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
        <h2 className="mb-1 text-base font-bold text-gray-900 dark:text-gray-100">
          {t('reglas.knockout.title')}
          <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-800/60 dark:text-amber-300">
            {t('reglas.knockout.badge')}
          </span>
        </h2>
        <p className="mb-5 text-xs text-gray-500 dark:text-gray-400">
          {t('reglas.knockout.intro')}
        </p>

        <ul className="space-y-4">
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-200 text-sm text-amber-800 dark:bg-amber-800/50 dark:text-amber-200">
              1
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t('reglas.knockout.ties.title')}</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t('reglas.knockout.ties.desc')}</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-700 dark:bg-red-900/40 dark:text-red-400">
              !
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t('reglas.knockout.goldenRule.title')}</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {t('reglas.knockout.goldenRule.desc1')}{' '}
                <strong className="text-red-600 dark:text-red-400">{t('reglas.knockout.goldenRule.penalty')}</strong>
                {t('reglas.knockout.goldenRule.desc2')}
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm text-green-700 dark:bg-green-900/40 dark:text-green-400">
              ✓
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t('reglas.knockout.ifCorrect.title')}</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t('reglas.knockout.ifCorrect.desc')}</p>
            </div>
          </li>
        </ul>

        <div className="mt-5 space-y-2 border-t border-amber-100 pt-4 text-sm dark:border-amber-900/30">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('reglas.knockout.examples.title')}
          </p>

          <div className="rounded-lg bg-red-50 px-4 py-2.5 dark:bg-red-900/20">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-gray-700 dark:text-gray-300">
                  {t('reglas.knockout.examples.predices')} <strong>1–1</strong>{' '}
                  <span className="text-xs text-gray-400">{t('reglas.knockout.examples.pasaEquipoA')}</span>
                  {' · '}{t('reglas.knockout.examples.real')} <strong>1–1</strong>{' '}
                  <span className="text-xs text-gray-400">{t('reglas.knockout.examples.pasaEquipoB')}</span>
                </span>
                <p className="mt-0.5 text-xs text-red-500 dark:text-red-400">
                  {t('reglas.knockout.examples.failNote')}
                </p>
              </div>
              <span className="shrink-0 font-bold text-red-600 dark:text-red-400">0 pts</span>
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 px-4 py-2.5 dark:bg-blue-900/20">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-gray-700 dark:text-gray-300">
                  {t('reglas.knockout.examples.predices')} <strong>1–1</strong>{' '}
                  <span className="text-xs text-gray-400">{t('reglas.knockout.examples.pasaEquipoA')}</span>
                  {' · '}{t('reglas.knockout.examples.real')} <strong>2–2</strong>{' '}
                  <span className="text-xs text-gray-400">{t('reglas.knockout.examples.pasaEquipoA')}</span>
                </span>
                <p className="mt-0.5 text-xs text-blue-500 dark:text-blue-400">
                  {t('reglas.knockout.examples.plus2Note')}
                </p>
              </div>
              <span className="shrink-0 font-bold text-blue-700 dark:text-blue-400">+2 pts</span>
            </div>
          </div>
        </div>
      </section>

      {/* Criterios de desempate */}
      <Section title={t('reglas.tiebreak.title')}>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('reglas.tiebreak.intro')}</p>
        <ol className="space-y-3">
          {tiebreakItems.map(({ num, title, desc }) => (
            <li key={num} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-xs font-bold flex items-center justify-center">
                {num}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* Selecciones */}
      <Section title={t('reglas.seleccionesSection.title')}>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('reglas.seleccionesSection.desc')}</p>
      </Section>

      {/* Fases del torneo */}
      <Section title={t('reglas.phases.title')}>
        <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          {phaseItems.map(({ fase, desc }) => (
            <li key={fase} className="flex gap-2.5">
              <span className="text-gray-300 dark:text-slate-600 select-none">—</span>
              <span><strong className="text-gray-900 dark:text-gray-100">{fase}:</strong> {desc}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 border-t border-gray-50 dark:border-slate-800 pt-4">
          {t('reglas.phases.disclaimer')}
        </p>
      </Section>

    </div>
  )
}
