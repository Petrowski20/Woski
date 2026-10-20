import type { ScoreBreakdown, StreakStep } from '@/utils/lol/types'

// Solo presenta el desglose que calcula la BD (lol_score_breakdown);
// aquí no se decide ningún punto.

function tierLabel(tier: string | null, share: number | null): string | null {
  if (tier === 'sole') return 'único'
  if (tier === 'fallback') return 'único, pocos votantes'
  if (share === null) return null
  return `${Math.round(share)} % igual`
}

function Chip({ label, points, detail }: { label: string; points: number; detail?: string | null }) {
  return (
    <li className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-muted ring-1 ring-inset ring-border text-xs text-text-muted">
      <span>{label}</span>
      <strong className="text-text-primary tabular-nums">+{points}</strong>
      {detail && <span className="opacity-80">({detail})</span>}
    </li>
  )
}

// Racha tras una predicción (exact_as_prediction): "Racha 3 +1 (ganador)",
// "Racha 0 (marcador fallado)".
function StepChip({ step }: { step: StreakStep }) {
  const what = step.prediction === 'winner' ? 'ganador' : 'marcador'
  return (
    <li className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ring-1 ring-inset text-xs ${
      step.hit ? 'bg-bg-muted ring-border text-text-muted' : 'bg-danger/10 ring-danger/30 text-danger'
    }`}>
      <span>Racha {step.length}</span>
      {step.hit && <strong className="text-text-primary tabular-nums">+{step.bonus}</strong>}
      <span className="opacity-80">({step.hit ? what : `${what} fallado`})</span>
    </li>
  )
}

export default function PointsBreakdown({ breakdown }: { breakdown: ScoreBreakdown }) {
  const v2 = breakdown.rulesVersion === 2
  // Racha por predicción (exact_as_prediction): cada paso va tras su acierto.
  // Si falla el ganador basta ese paso (el marcador también cuenta como fallo).
  const steps = v2 && breakdown.streakSteps ? breakdown.streakSteps : null
  const step = (prediction: StreakStep['prediction']) => {
    const st = steps?.find(x => x.prediction === prediction)
    if (!st || (prediction === 'exact' && !steps?.[0]?.hit)) return null
    return <StepChip key={`s-${prediction}`} step={st} />
  }
  const parts = [
    breakdown.baseWinner > 0 && (
      <Chip key="w" label="Ganador" points={breakdown.baseWinner}
            detail={v2 ? tierLabel(breakdown.winnerTier, breakdown.winnerShare) : null} />
    ),
    step('winner'),
    breakdown.baseExact > 0 && (
      <Chip key="e" label="Marcador" points={breakdown.baseExact}
            detail={v2 ? tierLabel(breakdown.exactTier, breakdown.exactShare) : null} />
    ),
    step('exact'),
    // Racha tras esta serie (con count_exact_score el exacto suma 2) y su bonus.
    v2 && !steps && breakdown.streakLength > 0 && (
      <Chip key="s" label={`Racha ${breakdown.streakLength}`} points={breakdown.streakBonus} />
    ),
    breakdown.featuredBonus > 0 && (
      <Chip key="f" label="Partido de la jornada" points={breakdown.featuredBonus} />
    ),
  ].filter(Boolean)

  if (parts.length === 0) return null
  return <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Desglose de puntos">{parts}</ul>
}
