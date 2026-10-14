export const metadata = { title: 'Cómo jugar · Woski' }

// Reglas oficiales de LoL (rulesets v2). Las calcula el motor de la BD
// (migración 20261014120002); esta página solo las explica.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 p-6 shadow-sm">
      <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4">{title}</h2>
      {children}
    </section>
  )
}

function Rule({ points, title, children }: { points: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-gray-50 dark:border-slate-800 last:border-0">
      <span className="shrink-0 w-12 text-center text-lg font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
        {points}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</p>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 space-y-1">{children}</div>
      </div>
    </div>
  )
}

const TIERS = [
  { range: '50 % o más', points: 2 },
  { range: 'Entre 25 % y 50 %', points: 3 },
  { range: 'Menos del 25 %', points: 4 },
  { range: 'Eres el único', points: 6 },
]

const STREAK = [
  { range: '1–2', bonus: '+0' },
  { range: '3–6', bonus: '+1' },
  { range: '7–11', bonus: '+2' },
  { range: '12–17', bonus: '+3' },
  { range: '18+', bonus: '+4' },
]

const TIEBREAK = [
  { title: 'Puntos', desc: 'Gana quien más puntos tenga.' },
  { title: 'Plenos positivos', desc: 'Jornadas en las que votaste todas las series y acertaste todos los ganadores.' },
  { title: 'Mejor racha de la fase', desc: 'La racha de aciertos de ganador más larga en la fase en curso.' },
  { title: 'Antigüedad', desc: 'Si todo lo anterior empata, va antes la cuenta más antigua.' },
]

export default function ReglasPage() {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Cómo jugar</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Reglas oficiales de las predicciones de League of Legends.
        </p>
      </div>

      {/* Corte de votación */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 px-5 py-4">
        <span className="text-lg shrink-0 mt-0.5">⏱</span>
        <div className="text-sm text-amber-900 dark:text-amber-200">
          <p>
            <strong>Corte de votación:</strong> puedes votar o cambiar tu voto hasta la hora de inicio de cada serie.
          </p>
          <p className="text-xs mt-1 opacity-80">Cada partido muestra su hora de cierre.</p>
        </div>
      </div>

      {/* Aciertos */}
      <Section title="Puntos por acierto">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Cuanta menos gente acierte contigo, más vale tu acierto. El porcentaje se calcula sobre todos los
          participantes que votaron esa serie (es global, no depende de tu club) y solo se muestra cuando se
          cierra la votación.
        </p>

        <div className="overflow-hidden rounded-lg border border-gray-100 dark:border-slate-800 mb-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800/60 text-xs text-gray-500 dark:text-gray-400">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Votaron lo mismo que tú</th>
                <th className="text-right font-semibold px-4 py-2">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map(({ range, points }) => (
                <tr key={range} className="border-t border-gray-100 dark:border-slate-800">
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{range}</td>
                  <td className="px-4 py-2 text-right font-bold text-blue-600 dark:text-blue-400 tabular-nums">+{points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">
          El tramo de único exige un mínimo de votantes en la serie; si no se llega, el acierto vale 2.
        </p>

        <Rule points="2–6" title="Ganador acertado">
          <p>Aciertas qué equipo gana la serie. Los puntos dependen del % de votantes que eligió ese mismo equipo.</p>
        </Rule>
        <Rule points="2–6" title="Marcador exacto (Bo3 / Bo5)">
          <p>
            En series Bo3 y Bo5 el marcador exacto es otro acierto aparte que se suma al del ganador, con los
            mismos tramos, pero el % es el de votantes que eligieron ese mismo marcador. En Bo1 solo cuenta el
            ganador.
          </p>
        </Rule>
        <Rule points="+2" title="Partido de la jornada (Bo1)">
          <p>
            En jornadas Bo1 se elige un partido de la jornada antes de que empiece: si aciertas su ganador, sumas
            +2 extra. Cuenta para la racha como cualquier otra serie.
          </p>
        </Rule>
        <Rule points="0" title="Fallo o sin voto">
          <p>Una serie fallada o sin votar no suma puntos y reinicia tu racha.</p>
        </Rule>
      </Section>

      {/* Rachas */}
      <Section title="Rachas">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Cada acierto de ganador seguido alarga tu racha. Cada serie que sumes a la racha te da un bonus según su
          longitud. La racha se mantiene entre jornadas y solo se reinicia al cambiar de fase (Play-In → Swiss →
          Play-offs) o al fallar o no votar una serie. El marcador exacto no cuenta para la racha.
        </p>
        <div className="grid grid-cols-5 gap-2 text-center">
          {STREAK.map(({ range, bonus }) => (
            <div key={range} className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 py-2">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{range}</p>
              <p className="text-base font-extrabold text-blue-700 dark:text-blue-400 tabular-nums">{bonus}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-3">
          Ejemplo: con 4 aciertos seguidos sumas +0, +0, +1 y +1 de bonus, encima de los puntos de cada acierto.
        </p>
      </Section>

      {/* Plenos */}
      <Section title="Plenos">
        <Rule points="−2" title="Pleno negativo">
          <p>
            Una jornada cerrada con 0 aciertos de ganador, ya sea por fallos, por no votar o por una mezcla. Cuenta
            desde la jornada de tu primera predicción (en un club, desde que entraste).
          </p>
        </Rule>
        <Rule points="0" title="Pleno positivo">
          <p>Votas todas las series de la jornada y aciertas todos los ganadores. No da puntos, pero sirve para desempatar.</p>
        </Rule>
      </Section>

      {/* Desempate */}
      <Section title="Desempate">
        <ol className="space-y-3">
          {TIEBREAK.map(({ title, desc }, i) => (
            <li key={title} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

    </div>
  )
}
