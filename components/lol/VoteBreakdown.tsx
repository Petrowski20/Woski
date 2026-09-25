import { sameScore, type SeriesScore } from '@/utils/lol/series'
import type { VoteShare } from '@/utils/lol/types'
import { formatSeriesScore } from './format'

interface Props {
  distribution: { total: number; shares: VoteShare[] }
  mine: SeriesScore
  homeName: string
  awayName: string
}

// Desglose de votos por resultado. Solo se renderiza si el usuario ya votó.
export default function VoteBreakdown({ distribution, mine, homeName, awayName }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-text-muted">
        Qué ha votado la gente · {distribution.total} voto{distribution.total !== 1 ? 's' : ''}
      </p>
      <ul className="flex flex-col gap-1">
        {distribution.shares.map((share) => {
          const isMine = sameScore(share, mine)
          const homeSide = share.home > share.away
          return (
            <li
              key={`${share.home}-${share.away}`}
              className={`grid grid-cols-[5.5rem_1fr_2.75rem] items-center gap-2 px-2 py-1 rounded-md text-xs ${
                isMine ? 'bg-accent/10 ring-1 ring-accent font-semibold' : ''
              }`}
            >
              <span className="truncate text-text-primary">
                {formatSeriesScore(share, homeName, awayName)}
              </span>
              <span className="h-1.5 rounded-full bg-bg-muted overflow-hidden">
                <span
                  className={`block h-full rounded-full ${homeSide ? 'bg-team-a' : 'bg-team-b'}`}
                  style={{ width: `${share.pct}%` }}
                />
              </span>
              <span className="text-right tabular-nums text-text-primary">
                {share.pct}%
                {isMine && <span className="sr-only"> (tu voto)</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
