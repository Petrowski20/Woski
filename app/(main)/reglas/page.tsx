import { createClient } from '@/utils/supabase/server'
import { getActiveLolEditions, getEditionRules, pickLolEdition } from '../lol/data'
import { signedPoints, streakBonusFor, type LolRulesSummary, type ShareBlock, type StreakTier } from '@/utils/lol/rules'

export const metadata = { title: 'Cómo jugar · Woski' }

// Reglas de LoL de la competición en curso. Los números salen del config
// del ruleset de la fase actual (getEditionRules); los puntos los calcula
// el motor de la BD y esta página solo los explica.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-bg-elevated rounded-card border border-border p-6 shadow-card">
      <h2 className="heading-display text-base font-bold text-text-primary mb-4">{title}</h2>
      {children}
    </section>
  )
}

function Rule({ points, title, children }: { points: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-border last:border-0">
      <span className="shrink-0 w-12 text-center font-display text-lg font-bold text-accent tabular-nums">
        {points}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <div className="text-xs text-text-muted mt-0.5 space-y-1">{children}</div>
      </div>
    </div>
  )
}

/** Filas "Votaron lo mismo que tú" de un bloque, de mayor a menor %. */
function shareRows(block: ShareBlock): { range: string; points: number }[] {
  const rows = block.tiers.map((t, i) => {
    const upper = i > 0 ? block.tiers[i - 1].minShare : null
    const range = upper === null
      ? `${t.minShare} % o más`
      : t.minShare === 0 ? `Menos del ${upper} %` : `Entre ${t.minShare} % y ${upper} %`
    return { range, points: t.points }
  })
  return [...rows, { range: 'Eres el único', points: block.solePoints }]
}

function sameBlock(a: ShareBlock, b: ShareBlock): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function pointsRange(block: ShareBlock): string {
  const all = [...block.tiers.map(t => t.points), block.solePoints, block.fallbackPoints]
  const min = Math.min(...all)
  const max = Math.max(...all)
  return min === max ? `${min}` : `${min}–${max}`
}

function minVotersText(block: ShareBlock): string {
  return block.minVotersOverride !== null
    ? `al menos ${block.minVotersOverride} votantes en la serie`
    : `un mínimo de votantes en la serie (el ${block.minVotersPercent} % de los que la votan)`
}

function ShareTable({ title, block }: { title: string; block: ShareBlock }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border mb-2">
      <table className="w-full text-sm">
        <thead className="bg-bg-muted/60 font-display text-xs uppercase tracking-display text-text-muted">
          <tr>
            <th className="text-left font-semibold px-4 py-2">{title}</th>
            <th className="text-right font-semibold px-4 py-2">Puntos</th>
          </tr>
        </thead>
        <tbody>
          {shareRows(block).map(({ range, points }) => (
            <tr key={range} className="border-t border-border">
              <td className="px-4 py-2 text-text-primary">{range}</td>
              <td className="px-4 py-2 text-right font-bold text-accent tabular-nums">{signedPoints(points)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Tramos de racha como rangos: "1–2 → +0", "3–6 → +1", …, "18+ → +4". */
function streakRanges(tiers: StreakTier[]): { range: string; bonus: string }[] {
  const out: { range: string; bonus: string }[] = []
  const first = tiers[0]?.from ?? 1
  if (first > 1) out.push({ range: first === 2 ? '1' : `1–${first - 1}`, bonus: '+0' })
  tiers.forEach((t, i) => {
    const next = tiers[i + 1]?.from
    const range = next === undefined ? `${t.from}+` : next - 1 === t.from ? `${t.from}` : `${t.from}–${next - 1}`
    out.push({ range, bonus: signedPoints(t.bonus) })
  })
  return out
}

function cutoffText(minutes: number): string {
  if (minutes === 0) return 'puedes votar o cambiar tu voto hasta la hora de inicio de cada serie.'
  return `puedes votar o cambiar tu voto hasta ${minutes} minutos antes del inicio de cada serie.`
}

function NoRules() {
  return (
    <Section title="Reglas">
      <p className="text-sm text-text-muted">
        Las reglas de puntuación se mostrarán aquí cuando haya una competición de League of Legends en curso.
      </p>
    </Section>
  )
}

function V1Rules({ rules }: { rules: LolRulesSummary }) {
  return (
    <Section title="Puntos por acierto">
      <Rule points={signedPoints(rules.v1!.exact)} title="Marcador exacto">
        <p>Aciertas el resultado exacto de la serie.</p>
      </Rule>
      <Rule points={signedPoints(rules.v1!.winner)} title="Ganador acertado">
        <p>Aciertas qué equipo gana la serie, pero no el marcador.</p>
      </Rule>
      <Rule points={signedPoints(rules.perfectDay.negative)} title="Pleno negativo">
        <p>Una jornada cerrada con 0 aciertos de ganador, contando desde tu primer voto.</p>
      </Rule>
    </Section>
  )
}

function V2Rules({ rules }: { rules: LolRulesSummary }) {
  const winner = rules.winner!
  const exact = rules.exact!
  const shared = sameBlock(winner, exact)
  const tiers = rules.streakTiers
  const example = [1, 2, 3, 4].map(n => signedPoints(streakBonusFor(tiers, n)))

  return (
    <>
      {/* Aciertos */}
      <Section title="Puntos por acierto">
        <p className="text-sm text-text-muted mb-3">
          Cuanta menos gente acierte contigo, más vale tu acierto. El porcentaje se calcula sobre todos los
          participantes que votaron esa serie (es global, no depende de tu club) y solo se muestra cuando se
          cierra la votación.
        </p>

        {shared ? (
          <ShareTable title="Votaron lo mismo que tú" block={winner} />
        ) : (
          <>
            <ShareTable title="Ganador: votaron lo mismo" block={winner} />
            <ShareTable title="Marcador: votaron lo mismo" block={exact} />
          </>
        )}

        <p className="text-xs text-text-muted mb-3">
          El tramo de único exige {minVotersText(winner)}; si no se llega, el acierto vale {winner.fallbackPoints}.
        </p>

        <Rule points={pointsRange(winner)} title="Ganador acertado">
          <p>Aciertas qué equipo gana la serie. Los puntos dependen del % de votantes que eligió ese mismo equipo.</p>
        </Rule>
        <Rule points={pointsRange(exact)} title="Marcador exacto (Bo3 / Bo5)">
          <p>
            En series Bo3 y Bo5 el marcador exacto es otro acierto aparte que se suma al del ganador
            {shared ? ', con los mismos tramos' : ''}, pero el % es el de votantes que eligieron ese mismo marcador.
            En Bo1 solo cuenta el ganador.
          </p>
        </Rule>
        {rules.featuredBonus > 0 && (
          <Rule points={signedPoints(rules.featuredBonus)} title="Partido de la jornada">
            <p>
              En algunas jornadas se elige un partido de la jornada antes de que empiece: si aciertas su ganador,
              sumas {signedPoints(rules.featuredBonus)} extra. Cuenta para la racha como cualquier otra serie.
            </p>
          </Rule>
        )}
        <Rule points="0" title="Fallo o sin voto">
          <p>
            Una serie fallada o sin votar no suma puntos y reinicia tu racha. Las series anteriores a tu primer voto
            de la competición no cuentan: ni como fallo ni para los plenos.
          </p>
        </Rule>
      </Section>

      {/* Rachas */}
      {tiers.length > 0 && (
        <Section title="Rachas">
          <p className="text-sm text-text-muted mb-3">
            {rules.countExactScore
              ? 'Cada acierto de ganador suma 1 a tu racha, y 1 más si también aciertas el marcador exacto (en Bo1 solo cuenta el ganador). '
              : 'Cada acierto de ganador seguido alarga tu racha en 1. '}
            Cada serie que sumes a la racha te da un bonus según cómo quede la racha. La racha se mantiene entre jornadas
            y solo se reinicia al cambiar de fase o al fallar el ganador o no votar una serie.
            {rules.countExactScore
              ? ' Fallar solo el marcador exacto no la reinicia.'
              : ' El marcador exacto no cuenta para la racha.'}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
            {streakRanges(tiers).map(({ range, bonus }) => (
              <div key={range} className="rounded-lg bg-accent/10 border border-accent/25 py-2">
                <p className="text-[11px] text-text-muted">{range}</p>
                <p className="font-display text-base font-bold text-accent tabular-nums">{bonus}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-3">
            Ejemplo: con 4 aciertos de ganador seguidos (sin exactos) sumas {example.join(', ')} de bonus, encima de los
            puntos de cada acierto
            {rules.countExactScore ? '. Si alguno es además exacto, tu racha sube más deprisa.' : '.'}
          </p>
        </Section>
      )}

      {/* Plenos */}
      <Section title="Plenos">
        <Rule points={signedPoints(rules.perfectDay.negative)} title="Pleno negativo">
          <p>
            Una jornada cerrada con 0 aciertos de ganador, ya sea por fallos, por no votar o por una mezcla. Cuenta
            desde tu primer voto: en la jornada de tu primer voto solo cuentan las series desde ese voto (en un club,
            además, desde el día en que entraste).
          </p>
        </Rule>
        <Rule points={signedPoints(rules.perfectDay.positive)} title="Pleno positivo">
          <p>
            Votas todas las series de la jornada que cuentan para ti y aciertas todos los ganadores.
            {rules.perfectDay.positive === 0 ? ' No da puntos, pero sirve para desempatar.' : ' También sirve para desempatar.'}
          </p>
        </Rule>
      </Section>
    </>
  )
}

const TIEBREAK = [
  { title: 'Puntos', desc: 'Gana quien más puntos tenga.' },
  { title: 'Plenos positivos', desc: 'Jornadas en las que votaste todas las series y acertaste todos los ganadores.' },
  { title: 'Mejor racha de la fase', desc: 'La racha más larga en la fase en curso.' },
  { title: 'Antigüedad', desc: 'Si todo lo anterior empata, va antes la cuenta más antigua.' },
]

export default async function ReglasPage() {
  const supabase = await createClient()
  const editions = await getActiveLolEditions(supabase)
  const rules = editions.length > 0 ? await getEditionRules(supabase, pickLolEdition(editions, undefined).id) : null

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">

      <div>
        <h1 className="heading-display text-2xl font-bold text-text-primary">Cómo jugar</h1>
        <p className="text-sm text-text-muted mt-1">
          Reglas oficiales de las predicciones de League of Legends.
        </p>
      </div>

      {rules && (
        <div className="flex items-start gap-3 rounded-card border border-warning/40 bg-warning/10 px-5 py-4">
          <span className="text-lg shrink-0 mt-0.5">⏱</span>
          <div className="text-sm text-text-primary">
            <p>
              <strong>Corte de votación:</strong> {cutoffText(rules.cutoffMinutes)}
            </p>
            <p className="text-xs mt-1 opacity-80">Cada partido muestra su hora de cierre.</p>
          </div>
        </div>
      )}

      {!rules ? <NoRules /> : rules.version === 2 ? <V2Rules rules={rules} /> : <V1Rules rules={rules} />}

      {/* Desempate */}
      <Section title="Desempate">
        <ol className="space-y-3">
          {TIEBREAK.map(({ title, desc }, i) => (
            <li key={title} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent ring-1 ring-inset ring-accent/30 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-text-primary">{title}</p>
                <p className="text-xs text-text-muted mt-0.5">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

    </div>
  )
}
