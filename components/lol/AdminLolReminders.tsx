'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { formatMention, reminderBlock, reminderMessage, type ReminderSeries } from '@/utils/admin/reminders'
import { formatMatchDate, formatTimeLeft } from './format'

export interface ReminderRow {
  id: number
  edition: string
  phase: string
  home: string
  away: string
  bestOf: number
  featured: boolean
  date: string
  locksAt: string
  participants: number
  missing: string[]
  /** No se pudo cargar la participación de esta serie. */
  failed: boolean
}

const btn = 'px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50'
const btnPlain = `${btn} border border-border text-text-primary hover:border-accent/50 hover:text-accent`
const btnPrimary = `${btn} bg-accent bg-accent-gradient text-on-accent shadow-glow-accent disabled:shadow-none`

function toSeries(r: ReminderRow): ReminderSeries {
  return { title: `${r.home} vs ${r.away}`, when: formatMatchDate(r.date), missing: r.missing }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Lista copiada. Pégala en WhatsApp.')
  } catch {
    toast.error('No se ha podido copiar. Selecciona el texto a mano.')
  }
}

// Solo copia texto al portapapeles: no envía WhatsApp ni correos.
export default function AdminLolReminders({ rows }: { rows: ReminderRow[] }) {
  const [mention, setMention] = useState(true)
  const [now] = useState(() => Date.now())
  const pending = rows.filter(r => r.missing.length > 0)

  if (rows.length === 0) {
    return (
      <p className="bg-bg-elevated border border-border rounded-card shadow-card px-4 py-6 text-sm text-text-muted text-center">
        No hay ninguna serie con la votación abierta.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-bg-elevated border border-border rounded-card shadow-card p-3">
        <label className="inline-flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" checked={mention} onChange={e => setMention(e.target.checked)} />
          Con @ delante del nick
        </label>
        <button
          type="button"
          className={btnPrimary}
          disabled={pending.length === 0}
          onClick={() => copy(reminderMessage(rows.map(toSeries), mention))}
        >
          Copiar todas ({pending.length})
        </button>
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map(r => (
          <li key={r.id} className="bg-bg-elevated border border-border rounded-card shadow-card p-4 flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-text-primary">
                  {r.home} <span className="font-normal text-text-muted">vs</span> {r.away}
                  {r.featured && <span className="ml-1.5 text-xs" title="Partido de la jornada">⭐</span>}
                </p>
                <p className="text-xs text-text-muted">
                  <span className="capitalize">{formatMatchDate(r.date)}</span> · {r.phase} · Bo{r.bestOf} · cierra{' '}
                  <strong className="text-text-primary">{formatTimeLeft(r.locksAt, now)}</strong>
                </p>
                <p className="text-xs text-text-muted">{r.edition}</p>
              </div>
              <button
                type="button"
                className={btnPlain}
                disabled={r.missing.length === 0}
                onClick={() => copy(reminderBlock(toSeries(r), mention))}
              >
                Copiar lista
              </button>
            </div>

            {r.failed ? (
              <p role="alert" className="text-sm text-danger">No se ha podido cargar quién ha votado.</p>
            ) : r.participants === 0 ? (
              <p className="text-sm text-text-muted">Aún no hay participantes en esta edición.</p>
            ) : r.missing.length === 0 ? (
              <p className="text-sm text-success">✓ Han votado todos ({r.participants}).</p>
            ) : (
              <>
                <p className="text-sm text-text-primary">
                  Faltan <strong>{r.missing.length}</strong> de {r.participants}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {r.missing.map(n => (
                    <li key={n} className="px-2 py-0.5 rounded-full text-xs bg-danger/10 text-danger ring-1 ring-inset ring-danger/30 break-all">
                      {formatMention(n, mention)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
