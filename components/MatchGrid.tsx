'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import MatchCard from './MatchCard';
import type { MatchCardHandle } from './MatchCard';
import { saveAllPredictionsAction } from '@/app/(main)/actions';
import type { PredictionDraft } from '@/app/(main)/actions';

// Extrae YYYY-MM-DD en UTC de un match_date ISO
const toUtcDay = (isoDate: string) => isoDate.slice(0, 10);

const formatPill = (isoDay: string) =>
  new Date(isoDay + 'T12:00:00Z').toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

export default function MatchGrid({ matches, activeLeagueId }: { matches: any[]; activeLeagueId?: number | null }) {
  const router = useRouter();
  const [searchTerm, setSearchTerm]   = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);

  // Pending predictions — useRef to avoid re-renders on every keystroke,
  // useState only for the count (to show/hide the sticky button)
  const pendingRef  = useRef<Map<number, PredictionDraft>>(new Map());
  const cardRefs    = useRef<Map<number, MatchCardHandle>>(new Map());
  const [pendingCount, setPendingCount] = useState(0);

  const handlePendingChange = useCallback((
    matchId: number,
    draft: { homeGoals: number | null; awayGoals: number | null; advancingTeamId: number | null } | null
  ) => {
    if (draft) {
      pendingRef.current.set(matchId, { matchId, ...draft });
    } else {
      pendingRef.current.delete(matchId);
    }
    setPendingCount(pendingRef.current.size);
  }, []);

  const handleSaveAll = async () => {
    const drafts = Array.from(pendingRef.current.values());
    if (drafts.length === 0) return;

    setIsSavingAll(true);
    try {
      const { saved, failed } = await saveAllPredictionsAction(drafts);

      // Confirmación inmediata: limpiar mapa y actualizar cada tarjeta sin esperar router.refresh()
      const failedIds = new Set(failed.map((f) => f.matchId));
      for (const draft of drafts) {
        if (!failedIds.has(draft.matchId)) {
          pendingRef.current.delete(draft.matchId);
          cardRefs.current.get(draft.matchId)?.confirmSaved();
        }
      }
      setPendingCount(pendingRef.current.size);

      if (failed.length === 0) {
        toast.success(`✅ ${saved} predicción${saved !== 1 ? 'es' : ''} guardada${saved !== 1 ? 's' : ''}`);
      } else {
        if (saved > 0) toast.success(`✅ ${saved} guardada${saved !== 1 ? 's' : ''}`);
        toast.error(`❌ ${failed.length} no se pudieron guardar`);
      }
      // Refresh server data so saved/savedAway in MatchCards sync via the prop useEffect
      router.refresh();
    } catch {
      toast.error('Error inesperado al guardar las predicciones');
    } finally {
      setIsSavingAll(false);
    }
  };

  // Días únicos ordenados, derivados de los partidos recibidos
  const uniqueDays = useMemo(() => {
    const seen = new Set<string>();
    for (const m of matches) seen.add(toUtcDay(m.match_date));
    return Array.from(seen).sort();
  }, [matches]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return matches.filter((m) => {
      if (term) {
        const home = (m.home_team?.name ?? '').toLowerCase();
        const away = (m.away_team?.name ?? '').toLowerCase();
        if (!home.includes(term) && !away.includes(term)) return false;
      }
      if (selectedDay && toUtcDay(m.match_date) !== selectedDay) return false;
      return true;
    });
  }, [matches, searchTerm, selectedDay]);

  const hasFilters = searchTerm !== '' || selectedDay !== null;
  const clearFilters = () => { setSearchTerm(''); setSelectedDay(null); };

  return (
    <div className="flex flex-col gap-4">

      {/* ── Barra de herramientas ── */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 p-4 flex flex-col gap-3 shadow-sm">

        {/* Buscador */}
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por equipo…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-9 py-2 text-sm bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Píldoras de fecha */}
        {uniqueDays.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedDay(null)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                selectedDay === null
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              Todos
            </button>
            {uniqueDays.map((day) => (
              <button
                key={day}
                onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors ${
                  selectedDay === day
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                {formatPill(day)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contador de resultados */}
      {hasFilters && filtered.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
          {filtered.length} partido{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* ── Empty state ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="text-5xl">🔍</span>
          <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Sin resultados</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
            No hay partidos que coincidan con tu búsqueda.
          </p>
          <button
            onClick={clearFilters}
            className="mt-1 px-4 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        /* ── Lista de partidos ── */
        filtered.map((match) => {
          const formattedDate = new Intl.DateTimeFormat('es-ES', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          }).format(new Date(match.match_date));

          let status: 'PENDING' | 'PREDICTED' | 'FINISHED' = 'PENDING';
          if (match.status === 'FINISHED') status = 'FINISHED';
          else if (match.myPred) status = 'PREDICTED';

          const isLocked =
            new Date(match.match_date).getTime() - Date.now() < 3_600_000 ||
            match.status === 'FINISHED' ||
            match.status === 'CANCELLED';

          return (
            <MatchCard
              key={match.id}
              ref={(el) => {
                if (el) cardRefs.current.set(match.id, el);
                else cardRefs.current.delete(match.id);
              }}
              id={match.id}
              home={match.home_team}
              away={match.away_team}
              homeTeamId={match.home_team_id}
              awayTeamId={match.away_team_id}
              group={match.group_letter ?? '?'}
              matchStage={match.stage ?? 'GROUP'}
              date={formattedDate}
              status={status}
              isLocked={isLocked}
              homePrediction={match.myPred?.pred_home_goals}
              awayPrediction={match.myPred?.pred_away_goals}
              predAdvancingTeamId={match.myPred?.pred_advancing_team_id ?? null}
              realAdvancingTeamId={match.advancing_team_id ?? null}
              homeRealResult={match.home_goals}
              awayRealResult={match.away_goals}
              pointsEarned={match.myPred?.points_earned ?? 0}
              stadium={match.stadium}
              referee={match.referee}
              activeLeagueId={activeLeagueId}
              onPendingChange={handlePendingChange}
            />
          );
        })
      )}

      {/* ── Botón sticky "Guardar todo" — aparece cuando hay ≥2 predicciones pendientes ── */}
      {pendingCount >= 2 && (
        <button
          onClick={handleSaveAll}
          disabled={isSavingAll}
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-xl hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-wait animate-in fade-in zoom-in-95 duration-200"
        >
          <span>💾</span>
          {isSavingAll
            ? 'Guardando…'
            : `Guardar ${pendingCount} predicciones`}
        </button>
      )}
    </div>
  );
}
