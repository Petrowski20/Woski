'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import MatchCard from './MatchCard';
import type { MatchCardHandle } from './MatchCard';
import { saveAllPredictionsAction } from '@/app/(main)/actions';
import type { PredictionDraft } from '@/app/(main)/actions';
import SearchInput from './shared/SearchInput';
import NoResults from './shared/NoResults';
import SaveAllButton from './shared/SaveAllButton';

// Extrae YYYY-MM-DD en UTC de un match_date ISO
const toUtcDay = (isoDate: string) => isoDate.slice(0, 10);

const formatPill = (isoDay: string) =>
  new Date(isoDay + 'T12:00:00Z').toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

export default function MatchGrid({ matches, activeLeagueId }: { matches: any[]; activeLeagueId?: number | null }) {
  const router = useRouter();
  const [searchTerm, setSearchTerm]     = useState('');
  const [selectedDay, setSelectedDay]   = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll]   = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Re-evaluate lock state every 30 s so cards lock automatically when the cutoff passes
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const scrollTargetId = useMemo(
    () => matches.find((m) => m.status !== 'FINISHED')?.id ?? null,
    [matches],
  );
  const scrollTargetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollTargetRef.current) return;
    const t = setTimeout(() => {
      scrollTargetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Grupos únicos ordenados (solo fase de grupos, group_letter no nulo)
  const uniqueGroups = useMemo(() => {
    const seen = new Set<string>();
    for (const m of matches) if (m.group_letter) seen.add(m.group_letter);
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
      if (selectedGroup && m.group_letter !== selectedGroup) return false;
      return true;
    });
  }, [matches, searchTerm, selectedDay, selectedGroup]);

  const hasFilters = searchTerm !== '' || selectedDay !== null || selectedGroup !== null;
  const clearFilters = () => { setSearchTerm(''); setSelectedDay(null); setSelectedGroup(null); };

  return (
    <div className="flex flex-col gap-4">

      {/* ── Barra de herramientas ── */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 p-4 flex flex-col gap-3 shadow-sm">

        {/* Buscador */}
        <SearchInput value={searchTerm} onChange={setSearchTerm} />

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

        {/* Píldoras de grupo */}
        {uniqueGroups.length > 1 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium mr-1">Grupo:</span>
            {uniqueGroups.map((group) => (
              <button
                key={group}
                onClick={() => setSelectedGroup(selectedGroup === group ? null : group)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  selectedGroup === group
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                {group}
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
        <NoResults onClear={clearFilters} />
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
            new Date(match.match_date).getTime() - now < 3_600_000 ||
            match.status === 'FINISHED' ||
            match.status === 'CANCELLED';

          return (
            <div key={match.id} ref={match.id === scrollTargetId ? scrollTargetRef : undefined}>
              <MatchCard
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
            </div>
          );
        })
      )}

      {/* ── Botón sticky "Guardar todo" — aparece cuando hay ≥2 predicciones pendientes ── */}
      {pendingCount >= 2 && (
        <SaveAllButton count={pendingCount} saving={isSavingAll} onClick={handleSaveAll} />
      )}
    </div>
  );
}
