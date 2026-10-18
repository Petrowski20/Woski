import type { ScoreBreakdown } from '@/utils/lol/types'

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

export default function PointsBreakdown({ breakdown }: { breakdown: ScoreBreakdown }) {
  const v2 = breakdown.rulesVersion === 2
  const parts = [
    breakdown.baseWinner > 0 && (
      <Chip key="w" label="Ganador" points={breakdown.baseWinner}
            detail={v2 ? tierLabel(breakdown.winnerTier, breakdown.winnerShare) : null} />
    ),
    breakdown.baseExact > 0 && (
      <Chip key="e" label="Marcador" points={breakdown.baseExact}
            detail={v2 ? tierLabel(breakdown.exactTier, breakdown.exactShare) : null} />
    ),
    // Racha tras esta serie (con count_exact_score el exacto suma 2) y su bonus.
    v2 && breakdown.streakLength > 0 && (
      <Chip key="s" label={`Racha ${breakdown.streakLength}`} points={breakdown.streakBonus} />
    ),
    breakdown.featuredBonus > 0 && (
      <Chip key="f" label="Partido de la jornada" points={breakdown.featuredBonus} />
    ),
  ].filter(Boolean)

  if (parts.length === 0) return null
  return <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Desglose de puntos">{parts}</ul>
}
