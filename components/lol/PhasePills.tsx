import Link from 'next/link'
import type { LolPhaseStatus } from '@/utils/lol/types'

// Píldoras de fase (clasificación, premios): cada fase en su orden y Total
// al final; una fase nueva entra sola entre la última y Total. 🏆 en las
// terminadas. Solo con dos o más fases.

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'page' : undefined}
      className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        active
          ? 'bg-accent bg-accent-gradient text-on-accent shadow-glow-accent'
          : 'bg-bg-muted/60 text-text-muted ring-1 ring-inset ring-border hover:text-text-primary hover:ring-accent/40'
      }`}
    >
      {children}
    </Link>
  )
}

export default function PhasePills({ phases, editionFinished, activePhaseId, hrefFor }: {
  phases: LolPhaseStatus[]
  editionFinished: boolean
  /** null = Total */
  activePhaseId: number | null
  hrefFor: (phaseId: number | null) => string
}) {
  if (phases.length < 2) return null
  return (
    <nav aria-label="Fase" className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 py-0.5 -mt-3 mb-5">
      {phases.map(p => (
        <Pill key={p.id} href={hrefFor(p.id)} active={activePhaseId === p.id}>
          {p.name}
          {p.finished && <span aria-label="terminada">🏆</span>}
        </Pill>
      ))}
      <Pill href={hrefFor(null)} active={activePhaseId === null}>
        Total
        {editionFinished && <span aria-label="terminada">🏆</span>}
      </Pill>
    </nav>
  )
}
