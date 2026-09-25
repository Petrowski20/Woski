import Link from 'next/link'
import Image from 'next/image'
import type { RankingRow } from '@/utils/lol/types'

interface Props {
  title: string
  top5: RankingRow[]
  /** Fila propia cuando quedas fuera del top 5. */
  me: RankingRow | null
  userId: string
}

function Row({ row, isMe }: { row: RankingRow; isMe: boolean }) {
  return (
    <div
      className={`flex items-center justify-between p-2 rounded-lg text-sm ${isMe ? 'bg-accent/10 ring-1 ring-accent/40' : ''}`}
      aria-current={isMe || undefined}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`font-bold w-5 text-center shrink-0 tabular-nums ${row.position <= 3 ? 'text-accent' : 'text-text-muted'}`}>
          {row.position}
        </span>
        <div className="relative w-6 h-6 rounded-full overflow-hidden bg-bg-muted border border-border flex items-center justify-center shrink-0">
          {row.avatarUrl ? (
            <Image src={row.avatarUrl} alt={row.nickname} fill sizes="24px" className="object-cover" />
          ) : (
            <span className="text-[9px] font-bold text-accent">{row.nickname.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <span className={`font-medium truncate ${isMe ? 'text-text-primary' : 'text-text-muted'}`}>
          {row.nickname} {isMe && '(Tú)'}
        </span>
      </div>
      <span className="font-bold text-text-primary shrink-0 tabular-nums">
        {row.points} <span className="text-xs text-text-muted font-normal">pts</span>
      </span>
    </div>
  )
}

export default function RankingTop5Card({ title, top5, me, userId }: Props) {
  return (
    <div className="bg-bg-elevated rounded-xl shadow-sm border border-border p-5">
      <h2 className="font-bold text-text-primary border-b border-border pb-3 mb-4">{title}</h2>

      <div className="flex flex-col gap-2">
        {top5.length === 0 ? (
          <p className="text-xs text-text-muted text-center py-2">
            Todavía no hay clasificación: se formará cuando se jueguen los primeros partidos.
          </p>
        ) : (
          top5.map(row => <Row key={row.profileId} row={row} isMe={row.profileId === userId} />)
        )}

        {me && (
          <>
            <div className="text-center text-text-muted text-xs leading-none" aria-hidden>⋯</div>
            <Row row={me} isMe />
          </>
        )}
      </div>

      <Link
        href="/lol/clasificacion"
        className="block w-full mt-4 py-2 text-sm text-center text-accent font-medium border border-accent/30 rounded-lg bg-accent/5 hover:bg-accent/10 transition-colors"
      >
        Ver clasificación completa
      </Link>
    </div>
  )
}
