'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { saveLolPredictionsAction } from '@/app/(main)/lol/actions'
import { isPredictionLocked, sameScore, type SeriesScore } from '@/utils/lol/series'
import type { LolEditionOption, LolMatchView, SaveErrorCode, SaveMatchResult } from '@/utils/lol/types'
import SearchInput from '@/components/shared/SearchInput'
import NoResults from '@/components/shared/NoResults'
import SaveAllButton from '@/components/shared/SaveAllButton'
import EditionSelector from './EditionSelector'
import LolMatchCard from './LolMatchCard'
import { SliderHelpButton, SliderHelpProvider } from './SliderHelp'
import { SAVE_ERROR_COPY } from './saveErrors'

interface Props {
  editions: LolEditionOption[]
  selectedEditionId: number
  matches: LolMatchView[]
  sidebar: React.ReactNode
}

type Confirmed = Record<number, Extract<SaveMatchResult, { ok: true }>>

export default function LolCalendar({ editions, selectedEditionId, matches, sidebar }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [now, setNow] = useState(() => Date.now())

  // Borradores sin guardar, partidos guardándose y errores por partido
  const [drafts, setDrafts] = useState<Record<number, SeriesScore>>({})
  const [saving, setSaving] = useState<Set<number>>(new Set())
  const [errors, setErrors] = useState<Record<number, SaveErrorCode>>({})
  // Partidos que el servidor dijo que estaban bloqueados aunque el reloj
  // local aún no lo crea (desfase de hora del dispositivo).
  const [serverLocked, setServerLocked] = useState<Set<number>>(new Set())
  // Resultado confirmado por la acción, mostrado al instante hasta que llegan
  // los datos revalidados del servidor.
  const [confirmed, setConfirmed] = useState<Confirmed>({})
  const [prevMatches, setPrevMatches] = useState(matches)
  if (prevMatches !== matches) {
    setPrevMatches(matches)
    setConfirmed({})
  }

  // Re-evaluar bloqueos cada 30 s (mismo criterio que el Mundial)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const views = useMemo(() => matches.map((m): LolMatchView => {
    const c = confirmed[m.id]
    if (!c) return m
    return {
      ...m,
      myPrediction: { ...c.prediction, points: null },
      distribution: c.distribution ?? m.distribution,
    }
  }), [matches, confirmed])

  const lockedIds = useMemo(() => new Set(
    views.filter(m => serverLocked.has(m.id) || isPredictionLocked(m.status, m.date, now)).map(m => m.id),
  ), [views, serverLocked, now])

  // Solo cuentan como pendientes los borradores que difieren de lo guardado
  // y cuyo partido sigue abierto.
  const pendingIds = useMemo(() => views
    .filter(m => drafts[m.id] && !lockedIds.has(m.id) && !sameScore(drafts[m.id], m.myPrediction))
    .map(m => m.id), [views, drafts, lockedIds])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return views
    return views.filter(m =>
      [m.home.name, m.home.tag, m.away.name, m.away.tag].some(s => s.toLowerCase().includes(term)),
    )
  }, [views, search])

  const onDraftChange = useCallback((matchId: number, score: SeriesScore) => {
    setDrafts(d => ({ ...d, [matchId]: score }))
    setErrors(e => {
      if (!(matchId in e)) return e
      const next = { ...e }
      delete next[matchId]
      return next
    })
  }, [])

  const save = useCallback(async (ids: number[]) => {
    const payload = ids.filter(id => drafts[id]).map(id => ({ matchId: id, ...drafts[id] }))
    if (payload.length === 0) return
    const batch = payload.length > 1
    const payloadIds = payload.map(p => p.matchId)

    setSaving(s => new Set([...s, ...payloadIds]))
    setErrors(e => {
      const next = { ...e }
      for (const id of payloadIds) delete next[id]
      return next
    })

    const failWith = (code: SaveErrorCode) =>
      setErrors(e => ({ ...e, ...Object.fromEntries(payloadIds.map(id => [id, code])) }))

    try {
      const res = await saveLolPredictionsAction(payload)

      if (!res.ok) {
        failWith(res.code)
        toast.error(SAVE_ERROR_COPY[res.code].text, {
          action: { label: 'Iniciar sesión', onClick: () => router.push('/login') },
        })
        return
      }

      const ok = res.results.filter((r): r is Extract<SaveMatchResult, { ok: true }> => r.ok)
      const failed = res.results.filter((r): r is Extract<SaveMatchResult, { ok: false }> => !r.ok)

      setConfirmed(c => ({ ...c, ...Object.fromEntries(ok.map(r => [r.matchId, r])) }))
      setDrafts(d => {
        const next = { ...d }
        for (const r of ok) delete next[r.matchId]
        // Un partido bloqueado ya no se puede guardar: se descarta el borrador
        for (const r of failed) if (r.code === 'LOCKED') delete next[r.matchId]
        return next
      })
      setErrors(e => ({ ...e, ...Object.fromEntries(failed.map(r => [r.matchId, r.code])) }))
      const newlyLocked = failed.filter(r => r.code === 'LOCKED').map(r => r.matchId)
      if (newlyLocked.length) setServerLocked(s => new Set([...s, ...newlyLocked]))

      if (failed.length === 0) {
        toast.success(batch ? `${ok.length} predicciones guardadas` : 'Predicción guardada')
      } else if (batch) {
        toast.error(
          ok.length > 0
            ? `Se guardaron ${ok.length}, pero ${failed.length} no. Revisa los partidos marcados.`
            : 'No se pudo guardar ninguna predicción. Revisa los partidos marcados.',
        )
      }
    } catch {
      // La acción no llegó a responder: sin conexión o fallo del servidor
      failWith(typeof navigator !== 'undefined' && !navigator.onLine ? 'NETWORK' : 'SERVER')
      if (batch) toast.error(SAVE_ERROR_COPY.SERVER.text)
    } finally {
      setSaving(s => {
        const next = new Set(s)
        for (const id of payloadIds) next.delete(id)
        return next
      })
    }
  }, [drafts, router])

  const onSave = useCallback((matchId: number) => { void save([matchId]) }, [save])

  const savingAll = pendingIds.length > 1 && pendingIds.every(id => saving.has(id))

  return (
    <SliderHelpProvider>
      {/* Buscador fijo bajo la barra de navegación */}
      <div className="sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-bg-surface/95 backdrop-blur border-b border-border">
        <SearchInput value={search} onChange={setSearch} />
      </div>

      <div className="mt-4 mb-6">
        <EditionSelector editions={editions} selectedId={selectedEditionId} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <section className="lg:col-span-8 flex flex-col gap-4" aria-labelledby="lol-matches-title">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 id="lol-matches-title" className="text-2xl font-bold text-text-primary">Partidos</h1>
              <SliderHelpButton />
            </div>
            {search && filtered.length > 0 && (
              <span className="text-xs text-text-muted">
                {filtered.length} partido{filtered.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {matches.length === 0 ? (
            <p className="py-16 text-center text-sm text-text-muted">
              Esta competición todavía no tiene partidos programados. ¡Vuelve pronto!
            </p>
          ) : filtered.length === 0 ? (
            <NoResults onClear={() => setSearch('')} clearLabel="Limpiar búsqueda" />
          ) : (
            filtered.map(m => (
              <LolMatchCard
                key={m.id}
                match={m}
                locked={lockedIds.has(m.id)}
                draft={drafts[m.id] ?? null}
                saving={saving.has(m.id)}
                error={errors[m.id] ?? null}
                onDraftChange={onDraftChange}
                onSave={onSave}
              />
            ))
          )}
        </section>

        <aside className="lg:col-span-4 flex flex-col gap-6 lg:sticky lg:top-36">
          {sidebar}
        </aside>
      </div>

      {pendingIds.length > 1 && (
        <SaveAllButton count={pendingIds.length} saving={savingAll} onClick={() => void save(pendingIds)} />
      )}
    </SliderHelpProvider>
  )
}
